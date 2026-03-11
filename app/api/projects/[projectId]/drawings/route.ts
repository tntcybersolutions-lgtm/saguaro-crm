import { NextRequest, NextResponse } from 'next/server';

const DEMO_DRAWINGS = [
  { id: 'd-1', sheet: 'A1.0', title: 'Site Plan', discipline: 'Architectural', revision: 'Rev 2', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 'd-2', sheet: 'A2.0', title: 'Floor Plan — Level 1', discipline: 'Architectural', revision: 'Rev 3', date: '2026-02-01', status: 'Current', url: null, project_id: '' },
  { id: 'd-3', sheet: 'A3.0', title: 'Floor Plan — Level 2', discipline: 'Architectural', revision: 'Rev 1', date: '2026-02-01', status: 'For Review', url: null, project_id: '' },
  { id: 'd-4', sheet: 'S1.0', title: 'Foundation Plan', discipline: 'Structural', revision: 'Rev 1', date: '2026-01-20', status: 'Current', url: null, project_id: '' },
  { id: 'd-5', sheet: 'S2.0', title: 'Framing Plan — Level 1', discipline: 'Structural', revision: 'Rev 2', date: '2026-01-25', status: 'Current', url: null, project_id: '' },
  { id: 'd-6', sheet: 'C1.0', title: 'Civil Site Plan', discipline: 'Civil', revision: 'Rev 1', date: '2026-01-10', status: 'Current', url: null, project_id: '' },
  { id: 'd-7', sheet: 'E1.0', title: 'Electrical Site Plan', discipline: 'Electrical', revision: 'Rev 1', date: '2026-01-25', status: 'Current', url: null, project_id: '' },
  { id: 'd-8', sheet: 'M1.0', title: 'Mechanical Floor Plan', discipline: 'MEP', revision: 'Rev 0', date: '2026-01-30', status: 'For Review', url: null, project_id: '' },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('drawings').select('*').eq('project_id', params.projectId).order('sheet', { ascending: true });
    if (error || !data?.length) return NextResponse.json({ drawings: DEMO_DRAWINGS.map(d => ({ ...d, project_id: params.projectId })), demo: true });
    return NextResponse.json({ drawings: data });
  } catch {
    return NextResponse.json({ drawings: DEMO_DRAWINGS.map(d => ({ ...d, project_id: params.projectId })), demo: true });
  }
}
