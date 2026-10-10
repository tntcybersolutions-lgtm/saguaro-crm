/**
 * A bid jacket's Correspondence timeline, and the email-to-text the record keeps.
 * Run: npx -y tsx lib/jacket-correspondence.sanity.test.ts   (exit 0 = every assertion held)
 */
import { buildCorrespondence, isAsk } from './jacket-correspondence';
import { htmlToText } from './comm-log';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const invites = [
  { id: 'i1', sub_id: 'sA', company_name: 'ZZ AUDIT Ruiz & Sons', sub_email: 'delivered@resend.dev', invited_at: '2026-10-01T15:00:00Z', invitation_viewed_at: '2026-10-02T16:00:00Z' },
  { id: 'i2', sub_id: 'sB', company_name: 'ZZ AUDIT Cactus Electric', sub_email: 'delivered@resend.dev', invited_at: '2026-09-20T15:00:00Z' },
];
const log = [
  { id: 'L1', created_at: '2026-10-01T15:00:05Z', related_type: 'bid_invite', related_id: 'i1', sub_id: 'sA', to_address: 'delivered@resend.dev', to_name: 'ZZ AUDIT Ruiz & Sons', subject: "You're invited to bid", body: 'Bid due Oct 20', status: 'sent', direction: 'out' },
  { id: 'L2', created_at: '2026-10-05T15:00:00Z', related_type: 'addendum', sub_id: null, to_address: 'delivered@resend.dev', to_name: 'ZZ AUDIT Cactus Electric', subject: 'Addendum 1', body: 'Revised stair', status: 'failed', error: 'bad address', direction: 'out' },
];
const chats = [
  { id: 'c1', sub_id: 'sA', sender_type: 'sub', content: 'ZZ AUDIT Is the alt price required?', created_at: '2026-10-03T10:00:00Z' },
  { id: 'c2', sub_id: 'sA', sender_type: 'gc', content: 'ZZ AUDIT Builders needs updated paperwork from you:\n• W-9 — we don\'t have one on file.', created_at: '2026-10-04T10:00:00Z' },
  { id: 'c3', sub_id: 'sZ', sender_type: 'sub', content: 'not on this package', created_at: '2026-10-04T11:00:00Z' },
];
const submissions = [{ id: 'b1', sub_id: 'sA', company_name: 'ZZ AUDIT Ruiz & Sons', base_amount: 48250, submitted_at: '2026-10-06T18:00:00Z', exclusions: 'Permits' }];

const items = buildCorrespondence({ log, chats, invites, submissions });
const ids = items.map((i) => i.id);
check('newest first', items[0].id === 'bid:b1' && items[items.length - 1].id === 'invited:i2', ids.join());
check('logged invite email shown, labelled', items.some((i) => i.id === 'log:L1' && i.title === 'Invitation emailed' && i.status === 'sent'));
check('a logged invite is not also shown as a bare "Invited" event', !ids.includes('invited:i1'));
check('an invite from before the email record still shows', ids.includes('invited:i2') && items.find((i) => i.id === 'invited:i2')!.title === 'Invited ZZ AUDIT Cactus Electric');
check('failed email keeps its status and reason', items.find((i) => i.id === 'log:L2')!.status === 'failed' && items.find((i) => i.id === 'log:L2')!.error === 'bad address');
check('invitation opened', items.some((i) => i.id === 'viewed:i1' && i.direction === 'in' && /opened the invitation/.test(i.title)));
check('sub message in, with who', items.some((i) => i.id === 'chat:c1' && i.direction === 'in' && i.title === 'Message from ZZ AUDIT Ruiz & Sons'));
check('Ask for it recognised', items.some((i) => i.id === 'chat:c2' && i.kind === 'ask' && i.title === 'Asked for paperwork'));
check('chat with a sub not on this package left out', !ids.includes('chat:c3'));
check('bid received with amount and notes', items.some((i) => i.id === 'bid:b1' && i.title === 'Bid received from ZZ AUDIT Ruiz & Sons — $48,250' && /Exclusions: Permits/.test(i.body || '')));
check('empty package → empty timeline', buildCorrespondence({ log: [], chats: [], invites: [], submissions: [] }).length === 0);
const anon = buildCorrespondence({ log: [{ id: 'L9', created_at: '2026-10-07T00:00:00Z', related_type: 'addendum', to_address: 'delivered@resend.dev', status: 'sent' }], chats: [], invites: [], submissions: [] })[0];
check('email with no name: no party, address shown once as "to"', anon.party === '' && anon.to === 'delivered@resend.dev' && anon.title === 'Addendum emailed');
check('isAsk', isAsk('X needs updated paperwork from you:') && !isAsk('hello'));

const text = htmlToText('<html><style>p{}</style><h1>Bid due</h1><p>Hello&nbsp;<b>Ruiz</b> &amp; Sons</p><br/><a href="https://saguarocontrol.net/portals/bid/t1" style="x">Open <b>jacket</b></a><script>evil()</script></html>');
check('html → readable text, link address kept', text === 'Bid due\nHello Ruiz & Sons\n\nOpen jacket (https://saguarocontrol.net/portals/bid/t1)', JSON.stringify(text));
check('mailto / bare links read once', htmlToText('<a href="mailto:a@b.co">a@b.co</a> <a href="https://x.co">https://x.co</a>') === 'a@b.co https://x.co');
check('long bodies capped', htmlToText('x'.repeat(9000)).length === 8000);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
