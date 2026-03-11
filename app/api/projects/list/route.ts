import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const DEMO_PROJECTS = [
  { id: 'demo-1', name: 'Mesa Office Complex', address: '1234 Main St, Mesa, AZ 85201', status: 'active', contract_amount: 2450000, project_type: 'commercial', start_date: '2024-01-15', end_date: '2024-12-31', created_at: new Date().toISOString() },
  { id: 'demo-2', name: 'Scottsdale Retail Center', address: '5678 Scottsdale Rd, Scottsdale, AZ 85251', status: 'active', contract_amount: 1850000, project_type: 'retail', start_date: '2024-03-01', end_date: '2024-10-31', created_at: new Date().toISOString() },
  { id: 'demo-3', name: 'Phoenix Warehouse Build', address: '910 Industrial Blvd, Phoenix, AZ 85001', status: 'planning', contract_amount: 3200000, project_type: 'industrial', start_date: '2024-06-01', end_date: '2025-06-30', created_at: new Date().toISOString() },
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
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ projects: data || [], source: 'live' });
  } catch {
    return NextResponse.json({ projects: DEMO_PROJECTS, source: 'demo' });
  }
}
