import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('network_connections')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ connection: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();

    // Rebuild wifi_qr_data if SSID or password changed
    if (body.ssid !== undefined || body.password !== undefined) {
      const { data: existing } = await db.from('network_connections').select('ssid, password, security_type, wifi_hidden').eq('id', id).eq('tenant_id', user.tenantId).single();
      if (existing) {
        const ssid = body.ssid ?? existing.ssid;
        const pw = body.password ?? existing.password;
        const sec = body.security_type ?? existing.security_type ?? 'WPA2';
        const hidden = body.wifi_hidden ?? existing.wifi_hidden ?? false;
        if (ssid) {
          body.wifi_qr_data = `WIFI:T:${sec};S:${ssid};P:${pw || ''};H:${hidden};;`;
        }
      }
    }

    body.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('network_connections')
      .update(body)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, connection: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('network_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
