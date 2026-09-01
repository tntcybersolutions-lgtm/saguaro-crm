/**
 * Sage — "Ask your project docs" (keyword-retrieval RAG). Pulls candidate records
 * from ~12 per-project text tables (ILIKE on the question's terms), re-ranks them
 * with the deterministic lib/rag engine, and has Claude answer GROUNDED in the top
 * sources with [n] citations. No embeddings needed. Tenant-scoped: the project must
 * belong to the caller's tenant (createServerClient is service-role → we gate here).
 */
import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { rankChunks, buildContext, terms, type DocChunk } from '@/lib/rag';
import { SAGE_CONDUCT_MANDATE } from '@/lib/sage-prompts';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const maxDuration = 60;
/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCES: { table: string; type: string; cols: string[]; label: (r: any) => string; route: string }[] = [
  { table: 'rfis', type: 'rfi', cols: ['title', 'description', 'response', 'specification_section', 'drawing_reference'], label: (r) => `RFI${r.number ? ' #' + r.number : ''}${r.title ? ' — ' + r.title : ''}`, route: 'rfis' },
  { table: 'change_orders', type: 'change_order', cols: ['title', 'description'], label: (r) => `Change Order${r.co_number ? ' #' + r.co_number : ''}${r.title ? ' — ' + r.title : ''}`, route: 'change-orders' },
  { table: 'daily_logs', type: 'daily_log', cols: ['work_performed', 'delays', 'safety_notes', 'weather', 'visitors'], label: (r) => `Daily Log${r.log_date ? ' — ' + r.log_date : ''}`, route: 'daily-logs' },
  { table: 'inspections', type: 'inspection', cols: ['inspection_type', 'phase', 'description', 'notes'], label: (r) => `Inspection${r.inspection_type ? ' — ' + r.inspection_type : ''}`, route: 'inspections' },
  { table: 'safety_incidents', type: 'safety', cols: ['description', 'location', 'root_cause', 'contributing_factors'], label: () => 'Safety incident', route: 'safety' },
  { table: 'punch_list', type: 'punch', cols: ['title', 'description'], label: (r) => `Punch — ${r.title || r.description || ''}`.slice(0, 70), route: 'punch-list' },
  { table: 'submittals', type: 'submittal', cols: ['title', 'notes', 'spec_section', 'trade'], label: (r) => `Submittal${r.submittal_number ? ' #' + r.submittal_number : ''}${r.title ? ' — ' + r.title : ''}`, route: 'submittals' },
  { table: 'meetings', type: 'meeting', cols: ['title', 'notes'], label: (r) => `Meeting — ${r.title || ''}`, route: 'meetings' },
  { table: 'correspondence', type: 'correspondence', cols: ['subject', 'body', 'transmittal_remarks'], label: (r) => r.subject || 'Correspondence', route: 'correspondence' },
  { table: 'observations', type: 'observation', cols: ['description', 'location', 'category', 'trade'], label: (r) => `Observation${r.category ? ' — ' + r.category : ''}`, route: 'observations' },
  { table: 'tm_tickets', type: 'tm', cols: ['description'], label: () => 'T&M ticket', route: 'tm-tickets' },
  { table: 'field_issues', type: 'field_issue', cols: ['title', 'description'], label: (r) => `Field issue — ${r.title || r.description || ''}`.slice(0, 70), route: 'field-issues' },
];

const clean = (q: string) => (String(q || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2).slice(0, 8);

export async function POST(req: NextRequest) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI not configured' }, { status: 200 });

  let body: { projectId?: string; question?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const projectId = body.projectId, question = (body.question || '').trim();
  if (!projectId) return Response.json({ error: 'Pick a project' }, { status: 400 });
  if (!question) return Response.json({ error: 'Ask a question' }, { status: 400 });

  const supabase = createServerClient();
  // tenant gate — the project must belong to the caller's tenant.
  const { data: proj } = await supabase.from('projects').select('id, name, tenant_id').eq('id', projectId).maybeSingle();
  if (!proj || (proj as any).tenant_id !== user.tenantId) return Response.json({ error: 'Project not found' }, { status: 404 });

  const qterms = clean(question);
  if (!qterms.length) return Response.json({ answer: "Try asking with a few more specific words (e.g. a trade, spec section, or RFI topic).", citations: [], searched: 0 });

  async function fetchTable(src: typeof SOURCES[number]): Promise<any[]> {
    const orAll = qterms.flatMap((t) => src.cols.map((c) => `${c}.ilike.%${t}%`)).join(',');
    try {
      const { data, error } = await supabase.from(src.table as any).select('*').eq('project_id', projectId).or(orAll).limit(8);
      if (error) throw error; return data || [];
    } catch {
      for (const c of src.cols) { // a column may not exist in this DB — fall back to a single safe column
        try { const { data, error } = await supabase.from(src.table as any).select('*').eq('project_id', projectId).or(qterms.map((t) => `${c}.ilike.%${t}%`).join(',')).limit(8); if (!error) return data || []; } catch { /* next col */ }
      }
      return [];
    }
  }

  const rows = await Promise.all(SOURCES.map(async (src) => ({ src, data: await fetchTable(src) })));
  const chunks: DocChunk[] = [];
  for (const { src, data } of rows) {
    for (const rec of data) {
      const text = src.cols.map((c) => rec[c]).filter((v) => v != null && String(v).trim()).map((v) => String(v)).join(' — ');
      if (!text.trim()) continue;
      chunks.push({ id: `${src.type}:${rec.id}`, source: src.label(rec).trim(), sourceType: src.type, recordId: String(rec.id || ''), route: `/app/projects/${projectId}/${src.route}`, text, date: rec.log_date || rec.created_at || undefined });
    }
  }

  if (!chunks.length) return Response.json({ answer: `I couldn't find anything about that in ${(proj as any).name || 'this project'}'s records yet. Try different words, or it may not be logged.`, citations: [], searched: 0 });

  const ranked = rankChunks(question, chunks, 8);
  if (!ranked.length) return Response.json({ answer: `Nothing in ${(proj as any).name || 'this project'}'s records matched that. Try rephrasing.`, citations: [], searched: chunks.length });
  const { context, citations } = buildContext(ranked);

  const system = `${SAGE_CONDUCT_MANDATE}

You are Sage, answering a general contractor's question using ONLY the numbered project records provided. Rules:
- Answer directly and concisely, like a sharp PM. Cite every fact with its source number in brackets, e.g. [1].
- If the records don't contain the answer, say so plainly — do NOT invent details.
- Prefer specifics (numbers, spec sections, dates, names) pulled from the records.`;

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: 'claude-sonnet-5', max_tokens: 1024, system,
      messages: [{ role: 'user', content: `QUESTION: ${question}\n\nPROJECT RECORDS:\n${context}` }],
    });
    const answer = (resp.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('').trim();
    return Response.json({ answer, citations, searched: chunks.length });
  } catch (err: any) {
    return apiError('sage/ask-docs', err, "Ask failed", 200);
  }
}
