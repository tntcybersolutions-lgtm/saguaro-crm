/**
 * Apple Push (APNs) helpers.
 * Run: npx -y tsx lib/push-apns.sanity.test.ts   (exit 0 = every assertion held)
 */
import crypto from 'node:crypto';
import { apnsConfigFromEnv, apnsJwt, apnsPayload, isApnsToken, APP_BUNDLE_ID } from './push-apns';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const hex64 = 'a'.repeat(64);

check('64-hex iOS token is an APNs token', isApnsToken(hex64, 'ios'));
check('same token from Android is not', !isApnsToken(hex64, 'android'));
check('Expo token is not', !isApnsToken('ExponentPushToken[abc]', 'ios'));
check('web endpoint is not', !isApnsToken('https://fcm.googleapis.com/fcm/send/x', 'ios'));
check('short hex is not', !isApnsToken('abcd', 'ios'));

check('no env → not configured', apnsConfigFromEnv({}) === null);
check('missing team id → not configured', apnsConfigFromEnv({ APNS_KEY_P8: pem, APNS_KEY_ID: 'K' }) === null);
const fromPem = apnsConfigFromEnv({ APNS_KEY_P8: pem, APNS_KEY_ID: 'KEYID12345', APNS_TEAM_ID: 'TEAM123456' });
check('PEM env → configured, production APNs, app bundle id', !!fromPem && fromPem.origin === 'https://api.push.apple.com' && fromPem.topic === APP_BUNDLE_ID);
const fromB64 = apnsConfigFromEnv({ APNS_KEY_P8: Buffer.from(pem).toString('base64'), APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_SANDBOX: 'true' });
check('base64 env → same key, sandbox when asked', !!fromB64 && fromB64.pem.trim() === pem.trim() && fromB64.origin.includes('sandbox'));
const escaped = apnsConfigFromEnv({ APNS_KEY_P8: pem.replace(/\n/g, '\\n'), APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' });
check('PEM pasted with literal \\n → newlines restored', !!escaped && escaped.pem.includes('\n-----END'));
check('garbage key → not configured', apnsConfigFromEnv({ APNS_KEY_P8: 'not-a-key', APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }) === null);

const jwt = apnsJwt({ pem, keyId: 'KEYID12345', teamId: 'TEAM123456' }, 1_800_000_000);
const [h, c, sig] = jwt.split('.');
const dec = (s: string) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
check('JWT header is ES256 with the key id', dec(h).alg === 'ES256' && dec(h).kid === 'KEYID12345');
check('JWT claims carry team id and issue time', dec(c).iss === 'TEAM123456' && dec(c).iat === 1_800_000_000);
const raw = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
check('signature is 64-byte raw r||s (what APNs wants)', raw.length === 64);
check('signature verifies with the public key', crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, raw));

const body = JSON.parse(apnsPayload({ title: 'ABC Electric sent you 3 photos', body: 'End of day', url: '/app/projects/p1/photos?inbox=1', type: 'sub_media_submitted' }));
check('payload: alert title/body + sound', body.aps.alert.title === 'ABC Electric sent you 3 photos' && body.aps.alert.body === 'End of day' && body.aps.sound === 'default');
check('payload: tap opens the link', body.url === '/app/projects/p1/photos?inbox=1' && body.route === body.url);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall push-apns assertions held');
