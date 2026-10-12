import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * GET  /api/calendar/link            this person's private calendar-sync link (made on first ask)
 * POST /api/calendar/link {reset}    a new link — the old one stops working
 */
async function linkFor(db: any, tenantId: string, userId: string, reset: boolean): Promise<string> {
  if (reset) {
    const { error } = await db.from('calendar_feeds').delete().eq('user_id', userId);
    if (error) throw error;
  }
  const { data: have } = await db.from('calendar_feeds').select('token').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle();
  if (have?.token) return have.token as string;
  const { data, error } = await db.from('calendar_feeds').upsert({ tenant_id: tenantId, user_id: userId }, { onConflict: 'user_id' }).select('token').single();
  if (error) throw error;
  return data.token as string;
}

function urls(origin: string, token: string) {
  const https = `${origin}/api/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:/, 'webcal:');
  return {
    url: https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent('Saguaro')}`,
  };
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    return NextResponse.json(urls(req.nextUrl.origin, await linkFor(g.db, g.user.tenantId, g.user.id, false)));
  } catch (e) {
    return apiError('calendar/link', e, "Couldn't make your calendar link. Try again.");
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(urls(req.nextUrl.origin, await linkFor(g.db, g.user.tenantId, g.user.id, body.reset === true)));
  } catch (e) {
    return apiError('calendar/link', e, "Couldn't reset your calendar link. Try again.");
  }
}
