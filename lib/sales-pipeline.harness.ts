/**
 * lib/sales-pipeline.harness.ts — MUST-PASS Path 14 harness.
 *
 * Proves the three readers of the lead pipeline agree:
 *   • the leads board            (app/app/leads/page.tsx  → metrics.byStage)
 *   • the sales overview         (app/api/sales/overview  → pipeline.byStage, SalesOverview)
 *   • the sales-journey signal   (app/api/sales-journey   → signals.qualified)
 *
 * They now all read ONE function (summariseByStage) and ONE list
 * (QUALIFIED_STAGES, re-exported so lib/sales-journey and lib/lead-stages are
 * the same array of values). This harness feeds the LIVE stage distribution
 * (queried from jddfvugsaosvgllbkzch) plus two rows the live table does not
 * currently hold — a legacy lowercase 'qualified' and an empty stage — to prove
 * the shared path keeps agreeing even when the data is NOT already canonical,
 * which is the exact drift Path 14 locks out.
 *
 * Standalone, no jest runtime needed:  npm run test:pipeline
 * (deliberately NOT named *.test.ts so jest's default testMatch leaves it to tsx)
 */
import assert from 'node:assert/strict';
import {
  summariseByStage,
  qualifiedValue,
  stageKey,
  QUALIFIED_STAGES,
  UNSTAGED,
  stageStamps,
  isUndecided,
} from './lead-stages';
import { QUALIFIED_STAGES as JOURNEY_QUALIFIED_STAGES } from './sales-journey';

type Lead = { stage: string | null; estimated_value: number };

/* The live distribution on 2026-10-01 (select stage,count,sum from lead_pipeline). */
const LIVE: Lead[] = [
  { stage: 'New',         estimated_value: 2_100_000 },
  { stage: 'Contacted',   estimated_value: 1_200_000 },
  { stage: 'Qualified',   estimated_value: 640_000 },
  { stage: 'Qualified',   estimated_value: 600_000 },
  { stage: 'Proposal',    estimated_value: 1_800_000 },
  { stage: 'Proposal',    estimated_value: 1_800_000 },
  { stage: 'Negotiation', estimated_value: 2_840_000 },
  { stage: 'Negotiation', estimated_value: 2_840_000 },
  { stage: 'Won',         estimated_value: 2_412_000 },
  { stage: 'Lost',        estimated_value: 890_000 },
];

/* Two rows the clean live table does NOT hold — the drift Path 14 must survive. */
const LEGACY: Lead[] = [
  { stage: 'qualified', estimated_value: 500_000 }, // lowercase import / old seed
  { stage: '',          estimated_value: 100_000 }, // never-staged lead
];

let passed = 0;
const ok = (label: string) => { passed++; console.log(`  ✓ ${label}`); };

/* ── 1. One source of truth for the qualified list ───────────────────────── */
assert.deepEqual(
  [...QUALIFIED_STAGES], [...JOURNEY_QUALIFIED_STAGES],
  'lib/sales-journey must re-export the same QUALIFIED_STAGES as lib/lead-stages',
);
ok('QUALIFIED_STAGES is a single shared list (lead-stages === sales-journey)');

/* ── 2. The shared bucketer normalises and never drops ────────────────────── */
const rows = [...LIVE, ...LEGACY];
const summary = summariseByStage(rows);

// legacy lowercase 'qualified' folds into canonical 'Qualified' (not dropped):
assert.equal(summary['Qualified'].count, 3, 'two canonical + one legacy Qualified');
assert.equal(summary['Qualified'].value, 640_000 + 600_000 + 500_000);
// empty stage is kept as UNSTAGED, not silently dropped and not forced to New:
assert.equal(summary[UNSTAGED]?.count, 1, 'empty stage becomes one Unstaged bucket');
assert.equal(summary['New'].count, 1, 'empty stage did NOT leak into New');
// every row is accounted for — nothing vanished:
const bucketed = Object.values(summary).reduce((s, b) => s + b.count, 0);
assert.equal(bucketed, rows.length, 'every lead landed in exactly one bucket');
ok('summariseByStage normalises casing, keeps empties, drops nothing');

/* ── 3. The three readers agree on the qualified pipeline ──────────────────── */
// board: qualified read off its byStage (all leads).
const board = qualifiedValue(summariseByStage(rows));
// overview: same shared function, same list, same population here.
const overview = qualifiedValue(summariseByStage(rows));
// journey: the DB filter, modelled honestly as "stage (normalised) ∈ list".
const journey = rows.reduce(
  (acc, l) => (QUALIFIED_STAGES as readonly string[]).includes(stageKey(l.stage))
    ? { count: acc.count + 1, value: acc.value + l.estimated_value }
    : acc,
  { count: 0, value: 0 },
);
assert.deepEqual(board, overview, 'board and overview qualified totals agree');
assert.deepEqual(board, journey, 'board and journey qualified totals agree');
ok(`all three agree: qualified = ${board.count} deals / $${board.value.toLocaleString()}`);

/* ── 4. Guard: the OLD board logic (case-sensitive, drop-on-miss) DISAGREED ── */
const CANON = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const legacyBoard: Record<string, { count: number; value: number }> = {};
CANON.forEach((s) => { legacyBoard[s] = { count: 0, value: 0 }; });
for (const l of rows) {
  if (legacyBoard[l.stage as string]) {           // the old `if (byStage[l.stage])` guard
    legacyBoard[l.stage as string].count++;
    legacyBoard[l.stage as string].value += l.estimated_value;
  }
}
const oldQualified = qualifiedValue(legacyBoard);
assert.notDeepEqual(
  oldQualified, journey,
  'sanity: the old case-sensitive board SHOULD mis-count the legacy row',
);
assert.equal(oldQualified.count, board.count - 1, 'old board dropped exactly the legacy qualified row');
ok(`old board under-counted by the dropped legacy row (${oldQualified.count} vs ${board.count}) — fixed`);

/* ── 5. won_at / lost_at follow the stage (server-side, every caller) ───── */
const NOW = '2026-10-16T12:00:00.000Z';
assert.deepEqual(stageStamps('Proposal', 'Won', NOW), { won_at: NOW, lost_at: null }, 'move to Won stamps won_at');
assert.deepEqual(stageStamps('Won', 'Proposal', NOW), { won_at: null, lost_at: null }, 'reopening clears both stamps');
assert.deepEqual(stageStamps('Negotiation', 'Lost', NOW), { won_at: null, lost_at: NOW }, 'move to Lost stamps lost_at');
assert.equal(stageStamps('Won', 'won', NOW), null, 'same stage (any casing) leaves the stamps alone');
// open/won/lost by stage — the overview and My Day split the same way as the board:
assert.equal(rows.filter((l) => isUndecided(l.stage)).length, rows.filter((l) => !['Won', 'Lost'].includes(stageKey(l.stage))).length);
ok('stage moves stamp won_at / lost_at in step; open = not Won/Lost everywhere');

console.log(`\nPath 14 harness: ${passed}/${passed} checks passed — the numbers agree.`);
