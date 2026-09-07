/**
 * Assembly sanity — parametric expansion against real construction standards.
 * Run: npx -y tsx lib/estimate-assemblies.sanity.test.ts
 *
 * The quantity logic is the part with value in it, so it is the part checked
 * against numbers an estimator can verify by hand: 32 SF to a 4x8 sheet, 27
 * cubic feet to the cubic yard, 0.668 lb per foot of #4 bar, 1.125 blocks per
 * SF of CMU. A library that expands to plausible-looking wrong quantities is
 * worse than no library, because nobody re-checks a number the software
 * produced.
 *
 * The parametric assertions matter most. One partition entry has to give the
 * right answer at 8ft and at 14ft, at 16" and at 24" on centre, one face and
 * two — because that is the whole reason it is one entry instead of twenty-four.
 */
import {
  ASSEMBLIES, ASSEMBLY_BY_ID, expandAssembly, assemblyNeedsPricing,
  assembliesByDivision, searchAssemblies, defaultParams, paramSensitivity,
} from './estimate-assemblies';
import { evaluateExpression } from './estimate-formula';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const qtyOf = (lines: { description?: string; quantity?: number | null }[], match: RegExp) =>
  Number(lines.find((l) => match.test(l.description ?? ''))?.quantity);
const has = (lines: { description?: string }[], match: RegExp) =>
  lines.some((l) => match.test(l.description ?? ''));

/* ── the library is well-formed ──────────────────────────────────────────── */

check('the library has real depth', ASSEMBLIES.length >= 24, `${ASSEMBLIES.length} assemblies`);
check('every assembly has a unique id',
  new Set(ASSEMBLIES.map((a) => a.id)).size === ASSEMBLIES.length, 'no duplicates');
check('every assembly has components', ASSEMBLIES.every((a) => a.components.length > 0), 'none empty');
check('coverage spans the trades',
  new Set(ASSEMBLIES.map((a) => a.division)).size >= 12,
  [...new Set(ASSEMBLIES.map((a) => a.division))].sort().join(', '));

/* Every expression — quantity AND condition — must evaluate at the assembly's
   own defaults. A library shipping a broken expression fails in front of an
   estimator mid-bid. */
{
  const broken: string[] = [];
  let expressions = 0;
  for (const a of ASSEMBLIES) {
    const vars = { DRIVER: 100, ...defaultParams(a) };
    for (const c of a.components) {
      for (const [kind, src] of [['qty', c.qty], ['when', c.when]] as const) {
        if (!src) continue;
        expressions++;
        try {
          const v = evaluateExpression(src, vars);
          if (!Number.isFinite(v)) broken.push(`${a.id}/${c.description} ${kind} → ${v}`);
          if (kind === 'qty' && v <= 0 && !c.when) broken.push(`${a.id}/${c.description} qty → ${v}`);
        } catch (e) {
          broken.push(`${a.id}/${c.description} ${kind} → ${(e as Error).message}`);
        }
      }
    }
  }
  check('every expression in the library evaluates at its defaults',
    broken.length === 0, broken.length ? broken.slice(0, 3).join(' | ') : `${expressions} expressions`);
}

/* Every parameter a component names must actually be declared, or the assembly
   is a #NAME? waiting for the first person who opens it. */
{
  const missing: string[] = [];
  for (const a of ASSEMBLIES) {
    const declared = new Set(['DRIVER', ...Object.keys(defaultParams(a))]);
    for (const c of a.components) {
      for (const src of [c.qty, c.when]) {
        if (!src) continue;
        for (const word of src.match(/[A-Z][A-Z0-9_]{1,}/g) ?? []) {
          if (declared.has(word)) continue;
          /* Function names are not parameters. */
          if (['CEILING', 'FLOOR', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'SUM', 'MIN', 'MAX',
               'ABS', 'SQRT', 'POWER', 'INT', 'IF', 'AND', 'OR', 'NOT', 'AVERAGE', 'AVG',
               'COUNT', 'PRODUCT'].includes(word)) continue;
          missing.push(`${a.id}: ${word}`);
        }
      }
    }
  }
  check('every parameter a component names is declared',
    missing.length === 0, missing.length ? [...new Set(missing)].slice(0, 4).join(', ') : 'no undeclared names');
}

