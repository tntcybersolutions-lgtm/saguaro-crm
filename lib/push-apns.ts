// ─────────────────────────────────────────────────────────────────────────────
// lib/push-apns.ts
//
// Apple Push (APNs) for the iPhone app. The Capacitor shell registers with
// @capacitor/push-notifications, which hands back a raw APNs device token
// (hex). lib/push.ts routes those tokens here.
//
// Token-based auth: one .p8 "Apple Push Notifications service" key from the
// Apple Developer account (Certificates, IDs & Profiles → Keys). Env:
//   APNS_KEY_P8     the .p8 file's contents (PEM) or that file base64-encoded
//   APNS_KEY_ID     the key's 10-character id
//   APNS_TEAM_ID    the Apple developer team id
//   APNS_BUNDLE_ID  optional, defaults to the app's bundle id
//   APNS_SANDBOX    "true" only for Xcode debug builds (TestFlight and the
//                   App Store use production APNs)
// Without the first three, iPhone tokens are skipped and counted — never a throw.
// ─────────────────────────────────────────────────────────────────────────────
import http2 from 'node:http2';
import crypto from 'node:crypto';

export const APP_BUNDLE_ID = 'net.saguarocontrol.field';

export interface ApnsConfig {
  pem: string;
  keyId: string;
  teamId: string;
  topic: string;
  origin: string;
}

export interface ApnsMessage {
  title: string;
  body?: string;
  url?: string;
  type?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/** A raw APNs device token: hex, 64+ chars (Apple has said it may grow). */
export function isApnsToken(token: string, platform: string | null | undefined): boolean {
  return platform === 'ios' && /^[0-9a-f]{64,200}$/i.test(token);
}

export function apnsConfigFromEnv(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const raw = (env.APNS_KEY_P8 || '').trim();
  const keyId = (env.APNS_KEY_ID || '').trim();
  const teamId = (env.APNS_TEAM_ID || '').trim();
  if (!raw || !keyId || !teamId) return null;
  const pem = raw.includes('BEGIN PRIVATE KEY')
    ? raw.replace(/\\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8');
  if (!pem.includes('BEGIN PRIVATE KEY')) return null;
  return {
    pem,
    keyId,
    teamId,
    topic: (env.APNS_BUNDLE_ID || APP_BUNDLE_ID).trim(),
    origin: env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** The provider token APNs wants: an ES256 JWT, good for up to an hour. */
export function apnsJwt(c: Pick<ApnsConfig, 'pem' | 'keyId' | 'teamId'>, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: c.keyId }));
  const claims = b64url(JSON.stringify({ iss: c.teamId, iat: nowSeconds }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: c.pem, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64url(sig)}`;
}

export function apnsPayload(msg: ApnsMessage): string {
  return JSON.stringify({
    aps: { alert: { title: msg.title, body: msg.body || '' }, sound: 'default', 'thread-id': msg.tag || msg.type || 'saguaro' },
    url: msg.url,
    route: msg.url,
    type: msg.type,
    ...(msg.data || {}),
  });
}

// Apple asks providers to reuse a token for 20–60 minutes rather than mint one per send.
let cached: { key: string; jwt: string; at: number } | null = null;
function providerToken(c: ApnsConfig): string {
  const key = `${c.teamId}:${c.keyId}`;
  if (cached && cached.key === key && Date.now() - cached.at < 40 * 60 * 1000) return cached.jwt;
  cached = { key, jwt: apnsJwt(c), at: Date.now() };
  return cached.jwt;
}

export type ApnsOutcome = 'sent' | 'failed' | 'dead';

/** Send one alert to each token over a single HTTP/2 connection. Never throws. */
export async function sendApns(c: ApnsConfig, tokens: string[], msg: ApnsMessage): Promise<ApnsOutcome[]> {
  if (!tokens.length) return [];
  const body = apnsPayload(msg);
  let session: http2.ClientHttp2Session | null = null;
  try {
    session = http2.connect(c.origin);
    session.on('error', (e) => console.error('[push/apns] connection error', e));
    const jwt = providerToken(c);
    return await Promise.all(tokens.map((token) => new Promise<ApnsOutcome>((resolve) => {
      const req = session!.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': c.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let text = '';
      req.setTimeout(15000, () => { req.close(); resolve('failed'); });
      req.on('response', (h) => { status = Number(h[':status']) || 0; });
      req.on('data', (d) => { text += d; });
      req.on('end', () => {
        if (status === 200) return resolve('sent');
        const reason = (() => { try { return JSON.parse(text).reason as string; } catch { return ''; } })();
        // 410 = the app was removed; BadDeviceToken = a token for another environment or app.
        if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') return resolve('dead');
        console.error('[push/apns] send failed', status, reason);
        resolve('failed');
      });
      req.on('error', (e) => { console.error('[push/apns] request error', e); resolve('failed'); });
      req.end(body);
    })));
  } catch (e) {
    console.error('[push/apns] send failed', e);
    return tokens.map(() => 'failed' as const);
  } finally {
    session?.close();
  }
}
