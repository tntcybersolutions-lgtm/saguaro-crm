/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/reports/sage?q=<query>&projectId=<optional>
 * POST /api/reports/sage  body: { q, projectId }
 *
 * Sage interprets the user's natural language report request,
 * queries Supabase, and streams back structured report data.
 *
 * Flow:
 * 1. Parse user query
 * 2. Call Claude to interpret query + pick data sources
 * 3. Execute Supabase queries
 * 4. Format into columns/rows/totals
 * 5. Stream progress + final result
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportFilter {
  col: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'ilike' | 'is';
  val: any;
}

interface ReportJoin {
  table: string;
  select: string;
  on: string;
}

interface ReportQuery {
  id: string;
  table: string;
  select: string;
  filters?: ReportFilter[];
  joins?: ReportJoin[];
  orderBy?: { col: string; asc: boolean };
  limit?: number;
}

interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'currency' | 'date' | 'number' | 'badge' | 'percent';
}

interface ReportPlan {
  title: string;
  description: string;
  queries: ReportQuery[];
  columns: ReportColumn[];
  groupBy: string | null;
  chartType: string;
  summaryFields: string[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SAGE_SYSTEM_PROMPT = `You are Sage, Saguaro CRM's expert construction data analyst. Given a user's report request, determine what data to query.

Available Supabase tables and their key columns:
- projects: id, name, status('active'|'completed'|'bidding'), contract_amount, address, start_date, end_date
- pay_applications: id, project_id, app_number, period_to, status('draft'|'submitted'|'approved'|'paid'), contract_sum, total_completed, current_payment_due, retainage_amount
- rfis: id, project_id, rfi_number, subject, status('open'|'answered'|'closed'), due_date, response_due_date, cost_impact, schedule_impact
- change_orders: id, project_id, co_number, title, status('pending'|'approved'|'rejected'), cost_impact, schedule_impact, created_at
- lien_waivers: id, project_id, subcontractor_id, waiver_type, amount, status('pending'|'signed'|'received'), through_date
- subcontractors: id, project_id, name, trade, contract_amount, status
- insurance_certificates: id, subcontractor_id, policy_type, carrier, expiry_date, status
- budget_lines: id, project_id, cost_code, description, original_budget, committed_cost, actual_cost, forecast_cost
- daily_logs: id, project_id, log_date, weather, crew_count, work_performed, delays
- punch_list_items: id, project_id, location, description, trade, status('open'|'in_progress'|'complete'), priority, due_date
- takeoffs: id, project_id, name, status, total_cost, material_cost, labor_cost, building_area, analyzed_at
- timesheets: id, project_id, employee_name, week_ending, hours_regular, hours_overtime, status
- bid_packages: id, project_id, name, trade, status('open'|'awarded'|'closed'), due_date, requires_bond
- incidents: id, project_id, incident_type, severity, injury_type, osha_reportable, incident_date
- schedule_phases: id, project_id, name, planned_start, planned_end, actual_start, actual_end, status

Return ONLY raw JSON like this:
{
  "title": "Open RFIs — Project Alpha",
  "description": "All open RFIs with overdue responses",
  "queries": [
    {
      "id": "rfis",
      "table": "rfis",
      "select": "id,rfi_number,subject,status,due_date,response_due_date,cost_impact,schedule_impact",
      "filters": [{"col": "status", "op": "eq", "val": "open"}],
      "joins": [{"table": "projects", "select": "name", "on": "project_id"}],
      "orderBy": {"col": "due_date", "asc": true},
      "limit": 100
    }
  ],
  "columns": [
    {"key": "rfi_number", "label": "RFI #", "type": "text"},
    {"key": "subject", "label": "Subject", "type": "text"},
    {"key": "status", "label": "Status", "type": "badge"},
    {"key": "due_date", "label": "Due Date", "type": "date"},
    {"key": "cost_impact", "label": "Cost Impact", "type": "currency"}
  ],
  "groupBy": null,
  "chartType": "table",
  "summaryFields": ["cost_impact"]
}

Rules:
- queries array can have 1-3 queries if multiple tables needed
- columns must use keys from the queried table or joined tables (prefix with table name if ambiguous, e.g. "projects.name")
- type: "text"|"currency"|"date"|"number"|"badge"|"percent"
- summaryFields: columns to SUM for totals row (currency/number columns only)
- If user mentions a project by name, add a filter on project name or include it in joins
- Always include a project name column when querying non-project tables
- Limit to 200 rows max`;

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function extractFirstJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let inStr = false, esc = false;
  const stack: string[] = [];
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if ((c === '}' || c === ']') && stack.length) {
      stack.pop();
      if (stack.length === 0) { end = i; break; }
    }
  }
  return end >= 0 ? text.slice(start, end + 1) : null;
}

