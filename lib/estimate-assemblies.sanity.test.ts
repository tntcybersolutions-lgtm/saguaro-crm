/**
 * Assembly sanity — expansion arithmetic against real construction standards.
 * Run: npx -y tsx lib/estimate-assemblies.sanity.test.ts
 *
 * The quantity logic is the part with value in it, so it is the part that gets
 * checked against numbers an estimator can verify by hand: studs at 16" on
 * centre, 32 SF to a 4x8 sheet, 27 cubic feet to the cubic yard, 0.668 lb per
 * foot of #4 bar. A library that expands to plausible-looking wrong quantities
 * is worse than no library, because nobody re-checks a number the software
 * produced.
 */
import {
  ASSEMBLIES, ASSEMBLY_BY_ID, expandAssembly, assemblyNeedsPricing,
  assembliesByDivision, searchAssemblies,
} from './estimate-assemblies';
import { evaluateExpression } from './estimate-formula';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const qtyOf = (lines: { description?: string; quantity?: number | null }[], match: RegExp) =>
  Number(lines.find((l) => match.test(l.description ?? ''))?.quantity);

/* ── the library is well-formed ──────────────────────────────────────────── */

check('the library has real content', ASSEMBLIES.length >= 12, `${ASSEMBLIES.length} assemblies`);
check('every assembly has a unique id',
  new Set(ASSEMBLIES.map((a) => a.id)).size === ASSEMBLIES.length, 'no duplicates');
check('every assembly has components',
  ASSEMBLIES.every((a) => a.components.length > 0), 'none empty');

/* Every quantity expression must parse and produce a positive number at a
   representative driver. A library shipping a broken expression would fail in
   front of an estimator mid-bid. */
{
  const broken: string[] = [];
  for (const a of ASSEMBLIES) {
    for (const c of a.components) {
      try {
        const v = evaluateExpression(c.qty, { DRIVER: 100 });
        if (!Number.isFinite(v) || v <= 0) broken.push(`${a.id}/${c.description} → ${v}`);
      } catch (e) {
        broken.push(`${a.id}/${c.description} → ${(e as Error).message}`);
      }
    }
  }
  check('every quantity expression in the library evaluates',
    broken.length === 0, broken.length ? broken.slice(0, 3).join(' | ') : `${ASSEMBLIES.reduce((n, a) => n + a.components.length, 0)} components`);
}

check('every component has a unit', ASSEMBLIES.every((a) => a.components.every((c) => !!c.unit)), 'all set');
check('every assembly declares a CSI division',
  ASSEMBLIES.every((a) => /^\d{2}$/.test(a.division)), 'two digits');

/* ── the partition, checked by hand ──────────────────────────────────────── */

{
  const a = ASSEMBLY_BY_ID['partition-stud-gwb-2side'];
  const r = expandAssembly(a, 240);

  check('a 240 LF partition expands to every trade line',
    r.lines.length === 5 && r.errors.length === 0, `${r.lines.length} lines, ${r.errors.length} errors`);

  check('studs land at 16 inches on centre',
    qtyOf(r.lines, /metal stud/) === 181,
    `${qtyOf(r.lines, /metal stud/)} — 240 LF ÷ 16" × 12 = 180, plus one to close the run`);

  check('track covers top and bottom in 10ft lengths',
    qtyOf(r.lines, /track/) === 48, `${qtyOf(r.lines, /track/)} — 240 × 2 ÷ 10`);

  check('board covers both faces at 32 SF a sheet',
    qtyOf(r.lines, /gypsum board/) === 135,
    `${qtyOf(r.lines, /gypsum board/)} — 240 × 9ft × 2 faces ÷ 32 SF`);

  check('finish area is both faces',
    qtyOf(r.lines, /compound/) === 4320, `${qtyOf(r.lines, /compound/)} — 240 × 9 × 2`);

  check('screws follow the board area',
    qtyOf(r.lines, /screws/) === 7.6, `${qtyOf(r.lines, /screws/)} lb — 4,320 SF ÷ 1,000 × 1.75`);

  check('the basis travels with each line',
    r.lines.every((l) => typeof l.notes === 'string' && l.notes.includes(a.name)),
    'every line says where it came from');

  check('expanded lines carry the assembly id',
    r.lines.every((l) => l.assembly_id === a.id), 'grouped and re-expandable');

  check('lines land in the assembly division',
    r.lines.every((l) => l.csi_division === '09'), 'division 09');

  check('sort order is sequential',
    r.lines.every((l, i) => l.sort_order === i), 'ordered');

  check('an indicative total is reported',
    r.indicativeTotal > 0, `$${r.indicativeTotal.toLocaleString('en-US')} at library pricing`);
}

