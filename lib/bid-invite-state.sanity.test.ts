/**
 * One bidder's invitation, read the same way everywhere — and the bid figure.
 * Run: npx -y tsx lib/bid-invite-state.sanity.test.ts   (exit 0 = every assertion held)
 */
import { inviteState, isPending, holdsIssuedJacket, jacketDelivery, reinvitePatch } from './bid-invite-state';
import { bidAmount } from './bid-amount';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const J = (x: unknown) => JSON.stringify(x);

// ── State: response_status first, then status; revoked wins ──
check('viewed shows (the portal writes response_status; status still says invited)', inviteState({ status: 'invited', response_status: 'viewed' }) === 'viewed');
check('older rows: status only', inviteState({ status: 'submitted', response_status: null }) === 'submitted');
check('revoked on status wins over a response', inviteState({ status: 'revoked', response_status: 'submitted' }) === 'revoked');
check('revoked on response_status wins', inviteState({ status: 'invited', response_status: 'revoked' }) === 'revoked');
check('withdrawn reads as revoked', inviteState({ status: 'withdrawn' }) === 'revoked');
check('nothing → invited', inviteState({}) === 'invited' && inviteState(null) === 'invited');
check('junk → invited', inviteState({ status: 'banana' }) === 'invited');
check('pending = invited or viewed', isPending({ response_status: 'viewed' }) && isPending({ status: 'invited' }) && !isPending({ status: 'declined' }) && !isPending({ status: 'submitted' }) && !isPending({ status: 'revoked' }));

// ── Holding the issued jacket ──
const issuedAt = '2026-10-10T17:00:00.000Z';
check('emailed after the issue → holds it', holdsIssuedJacket({ invited_at: '2026-10-10T17:00:02Z' }, issuedAt));
check('emailed at the issue instant → holds it', holdsIssuedJacket({ invited_at: issuedAt }, issuedAt));
check('emailed before the issue (the old pre-issue invite) → does not', !holdsIssuedJacket({ invited_at: '2026-10-01T00:00:00Z' }, issuedAt));
check('never emailed (a failed send) → does not', !holdsIssuedJacket({ invited_at: null }, issuedAt));
check('revoked → does not, whatever was sent', !holdsIssuedJacket({ invited_at: '2026-10-11T00:00:00Z', status: 'revoked' }, issuedAt));
check('not issued → nobody holds it', !holdsIssuedJacket({ invited_at: '2026-10-11T00:00:00Z' }, null));

// ── What the GC's table says about the email ──
check('emailed → date', J(jacketDelivery({ invited_at: '2026-10-10T17:00:02Z' }, issuedAt)) === J({ state: 'emailed', at: '2026-10-10T17:00:02Z', error: null }));
check('failed → the reason from the record', J(jacketDelivery({ invited_at: null }, issuedAt, { status: 'failed', error: 'The recipient address bounced.', created_at: 'x' })) === J({ state: 'failed', at: 'x', error: 'The recipient address bounced.' }));
check('not configured → failed, with a reason', jacketDelivery({}, issuedAt, { status: 'not_sent', error: null }).state === 'failed' && !!jacketDelivery({}, issuedAt, { status: 'not_sent' }).error);
check('nothing yet → not emailed', jacketDelivery({}, issuedAt, null).state === 'not_emailed');
check('legacy package never issued but invite emailed → emailed', jacketDelivery({ invited_at: '2026-09-01T00:00:00Z' }, null).state === 'emailed');
check('a later success beats an older failure in the record', jacketDelivery({ invited_at: '2026-10-11T00:00:00Z' }, issuedAt, { status: 'failed' }).state === 'emailed');

// ── Re-inviting never wipes an answer ──
for (const st of ['submitted', 'declined', 'viewed', 'invited']) {
  const { patch, restored } = reinvitePatch({ status: st, response_status: st }, { name: 'ZZ AUDIT New Name' });
  check(`re-invite a ${st} sub: answer untouched`, !('status' in patch) && !('response_status' in patch) && !restored, J(patch));
}
const rv = reinvitePatch({ status: 'revoked', response_status: 'revoked' }, {});
check('re-invite a revoked sub: link restored to invited', rv.restored && rv.patch.status === 'invited' && rv.patch.response_status === 'invited');
const sg = reinvitePatch({ status: 'suggested' }, {});
check('a suggested sub named on an invite becomes invited', sg.restored && sg.patch.status === 'invited');
check('contact details refreshed', J(reinvitePatch({ status: 'invited' }, { company: 'ZZ AUDIT Co', contactName: 'ZZ AUDIT Pat', phone: '602-555-0100' }).patch) === J({ company_name: 'ZZ AUDIT Co', contact_name: 'ZZ AUDIT Pat', contact_phone: '602-555-0100' }));
check('roster link added only when missing', reinvitePatch({ status: 'invited', sub_id: null }, { subId: 's1' }).patch.sub_id === 's1' && !('sub_id' in reinvitePatch({ status: 'invited', sub_id: 's0' }, { subId: 's1' }).patch));

// ── The bid figure ──
check('base_amount leads', bidAmount({ base_amount: 48250, amount: 0 }) === 48250);
check('amount 0 (its default) does not stop the chain', bidAmount({ base_amount: null, amount: 0, base_bid: 55100 }) === 55100);
check('amount when it is the only figure', bidAmount({ amount: 7840 }) === 7840);
check('numeric strings read', bidAmount({ base_amount: '96000' }) === 96000);
check('nothing → 0', bidAmount({}) === 0 && bidAmount(null) === 0);
check('the old award coalesce gave $0 here', (Number(({ amount: 0, base_amount: 48250 } as any).amount ?? 48250) || 0) === 0);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
