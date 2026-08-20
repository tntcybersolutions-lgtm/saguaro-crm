import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const body = await req.json();

  if (!body.owner_name) return NextResponse.json({ error: 'Missing required field: owner_name' }, { status: 400 });

  try {
    const token = crypto.randomBytes(32).toString('hex');

    const { data, error } = await db
      .from('owner_portal_tokens')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        token,
        owner_name: body.owner_name,
        owner_email: body.owner_email || null,
        owner_company: body.owner_company || null,
        expires_at: body.expires_at || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      data,
      portalUrl: `/owner/${token}`,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('owner_portal_tokens')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
