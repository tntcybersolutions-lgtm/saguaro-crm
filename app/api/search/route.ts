import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/search?q=… — one search across the things a rep looks for:
 * leads/deals, jobs, customers, and photos. Tenant-scoped on every table.
 *
 * Documents are deliberately NOT searched yet: that table carries no tenant_id
 * (and no project_id) in this schema, so there is no safe way to scope it here
 * without risking one tenant's search returning another's files. It is left out
 * until a tenant-scoped join exists — an honest omission beats a leak.
 *
 * `q` is sanitised before it goes anywhere near a PostgREST `.or()` filter:
 * commas, parentheses and the % wildcard would otherwise let the query string
 * be rewritten. We strip them and bound the length; the match is a plain
 * case-insensitive contains.
 */
export const dynamic = 'force-dynamic';

type Hit = { type: 'lead' | 'job' | 'customer' | 'photo'; id: string; label: string; sub?: string; href: string };

const clean = (raw: string) => raw.replace(/[%,()*\\]/g, ' ').trim().slice(0, 64);

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = clean(new URL(req.url).searchParams.get('q') || '');
  if (q.length < 2) return NextResponse.json({ q, results: [] });

  try {
    const db = createServerClient();
    const t = user.tenantId;
    const like = `%${q}%`;
    const L = 6;

    const [leads, jobs, customers, photos] = await Promise.all([
      db.from('lead_pipeline').select('id, company_name, contact_name, stage')
        .eq('tenant_id', t).or(`company_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`).limit(L),
      db.from('projects').select('id, name, status')
        .eq('tenant_id', t).ilike('name', like).limit(L),
      db.from('customer_profiles').select('id, name, email')
        .eq('tenant_id', t).or(`name.ilike.${like},email.ilike.${like}`).limit(L),
      db.from('photos').select('id, caption, filename, title, project_id')
        .eq('tenant_id', t).or(`caption.ilike.${like},filename.ilike.${like},title.ilike.${like}`).limit(L),
    ]);

    const results: Hit[] = [];
    for (const r of (leads.data ?? []) as any[]) {
      results.push({ type: 'lead', id: String(r.id), label: r.company_name || r.contact_name || 'Lead', sub: r.stage || undefined, href: `/app/leads/${r.id}` });
    }
    for (const r of (jobs.data ?? []) as any[]) {
      results.push({ type: 'job', id: String(r.id), label: r.name || 'Job', sub: r.status || undefined, href: `/app/projects/${r.id}` });
    }
    for (const r of (customers.data ?? []) as any[]) {
      results.push({ type: 'customer', id: String(r.id), label: r.name || r.email || 'Customer', sub: r.email || undefined, href: '/app/customers' });
    }
    for (const r of (photos.data ?? []) as any[]) {
      results.push({
        type: 'photo', id: String(r.id), label: r.caption || r.title || r.filename || 'Photo',
        sub: 'photo', href: r.project_id ? `/app/projects/${r.project_id}/photos` : '/app/projects',
      });
    }

    return NextResponse.json({ q, results });
  } catch (e) {
    return apiError('search', e, 'Search failed');
  }
}
