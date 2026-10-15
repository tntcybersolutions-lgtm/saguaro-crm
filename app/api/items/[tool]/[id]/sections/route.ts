/**
 * Daily log sections — all 20 (lib/daily-log-sections).
 *   GET  /api/items/daily_logs/:id/sections            every section's rows
 *   PUT  /api/items/daily_logs/:id/sections  { section, rows }   save one section
 *   POST /api/items/daily_logs/:id/sections  { copyFrom: 'previous', sections: [...] }
 *        copy those sections from this job's most recent earlier log
 * A section the log never saved here shows the data the older daily-log screen
 * stored in its own columns, so nothing already logged disappears.
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadItem } from '@/lib/items/server';
import { apiError } from '@/lib/api-error';
import { LOG_SECTIONS, logSection, cleanRows, mirrorColumns, rowsFromLegacy, type SectionRow } from '@/lib/daily-log-sections';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ tool: string; id: string }> };

function sectionsOf(log: Record<string, unknown>): Record<string, SectionRow[]> {
  const saved = (log.log_sections && typeof log.log_sections === 'object' ? log.log_sections : {}) as Record<string, SectionRow[]>;
  const out: Record<string, SectionRow[]> = {};
  for (const sec of LOG_SECTIONS) {
    if (sec.photos) continue;
    out[sec.key] = Array.isArray(saved[sec.key]) ? saved[sec.key] : rowsFromLegacy(sec.key, log);
  }
  return out;
}

export async function GET(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  if (type !== 'daily_logs') return NextResponse.json({ error: 'Only daily logs have sections' }, { status: 404 });
  const l = await loadItem(req, type, id, 'View');
  if (!l.ok) return l.res;
  return NextResponse.json({ sections: sectionsOf(l.item) });
}

export async function PUT(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  if (type !== 'daily_logs') return NextResponse.json({ error: 'Only daily logs have sections' }, { status: 404 });
  const l = await loadItem(req, type, id, 'Edit');
  if (!l.ok) return l.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { section?: string; rows?: unknown };
    const sec = logSection(String(body.section || ''));
    if (!sec || sec.photos) return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
    const cleaned = cleanRows(sec, body.rows);
    if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const current = (l.item.log_sections && typeof l.item.log_sections === 'object' ? l.item.log_sections : {}) as Record<string, unknown>;
    const patch = {
      log_sections: { ...current, [sec.key]: cleaned.rows },
      ...mirrorColumns(sec.key, cleaned.rows),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await l.db.from('daily_logs').update(patch as never).eq('id', id).eq('tenant_id', l.user.tenantId).select('*').single();
    if (error) throw error;
    return NextResponse.json({ rows: cleaned.rows, item: data });
  } catch (e) {
    return apiError('items/daily_logs/sections', e, "Couldn't save that section.");
  }
}

export async function POST(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  if (type !== 'daily_logs') return NextResponse.json({ error: 'Only daily logs have sections' }, { status: 404 });
  const l = await loadItem(req, type, id, 'Edit');
  if (!l.ok) return l.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { copyFrom?: string; sections?: string[] };
    if (body.copyFrom !== 'previous') return NextResponse.json({ error: 'Nothing to do' }, { status: 400 });
    const keys = (Array.isArray(body.sections) ? body.sections : []).filter((k) => { const s = logSection(k); return s && !s.photos; });
    if (!keys.length) return NextResponse.json({ error: 'Pick the sections to copy.' }, { status: 400 });
    const { data: prev, error: pErr } = await l.db.from('daily_logs').select('*')
      .eq('tenant_id', l.user.tenantId).eq('project_id', l.item.project_id as string)
      .is('deleted_at', null).lt('log_date', l.item.log_date as string)
      .order('log_date', { ascending: false }).limit(1).maybeSingle();
    if (pErr) throw pErr;
    if (!prev) return NextResponse.json({ error: 'No earlier daily log on this job to copy from.' }, { status: 404 });
    const from = sectionsOf(prev as Record<string, unknown>);
    const current = (l.item.log_sections && typeof l.item.log_sections === 'object' ? l.item.log_sections : {}) as Record<string, unknown>;
    let patch: Record<string, unknown> = { log_sections: { ...current } };
    for (const k of keys) {
      (patch.log_sections as Record<string, unknown>)[k] = from[k] || [];
      patch = { ...patch, ...mirrorColumns(k, from[k] || []) };
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await l.db.from('daily_logs').update(patch as never).eq('id', id).eq('tenant_id', l.user.tenantId).select('*').single();
    if (error) throw error;
    return NextResponse.json({ sections: sectionsOf(data as Record<string, unknown>), copiedFrom: (prev as { log_date: string }).log_date });
  } catch (e) {
    return apiError('items/daily_logs/sections', e, "Couldn't copy from the earlier log.");
  }
}
