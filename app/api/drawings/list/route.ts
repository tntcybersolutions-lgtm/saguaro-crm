import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Lists drawings for a project. Reads the canonical `drawings` table (uuid ids)
// that upload writes to and that markup/pins key off via drawing_id.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ drawings: [] }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('drawings')
      .select('*')
      .eq('tenant_id', user.tenantId)
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

    return NextResponse.json({ drawings });
  } catch {
    return NextResponse.json({ drawings: [] }, { status: 500 });
  }
}
