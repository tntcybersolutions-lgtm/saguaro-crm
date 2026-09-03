import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/inspections/templates  -> { templates: [...] }
// Returns this tenant's templates plus any global ones, mapping the jsonb
// `items` column to the `checklist_items` the mobile wizard expects.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ templates: [] }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('inspection_templates')
      .select('*')
      .or(`tenant_id.eq.${user.tenantId},is_global.eq.true`)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const templates = (data || []).map((t: Record<string, any>) => {
      const ci =
        (Array.isArray(t.checklist_items) && t.checklist_items.length ? t.checklist_items : null) ??
        (Array.isArray(t.items) && t.items.length ? t.items : null) ??
        t.fields ??
        [];
      return { ...t, checklist_items: ci };
    });
    return NextResponse.json({ templates });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('inspections/templates', e);
  }
}
