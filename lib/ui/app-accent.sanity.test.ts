/**
 * The module-to-accent map (lib/ui/app-accent) and its mirror of the --mod-*
 * tokens in app/globals.css.
 * Run: npx -y tsx lib/ui/app-accent.sanity.test.ts   (exit 0 = every assertion held)
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_ACCENTS } from '../module-identity';
import { DOMAIN_HEX, moduleDomain, moduleAccent, moduleKeyFromPath, accentForPath } from './app-accent';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* The TS mirror equals the CSS tokens. */
const css = fs.readFileSync(path.join(__dirname, '../../app/globals.css'), 'utf8');
for (const [d, hex] of Object.entries(DOMAIN_HEX)) {
  const m = new RegExp(`--mod-${d}:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
  check(`--mod-${d} mirrors DOMAIN_HEX`, !!m && m[1].toUpperCase() === hex.toUpperCase(), m ? m[1] : 'missing');
}

/* Every module identity key has a deliberate domain (only the system keys fall to core). */
const systemKeys = new Set(['default', 'brand', 'sage', 'autopilot', 'reports', 'scheduledreports', 'notifications', 'search', 'bookmarks', 'syncqueue']);
const unassigned = Object.keys(MODULE_ACCENTS).filter((k) => !systemKeys.has(k) && moduleDomain(k) === 'core');
check('every product module is assigned a domain', unassigned.length === 0, unassigned.join(', '));

/* Status hues never double as module accents. */
const status = ['#4ADE80', '#FBBF24', '#F87171', '#E8FF2A'];
check('no domain hue is a status hue or the action yellow', Object.values(DOMAIN_HEX).every((h) => !status.includes(h.toUpperCase())));

/* Aliases resolve through lib/module-identity. */
check('daily-logs → field', moduleDomain('daily-logs') === 'field');
check('pay-apps → money', moduleDomain('pay-apps') === 'money');
check('leads → sales (not a module-identity key)', moduleDomain('leads') === 'sales');
check('unknown → core', moduleDomain('zzz-not-a-module') === 'core');

/* moduleAccent keeps literal hexes (callers append alpha suffixes). */
const a = moduleAccent('rfis');
check('moduleAccent returns literal hexes', /^#[0-9A-F]{6}$/.test(a.hex) && /^#[0-9A-F]{6}$/.test(a.soft) && /^#[0-9A-F]{6}$/.test(a.ring), JSON.stringify(a));
check('rfis wear the docs hue', a.hex === DOMAIN_HEX.docs);

/* Routes → module keys. */
const id = '0ca5f539-f7ed-4daf-afc3-509a84770d96';
check('/app → home', moduleKeyFromPath('/app') === 'home');
check('/app/leads/<id> → leads', moduleKeyFromPath(`/app/leads/${id}`) === 'leads');
check('/app/projects → projects', moduleKeyFromPath('/app/projects') === 'projects');
check('/app/projects/<id>/overview → overview', moduleKeyFromPath(`/app/projects/${id}/overview`) === 'overview');
check('/app/projects/<id>/pay-apps/<id> → pay-apps', moduleKeyFromPath(`/app/projects/${id}/pay-apps/${id}`) === 'pay-apps');
check('/app/invoicing/<id> → money hue', accentForPath(`/app/invoicing/${id}`) === DOMAIN_HEX.money);
check('/app/daily-logs/<id> → field hue', accentForPath(`/app/daily-logs/${id}`) === DOMAIN_HEX.field);
check('/app/compliance → people hue', accentForPath('/app/compliance') === DOMAIN_HEX.people);
check('outside /app → core hue', accentForPath('/login') === DOMAIN_HEX.core);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
