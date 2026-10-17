import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

/**
 * GET /api/materials/selections?customer_id=xxx&project_id=yyy&category=flooring
 * List material_selections with optional filters.
 */
export async function GET(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: View, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'View');
    if (!g.ok) return g.res;
    const user = g.user;

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customer_id');
    const projectId = searchParams.get('project_id');
    const category = searchParams.get('category');

    if (!customerId && !projectId) {
      return NextResponse.json(
        { error: 'customer_id or project_id is required' },
        { status: 400 },
      );
    }

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('material_selections')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (customerId) query = query.eq('customer_id', customerId);
    if (projectId) query = query.eq('project_id', projectId);
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ selections: data || [] });
  } catch (e) {
    return apiError('materials/selections GET', e);
  }
}

/**
 * POST /api/materials/selections
 * Create a material selection.
 */
export async function POST(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: Edit, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json();
    const db = createServerClient();

    const allowed = [
      'customer_id', 'project_id', 'category', 'product_name', 'brand',
      'model_number', 'color', 'finish', 'image_url', 'supplier',
      'unit_price', 'unit', 'quantity', 'total_price', 'lead_time_days',
      'csi_code', 'notes', 'selected', 'room',
    ];
    const fields: Record<string, unknown> = { tenant_id: user.tenantId };
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    if (!fields.category || !fields.product_name) {
      return NextResponse.json(
        { error: 'category and product_name are required' },
        { status: 400 },
      );
    }

    const { data, error } = await db
      .from('material_selections')
      .insert(fields as Database['public']['Tables']['material_selections']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ selection: data }, { status: 201 });
  } catch (e) {
    return apiError('materials/selections POST', e);
  }
}

/**
 * PATCH /api/materials/selections
 * Update a material selection. Body must include { id }.
 */
export async function PATCH(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: Edit, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const allowed = [
      'category', 'product_name', 'brand', 'model_number', 'color', 'finish',
      'image_url', 'supplier', 'unit_price', 'unit', 'quantity', 'total_price',
      'lead_time_days', 'csi_code', 'notes', 'selected', 'room',
    ];
    const fields: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    const { data, error } = await db
      .from('material_selections')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ selection: data });
  } catch (e) {
    return apiError('materials/selections PATCH', e);
  }
}

/**
 * DELETE /api/materials/selections
 * Delete a material selection. Body must include { id }.
 */
export async function DELETE(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: Full, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'Full');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { error } = await db
      .from('material_selections')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('materials/selections DELETE', e);
  }
}
