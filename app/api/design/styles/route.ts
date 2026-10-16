import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

// Public endpoint — no auth required
export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const category = req.nextUrl.searchParams.get('category');

    let query = db.from('design_style_presets')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (e) {
    return apiError('design/styles GET', e, 'Failed to load styles');
  }
}
