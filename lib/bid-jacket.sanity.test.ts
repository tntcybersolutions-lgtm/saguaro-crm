/**
 * The pure pieces of a bid jacket's content: which divider a document lands in,
 * insurance as a bidder reads it, lists as bullets, what counts as complete,
 * drift against old and new manifests, the bidder's copy, the package details
 * PATCH, and which packages a takeoff rebuild may replace.
 *
 * Run: npx -y tsx lib/bid-jacket.sanity.test.ts   (exit 0 = every assertion held)
 * (imports storage-signing → supabase-server, so set NEXT_PUBLIC_SUPABASE_URL /
 *  NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY to any dummy value)
 */
import {
  writtenPage, deriveRequirements, dividerForCategory, forBidder, snapshotJacket, diffAgainstManifest,
  type Jacket, type JacketManifest,
} from './bid-jacket';
import { coverageValue, parseInsuranceText, insuranceSentence } from './jacket-insurance';
import { classifyProjectFile, sheetNumberIn, csiSectionIn, drawingName, disciplineOfSheet, byNumber } from './project-documents';
import { packageUpdate } from './bid-package-update';
import { planRebuild, isLegacySageInsurance, keepReason, NOT_THIS_BUILDS } from './sage-package-guard';

let failed = 0;
let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`ok   ${name}`); } else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* ── Where a file on the job goes ─────────────────────────────────────────── */
const cls = (name: string, extra: Record<string, string | null> = {}) => classifyProjectFile({ name, kind: 'pdf', mime: 'application/pdf', ...extra });
check('Files page "A-201 Electrical Plan.pdf" → drawing', cls('ZZ AUDIT 418822 A-201 Electrical Plan.pdf') === 'drawing');
check('"S2.1 Framing.pdf" → drawing', cls('S2.1 Framing.pdf') === 'drawing');
check('"E401.pdf" → drawing', cls('E401.pdf') === 'drawing');
check('"Construction Plans.pdf" → drawing', cls('APPROVED_Construction Plans.pdf') === 'drawing');
check('"Project Manual.pdf" → specification', cls('Project Manual Vol 1.pdf') === 'specification');
check('"09 21 16 Gypsum Board.pdf" → specification', cls('09 21 16 Gypsum Board.pdf') === 'specification');
check('"Addendum 2.pdf" → addendum', cls('Addendum 2.pdf') === 'addendum');
check('a run id is not a CSI section ("ZZ AUDIT 123456 Notes.pdf" → not a bid doc)', cls('ZZ AUDIT 123456 Notes.pdf') === null);
check('"W-9.pdf" is a tax form, not a sheet', cls('Ruiz W-9.pdf') === null);
check('"AIA G702.pdf" is a pay app, not a sheet', cls('AIA G702 App 3.pdf') === null);
check('"I-9.pdf" is a form, not a sheet', cls('I-9 Ruiz.pdf') === null);
check('a scope-of-work PDF with no folder stays off the jacket', cls('ZZ-AUDIT-Scope-of-Work.pdf') === null);
check('a site photo stays off', classifyProjectFile({ name: 'ZZ-AUDIT-jobsite-photo-1.jpg', kind: 'image', mime: 'image/jpeg' }) === null);
check('a video stays off even if named like a sheet', classifyProjectFile({ name: 'A-101 walkthrough.mp4', kind: 'video', mime: 'video/mp4' }) === null);
check('an image named as a sheet is a sheet', classifyProjectFile({ name: 'A-101 Floor Plan.png', kind: 'image', mime: 'image/png' }) === 'drawing');
check('Drawings folder → drawing whatever the name', cls('scan0003.pdf', { folder: 'Drawings' }) === 'drawing');
check('Specifications folder → specification', cls('book.pdf', { folder: 'Specifications' }) === 'specification');
check('Contracts folder never reaches a bidder, even a sheet-named file', cls('A-101 Exhibit.pdf', { folder: 'Contracts' }) === null);
check('Bonds & Insurance folder never reaches a bidder', cls('Plans bond.pdf', { folder: 'Bonds & Insurance' }) === null);
check('Invoices & Pay Apps folder never reaches a bidder', cls('E-1 invoice.pdf', { folder: 'Invoices & Pay Apps' }) === null);
check('Geotech & Survey → attachments', cls('Soils report.pdf', { folder: 'Geotech & Survey' }) === 'other');
check('category "drawing" → drawing', cls('x.pdf', { category: 'drawing' }) === 'drawing');
check('sheetNumberIn finds A-201', sheetNumberIn('ZZ AUDIT 418822 A-201 Electrical Plan') === 'A-201');
check('csiSectionIn finds 26 05 00, ignores 418822', csiSectionIn('ZZ AUDIT 418822 26 05 00 Common Work') === '26 05 00' && csiSectionIn('ZZ AUDIT 418822') === null);
check('drawingName joins sheet and title', drawingName('E-101', 'ZZ AUDIT Power Plan') === 'E-101 — ZZ AUDIT Power Plan');
check('drawingName does not repeat a sheet "number" that is the name', drawingName('ZZ AUDIT 418822 PLAN SET', 'ZZ AUDIT 418822 Plan Set') === 'ZZ AUDIT 418822 Plan Set');
check('discipline from sheet prefix', disciplineOfSheet('E-401') === 'Electrical' && disciplineOfSheet('FP-1') === 'Fire Protection');
const sorted = [{ number: 'A-10', name: '' }, { number: 'A-2', name: '' }, { number: null, name: 'Plan set' }].sort(byNumber).map((x) => x.number || x.name);
check('sheet order is natural (A-2 before A-10)', sorted.join() === 'A-2,A-10,Plan set', sorted.join());

