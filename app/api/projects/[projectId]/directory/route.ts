import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
import { signFields } from '@/lib/storage-signing';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('name');
    /* This used to answer a failed contacts read by reading project_team
       instead and returning 200. That was an error handler, not a "no rows
       here, look there" design: an empty contacts table returned [] and never
       reached it. So a real failure showed the job's signed-in team members as
       if they were its directory (owner, architect, engineers), and the
       project_team read's own error was dropped, which could turn a failure
       into an empty directory. The directory is contacts; a failed read is an
       error the page shows with a retry. */
    if (error) throw error;
    const contacts = (data || []) as Record<string, any>[];

    /* Faces and companies — read-only extras, each tenant-scoped and each
       non-fatal: a failed lookup leaves a monogram, never an error page.
         avatar_url  the profile photo of a contact who also signs in (by email)
         trade       the sub's trade when the contact's company is a sub on the job
         companies   the job's subcontractors, so a sub with no contact yet
                     still appears under its own name with its trade */
    const emails = Array.from(new Set(contacts.map((c) => String(c.email || '').trim().toLowerCase()).filter(Boolean)));
    const [profRes, subRes] = await Promise.all([
      emails.length
        ? supabase.from('profiles').select('email, avatar_url').eq('tenant_id', user.tenantId).in('email', emails)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('project_subcontractors')
        .select('id, subcontractor_id, status, subcontractors(company_name, trade, email, contact_email, contact_name, contact_phone, phone)')
        .eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
    ]);
    if (profRes.error) console.error('[directory GET] profiles lookup failed', profRes.error);
    if (subRes.error) console.error('[directory GET] project_subcontractors lookup failed', subRes.error);
    const withPhoto = ((profRes.data || []) as Record<string, any>[]).filter((p) => p.avatar_url);
    const signed = withPhoto.length ? await signFields(withPhoto, ['avatar_url'], 3600, { strict: false }) : [];
    const photoByEmail = new Map(signed.filter((p) => p.email && p.avatar_url).map((p) => [String(p.email).toLowerCase(), String(p.avatar_url)]));
    const companies = ((subRes.data || []) as Record<string, any>[])
      .map((r) => {
        const s = (r.subcontractors || {}) as Record<string, any>;
        const name = String(s.company_name || '').trim();
        if (!name) return null;
        return {
          id: String(r.subcontractor_id || r.id),
          name,
          trade: s.trade || null,
          email: s.contact_email || s.email || null,
          phone: s.contact_phone || s.phone || null,
          contactName: s.contact_name || null,
          status: r.status || null,
          kind: 'sub' as const,
        };
      })
      .filter(Boolean);
    const tradeByCompany = new Map(companies.filter((c) => c && c.trade).map((c) => [c!.name.toLowerCase(), String(c!.trade)]));
    const enriched = contacts.map((c) => ({
      ...c,
      avatar_url: (c.email && photoByEmail.get(String(c.email).trim().toLowerCase())) || null,
      trade: (c.company && tradeByCompany.get(String(c.company).trim().toLowerCase())) || null,
    }));
    return NextResponse.json({ contacts: enriched, companies });
  } catch (e) {
    return apiError('projects/projectId/directory', e, 'Could not load the job directory. Please try again.');
  }
}

/* Blank and whitespace-only become null, the same as PATCH, so an Add and an
   Edit of the same person store the same thing. */
const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  /* projectId comes from the URL: the guard checks the job is this company's
     (404 otherwise) and applies job-level grants, the same as PATCH/DELETE.
     Without it a contact could be filed against another company's job id. */
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the contact as JSON: name, role, company, email, phone' }, { status: 400 });
    }
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const supabase = createServerClient();
    // Whitelist to REAL contacts columns (id, tenant_id, project_id, name, role,
    // company, phone, email, created_at). The previous version spread ...body (which
    // includes non-columns: type/title/company_id/role_on_project/permission_role/
    // address/insurance_expiry/member_ids), omitted tenant_id, and set created_by
    // (which doesn't exist on contacts) — so EVERY insert failed and the swallow
    // returned a fake `dir-…` id (contacts has 0 rows in prod).
    const record: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      name: String(body.name).trim(),
      role: clean(body.role ?? body.title ?? body.role_on_project),
      company: clean(body.company),
      phone: clean(body.phone),
      email: clean(body.email),
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('contacts').insert(record as never).select().single();
    // Never fabricate a fake `dir-…` id — surface the real DB error instead.
    // apiError logs the real error with a reference id.
    if (error) return apiError('projects/projectId/directory', error, "Couldn't add that contact. Please try again.", 500);
    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (e) {
    return apiError('projects/projectId/directory POST', e, "Couldn't add that contact. Please try again.");
  }
}
