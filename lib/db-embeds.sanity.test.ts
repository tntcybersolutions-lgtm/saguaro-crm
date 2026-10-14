/**
 * Embeds across a table pair with two identical FKs name their constraint.
 * Run: npx -y tsx lib/db-embeds.sanity.test.ts   (exit 0 = every assertion held)
 */
import { embed, qualifyEmbeds } from './db-embeds';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const eq = (name: string, got: string, want: string) => check(name, got === want, `got ${got}`);

eq('rfis → projects names its constraint', embed('rfis', 'projects'), 'projects!rfis_project_id_fkey');
eq('either direction', embed('projects', 'punch_list'), 'punch_list!punch_list_project_id_fkey');
eq('takeoff_materials → takeoffs', embed('takeoff_materials', 'takeoffs'), 'takeoffs!takeoff_materials_takeoff_id_fkey');
eq('a single-FK pair is left bare', embed('pay_applications', 'projects'), 'projects');
eq('lien_waivers → subcontractors is two DIFFERENT columns: not ours to guess', embed('lien_waivers', 'subcontractors'), 'subcontractors');

eq('Sage join appended to a column list', qualifyEmbeds('rfis', 'id,rfi_number,subject,status,projects(name)'), 'id,rfi_number,subject,status,projects!rfis_project_id_fkey(name)');
eq('star + spaced embed', qualifyEmbeds('daily_logs', '*, projects(name, id)'), '*, projects!daily_logs_project_id_fkey(name, id)');
eq('aliased embed keeps its alias', qualifyEmbeds('punch_list', 'id, job:projects(name)'), 'id, job:projects!punch_list_project_id_fkey(name)');
eq('already named: unchanged', qualifyEmbeds('rfis', '*, projects!rfis_project_id_fkey(name)'), '*, projects!rfis_project_id_fkey(name)');
eq('unrelated table: unchanged', qualifyEmbeds('pay_applications', '*, projects(name)'), '*, projects(name)');
eq('nested embed belongs to its own parent', qualifyEmbeds('bid_packages', '*, projects(*, rfis(id))'), '*, projects(*, rfis(id))');
eq('nested under an ambiguous one: only the top level changes', qualifyEmbeds('change_orders', '*, projects(name, rfis(id))'), '*, projects!change_orders_project_id_fkey(name, rfis(id))');
eq('column names that contain the word are not embeds', qualifyEmbeds('rfis', 'id,projects_count'), 'id,projects_count');
eq('no embeds at all', qualifyEmbeds('rfis', '*'), '*');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
