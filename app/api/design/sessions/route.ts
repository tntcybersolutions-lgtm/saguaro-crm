import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/design/sessions?customer_id=xxx
 * List design_sessions for a customer.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customer_id');
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('design_sessions')
      .select('*')
      .eq('customer_id', customerId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ sessions: data || [] });
  } catch (e) {
    return apiError('design/sessions GET', e);
  }
}

/**
 * POST /api/design/sessions
 * Create a new design session with original_photo_url, room_type, design_style.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { customer_id, original_photo_url, room_type, design_style, custom_instructions } = body;

    if (!customer_id || !original_photo_url || !room_type || !design_style) {
      return NextResponse.json(
        { error: 'customer_id, original_photo_url, room_type, and design_style are required' },
        { status: 400 },
      );
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('design_sessions')
      .insert({
        tenant_id: user.tenantId,
        customer_id,
        original_photo_url,
        room_type,
        design_style,
        custom_instructions: custom_instructions || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ session: data }, { status: 201 });
  } catch (e) {
    return apiError('design/sessions POST', e);
  }
}
