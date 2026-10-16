import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { hasEntitlement, upsell } from '@/lib/entitlements';
import { apiError } from '@/lib/api-error';

/**
 * Saguaro Radio — LIVE STREAMING add-on (the paid tier-3 "fast feature").
 *
 * Mints a LiveKit access token so the client can join a low-latency WebRTC
 * room for its channel (live full-duplex voice instead of store-and-forward
 * clips). Everything else in Radio stays free; ONLY this route is gated.
 *
 * GET -> { available, reason? }   capability probe (no token minted)
 * POST { channelId } -> { token, url, room }
 *
 * Env (Vercel): LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
 * Without them the route reports available:false — never a hard error, so
 * clients keep working store-and-forward and can render the upsell pitch.
 */

const b64url = (input: Buffer | string) =>
  (typeof input === 'string' ? Buffer.from(input) : input)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** LiveKit access token: standard HS256 JWT, no SDK dependency needed. */
function mintLiveKitToken(opts: {
  apiKey: string; apiSecret: string; identity: string; name: string;
  room: string; canPublish: boolean; ttlSecs: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name,
    nbf: now - 10,
    exp: now + opts.ttlSecs,
    video: {
      room: opts.room,
      roomJoin: true,
      roomCreate: true,
      canPublish: opts.canPublish,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(createHmac('sha256', opts.apiSecret).update(unsigned).digest());
  return `${unsigned}.${sig}`;
}

const env = () => ({
  url: process.env.LIVEKIT_URL || '',
  key: process.env.LIVEKIT_API_KEY || '',
  secret: process.env.LIVEKIT_API_SECRET || '',
});

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const { url, key, secret } = env();
    if (!url || !key || !secret) {
      return NextResponse.json({ available: false, reason: 'not_configured' });
    }
    const db = createServerClient() as any;
    const entitled = await hasEntitlement(db, g.user.tenantId, 'radio_streaming');
    return NextResponse.json(entitled
      ? { available: true }
      : { available: false, reason: 'upsell', ...upsell('radio_streaming') });
  } catch {
    return NextResponse.json({ available: false, reason: 'error' });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const { url, key, secret } = env();
    if (!url || !key || !secret) {
      return NextResponse.json({ error: 'Live streaming is not configured yet.' }, { status: 503 });
    }
    const db = createServerClient() as any;
    if (!(await hasEntitlement(db, g.user.tenantId, 'radio_streaming'))) {
      return NextResponse.json(upsell('radio_streaming'), { status: 403 });
    }
    const b = await req.json().catch(() => ({}));
    const channelId = String(b.channelId || '');
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    // Membership check: you can only stream on a channel you belong to.
    const { data: mem } = await db.from('radio_members').select('id, call_sign')
      .eq('tenant_id', g.user.tenantId).eq('channel_id', channelId).eq('user_id', g.user.id).limit(1);
    if (!mem || !mem.length) return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 });

    const room = `radio_${g.user.tenantId}_${channelId}`;
    const token = mintLiveKitToken({
      apiKey: key, apiSecret: secret,
      identity: g.user.id,
      name: (mem[0] as any)?.call_sign || g.user.email || 'Team member',
      room, canPublish: true, ttlSecs: 15 * 60,
    });
    return NextResponse.json({ token, url, room, expiresInSecs: 15 * 60 });
  } catch (e) {
    return apiError('radio/stream-token POST', e);
  }
}
