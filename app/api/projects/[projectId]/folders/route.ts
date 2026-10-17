import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError, apiFail } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The project's filing structure.
 *
 * Folders used to exist only where a file happened to be sitting in one, so a
 * new project's Files screen was a void — no shape, no indication of where a
 * drawing or a permit was supposed to go. A template lays these down empty at
 * creation, and this is how the screen reads them back.
 *
 * GET  — the seeded folders, in the order the template set.
 * POST — add one by hand, because a filing structure nobody can extend is a
 *        worse cage than no structure at all.
 */

type FolderRow = { id: string; name: string; sort_order: number | null; seeded_from: string | null };

/** project_folders is newer than the checked-in generated types. */
function folders(db: ReturnType<typeof createServerClient>) {
  return (db as unknown as {
    from: (t: string) => {
      select: (c: string) => any;
      insert: (rows: unknown[]) => any;
    };
  }).from('project_folders');
}

async function ownsProject(db: ReturnType<typeof createServerClient>, projectId: string, tenantId: string) {
  const { data } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    if (!(await ownsProject(db, params.projectId, user.tenantId))) return apiFail('Project not found', 404);

    // audit-column-refs: project_folders
    const { data, error } = await folders(db)
      .select('id, name, sort_order, seeded_from')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ folders: (data ?? []) as FolderRow[] });
  } catch (e) {
    return apiError('projects/folders', e, 'Could not load the project folders.');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const gate = await requirePermission(req, 'Documents', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return apiFail('A folder name is required', 400);

    const db = createServerClient();
    if (!(await ownsProject(db, params.projectId, user.tenantId))) return apiFail('Project not found', 404);

    const { error } = await folders(db).insert([{
      tenant_id: user.tenantId,
      project_id: params.projectId,
      name,
      sort_order: Number(body.sortOrder) || 999,
    }]);

    /* UNIQUE (project_id, name) — asking for a folder that is already there is
       not a failure, it is the state the caller wanted. */
    if (error && (error as { code?: string }).code !== '23505') throw error;

    return NextResponse.json({ success: true, name });
  } catch (e) {
    return apiError('projects/folders', e, 'Could not add the folder.');
  }
}
