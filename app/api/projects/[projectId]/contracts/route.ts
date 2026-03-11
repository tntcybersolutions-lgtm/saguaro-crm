import { NextRequest, NextResponse } from 'next/server';

const DEMO_CONTRACTS = [
  { id: 'c-1', sub_name: 'Desert Electric LLC', trade: 'Electrical', amount: 185000, status: 'Executed', execution_date: '2026-01-10', scope: 'Electrical — complete scope', start_date: '2026-02-01', end_date: '2026-08-01', retainage_pct: 10, pdf_url: null, project_id: '' },
  { id: 'c-2', sub_name: 'AZ Plumbing & Mech', trade: 'Plumbing', amount: 122000, status: 'Executed', execution_date: '2026-01-10', scope: 'Plumbing & mechanical', start_date: '2026-02-01', end_date: '2026-08-01', retainage_pct: 10, pdf_url: null, project_id: '' },
  { id: 'c-3', sub_name: 'Southwest Concrete', trade: 'Concrete', amount: 98500, status: 'Complete', execution_date: '2026-01-12', scope: 'Concrete work — foundation and slab', start_date: '2026-01-22', end_date: '2026-03-01', retainage_pct: 10, pdf_url: null, project_id: '' },
  { id: 'c-4', sub_name: 'Mesa Roofing Co', trade: 'Roofing', amount: 54000, status: 'Draft', execution_date: null, scope: 'Roofing — complete installation', start_date: '2026-05-01', end_date: '2026-06-15', retainage_pct: 10, pdf_url: null, project_id: '' },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('contracts').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ contracts: DEMO_CONTRACTS.map(c => ({ ...c, project_id: params.projectId })), demo: true });
    return NextResponse.json({ contracts: data });
  } catch {
    return NextResponse.json({ contracts: DEMO_CONTRACTS.map(c => ({ ...c, project_id: params.projectId })), demo: true });
  }
}