/* ── the slab, checked against 27 CF to the cubic yard ───────────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['slab-on-grade'], 5400);
  check('a 4" slab converts to cubic yards correctly',
    qtyOf(r.lines, /Concrete/) === 66.67,
    `${qtyOf(r.lines, /Concrete/)} CY — 5,400 SF × 4/12 ft ÷ 27`);
  check('vapour barrier matches the slab area',
    qtyOf(r.lines, /vapour barrier/) === 5400, `${qtyOf(r.lines, /vapour barrier/)} SF`);
  check('concrete carries a waste factor',
    r.lines.find((l) => /Concrete/.test(l.description ?? ''))?.waste_factor_pct === 8, '8%');
}

/* ── rebar weight, which is where hand-estimates go wrong ────────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['footing-continuous'], 320);
  check('#4 rebar converts feet to pounds at 0.668 lb/ft',
    qtyOf(r.lines, /rebar/) === 641.3,
    `${qtyOf(r.lines, /rebar/)} lb — 320 LF × 3 bars × 0.668`);
  check('footing concrete is 24" × 12" in cubic yards',
    qtyOf(r.lines, /Concrete/) === 23.7, `${qtyOf(r.lines, /Concrete/)} CY — 320 × 2 × 1 ÷ 27`);
}

/* ── ceilings and fasteners ──────────────────────────────────────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['acoustic-ceiling'], 4000);
  check('2x4 panels cover 8 SF each',
    qtyOf(r.lines, /acoustic panel/) === 500, `${qtyOf(r.lines, /acoustic panel/)} — 4,000 ÷ 8`);
  check('hangers land one per 16 SF',
    qtyOf(r.lines, /Hanger/) === 250, `${qtyOf(r.lines, /Hanger/)} — 4,000 ÷ 16`);
}

/* ── paint coverage ──────────────────────────────────────────────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['paint-interior-walls'], 7000);
  check('primer covers 350 SF a gallon',
    qtyOf(r.lines, /Primer/) === 20, `${qtyOf(r.lines, /Primer/)} gal — 7,000 ÷ 350`);
  check('two finish coats at 380 SF a gallon',
    qtyOf(r.lines, /Finish paint/) === 36.84, `${qtyOf(r.lines, /Finish paint/)} gal — 7,000 × 2 ÷ 380`);
}

/* ── per-each assemblies scale linearly ──────────────────────────────────── */

{
  const one = expandAssembly(ASSEMBLY_BY_ID['door-hm-single'], 1);
  const ten = expandAssembly(ASSEMBLY_BY_ID['door-hm-single'], 10);
  check('a per-each assembly scales exactly',
    Math.abs(ten.indicativeTotal - one.indicativeTotal * 10) < 0.01,
    `1 door $${one.indicativeTotal} → 10 doors $${ten.indicativeTotal}`);
  check('hinges come three to a leaf',
    qtyOf(ten.lines, /hinges/) === 30, `${qtyOf(ten.lines, /hinges/)} for 10 doors`);
}

/* ── circuits round UP, because you cannot buy most of a breaker ─────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['branch-lighting-2x4'], 9);
  check('9 fixtures need 2 circuits, not 1.125',
    qtyOf(r.lines, /Circuit share/) === 2,
    `${qtyOf(r.lines, /Circuit share/)} — CEILING(9/8) — you cannot buy an eighth of a breaker`);
}

/* ── honesty about pricing ───────────────────────────────────────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['partition-stud-gwb-2side'], 100);
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
  /* A component with a broken expression must be reported and skipped — not
     silently dropped, and not landed at zero. */
  const bad = {
    ...ASSEMBLY_BY_ID['slab-on-grade'],
    components: [
      ...ASSEMBLY_BY_ID['slab-on-grade'].components,
      { description: 'Broken component', unit: 'EA', qty: '=DRIVER/0' },
    ],
  };
  const r = expandAssembly(bad, 100);
  check('a broken component is reported, and the rest still expand',
    r.errors.length === 1 && r.errors[0].code === '#DIV/0!' && r.lines.length === 6,
    `${r.lines.length} good lines, ${r.errors.length} reported`);
}

/* ── picker plumbing ─────────────────────────────────────────────────────── */

check('assemblies group by division',
  assembliesByDivision().length >= 6 && assembliesByDivision()[0].division === '03',
  assembliesByDivision().map((g) => g.division).join(','));
check('search finds by name', searchAssemblies('partition').length >= 2, 'partition');
check('search finds by component',
  searchAssemblies('rebar').some((a) => a.id === 'footing-continuous'), 'rebar → footing');
check('search finds by division', searchAssemblies('26').some((a) => a.division === '26'), 'division 26');
check('empty search returns everything', searchAssemblies('  ').length === ASSEMBLIES.length, 'all');

/* ── a start offset lets an assembly land below existing rows ────────────── */

{
  const r = expandAssembly(ASSEMBLY_BY_ID['door-hm-single'], 2, { startSortOrder: 40 });
  check('expansion can start at a given sort order',
    r.lines[0].sort_order === 40 && r.lines.at(-1)!.sort_order === 40 + r.lines.length - 1,
    `${r.lines[0].sort_order}…${r.lines.at(-1)!.sort_order}`);
}

console.log(failures === 0 ? '\nALL ASSEMBLY ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
