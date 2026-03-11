import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { DEMO_RFIS, DEMO_PROJECT } from '../../../../demo-data';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const today = new Date().toISOString().split('T')[0];

  try {
    const db = createServerClient();
    let query = db.from('rfis').select('*').order('rfi_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    if ((data || []).length === 0) {
      const demoRFIs = DEMO_RFIS.map(r => ({
        ...r,
        project_id: projectId || DEMO_PROJECT.id,
        rfi_number: r.number,
        subject: r.title,
        due_date: r.response_due_date,
        is_overdue: r.status !== 'answered' && !!r.response_due_date && r.response_due_date < today,
      }));
      return NextResponse.json({ rfis: demoRFIs, source: 'demo' });
    }
    const rfis = (data || []).map((r: any) => ({
      ...r,
      is_overdue: r.status === 'open' && r.due_date && r.due_date < today,
    }));
    return NextResponse.json({ rfis });
  } catch {
    const demoRFIs = DEMO_RFIS.map(r => ({
      ...r,
      project_id: projectId || DEMO_PROJECT.id,
      rfi_number: r.number,
      subject: r.title,
      due_date: r.response_due_date,
      is_overdue: r.status !== 'answered' && !!r.response_due_date && r.response_due_date < today,
    }));
    return NextResponse.json({ rfis: demoRFIs, source: 'demo' });
  }
}