check('every component has a unit', ASSEMBLIES.every((a) => a.components.every((c) => !!c.unit)), 'all set');
check('every assembly declares a CSI division',
  ASSEMBLIES.every((a) => /^\d{2}$/.test(a.division)), 'two digits');
check('parameter names are uppercase and expression-safe',
  ASSEMBLIES.every((a) => (a.params ?? []).every((p) => /^[A-Z][A-Z0-9]*$/.test(p.name))), 'all valid');
check('every parameter default sits inside its own range',
  ASSEMBLIES.every((a) => (a.params ?? []).every((p) =>
    (p.min === undefined || p.default >= p.min) && (p.max === undefined || p.default <= p.max))),
  'defaults in range');
check('every option list contains its default',
  ASSEMBLIES.every((a) => (a.params ?? []).every((p) => !p.options || p.options.some((o) => o.value === p.default))),
  'defaults selectable');

/* ── the partition, checked by hand at several settings ─────────────────── */

{
  const a = ASSEMBLY_BY_ID['partition-stud-gwb'];

  /* Defaults: 9ft, 16" o.c., both faces, single layer. */
  const base = expandAssembly(a, 240);
  check('a 240 LF partition expands',
    base.lines.length >= 5 && base.errors.length === 0, `${base.lines.length} lines, ${base.errors.length} errors`);
  check('studs land at 16 inches on centre',
    qtyOf(base.lines, /Metal stud/) === 181,
    `${qtyOf(base.lines, /Metal stud/)} — 240 ÷ 16 × 12 = 180, plus one to close the run`);
  check('board covers both faces at 32 SF a sheet',
    qtyOf(base.lines, /Gypsum board/) === 135,
    `${qtyOf(base.lines, /Gypsum board/)} — 240 × 9ft × 2 faces ÷ 32 SF`);
  check('screws follow the board area',
    qtyOf(base.lines, /screws/) === 7.6, `${qtyOf(base.lines, /screws/)} lb — 4,320 SF ÷ 1,000 × 1.75`);

  /* The whole point: the same entry at different settings. */
  const wide = expandAssembly(a, 240, { params: { ...defaultParams(a), SPACING: 24 } });
  check('24" spacing needs fewer studs, from the SAME library entry',
    qtyOf(wide.lines, /Metal stud/) === 121,
    `${qtyOf(wide.lines, /Metal stud/)} at 24" vs 181 at 16" — one entry, not two`);
  check('and the board count does not change with spacing',
    qtyOf(wide.lines, /Gypsum board/) === qtyOf(base.lines, /Gypsum board/),
    'spacing moves studs and screws, nothing else');

  const tall = expandAssembly(a, 240, { params: { ...defaultParams(a), HEIGHT: 14 } });
  check('a 14ft wall takes proportionally more board',
    qtyOf(tall.lines, /Gypsum board/) === 210,
    `${qtyOf(tall.lines, /Gypsum board/)} — 240 × 14 × 2 ÷ 32`);
  check('and the same number of studs',
    qtyOf(tall.lines, /Metal stud/) === 181, 'height does not change stud count');

  const oneFace = expandAssembly(a, 240, { params: { ...defaultParams(a), FACES: 1 } });
  check('boarding one face halves the board',
    qtyOf(oneFace.lines, /Gypsum board/) === 68,
    `${qtyOf(oneFace.lines, /Gypsum board/)} — 240 × 9 ÷ 32, rounded up`);

  const double = expandAssembly(a, 240, { params: { ...defaultParams(a), LAYERS: 2 } });
  check('a double layer doubles the board',
    qtyOf(double.lines, /Gypsum board/) === 270, `${qtyOf(double.lines, /Gypsum board/)}`);
  check('but the finish area does NOT double',
    qtyOf(double.lines, /compound/) === qtyOf(base.lines, /compound/),
    'only the outermost layer gets taped — a real trap in hand estimates');

  /* Conditional components. */
  check('an unrated partition has no head-of-wall firestopping',
    !has(base.lines, /firestop/i) && base.skipped.some((s) => /firestop/i.test(s)),
    'switched off and reported as switched off, not missing');
  const rated = expandAssembly(a, 240, { params: { ...defaultParams(a), RATED: 1 } });
  check('marking it rated adds the firestopping',
    has(rated.lines, /firestop/i) && qtyOf(rated.lines, /firestop/i) === 240, '240 LF at the deck');
  const insulated = expandAssembly(a, 240, { params: { ...defaultParams(a), INSULATED: 1 } });
  check('sound batt appears only when asked for',
    has(insulated.lines, /batt/i) && !has(base.lines, /batt/i), 'conditional');
}

