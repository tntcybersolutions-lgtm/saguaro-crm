/**
 * @jest-environment node
 *
 * Reply by email: the signed reply-to token, the webhook signature, cutting
 * quoted history out of real Gmail / Outlook / Apple Mail replies, and the
 * route's decisions (who may post, what the post does).
 */
import { describe, test, expect } from '@jest/globals';
import {
  signReplyToken, decodeReplyToken, verifyReplyToken, isTokenRecipient, buildReplyAddress,
  findReplyTokens, base32Encode, base32Decode, TOKEN_LENGTH,
} from './inbound-reply/token';
import { verifySvix, svixSign } from './inbound-reply/svix';
import { extractReply, stripQuotedText, parseSubmittalVerdict, REPLY_MARKER } from './inbound-reply/quote-strip';
import { isAutoReply, authenticationFailed, itemDistribution, displayName, emailsIn } from './inbound-reply/match';
import { pickToken, screenReply, planReply } from './inbound-reply/screen';

const SECRET = 'test-inbound-secret-0123456789';
const TENANT = '11111111-2222-4333-8444-555555555555';
const OTHER_TENANT = '99999999-2222-4333-8444-555555555555';
const RFI = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ARCH = 'Jane.Architect@Studio-Arch.com';
const NOW = new Date('2026-10-16T12:00:00Z');

function tok(over: Partial<Parameters<typeof signReplyToken>[1]> = {}) {
  return signReplyToken(SECRET, { tenantId: TENANT, type: 'rfis', itemId: RFI, recipient: ARCH, ...over }, NOW);
}

