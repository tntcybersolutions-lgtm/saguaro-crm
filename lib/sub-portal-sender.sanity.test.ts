/**
 * Sub portal sender name (portal_sub_messages.sender_name is NOT NULL).
 * Run: npx -y tsx lib/sub-portal-sender.sanity.test.ts   (exit 0 = every assertion held)
 */
import { portalSenderName, senderCompany, senderContact } from './sub-portal-sender';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const noSession = { sub_company: null, sub_contact_name: null, sub_email: null };

// Roster sub wins
check('roster contact + company', portalSenderName({ contact_name: 'Maria Lopez', company_name: 'ABC Electric' }, noSession) === 'Maria Lopez (ABC Electric)');
check('roster beats session', portalSenderName(
  { contact_name: 'Maria Lopez', company_name: 'ABC Electric' },
  { sub_company: 'Typed Co', sub_contact_name: 'Typed Person', sub_email: 'x@y.com' },
) === 'Maria Lopez (ABC Electric)');
check('roster company only', portalSenderName({ company_name: 'ABC Electric' }, noSession) === 'ABC Electric');

// Session fills the gaps
check('roster company + session contact', portalSenderName({ company_name: 'ABC Electric', contact_name: '  ' }, { ...noSession, sub_contact_name: 'Sam' }) === 'Sam (ABC Electric)');
check('no roster → session contact + company', portalSenderName(null, { sub_company: 'Desert Drywall', sub_contact_name: 'Jo Diaz', sub_email: 'jo@dd.com' }) === 'Jo Diaz (Desert Drywall)');
check('no roster → session company only', portalSenderName(null, { ...noSession, sub_company: 'Desert Drywall' }) === 'Desert Drywall');
check('no roster → session email only', portalSenderName(undefined, { ...noSession, sub_email: 'jo@dd.com' }) === 'jo@dd.com');
check('roster contact_email beats session email', portalSenderName({ contact_email: 'office@abc.com' }, { ...noSession, sub_email: 'jo@dd.com' }) === 'office@abc.com');

// Never empty
check('nothing known → Subcontractor', portalSenderName(null, noSession) === 'Subcontractor');
check('whitespace only → Subcontractor', portalSenderName({ contact_name: ' ', company_name: '\t' }, { sub_company: ' ', sub_contact_name: '', sub_email: '  ' }) === 'Subcontractor');

// Same text twice is said once
check('contact equal to company is not doubled', portalSenderName({ contact_name: 'ABC Electric', company_name: 'abc electric' }, noSession) === 'ABC Electric');
check('inner whitespace collapsed', portalSenderName({ contact_name: 'Maria   Lopez' }, noSession) === 'Maria Lopez');

// Parts
check('senderContact falls back to session', senderContact({}, { ...noSession, sub_contact_name: 'Sam' }) === 'Sam');
check('senderCompany falls back to session', senderCompany(null, { ...noSession, sub_company: 'DD' }) === 'DD');
check('senderCompany empty when unknown', senderCompany(null, noSession) === '');

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall sub portal sender assertions held');
