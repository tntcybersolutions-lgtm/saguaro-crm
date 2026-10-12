/**
 * The module accent inside the app — ONE map from a module (or an /app route)
 * to one of eight domain hues. The hues are the `--mod-*` tokens in
 * app/globals.css; `DOMAIN_HEX` mirrors them for the callers that need a real
 * hex (canvas, SVG attributes, `accent.hex + '33'` alpha suffixes).
 *
 * Accents mark identity only: icon tiles, sidebar glyphs, a header tile. Status
 * meaning (green / amber / red) never comes from here, and yellow stays the
 * primary action and the selected item.
 *
 * The app shell sets `--acc` on the content area from `accentForPath()`, so
 * every shared tile on a page (SectionCard, IconTile, stat icons, timeline
 * dots, ModuleHero) takes the page's module colour with no per-page code.
 */
import { moduleAccent as identity, type ModuleAccent } from '@/lib/module-identity';

export type ModuleDomain = 'core' | 'sales' | 'precon' | 'build' | 'field' | 'money' | 'docs' | 'people';

/** Mirror of the --mod-* tokens in app/globals.css (keep identical). */
export const DOMAIN_HEX: Record<ModuleDomain, string> = {
  core: '#38BDF8',
  sales: '#A78BFA',
  precon: '#22D3EE',
  build: '#818CF8',
  field: '#2DD4BF',
  money: '#F472B6',
  docs: '#60A5FA',
  people: '#FB923C',
};

const CARD = '#1B2636';

/* Every module key in lib/module-identity, plus the /app route names that are
   not modules there (leads, customers, settings…), assigned to one domain. */
const DOMAIN_OF: Record<string, ModuleDomain> = {};
const put = (d: ModuleDomain, keys: string) => keys.split(/\s+/).filter(Boolean).forEach((k) => { DOMAIN_OF[k] = d; });
put('sales', 'bids bidintelligence leads lead customers customer crm pipeline intelligence bidboard clientportal reviews referrals marketing');
put('precon', 'takeoff signal estimates estimate estimating catalog bidpackages bidleveling leveling bim bimviewer selections assemblies preconstruction newproject proposal proposals');
put('build', 'schedule contracts commitments todos approvals approvalworkflows submittals meetings coordination instructions actionplans forms closeout warranty warrantyclaims commandcenter ccchecklists ccescalations cckpis cclonglead ccmilestones ccoac ccownerupdates ccportals ccpresite ccqc ccrisks ccrollout ccvendors ccverify franchiserollout resourceplanning tm work projects project jobs job overview execution service portfolio');
put('field', 'daily photos punch time deliveries inspections fieldissues observations crews equipment fleet fleetasset voice radio timesheets field');
put('money', 'payapps budget invoices bills changeorders changeevents waivers directcosts financials costcodes certifiedpayroll billing invoicing financial accounting expenses quickbooks purchaseorders cashflow payroll');
put('docs', 'drawings specs documents permits rfis messages correspondence transmittals askdocs files ask');
put('people', 'subs team compliance safety insurance w9 people contacts employeedetail prequalification vendors directory rolespermissions roles customfields');
put('core', 'sage autopilot reports scheduledreports reportsbuilder notifications search bookmarks syncqueue settings integrations dashboard dashboardconfig home default brand classic notificationsettings');

const norm = (k: string) => String(k).toLowerCase().replace(/^\//, '').replace(/[-_\s]/g, '');

/** The domain a module key (or route segment) belongs to. */
export function moduleDomain(key?: string | null): ModuleDomain {
  if (!key) return 'core';
  const raw = norm(key);
  const canonical = identity(raw).key; // 'default' when lib/module-identity does not know it
  return (canonical !== 'default' ? DOMAIN_OF[canonical] : undefined) ?? DOMAIN_OF[raw] ?? 'core';
}

/** `hex` blended over the card colour — a literal hex for tile grounds and rings. */
function mix(hex: string, amount: number, base = CARD): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(base);
  return '#' + a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Accent for a module key. Key and name are the module's own. */
export function moduleAccent(key?: string | null): ModuleAccent {
  const { key: k, name } = identity(key);
  const hex = DOMAIN_HEX[moduleDomain(key)];
  return { key: k, name, hex, soft: mix(hex, 0.16), ring: mix(hex, 0.45), vivid: hex };
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$/i;

/** The module a pathname is in: the first meaningful segment after /app (and
 *  after /app/projects/<id> for a job's own tools). */
export function moduleKeyFromPath(pathname?: string | null): string | null {
  if (!pathname) return null;
  const segs = pathname.split('?')[0].split('/').filter(Boolean);
  if (segs[0] !== 'app') return null;
  const rest = segs.slice(1);
  if (rest.length === 0) return 'home';
  if ((rest[0] === 'projects' || rest[0] === 'jobs') && rest[1] && ID.test(rest[1])) {
    const tool = rest.slice(2).find((s) => !ID.test(s));
    return tool ?? 'overview';
  }
  return rest.find((s) => !ID.test(s)) ?? 'home';
}

/** The accent hex for a pathname (what the app shell puts in --acc). */
export function accentForPath(pathname?: string | null): string {
  return DOMAIN_HEX[moduleDomain(moduleKeyFromPath(pathname))];
}
