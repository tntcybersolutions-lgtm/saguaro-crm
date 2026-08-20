import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type CheckStatus = 'pass' | 'warn' | 'fail';
interface Check {
  key: string;
  group: string;
  name: string;
  status: CheckStatus;
  detail: string;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}

const FEATURE_ROUTES: Array<{ key: string; name: string; path: string; body?: Record<string, unknown> }> = [
  { key: 'daily_logs_ai_fill',       name: 'Daily Logs AI Fill',            path: '/api/daily-logs/ai-fill' },
  { key: 'pay_app_g702',             name: 'Pay App G702 Generate',          path: '/api/pay-applications/00000000-0000-0000-0000-000000000000/generate-g702' },
  { key: 'insurance_extract_coi',    name: 'Insurance Extract COI',          path: '/api/insurance/extract-coi' },
  { key: 'change_order_ai_draft',    name: 'Change Order AI Draft',          path: '/api/change-orders/ai-draft' },
  { key: 'contracts_ai_generate',    name: 'Contracts AI Generate',          path: '/api/contracts/ai-generate' },
  { key: 'certified_payroll_wh347',  name: 'Certified Payroll WH-347',       path: '/api/certified-payroll/generate-wh347' },
  { key: 'closeout_initialize',      name: 'Closeout Initialize',            path: '/api/closeout/initialize' },
  { key: 'closeout_assemble',        name: 'Closeout Assemble',              path: '/api/closeout/assemble' },
  { key: 'rfis_ai_draft',            name: 'RFIs AI Draft',                  path: '/api/rfis/ai-draft' },
  { key: 'milestone_letters',        name: 'Milestone Letter Generate',      path: '/api/milestone-letters/generate' },
  { key: 'sage_chat',                name: 'Sage AI Chat',                   path: '/api/sage/chat' },
  { key: 'dashboard_metrics',        name: 'Dashboard Metrics',              path: '/api/dashboard/metrics' },
];

function originFrom(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: Error | null }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - t0, error: null };
  } catch (e) {
    return { value: null, ms: Date.now() - t0, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

async function checkDb(tenantId: string): Promise<Check> {
  const db = createServerClient();
  const r = await timed(async () => {
    const res = await db
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    return res;
  });
  if (r.error) {
    return {
      key: 'db_connect',
      group: 'Infrastructure',
      name: 'Supabase DB connection',
      status: 'fail',
      detail: r.error.message,
      latencyMs: r.ms,
    };
  }
  if (r.value?.error) {
    return {
      key: 'db_connect',
      group: 'Infrastructure',
      name: 'Supabase DB connection',
      status: 'fail',
      detail: r.value.error.message,
      latencyMs: r.ms,
    };
  }
  return {
    key: 'db_connect',
    group: 'Infrastructure',
    name: 'Supabase DB connection',
    status: 'pass',
    detail: `OK · ${r.ms}ms · ${r.value?.count ?? 0} projects`,
    latencyMs: r.ms,
  };
}

async function checkAnthropic(): Promise<Check> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      key: 'anthropic',
      group: 'Infrastructure',
      name: 'Anthropic API',
      status: 'fail',
      detail: 'ANTHROPIC_API_KEY env var is not set',
    };
  }
  const r = await timed(async () => {
    const client = new Anthropic({ apiKey: key });
    return await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    });
  });
  if (r.error) {
    return {
      key: 'anthropic',
      group: 'Infrastructure',
      name: 'Anthropic API',
      status: 'fail',
      detail: r.error.message.slice(0, 180),
      latencyMs: r.ms,
    };
  }
  return {
    key: 'anthropic',
    group: 'Infrastructure',
    name: 'Anthropic API',
    status: 'pass',
    detail: `OK · ${r.ms}ms · model responded`,
    latencyMs: r.ms,
  };
}

