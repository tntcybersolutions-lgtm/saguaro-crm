import { NextRequest, NextResponse } from 'next/server';

const DEMO_BILLS = [
  { id: 'b-1', invoice_num: 'B-001', vendor: 'Desert Steel Supply', description: 'Structural steel — Phase 1', amount: 28400, due_date: '2026-03-15', status: 'Paid', category: '05 - Metals', project_id: '' },
  { id: 'b-2', invoice_num: 'B-002', vendor: 'Phoenix Lumber Co', description: 'Framing lumber — 2x6 studs', amount: 15880, due_date: '2026-03-22', status: 'Pending', category: '06 - Wood & Plastics', project_id: '' },
  { id: 'b-3', invoice_num: 'B-003', vendor: 'AZ Ready Mix', description: 'Concrete — slab pour', amount: 6670, due_date: '2026-04-01', status: 'Pending', category: '03 - Concrete', project_id: '' },
  { id: 'b-4', invoice_num: 'B-004', vendor: 'Fastenal', description: 'Fasteners and hardware', amount: 2340, due_date: '2026-02-28', status: 'Overdue', category: '06 - Wood & Plastics', project_id: '' },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('bills').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ bills: DEMO_BILLS.map(b => ({ ...b, project_id: params.projectId })), demo: true });
    return NextResponse.json({ bills: data });
  } catch {
    return NextResponse.json({ bills: DEMO_BILLS.map(b => ({ ...b, project_id: params.projectId })), demo: true });
  }
}
