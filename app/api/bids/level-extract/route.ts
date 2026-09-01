/**
 * Bid-leveling AI extract — read one sub's bid (pasted text or PDF) and map it to
 * the GC's scope checklist: base bid, per-line included/excluded, alternates,
 * clarifications. The deterministic lib/bidleveling engine does the actual leveling
 * math on the client from what this returns.
 */
import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const maxDuration = 120;
/* eslint-disable @typescript-eslint/no-explicit-any */

const SYSTEM = 'You are a senior estimator leveling subcontractor bids. Map the bid precisely onto the provided scope checklist. Return ONLY raw JSON.';

function extractJson(raw: string): any {
  const t = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try { return JSON.parse(t); } catch { /* */ }
  const s = t.indexOf('{'); if (s < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = s; i < t.length; i++) { const ch = t[i]; if (esc) { esc = false; continue; } if (ch === '\\' && inStr) { esc = true; continue; } if (ch === '"') { inStr = !inStr; continue; } if (inStr) continue; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } } }
  return end < 0 ? null : (() => { try { return JSON.parse(t.slice(s, end + 1)); } catch { return null; } })();
}

const toCents = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI not configured' }, { status: 200 });

  let body: { text?: string; pdf?: string; scopeLines?: { id: string; description: string }[] };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const scopeLines = body.scopeLines || [];
  if (!body.text && !body.pdf) return Response.json({ error: 'Provide bid text or a PDF' }, { status: 400 });
  if (!scopeLines.length) return Response.json({ error: 'Define the scope checklist first' }, { status: 400 });

  const scopeList = scopeLines.map((s) => `- id "${s.id}": ${s.description}`).join('\n');
  const prompt = `Here is the GC's SCOPE CHECKLIST for this trade:
${scopeList}

Read the subcontractor bid below/attached and return, as JSON:
- "bidderName": the company name.
- "baseBidCents": the base/lump-sum bid in integer cents.
- "scope": one entry per checklist id above → {"scopeLineId": id, "status": "included|excluded|clarify", "valueCents": <if broken out, integer cents, else omit>}. Use "included" only if the bid clearly covers that line; "excluded" if explicitly excluded or clearly not covered; "clarify" if ambiguous/qualified.
- "alternates": [{"key":"ALT-1","description":"...","valueCents":<int>,"kind":"add|deduct"}] for any alternate/option prices.
- "clarifications": short strings for notable qualifications/exclusions.
Dollar amounts → integer cents (e.g. $12,500.00 → 1250000). Return ONLY the JSON object.`;

  const content: any[] = [];
  if (body.pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.pdf } });
  content.push({ type: 'text', text: prompt + (body.text ? `\n\nBID TEXT:\n${body.text}` : '') });

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content }] });
    const text = (resp.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('');
    const parsed = extractJson(text);
    if (!parsed) return Response.json({ error: 'Could not read the bid' }, { status: 200 });
    const valid = new Set(scopeLines.map((s) => s.id));
    const scope = (parsed.scope || []).filter((s: any) => s && valid.has(s.scopeLineId)).map((s: any) => ({
      scopeLineId: s.scopeLineId,
      status: ['included', 'excluded', 'clarify'].includes(s.status) ? s.status : 'clarify',
      ...(s.valueCents != null ? { valueCents: toCents(s.valueCents) } : {}),
    }));
    const alternates = (parsed.alternates || []).filter((a: any) => a && a.description).map((a: any, i: number) => ({
      key: a.key || `ALT-${i + 1}`, description: String(a.description), valueCents: toCents(a.valueCents), kind: a.kind === 'deduct' ? 'deduct' : 'add',
    }));
    return Response.json({ bidderName: parsed.bidderName || 'Subcontractor', baseBidCents: toCents(parsed.baseBidCents), scope, alternates, clarifications: parsed.clarifications || [] });
  } catch (err: any) {
    return apiError('bids/level-extract', err, "Extract failed", 200);
  }
}
