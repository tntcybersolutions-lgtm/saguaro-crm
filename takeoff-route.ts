/**
 * takeoff-route.ts
 *
 * Next.js App Router API routes for the Saguaro Takeoff module.
 *
 * Routes:
 *   POST /api/takeoff/create
 *     → Creates a new takeoff project record
 *     Body: { tenantId, name, projectType, projectId? }
 *
 *   POST /api/takeoff/[takeoffId]/upload
 *     → Uploads one blueprint file (multipart/form-data)
 *     → Registers it in Supabase Storage + takeoff_blueprints
 *
 *   POST /api/takeoff/[takeoffId]/run
 *     → Streams the AI takeoff as SSE events
 *     → Checks sandbox AI limits before running
 *
 *   GET /api/takeoff/[takeoffId]
 *     → Returns the takeoff project + material/labor summary
 *
 *   GET /api/takeoff/[takeoffId]/materials
 *     → Returns all material lines (paginated)
 *
 *   POST /api/sandbox/signup
 *     → Creates a new sandbox account (no auth required)
 *
 *   GET /api/sandbox/stats
 *     → Returns upsell stats for the current sandbox user
 *
 *   POST /api/sandbox/event
 *     → Tracks a sandbox event and optionally returns an upsell prompt
 */

import { NextRequest, NextResponse } from 'next/server';
import { TakeoffEngine, registerBlueprintFile } from './takeoff-engine';
import { SandboxManager } from './sandbox-manager';
import { supabaseAdmin } from './supabase/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

async function getTenantId(request: NextRequest): Promise<string | null> {
  // Try Authorization header (JWT)
  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const token = bearer.slice(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user?.user_metadata?.tenant_id) {
      return user.user_metadata.tenant_id as string;
    }
  }

  // Sandbox: try tenantId from body or query
  const tenantId =
    request.nextUrl.searchParams.get('tenantId') ??
    (await request.json().then((b: Record<string, string>) => b.tenantId).catch(() => null));

  return tenantId ?? null;
}

function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/takeoff/create
// ─────────────────────────────────────────────────────────────────────────────

