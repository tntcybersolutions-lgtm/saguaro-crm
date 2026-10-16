import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/recommendations?customer_id=xxx&accepted=true&category=energy
 * List customer_recommendations by customer_id with optional filters.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customer_id');
    const accepted = searchParams.get('accepted');
    const rejected = searchParams.get('rejected');
    const category = searchParams.get('category');

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('customer_recommendations')
      .select('*')
      .eq('customer_id', customerId)
      .eq('tenant_id', user.tenantId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (accepted !== null) query = query.eq('accepted', accepted === 'true');
    if (rejected !== null) query = query.eq('rejected', rejected === 'true');
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ recommendations: data || [] });
  } catch (e) {
    return apiError('recommendations GET', e);
  }
}

/**
 * PATCH /api/recommendations
 * Accept or reject a recommendation.
 * Body: { id, accepted?: boolean, rejected?: boolean, added_to_estimate?: boolean }
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const fields: Record<string, unknown> = {};
    if (body.accepted !== undefined) fields.accepted = body.accepted;
    if (body.rejected !== undefined) fields.rejected = body.rejected;
    if (body.added_to_estimate !== undefined) fields.added_to_estimate = body.added_to_estimate;

    const { data, error } = await db
      .from('customer_recommendations')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ recommendation: data });
  } catch (e) {
    return apiError('recommendations PATCH', e);
  }
}