/* ── the slab, parametric on thickness and strength ──────────────────────── */

{
  const a = ASSEMBLY_BY_ID['slab-on-grade'];
  const r = expandAssembly(a, 5400);
  check('a 4" slab converts to cubic yards correctly',
    qtyOf(r.lines, /Concrete slab/) === 66.67,
    `${qtyOf(r.lines, /Concrete slab/)} CY — 5,400 × 4/12 ÷ 27`);
  const six = expandAssembly(a, 5400, { params: { ...defaultParams(a), THICKNESS: 6 } });
  check('a 6" slab takes half again as much concrete',
    qtyOf(six.lines, /Concrete slab/) === 100, `${qtyOf(six.lines, /Concrete slab/)} CY`);
  check('3,000 psi carries no strength premium',
    !has(r.lines, /Strength premium/), 'conditional off');
  check('4,000 psi adds one',
    has(expandAssembly(a, 5400, { params: { ...defaultParams(a), PSI: 4000 } }).lines, /Strength premium/),
    'conditional on');
  check('control joints follow a 12ft grid',
    qtyOf(r.lines, /control joints/) === 450, `${qtyOf(r.lines, /control joints/)} LF — 5,400 ÷ 12`);
}

/* ── rebar weight, where hand estimates go wrong ─────────────────────────── */

{
  const a = ASSEMBLY_BY_ID['footing-continuous'];
  const r = expandAssembly(a, 320);
  check('#4 rebar converts feet to pounds at 0.668 lb/ft',
    qtyOf(r.lines, /rebar/) === 641.3, `${qtyOf(r.lines, /rebar/)} lb — 320 × 3 bars × 0.668`);
  check('footing concrete is width × depth in cubic yards',
    qtyOf(r.lines, /Concrete/) === 23.7, `${qtyOf(r.lines, /Concrete/)} CY — 320 × 2 × 1 ÷ 27`);
  const wide = expandAssembly(a, 320, { params: { ...defaultParams(a), WIDTH: 36, BARS: 4 } });
  check('a wider footing with more bars scales both',
    qtyOf(wide.lines, /Concrete/) === 35.56 && qtyOf(wide.lines, /rebar/) === 855.0,
    `${qtyOf(wide.lines, /Concrete/)} CY, ${qtyOf(wide.lines, /rebar/)} lb`);
  check('excavation allows working room',
    qtyOf(r.lines, /excavation/i) === 44.44,
    `${qtyOf(r.lines, /excavation/i)} CY — 6 inches each way beyond the footing`);
}

/* ── perimeter: estimated, or given ──────────────────────────────────────── */

{
  const a = ASSEMBLY_BY_ID['acoustic-ceiling'];
  const guessed = expandAssembly(a, 2500);
  check('with no perimeter given it is estimated from the area',
    qtyOf(guessed.lines, /Wall angle/) === 20,
    `${qtyOf(guessed.lines, /Wall angle/)} lengths — √2500 × 4 ÷ 10, a square room`);
  const given = expandAssembly(a, 2500, { params: { ...defaultParams(a), PERIMETER: 280 } });
  check('a real perimeter overrides the estimate',
    qtyOf(given.lines, /Wall angle/) === 28,
    `${qtyOf(given.lines, /Wall angle/)} — an L-shaped room runs far longer than a square one`);
  check('panel size changes the panel count',
    qtyOf(expandAssembly(a, 2400, { params: { ...defaultParams(a), PANEL: 4 } }).lines, /acoustic panel/) === 600,
    '2x2 panels: 2,400 ÷ 4');
}

/* ── paint: coats drive material AND labor ──────────────────────────────── */