export async function createTakeoffProject(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const tenantId = String(body.tenantId ?? '');
  const name = String(body.name ?? 'New Takeoff');
  const projectType = String(body.projectType ?? 'residential');
  const projectId = body.projectId ? String(body.projectId) : null;
  const isSandbox = Boolean(body.isSandbox ?? false);

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  // Check sandbox AI limit before creating
  if (isSandbox) {
    const limitCheck = await SandboxManager.checkAiLimit(tenantId);
    if (!limitCheck.allowed) {
      return NextResponse.json({
        error: 'AI limit reached',
        runsUsed: limitCheck.runsUsed,
        runsLimit: limitCheck.runsLimit,
        upsellPrompt: limitCheck.upsellPrompt,
      }, { status: 402 }); // 402 Payment Required
    }
  }

  const now = new Date().toISOString();

  const { data: project, error } = await supabaseAdmin
    .from('takeoff_projects')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      name,
      project_type: projectType,
      is_sandbox: isSandbox,
      status: 'pending',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error || !project) {
    return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 });
  }

  return NextResponse.json({ takeoffProjectId: project.id, status: 'pending' });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/takeoff/[takeoffId]/upload
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadBlueprint(
  request: NextRequest,
  takeoffProjectId: string,
) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const tenantId = String(formData.get('tenantId') ?? '');
  const file = formData.get('file') as File | null;
  const sheetType = String(formData.get('sheetType') ?? 'floor_plan');
  const sheetNumber = formData.get('sheetNumber') ? String(formData.get('sheetNumber')) : undefined;
  const pageNumber = formData.get('pageNumber') ? Number(formData.get('pageNumber')) : 1;

  if (!tenantId || !file) {
    return NextResponse.json({ error: 'tenantId and file are required' }, { status: 400 });
  }

  // Validate file type
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({
      error: `Unsupported file type: ${file.type}. Please upload PDF, JPG, PNG, or WebP.`,
    }, { status: 400 });
  }

  // Validate file size (50MB limit)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({
      error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 50MB.`,
    }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const blueprintId = await registerBlueprintFile({
      tenantId,
      takeoffProjectId,
      fileName: file.name,
      fileBuffer: buffer,
      contentType: file.type,
      sheetType,
      sheetNumber,
      pageNumber,
    });

    // Track sandbox event
    const { data: sandbox } = await supabaseAdmin
      .from('sandbox_tenants')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (sandbox) {
      await SandboxManager.trackSandboxEvent(sandbox.id as string, tenantId, 'blueprint_uploaded', {
        file_name: file.name,
        file_size: file.size,
        sheet_type: sheetType,
      });
    }

    return NextResponse.json({
      blueprintId,
      fileName: file.name,
      sheetType,
      message: 'Blueprint uploaded. Call /run to start the AI takeoff.',
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Upload failed',
    }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/takeoff/[takeoffId]/run   — STREAMING SSE
// ─────────────────────────────────────────────────────────────────────────────

export async function runTakeoffSSE(
  request: NextRequest,
  takeoffProjectId: string,
) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const tenantId = String(body.tenantId ?? '');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  // Check sandbox limits
  const { data: sandboxTenant } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('id, ai_runs_used, ai_runs_limit')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (sandboxTenant) {
    const used = (sandboxTenant.ai_runs_used as number) ?? 0;
    const limit = (sandboxTenant.ai_runs_limit as number) ?? 5;

    if (used >= limit) {
      const { data: upsellPrompt } = await supabaseAdmin
        .from('upsell_prompts')
        .select('*')
        .eq('trigger_event', 'ai_limit_hit')
        .maybeSingle();

      return NextResponse.json({
        error: 'AI run limit reached',
        runsUsed: used,
        runsLimit: limit,
        upsellPrompt,
      }, { status: 402 });
    }
  }

  // Stream the takeoff
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(sseEvent({ type: 'status', message: 'Starting AI takeoff…', step: 0, totalSteps: 5 }));

        let lastResult = null;

        for await (const event of TakeoffEngine.runTakeoffStream(tenantId, takeoffProjectId)) {
          switch (event.type) {
            case 'status':
              controller.enqueue(sseEvent({ type: 'status', message: event.message, step: event.step, totalSteps: event.totalSteps }));
              break;

            case 'thinking':
              // Stream compressed thinking indicator
              controller.enqueue(sseEvent({ type: 'thinking', delta: event.delta }));
              break;

            case 'text':
              // Raw JSON being generated — most UIs show a loading indicator
              break;

            case 'done': {
              lastResult = event.result;

              // Track sandbox event + get upsell
              let upsellPrompt = null;
              if (sandboxTenant) {
                const eventResult = await SandboxManager.trackSandboxEvent(
                  sandboxTenant.id as string,
                  tenantId,
                  'takeoff_completed',
                  {
                    takeoff_project_id: takeoffProjectId,
                    total_sf: event.result.totalSf,
                    time_saved_minutes: event.result.timeSavedMinutes,
                    processing_seconds: event.result.processingSeconds,
                    traditional_hours: Math.round(event.result.timeSavedMinutes / 60 * 10) / 10,
                  },
                );
                upsellPrompt = eventResult.upsellPrompt;
              }

              // Get upsell stats
              const stats = await SandboxManager.getUpsellStats(tenantId);

              controller.enqueue(sseEvent({
                type: 'done',
                result: {
                  ...event.result,
                  upsellPrompt,
                  upsellStats: stats,
                  timeSavedFormatted: `${Math.floor(event.result.timeSavedMinutes / 60)}h ${event.result.timeSavedMinutes % 60}m`,
                  processingFormatted: `${event.result.processingSeconds}s`,
                },
              }));
              break;
            }

            case 'error':
              controller.enqueue(sseEvent({ type: 'error', message: event.message }));
              break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Takeoff failed';
        const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('timed');
        const userMsg = isTimeout
          ? 'Processing timed out — upgrade to Vercel Pro for full AI takeoff (300s timeout). Current plan: 10s max.'
          : msg;
        controller.enqueue(sseEvent({
          type: 'error',
          message: userMsg,
        }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/takeoff/[takeoffId]
// ─────────────────────────────────────────────────────────────────────────────

export async function getTakeoffProject(
  request: NextRequest,
  takeoffProjectId: string,
) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const [projectRes, materialsRes, laborRes] = await Promise.all([
    supabaseAdmin
      .from('takeoff_projects')
      .select('*')
      .eq('id', takeoffProjectId)
      .eq('tenant_id', tenantId)
      .single(),

    supabaseAdmin
      .from('takeoff_material_lines')
      .select('category, count(*), sum(total_cost_estimate)')
      .eq('takeoff_project_id', takeoffProjectId),

    supabaseAdmin
      .from('takeoff_labor_lines')
      .select('trade, sum(hours), sum(total_cost_estimate)')
      .eq('takeoff_project_id', takeoffProjectId),
  ]);

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    project: projectRes.data,
    materialSummary: materialsRes.data ?? [],
    laborSummary: laborRes.data ?? [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/takeoff/[takeoffId]/materials
// ─────────────────────────────────────────────────────────────────────────────

export async function getTakeoffMaterials(
  request: NextRequest,
  takeoffProjectId: string,
) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  const category = request.nextUrl.searchParams.get('category');
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
  const pageSize = Math.min(Number(request.nextUrl.searchParams.get('pageSize') ?? '100'), 500);
  const offset = (page - 1) * pageSize;

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  let query = supabaseAdmin
    .from('takeoff_material_lines')
    .select('*', { count: 'exact' })
    .eq('takeoff_project_id', takeoffProjectId)
    .eq('tenant_id', tenantId)
    .order('sort_order')
    .range(offset, offset + pageSize - 1);

  if (category) query = query.eq('category', category);

  const { data, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ materials: data ?? [], total: count ?? 0, page, pageSize });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sandbox/signup   (no auth required)
// ─────────────────────────────────────────────────────────────────────────────

export async function sandboxSignup(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const email = String(body.email ?? '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  try {
    const account = await SandboxManager.createSandbox({
      email,
      firstName: body.firstName ? String(body.firstName) : undefined,
      lastName: body.lastName ? String(body.lastName) : undefined,
      companyName: body.companyName ? String(body.companyName) : undefined,
      phone: body.phone ? String(body.phone) : undefined,
      companySize: body.companySize ? String(body.companySize) : undefined,
      primaryTrade: body.primaryTrade ? String(body.primaryTrade) : undefined,
      referralSource: body.referralSource ? String(body.referralSource) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Sandbox created. Check your email for your access link.',
      tenantId: account.tenantId,
      sandboxExpiresAt: account.sandboxExpiresAt,
      aiRunsRemaining: account.aiRunsRemaining,
      demoProjectId: account.demoProjectId,
      demoTakeoffId: account.demoTakeoffId,
      // Access link included for immediate login in the same browser session
      accessToken: account.accessToken,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signup failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sandbox/stats
// ─────────────────────────────────────────────────────────────────────────────

export async function getSandboxStats(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const stats = await SandboxManager.getUpsellStats(tenantId);
  return NextResponse.json(stats);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sandbox/event
// ─────────────────────────────────────────────────────────────────────────────

export async function trackEvent(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const tenantId = String(body.tenantId ?? '');
  const eventType = String(body.eventType ?? '');
  const eventData = (body.eventData as Record<string, unknown>) ?? {};

  if (!tenantId || !eventType) {
    return NextResponse.json({ error: 'tenantId and eventType are required' }, { status: 400 });
  }

  const { data: sandbox } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!sandbox) return NextResponse.json({ tracked: false, isSandbox: false });

  const result = await SandboxManager.trackSandboxEvent(
    sandbox.id as string,
    tenantId,
    eventType,
    eventData,
  );

  return NextResponse.json({
    tracked: true,
    upsellTriggered: result.upsellTriggered,
    upsellPrompt: result.upsellPrompt,
  });
}
