/**
 * sandbox-manager.ts
 *
 * Saguaro CRM — Free Sandbox & Smart Upsell Engine
 *
 * The sandbox is the primary sales motion for Saguaro.com.
 * Users sign up with just an email — no credit card — and instantly
 * get a fully functional environment pre-loaded with:
 *   - 3 realistic demo projects
 *   - A pre-run AI takeoff (shows the magic instantly)
 *   - Sample bid packages with AI-generated bid jackets
 *   - Sample subcontractor companies
 *   - Sample autopilot alerts
 *   - Sample bid history (for intelligence profile)
 *
 * The upsell engine watches what users do and fires the RIGHT message
 * at the RIGHT moment — never spam, always relevant.
 *
 * Key moments:
 *   Takeoff complete  → "You just saved 4+ hours in 47 seconds"
 *   Hit AI limit      → "Upgrade for unlimited AI"
 *   Created a bid     → "Pro auto-sends to your entire sub network"
 *   Day 7             → "Don't lose your work"
 *   Day 12            → "2 days left on your sandbox"
 *
 * Usage:
 *   import { SandboxManager } from './sandbox-manager';
 *   const sandbox = await SandboxManager.createSandbox({ email, firstName });
 */

import { supabaseAdmin } from './supabase/admin';
import { EmailService } from './email-service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';
const SANDBOX_URL = process.env.NEXT_PUBLIC_SANDBOX_URL ?? 'https://sandbox.saguarocrm.com';
const UPGRADE_URL = `${SANDBOX_URL}/upgrade`;
const DEMO_URL = `${SANDBOX_URL}/book-demo`;

// ─────────────────────────────────────────────────────────────────────────────
// Create a new sandbox account
// ─────────────────────────────────────────────────────────────────────────────

export type SandboxSignupOptions = {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  companySize?: string;
  primaryTrade?: string;
  referralSource?: string;
};

export type SandboxAccount = {
  tenantId: string;
  sandboxId: string;
  email: string;
  accessToken: string;        // JWT or session token for immediate login
  sandboxExpiresAt: string;
  aiRunsRemaining: number;
  demoProjectId: string;      // pre-built demo project
  demoTakeoffId: string;      // pre-run takeoff to show immediately
};

