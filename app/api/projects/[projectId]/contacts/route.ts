import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[projectId]/contacts
 * Returns project contacts for the assignee picker in
 * app/field/warranty-claims/page.tsx. The page's ContactInfo shape is
 * { name, email?, phone?, company? }.
 *
 * Source priority: project_contacts (richest) -> contacts -> project_team.
 * Scoped by tenant_id where the column exists.
 */

interface ContactRow {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_mobile?: string | null;
  phone_office?: string | null;
  company?: string | null;
  role?: string | null;
}

function normalize(rows: ContactRow[] | null | undefined) {
  return (rows ?? [])
    .filter((r) => r && (r.name || r.email))
    .map((r) => ({
      name: r.name || '',
      email: r.email || undefined,
      phone: r.phone || r.phone_mobile || r.phone_office || undefined,
      company: r.company || undefined,
    }));
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();

    // Primary: project_contacts (has tenant_id, name, email, phone_*, company).
    const pc = await supabase
      .from('project_contacts')
      .select('name, email, phone, phone_mobile, phone_office, company, role')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true });
    if (!pc.error && pc.data && pc.data.length > 0) {
      return NextResponse.json({ contacts: normalize(pc.data as ContactRow[]) });
    }

    // Fallback: contacts table.
    const c = await supabase
      .from('contacts')
      .select('name, email, phone, company, role')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true });
    if (!c.error && c.data && c.data.length > 0) {
      return NextResponse.json({ contacts: normalize(c.data as ContactRow[]) });
    }

    // Last resort: project_team (no email/phone/company guaranteed).
    const t = await supabase
      .from('project_team')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true });
    if (!t.error && t.data) {
      return NextResponse.json({ contacts: normalize(t.data as ContactRow[]) });
    }

    return NextResponse.json({ contacts: [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/contacts] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/contacts', e, 'Failed to load contacts');
  }
}

/**
 * Add or update one directory entry.
 *
 * The route was read-only, so the only names a project could ever hold were
 * the two seeded at creation. Everyone else on the job — engineer, PM,
 * superintendent, inspector — had nowhere to live, which is why the same
 * details get retyped into every contract and RFI.
 */
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

    const db = createServerClient();

    /* The project must be this tenant's before anything is written against
       it — projectId comes straight off the URL. */
    const { data: project } = await db
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const row = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      name,
      role: String(body.role || '').trim() || null,
      contact_type: String(body.role || 'contact').trim().toLowerCase(),
      company: String(body.company || '').trim() || null,
      email: String(body.email || '').trim() || null,
      phone: String(body.phone || '').trim() || null,
      is_active: true,
    };

    if (body.id) {
      const { error } = await db
        .from('project_contacts')
        .update(row as never)
        .eq('id', String(body.id))
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
      return NextResponse.json({ success: true, id: body.id });
    }

    const { data, error } = await db
      .from('project_contacts')
      .insert(row as never)
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, id: (data as { id: string } | null)?.id ?? null });
  } catch (e) {
    return apiError('projects/contacts', e, 'Could not save that contact.');
  }
}
