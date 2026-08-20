import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { id } = await params;

    // Fetch the BIM model with tenant check
    const { data: model, error: modelErr } = await supabase
      .from('bim_models')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (modelErr || !model) {
      return NextResponse.json({ error: 'BIM model not found' }, { status: 404 });
    }

    // Count elements for this model
    const { count, error: countErr } = await supabase
      .from('bim_elements')
      .select('*', { count: 'exact', head: true })
      .eq('model_id', id)
      .eq('tenant_id', user.tenantId);

    if (countErr) {
      console.warn('[bim/get] element count error:', countErr.message);
    }

    return NextResponse.json({
      model,
      elementCount: count ?? 0,
    });
  } catch (err: unknown) {
    console.error('[bim/get]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch model' },
      { status: 500 },
    );
  }
}