describe('reply token', () => {
  test('base32 round-trips and is lowercase', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 9, 77]);
    const enc = base32Encode(buf);
    expect(enc).toMatch(/^[a-z2-7]+$/);
    expect(base32Decode(enc)!.equals(buf)).toBe(true);
    expect(base32Decode(enc.toUpperCase())!.equals(buf)).toBe(true);
    expect(base32Decode('not base32!')).toBeNull();
  });

  test('fits an email local part: reply+ + token <= 64 chars', () => {
    const t = tok();
    expect(t).toHaveLength(TOKEN_LENGTH);
    expect(`reply+${t}`.length).toBeLessThanOrEqual(64);
  });

  test('sign → decode → verify for the right tenant', () => {
    const d = decodeReplyToken(tok())!;
    expect(d.type).toBe('rfis');
    expect(d.itemId).toBe(RFI);
    expect(verifyReplyToken(SECRET, d, TENANT, NOW)).toEqual({ ok: true });
  });

  test('survives a mail system upper-casing the address', () => {
    const d = decodeReplyToken(tok().toUpperCase())!;
    expect(verifyReplyToken(SECRET, d, TENANT, NOW)).toEqual({ ok: true });
  });

  test('another tenant, another secret or a flipped character fails', () => {
    const t = tok();
    const d = decodeReplyToken(t)!;
    expect(verifyReplyToken(SECRET, d, OTHER_TENANT, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyReplyToken('other-secret', d, TENANT, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    // Change one character inside the item id bytes: decodes to a different item, MAC no longer matches.
    const flipped = t.slice(0, 10) + (t[10] === 'a' ? 'b' : 'a') + t.slice(11);
    const fd = decodeReplyToken(flipped);
    expect(fd && verifyReplyToken(SECRET, fd, TENANT, NOW).ok).toBe(false);
  });

  test('expires', () => {
    const t = signReplyToken(SECRET, { tenantId: TENANT, type: 'submittals', itemId: RFI, recipient: ARCH, expiresAt: new Date('2026-10-17T00:00:00Z') }, NOW);
    const d = decodeReplyToken(t)!;
    expect(d.type).toBe('submittals');
    expect(verifyReplyToken(SECRET, d, TENANT, NOW).ok).toBe(true);
    expect(verifyReplyToken(SECRET, d, TENANT, new Date('2026-10-18T00:00:00Z'))).toEqual({ ok: false, reason: 'expired' });
  });

  test('recipient binding ignores case and display name, rejects anyone else', () => {
    const d = decodeReplyToken(tok())!;
    expect(isTokenRecipient(SECRET, d, 'jane.architect@studio-arch.com')).toBe(true);
    expect(isTokenRecipient(SECRET, d, 'Jane <JANE.ARCHITECT@STUDIO-ARCH.COM>')).toBe(true);
    expect(isTokenRecipient(SECRET, d, 'intern@studio-arch.com')).toBe(false);
  });

  test('garbage and wrong-length tokens do not decode', () => {
    expect(decodeReplyToken('')).toBeNull();
    expect(decodeReplyToken('abc')).toBeNull();
    expect(decodeReplyToken('a'.repeat(TOKEN_LENGTH))).toBeNull(); // version 0
  });

  test('buildReplyAddress keeps today\'s behavior when not configured', () => {
    const input = { tenantId: TENANT, type: 'rfis' as const, itemId: RFI, recipient: ARCH };
    expect(buildReplyAddress(input, { secret: '', domain: 'saguarocontrol.net' })).toBeNull();
    expect(buildReplyAddress(input, { secret: SECRET, domain: '' })).toBeNull();
    const addr = buildReplyAddress(input, { secret: SECRET, domain: 'Saguarocontrol.net' })!;
    expect(addr).toMatch(/^reply\+[a-z2-7]{52}@saguarocontrol\.net$/);
  });

  test('findReplyTokens: only our domain, any address form', () => {
    const t = tok();
    expect(findReplyTokens([`"Saguaro" <reply+${t}@saguarocontrol.net>`, 'someone@else.com'], 'saguarocontrol.net')).toEqual([t]);
    expect(findReplyTokens([`reply+${t}@formedlabs.co`], 'saguarocontrol.net')).toEqual([]);
    expect(findReplyTokens([`REPLY+${t.toUpperCase()}@SAGUAROCONTROL.NET`], 'saguarocontrol.net')).toEqual([t]);
  });
});

describe('svix webhook signature', () => {
  const secret = 'whsec_' + Buffer.from('a-very-secret-signing-key-bytes!').toString('base64');
  const body = '{"type":"email.received","data":{"email_id":"x"}}';
  const ts = String(Math.floor(NOW.getTime() / 1000));

  test('accepts a genuine signature (also among several during rotation)', () => {
    const sig = svixSign(secret, 'msg_1', ts, body);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, NOW.getTime())).toEqual({ ok: true });
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,AAAA v1,${sig}` }, body, NOW.getTime())).toEqual({ ok: true });
  });

  test('rejects a changed body, a stale timestamp, missing headers or secret', () => {
    const sig = svixSign(secret, 'msg_1', ts, body);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body + ' ', NOW.getTime())).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, NOW.getTime() + 10 * 60_000)).toEqual({ ok: false, reason: 'stale_timestamp' });
    expect(verifySvix(secret, { id: null, timestamp: ts, signature: `v1,${sig}` }, body, NOW.getTime())).toEqual({ ok: false, reason: 'missing_headers' });
    expect(verifySvix('', { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, NOW.getTime())).toEqual({ ok: false, reason: 'no_secret' });
  });
});

/* ── Real-shaped client replies ─────────────────────────────────────────── */

const GMAIL_TEXT = `Use the W12x26 shown on S-201. The S-101 callout is superseded.

Thanks,
Jane

On Thu, Oct 16, 2026 at 3:04 PM Saguaro Control Systems <
reply+abc@saguarocontrol.net> wrote:

> ${REPLY_MARKER}
> RFI #RFI-007 Submitted
> A new Request for Information has been submitted and requires your
> response.
`;

const GMAIL_HTML = `<div dir="ltr">Use the W12x26 shown on S-201.<div>The S-101 callout is superseded.</div></div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Thu, Oct 16, 2026 at 3:04 PM Saguaro &lt;reply+abc@saguarocontrol.net&gt; wrote:<br></div><blockquote class="gmail_quote"><p>${REPLY_MARKER}</p><h2>RFI #RFI-007 Submitted</h2></blockquote></div>`;

const OUTLOOK_TEXT = `Approved as noted - see markups on sheet 3, anchor spacing to 16" o.c.

Bob Engineer, PE
Structural Lead | Desert Structural Group
602-555-0100

________________________________
From: Saguaro Control Systems <noreply@saguarocontrol.net>
Sent: Thursday, October 16, 2026 3:04 PM
To: Bob Engineer <bob@desertstructural.com>
Subject: Submittal #05-12 for Review — Mesa Office
`;

const OUTLOOK_ORIGINAL = `We can accept the substitution.

-----Original Message-----
From: Saguaro Control Systems
Sent: Thursday, October 16, 2026 3:04 PM
Subject: RFI #RFI-003 Submitted
`;

const OUTLOOK_HTML = `<html><body><div class="WordSection1"><p class="MsoNormal">Revise and resubmit. Missing fire rating data.</p></div><div id="appendonsend"></div><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> Saguaro<br><b>Sent:</b> Thursday</div><div>${REPLY_MARKER}</div></body></html>`;

const APPLE_TEXT = `Owner is fine with this CO. Please proceed.

Sent from my iPhone

> On Oct 16, 2026, at 3:04 PM, Saguaro Control Systems <reply+abc@saguarocontrol.net> wrote:
>
> ${REPLY_MARKER}
> Change Order #4 Approved
`;

const APPLE_HTML = `<html><body dir="auto"><div dir="ltr">Owner is fine with this CO.</div><div dir="ltr">Please proceed.</div><div dir="ltr"><br><blockquote type="cite">On Oct 16, 2026, at 3:04 PM, Saguaro wrote:<br><br></blockquote></div><blockquote type="cite"><p>${REPLY_MARKER}</p></blockquote></body></html>`;

describe('quoted-text stripping', () => {
  test('Gmail plain text: cuts the wrapped "On … wrote:" and the > block', () => {
    expect(extractReply({ text: GMAIL_TEXT })).toBe('Use the W12x26 shown on S-201. The S-101 callout is superseded.\n\nThanks,\nJane');
  });

  test('Gmail HTML only: cuts at gmail_quote', () => {
    expect(extractReply({ html: GMAIL_HTML })).toBe('Use the W12x26 shown on S-201.\nThe S-101 callout is superseded.');
  });

  test('Outlook: cuts at the ____ rule + header block (signature above it stays)', () => {
    const out = extractReply({ text: OUTLOOK_TEXT });
    expect(out.startsWith('Approved as noted - see markups on sheet 3')).toBe(true);
    expect(out).toContain('Desert Structural Group');
    expect(out).not.toContain('From:');
    expect(out).not.toContain('Subject:');
  });

  test('Outlook: cuts at -----Original Message-----', () => {
    expect(extractReply({ text: OUTLOOK_ORIGINAL })).toBe('We can accept the substitution.');
  });

  test('Outlook HTML only: cuts at appendonsend / divRplyFwdMsg', () => {
    expect(extractReply({ html: OUTLOOK_HTML })).toBe('Revise and resubmit. Missing fire rating data.');
  });

  test('Apple Mail: drops "Sent from my iPhone" and the quoted original', () => {
    expect(extractReply({ text: APPLE_TEXT })).toBe('Owner is fine with this CO. Please proceed.');
    expect(extractReply({ html: APPLE_HTML })).toBe('Owner is fine with this CO.\nPlease proceed.');
  });

  test('our marker cuts even when the client adds no header line', () => {
    expect(stripQuotedText(`Yes, go ahead.\n\n${REPLY_MARKER}\nRFI #3 Submitted`)).toBe('Yes, go ahead.');
  });

  test('a "-- " signature delimiter ends the reply', () => {
    expect(stripQuotedText('Confirmed.\n-- \nJane Doe\nStudio Arch')).toBe('Confirmed.');
  });

  test('ordinary text that merely mentions From: or On is kept', () => {
    const body = 'From: the field, the beam is 2" low.\nOn the north side it is fine.';
    expect(stripQuotedText(body)).toBe(body);
  });

  test('prefers text, falls back to html when text is empty', () => {
    expect(extractReply({ text: '   ', html: '<p>Hello</p>' })).toBe('Hello');
    expect(extractReply({ text: null, html: null })).toBe('');
  });
});

describe('submittal verdicts', () => {
  test('standard stamps on the first line', () => {
    expect(parseSubmittalVerdict('Approved')).toBe('approved');
    expect(parseSubmittalVerdict('Approved.\nNice work')).toBe('approved');
    expect(parseSubmittalVerdict('No exceptions taken')).toBe('approved');
    expect(parseSubmittalVerdict('Approved as noted - see markups')).toBe('approved_as_noted');
    expect(parseSubmittalVerdict('Make corrections noted')).toBe('approved_as_noted');
    expect(parseSubmittalVerdict('Revise and resubmit. Missing data')).toBe('revise_resubmit');
    expect(parseSubmittalVerdict('Revise & Resubmit')).toBe('revise_resubmit');
    expect(parseSubmittalVerdict('Rejected: wrong product')).toBe('rejected');
    expect(parseSubmittalVerdict('Not approved.')).toBe('rejected');
  });

  test('anything else is a comment, not a decision', () => {
    expect(parseSubmittalVerdict('I have not approved this yet')).toBeNull();
    expect(parseSubmittalVerdict('Approved by whom? Please clarify.')).toBeNull();
    expect(parseSubmittalVerdict('Looks good, approved')).toBeNull();
    expect(parseSubmittalVerdict('')).toBeNull();
  });
});

describe('match helpers', () => {
  test('auto-replies are recognized by header or subject', () => {
    expect(isAutoReply({ 'Auto-Submitted': 'auto-replied' }, 'Re: RFI')).toBe(true);
    expect(isAutoReply({ 'auto-submitted': 'no' }, 'Re: RFI')).toBe(false);
    expect(isAutoReply({ Precedence: 'bulk' }, 'Re: RFI')).toBe(true);
    expect(isAutoReply({}, 'Automatic reply: RFI #7')).toBe(true);
    expect(isAutoReply({}, 'Out of Office: back Monday')).toBe(true);
    expect(isAutoReply({}, 'Re: RFI #7 Submitted')).toBe(false);
  });

  test('authentication: DMARC fail, or SPF and DKIM both failing, is spoofed', () => {
    expect(authenticationFailed({ spf: 'pass', dkim: 'pass', dmarc: 'fail' })).toBe(true);
    expect(authenticationFailed({ spf: 'fail', dkim: 'fail', dmarc: 'gray' })).toBe(true);
    expect(authenticationFailed({ spf: 'fail', dkim: 'pass', dmarc: 'pass' })).toBe(false);
    expect(authenticationFailed(null)).toBe(false);
  });

  test('distribution pulls addresses out of strings, arrays and JSON lists', () => {
    const d = itemDistribution('submittals',
      { submitted_to: 'Bob <BOB@desertstructural.com>', distribution: [{ name: 'Owner', email: 'owner@client.com' }], distribution_list: '["pm@gc.com"]' },
      { architect_email: 'jane@studio-arch.com' });
    expect([...d].sort()).toEqual(['bob@desertstructural.com', 'jane@studio-arch.com', 'owner@client.com', 'pm@gc.com']);
    expect(emailsIn(null).size).toBe(0);
  });

  test('display name from the From header', () => {
    expect(displayName('"Jane Architect" <jane@x.com>', 'jane@x.com')).toBe('Jane Architect');
    expect(displayName('jane@x.com', 'jane@x.com')).toBe('jane@x.com');
  });
});

/* ── The route's matching logic ─────────────────────────────────────────── */

describe('route matching', () => {
  const rfi = { id: RFI, tenant_id: TENANT, status: 'open', assigned_to_email: 'eng@consult.com', watchers: ['owner@client.com'], submitted_by: 'pm@gc.com' };
  const project = { architect_email: ARCH, gc_email: 'pm@gc.com' };
  const domain = 'saguarocontrol.net';

  function picked(token = tok()) {
    const p = pickToken({ to: [`reply+${token}@${domain}`], cc: ['someone@else.com'] }, domain);
    if ('reason' in p) throw new Error(p.reason);
    return p.decoded;
  }
  const base = () => ({ secret: SECRET, decoded: picked(), item: rfi, project, reply: 'Use S-201.', attachmentCount: 0, now: NOW });

  test('pickToken ignores mail for other domains and addresses', () => {
    expect(pickToken({ to: ['info@formedlabs.co'] }, domain)).toEqual({ reason: 'no_token' });
    expect(pickToken({ to: [`reply+${'a'.repeat(TOKEN_LENGTH)}@${domain}`] }, domain)).toEqual({ reason: 'bad_token' });
  });

  test('the token\'s recipient is accepted', () => {
    expect(screenReply({ ...base(), sender: ARCH.toUpperCase() })).toEqual({ ok: true, via: 'recipient', tenantId: TENANT });
  });

  test('someone on the item\'s distribution is accepted', () => {
    expect(screenReply({ ...base(), sender: 'eng@consult.com' })).toMatchObject({ ok: true, via: 'distribution' });
    expect(screenReply({ ...base(), sender: 'owner@client.com' })).toMatchObject({ ok: true, via: 'distribution' });
  });

  test('a stranger (forwarded copy) is rejected', () => {
    expect(screenReply({ ...base(), sender: 'stranger@gmail.com' })).toEqual({ ok: false, reason: 'sender_not_allowed' });
  });

  test('a token for another company\'s item is rejected', () => {
    expect(screenReply({ ...base(), item: { ...rfi, tenant_id: OTHER_TENANT }, sender: ARCH })).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('deleted item, expired token, auto-reply, spoofed and empty replies are rejected', () => {
    expect(screenReply({ ...base(), item: { ...rfi, deleted_at: '2026-10-01' }, sender: ARCH })).toEqual({ ok: false, reason: 'item_not_found' });
    expect(screenReply({ ...base(), item: null, sender: ARCH })).toEqual({ ok: false, reason: 'item_not_found' });
    expect(screenReply({ ...base(), sender: ARCH, now: new Date('2027-10-16T00:00:00Z') })).toEqual({ ok: false, reason: 'expired' });
    expect(screenReply({ ...base(), sender: ARCH, subject: 'Automatic reply: RFI' })).toEqual({ ok: false, reason: 'auto_reply' });
    expect(screenReply({ ...base(), sender: ARCH, authentication: { dmarc: 'fail' } })).toEqual({ ok: false, reason: 'spoofed' });
    expect(screenReply({ ...base(), sender: ARCH, reply: '  ' })).toEqual({ ok: false, reason: 'empty_reply' });
    expect(screenReply({ ...base(), sender: ARCH, reply: '', attachmentCount: 2 })).toMatchObject({ ok: true });
  });

  test('RFI: the recipient / assignee / architect answers an open RFI officially; others comment', () => {
    expect(planReply('rfis', rfi, { via: 'recipient', sender: ARCH, reply: 'Use S-201.', project })).toEqual({ type: 'rfis', official: true });
    expect(planReply('rfis', rfi, { via: 'distribution', sender: 'eng@consult.com', reply: 'Use S-201.', project })).toEqual({ type: 'rfis', official: true });
    expect(planReply('rfis', rfi, { via: 'distribution', sender: 'owner@client.com', reply: 'Agree.', project })).toEqual({ type: 'rfis', official: false });
    expect(planReply('rfis', { ...rfi, status: 'answered' }, { via: 'recipient', sender: ARCH, reply: 'Follow-up', project })).toEqual({ type: 'rfis', official: false });
    expect(planReply('rfis', rfi, { via: 'recipient', sender: ARCH, reply: '', project })).toEqual({ type: 'rfis', official: false });
  });

  test('submittal: a stamp returns it only while in review; CO is a comment', () => {
    expect(planReply('submittals', { status: 'under_review' }, { via: 'recipient', sender: ARCH, reply: 'Approved as noted' })).toEqual({ type: 'submittals', verdict: 'approved_as_noted' });
    expect(planReply('submittals', { status: 'approved' }, { via: 'recipient', sender: ARCH, reply: 'Rejected' })).toEqual({ type: 'submittals', verdict: null });
    expect(planReply('submittals', { status: 'submitted' }, { via: 'recipient', sender: ARCH, reply: 'Can you send the cut sheet?' })).toEqual({ type: 'submittals', verdict: null });
    expect(planReply('change_orders', { status: 'approved' }, { via: 'recipient', sender: ARCH, reply: 'Thanks' })).toEqual({ type: 'change_orders' });
  });
});
