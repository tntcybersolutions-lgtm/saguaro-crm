import { NextRequest, NextResponse } from 'next/server';

const DEMO_BUDGET_LINES = [
  { id: 'bl-01', cost_code: '01-000', description: 'General Conditions', category: 'General', original_budget: 128000, approved_cos: 4500, revised_budget: 132500, committed_cost: 132500, actual_cost: 41200, pct_complete: 31, forecast_cost: 132500 },
  { id: 'bl-02', cost_code: '03-300', description: 'Cast-in-Place Concrete', category: 'Structure', original_budget: 215000, approved_cos: 0, revised_budget: 215000, committed_cost: 215000, actual_cost: 215000, pct_complete: 100, forecast_cost: 215000 },
  { id: 'bl-03', cost_code: '05-120', description: 'Structural Steel', category: 'Structure', original_budget: 380000, approved_cos: 12000, revised_budget: 392000, committed_cost: 392000, actual_cost: 286000, pct_complete: 73, forecast_cost: 395000 },
  { id: 'bl-04', cost_code: '06-100', description: 'Rough Carpentry & Framing', category: 'Carpentry', original_budget: 92000, approved_cos: 0, revised_budget: 92000, committed_cost: 88500, actual_cost: 44200, pct_complete: 48, forecast_cost: 91000 },
  { id: 'bl-05', cost_code: '07-200', description: 'Insulation & Air Barrier', category: 'Envelope', original_budget: 64000, approved_cos: 0, revised_budget: 64000, committed_cost: 64000, actual_cost: 0, pct_complete: 0, forecast_cost: 64000 },
  { id: 'bl-06', cost_code: '09-900', description: 'Painting & Wall Finishes', category: 'Finishes', original_budget: 78000, approved_cos: 3200, revised_budget: 81200, committed_cost: 78000, actual_cost: 0, pct_complete: 0, forecast_cost: 81200 },
  { id: 'bl-07', cost_code: '22-000', description: 'Plumbing Systems', category: 'MEP', original_budget: 185000, approved_cos: 6800, revised_budget: 191800, committed_cost: 191800, actual_cost: 62400, pct_complete: 33, forecast_cost: 194000 },
  { id: 'bl-08', cost_code: '26-000', description: 'Electrical Systems', category: 'MEP', original_budget: 220000, approved_cos: 8500, revised_budget: 228500, committed_cost: 228500, actual_cost: 78200, pct_complete: 34, forecast_cost: 228500 },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from('budget_lines')
      .select('*')
      .eq('project_id', params.projectId)
      .order('cost_code', { ascending: true });
    if (error || !data?.length) throw new Error(error?.message || 'No data');
    return NextResponse.json({ lines: data });
  } catch {
    return NextResponse.json({
      lines: DEMO_BUDGET_LINES.map(l => ({ ...l, project_id: params.projectId })),
      demo: true,
    });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    const record = { ...body, project_id: params.projectId };
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.from('budget_lines').insert(record).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, line: data });
  } catch (err: any) {
    console.error('[budget/POST] error:', err?.message);
    const budget = (body.original_budget as number) || 0;
    return NextResponse.json({
      success: true,
      line: {
        id: Date.now().toString(),
        project_id: params.projectId,
        cost_code: body.cost_code || '',
        description: body.description || '',
        original_budget: budget,
        approved_cos: 0,
        revised_budget: budget,
        committed_cost: 0,
        actual_cost: 0,
        pct_complete: 0,
        forecast_cost: budget,
        category: 'Other',
        created_at: new Date().toISOString(),
      },
      demo: true,
    });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    const { id, ...updates } = body;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase
      .from('budget_lines')
      .update(updates)
      .eq('id', id as string)
      .eq('project_id', params.projectId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[budget/PATCH] error:', err?.message);
    return NextResponse.json({ success: true, demo: true });
  }
}
