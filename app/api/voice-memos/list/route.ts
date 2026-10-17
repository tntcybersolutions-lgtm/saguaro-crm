import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: View, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'View');
    if (!g.ok) return g.res;
    const user = g.user;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    const itemType = searchParams.get('item_type');
    const itemId = searchParams.get('item_id');

    const db = createServerClient();
    let query = db
      .from('voice_memos')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (itemType) query = query.eq('item_type', itemType);
    if (itemId) query = query.eq('item_id', itemId);

    const { data, error } = await query;

    if (error) {
      return apiError('voice-memos/list', error, 'Failed to list voice memos');
    }

    return NextResponse.json({ memos: data || [] });
  } catch (err: any) {
    return apiError('voice-memos/list', err, 'Internal server error');
  }
}