{
  const a = ASSEMBLY_BY_ID['paint-interior'];
  const r = expandAssembly(a, 7000);
  check('primer covers 350 SF a gallon',
    qtyOf(r.lines, /Primer/) === 20, `${qtyOf(r.lines, /Primer/)} gal`);
  check('two finish coats at 380 SF a gallon',
    qtyOf(r.lines, /Finish paint/) === 36.84, `${qtyOf(r.lines, /Finish paint/)} gal`);
  check('labor follows the number of passes, not the area',
    qtyOf(r.lines, /Painting labor/) === 21000, `${qtyOf(r.lines, /Painting labor/)} — 7,000 × (2 coats + primer)`);
  check('skipping primer removes it from both material and labor',
    !has(expandAssembly(a, 7000, { params: { ...defaultParams(a), PRIMED: 0 } }).lines, /Primer/) &&
    qtyOf(expandAssembly(a, 7000, { params: { ...defaultParams(a), PRIMED: 0 } }).lines, /Painting labor/) === 14000,
    '14,000 — two passes, not three');
}

/* ── circuits round UP, because you cannot buy most of a breaker ─────────── */

{
  const a = ASSEMBLY_BY_ID['branch-lighting'];
  const r = expandAssembly(a, 9);
  check('9 fixtures need 2 circuits, not 1.125',
    qtyOf(r.lines, /Circuit share/) === 2,
    `${qtyOf(r.lines, /Circuit share/)} — CEILING(9/8), you cannot buy an eighth of a breaker`);
  check('a denser circuit count changes it',
    qtyOf(expandAssembly(a, 9, { params: { ...defaultParams(a), PERCIRCUIT: 4 } }).lines, /Circuit share/) === 3,
    '3 circuits at 4 fixtures each');
  check('occupancy sensors are the default control',
    has(r.lines, /Occupancy sensor/) && !has(r.lines, /Dimming/), 'CONTROLS=1');
  check('switching to dimming swaps the control line, not adds to it',
    has(expandAssembly(a, 9, { params: { ...defaultParams(a), CONTROLS: 2 } }).lines, /Dimming/) &&
    !has(expandAssembly(a, 9, { params: { ...defaultParams(a), CONTROLS: 2 } }).lines, /Occupancy/),
    'mutually exclusive conditions');
}

/* ── mutually exclusive hardware ─────────────────────────────────────────── */

{
  const a = ASSEMBLY_BY_ID['door-hm-single'];
  const std = expandAssembly(a, 4);
  check('a standard door gets a lockset and no panic device',
    has(std.lines, /Lockset/) && !has(std.lines, /Panic/), 'lockset');
  const panic = expandAssembly(a, 4, { params: { ...defaultParams(a), PANIC: 1 } });
  check('an exit door gets panic hardware INSTEAD of a lockset',
    has(panic.lines, /Panic/) && !has(panic.lines, /Lockset/),
    'swapped, not both — pricing both is a classic double-count');
  check('hinges come three to a leaf', qtyOf(std.lines, /hinges/) === 12, `${qtyOf(std.lines, /hinges/)} for 4 doors`);
  check('a rated door adds the label premium',
    has(expandAssembly(a, 4, { params: { ...defaultParams(a), RATED: 1 } }).lines, /rating premium/i), 'conditional');
}

/* ── per-each assemblies scale linearly ──────────────────────────────────── */

{
  const one = expandAssembly(ASSEMBLY_BY_ID['door-hm-single'], 1);
  const ten = expandAssembly(ASSEMBLY_BY_ID['door-hm-single'], 10);
  check('a per-each assembly scales exactly',
    Math.abs(ten.indicativeTotal - one.indicativeTotal * 10) < 0.01,
    `1 door $${one.indicativeTotal} → 10 doors $${ten.indicativeTotal}`);
}

/* ── CMU, checked against blocks per square foot ─────────────────────────── */

