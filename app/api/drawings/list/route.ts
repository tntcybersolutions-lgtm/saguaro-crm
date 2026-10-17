import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signFields } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Lists drawings for a project. Reads the canonical `drawings` table (uuid ids)
// that upload writes to and that markup/pins key off via drawing_id.
export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Documents: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('drawings')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .order('sheet_number', { ascending: true })
      .limit(1000);
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    // Normalize to the shape the mobile client expects (file_url / file_type /
    // title / revision), deriving a renderable file_type from the URL.
    const drawings = (data || []).map((d: Record<string, any>) => {
      const url = d.url || d.file_url || '';
      const isPdf = /\.pdf(\?|$)/i.test(url);
      return {
        ...d,
        file_url: url,
        file_type: d.file_type || (isPdf ? 'application/pdf' : 'image'),
        sheet_number: d.sheet_number || d.drawing_number || '',
        title: d.title || d.name || '',
        revision: d.revision || d.version || '',
      };
    });

    // drawings/project-files buckets are private — sign the file URLs on read.
    return NextResponse.json({ drawings: await signFields(drawings, ['file_url', 'url', 'thumbnail_url']) });
  } catch (e: unknown) {
    return apiError('drawings/list', e, "Couldn't load drawings");
  }
}
