import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { DEMO_PROJECT } from '../../../../demo-data';

const DEMO_PROJECTS = [
  { ...DEMO_PROJECT, end_date: DEMO_PROJECT.substantial_date },
  { id: 'demo-project-2', name: 'Mesa Office Complex', address: '1234 Main St, Mesa, AZ 85201', status: 'active', contract_amount: 2450000, project_type: 'commercial', start_date: '2025-06-15', end_date: '2026-06-30', project_number: 'MOC-2025-002', created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
  { id: 'demo-project-3', name: 'Scottsdale Retail Center', address: '5678 Scottsdale Rd, Scottsdale, AZ 85251', status: 'bidding', contract_amount: 1850000, project_type: 'retail', start_date: '2026-04-01', end_date: '2026-10-31', project_number: 'SRC-2026-003', created_at: new Date(Date.now() - 86400000 * 7).toISOString() },
];

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ projects: DEMO_PROJECTS, source: 'demo' });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ projects: data || [], source: 'live' });
  } catch {
    return NextResponse.json({ projects: DEMO_PROJECTS, source: 'demo' });
  }
}
