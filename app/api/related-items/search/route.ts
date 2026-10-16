/**
 * GET /api/related-items/search?projectId=…&q=…&exclude=type:id
 * The "Add link" picker: records on one job, every type the person may see,
 * matched by number ("RFI 7", "#12", "A-101") or by words in the title.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { RELATED_TYPES, relatedNumber, relatedTitle, type RelatedHit } from '@/lib/related-items';
import { UUID_RE, permsFor, viewableTypes } from '@/lib/related-items-server';

export const dynamic = 'force-dynamic';

const PER_TYPE = 8;
const MAX = 40;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projectId = (req.nextUrl.searchParams.get('projectId') || '').toLowerCase();
  if (!UUID_RE.test(projectId)) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  const raw = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
  const exclude = (req.nextUrl.searchParams.get('exclude') || '').toLowerCase();

  try {
    const db = createServerClient();
    const { data: job, error: jobErr } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const perms = await permsFor(db, user, projectId);

    // PostgREST filter syntax: keep commas, parens and wildcards out of the pattern.
    const words = raw.replace(/[%,()*\\:]/g, ' ').replace(/\s+/g, ' ').trim();
    // "RFI #7", "co 12", "#3" → "7", "12", "3" for number matching.
    const numberText = words.replace(/^(rfi|submittal|co|change order|punch|pay app|meeting|po|sc|invoice|incident|permit|wbs)\s*/i, '').replace(/^#\s*/, '').trim();
    const numberInt = /^\d{1,9}$/.test(numberText) ? Number(numberText) : null;

    const lists = await Promise.all(viewableTypes(perms).map(async (type) => {
      const def = RELATED_TYPES[type];
      let q = db.from(def.table as never).select('*').eq('tenant_id', user.tenantId).eq('project_id', projectId);
      if (def.hasDeletedAt) q = q.is('deleted_at', null);
      if (words) {
        const ors = def.searchKeys.map((k) => `${k}.ilike.%${k === def.numberKey && numberText ? numberText : words}%`);
        if (def.numberKey && def.numberIsInt && numberInt !== null) ors.push(`${def.numberKey}.eq.${numberInt}`);
        q = q.or(ors.join(','));
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(PER_TYPE);
      if (error) throw error;
      return ((data || []) as Record<string, unknown>[])
        .filter((r) => `${type}:${String(r.id)}` !== exclude)
        .map((r): RelatedHit => ({
          type, id: String(r.id), noun: def.noun,
          number: relatedNumber(def, r), title: relatedTitle(def, r),
          status: def.statusKey ? ((r[def.statusKey] as string | null) ?? null) : null,
          statusModule: def.table,
        }));
    }));

    // Interleave so one busy type (50 schedule tasks) can't crowd out the rest.
    const out: RelatedHit[] = [];
    for (let i = 0; i < PER_TYPE && out.length < MAX; i++) {
      for (const l of lists) if (l[i] && out.length < MAX) out.push(l[i]);
    }
    return NextResponse.json({ items: out });
  } catch (e) {
    return apiError('related-items/search', e, "Couldn't search this job's records.");
  }
}