export async function createSandbox(opts: SandboxSignupOptions): Promise<SandboxAccount> {
  // Check for existing sandbox with this email
  const { data: existing } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('tenant_id, id')
    .eq('email', opts.email.toLowerCase().trim())
    .maybeSingle();

  if (existing) {
    throw new Error('A sandbox already exists for this email address. Please check your inbox for your access link.');
  }

  // Create a Supabase auth user and tenant in one shot
  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: opts.email.toLowerCase().trim(),
    password: generateTempPassword(),
    email_confirm: true,
    user_metadata: {
      first_name: opts.firstName ?? '',
      last_name: opts.lastName ?? '',
      company_name: opts.companyName ?? '',
      is_sandbox: true,
    },
  });

  if (authErr || !authUser.user) {
    throw new Error(`Sandbox auth creation: ${authErr?.message ?? 'failed'}`);
  }

  const userId = authUser.user.id;
  const tenantId = generateTenantId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // Create tenant record
  await supabaseAdmin.from('tenants').insert({
    id: tenantId,
    name: opts.companyName ?? `${opts.firstName ?? opts.email}'s Sandbox`,
    slug: `sandbox-${tenantId.slice(0, 8)}`,
    is_sandbox: true,
    sandbox_expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  });

  // Create sandbox_tenants record
  const { data: sandboxRecord, error: sbErr } = await supabaseAdmin
    .from('sandbox_tenants')
    .insert({
      tenant_id: tenantId,
      email: opts.email.toLowerCase().trim(),
      first_name: opts.firstName ?? null,
      last_name: opts.lastName ?? null,
      company_name: opts.companyName ?? null,
      phone: opts.phone ?? null,
      company_size: opts.companySize ?? null,
      primary_trade: opts.primaryTrade ?? null,
      referral_source: opts.referralSource ?? null,
      ai_runs_limit: 10,  // 10 runs = ~1 month light usage — enough to build habit before upsell
      ai_runs_used: 0,
      sandbox_expires_at: expiresAt,
      last_active_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (sbErr || !sandboxRecord) {
    throw new Error(`sandbox_tenants insert: ${sbErr?.message ?? 'null result'}`);
  }

  // Seed the sandbox with demo data
  const { demoProjectId, demoTakeoffId } = await seedSandboxDemoData(tenantId);

  // Generate a magic link for instant login (no password needed)
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: opts.email.toLowerCase().trim(),
    options: {
      redirectTo: `${SANDBOX_URL}/sandbox/welcome?project=${demoProjectId}&takeoff=${demoTakeoffId}`,
    },
  });

  const accessToken = linkData?.properties?.action_link ?? '';

  // Send welcome email
  await sendSandboxWelcomeEmail(opts, tenantId, demoProjectId, demoTakeoffId, accessToken);

  // Track signup event
  await trackSandboxEvent(sandboxRecord.id as string, tenantId, 'signup', {
    referral_source: opts.referralSource,
    primary_trade: opts.primaryTrade,
  });

  return {
    tenantId,
    sandboxId: sandboxRecord.id as string,
    email: opts.email,
    accessToken,
    sandboxExpiresAt: expiresAt,
    aiRunsRemaining: 5,
    demoProjectId,
    demoTakeoffId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed demo data — what the user sees the moment they log in
// ─────────────────────────────────────────────────────────────────────────────

async function seedSandboxDemoData(
  tenantId: string,
): Promise<{ demoProjectId: string; demoTakeoffId: string }> {
  const now = new Date().toISOString();

  // ── Demo Project 1: The "Wow" project (fully built, pre-run takeoff) ──────
  const { data: project1, error: p1Err } = await supabaseAdmin
    .from('projects')
    .insert({
      tenant_id: tenantId,
      name: 'Riverdale Residence — 2,400 SF Custom Home',
      description: 'Single-family custom home with 4 bed/3 bath, attached 2-car garage, covered porch, and full basement.',
      address: '1247 Riverdale Court, Phoenix, AZ 85001',
      project_type: 'residential',
      status: 'active',
      budget: 485000,
      is_sandbox: true,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (p1Err || !project1) throw new Error(`Demo project 1: ${p1Err?.message}`);
  const demoProjectId = project1.id as string;

  // ── Pre-built takeoff (shows users what AI produces without waiting) ───────
  const { data: takeoff, error: tErr } = await supabaseAdmin
    .from('takeoff_projects')
    .insert({
      tenant_id: tenantId,
      project_id: demoProjectId,
      name: 'Riverdale Residence — AI Takeoff',
      project_type: 'residential',
      status: 'complete',
      is_sandbox: true,
      ai_model: 'claude-opus-4-6',
      ai_confidence: 'high',
      ai_processing_secs: 47,
      total_sf: 2400,
      conditioned_sf: 2400,
      garage_sf: 440,
      porch_sf: 220,
      stories: 2,
      bedrooms: 4,
      bathrooms: 3,
      total_lf_exterior_walls: 480,
      roof_area_squares: 28,
      roof_pitch: '6:12',
      foundation_type: 'Slab-on-grade with perimeter footings',
      // Realistic 2025 Phoenix metro pricing: $165-195/SF for custom residential
      // (vs inflated $137/SF that was too optimistic and set wrong expectations)
      total_material_cost_estimate: 228000,
      total_labor_cost_estimate: 168000,
      total_cost_estimate: 396000,
      cost_per_sf: 165,  // realistic Phoenix custom home 2025
      estimated_duration_days: 210,
      rooms: DEMO_ROOMS,
      assumptions: [
        '9\' plate height first floor, 9\' second floor — verify from elevations',
        '2x6 exterior walls @ 16" OC per energy code (AZ Climate Zone 2B)',
        'Composition architectural shingle (Class 4 impact) per AHJ requirement',
        'Slab-on-grade 4" thick — no soil bearing report available; assumes 1,500 PSF capacity',
        'Labor rates: Phoenix metro 2025-2026 fully-loaded (wages + 30% burden)',
        'Material pricing at contractor wholesale — does NOT include sales tax',
        'HVAC: assumes standard split system; Manual J not performed — verify sizing',
      ],
      ai_analyzed_at: now,
      user_started_at: new Date(Date.now() - 47000).toISOString(),
      ai_completed_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (tErr || !takeoff) throw new Error(`Demo takeoff: ${tErr?.message}`);
  const demoTakeoffId = takeoff.id as string;

  // Seed material lines (representative sample — in production Claude generates these)
  await supabaseAdmin.from('takeoff_material_lines').insert(
    DEMO_MATERIAL_LINES.map((m, idx) => ({
      ...m,
      takeoff_project_id: demoTakeoffId,
      tenant_id: tenantId,
      sort_order: idx + 1,
      created_at: now,
    })),
  );

  // Seed labor lines
  await supabaseAdmin.from('takeoff_labor_lines').insert(
    DEMO_LABOR_LINES.map((l, idx) => ({
      ...l,
      takeoff_project_id: demoTakeoffId,
      tenant_id: tenantId,
      sort_order: idx + 1,
      created_at: now,
    })),
  );

  // ── Demo subcontractor companies ──────────────────────────────────────────
  await supabaseAdmin.from('subcontractor_companies').insert([
    { tenant_id: tenantId, name: 'Desert Electrical Contractors', primary_email: 'bids@desertelectric.demo', status: 'active', created_at: now, updated_at: now },
    { tenant_id: tenantId, name: 'AZ Concrete Solutions', primary_email: 'estimates@azconcrete.demo', status: 'active', created_at: now, updated_at: now },
    { tenant_id: tenantId, name: 'Southwest Roofing & Sheet Metal', primary_email: 'bids@swroofing.demo', status: 'active', created_at: now, updated_at: now },
    { tenant_id: tenantId, name: 'Rio Framing & Rough Carpentry', primary_email: 'biddesk@rioframing.demo', status: 'active', created_at: now, updated_at: now },
    { tenant_id: tenantId, name: 'Pinnacle Plumbing Inc.', primary_email: 'bids@pinnacleplumbing.demo', status: 'active', created_at: now, updated_at: now },
  ]);

  // ── Sample bid intelligence history (powers the AI profile)
  // Win rate: 5 wins / 10 bids = 50% — industry-realistic (not inflated).
  // Shows clear pattern: strong in residential/additions, weak in large commercial.
  await supabaseAdmin.from('bid_outcomes').insert([
    // Wins — residential sweet spot
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'residential',  bid_amount: 396000, estimated_margin_percent: 16, outcome: 'won',  outcome_date: '2026-01-10', scope_summary: '2,400 SF Custom Home - Scottsdale', ai_scope_fit_score: 91, ai_relationship_score: 80, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'addition',     bid_amount: 92000,  estimated_margin_percent: 21, outcome: 'won',  outcome_date: '2025-12-05', scope_summary: '680 SF Master Suite Addition - Mesa', ai_scope_fit_score: 96, ai_relationship_score: 90, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'remodel',      bid_amount: 138000, estimated_margin_percent: 19, outcome: 'won',  outcome_date: '2025-11-18', scope_summary: 'Full Kitchen & Bath Remodel - Paradise Valley', ai_scope_fit_score: 93, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'residential',  bid_amount: 284000, estimated_margin_percent: 14, outcome: 'won',  outcome_date: '2025-10-30', scope_summary: '1,800 SF Production Home - Chandler', ai_scope_fit_score: 84, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'addition',     bid_amount: 67000,  estimated_margin_percent: 23, outcome: 'won',  outcome_date: '2025-09-14', scope_summary: '440 SF Casita Addition - Tempe', ai_scope_fit_score: 94, created_at: now, updated_at: now },
    // Losses — commercial is outside sweet spot, residential losses on price
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'residential',  bid_amount: 218000, estimated_margin_percent: 15, winning_bid_amount: 196000, our_rank: 2, outcome: 'lost', outcome_date: '2026-01-22', scope_summary: '1,900 SF Production Home - Gilbert', lost_reason: 'Price: lost by $22K to established production builder', ai_scope_fit_score: 74, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'commercial',  project_type: 'commercial',   bid_amount: 875000, estimated_margin_percent: 12, our_rank: 3,                 outcome: 'lost', outcome_date: '2025-12-20', scope_summary: '8,500 SF Office Buildout - Downtown Phoenix', lost_reason: 'Commercial experience: owner selected GC with office buildout portfolio', ai_scope_fit_score: 38, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'commercial',  project_type: 'commercial',   bid_amount: 1240000, estimated_margin_percent: 11, our_rank: 4,               outcome: 'lost', outcome_date: '2025-11-05', scope_summary: '12,000 SF Medical Office - Scottsdale', lost_reason: 'No healthcare construction experience — disqualified in pre-qual', ai_scope_fit_score: 22, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'residential',  bid_amount: 445000, estimated_margin_percent: 17, winning_bid_amount: 398000, our_rank: 3, outcome: 'lost', outcome_date: '2025-10-12', scope_summary: '2,900 SF Custom Luxury Home - Paradise Valley', lost_reason: 'Price and relationship: owner had existing relationship with winning GC', ai_scope_fit_score: 68, created_at: now, updated_at: now },
    { tenant_id: tenantId, trade_category: 'residential', project_type: 'remodel',      bid_amount: 78000,  estimated_margin_percent: 18, winning_bid_amount: 64000,  our_rank: 2, outcome: 'lost', outcome_date: '2025-09-28', scope_summary: 'Kitchen Remodel - Ahwatukee', lost_reason: 'Price: smaller local contractor underbid by $14K', ai_scope_fit_score: 82, created_at: now, updated_at: now },
  ]);

  return { demoProjectId, demoTakeoffId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Track sandbox events + fire upsell at the right moments
// ─────────────────────────────────────────────────────────────────────────────

export async function trackSandboxEvent(
  sandboxTenantId: string,
  tenantId: string,
  eventType: string,
  eventData: Record<string, unknown> = {},
): Promise<{ upsellTriggered: boolean; upsellPrompt: Record<string, unknown> | null }> {
  const now = new Date().toISOString();

  // Fetch sandbox state
  const { data: sandbox } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('*')
    .eq('id', sandboxTenantId)
    .single();

  if (!sandbox) return { upsellTriggered: false, upsellPrompt: null };

  // Update counters based on event type
  const updates: Record<string, unknown> = { last_active_at: now, updated_at: now };

  if (eventType === 'takeoff_completed') {
    updates.takeoffs_run = ((sandbox.takeoffs_run as number) ?? 0) + 1;
    updates.saw_takeoff_demo = true;
    updates.ai_runs_used = ((sandbox.ai_runs_used as number) ?? 0) + 1;
    const timeSaved = (eventData.time_saved_minutes as number) ?? 240;
    updates.total_time_saved_minutes = ((sandbox.total_time_saved_minutes as number) ?? 0) + timeSaved;
  }

  if (eventType === 'blueprint_uploaded') {
    updates.uploaded_own_blueprint = true;
  }

  if (eventType === 'bid_created') {
    updates.bids_created = ((sandbox.bids_created as number) ?? 0) + 1;
    updates.saw_bid_automation = true;
  }

  if (eventType === 'project_created') {
    updates.projects_created = ((sandbox.projects_created as number) ?? 0) + 1;
    updates.saw_project_creation = true;
  }

  if (eventType === 'autopilot_viewed') {
    updates.saw_autopilot = true;
  }

  await supabaseAdmin.from('sandbox_tenants').update(updates).eq('id', sandboxTenantId);

  // Log the event
  const eventPayload = {
    sandbox_tenant_id: sandboxTenantId,
    tenant_id: tenantId,
    event_type: eventType,
    event_data: eventData,
    time_saved_minutes: (eventData.time_saved_minutes as number) ?? null,
    traditional_hours: (eventData.traditional_hours as number) ?? null,
    created_at: now,
  };

  await supabaseAdmin.from('sandbox_events').insert(eventPayload);

  // Determine if we should show an upsell
  const shouldUpsell = determineUpsell(eventType, sandbox as Record<string, unknown>);

  if (!shouldUpsell) return { upsellTriggered: false, upsellPrompt: null };

  // Fetch the matching upsell prompt
  const { data: prompt } = await supabaseAdmin
    .from('upsell_prompts')
    .select('*')
    .eq('trigger_event', eventType)
    .eq('is_active', true)
    .maybeSingle();

  if (!prompt) return { upsellTriggered: false, upsellPrompt: null };

  // Record that we showed the upsell
  await supabaseAdmin.from('sandbox_tenants').update({
    upsell_shown_count: ((sandbox.upsell_shown_count as number) ?? 0) + 1,
    upsell_last_shown_at: now,
    updated_at: now,
  }).eq('id', sandboxTenantId);

  await supabaseAdmin.from('sandbox_events').insert({
    sandbox_tenant_id: sandboxTenantId,
    tenant_id: tenantId,
    event_type: 'upsell_shown',
    event_data: { trigger_event: eventType, prompt_id: prompt.id },
    upsell_triggered: true,
    upsell_variant: prompt.trigger_event as string,
    created_at: now,
  });

  return { upsellTriggered: true, upsellPrompt: prompt as Record<string, unknown> };
}

function determineUpsell(
  eventType: string,
  sandbox: Record<string, unknown>,
): boolean {
  const shown = (sandbox.upsell_shown_count as number) ?? 0;
  const lastShown = sandbox.upsell_last_shown_at
    ? new Date(sandbox.upsell_last_shown_at as string).getTime()
    : 0;

  // Don't show more than one upsell per hour
  if (Date.now() - lastShown < 60 * 60 * 1000 && shown > 0) return false;

  // Event-specific triggers
  if (eventType === 'takeoff_completed') return true;
  if (eventType === 'ai_limit_hit') return true;
  if (eventType === 'bid_created' && shown < 3) return true;
  if (eventType === 'project_created' && shown < 3) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check + enforce AI usage limits
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAiLimit(tenantId: string): Promise<{
  allowed: boolean;
  runsUsed: number;
  runsLimit: number;
  runsRemaining: number;
  upsellPrompt: Record<string, unknown> | null;
}> {
  const { data: sandbox } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('id, ai_runs_used, ai_runs_limit')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Not a sandbox tenant — unlimited
  if (!sandbox) return { allowed: true, runsUsed: 0, runsLimit: 999, runsRemaining: 999, upsellPrompt: null };

  const used = (sandbox.ai_runs_used as number) ?? 0;
  const limit = (sandbox.ai_runs_limit as number) ?? 5;
  const remaining = limit - used;
  const allowed = remaining > 0;

  if (!allowed) {
    // Trigger "hit limit" upsell
    const result = await trackSandboxEvent(sandbox.id as string, tenantId, 'ai_limit_hit', {});
    return { allowed: false, runsUsed: used, runsLimit: limit, runsRemaining: 0, upsellPrompt: result.upsellPrompt };
  }

  return { allowed: true, runsUsed: used, runsLimit: limit, runsRemaining: remaining, upsellPrompt: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle emails (day 7, day 12, expiry)
// ─────────────────────────────────────────────────────────────────────────────

export async function processSandboxLifecycleEmails(): Promise<void> {
  const now = new Date();

  // Day 7 emails — sandboxes created 7 days ago that haven't converted
  const day7Cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const day8Cutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const { data: day7Sandboxes } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('*')
    .lte('created_at', day7Cutoff)
    .gte('created_at', day8Cutoff)
    .is('day7_email_sent_at', null)
    .is('converted_to_paid_at', null);

  for (const sb of day7Sandboxes ?? []) {
    const firstName = (sb.first_name as string) ?? 'there';
    const runsUsed = sb.ai_runs_used as number ?? 0;
    const timeSaved = sb.total_time_saved_minutes as number ?? 0;

    const html = buildLifecycleEmail({
      title: 'Your Saguaro sandbox is 7 days old 🏗️',
      body: `
        <p>Hey ${firstName},</p>
        <p>You signed up for Saguaro 7 days ago${runsUsed > 0 ? `, ran ${runsUsed} AI operation(s), and saved an estimated <strong>${timeSaved} minutes</strong> of manual work` : ''}.</p>
        <p>Your sandbox expires in 7 days. <strong>Upgrade now to keep your data and run unlimited AI on real projects.</strong></p>
        <p>Pro is $149/month. That's less than 2 hours of estimating time — and you get unlimited AI takeoffs, automated bid distribution, AI project creation, and real-time risk monitoring.</p>
      `,
      cta: 'Upgrade to Pro — $149/mo',
      ctaUrl: UPGRADE_URL,
      secondary: 'Book a 15-min Demo',
      secondaryUrl: DEMO_URL,
    });

    await sendEmail(sb.email as string, 'Your Saguaro sandbox expires in 7 days', html);

    await supabaseAdmin
      .from('sandbox_tenants')
      .update({ day7_email_sent_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', sb.id);
  }

  // Day 12 emails
  const day12Cutoff = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString();
  const day13Cutoff = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString();

  const { data: day12Sandboxes } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('*')
    .lte('created_at', day12Cutoff)
    .gte('created_at', day13Cutoff)
    .is('day12_email_sent_at', null)
    .is('converted_to_paid_at', null);

  for (const sb of day12Sandboxes ?? []) {
    const firstName = (sb.first_name as string) ?? 'there';

    const html = buildLifecycleEmail({
      title: '⏰ 2 days left on your Saguaro sandbox',
      body: `
        <p>Hey ${firstName},</p>
        <p><strong>Your sandbox expires in 2 days.</strong></p>
        <p>All your projects, takeoffs, and bid data will be deleted. Upgrade now to keep everything and unlock unlimited AI.</p>
        <p>Use code <strong>SANDBOX20</strong> for 20% off your first month.</p>
      `,
      cta: 'Upgrade & Save 20% — Use Code SANDBOX20',
      ctaUrl: `${UPGRADE_URL}?code=SANDBOX20`,
      secondary: 'Export My Data First',
      secondaryUrl: `${SANDBOX_URL}/export`,
    });

    await sendEmail(sb.email as string, '⏰ 2 days left — your Saguaro sandbox is expiring', html);

    await supabaseAdmin
      .from('sandbox_tenants')
      .update({ day12_email_sent_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', sb.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the upsell ROI stats for display in the UI
// ─────────────────────────────────────────────────────────────────────────────

export type UpsellStats = {
  timeSavedMinutes: number;
  timeSavedHours: string;
  estimatingCostSaved: string;    // at $75/hr
  takeoffsRun: number;
  aiRunsRemaining: number;
  comparisonTable: {
    tool: string;
    monthlyPrice: string;
    aiTakeoff: string;
    bidAutomation: string;
    projectAutoCreate: string;
    learningEngine: string;
    highlight: boolean;
  }[];
};

export async function getUpsellStats(tenantId: string): Promise<UpsellStats> {
  const { data: sandbox } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('ai_runs_used, ai_runs_limit, takeoffs_run, total_time_saved_minutes')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const timeSavedMin = (sandbox?.total_time_saved_minutes as number) ?? 0;
  const estimatingHourlyRate = 75;
  const costSaved = Math.round((timeSavedMin / 60) * estimatingHourlyRate);
  const runsUsed = (sandbox?.ai_runs_used as number) ?? 0;
  const runsLimit = (sandbox?.ai_runs_limit as number) ?? 5;

  return {
    timeSavedMinutes: timeSavedMin,
    timeSavedHours: timeSavedMin >= 60 ? `${Math.floor(timeSavedMin / 60)}h ${timeSavedMin % 60}m` : `${timeSavedMin}m`,
    estimatingCostSaved: `$${costSaved.toLocaleString()}`,
    takeoffsRun: (sandbox?.takeoffs_run as number) ?? 0,
    aiRunsRemaining: Math.max(0, runsLimit - runsUsed),
    comparisonTable: [
      {
        tool: 'Manual / Spreadsheets',
        monthlyPrice: 'Free',
        aiTakeoff: '4-8 hours per job',
        bidAutomation: 'Manual emails',
        projectAutoCreate: 'Starts from scratch',
        learningEngine: 'None',
        highlight: false,
      },
      {
        tool: 'Procore Estimating',
        monthlyPrice: '$449/user/mo',
        aiTakeoff: '2-3 hours + training',
        bidAutomation: 'Manual + templates',
        projectAutoCreate: 'Manual setup',
        learningEngine: 'No',
        highlight: false,
      },
      {
        tool: 'Buildertrend',
        monthlyPrice: '$299/mo',
        aiTakeoff: 'Manual entry',
        bidAutomation: 'Basic templates',
        projectAutoCreate: 'Manual setup',
        learningEngine: 'No',
        highlight: false,
      },
      {
        tool: 'Saguaro Pro',
        monthlyPrice: '$149/mo',
        aiTakeoff: '< 60 seconds',
        bidAutomation: 'Fully automated',
        projectAutoCreate: 'Automatic on award',
        learningEngine: 'Yes — gets smarter every bid',
        highlight: true,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateTenantId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateTempPassword(): string {
  return `Saguaro!${Math.random().toString(36).slice(2, 10)}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (!process.env.RESEND_API_KEY) {
    console.warn('[SandboxManager] RESEND_API_KEY not set — email not sent');
    return;
  }

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>',
    to,
    subject,
    html,
  });
}

function buildLifecycleEmail(opts: {
  title: string;
  body: string;
  cta: string;
  ctaUrl: string;
  secondary?: string;
  secondaryUrl?: string;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><style>
body{margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
.w{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);}
.h{background:#1b3a5c;padding:24px 32px;}.h h1{margin:0;color:#fff;font-size:20px;}
.b{padding:28px 32px;}.b p{font-size:15px;line-height:1.6;color:#2d3748;margin:0 0 14px;}
.btn{display:inline-block;margin:8px 8px 8px 0;padding:12px 24px;background:#e07b39;color:#fff!important;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;}
.btn.sec{background:#1b3a5c;}
.f{padding:16px 32px;background:#f4f5f7;text-align:center;font-size:12px;color:#718096;}
</style></head><body>
<div class="w">
<div class="h"><h1>Saguaro CRM</h1></div>
<div class="b">
<h2 style="color:#1b3a5c;margin:0 0 16px">${opts.title}</h2>
${opts.body}
<p><a class="btn" href="${opts.ctaUrl}">${opts.cta}</a>${opts.secondary ? `<a class="btn sec" href="${opts.secondaryUrl}">${opts.secondary}</a>` : ''}</p>
</div>
<div class="f"><p>Saguaro CRM · <a href="${SANDBOX_URL}/unsubscribe" style="color:#1b3a5c">Unsubscribe</a></p></div>
</div></body></html>`;
}

async function sendSandboxWelcomeEmail(
  opts: SandboxSignupOptions,
  tenantId: string,
  demoProjectId: string,
  demoTakeoffId: string,
  magicLink: string,
): Promise<void> {
  const firstName = opts.firstName ?? 'there';

  const html = buildLifecycleEmail({
    title: `Welcome to Saguaro, ${firstName}! 🏗️`,
    body: `
      <p>Your free 14-day sandbox is ready.</p>
      <p>We've pre-loaded it with a <strong>fully AI-completed takeoff for a 2,400 SF home</strong> —
      ${DEMO_MATERIAL_LINES.length} material line items, calculated in 47 seconds.
      That's what our AI does on your real blueprints.</p>
      <p><strong>Click the button below to enter your sandbox and see it live.</strong></p>
      <p>When you're ready to try your own blueprints, click "Upload Blueprint" from any project.
      You have 5 free AI runs. Use them wisely — or upgrade for unlimited.</p>
      <p style="font-size:13px;color:#718096;">Your sandbox expires in 14 days. No credit card needed now.</p>
    `,
    cta: 'Enter My Sandbox',
    ctaUrl: magicLink || `${SANDBOX_URL}/sandbox/welcome?project=${demoProjectId}`,
    secondary: 'Book a Live Demo Instead',
    secondaryUrl: DEMO_URL,
  });

  await sendEmail(opts.email, 'Your Saguaro sandbox is ready — see the AI takeoff', html);
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo data constants (realistic sample for the pre-seeded sandbox)
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_ROOMS = [
  { name: 'Master Bedroom', length_ft: 16, width_ft: 14, height_ft: 9, area_sf: 224, perimeter_lf: 60, is_conditioned: true, floor_type: 'Hardwood', ceiling_type: 'Drywall 9ft', exterior_walls_lf: 30, windows_count: 2, doors_count: 1 },
  { name: 'Living Room', length_ft: 22, width_ft: 18, height_ft: 9, area_sf: 396, perimeter_lf: 80, is_conditioned: true, floor_type: 'Hardwood', ceiling_type: 'Coffered 10ft', exterior_walls_lf: 40, windows_count: 4, doors_count: 1 },
  { name: 'Kitchen', length_ft: 16, width_ft: 14, height_ft: 9, area_sf: 224, perimeter_lf: 60, is_conditioned: true, floor_type: 'Tile', ceiling_type: 'Drywall 9ft', exterior_walls_lf: 16, windows_count: 2, doors_count: 2 },
  { name: 'Garage', length_ft: 22, width_ft: 20, height_ft: 10, area_sf: 440, perimeter_lf: 84, is_conditioned: false, floor_type: 'Concrete', ceiling_type: 'Exposed framing', exterior_walls_lf: 84, windows_count: 1, doors_count: 2 },
];

const DEMO_MATERIAL_LINES = [
  { csi_code: '03-1000', csi_division: '03 – Concrete', category: 'Concrete', subcategory: 'Foundation', item: 'Ready-Mix Concrete 3000 PSI', spec: 'ACI 318 mix design, 4" slump', quantity: 42, unit: 'CY', waste_factor_pct: 8, adjusted_quantity: 46, unit_cost_estimate: 145, total_cost_estimate: 6670 },
  { csi_code: '03-2000', csi_division: '03 – Concrete', category: 'Concrete', subcategory: 'Foundation', item: 'Rebar #4 Grade 60', spec: 'ASTM A615 Grade 60, deformed', quantity: 2800, unit: 'LF', waste_factor_pct: 10, adjusted_quantity: 3080, unit_cost_estimate: 0.85, total_cost_estimate: 2618 },
  { csi_code: '06-1100', csi_division: '06 – Wood, Plastics', category: 'Framing', subcategory: 'Exterior Walls', item: '2x6 KD Stud 92-5/8"', spec: 'Doug Fir #2, kiln dried, precut stud', quantity: 1840, unit: 'EA', waste_factor_pct: 10, adjusted_quantity: 2024, unit_cost_estimate: 7.85, total_cost_estimate: 15888 },
  { csi_code: '06-1100', csi_division: '06 – Wood, Plastics', category: 'Framing', subcategory: 'Exterior Walls', item: '2x6 KD Plate 16ft', spec: 'Doug Fir #2, KD-19, 16\' lengths', quantity: 2160, unit: 'LF', waste_factor_pct: 12, adjusted_quantity: 2419, unit_cost_estimate: 1.15, total_cost_estimate: 2782 },
  { csi_code: '06-1100', csi_division: '06 – Wood, Plastics', category: 'Framing', subcategory: 'Interior Walls', item: '2x4 KD Stud 92-5/8"', spec: 'Hem-Fir #2, kiln dried, precut stud', quantity: 2240, unit: 'EA', waste_factor_pct: 10, adjusted_quantity: 2464, unit_cost_estimate: 5.45, total_cost_estimate: 13429 },
  { csi_code: '06-1200', csi_division: '06 – Wood, Plastics', category: 'Sheathing', subcategory: 'Wall Sheathing', item: 'OSB 7/16" 4x8 Sheet', spec: 'APA-rated, exposure 1', quantity: 288, unit: 'SHT', waste_factor_pct: 12, adjusted_quantity: 323, unit_cost_estimate: 28.50, total_cost_estimate: 9206 },
  { csi_code: '06-1300', csi_division: '06 – Wood, Plastics', category: 'Sheathing', subcategory: 'Roof Decking', item: 'CDX Plywood 5/8" 4x8 Sheet', spec: 'APA PS-1, exposure 1, tongue & groove', quantity: 312, unit: 'SHT', waste_factor_pct: 10, adjusted_quantity: 343, unit_cost_estimate: 52.00, total_cost_estimate: 17836 },
  { csi_code: '07-3100', csi_division: '07 – Thermal & Moisture', category: 'Roofing', subcategory: 'Asphalt Shingles', item: 'Architectural Shingle 30-year', spec: 'Class A, class 4 impact rated, 130 MPH wind', quantity: 28, unit: 'SQ', waste_factor_pct: 15, adjusted_quantity: 32, unit_cost_estimate: 165, total_cost_estimate: 5280 },
  { csi_code: '07-2100', csi_division: '07 – Thermal & Moisture', category: 'Insulation', subcategory: 'Batt Insulation', item: 'R-21 Kraft Batt Insulation', spec: 'Fiberglass, 6-1/4", 15" wide, friction fit', quantity: 4800, unit: 'SF', waste_factor_pct: 10, adjusted_quantity: 5280, unit_cost_estimate: 0.85, total_cost_estimate: 4488 },
  { csi_code: '09-2900', csi_division: '09 – Finishes', category: 'Drywall', subcategory: 'Gypsum Board', item: 'Drywall 1/2" 4x8 Sheet', spec: 'ASTM C1396, 1/2" regular, mold resistant', quantity: 680, unit: 'SHT', waste_factor_pct: 12, adjusted_quantity: 762, unit_cost_estimate: 14.50, total_cost_estimate: 11049 },
  { csi_code: '09-2900', csi_division: '09 – Finishes', category: 'Drywall', subcategory: 'Joint Compound', item: 'All-Purpose Joint Compound 5-Gal', spec: 'USG Sheetrock, ready-mixed', quantity: 24, unit: 'EA', waste_factor_pct: 5, adjusted_quantity: 25, unit_cost_estimate: 28.00, total_cost_estimate: 700 },
  { csi_code: '08-1100', csi_division: '08 – Openings', category: 'Windows & Doors', subcategory: 'Exterior Doors', item: '6/8 Fiberglass Entry Door 3068', spec: 'Therma-Tru or equal, pre-hung, 36"x80", LowE glass lite', quantity: 2, unit: 'EA', waste_factor_pct: 0, adjusted_quantity: 2, unit_cost_estimate: 685, total_cost_estimate: 1370 },
  { csi_code: '08-5000', csi_division: '08 – Openings', category: 'Windows & Doors', subcategory: 'Windows', item: 'Vinyl Double-Hung Window 3040', spec: 'JELD-WEN or equal, 30"x40", LowE2, U=0.28', quantity: 18, unit: 'EA', waste_factor_pct: 0, adjusted_quantity: 18, unit_cost_estimate: 385, total_cost_estimate: 6930 },
  { csi_code: '09-9000', csi_division: '09 – Finishes', category: 'Painting', subcategory: 'Interior', item: 'Interior Latex Paint — Eggshell', spec: 'Sherwin Williams Emerald or equal, 1-gal', quantity: 52, unit: 'GAL', waste_factor_pct: 10, adjusted_quantity: 57, unit_cost_estimate: 72, total_cost_estimate: 4104 },
  { csi_code: '09-6500', csi_division: '09 – Finishes', category: 'Flooring', subcategory: 'Hardwood', item: '3/4" x 3-1/4" Oak Hardwood Flooring', spec: 'Select & Better grade, pre-finished', quantity: 1200, unit: 'SF', waste_factor_pct: 10, adjusted_quantity: 1320, unit_cost_estimate: 8.50, total_cost_estimate: 11220 },
  { csi_code: '06-2000', csi_division: '06 – Wood, Plastics', category: 'Fasteners & Hardware', subcategory: 'Framing Nails', item: 'Framing Nails 16d Sinker', spec: '3-1/4" x .148", 50 LB box', quantity: 180, unit: 'LBS', waste_factor_pct: 5, adjusted_quantity: 189, unit_cost_estimate: 1.85, total_cost_estimate: 350 },
  { csi_code: '07-6200', csi_division: '07 – Thermal & Moisture', category: 'Exterior', subcategory: 'Housewrap', item: 'Weather Barrier Housewrap', spec: 'Tyvek HomeWrap or equal, 9\' x 100\' roll', quantity: 22, unit: 'ROLL', waste_factor_pct: 10, adjusted_quantity: 24, unit_cost_estimate: 125, total_cost_estimate: 3000 },
  { csi_code: '22-1100', csi_division: '22 – Plumbing', category: 'Plumbing', subcategory: 'Rough-In', item: 'PVC DWV Pipe 3" Schedule 40', spec: 'ASTM D2665, 10\' sticks', quantity: 280, unit: 'LF', waste_factor_pct: 15, adjusted_quantity: 322, unit_cost_estimate: 4.20, total_cost_estimate: 1352 },
  { csi_code: '26-1200', csi_division: '26 – Electrical', category: 'Electrical', subcategory: 'Rough-In', item: 'Romex NM-B 12/2 Wire', spec: '12 AWG, 2-conductor with ground, 250\' roll', quantity: 14, unit: 'ROLL', waste_factor_pct: 10, adjusted_quantity: 15, unit_cost_estimate: 118, total_cost_estimate: 1770 },
  { csi_code: '23-0700', csi_division: '23 – HVAC', category: 'HVAC', subcategory: 'Ductwork', item: 'Flexible Duct 6" R-8', spec: '6" diameter, R-8 insulated, 25\' section', quantity: 28, unit: 'EA', waste_factor_pct: 10, adjusted_quantity: 31, unit_cost_estimate: 42, total_cost_estimate: 1302 },
];

const DEMO_LABOR_LINES = [
  { trade: 'Concrete', task_description: 'Excavation, footings, slab pour, finish', hours: 96, crew_size: 4, crew_days: 3, hourly_rate_estimate: 65, total_cost_estimate: 6240, phase: 'Foundation' },
  { trade: 'Framing', task_description: 'Exterior walls, interior walls, floor system, roof framing', hours: 320, crew_size: 6, crew_days: 6.7, hourly_rate_estimate: 72, total_cost_estimate: 23040, phase: 'Framing' },
  { trade: 'Roofing', task_description: 'Felt, shingles, ridge, flashing, gutters', hours: 64, crew_size: 4, crew_days: 2, hourly_rate_estimate: 68, total_cost_estimate: 4352, phase: 'Framing' },
  { trade: 'Plumbing', task_description: 'Rough-in all DWV and supply, pressure test', hours: 120, crew_size: 2, crew_days: 7.5, hourly_rate_estimate: 85, total_cost_estimate: 10200, phase: 'MEP Rough-In' },
  { trade: 'Electrical', task_description: 'Service entry, panel, all rough-in wiring, low voltage', hours: 160, crew_size: 2, crew_days: 10, hourly_rate_estimate: 82, total_cost_estimate: 13120, phase: 'MEP Rough-In' },
  { trade: 'HVAC', task_description: 'Equipment, ductwork, registers, controls, commissioning', hours: 80, crew_size: 2, crew_days: 5, hourly_rate_estimate: 88, total_cost_estimate: 7040, phase: 'MEP Rough-In' },
  { trade: 'Insulation', task_description: 'Batt insulation all exterior walls, attic blown', hours: 48, crew_size: 3, crew_days: 2, hourly_rate_estimate: 58, total_cost_estimate: 2784, phase: 'Insulation' },
  { trade: 'Drywall', task_description: 'Hang, tape, mud, sand all rooms', hours: 200, crew_size: 4, crew_days: 6.25, hourly_rate_estimate: 62, total_cost_estimate: 12400, phase: 'Drywall' },
  { trade: 'Painting', task_description: 'Prime and 2 coats all interior, ceilings, trim', hours: 120, crew_size: 3, crew_days: 5, hourly_rate_estimate: 55, total_cost_estimate: 6600, phase: 'Finishes' },
  { trade: 'Flooring', task_description: 'Hardwood install and finish, tile bathrooms, carpet bedrooms', hours: 96, crew_size: 3, crew_days: 4, hourly_rate_estimate: 65, total_cost_estimate: 6240, phase: 'Finishes' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Namespace export
// ─────────────────────────────────────────────────────────────────────────────

export const SandboxManager = {
  createSandbox,
  trackSandboxEvent,
  checkAiLimit,
  getUpsellStats,
  processSandboxLifecycleEmails,
};
