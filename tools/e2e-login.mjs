/**
 * The live-site login the walk and the jacket e2e sign in with: a test user in
 * Chad's REAL company (Saguaro Control Systems), never the App Store demo
 * company. Chad approved this CI login on 2026-10-10.
 *
 *   E2E_EMAIL     the E2E_EMAIL secret when it is set, else the company's
 *                 dedicated CI user (an admin whose mail lands in Resend's
 *                 delivered@ test sink, so nothing the app sends it reaches a
 *                 person)
 *   E2E_PASSWORD  the E2E_PASSWORD secret when it is set, else derived from the
 *                 App Store Connect key CI already holds:
 *                   base64url(HMAC-SHA256(ASC key, "saguaro-e2e-login-v1"))
 *                 Only someone holding that key can produce it, it is never
 *                 stored anywhere, and it is masked in the log.
 *
 * Writes both to $GITHUB_ENV for the steps after it. With BCRYPT_DIR set it
 * also prints the derived password's bcrypt hash (E2E_LOGIN_BCRYPT …): that,
 * never the password, is what gets set on the user in auth.users. A new ASC
 * key means a new password: set the newly printed hash.
 *
 *   node tools/e2e-login.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const CI_USER = 'delivered+saguaro-walk@resend.dev';
const LABEL = 'saguaro-e2e-login-v1';

const secretEmail = (process.env.E2E_SECRET_EMAIL || '').trim();
const secretPass = process.env.E2E_SECRET_PASSWORD || '';

let email;
let password;
let derived = false;
if (secretEmail && secretPass) {
  email = secretEmail;
  password = secretPass;
} else {
  const p8 = Buffer.from(process.env.ASC_KEY_P8_BASE64 || '', 'base64');
  if (!p8.toString('utf8').includes('PRIVATE KEY')) {
    console.error('No login: the E2E_EMAIL / E2E_PASSWORD secrets are not set and ASC_KEY_P8_BASE64 is missing.');
    process.exit(2);
  }
  email = CI_USER;
  password = crypto.createHmac('sha256', p8).update(LABEL).digest('base64url');
  derived = true;
}

// Mask before anything else can echo it.
console.log(`::add-mask::${password}`);

const out = process.env.GITHUB_ENV;
if (!out) {
  console.error('GITHUB_ENV is not set — run this inside GitHub Actions.');
  process.exit(2);
}
fs.appendFileSync(out, `E2E_EMAIL=${email}\nE2E_PASSWORD=${password}\n`);
console.log(`login: ${derived ? 'the company CI user (derived from the ASC key)' : 'the E2E_EMAIL / E2E_PASSWORD secrets'}`);

if (derived && process.env.BCRYPT_DIR) {
  const bcrypt = createRequire(`${process.env.BCRYPT_DIR}/noop.js`)('bcryptjs');
  // The repo is public: its Actions logs are readable by anyone. Mask the hash
  // so a log never carries something that could be cracked offline.
  const hash = bcrypt.hashSync(password, 10);
  console.log(`::add-mask::${hash}`);
  console.log(`E2E_LOGIN_BCRYPT ${hash}`);
}