function repairJson(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let result = s;
  if (inStr) result += '"';
  result = result.replace(/,\s*$/, '');
  while (stack.length) result += stack.pop()!;
  return result;
}

function safeJsonParse<T = any>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const normalized = cleaned.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(normalized); } catch { /* continue */ }
  const candidate = extractFirstJson(normalized);
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { /* continue */ }
  try { return JSON.parse(repairJson(candidate)); } catch { return null; }
}

// ─── Query executor ───────────────────────────────────────────────────────────

async function executeQuery(
  supabase: ReturnType<typeof createServerClient>,
  query: ReportQuery,
  projectId?: string
): Promise<{ data: any[]; error: any }> {
  // Build select string — incorporate join selects inline (Supabase PostgREST syntax)
  let selectStr = query.select;
  if (query.joins && query.joins.length > 0) {
    for (const join of query.joins) {
      // Append joined table columns: e.g. "projects(name)"
      const joinCols = join.select.split(',').map((c) => c.trim()).join(',');
      selectStr += `,${join.table}(${joinCols})`;
    }
  }

  let q = supabase.from(query.table).select(selectStr);

  // Apply projectId filter if provided and table is not projects itself
  if (projectId && query.table !== 'projects') {
    q = q.eq('project_id', projectId);
  }

  // Apply Claude's filters
  for (const f of (query.filters || [])) {
    if (f.op === 'eq')    q = q.eq(f.col, f.val);
    else if (f.op === 'neq')   q = q.neq(f.col, f.val);
    else if (f.op === 'gt')    q = q.gt(f.col, f.val);
    else if (f.op === 'lt')    q = q.lt(f.col, f.val);
    else if (f.op === 'gte')   q = q.gte(f.col, f.val);
    else if (f.op === 'lte')   q = q.lte(f.col, f.val);
    else if (f.op === 'in')    q = q.in(f.col, f.val);
    else if (f.op === 'ilike') q = q.ilike(f.col, `%${f.val}%`);
    else if (f.op === 'is')    q = q.is(f.col, f.val);
  }

  if (query.orderBy) {
    q = q.order(query.orderBy.col, { ascending: query.orderBy.asc });
  }

  q = q.limit(query.limit || 100);

  const { data, error } = await q;
  return { data: data || [], error };
}

// ─── Row flattener ────────────────────────────────────────────────────────────

/**
 * Flatten nested objects from Supabase joins into dot-notation keys.
 * e.g. { projects: { name: 'Alpha' } } → { 'projects.name': 'Alpha' }
 * Also promotes top-level join table keys if unambiguous.
 */
function flattenRow(row: any): Record<string, any> {
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // Nested join object — expand with "table.column" keys
      for (const [subKey, subVal] of Object.entries(v as Record<string, any>)) {
        flat[`${k}.${subKey}`] = subVal;
        // Also promote without prefix if not already present
        if (!(subKey in flat)) flat[subKey] = subVal;
      }
    } else {
      flat[k] = v;
    }
  }
  return flat;
}

// ─── SSE stream builder ───────────────────────────────────────────────────────

