import { NextRequest, NextResponse } from 'next/server';

const DEMO_PERMITS = [
  { id: 'p-1', permit_type: 'Building', number: '2026-BP-4421', authority: 'City of Phoenix', applied_date: '2026-01-05', issued_date: '2026-01-12', expiry_date: '2027-01-12', status: 'Active', inspector: 'John Smith', project_id: '' },
  { id: 'p-2', permit_type: 'Electrical', number: '2026-EP-1102', authority: 'City of Phoenix', applied_date: '2026-01-08', issued_date: '2026-01-15', expiry_date: '2027-01-15', status: 'Active', inspector: 'Mary Jones', project_id: '' },
  { id: 'p-3', permit_type: 'Mechanical', number: '2026-MP-0882', authority: 'City of Phoenix', applied_date: '2026-01-08', issued_date: '2026-01-15', expiry_date: '2027-01-15', status: 'Active', inspector: 'Mary Jones', project_id: '' },
  { id: 'p-4', permit_type: 'Plumbing', number: '2026-PP-0553', authority: 'City of Phoenix', applied_date: '2026-01-10', issued_date: null, expiry_date: null, status: 'Under Review', inspector: 'Bob Davis', project_id: '' },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('permits').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ permits: DEMO_PERMITS.map(p => ({ ...p, project_id: params.projectId })), demo: true });
    return NextResponse.json({ permits: data });
  } catch {
    return NextResponse.json({ permits: DEMO_PERMITS.map(p => ({ ...p, project_id: params.projectId })), demo: true });
  }
}
