// app/api/[...path]/route.ts
// Big catch-all dispatcher for all remaining API routes.
// Lives at app/api/[...path]/route.ts — lib files are 3 levels up (../../../).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../supabase/admin';
import { getProjectContext } from '../../../project-context';
import { generatePreliminaryNoticeHandler } from '../../../wh347-generator';
import { createCertifiedPayrollHandler, getCertifiedPayrollHandler } from '../../../wh347-generator';
import { loginHandler } from '../../../sandbox-manager-route';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildBidHistoryContext } from '@/lib/construction-intelligence';

import { apiError } from '@/lib/api-error';
// ─── CORS helpers ─────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://saguarocontrol.net';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': APP_URL,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/** Extract authenticated user from request using token or cookies. */
async function getUserFromRequest(req: NextRequest): Promise<{ id: string; tenantId: string; email: string } | null> {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
      || req.cookies.get('sb-access-token')?.value;
    if (!token) return null;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // profiles is keyed by `id` (= auth user id), NOT `user_id` (matches the
    // canonical getTenant in lib/supabase-server). Querying the wrong column
    // silently returned no row, so tenantId fell back to user.id (wrong tenant).
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    return {
      id: user.id,
      tenantId: (profile as any)?.tenant_id || user.id,
      email: user.email || '',
    };
  } catch {
    return null;
  }
}

/**
 * Prove the caller owns `projectId` before writing anything hung off it.
 *
 * Every write in this file goes through supabaseAdmin, which is the service
 * role key — RLS is bypassed entirely, so the only thing separating one tenant
 * from another is code like this. The bid-package and change-order branches
 * below took projectId straight from the request body and inserted against it
 * with no auth call at all, which let any caller write into any tenant's job by
 * supplying its id.
 *
 * Returns the tenant on success, or the response to send back. Callers must
 * check `denied` first — a helper that returned null on failure would let a
 * missed check read as success.
 */
