import { NextRequest, NextResponse } from 'next/server';

const DEMO_SUBMITTALS = [
  { id: 'sub-1', number: 'S-001', description: 'Concrete mix design', spec_section: '03 31 00', submitted_by: 'Southwest Concrete', submitted_date: '2026-01-20', to_architect: '2026-01-20', required_by: '2026-02-03', status: 'Approved', days_in_review: 7, project_id: '' },
  { id: 'sub-2', number: 'S-002', description: 'Framing lumber grade certification', spec_section: '06 10 00', submitted_by: 'Framing crew', submitted_date: '2026-01-25', to_architect: '2026-01-25', required_by: '2026-02-08', status: 'Approved', days_in_review: 5, project_id: '' },
  { id: 'sub-3', number: 'S-003', description: 'Electrical panel schedule', spec_section: '26 05 00', submitted_by: 'Desert Electric', submitted_date: '2026-02-05', to_architect: '2026-02-05', required_by: '2026-02-20', status: 'Under Review', days_in_review: 12, project_id: '' },
  { id: 'sub-4', number: 'S-004', description: 'Roofing manufacturer data', spec_section: '07 52 00', submitted_by: 'Mesa Roofing Co', submitted_date: '2026-02-10', to_architect: '2026-02-10', required_by: '2026-02-24', status: 'Revise & Resubmit', days_in_review: 8, project_id: '' },
  { id: 'sub-5', number: 'S-005', description: 'HVAC equipment schedule', spec_section: '23 00 00', submitted_by: 'AZ Plumbing & Mech', submitted_date: '2026-02-20', to_architect: '2026-02-20', required_by: '2026-03-06', status: 'Submitted', days_in_review: 3, project_id: '' },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('submittals').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ submittals: DEMO_SUBMITTALS.map(s => ({ ...s, project_id: params.projectId })), demo: true });
    return NextResponse.json({ submittals: data });
  } catch {
    return NextResponse.json({ submittals: DEMO_SUBMITTALS.map(s => ({ ...s, project_id: params.projectId })), demo: true });
  }
}
