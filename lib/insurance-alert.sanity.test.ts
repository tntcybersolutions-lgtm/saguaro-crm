/**
 * Insurance-expiring alert: the select names only live columns, and the
 * recipients / display name resolve the way the trigger needs.
 * Run: npx -y tsx lib/insurance-alert.sanity.test.ts   (exit 0 = every assertion held)
 */
import { INSURANCE_ALERT_SELECT, insuranceAlertParties } from './insurance-alert';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Live columns (information_schema, 10 Oct 2026) — the embed may only name these.
const LIVE: Record<string, string[]> = {
  subcontractors: ['tenant_id', 'company_name', 'contact_name', 'email', 'contact_email'],
  projects: ['tenant_id', 'name', 'gc_email', 'pm_email', 'owner_email'],
};
const embeds = [...INSURANCE_ALERT_SELECT.matchAll(/(\w+)\(([^)]*)\)/g)].map((m) => ({ table: m[1], cols: m[2].split(',').map((s) => s.trim()).filter(Boolean) }));
check('select embeds subcontractors and projects', embeds.map((e) => e.table).sort().join(',') === 'projects,subcontractors');
for (const e of embeds) {
  const bad = e.cols.filter((c) => !LIVE[e.table]?.includes(c));
  check(`${e.table} embed names only live columns`, bad.length === 0, `unknown: ${bad.join(', ')}`);
}
check('the column that broke it (subcontractors.name) is gone', !/subcontractors\([^)]*\bname\b/.test(INSURANCE_ALERT_SELECT.replace(/company_name|contact_name/g, '')));

const project = { name: 'Pima Detention', gc_email: 'pm@gc.test', tenant_id: 'ten-1' };

// Normal roster sub
const a = insuranceAlertParties({ sub_name: 'Typed Name', subcontractors: { company_name: 'Acme Drywall', email: 'office@acme.test', contact_email: 'ana@acme.test' }, projects: project });
check('roster company name wins', a?.subName === 'Acme Drywall');
check('sub email', a?.subEmail === 'office@acme.test');
check('GC email', a?.gcEmail === 'pm@gc.test');
check('project and tenant carried', a?.projectName === 'Pima Detention' && a?.tenantId === 'ten-1');

// Fallbacks
check('contact_email when email blank', insuranceAlertParties({ subcontractors: { company_name: 'X', email: ' ', contact_email: 'c@x.test' }, projects: project })?.subEmail === 'c@x.test');
check('certificate sub_name when no roster sub', insuranceAlertParties({ sub_name: 'Desert Glass', subcontractors: null, projects: project })?.subName === 'Desert Glass');
check('no roster sub → no sub email, GC still told', (() => { const p = insuranceAlertParties({ sub_name: 'Desert Glass', subcontractors: null, projects: project }); return p?.subEmail === null && p?.gcEmail === 'pm@gc.test'; })());
check('nothing named → Subcontractor', insuranceAlertParties({ projects: project })?.subName === 'Subcontractor');
check('array-shaped embeds read too', insuranceAlertParties({ subcontractors: [{ company_name: 'Arr Co', email: 'a@a.test' }], projects: [project] })?.subName === 'Arr Co');
check('no project → null (nowhere to point the alert)', insuranceAlertParties({ subcontractors: { company_name: 'X' }, projects: null }) === null);
check('no GC email → null, not empty string', insuranceAlertParties({ projects: { ...project, gc_email: '' } })?.gcEmail === null);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall insurance alert assertions held');
