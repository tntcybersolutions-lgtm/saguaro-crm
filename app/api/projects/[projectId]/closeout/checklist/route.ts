import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

// Persistence for the fixed project-closeout CHECKLIST (the 12 binary
// complete/incomplete items on app/app/projects/[projectId]/closeout/page.tsx).
//
// This is deliberately SEPARATE from the rich `closeout` items table (shared
// with app/field/closeout): that table requires item_type + title (NOT NULL)
// and uses uuid row ids, so the checklist's fixed string ids ('final_pay_app',
// …) could never round-trip through it — the old code POSTed {items:[...]} to
// the items endpoint, which 500'd on the NOT NULL columns and silently lost the
// checkbox state on every reload. Here the checklist lives in projects.metadata.

type ChecklistEntry = { id: string; status: 'complete' | 'incomplete' };

function readChecklist(metadata: unknown): ChecklistEntry[] {
  const m = (metadata && typeof metadata === 'object') ? (metadata as Record<string, unknown>) : {};
  const raw = m.closeout_checklist;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e): ChecklistEntry => ({
      id: String((e as Record<string, unknown>).id ?? ''),
      status: (e as Record<string, unknown>).status === 'complete' ? 'complete' : 'incomplete',
    }))
    .filter((e) => e.id);
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase
      .from('projects')
      .select('id, metadata')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ items: readChecklist((project as { metadata: unknown }).metadata) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/closeout/checklist] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/closeout/checklist', e, 'Failed to load items');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body.items) ? body.items : null;
    if (!incoming) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }
    const items: ChecklistEntry[] = incoming
      .filter((e: unknown): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e: Record<string, unknown>): ChecklistEntry => ({
        id: String(e.id ?? ''),
        status: e.status === 'complete' ? 'complete' : 'incomplete',
      }))
      .filter((e: ChecklistEntry) => e.id);

    // Read-merge-write so only the closeout_checklist key changes.
    const { data: project, error: readErr } = await supabase
      .from('projects')
      .select('id, metadata')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (readErr || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const meta = ((project as { metadata: unknown }).metadata && typeof (project as { metadata: unknown }).metadata === 'object')
      ? { ...((project as { metadata: Record<string, unknown> }).metadata) }
      : {};
    meta.closeout_checklist = items;

    const { error } = await supabase
      .from('projects')
      .update({ metadata: meta as never })
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true, items });
  } catch (err: unknown) {
    return apiError('projects/[projectId]/closeout/checklist POST', err);
  }
}
