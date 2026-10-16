/**
 * Sanity checks for the top bar's title / back-link rules (lib/topbar-crumbs).
 * Run: bundle with esbuild (--bundle --platform=node --format=cjs) and node it.
 */
import { resolveTopBar } from './topbar-crumbs';

let fails = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && detail ? ' — ' + detail : ''}`);
}
const J = '3f2a9c1e-1b2c-4d5e-8f90-123456789abc';
const R = 'aa2a9c1e-1b2c-4d5e-8f90-123456789abc';
const names = { [J]: 'Copper Ridge Data Center Phase II' };
const t = (p: string, company: string | null = null) => resolveTopBar(p, { projectNames: names, companyName: company });

// Tab pages: no back link.
check('Home: company name, no back', t('/app', 'Saguaro Control Systems').title === 'Saguaro Control Systems' && t('/app').back === null);
check('Home without a company: "Home"', t('/app').title === 'Home');
check('My Day: no back', t('/app/my-work').title === 'My Day' && t('/app/my-work').back === null);
check('Jobs: no back', t('/app/projects').title === 'Jobs' && t('/app/projects').back === null);
check('Time: no back', t('/app/time').title === 'Time' && t('/app/time').back === null);
// Sections under Home: no "← Home".
check('Compliance: no back', t('/app/compliance').back === null && t('/app/compliance').title === 'Compliance');
check('Command Center: full title, no back', t('/app/command-center').title === 'Command Center' && t('/app/command-center').back === null);
// Sub-pages: ‹ Parent.
const ld = t('/app/compliance/lien-deadlines');
check('Lien Deadlines: ‹ Compliance', ld.title === 'Lien Deadlines' && ld.back?.label === 'Compliance' && ld.back?.href === '/app/compliance', JSON.stringify(ld));
const qc = t('/app/command-center/qc');
check('QC: ‹ Command Center', qc.title === 'QC' && qc.back?.label === 'Command Center', JSON.stringify(qc));
// Jobs.
const job = t(`/app/projects/${J}`);
check('job overview: ‹ Jobs, no title (the page names the job)', job.title === '' && job.back?.label === 'Jobs' && job.back?.href === '/app/projects', JSON.stringify(job));
const rfis = t(`/app/projects/${J}/rfis`);
check('job tool: ‹ <job name>', rfis.title === 'RFIs' && rfis.back?.label === names[J] && rfis.back?.href === `/app/projects/${J}`, JSON.stringify(rfis));
const unknownJob = resolveTopBar(`/app/projects/${J}/rfis`);
check('unknown job name falls back to "Job", never an id', unknownJob.back?.label === 'Job');
const jacket = t(`/app/projects/${J}/bid-packages/${R}/jacket`);
check('record parent named after its list', jacket.title === 'Jacket' && jacket.back?.label === 'Bid Package' && jacket.back?.href === `/app/projects/${J}/bid-packages/${R}`, JSON.stringify(jacket));
const inv = t(`/app/invoicing/${R}`);
check('record page: no id in the title, ‹ Invoicing', inv.title === '' && inv.back?.label === 'Invoicing', JSON.stringify(inv));
check('query string ignored', t('/app/compliance/lien-deadlines?x=1').title === 'Lien Deadlines');
check('trailing slash ignored', t('/app/').title === 'Home' && t('/app/compliance/').back === null);

console.log(`\n${fails ? fails + ' FAILED' : 'all passed'}`);
if (fails) process.exit(1);
