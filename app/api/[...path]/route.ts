// app/api/[...path]/route.ts
// Big catch-all dispatcher for all remaining API routes.
// Lives at app/api/[...path]/route.ts — lib files are 3 levels up (../../../).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../supabase/admin';
import { getProjectContext } from '../../../project-context';
import { generatePreliminaryNoticeHandler } from '../../../wh347-generator';
import { createCertifiedPayrollHandler, getCertifiedPayrollHandler } from '../../../wh347-generator';
import { loginHandler } from '../../../sandbox-manager-route';
import { POST as bidJacketPost, GET as bidJacketGet } from '../../../bid-jacket-route';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildBidHistoryContext } from '@/lib/construction-intelligence';

// ─── CORS helpers ─────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://saguarocontrol.net';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': APP_URL,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
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
        `<!DOCTYPE html><html><head><title>Saguaro CRM</title></head><body style="background:#0d1117;color:#e8edf8;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><div style="font-size:48px">🌵</div><h1 style="color:#D4A017;margin:0">Saguaro CRM</h1><a href="/sandbox" style="background:#D4A017;color:#0d1117;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:800">Start Free Sandbox</a><a href="/login" style="color:#8fa3c0;text-decoration:none">Sign In</a></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
  }

  // GET /api/dashboard/stats
  if (seg0 === 'dashboard' && seg1 === 'stats') {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
      const supabase = createClient(supabaseUrl, supabaseKey);
      const [{ count: activeProjects }, { count: openBids }, { count: pendingPayApps }, { data: contractData }] = await Promise.all([
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('bids').select('id', { count: 'exact', head: true }).in('status', ['draft', 'submitted', 'under_review']),
        supabase.from('pay_applications').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('projects').select('contract_amount').eq('status', 'active'),
      ]);
      const totalContractValue = (contractData ?? []).reduce((sum: number, p: { contract_amount: number }) => sum + (p.contract_amount ?? 0), 0);
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const { data: revenueRows } = await supabase.from('pay_applications').select('current_payment_due').eq('status', 'approved').gte('submitted_at', startOfMonth.toISOString());
      const monthlyRevenue = (revenueRows ?? []).reduce((sum: number, r: { current_payment_due: number }) => sum + (r.current_payment_due ?? 0), 0);
      return NextResponse.json({ activeProjects: activeProjects ?? 0, openBids: openBids ?? 0, pendingPayApps: pendingPayApps ?? 0, totalContractValue, monthlyRevenue });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] dashboard/stats error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/dashboard/today
  if (seg0 === 'dashboard' && seg1 === 'today') {
    const items: ActionItem[] = [];
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: payApps } = await supabase.from('pay_applications').select('id, application_number, status, project_id, projects(name)').eq('status', 'submitted').limit(5);
      if (payApps && payApps.length > 0) {
        for (const pa of payApps) {
          const projectName = (pa.projects as { name?: string } | null)?.name ?? 'Unknown Project';
          items.push({ type: 'pay-app', title: `Pay App #${pa.application_number} Pending`, subtitle: `${projectName} — awaiting approval`, urgency: 'high', actionUrl: `/app/projects/${pa.project_id}/pay-apps`, actionLabel: 'Review' });
        }
      }
      const thirtyDaysOut = new Date(); thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
      const { data: cois } = await supabase.from('insurance_certificates').select('id, sub_name, expiry_date, project_id').lte('expiry_date', thirtyDaysOut.toISOString().split('T')[0]).gte('expiry_date', new Date().toISOString().split('T')[0]).limit(5);
      if (cois && cois.length > 0) {
        for (const coi of cois) {
          const expiry = new Date(coi.expiry_date);
          const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
          items.push({ type: 'insurance', title: 'COI Expiring Soon', subtitle: `${coi.sub_name} — expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, urgency: daysLeft <= 7 ? 'high' : 'medium', actionUrl: `/app/projects/${coi.project_id}/insurance`, actionLabel: 'Request Renewal' });
        }
      }
      const { data: notifications } = await supabase.from('notifications').select('id, type, title, message, entity_id, urgency').eq('read', false).order('created_at', { ascending: false }).limit(5);
      if (notifications && notifications.length > 0) {
        for (const n of notifications) {
          const nType = n.type as ActionItem['type'];
          if (!['pay-app', 'insurance', 'rfi', 'compliance'].includes(nType)) continue;
          items.push({ type: nType, title: n.title ?? 'Notification', subtitle: n.message ?? '', urgency: (n.urgency as ActionItem['urgency']) ?? 'medium', actionUrl: `/app/projects/${n.entity_id ?? 'unknown'}`, actionLabel: 'View' });
        }
      }
      items.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2));
      return NextResponse.json({ items });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] dashboard/today error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const bids: BidRecord[] = data ?? [];
      return NextResponse.json({ bids, stats: computeBidStats(bids), source: 'live' });
    } catch (err: unknown) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
      const msg = 'Internal server error';
      console.error('[api/catch-all] projects error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/context/:projectId
  if (seg0 === 'context' && seg1) {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    const ctx = await getProjectContext(tenantId, seg1);
    return NextResponse.json(ctx);
  }

  // GET /api/rfis?projectId=...
  if (seg0 === 'rfis' && !seg1) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin
        .from('rfis')
        .select('id, number, title, status, priority, assigned_to, response_due_date, cost_impact_amount, schedule_impact_days, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ rfis: data || [] });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] rfis error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/change-orders?projectId=...
  if (seg0 === 'change-orders' && !seg1) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin
        .from('change_orders')
        .select('id, co_number, title, status, cost_impact, schedule_impact_days, reason, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ changeOrders: data || [] });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] change-orders error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/compliance/:projectId
  if (seg0 === 'compliance' && seg1) {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    const { data } = await supabaseAdmin.from('project_compliance_dashboard').select('*').eq('project_id', seg1).eq('tenant_id', tenantId).maybeSingle();
    return NextResponse.json(data ?? {});
  }

  // GET /api/autopilot/alerts?projectId=&tenantId=
  if (seg0 === 'autopilot' && seg1 === 'alerts') {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    const tenantId = searchParams.get('tenantId') || '';
    try {
      let q = supabaseAdmin.from('autopilot_alerts').select('*').eq('dismissed', false).order('created_at', { ascending: false }).limit(50);
      if (projectId) q = q.eq('project_id', projectId);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ alerts: data ?? [] });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] autopilot/alerts error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/takeoffs/latest
  if (seg0 === 'takeoffs' && seg1 === 'latest') {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId query param required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin.from('takeoffs').select('id, project_id, status, materials').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ takeoff: null });
      return NextResponse.json({ takeoff: { id: data.id, projectId: data.project_id, status: data.status, materials: data.materials ?? [] } });
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
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin
        .from('bid_packages')
        .select('id, code, name, trade, status, bid_due_date, awarded_to, awarded_amount, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ packages: data ?? [] });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] bid-packages error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/bid-packages/:id
  if (seg0 === 'bid-packages' && seg1 && !seg2) {
    const id = seg1;
    try {
      const { data, error } = await supabaseAdmin.from('bid_packages').select(`id, code, name, trade, scope, status, bid_due_date, project_id, awarded_to, awarded_amount, created_at, sov_items(*), bid_package_invites(id, sub_id, status, bid_amount, invited_at, responded_at, subs(id, company_name, contact_name, email))`).eq('id', id).single();
      if (error || !data) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
      const invitedSubs: InvitedSub[] = (data.bid_package_invites || []).map((inv: any) => ({ id: inv.id, company_name: inv.subs?.company_name || 'Unknown', contact_name: inv.subs?.contact_name || '', email: inv.subs?.email || '', status: inv.status, bid_amount: inv.bid_amount, invited_at: inv.invited_at, responded_at: inv.responded_at }));
      return NextResponse.json({ bidPackage: { ...data, invited_subs: invitedSubs, sov_items: data.sov_items || [] } });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] bid-packages/:id error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // GET /api/projects/:projectId/bid-packages/:bidPackageId/generate-jacket
  if (seg0 === 'projects' && seg1 && seg2 === 'bid-packages' && seg3 && seg4 === 'generate-jacket') {
    return bidJacketGet(req, { params: { projectId: seg1, bidPackageId: seg3 } });
  }

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
  if (seg0 === 'auth' && seg1 === 'signup') {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
    const email    = String(body.email    ?? '').toLowerCase().trim();
    const password = String(body.password ?? '').trim();
    const company  = String(body.company  ?? '').trim();
    const phone    = String(body.phone    ?? '').trim();
    const role     = String(body.role     ?? 'General Contractor').trim();
    const state    = String(body.state    ?? '').trim();
    const size     = String(body.size     ?? '').trim();
    if (!email || !email.includes('@')) return NextResponse.json({ error: 'Valid email is required' }, { status: 400, headers: corsHeaders() });
    if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400, headers: corsHeaders() });
    if (!company) return NextResponse.json({ error: 'Company name is required' }, { status: 400, headers: corsHeaders() });
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { company_name: company, phone, role, state, company_size: size } });
    if (authErr || !authData.user) {
      const msg = authErr?.message ?? 'Signup failed';
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) return NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 409, headers: corsHeaders() });
      return NextResponse.json({ error: 'Internal server error' }, { status: 400, headers: corsHeaders() });
    }
    const tenantId = authData.user.id;
    await supabaseAdmin.from('tenants').insert({ id: tenantId, company_name: company, phone: phone || null, role, state: state || null, company_size: size || null, plan: 'trial', trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), created_at: new Date().toISOString() }).then(() => null);
    const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (sessionErr || !sessionData.session) return NextResponse.json({ success: true, message: 'Account created! Please log in.', redirectUrl: `${APP_URL}/login` }, { headers: corsHeaders() });
    return NextResponse.json({ success: true, message: 'Account created successfully!', accessToken: sessionData.session.access_token, refreshToken: sessionData.session.refresh_token, expiresAt: sessionData.session.expires_at, userId: authData.user.id, redirectUrl: `${APP_URL}/onboarding/step-1` }, { headers: corsHeaders() });
  }

  // POST /api/bid-packages/create
  if (seg0 === 'bid-packages' && seg1 === 'create') {
    const body = await req.json().catch(() => ({}));
    const { projectId, name, code, bidDue, scope } = body;
    if (!projectId || !name) return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });
    try {
      const { count } = await supabaseAdmin.from('bid_packages').select('*', { count: 'exact', head: true }).eq('project_id', projectId);
      const autoCode = code || `BP-${String((count || 0) + 1).padStart(2, '0')}`;
      const { data, error } = await supabaseAdmin.from('bid_packages').insert({ project_id: projectId, code: autoCode, name, scope: scope || '', status: 'draft', bid_due_date: bidDue || null }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, bidPackage: data });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] bid-packages/create error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // POST /api/bid-packages/suggest-subs
  if (seg0 === 'bid-packages' && seg1 === 'suggest-subs') {
    let trade = ''; let projectId = '';
    try { const body = await req.json(); trade = body.trade || ''; projectId = body.projectId || ''; } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    try {
      const tradeKeyword = trade.replace(/^Division \d+ — /, '').toLowerCase();
      const { data, error } = await supabaseAdmin.from('sub_performance').select('id, name, trade, email, win_rate, last_project, last_project_date, rating').ilike('trade', `%${tradeKeyword}%`).order('win_rate', { ascending: false }).limit(10);
      if (error) throw error;
      const subs = (data || []).map((row: { id: string; name: string; trade: string; email: string; win_rate: number; last_project: string; last_project_date: string; rating: number }) => ({ id: row.id, name: row.name, trade: row.trade, email: row.email, winRate: row.win_rate, lastProject: row.last_project, lastProjectDate: row.last_project_date, rating: row.rating }));
      return NextResponse.json({ subs });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] suggest-subs error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // POST /api/bid-packages/:id/invite-subs
  if (seg0 === 'bid-packages' && seg1 && seg2 === 'invite-subs') {
    const bidPackageId = seg1;
    try {
      if (!bidPackageId) return NextResponse.json({ error: 'Bid package ID is required.' }, { status: 400 });
      const body = await req.json();
      const { tradeRequired, projectType, projectValue, sendInvites = false } = body;
      if (!tradeRequired) return NextResponse.json({ error: 'tradeRequired is required.' }, { status: 400 });
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const token = req.headers.get('authorization')?.replace('Bearer ', '');
      let tenantId: string | null = null;
      if (token) { const { data: { user } } = await supabase.auth.getUser(token); tenantId = user?.id ?? null; }
      let suggestions: SubSuggestion[] = [];
      let source = 'none';
      if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { data: perfData, error: perfError } = await supabase.from('sub_performance').select('*').eq('tenant_id', tenantId).ilike('trade', `%${tradeRequired}%`).order('win_rate', { ascending: false }).limit(5);
      if (!perfError && perfData?.length) {
        suggestions = perfData.map((sub: Record<string, unknown>) => ({ id: sub.id as string, name: sub.sub_name as string, trade: sub.trade as string, winRate: sub.win_rate as number | null, lastProjectDate: sub.last_project_date as string | null, email: sub.email as string | null, phone: sub.phone as string | null, suggestedReason: buildSuggestedReason(sub) }));
        source = 'sub_performance';
      } else {
        const { data: subData, error: subError } = await supabase.from('subcontractors').select('id, name, trade, email, phone, rating').eq('tenant_id', tenantId).ilike('trade', `%${tradeRequired}%`).limit(5);
        if (!subError && subData?.length) {
          suggestions = subData.map((sub: Record<string, unknown>) => ({ id: sub.id as string, name: sub.name as string, trade: sub.trade as string, winRate: null, lastProjectDate: null, email: sub.email as string | null, phone: sub.phone as string | null, suggestedReason: 'Matching sub in your database' }));
          source = 'subcontractors';
        }
      }
      let invitesSent = 0;
      if (sendInvites && tenantId) {
        const now = new Date().toISOString();
        const inviteRows = suggestions.map((sub) => ({ tenant_id: tenantId, bid_package_id: bidPackageId, sub_id: sub.id.startsWith('demo-') ? null : sub.id, sub_name: sub.name, sub_email: sub.email, trade: sub.trade, status: 'invited', invited_at: now }));
        const { error: insertError } = await supabase.from('bid_package_invites').upsert(inviteRows, { onConflict: 'bid_package_id,sub_email' });
        if (!insertError) invitesSent = inviteRows.length;
      }
      return NextResponse.json({ bidPackageId, tradeRequired, projectType: projectType ?? null, projectValue: projectValue ?? null, suggestions, totalSuggested: suggestions.length, invitesSent: sendInvites ? invitesSent : 0, source });
    } catch (err: unknown) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // POST /api/bids/score
  if (seg0 === 'bids' && seg1 === 'score') {
    try {
      const body: ScoreRequest = await req.json();
      const { projectName, projectType, estimatedValue, trade, location, competitorCount, ourMargin } = body;
      if (!projectName || typeof estimatedValue !== 'number' || typeof ourMargin !== 'number') return NextResponse.json({ error: 'projectName, estimatedValue, and ourMargin are required.' }, { status: 400 });
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Bid scoring requires project data' }, { status: 400 });
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
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // POST /api/change-orders/create
  if (seg0 === 'change-orders' && seg1 === 'create') {
    const body = await req.json().catch(() => ({}));
    const { projectId, title, costImpact, scheduleImpactDays, reason, initiatedBy, description } = body;
    if (!projectId || !title) return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
    try {
      const { count } = await supabaseAdmin.from('change_orders').select('*', { count: 'exact', head: true }).eq('project_id', projectId);
      const coNumber = `CO-${String((count || 0) + 1).padStart(3, '0')}`;
      const { data, error } = await supabaseAdmin.from('change_orders').insert({ project_id: projectId, co_number: coNumber, title, description: description || '', status: 'pending', cost_impact: Number(costImpact) || 0, schedule_impact_days: Number(scheduleImpactDays) || 0, reason: reason || null, initiated_by: initiatedBy || null }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, changeOrder: data });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] change-orders/create error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // POST /api/internal/autopilot/run
  if (seg0 === 'internal' && seg1 === 'autopilot' && seg2 === 'run') {
    const body = await req.json().catch(() => ({}));
    const { tenantId } = body;
    try {
      if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
      const { data: projects } = await supabaseAdmin.from('projects').select('id, name').eq('tenant_id', tenantId).eq('status', 'active');
      return NextResponse.json({ success: true, scanned: projects?.length || 0, message: `Autopilot scan complete. Analyzed ${projects?.length || 0} active projects.` });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] autopilot/run error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // POST /api/notices/preliminary
  if (seg0 === 'notices' && seg1 === 'preliminary') return generatePreliminaryNoticeHandler(req);

  // POST /api/payroll/create
  if (seg0 === 'payroll' && seg1 === 'create') return createCertifiedPayrollHandler(req);

  // POST /api/projects/create
  if (seg0 === 'projects' && seg1 === 'create') {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const name          = String(body.name          ?? '').trim();
    const address       = String(body.address       ?? '').trim();
    const projectType   = String(body.projectType   ?? 'residential').trim();
    const contractAmount = Number(body.contractAmount ?? body.budget ?? 0);
    const startDate     = body.startDate   ? String(body.startDate)   : null;
    const subDate       = body.subDate     ? String(body.subDate)     : null;
    const ownerName     = body.ownerName   ? String(body.ownerName)   : null;
    const ownerEmail    = body.ownerEmail  ? String(body.ownerEmail)  : null;
    const archName      = body.archName    ? String(body.archName)    : null;
    const archEmail     = body.archEmail   ? String(body.archEmail)   : null;
    const description   = body.description ? String(body.description) : null;
    const retainage     = Number(body.retainage ?? 10);
    const prevailingWage = Boolean(body.prevailingWage ?? false);
    const publicProject  = Boolean(body.publicProject ?? false);
    const contractType  = body.contractType ? String(body.contractType) : 'Lump Sum GMP';
    const state         = body.state ? String(body.state) : 'AZ';
    let tenantId = String(body.tenantId ?? '');
    const bearer = req.headers.get('authorization');
    if (bearer?.startsWith('Bearer ') && !tenantId) {
      const token = bearer.slice(7);
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      tenantId = user?.user_metadata?.tenant_id ?? user?.id ?? tenantId;
    }
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized — tenantId required' }, { status: 401 });
    if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const seq = String((count ?? 0) + 1).padStart(4, '0');
    const projectNumber = `${year}-${seq}`;
    const now = new Date().toISOString();
    const { data: project, error } = await supabaseAdmin.from('projects').insert({ tenant_id: tenantId, name, address: address || null, project_number: projectNumber, project_type: projectType, contract_amount: contractAmount || null, start_date: startDate, substantial_completion_date: subDate, owner_name: ownerName, owner_email: ownerEmail, architect_name: archName, architect_email: archEmail, description, retainage_percent: retainage, prevailing_wage: prevailingWage, public_project: publicProject, contract_type: contractType, state, status: 'active', created_at: now, updated_at: now }).select('id, project_number, name').single();
    if (error || !project) {
      console.error('[api/catch-all] projects/create error:', error?.message);
      return NextResponse.json({ error: error?.message || 'Failed to create project' }, { status: 500 });
    }
    return NextResponse.json({ projectId: project.id, projectNumber: project.project_number, name: project.name });
  }

  // POST /api/autopilot/dismiss
  if (seg0 === 'autopilot' && seg1 === 'dismiss') {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const alertId = String(body.alertId ?? '');
    if (!alertId) return NextResponse.json({ error: 'alertId required' }, { status: 400 });
    try {
      await supabaseAdmin.from('autopilot_alerts').update({ dismissed: true, dismissed_at: new Date().toISOString() }).eq('id', alertId);
    } catch { /* non-fatal */ }
    return NextResponse.json({ success: true });
  }

  // POST /api/change-orders/:id/approve
  if (seg0 === 'change-orders' && seg1 && seg2 === 'approve') {
    try {
      await supabaseAdmin.from('change_orders').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', seg1);
    } catch { /* non-fatal */ }
    return NextResponse.json({ success: true });
  }

  // POST /api/projects/:projectId/bid-packages/:bidPackageId/generate-jacket
  if (seg0 === 'projects' && seg1 && seg2 === 'bid-packages' && seg3 && seg4 === 'generate-jacket') {
    return bidJacketPost(req, { params: { projectId: seg1, bidPackageId: seg3 } });
  }

  // POST /api/reports/generate
  if (seg0 === 'reports' && seg1 === 'generate') {
    const body = await req.json().catch(() => ({}));
    const { reportType, format = 'pdf', projectId, tenantId } = body;
    if (!reportType) return NextResponse.json({ error: 'reportType required' }, { status: 400 });
    const reportMeta: Record<string, { title: string; description: string }> = {
      'job-cost': { title: 'Job Cost Report', description: 'Budget vs actuals by cost code' },
      'bid-win-loss': { title: 'Bid Win/Loss Summary', description: 'Win rate by trade and margin analysis' },
      'schedule-variance': { title: 'Schedule Variance Report', description: 'Critical path delays and milestone status' },
      'pay-app-status': { title: 'Pay Application Status', description: 'All pay apps — billed, certified, paid, retainage' },
      'lien-waiver-log': { title: 'Lien Waiver Log', description: 'All waivers by project and subcontractor' },
      'insurance-compliance': { title: 'Insurance Compliance Report', description: 'COI status and expiry dates' },
      'autopilot-alerts': { title: 'Autopilot Alert History', description: 'All AI alerts by project' },
      'rfi-log': { title: 'RFI Log', description: 'All RFIs with status and response times' },
    };
    const meta = reportMeta[reportType] || { title: reportType, description: '' };
    try { await supabaseAdmin.from('report_runs').insert({ tenant_id: tenantId || null, project_id: projectId || null, report_type: reportType, format, status: 'completed' }).single(); } catch { /* non-fatal */ }
    return NextResponse.json({ success: true, reportType, format, title: meta.title, message: `${meta.title} generated successfully.`, downloadUrl: null });
  }

  // POST /api/rfis/create
  if (seg0 === 'rfis' && seg1 === 'create') {
    const body = await req.json().catch(() => ({}));
    const { projectId, title, priority, assignedTo, responseDue, drawingRef, specSection, description } = body;
    if (!projectId || !title) return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
    try {
      const { count } = await supabaseAdmin.from('rfis').select('*', { count: 'exact', head: true }).eq('project_id', projectId);
      const number = `RFI-${String((count || 0) + 1).padStart(3, '0')}`;
      const { data, error } = await supabaseAdmin.from('rfis').insert({ project_id: projectId, number, title, description: description || '', status: 'open', priority: priority || 'normal', assigned_to: assignedTo || null, response_due_date: responseDue || null, drawing_reference: drawingRef || null, spec_section: specSection || null }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, rfi: data });
    } catch (err: unknown) {
      const msg = 'Internal server error';
      console.error('[api/catch-all] rfis/create error:', msg);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // POST /api/team/invite
  if (seg0 === 'team' && seg1 === 'invite') {
    const body = await req.json().catch(() => ({}));
    const { tenantId, invites } = body as { tenantId?: string; invites?: Array<{ email: string; role: string }> };
    if (!invites || !Array.isArray(invites) || invites.length === 0) return NextResponse.json({ error: 'invites array required' }, { status: 400 });
    const results: Array<{ email: string; status: string }> = [];
    for (const invite of invites) {
      if (!invite.email) continue;
      try {
        const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email, { data: { role: invite.role || 'member', tenant_id: tenantId || '' } });
        results.push({ email: invite.email, status: error ? 'failed' : 'sent' });
      } catch {
        results.push({ email: invite.email, status: 'queued' });
      }
    }
    return NextResponse.json({ success: true, results });
  }

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
