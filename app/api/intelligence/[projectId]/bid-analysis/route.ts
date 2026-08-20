import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('bid_analytics')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('division_code', { ascending: true });

    if (error) throw error;

    // If no analytics, generate from budget
    if (!data || data.length === 0) {
      const { data: budget } = await db
        .from('budget_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId);

      if (budget && budget.length > 0) {
        // Group by CSI division
        const divisions: Record<string, { budget: number; actual: number; count: number }> = {};
        for (const item of budget) {
          const code = (item.cost_code || item.division || '00').substring(0, 2);
          const divName = CSI_DIVISIONS[code] || `Division ${code}`;
          if (!divisions[code]) divisions[code] = { budget: 0, actual: 0, count: 0 };
          divisions[code].budget += Number(item.budget_amount) || 0;
          divisions[code].actual += Number(item.actual_cost) || Number(item.committed_cost) || 0;
          divisions[code].count++;
        }

        const rows = Object.entries(divisions).map(([code, d]) => ({
          division_code: code,
          division_name: CSI_DIVISIONS[code] || `Division ${code}`,
          budget_amount: d.budget,
          actual_amount: d.actual,
          bid_amount: d.budget * (0.95 + Math.random() * 0.1), // simulate
          variance_pct: d.budget > 0 ? ((d.budget - d.actual) / d.budget * 100) : 0,
          accuracy_score: d.budget > 0 ? Math.max(0, 100 - Math.abs((d.budget - d.actual) / d.budget * 100)) : 100,
          bid_count: d.count,
        }));

        return NextResponse.json({ data: rows, generated: true });
      }

      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

const CSI_DIVISIONS: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics & Composites',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety & Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
};
