/**
 * Estimate deliverable — the client-ready, print→PDF proposal for a measured takeoff.
 *
 * Pure, deterministic (no AI, no DOM): `buildEstimateReportHtml(args)` returns a
 * fully self-contained HTML document string. Feed it to a new window + `window.print()`
 * (same mechanism as the Coverage Heatmap's exportReport) and it renders as a polished,
 * multi-page PDF that out-classes PlanSwift / STACK / Bluebeam exports.
 *
 * Everything traces back to the shared takeoff engine (types.ts) — the numbers here are
 * byte-identical to what the estimator sees live on web + iOS. Sonoran palette:
 * navy #0a0a0a/#161b22, report gold #D4A017, CSI division colors from divisions.ts.
 */
import type { Condition, ComputeOpts, LineItem, TakeoffResult } from './types';
import { divColor, divName } from './divisions';
import { COST_CATALOG } from './cost';

/* ────────────────────────────── inputs ────────────────────────────── */

export interface EstimateReportProject {
  name: string;
  number?: string;
  client?: string;
  location?: string;
  buildingSf?: number;
  /** display date for the proposal; defaults to today */
  date?: string;
}
export interface EstimateReportCompany {
  name?: string;
  preparedBy?: string;
  contact?: string;    // "estimating@company.com · (555) 123-4567"
  license?: string;    // "ROC #123456"
  tagline?: string;
}
export interface BuildEstimateReportArgs {
  project: EstimateReportProject;
  conditions: Condition[];
  result: TakeoffResult;
  opts: ComputeOpts;
  company?: EstimateReportCompany;
  /** editable proposal fine print — override the boilerplate so the GC submits THEIR qualifications */
  allowances?: string[];
  exclusions?: string[];
  clarifications?: string[];
  /** AACE International estimate class (drives the +/- accuracy range). Default 3 (Budget/DD). */
  accuracyClass?: 1 | 2 | 3 | 4 | 5;
}

/** AACE-ish +/- accuracy band (percent) by estimate class → an honest range, not false precision. */
const AACE_BANDS: Record<number, [number, number]> = { 5: [-30, 50], 4: [-20, 30], 3: [-10, 15], 2: [-5, 12], 1: [-3, 8] };
const AACE_LABEL: Record<number, string> = { 5: 'Class 5 · Concept', 4: 'Class 4 · Schematic', 3: 'Class 3 · Budget/DD', 2: 'Class 2 · Control', 1: 'Class 1 · Bid/GMP' };

/* ────────────────────────────── format helpers ────────────────────────────── */

const usd = (cents: number) => '$' + Math.round((cents || 0) / 100).toLocaleString('en-US');
const usdc = (cents: number) =>
  '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyfmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (n: number) => (Math.round((n || 0) * 10) / 10).toLocaleString('en-US') + '%';
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const div2 = (csi: string) => (csi || '00').replace(/\D/g, '').slice(0, 2) || '00';

/* ────────────────────────────── division rollup ────────────────────────────── */

interface DivGroup {
  div: string;
  name: string;
  color: string;
  lines: LineItem[];
  materialCents: number;   // pure material bucket
  directCents: number;     // material + equipment + sub (direct, bare, pre-tax/burden)
  laborCents: number;      // bare labor
  laborHrs: number;
  totalCents: number;      // directCents + laborCents (bare)
}

function groupByDivision(lines: LineItem[]): DivGroup[] {
  const map = new Map<string, DivGroup>();
  for (const l of lines) {
    const d = div2(l.csi);
    let g = map.get(d);
    if (!g) {
      g = { div: d, name: divName(l.csi) || `Division ${d}`, color: divColor(l.csi), lines: [], materialCents: 0, directCents: 0, laborCents: 0, laborHrs: 0, totalCents: 0 };
      map.set(d, g);
    }
    const dir = (l.materialCents || 0) + (l.equipmentCents || 0) + (l.subCents || 0);
    g.lines.push(l);
    g.materialCents += l.materialCents || 0;
    g.directCents += dir;
    g.laborCents += l.laborCents || 0;
    g.laborHrs += l.laborHrs || 0;
    g.totalCents += l.totalCents || 0;
  }
  return [...map.values()];
}

/** Human scope phrase per CSI division — drives the auto-written narrative. */
const DIV_SCOPE: Record<string, string> = {
  '01': 'general requirements and project overhead',
  '02': 'selective demolition and existing-condition preparation',
  '03': 'cast-in-place concrete — foundations, slabs-on-grade, walls and reinforcing',
  '04': 'unit masonry — CMU and brick veneer',
  '05': 'structural and miscellaneous steel',
  '06': 'rough carpentry, wood and cold-formed metal framing',
  '07': 'thermal & moisture protection — insulation, roofing, weatherproofing and sealants',
  '08': 'openings — doors, frames, hardware, storefront and glazing',
  '09': 'interior finishes — drywall, ceilings, flooring, tile and paint',
  '10': 'specialties — toilet partitions and accessories',
  '11': 'equipment',
  '12': 'furnishings',
  '21': 'fire suppression',
  '22': 'plumbing',
  '23': 'HVAC / mechanical',
  '26': 'electrical power, lighting and wiring devices',
  '27': 'structured cabling and communications',
  '28': 'electronic safety & security',
  '31': 'earthwork — excavation, grading and aggregate base',
  '32': 'exterior improvements — paving, site concrete and curbs',
  '33': 'site utilities',
};

