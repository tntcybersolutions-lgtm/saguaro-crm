import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * One person in a job's directory (`contacts` row).
 *   PATCH  — edit name / role / company / email / phone
 *   DELETE — take them off this job's directory
 *
 * The directory had create and list only, so a misspelled owner or a changed
 * phone number could not be fixed — and every contract, RFI and pay app reads
 * these names. Tenant AND project scoped on every query: the ids come from the
 * URL, so they are checked, never trusted.
 */

type Ctx = { params: Promise<{ projectId: string; contactId: string }> };

/** The editable `contacts` columns (id/tenant_id/project_id/created_at are not). */
const EDITABLE = ['name', 'role', 'company', 'email', 'phone'] as const;

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, contactId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, string | null> = {};
    for (const k of EDITABLE) {
      if (body[k] !== undefined) updates[k] = clean(body[k]);
    }
    if ('name' in updates && !updates.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update — send name, role, company, email or phone' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('contacts')
      .update(updates as never)
      .eq('id', contactId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json({ contact: data });
  } catch (e) {
    return apiError('projects/projectId/directory/contactId PATCH', e, 'Could not save that contact');
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { projectId, contactId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json({ success: true, id: contactId });
  } catch (e) {
    return apiError('projects/projectId/directory/contactId DELETE', e, 'Could not remove that contact');
  }
}
