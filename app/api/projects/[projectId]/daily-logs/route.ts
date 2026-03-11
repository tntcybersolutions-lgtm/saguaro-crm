import { NextRequest, NextResponse } from 'next/server';

const DEMO_LOGS = [
  { id: 'dl-1', date: '2026-03-10', superintendent: 'Mike Torres', weather: 'Clear', temp_f: 72, crew_count: 14, work_performed: 'Framing Level 2 — east wing walls', equipment: 'Crane, scissor lift', materials: 'Lumber delivery — 2x6x16', visitors: 'Owner rep: J. Smith', incidents: 'None', project_id: '' },
  { id: 'dl-2', date: '2026-03-09', superintendent: 'Mike Torres', weather: 'Partly Cloudy', temp_f: 68, crew_count: 12, work_performed: 'Framing Level 2 — started east wing', equipment: 'Crane', materials: 'None', visitors: 'None', incidents: 'None', project_id: '' },
  { id: 'dl-3', date: '2026-03-08', superintendent: 'Mike Torres', weather: 'Clear', temp_f: 75, crew_count: 14, work_performed: 'Framing Level 2 — north wall complete', equipment: 'Crane, nail guns', materials: 'Hardware delivery', visitors: 'Architect site visit', incidents: 'RFI submitted for window location', project_id: '' },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('daily_logs').select('*').eq('project_id', params.projectId).order('date', { ascending: false });
    if (error || !data?.length) return NextResponse.json({ logs: DEMO_LOGS.map(l => ({ ...l, project_id: params.projectId })), demo: true });
    return NextResponse.json({ logs: data });
  } catch {
    return NextResponse.json({ logs: DEMO_LOGS.map(l => ({ ...l, project_id: params.projectId })), demo: true });
  }
}
