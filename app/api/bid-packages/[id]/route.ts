import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const [{ data: pkg }, { data: items }, { data: invites }, { data: submissions }] = await Promise.all([
      db.from('bid_packages').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).single(),
      db.from('bid_package_items').select('*').eq('bid_package_id', id).order('id'),
      db.from('bid_package_invites').select('*').eq('bid_package_id', id).order('created_at', { ascending: false }),
      db.from('bid_submissions').select('*').eq('bid_package_id', id).order('bid_amount'),
    ]);
    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ bidPackage: pkg, items: items || [], invites: invites || [], submissions: submissions || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('bid_packages').update(body).eq('id', id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ bidPackage: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