/* ── Placed documents keep the GC's divider ───────────────────────────────── */
check('placed drawing → Drawings', dividerForCategory('drawing') === 'drawings');
check('placed specification → Specifications', dividerForCategory('specification') === 'specs');
check('placed addendum → Addenda', dividerForCategory('addendum') === 'addenda');
check('placed attachment named "Site Logistics Plan" stays an attachment', dividerForCategory('attachment') === 'attachments');
check('permit / form / other → Attachments', ['permit', 'form', 'other', null].every((c) => dividerForCategory(c) === 'attachments'));

/* ── Insurance ────────────────────────────────────────────────────────────── */
check('coverage: "2000000" → 2000000', coverageValue('2000000') === 2_000_000);
check('coverage: "$2,000,000" → 2000000', coverageValue('$2,000,000') === 2_000_000);
check('coverage: "2M" and "1.5 million"', coverageValue('2M') === 2_000_000 && coverageValue('1.5 million') === 1_500_000);
check('coverage: "Statutory" kept as words', coverageValue('Statutory') === 'Statutory');
check('coverage: blank / 0 / null → null', coverageValue('') === null && coverageValue(0) === null && coverageValue(null) === null);
const LIVE_JSON = '{"general_liability":2000000,"auto_liability":1000000,"workers_compensation":500000}';
const parsed = parseInsuranceText(LIVE_JSON);
check('live JSON shape → figures', parsed.gl === 2_000_000 && parsed.auto === 1_000_000 && parsed.wc === 500_000, JSON.stringify(parsed));
check('live JSON shape → a sentence, never JSON', parsed.text === 'Subcontractor must carry commercial general liability $2,000,000; automobile liability $1,000,000; workers\' compensation $500,000.' && !/[{}"]/.test(parsed.text || ''), parsed.text || '');
const odd = parseInsuranceText('{"umbrella":5000000,"additional_insured":true}');
check('other JSON keys → "Key: value" lines', odd.text === 'Umbrella: $5,000,000\nAdditional insured: Required', odd.text || '');
check('plain sentence passes through untouched', parseInsuranceText('General liability $1,000,000 per occurrence; auto $1,000,000; workers comp statutory.').text === 'General liability $1,000,000 per occurrence; auto $1,000,000; workers comp statutory.');
check('broken JSON is shown as the words it is', parseInsuranceText('{oops').text === '{oops');
check('insuranceSentence mixes money and terms', insuranceSentence({ gl: 1_000_000, wc: 'Statutory' }) === 'Subcontractor must carry commercial general liability $1,000,000; workers\' compensation Statutory.');

const req = (p: Record<string, unknown>, rows: Record<string, unknown>[] = []) => deriveRequirements(p, rows);
let r = req({ insurance_required_amount: 1_000_000 });
check('column default $1,000,000 alone: hidden and not satisfying', r.requirements.insuranceAmount === null && r.satisfied === false, JSON.stringify(r));
r = req({ insurance_required_amount: 2_000_000 });
check('a non-default amount is shown, but alone still does not satisfy', r.requirements.insuranceAmount === 2_000_000 && r.satisfied === false);
r = req({ insurance_required_amount: 1_000_000, insurance_requirements: 'GL $1M' });
check('default shown beside other insurance terms', r.requirements.insuranceAmount === 1_000_000 && r.satisfied === true);
r = req({ insurance_required_amount: 1_000_000, insurance_requirements: LIVE_JSON });
check('live JSON row: GL/Auto/WC filled from it, text readable, satisfied', r.requirements.generalLiability === 2_000_000 && r.requirements.autoLiability === 1_000_000 && r.requirements.workersComp === 500_000 && /^Subcontractor must carry/.test(r.requirements.insuranceText || '') && r.satisfied);
r = req({ general_liability: '$3,000,000', insurance_requirements: LIVE_JSON });
check('the GL column wins over the JSON', r.requirements.generalLiability === 3_000_000);
r = req({ workers_compensation: 'Statutory' });
check('text column "Statutory" survives', r.requirements.workersComp === 'Statutory' && r.satisfied);
r = req({ requires_bond: true });
check('bond alone satisfies Insurance & Bonding', r.requirements.bond && r.satisfied);
r = req({}, [{ id: 'q1', requirement_type: 'Umbrella', min_coverage: 5_000_000, is_required: true }]);
check('a requirements row is real input', r.requirements.insuranceAmount === 5_000_000 && r.satisfied);

/* ── Lists ────────────────────────────────────────────────────────────────── */
const pg = writtenPage('Work Included', ['Rough-in', '  ', 'Trim-out ']);
check('text[] → bullets', !!pg && JSON.stringify(pg.bullets) === '["Rough-in","Trim-out"]' && pg.body === '• Rough-in\n• Trim-out', JSON.stringify(pg));
check('empty array → no page', writtenPage('Work Excluded', []) === null && writtenPage('Work Excluded', ['', ' ']) === null);
check('string → prose page', writtenPage('Scope Narrative', ' Furnish all ')?.body === 'Furnish all');
check('null → no page', writtenPage('X', null) === null);

/* ── A jacket, for counts, drift and the bidder copy ──────────────────────── */
function jacket(over: Partial<{ instr: string | null; items: string[]; due: string; drawingFp: string; drawingRev: string; ins: string }> = {}): Jacket {
  const instr = over.instr === undefined ? 'Bid on the form.' : over.instr;
  const invitation = instr ? [{ id: 'i', title: 'Instructions to Bidders', body: instr }] : [];
  const items = (over.items ?? ['Power rough-in', 'Lighting']).map((d, i) => ({ id: `li${i}`, code: '', description: d, quantity: 1, unit: 'LS' }));
  const sections = [
    { key: 'invitation', label: 'Invitation & Instructions', required: true, count: invitation.length, pages: invitation, docs: [] },
    { key: 'scope', label: 'Scope of Work', required: true, count: 1, pages: [{ id: 's', title: 'Scope Narrative', body: 'Furnish all' }], docs: [] },
    { key: 'drawings', label: 'Drawings', required: true, count: 1, pages: [], docs: [{ id: 'd1', name: 'E-101 — Power', url: 'u', meta: over.drawingRev ?? 'Rev 1.0', kind: 'sheet' as const, fp: over.drawingFp ?? 'project-files/a.pdf' }] },
    { key: 'specs', label: 'Specifications', required: true, count: 0, pages: [], docs: [] },
    { key: 'bidform', label: 'Bid Form', required: true, count: items.length, pages: [], docs: [] },
    { key: 'requirements', label: 'Insurance & Bonding', required: true, count: 1, pages: [], docs: [] },
  ];
  const missing = sections.filter((s) => s.required && s.count === 0).map((s) => s.label);
  return {
    package: { id: 'p', name: 'ZZ AUDIT Electrical', number: null, trade: 'Electrical', status: 'open', dueDate: over.due ?? '2026-10-20', validityDays: 60, preBidDate: null, preBidLocation: null, preBidRequired: false, csiDivision: '26', estimatedValue: 250000, jacketPdfUrl: null, jacketGeneratedAt: null, addendumCount: 0 },
    project: { id: 'proj', name: 'ZZ AUDIT Job', address: null, city: null, state: null },
    sections,
    lineItems: items,
    requirements: { bond: true, prevailingWage: false, insuranceAmount: null, generalLiability: null, autoLiability: null, workersComp: null, insuranceText: over.ins ?? 'GL $1M', additional: [] },
    bidders: { invited: 3, responded: 1 },
    correspondence: null,
    completeness: { complete: sections.filter((s) => s.required).length - missing.length, total: 6, missing },
  } as unknown as Jacket;
}

const noInstr = jacket({ instr: null });
check('no instructions → Invitation is missing', noInstr.completeness.missing.includes('Invitation & Instructions'));

const issued = snapshotJacket(jacket(), 1);
check('snapshot stores hashes + fingerprints', !!issued.hashes && !!issued.hash && issued.docs[0].fp === 'project-files/a.pdf');
check('unchanged jacket → no drift', diffAgainstManifest(jacket(), issued).hasDrift === false);
let d = diffAgainstManifest(jacket({ items: ['Power rough-in', 'Lighting', 'Low-voltage'] }), issued);
check('line added after issue → drift names the bid form with counts', d.hasDrift && d.changed.some((c) => c.section === 'Bid Form' && c.name === 'Line items (2 → 3 lines)'), JSON.stringify(d.changed));
d = diffAgainstManifest(jacket({ items: ['Lighting', 'Power rough-in'] }), issued);
check('lines reordered → drift', d.changed.some((c) => c.section === 'Bid Form' && c.name === 'Line items'));
d = diffAgainstManifest(jacket({ instr: 'Bid by Friday.' }), issued);
check('instructions edited → drift', d.changed.some((c) => c.name === 'Instructions to bidders'));
d = diffAgainstManifest(jacket({ due: '2026-10-27' }), issued);
check('due date moved → drift', d.changed.some((c) => c.name === 'Bid due date or pre-bid meeting'));
d = diffAgainstManifest(jacket({ ins: 'GL $2M' }), issued);
check('insurance edited → drift', d.changed.some((c) => c.section === 'Insurance & Bonding'));
d = diffAgainstManifest(jacket({ drawingFp: 'project-files/b.pdf' }), issued);
check('same revision, file replaced → revised', d.revised.length === 1 && d.revised[0].to === 'Rev 1.0, file replaced', JSON.stringify(d.revised));
d = diffAgainstManifest(jacket({ drawingRev: 'Rev 2' }), issued);
check('new revision → revised Rev 1.0 → Rev 2', d.revised.length === 1 && d.revised[0].from === 'Rev 1.0' && d.revised[0].to === 'Rev 2');

/* A manifest from before hashes: docs with rev only, counts with the old
   invitation (+1 cover) and old insurance (default always 1). */
const old: JacketManifest = {
  version: 2, issuedAt: '2026-10-01T00:00:00Z',
  docs: [{ key: 'drawings:d1', section: 'Drawings', name: 'E-101 — Power', rev: 'Rev 1.0' }],
  counts: { invitation: 2, scope: 1, drawings: 1, specs: 0, bidform: 2, requirements: 1, addenda: 0, attachments: 0 },
};
d = diffAgainstManifest(jacket({ drawingFp: 'project-files/b.pdf' }), old);
check('old manifest: no false drift (no fp to compare, invitation/insurance counts ignored)', d.hasDrift === false, JSON.stringify(d));
d = diffAgainstManifest(jacket({ items: ['a', 'b', 'c'] }), old);
check('old manifest: bid form count change still caught', d.changed.length === 1 && d.changed[0].name === 'Line items (2 → 3 lines)', JSON.stringify(d.changed));
d = diffAgainstManifest(jacket({ drawingRev: 'Rev 3' }), old);
check('old manifest: revision still caught', d.revised.length === 1);
check('no manifest → no drift', diffAgainstManifest(jacket(), null).hasDrift === false && diffAgainstManifest(jacket(), { foo: 1 }).hasDrift === false);

const bidder = forBidder(jacket()) as unknown as Record<string, any>;
check('bidder copy: no bidders / completeness / correspondence', !('bidders' in bidder) && !('completeness' in bidder) && !('correspondence' in bidder));
check('bidder copy: no estimated value', !('estimatedValue' in bidder.package));
check('bidder copy: still has sections, line items, requirements', bidder.sections.length === 6 && bidder.lineItems.length === 2 && bidder.requirements.bond === true);
check('bidder copy JSON carries no budget figure', !JSON.stringify(bidder).includes('250000'));

/* ── Package details PATCH ────────────────────────────────────────────────── */
const ok = (b: Record<string, unknown>) => { const r2 = packageUpdate(b); return 'fields' in r2 ? r2.fields : null; };
const bad = (b: Record<string, unknown>) => { const r2 = packageUpdate(b); return 'bad' in r2 ? r2.bad.field : null; };
check('instructions trimmed', ok({ bid_instructions: '  Bid on the form.  ' })?.bid_instructions === 'Bid on the form.');
check('blank instructions → null (missing again)', ok({ bid_instructions: '   ' })?.bid_instructions === null);
check('work_included from lines, bullets stripped', JSON.stringify(ok({ work_included: '• Rough-in\n\n- Trim\n' })?.work_included) === '["Rough-in","Trim"]');
check('work_excluded array kept', JSON.stringify(ok({ work_excluded: ['Permits'] })?.work_excluded) === '["Permits"]');
check('GL "$2,000,000" stored as text "2000000"', ok({ general_liability: '$2,000,000' })?.general_liability === '2000000');
check('WC "Statutory" stored as words', ok({ workers_compensation: 'Statutory' })?.workers_compensation === 'Statutory');
check('minimum "$5,000,000" → 5000000', ok({ insurance_required_amount: '$5,000,000' })?.insurance_required_amount === 5_000_000);
check('due date validated', ok({ due_date: '2026-10-20' })?.due_date === '2026-10-20' && bad({ due_date: '10/20/2026' }) === 'due_date');
check('bond must be boolean', bad({ requires_bond: 'yes' }) === 'requires_bond' && ok({ requires_prevailing_wage: true })?.requires_prevailing_wage === true);
check('blank name refused', bad({ name: ' ' }) === 'name');
check('unknown fields ignored (tenant_id cannot be set)', JSON.stringify(ok({ tenant_id: 'x', id: 'y' })) === '{}');

/* ── Takeoff rebuild guard ────────────────────────────────────────────────── */
const none = { invited: new Set<string>(), bids: new Set<string>(), documents: new Set<string>() };
check('legacy JSON is the build\'s signature', isLegacySageInsurance(LIVE_JSON) && !isLegacySageInsurance('GL $1M') && !isLegacySageInsurance('{"umbrella":1}'));
const T = 'tk1';
const pkgs = [
  { id: 'fresh', status: 'draft', takeoff_id: T, ai_generated: true, csi_codes: ['03 30 00'] },
  { id: 'legacy', status: 'draft', insurance_requirements: LIVE_JSON, csi_codes: ['09 21 16'] },
  { id: 'open', status: 'open', takeoff_id: T, ai_generated: true, csi_codes: ['26 05 00'] },
  { id: 'awarded', status: 'awarded', insurance_requirements: LIVE_JSON, csi_codes: ['22 00 00'] },
  { id: 'invited', status: 'draft', takeoff_id: T, ai_generated: true, csi_codes: ['23 00 00'] },
  { id: 'edited', status: 'draft', takeoff_id: T, ai_generated: true, csi_codes: ['07 00 00'], jacket_edits: { edited_at: '2026-10-09T00:00:00Z' } },
  { id: 'issued', status: 'draft', takeoff_id: T, ai_generated: true, csi_codes: ['08 00 00'], jacket_generated_at: '2026-10-08T00:00:00Z' },
  { id: 'gc-made', status: 'draft', csi_codes: ['31 00 00'] },
  { id: 'kickoff', status: 'draft', ai_generated: true, csi_division: '03' },
];
const plan = planRebuild(pkgs, { ...none, invited: new Set(['invited']) });
check('only untouched drafts the build wrote are replaced', JSON.stringify(plan.replace.sort()) === '["fresh","legacy"]', JSON.stringify(plan.replace));
check('open / awarded / invited / edited / issued kept', ['open', 'awarded', 'invited', 'edited', 'issued'].every((id) => plan.keep.some((k) => k.id === id)));
check('GC-made and kickoff packages are never the build\'s to delete', plan.keep.find((k) => k.id === 'gc-made')?.reason === NOT_THIS_BUILDS && plan.keep.find((k) => k.id === 'kickoff')?.reason === NOT_THIS_BUILDS);
check('kept build packages block their divisions from being written twice', ['26', '22', '23', '07', '08'].every((x) => plan.keepDivisions.has(x)) && !plan.keepDivisions.has('03') && !plan.keepDivisions.has('31'), [...plan.keepDivisions].join());
check('a package with bids is kept', keepReason(pkgs[0], { ...none, bids: new Set(['fresh']) }) === 'bids received');
check('a package with a placed document is kept', keepReason(pkgs[0], { ...none, documents: new Set(['fresh']) }) === 'documents placed in it');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