/* ────────────────────────────── the Saguaro mark ────────────────────────────── */

const MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="#D4A017" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M12 9c0-2 -1.6-3.5 -3.5-3.5S5 7 5 9v3c0 1.4 1.1 2.5 2.5 2.5S10 13.4 10 12M12 12c0-2 1.6-3.5 3.5-3.5S19 10 19 12v2c0 1.4-1.1 2.5-2.5 2.5S14 15.4 14 14"/></svg>`;

/* ────────────────────────────── main builder ────────────────────────────── */

export function buildEstimateReportHtml(args: BuildEstimateReportArgs): string {
  const { project, conditions, result, opts } = args;
  const company: EstimateReportCompany = {
    name: 'Saguaro Control Systems — Construction Management & Project Controls',
    tagline: 'Control Every Project. Deliver Every Promise.',
    ...(args.company || {}),
  };

  const dateStr = project.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const groups = groupByDivision(result.lines);
  const bySpec = [...groups].sort((a, b) => a.div.localeCompare(b.div));   // CSI order for tables
  const byValue = [...groups].sort((a, b) => b.totalCents - a.totalCents); // largest-first for the bar
  const barTotal = groups.reduce((s, g) => s + g.totalCents, 0) || 1;

  /* ---- markup-stack derived values (all tie back to result) ---- */
  const material = result.materialCents;
  const tax = result.materialTaxCents;
  const bareLabor = result.laborCents;
  const burden = result.burdenedLaborCents - result.laborCents;
  const equip = result.equipmentCents;
  const sub = result.subCents;
  const direct = result.subtotalCents;                 // material+tax+burdenedLabor+equip+sub
  const gc = result.generalConditionsCents;
  const costOfWork = direct + gc;
  const oh = result.overheadCents;
  const cont = result.contingencyCents;
  const profit = result.profitCents;
  const bond = result.bondCents;
  const sell = result.sellCents;
  const bareSubtotal = material + equip + sub + bareLabor; // == Σ line.totalCents

  const markupOnCost = direct > 0 ? ((sell - direct) / direct) * 100 : 0;
  const grossMargin = sell > 0 ? ((sell - direct) / sell) * 100 : 0;
  const costPerSf = result.costPerSf;

  /* ---- rate basis ---- */
  const tenantLines = result.lines.filter((l) => l.rateSource === 'tenant');
  const tenantKeys = [...new Set(tenantLines.map((l) => l.costKey))];
  const crewRate = opts.crewRateCents ?? 6500;

  /* ---- honest accuracy RANGE (AACE band) instead of a false-precision single number ---- */
  const aaceClass = args.accuracyClass ?? 3;
  const [bandLo, bandHi] = AACE_BANDS[aaceClass] ?? AACE_BANDS[3];
  const sellLow = Math.round(sell * (1 + bandLo / 100));
  const sellHigh = Math.round(sell * (1 + bandHi / 100));
  const rangeStr = `${usd(sellLow)} – ${usd(sellHigh)}`;

  /* ---- crew wage span (per-trade) for an honest labor-basis line ---- */
  const crewRatesUsed = [...new Set(result.lines.filter((l) => (l.laborHrs || 0) > 0 && l.crewRateCents).map((l) => l.crewRateCents as number))].sort((a, b) => a - b);
  const crewSpan = crewRatesUsed.length ? (crewRatesUsed.length === 1 ? `${usdc(crewRatesUsed[0])}/hr` : `${usdc(crewRatesUsed[0])}–${usdc(crewRatesUsed[crewRatesUsed.length - 1])}/hr per-trade`) : `${usdc(crewRate)}/hr`;
  const regionLabel = opts.regionLabel;

  /* ═════════════════════════ COVER ═════════════════════════ */
  const cover = `
  <section class="cover">
    <div class="cover-top">
      <div class="brandrow"><span class="mark">${MARK}</span><div><div class="tag">${esc(company.name)}</div>${company.tagline ? `<div class="tagsub">${esc(company.tagline)}</div>` : ''}</div></div>
    </div>
    <div class="cover-mid">
      <div class="doctype">Construction Cost Estimate &middot; Proposal</div>
      <h1 class="projname">${esc(project.name || 'Project Estimate')}</h1>
      <div class="projmeta">
        ${project.number ? `<span>Project&nbsp;No.&nbsp;<b>${esc(project.number)}</b></span>` : ''}
        ${project.location ? `<span>${esc(project.location)}</span>` : ''}
        <span>${esc(dateStr)}</span>
      </div>
      <div class="selltotal">
        <div class="selllabel">Total Lump-Sum Proposal</div>
        <div class="sellbig">${usd(sell)}</div>
        <div class="sellrange">Expected range <b>${rangeStr}</b> &nbsp;·&nbsp; AACE ${esc(AACE_LABEL[aaceClass])} (${bandLo}% / +${bandHi}%)</div>
        <div class="sellsub">${costPerSf != null ? `${usdc(Math.round(costPerSf * 100))} / SF` : ''}${costPerSf != null && result.lines.length ? ' &nbsp;·&nbsp; ' : ''}${result.lines.length.toLocaleString('en-US')} priced components across ${groups.length} division${groups.length === 1 ? '' : 's'}${regionLabel ? ` &nbsp;·&nbsp; ${esc(regionLabel)}` : ''}</div>
      </div>
    </div>
    <div class="cover-bottom">
      <div class="prepgrid">
        <div><div class="pk">Prepared by</div><div class="pv">${esc(company.name)}</div>${company.preparedBy ? `<div class="pvs">${esc(company.preparedBy)}</div>` : ''}${company.contact ? `<div class="pvs">${esc(company.contact)}</div>` : ''}${company.license ? `<div class="pvs">${esc(company.license)}</div>` : ''}</div>
        <div><div class="pk">Prepared for</div><div class="pv">${esc(project.client || 'Owner / General Contractor')}</div>${project.location ? `<div class="pvs">${esc(project.location)}</div>` : ''}</div>
        <div><div class="pk">Estimate date</div><div class="pv">${esc(dateStr)}</div><div class="pvs">Valid 30 days from issue</div></div>
      </div>
      <div class="confidence">
        <span class="chip">Deterministic Takeoff</span>
        <span class="chip">AACE ${esc(AACE_LABEL[aaceClass])}</span>
        <span class="chip">Range ${bandLo}% / +${bandHi}%</span>
        <p>Every quantity in this estimate traces to measured geometry through Saguaro's shared measurement engine — the same figures the estimator sees live in the field and on the web, with no black-box AI in the money path. Pricing reflects ${tenantKeys.length ? 'your organization&rsquo;s historical unit rates layered over ' : ''}${regionLabel ? `cost data localized to ${esc(regionLabel)}` : 'the Saguaro national cost catalog'}. Final numbers are subject to complete drawings, addenda, and confirmed subcontractor quotations.</p>
      </div>
    </div>
  </section>`;

  /* ═════════════════════════ EXECUTIVE SUMMARY ═════════════════════════ */
  const barSegs = byValue.map((g) => {
    const w = (g.totalCents / barTotal) * 100;
    return `<span class="seg" style="width:${w}%;background:${g.color}" title="${esc(g.name)} — ${usd(g.totalCents)}"></span>`;
  }).join('');
  const legend = byValue.map((g) => `<div class="lg"><span class="dot" style="background:${g.color}"></span><span class="lgn">Div ${g.div} · ${esc(g.name)}</span><span class="lgv">${usd(g.totalCents)}</span><span class="lgp">${pct((g.totalCents / barTotal) * 100)}</span></div>`).join('');

  const summary = `
  <section class="sect page">
    <h2>Executive Summary</h2>
    <div class="cards">
      <div class="card hero"><div class="k">Total Proposal</div><div class="v">${usd(sell)}</div></div>
      <div class="card"><div class="k">Cost / SF</div><div class="v">${costPerSf != null ? usdc(Math.round(costPerSf * 100)) : '—'}</div></div>
      <div class="card"><div class="k">Divisions</div><div class="v">${groups.length}</div></div>
      <div class="card"><div class="k">Line items</div><div class="v">${result.lines.length.toLocaleString('en-US')}</div></div>
      <div class="card"><div class="k">Labor hours</div><div class="v">${qtyfmt(result.laborHrs)}</div></div>
      <div class="card"><div class="k">Conditions</div><div class="v">${conditions.length}</div></div>
    </div>
    <h3 class="subh">Cost distribution by division</h3>
    <div class="bar">${barSegs}</div>
    <div class="legend">${legend}</div>
    <div class="split">
      <div class="minicard"><div class="mk">Direct cost</div><div class="mv">${usd(direct)}</div></div>
      <div class="minicard"><div class="mk">Markup on cost</div><div class="mv">${pct(markupOnCost)}</div></div>
      <div class="minicard"><div class="mk">Gross margin</div><div class="mv">${pct(grossMargin)}</div></div>
      <div class="minicard"><div class="mk">Overhead / Profit</div><div class="mv">${pct(opts.overheadPct ?? 0)} / ${pct(opts.profitPct ?? 0)}</div></div>
    </div>
  </section>`;

  /* ═════════════════════════ SCOPE NARRATIVE ═════════════════════════ */
  const scopePhrases = bySpec.map((g) => DIV_SCOPE[g.div] || g.name.toLowerCase());
  const scopeList = bySpec.map((g) => {
    const names = [...new Set(g.lines.map((l) => l.name))].slice(0, 6);
    return `<div class="scoperow">
      <div class="scopehd"><span class="dot" style="background:${g.color}"></span><b>Division ${g.div} — ${esc(g.name)}</b><span class="scv">${usd(g.totalCents)} · ${g.lines.length} item${g.lines.length === 1 ? '' : 's'}</span></div>
      <div class="scopeitems">${names.map((n) => esc(n)).join(' &nbsp;·&nbsp; ')}</div>
    </div>`;
  }).join('');
  const scope = `
  <section class="sect">
    <h2>Scope of Work</h2>
    <p class="narrative">This proposal delivers a complete, measured scope of work spanning <b>${groups.length} CSI division${groups.length === 1 ? '' : 's'}</b>${project.buildingSf ? ` over approximately <b>${project.buildingSf.toLocaleString('en-US')} SF</b>` : ''}. The work encompasses ${scopePhrases.slice(0, -1).join('; ')}${scopePhrases.length > 1 ? '; and ' : ''}${scopePhrases[scopePhrases.length - 1] || 'the scope detailed below'}. Quantities were derived directly from ${conditions.length} measured condition${conditions.length === 1 ? '' : 's'} and exploded into ${result.lines.length.toLocaleString('en-US')} priced components by the Saguaro assembly engine.</p>
    <div class="scopelist">${scopeList}</div>
  </section>`;

  /* ═════════════════════════ DIVISION ROLLUP ═════════════════════════ */
  const rollupRows = bySpec.map((g) => `<tr>
    <td><span class="dot" style="background:${g.color}"></span>Div ${g.div} — ${esc(g.name)}</td>
    <td class="c">${g.lines.length}</td>
    <td class="r">${usd(g.directCents)}</td>
    <td class="r">${usd(g.laborCents)}</td>
    <td class="r">${qtyfmt(g.laborHrs)}</td>
    <td class="r"><b>${usd(g.totalCents)}</b></td>
    <td class="r">${pct((g.totalCents / barTotal) * 100)}</td>
  </tr>`).join('');
  const rollup = `
  <section class="sect">
    <h2>Division Rollup</h2>
    <table>
      <thead><tr><th>CSI Division</th><th class="c">Items</th><th class="r">Material / Sub</th><th class="r">Labor</th><th class="r">Hrs</th><th class="r">Extended</th><th class="r">%</th></tr></thead>
      <tbody>${rollupRows}</tbody>
      <tfoot><tr><td>Subtotal — bare cost of work</td><td class="c">${result.lines.length}</td><td class="r">${usd(material + equip + sub)}</td><td class="r">${usd(bareLabor)}</td><td class="r">${qtyfmt(result.laborHrs)}</td><td class="r">${usd(bareSubtotal)}</td><td class="r">100%</td></tr></tfoot>
    </table>
    <p class="fine">Material / Sub column combines material, equipment and subcontractor direct buckets. Extended = direct + bare labor (pre-tax, pre-burden, pre-markup). Sales tax, labor burden and markups are applied transparently in the Markup Basis section.</p>
  </section>`;

  /* ═════════════════════════ FULL LINE ITEMS (by division) ═════════════════════════ */
  const lineBlocks = bySpec.map((g) => {
    const rows = [...g.lines]
      .sort((a, b) => a.csi.localeCompare(b.csi) || (b.totalCents - a.totalCents))
      .map((l) => {
        const dir = (l.materialCents || 0) + (l.equipmentCents || 0) + (l.subCents || 0);
        const tagct = l.costType === 'sub' ? '<span class="ct sub">SUB</span>' : l.costType === 'equipment' ? '<span class="ct eq">EQ</span>' : '';
        const rs = l.rateSource === 'tenant' ? '<span class="rsdot" title="Your historical rate">●</span>' : '';
        return `<tr>
          <td class="mono">${esc(l.csi)}</td>
          <td>${esc(l.name)}${tagct}${l.instanceCount && l.instanceCount > 1 ? `<span class="ct typ">×${l.instanceCount}</span>` : ''}</td>
          <td class="r">${qtyfmt(l.baseQty)}</td>
          <td class="c">${esc(l.unit)}</td>
          <td class="r">${usdc(l.unitMaterialCents)}${rs}</td>
          <td class="r">${l.wastePct ? pct(l.wastePct) : '—'}</td>
          <td class="r">${qtyfmt(l.qty)}</td>
          <td class="r">${usd(dir)}</td>
          <td class="r">${usd(l.laborCents)}</td>
          <td class="r"><b>${usd(l.totalCents)}</b></td>
        </tr>`;
      }).join('');
    return `<div class="divblock">
      <div class="divhd" style="border-left:5px solid ${g.color}"><b>Division ${g.div} — ${esc(g.name)}</b><span>${usd(g.totalCents)}</span></div>
      <table class="li">
        <thead><tr><th>CSI</th><th>Description</th><th class="r">Net</th><th class="c">Unit</th><th class="r">Unit $</th><th class="r">Waste</th><th class="r">Order</th><th class="r">Material / Sub</th><th class="r">Labor</th><th class="r">Extended</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="7">Division ${g.div} subtotal</td><td class="r">${usd(g.directCents)}</td><td class="r">${usd(g.laborCents)}</td><td class="r">${usd(g.totalCents)}</td></tr></tfoot>
      </table>
    </div>`;
  }).join('');
  const lineItems = `
  <section class="sect page">
    <h2>Detailed Line Items</h2>
    <p class="fine"><span class="rsdot">●</span> = priced from your organization&rsquo;s historical rate. <span class="ct sub">SUB</span>/<span class="ct eq">EQ</span> = subcontractor / equipment bucket. <span class="ct typ">×N</span> = typical instance count. <b>Net</b> = measured quantity, <b>Order</b> = Net + per-assembly waste.</p>
    ${lineBlocks}
  </section>`;

  /* ═════════════════════════ MARKUP STACK ═════════════════════════ */
  const row = (label: string, val: number, note = '', cls = '') =>
    `<tr class="${cls}"><td>${label}</td><td class="r muted">${note}</td><td class="r">${usd(val)}</td></tr>`;
  const subRow = (label: string, val: number) =>
    `<tr class="subttl"><td>${label}</td><td></td><td class="r"><b>${usd(val)}</b></td></tr>`;
  const markup = `
  <section class="sect page">
    <h2>Markup Basis &amp; Price Build-Up</h2>
    <p class="narrative">Full transparency on how direct cost becomes the proposal price. Each markup is applied in defensible AGC/CSI order — tax rides material, burden rides labor, general conditions and overhead ride the cost of work, contingency guards the whole, fee is applied pre-bond, and the bond premium is taken on the final contract value.</p>
    <table class="stack">
      <thead><tr><th>Component</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${row('Material', material)}
        ${row('Sales tax on material', tax, opts.salesTaxPct ? pct(opts.salesTaxPct) : 'not applied')}
        ${row('Labor (bare wage)', bareLabor, `${qtyfmt(result.laborHrs)} hrs @ ${usdc(crewRate)}/hr`)}
        ${row('Labor burden', burden, opts.laborBurdenPct ? pct(opts.laborBurdenPct) : 'not applied')}
        ${equip ? row('Equipment', equip) : ''}
        ${sub ? row('Subcontractors', sub) : ''}
        ${subRow('Direct cost of construction', direct)}
        ${row('General conditions (Div 01)', gc, opts.generalConditionsPct ? pct(opts.generalConditionsPct) : 'not applied')}
        ${subRow('Cost of work', costOfWork)}
        ${row('Overhead', oh, pct(opts.overheadPct ?? 0))}
        ${row('Contingency', cont, pct(opts.contingencyPct ?? 0))}
        ${row('Fee / Profit', profit, pct(opts.profitPct ?? 0))}
        ${row('P&amp;P bond premium', bond, opts.bondPct ? pct(opts.bondPct) : 'not applied')}
      </tbody>
      <tfoot><tr class="sell"><td>Total lump-sum proposal</td><td></td><td class="r">${usd(sell)}</td></tr></tfoot>
    </table>
    <div class="split">
      <div class="minicard"><div class="mk">Markup on direct cost</div><div class="mv">${pct(markupOnCost)}</div></div>
      <div class="minicard"><div class="mk">Gross margin (sell)</div><div class="mv">${pct(grossMargin)}</div></div>
      <div class="minicard"><div class="mk">Fee rate</div><div class="mv">${pct(opts.profitPct ?? 0)}</div></div>
      <div class="minicard"><div class="mk">Total markup $</div><div class="mv">${usd(sell - direct)}</div></div>
    </div>
  </section>`;

  /* ═════════════════════════ BASIS OF ESTIMATE ═════════════════════════ */
  const sanityHtml = result.sanity.length
    ? `<ul class="flags">${result.sanity.map((f) => `<li class="${f.level}"><span class="flev">${f.level === 'warn' ? 'REVIEW' : 'NOTE'}</span>${esc(f.message)}</li>`).join('')}</ul>`
    : `<p class="fine">No sanity flags — coverage, reinforcing, markups and unit-cost bands all passed the deterministic checks.</p>`;

  const assumptions = [
    `Quantities derived from ${conditions.length} measured condition${conditions.length === 1 ? '' : 's'}, exploded to ${result.lines.length.toLocaleString('en-US')} priced components by the Saguaro assembly engine (integer-cent, deterministic).`,
    `Per-trade crew labor rates: <b>${crewSpan}</b>. Total ${qtyfmt(result.laborHrs)} labor hours.${regionLabel ? ` Pricing localized to <b>${esc(regionLabel)}</b>.` : ''}`,
    `Material waste factors are embedded per assembly (typ. 3–15%): the <b>Net</b> column is the measured quantity, <b>Order</b> is Net plus waste (what gets bought).`,
    `Markups applied — overhead <b>${pct(opts.overheadPct ?? 0)}</b>, contingency <b>${pct(opts.contingencyPct ?? 0)}</b>, fee/profit <b>${pct(opts.profitPct ?? 0)}</b>${opts.generalConditionsPct ? `, general conditions <b>${pct(opts.generalConditionsPct)}</b>` : ''}${opts.salesTaxPct ? `, material sales tax <b>${pct(opts.salesTaxPct)}</b>` : ''}${opts.laborBurdenPct ? `, labor burden <b>${pct(opts.laborBurdenPct)}</b>` : ''}${opts.bondPct ? `, P&amp;P bond <b>${pct(opts.bondPct)}</b>` : ''}.`,
    project.buildingSf ? `Building area of <b>${project.buildingSf.toLocaleString('en-US')} SF</b> used for the $/SF metric.` : `No building area provided — $/SF omitted.`,
  ];

  const rateBasis = tenantKeys.length
    ? `<b>${tenantLines.length}</b> of ${result.lines.length} priced components use your organization&rsquo;s historical unit rates (${tenantKeys.length} distinct item${tenantKeys.length === 1 ? '' : 's'}); the remainder use the Saguaro national cost catalog (RSMeans-ballpark regional seed rates). Tenant-rated lines are flagged <span class="rsdot">●</span> in the line-item schedule.`
    : `All ${result.lines.length} priced components use the Saguaro national cost catalog (RSMeans-ballpark regional seed rates). Load your organization&rsquo;s historical rates to override any item.`;

  // Fine print — the GC's OWN allowances / exclusions / clarifications override the boilerplate.
  // Bond/tax exclusions are auto-appended only when those markups aren't carried in the number.
  const DEFAULT_EXCLUSIONS = [
    'Building permits, plan-check, and impact / utility connection fees',
    'Builder&rsquo;s risk and owner-provided insurance',
    'Hazardous-material survey, abatement, and disposal',
    'Off-hours, shift, and premium-time labor unless noted',
    'Owner-furnished items (OFOI / OFCI) and long-lead equipment',
    'Design, engineering, special inspection, and third-party testing fees',
    'Cost escalation beyond the estimate date',
  ];
  const DEFAULT_CLARIFICATIONS = [
    'Pricing is based on the documents and quantities listed in this Basis of Estimate; changes in scope are priced as revisions / change orders.',
    'Work assumes normal working hours and unrestricted site access unless noted.',
    'Unit rates reflect current market pricing and are subject to confirmed subcontractor quotations.',
  ];
  const autoExcl = [
    opts.bondPct ? null : 'Payment &amp; performance bond (not carried in this number)',
    opts.salesTaxPct ? null : 'Material sales / use tax — verify jurisdiction',
  ].filter(Boolean) as string[];
  const exclusions = ((args.exclusions && args.exclusions.length ? args.exclusions : DEFAULT_EXCLUSIONS)).concat(autoExcl);
  const clarifications = args.clarifications && args.clarifications.length ? args.clarifications : DEFAULT_CLARIFICATIONS;
  const allowances = args.allowances && args.allowances.length ? args.allowances : [];

  const basis = `
  <section class="sect page">
    <h2>Basis of Estimate</h2>
    <h3 class="subh">Pricing basis</h3>
    <p class="narrative">${rateBasis}</p>
    <h3 class="subh">Assumptions</h3>
    <ul class="bullets">${assumptions.map((a) => `<li>${a}</li>`).join('')}</ul>
    <h3 class="subh">Estimate quality checks</h3>
    ${sanityHtml}
    ${allowances.length ? `<h3 class="subh">Allowances carried</h3><ul class="bullets alw">${allowances.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <h3 class="subh">Clarifications</h3>
    <ul class="bullets">${clarifications.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <h3 class="subh">Exclusions</h3>
    <ul class="bullets">${exclusions.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    <p class="fine">This is a deterministic, measurement-driven estimate (AACE International ${esc(AACE_LABEL[aaceClass])}). Expected price range <b>${rangeStr}</b> (${bandLo}% / +${bandHi}%) pending complete construction documents, addenda, geotechnical data, and confirmed subcontractor pricing. Proposal valid 30 days from the estimate date.</p>
  </section>`;

  /* ═════════════════════════ BASE BID + ALTERNATES ═════════════════════════ */
  const addTotal = result.alternates.filter((a) => a.type === 'add').reduce((s, a) => s + a.sellCents, 0);
  const alternatesHtml = result.alternates.length ? `
  <section class="sect">
    <h2>Base Bid &amp; Alternates</h2>
    <p class="narrative">The <b>Base Bid</b> is the number on the cover. Each alternate below is a priced add or deduct the owner may elect; amounts include full markup on the same defensible stack.</p>
    <table>
      <thead><tr><th>#</th><th>Alternate</th><th class="c">Type</th><th class="r">Lines</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr><td class="mono">BASE</td><td><b>Base Bid</b></td><td class="c">base</td><td class="r">${result.lines.length}</td><td class="r"><b>${usd(sell)}</b></td></tr>
        ${result.alternates.map((a, i) => `<tr><td class="mono">ALT-${i + 1}</td><td>${esc(a.label)}</td><td class="c"><span class="alt ${a.type}">${a.type.toUpperCase()}</span></td><td class="r">${a.lines}</td><td class="r ${a.type === 'deduct' ? 'neg' : 'pos'}">${a.type === 'deduct' ? '&minus;' : '+'}${usd(Math.abs(a.deltaCents))}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="4">Base + all add alternates</td><td class="r">${usd(sell + addTotal)}</td></tr></tfoot>
    </table>
  </section>` : '';

  /* ═════════════════════════ COST BY LOCATION ═════════════════════════ */
  const locHtml = result.byLocation.length ? `
  <section class="sect">
    <h2>Cost by Location</h2>
    <p class="narrative">Base-bid cost distributed across building / level / zone — for phasing, draw schedules and subcontractor scope splits.</p>
    <table>
      <thead><tr><th>Location</th><th class="r">Lines</th><th class="r">Material / Sub</th><th class="r">Labor</th><th class="r">Extended</th></tr></thead>
      <tbody>${result.byLocation.map((l) => {
        const nm = [l.building ? `Bldg ${esc(l.building)}` : '', l.level ? `Level ${esc(l.level)}` : '', l.zone ? `Zone ${esc(l.zone)}` : ''].filter(Boolean).join(' &middot; ') || 'Unassigned';
        return `<tr><td>${nm}</td><td class="r">${l.lines}</td><td class="r">${usd(l.materialCents)}</td><td class="r">${usd(l.laborCents)}</td><td class="r"><b>${usd(l.totalCents)}</b></td></tr>`;
      }).join('')}</tbody>
    </table>
  </section>` : '';

  /* ═════════════════════════ ASSEMBLE ═════════════════════════ */
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(project.name || 'Estimate')} — Cost Estimate</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Cross-platform stack: Windows gets Segoe UI (design target); Mac/Linux fall back to
     Helvetica/Arial (present on 100% of print targets) — no ugly Times fallback, consistent metrics. */
  body { font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', system-ui, -apple-system, sans-serif; color: #1a2232; margin: 0; background: #fff; font-size: 12.5px; line-height: 1.5; font-synthesis: none; }
  .wrap { max-width: 960px; margin: 0 auto; }

  /* cover */
  .cover { min-height: 251mm; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(158deg,#0a0a0a 0%,#161b22 55%,#1b2330 100%); color: #e6edf3; border-radius: 6px; padding: 30px 34px 26px; page-break-after: always; }
  .brandrow { display: flex; align-items: center; gap: 13px; }
  .mark { width: 40px; height: 40px; display: inline-block; }
  .brandrow .tag { color: #D4A017; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; }
  .brandrow .tagsub { color: #8b97a8; font-size: 11.5px; letter-spacing: .3px; margin-top: 2px; }
  .cover-mid { padding: 8px 2px; }
  .doctype { color: #D4A017; font-size: 12px; text-transform: uppercase; letter-spacing: 2.4px; font-weight: 700; }
  .projname { font-size: 40px; line-height: 1.08; font-weight: 800; letter-spacing: -0.02em; margin: 10px 0 12px; color: #fff; }
  .projmeta { display: flex; flex-wrap: wrap; gap: 6px 20px; color: #a9b4c4; font-size: 13.5px; }
  .projmeta b { color: #e6edf3; }
  .selltotal { margin-top: 30px; border-top: 1px solid rgba(212,160,23,.35); border-bottom: 1px solid rgba(212,160,23,.35); padding: 20px 0; }
  .selllabel { color: #8b97a8; text-transform: uppercase; letter-spacing: 1.6px; font-size: 11.5px; font-weight: 700; }
  .sellbig { font-size: 62px; font-weight: 800; letter-spacing: -0.03em; color: #D4A017; font-variant-numeric: tabular-nums; line-height: 1; margin-top: 6px; }
  .sellsub { color: #a9b4c4; font-size: 13px; margin-top: 8px; }
  .sellrange { color: #D4A017; font-size: 12.5px; margin-top: 6px; font-weight: 600; }
  .sellrange b { color: #f0c860; }
  .prepgrid { display: flex; flex-wrap: wrap; gap: 18px 32px; margin-bottom: 16px; }
  .prepgrid > div { min-width: 150px; }
  .pk { color: #7f8b9c; text-transform: uppercase; letter-spacing: 1.2px; font-size: 10px; font-weight: 700; margin-bottom: 4px; }
  .pv { color: #fff; font-weight: 700; font-size: 14px; }
  .pvs { color: #9aa6b6; font-size: 12px; margin-top: 1px; }
  .confidence { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); border-left: 4px solid #D4A017; border-radius: 10px; padding: 14px 16px; }
  .chip { display: inline-block; border: 1px solid rgba(212,160,23,.5); color: #D4A017; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; border-radius: 20px; padding: 3px 10px; margin: 0 6px 8px 0; }
  .confidence p { color: #b9c3d0; font-size: 12px; line-height: 1.55; margin: 4px 0 0; }

  /* sections */
  .sect { padding: 0 4px; margin-top: 4px; }
  .page { page-break-before: always; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .8px; color: #0a0a0a; border-bottom: 2px solid #D4A017; padding-bottom: 6px; margin: 22px 0 12px; }
  h3.subh { font-size: 11.5px; text-transform: uppercase; letter-spacing: .6px; color: #55627a; margin: 16px 0 7px; }
  .narrative { font-size: 13px; line-height: 1.6; color: #2b3446; margin: 0 0 12px; }
  .fine { font-size: 10.5px; color: #7a8598; line-height: 1.5; margin: 8px 0 0; }

  /* cards */
  .cards { display: flex; flex-wrap: wrap; gap: 10px; }
  .card { flex: 1; min-width: 118px; border: 1px solid #e5e9f0; border-radius: 10px; padding: 12px 14px; background: #fafbfd; }
  .card.hero { background: linear-gradient(160deg,#0a0a0a,#1b2330); border-color: #0a0a0a; }
  .card.hero .k { color: #b79a54; } .card.hero .v { color: #D4A017; }
  .card .k { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #7a8598; font-weight: 700; }
  .card .v { font-size: 24px; font-weight: 800; color: #0a0a0a; margin-top: 4px; font-variant-numeric: tabular-nums; }

  /* stacked bar */
  .bar { display: flex; width: 100%; height: 30px; border-radius: 7px; overflow: hidden; border: 1px solid #e5e9f0; }
  .bar .seg { height: 100%; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 20px; margin-top: 12px; }
  .lg { display: flex; align-items: center; gap: 7px; font-size: 11.5px; min-width: 210px; flex: 1; }
  .lgn { flex: 1; color: #2b3446; } .lgv { font-weight: 700; font-variant-numeric: tabular-nums; } .lgp { color: #8a94a6; width: 42px; text-align: right; }
  .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; flex: 0 0 9px; }

  .split { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
  .minicard { flex: 1; min-width: 130px; border: 1px solid #e5e9f0; border-radius: 9px; padding: 10px 13px; background: #fff; }
  .mk { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #7a8598; font-weight: 700; }
  .mv { font-size: 18px; font-weight: 800; color: #0a0a0a; margin-top: 3px; font-variant-numeric: tabular-nums; }

  /* scope */
  .scopelist { margin-top: 6px; }
  .scoperow { border: 1px solid #eceef3; border-radius: 9px; padding: 10px 13px; margin-bottom: 8px; page-break-inside: avoid; }
  .scopehd { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #0a0a0a; }
  .scopehd .scv { margin-left: auto; color: #55627a; font-weight: 600; font-size: 12px; }
  .scopeitems { color: #6b7688; font-size: 11.5px; margin-top: 4px; padding-left: 17px; }

  /* tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 2px; }
  td, th { border-bottom: 1px solid #edeff3; padding: 7px 9px; }
  th { text-align: left; background: #f4f6f9; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #55627a; font-weight: 700; }
  .c { text-align: center; } .r { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: 'SFMono-Regular',Consolas,monospace; font-size: 11px; color: #55627a; white-space: nowrap; }
  tfoot td { font-weight: 800; border-top: 2px solid #0a0a0a; background: #fafbfc; }
  .muted { color: #8a94a6; font-weight: 600; }

  .divblock { page-break-inside: avoid; margin-top: 14px; }
  .divhd { display: flex; align-items: center; background: #f7f9fc; border-radius: 7px 7px 0 0; padding: 8px 12px; font-size: 13px; color: #0a0a0a; }
  .divhd span { margin-left: auto; font-weight: 800; font-variant-numeric: tabular-nums; }
  table.li thead th { background: #fbfcfe; }
  .ct { font-size: 8.5px; font-weight: 800; letter-spacing: .4px; border-radius: 4px; padding: 1px 4px; margin-left: 6px; vertical-align: middle; }
  .ct.sub { background: #e7f0ff; color: #2f6bff; } .ct.eq { background: #fdeede; color: #b45309; } .ct.typ { background: #eef7ee; color: #16794a; }
  .rsdot { color: #16a34a; font-size: 9px; margin-left: 4px; vertical-align: middle; }
  .alt { font-size: 9px; font-weight: 800; letter-spacing: .4px; border-radius: 4px; padding: 1px 6px; }
  .alt.add { background: #e7f0ff; color: #2f6bff; } .alt.deduct { background: #fdecec; color: #c0392b; }
  td.pos { color: #15803d; } td.neg { color: #c0392b; }
  ul.bullets.alw li { color: #1f5136; }

  /* markup stack */
  table.stack td:first-child { font-weight: 600; }
  table.stack tr.subttl td { background: #f2f5f9; border-top: 1px solid #cfd6e2; border-bottom: 1px solid #cfd6e2; }
  table.stack tfoot tr.sell td { background: #0a0a0a; color: #D4A017; font-size: 15px; border: none; }
  table.stack tfoot tr.sell td:first-child { color: #fff; }

  /* lists */
  ul.bullets { margin: 4px 0 0; padding-left: 18px; }
  ul.bullets li { font-size: 12px; color: #2b3446; margin-bottom: 5px; line-height: 1.5; }
  ul.flags { list-style: none; margin: 4px 0 0; padding: 0; }
  ul.flags li { font-size: 12px; padding: 7px 11px; border-radius: 7px; margin-bottom: 6px; border: 1px solid #e5e9f0; display: flex; align-items: baseline; gap: 9px; }
  ul.flags li.warn { background: #fff8ec; border-color: #f0d9a8; color: #7a5a12; }
  ul.flags li.info { background: #f6f8fb; color: #55627a; }
  .flev { font-size: 9px; font-weight: 800; letter-spacing: .5px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,.06); flex: 0 0 auto; }
  li.warn .flev { background: #e8b34a; color: #3a2a06; }

  .foot { color: #9aa6b6; font-size: 10px; text-align: center; margin: 26px 0 6px; border-top: 1px solid #edeff3; padding-top: 12px; }
</style></head>
<body><div class="wrap">
  ${cover}
  ${summary}
  ${alternatesHtml}
  ${scope}
  ${rollup}
  ${locHtml}
  ${lineItems}
  ${markup}
  ${basis}
  <div class="foot">Generated by ${esc(company.name)} — deterministic measurement-driven estimating. ${esc(dateStr)}. This document is a proposal, not a contract.</div>
</div></body></html>`;
}