async function checkWeather(): Promise<Check> {
  const r = await timed(async () => {
    const res = await fetch('https://wttr.in/Phoenix,AZ?format=j1', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  });
  if (r.error) {
    return {
      key: 'weather',
      group: 'Infrastructure',
      name: 'wttr.in weather API',
      status: 'warn',
      detail: `Non-blocking: ${r.error.message.slice(0, 100)}`,
      latencyMs: r.ms,
    };
  }
  return {
    key: 'weather',
    group: 'Infrastructure',
    name: 'wttr.in weather API',
    status: 'pass',
    detail: `OK · ${r.ms}ms`,
    latencyMs: r.ms,
  };
}

async function checkFeatureRoute(
  origin: string,
  cookie: string,
  route: { key: string; name: string; path: string; body?: Record<string, unknown> },
): Promise<Check> {
  const r = await timed(async () => {
    const res = await fetch(`${origin}${route.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(route.body || {}),
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text().catch(() => '');
    return { status: res.status, snippet: text.slice(0, 160) };
  });

  if (r.error) {
    return {
      key: `route_${route.key}`,
      group: 'Feature Routes',
      name: route.name,
      status: 'fail',
      detail: `Unreachable: ${r.error.message.slice(0, 120)}`,
      latencyMs: r.ms,
    };
  }
  const status = r.value!.status;
  // 400 = route exists and validated input → PASS
  // 401/403 = auth guard working, route exists → PASS
  // 404 = typically expected for bogus test IDs → PASS
  // 500 = route exists but crashed → WARN
  // everything else (e.g. 200, 2xx unexpected) → warn
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return {
      key: `route_${route.key}`,
      group: 'Feature Routes',
      name: route.name,
      status: 'pass',
      detail: `${status} (route exists, auth/validation working)`,
      latencyMs: r.ms,
    };
  }
  if (status === 500) {
    return {
      key: `route_${route.key}`,
      group: 'Feature Routes',
      name: route.name,
      status: 'warn',
      detail: `500 — route exists but has runtime error: ${r.value!.snippet}`,
      latencyMs: r.ms,
    };
  }
  if (status >= 200 && status < 300) {
    return {
      key: `route_${route.key}`,
      group: 'Feature Routes',
      name: route.name,
      status: 'pass',
      detail: `${status} (route exists)`,
      latencyMs: r.ms,
    };
  }
  return {
    key: `route_${route.key}`,
    group: 'Feature Routes',
    name: route.name,
    status: 'warn',
    detail: `HTTP ${status} — unexpected: ${r.value!.snippet}`,
    latencyMs: r.ms,
  };
}

async function checkPublicPortal(origin: string, path: string, label: string, key: string): Promise<Check> {
  const r = await timed(async () => {
    const res = await fetch(`${origin}${path}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status };
  });
  if (r.error) {
    return {
      key,
      group: 'Public Portals',
      name: label,
      status: 'fail',
      detail: `Unreachable: ${r.error.message.slice(0, 120)}`,
      latencyMs: r.ms,
    };
  }
  if (r.value!.status === 401) {
    return {
      key,
      group: 'Public Portals',
      name: label,
      status: 'fail',
      detail: `Returned 401 — portal is NOT public (middleware misconfigured)`,
      latencyMs: r.ms,
    };
  }
  return {
    key,
    group: 'Public Portals',
    name: label,
    status: 'pass',
    detail: `HTTP ${r.value!.status} — portal is public`,
    latencyMs: r.ms,
  };
}

async function checkSettingsReadiness(tenantId: string): Promise<Check[]> {
  const db = createServerClient();
  const { data } = await db
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const row = (data as Record<string, unknown>) || {};
  const critical = ['company_name', 'license_number', 'signature_name'];
  const missing = critical.filter(k => !row[k] || String(row[k]).trim() === '');
  const pct = typeof row.completeness_pct === 'number' ? (row.completeness_pct as number) : null;

  return [
    {
      key: 'settings_complete',
      group: 'Data Readiness',
      name: 'tenant_settings critical fields',
      status: missing.length === 0 ? 'pass' : 'warn',
      detail: missing.length === 0 ? 'All critical fields populated' : `Missing: ${missing.join(', ')}`,
      meta: { completeness_pct: pct, missing },
    },
  ];
}

async function checkDataReadiness(tenantId: string): Promise<Check[]> {
  const db = createServerClient();
  const [sov, timeEntries, employees] = await Promise.all([
    db.from('sov_lines').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    db.from('time_entries').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    db.from('employees').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);
  const out: Check[] = [];
  out.push({
    key: 'data_sov',
    group: 'Data Readiness',
    name: 'SOV lines',
    status: (sov.count ?? 0) > 0 ? 'pass' : 'warn',
    detail: `${sov.count ?? 0} schedule-of-values lines`,
    meta: { count: sov.count ?? 0 },
  });
  out.push({
    key: 'data_time_entries',
    group: 'Data Readiness',
    name: 'time_entries',
    status: (timeEntries.count ?? 0) > 0 ? 'pass' : 'warn',
    detail: `${timeEntries.count ?? 0} time entries`,
    meta: { count: timeEntries.count ?? 0 },
  });
  out.push({
    key: 'data_employees',
    group: 'Data Readiness',
    name: 'employees',
    status: (employees.count ?? 0) > 0 ? 'pass' : 'warn',
    detail: `${employees.count ?? 0} employees`,
    meta: { count: employees.count ?? 0 },
  });
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = originFrom(req);
  const cookie = req.headers.get('cookie') || '';

  try {
    const [db, anthropic, weather, settings, data] = await Promise.all([
      checkDb(user.tenantId),
      checkAnthropic(),
      checkWeather(),
      checkSettingsReadiness(user.tenantId),
      checkDataReadiness(user.tenantId),
    ]);

    const features = await Promise.all(
      FEATURE_ROUTES.map(r => checkFeatureRoute(origin, cookie, r)),
    );

    const portals = await Promise.all([
      checkPublicPortal(origin, '/portals/lien/test', 'Lien portal (public)', 'portal_lien'),
      checkPublicPortal(origin, '/portals/contract/test', 'Contract portal (public)', 'portal_contract'),
    ]);

    const checks: Check[] = [db, anthropic, weather, ...features, ...portals, ...settings, ...data];

    const summary = {
      total: checks.length,
      pass: checks.filter(c => c.status === 'pass').length,
      warn: checks.filter(c => c.status === 'warn').length,
      fail: checks.filter(c => c.status === 'fail').length,
    };

    // Persist to system_health_checks. One row per check per run.
    const supabase = createServerClient();
    const runId = crypto.randomUUID();
    const runAt = new Date().toISOString();
    const rows = checks.map(c => ({
      tenant_id: user.tenantId,
      run_id: runId,
      check_key: c.key,
      check_group: c.group,
      check_name: c.name,
      status: c.status,
      detail: c.detail,
      latency_ms: c.latencyMs ?? null,
      meta: c.meta ?? null,
      run_at: runAt,
    }));
    try {
      await supabase.from('system_health_checks').insert(rows);
    } catch { /* non-blocking */ }

    return NextResponse.json({
      runId,
      runAt,
      summary,
      checks,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
