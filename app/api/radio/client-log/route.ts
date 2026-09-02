import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

/**
 * Saguaro Radio — field client telemetry.
 * The mobile app reports mic/send failures plus its OTA identity here so radio
 * outages are diagnosed from server logs (exact native error, runtime, update
 * id) instead of jobsite guesswork. Telemetry must never error the client.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const b = await req.json().catch(() => ({} as any));
    const row = {
      tenant_id: g.user.tenantId,
      user_id: g.user.id,
      stage: String(b.stage || 'unknown').slice(0, 60),
      message: String(b.message || '').slice(0, 500),
      platform: String(b.platform || '').slice(0, 20),
      os_version: String(b.osVersion || '').slice(0, 40),
      runtime: String(b.runtime || '').slice(0, 40),
      update_id: String(b.updateId || '').slice(0, 60),
      embedded: !!b.embedded,
    };
    // Vercel-visible immediately; the table insert is the queryable trail.
    console.log(
      `[radio-client] ${row.stage} ${row.platform}/${row.os_version} rt=${row.runtime} upd=${row.update_id.slice(0, 8)} emb=${row.embedded} :: ${row.message}`,
    );
    const db = createServerClient() as any;
    await must(db.from('radio_client_logs').insert(row as never), 'radio_client_logs insert');
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
