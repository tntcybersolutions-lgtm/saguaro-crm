/**
 * Proposal e-signature — the parts that can be proven without a database:
 * line-item math, the canonical snapshot and its SHA-256, the token, the
 * status a link is really in, the email (rendered, never sent) and the signed
 * PDF with its certificate page.
 * Run: npx -y tsx lib/proposal-esign.sanity.test.ts [out.pdf]   (exit 0 = every assertion held)
 */
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  normalizeLineItems, lineAmount, proposalTotal, canonicalJson, effectiveStatus, looksLikeToken, money,
  ESIGN_CONSENT_TEXT, type ProposalSnapshot,
} from './proposal-esign-core';
import { renderSignedProposalPdf } from './document-templates/proposal-signed-generator';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');

(async () => {
  /* ── Line items and total ── */
  const lines = normalizeLineItems([
    { description: 'Demolition and haul-off — dumpster “and” disposal', quantity: 1, unit: 'LS', unit_price: '12,500' },
    { description: 'Framing, 3-5/8" metal studs', quantity: 1840, unit: 'SF', unit_price: 4.25 },
    { description: '', quantity: 1, unit_price: 0 },
    { description: 'Electrical rough-in', quantity: '1', unit: 'LS', unit_price: '$18,750.50' },
    'junk',
  ]);
  check('blank and junk lines are dropped', lines.length === 3, String(lines.length));
  check('"12,500" reads as 12500', lines[0].unit_price === 12500);
  check('"$18,750.50" reads as 18750.5', lines[2].unit_price === 18750.5);
  check('1840 × 4.25 = 7820', lineAmount(lines[1]) === 7820);
  check('total = 12500 + 7820 + 18750.50', proposalTotal(lines, 0) === 39070.5, String(proposalTotal(lines, 0)));
  check('no lines → the stored amount', proposalTotal([], '250000') === 250000);
  check('cents round: 3 × 0.1 = 0.3', lineAmount({ description: 'x', quantity: 3, unit: '', unit_price: 0.1 }) === 0.3);
  check('money formats', money(39070.5) === '$39,070.50', money(39070.5));

  /* ── Canonical snapshot + fingerprint ── */
  const snap: ProposalSnapshot = {
    v: 1, proposal_id: 'p1', title: 'Tenant Improvement Proposal', number: 'v1.0',
    company: { name: 'Copper State Developments', logo_url: null },
    prepared_for: { name: 'Pat Owner', company: 'Back Nine LLC', email: 'pat@example.com' },
    project_name: null,
    line_items: lines.map((l) => ({ ...l, amount: lineAmount(l) })),
    total: proposalTotal(lines, 0),
    introduction: 'Thank you for the opportunity.',
    scope: 'All work per drawings A-101 through A-104.\nPermits by owner.',
    payment_terms: '30% deposit, progress billing monthly, 10% retainage.',
    exclusions: 'Fire sprinklers ✓, low-voltage.',
    valid_until: '2026-11-15', sent_at: '2026-10-16T18:00:00Z',
  };
  const reordered = JSON.parse(JSON.stringify({ ...snap, company: { logo_url: null, name: snap.company.name } }));
  const keysShuffled = Object.fromEntries(Object.entries(reordered).reverse());
  const hash = sha(canonicalJson(snap));
  check('fingerprint is 64 hex', /^[0-9a-f]{64}$/.test(hash));
  check('key order does not change the fingerprint', sha(canonicalJson(keysShuffled)) === hash);
  check('a one-cent change does change it', sha(canonicalJson({ ...snap, total: snap.total + 0.01 })) !== hash);
  check('a reworded term changes it', sha(canonicalJson({ ...snap, payment_terms: snap.payment_terms + ' ' })) !== hash);

  /* ── Token + status ── */
  const token = randomBytes(32).toString('base64url');
  check('a minted token has the shape the routes accept', looksLikeToken(token), token);
  check('a uuid is not a token', !looksLikeToken('9b2f3b1e-6a0e-4b8f-9d7c-2a1e5d4c3b2a'));
  check('a token with a slash is refused', !looksLikeToken(token.slice(0, 42) + '/'));
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  check('open + past date = expired', effectiveStatus({ status: 'viewed', expires_at: past }) === 'expired');
  check('open + future date = still open', effectiveStatus({ status: 'sent', expires_at: future }) === 'sent');
  check('signed stays signed after its date', effectiveStatus({ status: 'signed', expires_at: past }) === 'signed');

  /* ── The email: rendered only — nothing is sent ── */
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test';
  delete process.env.RESEND_API_KEY;
  const { proposalSignatureEmail } = await import('./email');
  const mail = proposalSignatureEmail({
    signerName: 'Pat <script>', companyName: 'Copper State Developments', proposalTitle: 'TI "Phase 1"',
    amount: snap.total, signUrl: `https://saguarocontrol.net/portals/proposal/${token}`, expiresAt: future, message: 'Call me <b>anytime</b>',
  });
  check('subject names the company and proposal', mail.subject === 'Copper State Developments sent you a proposal to sign: TI "Phase 1"', mail.subject);
  check('signer name is escaped', mail.html.includes('Pat &lt;script&gt;') && !mail.html.includes('<script>'));
  check('message is escaped', mail.html.includes('Call me &lt;b&gt;anytime&lt;/b&gt;'));
  check('total is in the email', mail.html.includes('$39,070.50'));
  check('the link is in the email', mail.html.includes(`/portals/proposal/${token}`));

  /* ── The signed PDF ── */
  const { PNG } = await import('pngjs');
  const png = new PNG({ width: 300, height: 100 });
  for (let y = 0; y < 100; y++) for (let x = 0; x < 300; x++) {
    const i = (y * 300 + x) * 4; const on = Math.abs(y - (50 + 25 * Math.sin(x / 20))) < 2;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = on ? 20 : 255; png.data[i + 3] = 255;
  }
  const bytes = await renderSignedProposalPdf({
    snapshot: snap, contentHash: hash, requestId: 'req-123',
    branding: { companyName: snap.company.name, logoUrl: '', accentHex: '' },
    signer: { name: 'Pat Owner', title: 'Managing Member', email: 'pat@example.com', method: 'drawn', signaturePng: PNG.sync.write(png), signedAt: '2026-10-16T19:01:02Z', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', consentText: ESIGN_CONSENT_TEXT },
    events: [
      { event: 'sent', actor: 'sender', created_at: '2026-10-16T18:00:00Z', ip: null },
      { event: 'viewed', actor: 'signer', created_at: '2026-10-16T18:40:00Z', ip: '203.0.113.9' },
      { event: 'signed', actor: 'signer', created_at: '2026-10-16T19:01:02Z', ip: '203.0.113.9' },
    ],
  });
  const head = Buffer.from(bytes.slice(0, 5)).toString('latin1');
  check('the signed PDF is a PDF', head === '%PDF-', head);
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes);
  check('proposal page(s) + certificate page', doc.getPageCount() >= 2, String(doc.getPageCount()));
  check('the PDF carries the content fingerprint', doc.getSubject() === `Content SHA-256 ${hash}`, String(doc.getSubject()));
  const typed = await renderSignedProposalPdf({
    snapshot: { ...snap, line_items: [], total: 250000 }, contentHash: hash, requestId: 'req-124',
    branding: { companyName: snap.company.name, logoUrl: '', accentHex: '' },
    signer: { name: 'Pat Owner', title: null, email: 'pat@example.com', method: 'typed', signaturePng: null, signedAt: '2026-10-16T19:01:02Z', ip: null, userAgent: null, consentText: ESIGN_CONSENT_TEXT },
    events: [],
  });
  check('a typed signature with no lines renders too', typed.length > 1000);
  if (process.argv[2]) { writeFileSync(process.argv[2], bytes); console.log(`wrote ${process.argv[2]} (${bytes.length} bytes, sha256 ${sha(bytes)})`); }

  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nall checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
