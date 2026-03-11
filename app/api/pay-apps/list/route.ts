import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { DEMO_PAY_APPS, DEMO_PROJECT } from '../../../../demo-data';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('pay_applications').select('*').order('app_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    if ((data || []).length === 0) {
      // Return demo data
      const demoPAs = DEMO_PAY_APPS.map(pa => ({
        ...pa,
        project_id: projectId || DEMO_PROJECT.id,
        app_number: pa.application_number,
        this_period: pa.total_completed_and_stored - (pa.application_number > 1 ? DEMO_PAY_APPS[pa.application_number - 2]?.total_completed_and_stored ?? 0 : 0),
        retainage_amount: pa.retainage_held,
      }));
      return NextResponse.json({ payApps: demoPAs, source: 'demo' });
    }
    return NextResponse.json({ payApps: data || [] });
  } catch {
    const demoPAs = DEMO_PAY_APPS.map(pa => ({
      ...pa,
      project_id: projectId || DEMO_PROJECT.id,
      app_number: pa.application_number,
      this_period: pa.total_completed_and_stored - (pa.application_number > 1 ? DEMO_PAY_APPS[pa.application_number - 2]?.total_completed_and_stored ?? 0 : 0),
      retainage_amount: pa.retainage_held,
    }));
    return NextResponse.json({ payApps: demoPAs, source: 'demo' });
  }
}
