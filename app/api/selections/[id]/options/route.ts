import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { signFields } from '@/lib/storage-signing';
import { optionPrice } from '@/lib/selection-math';

export const dynamic = 'force-dynamic';

/**
 * /api/selections/[id]/options — the choices the GC offers the client for one
 * selection (public.selection_options, selection_id = the selection). The
 * client sees them in the portal and picks one (lib/selection-pick).
 *
 * selection_options has no tenant_id: every call first proves the selection
 * is this tenant's, and only then touches its options.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ownSelection(db: any, tenantId: string, id: string) {
  const { data, error } = await db.from('selections').select('id, project_id, allowance').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return data as { id: string; project_id: string; allowance: unknown } | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const sel = await ownSelection(g.db, g.user.tenantId, id);
    if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 });
    const { data, error } = await g.db
      .from('selection_options')
      .select('*')
      .eq('selection_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    const options = await signFields((data || []) as Array<Record<string, unknown>>, ['image_url'], 3600, { strict: false });
    return NextResponse.json({ options: options.map((o) => ({ ...o, price: optionPrice(o) })) });
  } catch (e) {
    return apiError('selections/options', e, 'Could not load the options.');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const price = Number(body.price);
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: 'price is required' }, { status: 400 });
    const sel = await ownSelection(g.db, g.user.tenantId, id);
    if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 });

    const { count } = await g.db.from('selection_options').select('id', { count: 'exact', head: true }).eq('selection_id', id);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const { data, error } = await g.db
      .from('selection_options')
      .insert({
        selection_id: id,
        name,
        description: str(body.description),
        manufacturer: str(body.manufacturer),
        model_number: str(body.model_number ?? body.model),
        color: str(body.color),
        finish: str(body.finish),
        unit_cost: price,
        quantity: 1,
        total_cost: price,
        image_url: str(body.image_url),
        spec_url: str(body.spec_url ?? body.link),
        is_recommended: body.is_recommended === true,
        sort_order: (count || 0) + 1,
      })
      .select()
      .single();
    if (error) throw error;
    const [signed] = await signFields([data as Record<string, unknown>], ['image_url'], 3600, { strict: false });
    return NextResponse.json({ option: { ...signed, price: optionPrice(signed) } });
  } catch (e) {
    return apiError('selections/options', e, 'Could not add the option.');
  }
}