async function requireProjectAccess(
  req: NextRequest,
  projectId: string,
): Promise<{ tenantId: string; denied: null } | { tenantId: null; denied: NextResponse }> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return { tenantId: null, denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', user.tenantId)
    .maybeSingle();
  if (!project) {
    // 404 rather than 403: confirming the row exists would tell an attacker
    // which project ids are real.
    return { tenantId: null, denied: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  }
  return { tenantId: user.tenantId, denied: null };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  type: 'pay-app' | 'insurance' | 'rfi' | 'compliance';
  title: string;
  subtitle: string;
  urgency: 'high' | 'medium' | 'low';
  actionUrl: string;
  actionLabel: string;
}

interface BidRecord {
  id: string;
  project_name: string;
  project_type: string;
  bid_date: string;
  bid_amount: number;
  actual_cost: number | null;
  margin_pct: number;
  outcome: 'won' | 'lost' | 'pending' | 'withdrawn';
  loss_reason: string | null;
  awarded_to: string | null;
  location: string;
  state: string;
  trades: string[];
  notes: string | null;
}

interface BidStats {
  totalBids: number;
  wonBids: number;
  lostBids: number;
  pendingBids: number;
  winRate: number;
  avgMargin: number;
  totalValue: number;
}

interface ScoreRequest {
  projectName: string;
  projectType?: string;
  estimatedValue: number;
  trade?: string;
  location?: string;
  competitorCount?: number;
  ourMargin: number;
}

interface ScoreResponse {
  score: number;
  recommendation: 'bid' | 'pass' | 'negotiate';
  reasoning: string;
  suggestedMargin: number;
  riskFactors: string[];
  winProbability: number;
}

interface SubSuggestion {
  id: string;
  name: string;
  trade: string;
  winRate: number | null;
  lastProjectDate: string | null;
  email: string | null;
  phone: string | null;
  suggestedReason: string;
}

interface InvitedSub {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  status: 'invited' | 'viewed' | 'submitted' | 'declined';
  bid_amount: number | null;
  invited_at: string;
  responded_at: string | null;
}

const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

// ─── Helper functions ─────────────────────────────────────────────────────────

function computeBidStats(bids: BidRecord[]): BidStats {
  const wonBids = bids.filter((b) => b.outcome === 'won');
  const lostBids = bids.filter((b) => b.outcome === 'lost');
  const pendingBids = bids.filter((b) => b.outcome === 'pending');
  const totalBids = bids.length;
  const decidedBids = wonBids.length + lostBids.length;
  const winRate = decidedBids > 0 ? Math.round((wonBids.length / decidedBids) * 100) : 0;
  const avgMargin = wonBids.length > 0 ? wonBids.reduce((sum, b) => sum + b.margin_pct, 0) / wonBids.length : 0;
  const totalValue = bids.reduce((sum, b) => sum + b.bid_amount, 0);
  return { totalBids, wonBids: wonBids.length, lostBids: lostBids.length, pendingBids: pendingBids.length, winRate, avgMargin: parseFloat(avgMargin.toFixed(1)), totalValue };
}


function buildSuggestedReason(sub: Record<string, unknown>): string {
  if ((sub.win_rate as number) >= 65) return 'Top performer by win rate for this trade';
  if ((sub.avg_rating as number) >= 4.5) return 'Highly rated on past projects';
  if (sub.last_project_date) return `Active — last project ${sub.last_project_date}`;
  return 'Available sub matching required trade';
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [seg0, seg1, seg2, seg3, seg4] = path;

  // GET /api/demo — demo mode removed
  if (seg0 === 'demo' && !seg1) {
    return NextResponse.json({ error: 'Demo mode is no longer available' }, { status: 410 });
  }

  // GET /api/marketing
  if (seg0 === 'marketing' && !seg1) {
    try {
      const filePath = join(process.cwd(), 'public', 'marketing.html');
      const html = await readFile(filePath, 'utf-8');
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
      });
    } catch {
      return new Response(
        `<!DOCTYPE html><html><head><title>Saguaro Control Systems</title></head><body style="background:#0a0a0a;color:#e8edf8;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><div style="font-size:48px">🌵</div><h1 style="color:#FFE600;margin:0">Saguaro Control Systems</h1><a href="/sandbox" style="background:#FFE600;color:#0a0a0a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:800">Start Free Sandbox</a><a href="/login" style="color:#A1A1AA;text-decoration:none">Sign In</a></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
  }

  // GET /api/dashboard/stats

  // GET /api/dashboard/today

  // GET /api/bids/history
  if (seg0 === 'bids' && seg1 === 'history') {
    try {
      const { searchParams } = new URL(req.url);
      const trade = searchParams.get('trade') ?? undefined;
      const outcome = searchParams.get('outcome') ?? undefined;
      const projectType = searchParams.get('projectType') ?? undefined;
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const token = req.headers.get('authorization')?.replace('Bearer ', '');
      let tenantId: string | null = null;
      if (token) { const { data: { user } } = await supabase.auth.getUser(token); tenantId = user?.id ?? null; }
      if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      let q = supabase.from('bid_history').select('*').eq('tenant_id', tenantId).order('bid_date', { ascending: false }).limit(limit);
      if (outcome) q = q.eq('outcome', outcome);
      if (projectType) q = q.eq('project_type', projectType);
      if (trade) q = q.contains('trades', [trade]);
      const { data, error } = await q;
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
          return NextResponse.json({ error: 'bid_history table not yet created', bids: [], stats: computeBidStats([]) }, { status: 500 });
        }
        return apiError('...path', error, undefined, 500);
      }
      const bids: BidRecord[] = data ?? [];
      return NextResponse.json({ bids, stats: computeBidStats(bids), source: 'live' });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  // GET /api/projects  (tenant-scoped project list)
  if (seg0 === 'projects' && !seg1) {
    try {
      const bearer = req.headers.get('authorization');
      let tenantId: string | null = null;
      if (bearer?.startsWith('Bearer ')) {
        const token = bearer.slice(7);
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const { data: { user } } = await supabase.auth.getUser(token);
        tenantId = user?.id ?? null;
      }
      if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { data, error } = await supabaseAdmin
        .from('projects')
        .select('id, name, address, project_number, status, contract_amount, start_date, substantial_completion_date, project_type, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return NextResponse.json({ projects: data ?? [] });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  // GET /api/context/:projectId
  if (seg0 === 'context' && seg1) {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ctx = await getProjectContext(user.tenantId, seg1);
    return NextResponse.json(ctx);
  }

  // GET /api/rfis?projectId=...
  if (seg0 === 'rfis' && !seg1) {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin
        .from('rfis')
        .select('id, rfi_number, subject, status, priority, assigned_to, response_due_date, cost_impact, schedule_impact_days, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ rfis: data || [] });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  // GET /api/change-orders?projectId=...
  if (seg0 === 'change-orders' && !seg1) {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin
        .from('change_orders')
        .select('id, co_number, title, status, cost_impact, schedule_impact_days, reason, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ changeOrders: data || [] });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  // GET /api/compliance/:projectId
  if (seg0 === 'compliance' && seg1) {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data } = await supabaseAdmin.from('project_compliance_dashboard').select('*').eq('project_id', seg1).eq('tenant_id', user.tenantId).maybeSingle();
    return NextResponse.json(data ?? {});
  }

  // GET /api/autopilot/alerts?projectId=&tenantId=
  if (seg0 === 'autopilot' && seg1 === 'alerts') {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    try {
      // Tenant comes from the authed session, NEVER a client-supplied ?tenantId=.
      let q = supabaseAdmin.from('autopilot_alerts').select('*').is('dismissed_at', null).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }).limit(50);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ alerts: data ?? [] });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  // GET /api/takeoffs/latest
  if (seg0 === 'takeoffs' && seg1 === 'latest') {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId query param required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin.from('takeoffs').select('id, project_id, status, extracted_line_items').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ takeoff: null });
      return NextResponse.json({ takeoff: { id: data.id, projectId: data.project_id, status: data.status, materials: data.extracted_line_items ?? [] } });
    } catch {
      return NextResponse.json({ takeoff: null });
    }
  }

  // GET /api/payroll/:projectId
  if (seg0 === 'payroll' && seg1 && seg1 !== 'create') {
    return getCertifiedPayrollHandler(req, seg1);
  }

  // GET /api/bid-packages?projectId=...  (list all for a project)
  if (seg0 === 'bid-packages' && !seg1) {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin
        .from('bid_packages')
        .select('id, package_number, name, trade, status, bid_due_date, awarded_to, awarded_amount, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ packages: data ?? [] });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  // GET /api/bid-packages/:id
  if (seg0 === 'bid-packages' && seg1 && !seg2) {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = seg1;
    try {
      const { data, error } = await supabaseAdmin.from('bid_packages').select(`id, code, name, trade, scope, status, bid_due_date, project_id, awarded_to, awarded_amount, created_at, sov_items(*), bid_package_invites(id, sub_id, status, bid_amount, invited_at, responded_at, subs(id, company_name, contact_name, email))`).eq('id', id).eq('tenant_id', user.tenantId).single();
      if (error || !data) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
      const invitedSubs: InvitedSub[] = (data.bid_package_invites || []).map((inv: any) => ({ id: inv.id, company_name: inv.subs?.company_name || 'Unknown', contact_name: inv.subs?.contact_name || '', email: inv.subs?.email || '', status: inv.status, bid_amount: inv.bid_amount, invited_at: inv.invited_at, responded_at: inv.responded_at }));
      return NextResponse.json({ bidPackage: { ...data, invited_subs: invitedSubs, sov_items: data.sov_items || [] } });
    } catch (err: unknown) {
      return apiError('[...path] GET', err);
    }
  }

  /* GET/POST /api/projects/:projectId/bid-packages/:bidPackageId/generate-jacket
     used to stream an AI "jacket" into a bid_jackets table that does not exist,
     taking the tenant from the request body and deleting the package's line
     items without a tenant filter. Nothing called it. Removed with
     ai-bid-jacket.ts; the jacket PDF is POST /api/bid-packages/:id/generate-jacket. */

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [seg0, seg1, seg2, seg3, seg4] = path;

  // POST /api/auth/login
  if (seg0 === 'auth' && seg1 === 'login') return loginHandler(req);

  // POST /api/auth/signup

  // POST /api/bid-packages/create
  if (seg0 === 'bid-packages' && seg1 === 'create') {
    const body = await req.json().catch(() => ({}));
    const { projectId, name, code, bidDue, scope } = body;
    if (!projectId || !name) return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });
    // projectId arrives from the request body and every query below runs on the
    // service role key, so ownership has to be proved before anything is read
    // or written against it.
    const access = await requireProjectAccess(req, projectId);
    if (access.denied) return access.denied;
    try {
      const { count } = await supabaseAdmin.from('bid_packages').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('tenant_id', access.tenantId);
      const autoCode = code || `BP-${String((count || 0) + 1).padStart(2, '0')}`;
      const { data, error } = await supabaseAdmin.from('bid_packages').insert({ tenant_id: access.tenantId, project_id: projectId, code: autoCode, name, scope: scope || '', status: 'draft', bid_due_date: bidDue || null }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, bidPackage: data });
    } catch (err: unknown) {
      return apiError('[...path] POST', err);
    }
  }

  // POST /api/bid-packages/suggest-subs

  // POST /api/bid-packages/:id/invite-subs

  // POST /api/bids/score
  if (seg0 === 'bids' && seg1 === 'score') {
    try {
      const body: ScoreRequest = await req.json();
      const { projectName, projectType, estimatedValue, trade, location, competitorCount, ourMargin } = body;
      if (!projectName || typeof estimatedValue !== 'number' || typeof ourMargin !== 'number') return NextResponse.json({ error: 'projectName, estimatedValue, and ourMargin are required.' }, { status: 400 });
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI bid scoring is not configured. Please set ANTHROPIC_API_KEY.' }, { status: 503 });
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const token = req.headers.get('authorization')?.replace('Bearer ', '');
      let tenantId: string | null = null;
      if (token) { const { data: { user } } = await supabase.auth.getUser(token); tenantId = user?.id ?? null; }
      const bidHistoryContext = tenantId ? await buildBidHistoryContext(supabase, tenantId, projectType) : 'No bid history available.';
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const systemPrompt = `You are an expert construction bid strategist with 20+ years of GC experience.\n\n${bidHistoryContext}\n\nAlways respond with valid JSON matching this exact structure:\n{\n  "score": <integer 0-100>,\n  "recommendation": <"bid" | "pass" | "negotiate">,\n  "reasoning": <string, 2-4 sentences>,\n  "suggestedMargin": <number, 1 decimal place>,\n  "riskFactors": [<string>, ...],\n  "winProbability": <integer 0-100>\n}`;
      const userPrompt = `Score this bid opportunity:\n- Project: ${projectName}\n- Type: ${projectType ?? 'Not specified'}\n- Estimated Value: $${estimatedValue.toLocaleString()}\n- Primary Trade: ${trade ?? 'General'}\n- Location: ${location ?? 'Not specified'}\n- Competitors Expected: ${competitorCount ?? 'Unknown'}\n- Our Proposed Margin: ${ourMargin}%`;
      const message = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: userPrompt }], system: systemPrompt });
      const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return NextResponse.json({ error: 'AI scoring returned an unparseable response' }, { status: 502 });
      const parsed: ScoreResponse = JSON.parse(jsonMatch[0]);
      const result: ScoreResponse = { score: Math.max(0, Math.min(100, Math.round(parsed.score ?? 50))), recommendation: ['bid', 'pass', 'negotiate'].includes(parsed.recommendation) ? parsed.recommendation : 'bid', reasoning: parsed.reasoning ?? '', suggestedMargin: parseFloat((parsed.suggestedMargin ?? ourMargin).toFixed(1)), riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [], winProbability: Math.max(0, Math.min(100, Math.round(parsed.winProbability ?? 50))) };
      return NextResponse.json({ ...result, source: 'ai' });
    } catch (err: unknown) {
      return apiError('[...path] POST', err);
    }
  }

  // POST /api/change-orders/create
  if (seg0 === 'change-orders' && seg1 === 'create') {
    const body = await req.json().catch(() => ({}));
    const { projectId, title, costImpact, scheduleImpactDays, reason, initiatedBy, description } = body;
    if (!projectId || !title) return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
    // Same as bid-packages above: body-supplied projectId, service role client.
    const access = await requireProjectAccess(req, projectId);
    if (access.denied) return access.denied;
    try {
      const { count } = await supabaseAdmin.from('change_orders').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('tenant_id', access.tenantId);
      const coNumber = `CO-${String((count || 0) + 1).padStart(3, '0')}`;
      const { data, error } = await supabaseAdmin.from('change_orders').insert({ tenant_id: access.tenantId, project_id: projectId, co_number: coNumber, title, description: description || '', status: 'pending', cost_impact: Number(costImpact) || 0, schedule_impact_days: Number(scheduleImpactDays) || 0, reason: reason || null, initiated_by: initiatedBy || null }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, changeOrder: data });
    } catch (err: unknown) {
      return apiError('[...path] POST', err);
    }
  }

  // /api/internal/autopilot/run is gone. It was a second 159-line copy of the
  // rule set, called by one page, alongside /api/autopilot/run which delegates
  // to lib/autopilot/scan — the engine the nightly cron uses. Two rule sets
  // behind one button is a divergence waiting to happen, so the page now calls
  // the shared one and this path no longer exists.
  // (An even earlier hollow branch here SELECTed project names and claimed
  // "Autopilot scan complete" without running a check. Also gone.)

  // POST /api/notices/preliminary
  if (seg0 === 'notices' && seg1 === 'preliminary') return generatePreliminaryNoticeHandler(req);

  // POST /api/payroll/create
  if (seg0 === 'payroll' && seg1 === 'create') return createCertifiedPayrollHandler(req);

  /* POST /api/projects/create is NOT handled here.
     It used to be, and the handler took tenantId straight from the request
     body: the Bearer token was consulted only when body.tenantId was ABSENT,
     so supplying it skipped authentication altogether and then inserted with
     supabaseAdmin, which bypasses RLS. Anyone who knew a tenant id could have
     created a project inside that company.
     It was already unreachable — app/api/projects/create/route.ts is a
     specific route and Next matches it before this catch-all, which a live
     POST confirms: the answer is {"error":"Unauthorized"} from getUser, not
     this branch's "tenantId required". Dead, but one rename away from being
     live, so it is gone rather than left loaded.
     The real handler requires getUser() and takes the tenant from the session,
     never the body. */


  // POST /api/autopilot/dismiss
  if (seg0 === 'autopilot' && seg1 === 'dismiss') {
    // Auth + tenant scope — service-role bypasses RLS, so an id-only update would
    // let any caller dismiss another tenant's alert (cross-tenant IDOR).
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const alertId = String(body.alertId ?? '');
    if (!alertId) return NextResponse.json({ error: 'alertId required' }, { status: 400 });
    // supabase-js does NOT throw on a failed write — this used to swallow the
    // { error } and return success:true regardless, so an alert the user
    // "dismissed" came straight back on the next load with no explanation.
    // .select() also proves a row actually matched (id + tenant), turning a
    // cross-tenant or stale id into an honest 404 instead of a silent no-op.
    try {
      const { data, error } = await supabaseAdmin
        .from('autopilot_alerts')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', alertId)
        .eq('tenant_id', user.tenantId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        return NextResponse.json({ error: 'That alert was not found' }, { status: 404 });
      }
    } catch (err) {
      return apiError('[...path] POST', err, "Couldn't dismiss that alert — try again");
    }
    return NextResponse.json({ success: true });
  }

  // POST /api/change-orders/:id/approve
  if (seg0 === 'change-orders' && seg1 && seg2 === 'approve') {
    // Auth + tenant scope — service-role bypasses RLS, so an id-only update would
    // let any caller approve another tenant's change order (cross-tenant IDOR).
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      const { data, error } = await supabaseAdmin.from('change_orders').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', seg1).eq('tenant_id', user.tenantId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    } catch (err) {
      return apiError('[...path] POST', err, 'Failed to approve change order');
    }
    return NextResponse.json({ success: true });
  }

  // POST /api/reports/generate is served by the REAL handler at
  // app/api/reports/generate/route.ts, which runs the report against live tenant
  // data via lib/reports/generate.generateReportData and returns actual columns
  // and rows. The hollow branch that used to live here generated nothing: it
  // wrote a report_runs row hardcoded status:'completed' and returned
  // "<Report> generated successfully." with downloadUrl:null. Deleted so no code
  // path can record a completed run for work that never executed.

  // POST /api/rfis/create

  // POST /api/team/invite is served by the REAL handler at
  // app/api/team/invite/route.ts (static segment beats this catch-all), which
  // persists a team_invites row with an accept token and sends the real email.
  // The branch that used to live here pushed status:'queued' whenever the invite
  // THREW, while no invite queue exists anywhere in this codebase — a thrown
  // invite is a failure, not a deferred send. Deleted.

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ─── OPTIONS handler ──────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': APP_URL,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }});
}