function buildSageStream(q: string, projectId?: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`)
          );
        } catch { /* controller closed */ }
      };

      const done = (summary: Record<string, unknown> = {}) => {
        send('done', summary);
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // ── 1. Validate input ─────────────────────────────────────────────
        if (!q || q.trim().length === 0) {
          send('error', { message: 'Please provide a report query.' });
          return done();
        }

        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }

        send('progress', { step: 1, pct: 10, message: 'Sage is understanding your request...' });

        // ── 2. Call Claude with heartbeat ─────────────────────────────────
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        let accumulated = '';
        let lastHeartbeatMs = Date.now();

        // Heartbeat interval — keeps SSE connection alive during Claude call
        const heartbeat = setInterval(() => {
          send('progress', { step: 1, pct: 20, message: 'Sage is understanding your request...' });
        }, 5000);

        try {
          const userMessage = projectId
            ? `Project ID filter: ${projectId}\n\nReport request: ${q}`
            : `Report request: ${q}`;

          const claudeStream = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: SAGE_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
            stream: true,
          });

          for await (const event of claudeStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              accumulated += event.delta.text;
              const now = Date.now();
              if (now - lastHeartbeatMs > 5000) {
                send('progress', { step: 1, pct: 25, message: 'Sage is understanding your request...' });
                lastHeartbeatMs = now;
              }
            }
          }
        } finally {
          clearInterval(heartbeat);
        }

        // ── 3. Parse Claude's plan ────────────────────────────────────────
        const plan = safeJsonParse<ReportPlan>(accumulated);

        if (!plan || !plan.queries || plan.queries.length === 0) {
          send('error', { message: 'Sage could not interpret your request. Please try rephrasing.' });
          return done();
        }

        // ── 4. Execute queries ────────────────────────────────────────────
        const supabase = createServerClient();
        const allRows: any[][] = [];

        for (let i = 0; i < plan.queries.length; i++) {
          const query = plan.queries[i];
          send('progress', {
            step: 2,
            pct: 30 + Math.floor((i / plan.queries.length) * 40),
            message: `Querying ${query.table}...`,
          });

          const { data, error } = await executeQuery(supabase, query, projectId);

          if (error) {
            console.error(`[sage] Query error on table ${query.table}:`, error);
            // Non-fatal for multi-query plans — continue with other queries
          }

          allRows.push(data);
        }

        // ── 5. Merge and flatten results ──────────────────────────────────
        // For a single query: use its rows directly.
        // For multiple queries: merge by index (zip) or concatenate based on structure.
        let mergedRows: any[];

        if (allRows.length === 1) {
          mergedRows = allRows[0];
        } else {
          // Concatenate all result sets — columns from different tables are available
          mergedRows = allRows.flat();
        }

        const totalRowCount = mergedRows.length;
        send('progress', { step: 3, pct: 80, message: `Formatting ${totalRowCount} rows...` });

        // Flatten nested join objects
        const flatRows = mergedRows.map(flattenRow);

        // ── 6. Build formatted rows using plan columns ────────────────────
        const formattedRows = flatRows.map((row) => {
          const formatted: Record<string, any> = {};
          for (const col of plan.columns) {
            formatted[col.key] = row[col.key] ?? null;
          }
          return formatted;
        });

        // ── 7. Calculate totals ───────────────────────────────────────────
        const totals: Record<string, number> = {};
        for (const col of plan.columns) {
          if (
            (col.type === 'currency' || col.type === 'number') &&
            plan.summaryFields?.includes(col.key)
          ) {
            totals[col.key] = formattedRows.reduce((sum, row) => {
              const val = parseFloat(row[col.key]);
              return sum + (isNaN(val) ? 0 : val);
            }, 0);
          }
        }

        // ── 8. Stream final result ────────────────────────────────────────
        send('result', {
          title: plan.title,
          description: plan.description,
          columns: plan.columns,
          rows: formattedRows,
          totals,
          rowCount: formattedRows.length,
          chartType: plan.chartType || 'table',
          generatedAt: new Date().toISOString(),
        });

        done();

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Report generation failed. Please try again.';
        console.error('[sage]', err);
        send('error', { message });
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q         = searchParams.get('q') ?? '';
  const projectId = searchParams.get('projectId') ?? undefined;
  return buildSageStream(q, projectId);
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let q         = '';
  let projectId: string | undefined;

  try {
    const body = await req.json();
    q         = body.q         ?? '';
    projectId = body.projectId ?? undefined;
  } catch {
    // Malformed body — will be caught by empty-q check inside buildSageStream
  }

  return buildSageStream(q, projectId);
}
