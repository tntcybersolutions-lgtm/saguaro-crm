/**
 * Sub portal scope for roster subs and email-only invites.
 * Run: npx -y tsx lib/sub-portal-scope.sanity.test.ts   (exit 0 = every assertion held)
 */
import { notOnRoster, NOT_ON_ROSTER, portalMemberId, rosterSubId, sessionProjectId, subRecordScope } from './sub-portal-scope';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const roster = { id: 'sess-1', tenant_id: 'ten-1', project_id: 'proj-1', sub_id: 'sub-1', sub_company: 'Acme Drywall', sub_contact_name: 'Ana' };
const emailOnly = { id: 'sess-2', tenant_id: 'ten-1', project_id: 'proj-1', sub_id: null, sub_company: 'Desert Glass', sub_contact_name: 'Bo' };

// rosterSubId
check('roster session → its sub', rosterSubId(roster) === 'sub-1');
check('email-only (null) → null', rosterSubId(emailOnly) === null);
check('undefined sub_id → null', rosterSubId({}) === null);
check('blank sub_id → null, never an empty-string uuid', rosterSubId({ sub_id: '  ' }) === null);

// sessionProjectId
check('session job', sessionProjectId(roster) === 'proj-1');
check('no job → null', sessionProjectId({ project_id: null }) === null && sessionProjectId({ project_id: '' }) === null);

// subRecordScope — the only door to the sub-owned tables
const sc = subRecordScope(roster);
check('roster session scopes to its own tenant, job and sub', !!sc && sc.tenantId === 'ten-1' && sc.projectId === 'proj-1' && sc.subId === 'sub-1');
check('email-only session gets no scope (reads go empty)', subRecordScope(emailOnly) === null);
check('roster sub but no job gets no scope', subRecordScope({ ...roster, project_id: null }) === null);
check('scope never carries a null into a filter', (() => { const s = subRecordScope(roster)!; return Object.values(s).every((v) => typeof v === 'string' && v.length > 0); })());

// portalMemberId — radio identity
check('roster session is known by its sub', portalMemberId(roster) === 'sub-1');
check('email-only session is known by its own session id', portalMemberId(emailOnly) === 'sess-2');
check('two email-only sessions never share an identity', portalMemberId(emailOnly) !== portalMemberId({ ...emailOnly, id: 'sess-3' }));

// notOnRoster — the refusal
const r = notOnRoster(emailOnly, 'an RFI');
check('refusal is 403', r.status === 403);
check('refusal carries a machine code', r.body.code === NOT_ON_ROSTER);
check('refusal names the company and the thing', r.body.error.startsWith('Desert Glass') && r.body.error.includes('an RFI'));
check('refusal says what to do', /add you as a subcontractor/.test(r.body.error));
check('falls back to the contact, then a plain phrase', notOnRoster({ sub_company: null, sub_contact_name: 'Bo' }, 'x').body.error.startsWith('Bo') && notOnRoster({}, 'x').body.error.startsWith('Your company'));

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall sub portal scope assertions held');