{
  const a = ASSEMBLY_BY_ID['cmu-wall'];
  const r = expandAssembly(a, 1600);
  check('CMU runs 1.125 blocks per square foot',
    qtyOf(r.lines, /CMU block/) === 1800, `${qtyOf(r.lines, /CMU block/)} — 1,600 × 1.125`);
  const solid = expandAssembly(a, 1600, { params: { ...defaultParams(a), GROUTSP: 8 } });
  check('solid grout takes four times the grout of 32" spacing',
    Math.abs(qtyOf(solid.lines, /Grout/) / qtyOf(r.lines, /Grout/) - 4) < 0.01,
    `${qtyOf(solid.lines, /Grout/)} CY vs ${qtyOf(r.lines, /Grout/)} CY`);
}

/* ── sensitivity: the question estimators actually ask ───────────────────── */

{
  const a = ASSEMBLY_BY_ID['partition-stud-gwb'];
  const spacing = a.params!.find((p) => p.name === 'SPACING')!;
  const s = paramSensitivity(a, 240, spacing, defaultParams(a));
  check('sensitivity reports a row per option', s.length === 3, s.map((x) => x.label).join(', '));
  check('the baseline option shows no delta',
    s.find((x) => x.value === 16)!.delta === 0, 'the current setting is the zero point');
  check('going to 24" o.c. saves money and says how much',
    s.find((x) => x.value === 24)!.delta < 0,
    `${s.find((x) => x.value === 24)!.delta} (${s.find((x) => x.value === 24)!.deltaPct}%)`);
  check('going to 12" o.c. costs more',
    s.find((x) => x.value === 12)!.delta > 0, `+${s.find((x) => x.value === 12)!.delta}`);
}

/* ── honesty about pricing ───────────────────────────────────────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['partition-stud-gwb'], 100);
  const p = assemblyNeedsPricing(r.lines);
  check('every priced line is flagged as library pricing',
    p.count === r.lines.length && p.pct === 100,
    `${p.count} of ${r.lines.length} lines, ${p.pct}% of $${p.total.toLocaleString('en-US')} — regional pricing is the estimator's, not ours`);
}

/* ── refusals ────────────────────────────────────────────────────────────── */

check('a zero driver expands to nothing, with a reason',
  expandAssembly(ASSEMBLY_BY_ID['slab-on-grade'], 0).lines.length === 0 &&
  expandAssembly(ASSEMBLY_BY_ID['slab-on-grade'], 0).errors[0].code === '#NUM!',
  '#NUM! rather than a grid full of zeros');
check('a negative driver is refused',
  expandAssembly(ASSEMBLY_BY_ID['slab-on-grade'], -5).lines.length === 0, 'refused');
check('a non-numeric driver is refused',
  expandAssembly(ASSEMBLY_BY_ID['slab-on-grade'], Number.NaN).lines.length === 0, 'refused');

{
  const bad = {
    ...ASSEMBLY_BY_ID['slab-on-grade'],
    components: [
      ...ASSEMBLY_BY_ID['slab-on-grade'].components,
      { description: 'Broken component', unit: 'EA', qty: '=DRIVER/0' },
    ],
  };
  const r = expandAssembly(bad, 100);
  check('a broken component is reported, and the rest still expand',
    r.errors.length === 1 && r.errors[0].code === '#DIV/0!' && r.lines.length >= 6,
    `${r.lines.length} good lines, ${r.errors.length} reported`);
}

/* ── picker plumbing ─────────────────────────────────────────────────────── */

check('assemblies group by division',
  assembliesByDivision().length >= 12 && assembliesByDivision()[0].division === '01',
  assembliesByDivision().map((g) => g.division).join(','));
check('search finds by name', searchAssemblies('partition').length >= 1, 'partition');
check('search finds by component',
  searchAssemblies('rebar').some((a) => a.id === 'footing-continuous'), 'rebar → footing');
check('search finds by division', searchAssemblies('26').some((a) => a.division === '26'), 'division 26');
check('empty search returns everything', searchAssemblies('  ').length === ASSEMBLIES.length, 'all');

{
  const r = expandAssembly(ASSEMBLY_BY_ID['door-hm-single'], 2, { startSortOrder: 40 });
  check('expansion can start at a given sort order',
    r.lines[0].sort_order === 40 && r.lines.at(-1)!.sort_order === 40 + r.lines.length - 1,
    `${r.lines[0].sort_order}…${r.lines.at(-1)!.sort_order}`);
}

console.log(failures === 0 ? '\nALL ASSEMBLY ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
