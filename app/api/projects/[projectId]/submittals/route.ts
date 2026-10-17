import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  // Role check, not just sign-in: Submittals: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Submittals', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('submittals')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ submittals: data ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/submittals] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/submittals', e, 'Failed to load submittals');
  }
}

/**
 * Create a submittal.
 *
 * Caller: app/field/submittals/page.tsx
 *   handleCreate() → POST multipart/form-data (online, with optional
 *     `attachment` file) or JSON (offline replay) with fields:
 *     title, description, spec_section, submittal_type, subcontractor,
 *     due_date, priority, linked_spec.
 *
 * submittals real columns used: title, description, spec_section,
 * submittal_type, subcontractor, due_date, priority, file_name, status,
 * created_by, project_id, tenant_id. `linked_spec` has no column and is dropped.
 * Binary attachments are not uploaded here (no storage helper in scope); the
 * file name is recorded in file_name when present.
 */
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Submittals', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  // Field page sends multipart/form-data (online) or JSON (offline replay).
  const body: Record<string, unknown> = {};
  let attachmentName: string | null = null;
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      const fd = await req.formData();
      fd.forEach((v, k) => {
        if (typeof v === 'string') body[k] = v;
        else if (v && typeof (v as File).name === 'string') attachmentName = (v as File).name;
      });
    } else {
      Object.assign(body, await req.json());
    }
  } catch { /* empty body */ }

  if (!body.title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    const record: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      title: body.title,
      description: body.description ?? null,
      spec_section: body.spec_section ?? null,
      submittal_type: body.submittal_type ?? null,
      subcontractor: body.subcontractor ?? null,
      due_date: (body.due_date as string) || null,
      priority: body.priority ?? null,
      status: (body.status as string) || 'pending',
      created_by: user.id,
    };
    if (attachmentName) record.file_name = attachmentName;

    const { data, error } = await supabase.from('submittals').insert(record as Database['public']['Tables']['submittals']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ submittal: data }, { status: 201 });
  } catch (e) {
    return apiError('projects/[projectId]/submittals POST', e);
  }
}
