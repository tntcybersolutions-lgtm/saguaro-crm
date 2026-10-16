import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('prequalification_templates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('prequalification/templates GET', e);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();

    // Build a row from ONLY real columns. The builder UI sends `threshold` and
    // `requiredDocs` (camelCase) as first-class template fields — previously the
    // allowlist dropped both, so every save silently lost the passing threshold
    // and the required-document list. Map them onto their real columns.
    const row: Record<string, any> = {};
    if (body.name !== undefined) row.name = body.name;
    if (body.description !== undefined) row.description = body.description ?? null;
    if (body.questions !== undefined) row.questions = body.questions ?? [];
    if (body.scoring_criteria !== undefined) row.scoring_criteria = body.scoring_criteria;
    if (body.is_default !== undefined) row.is_default = !!body.is_default;
    if (body.threshold !== undefined) row.threshold = body.threshold;
    const reqDocs = body.required_docs ?? body.requiredDocs;
    if (reqDocs !== undefined) row.required_docs = reqDocs ?? [];

    // The builder sends a real DB uuid when editing an existing template and a
    // synthetic `tpl-xxxx` id when creating a new one. Previously the route
    // ignored `id` entirely and ALWAYS inserted — editing a template created a
    // duplicate row while the original was left untouched. Update in place when
    // the id is a real uuid (tenant-scoped).
    if (typeof body.id === 'string' && UUID_RE.test(body.id)) {
      const { data, error } = await db
        .from('prequalification_templates')
        .update(row as Database['public']['Tables']['prequalification_templates']['Update'])
        .eq('id', body.id)
        .eq('tenant_id', user.tenantId)
        .select()
        .single();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      return NextResponse.json({ data });
    }

    const { data, error } = await db
      .from('prequalification_templates')
      .insert({ ...row, tenant_id: user.tenantId } as Database['public']['Tables']['prequalification_templates']['Insert'])
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return apiError('prequalification/templates POST', e);
  }
}
