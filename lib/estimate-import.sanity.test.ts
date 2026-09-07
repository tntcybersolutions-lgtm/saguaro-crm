/**
 * Estimate-import sanity — header guessing and sheet mapping.
 * Run: npx -y tsx lib/estimate-import.sanity.test.ts   (exit 0 = every assertion held)
 *
 * The guessing is the whole value of this import: an estimator bringing in a
 * 300-line workbook should be correcting one wrong header, not naming twelve.
 * So the assertions are mostly header spellings real workbooks use, and the
 * traps that make a naive matcher wrong:
 *
 *   "Unit Cost" matching the rule for "Unit"      → prices land in the unit column
 *   "Labor Rate" falling through to generic price → labour billed as material
 *   a "Total" column imported as a cost           → multiplied by quantity twice
 *   two description-ish columns both claimed      → the second silently wins
 *   a priced row with no description dropped      → the bid quietly understates
 */
import {
  guessField, guessMapping, isHeaderRow, applyMapping, buildPreview,
  FIELD_OPTIONS, type ImportField,
} from './estimate-import';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const g = (h: string) => guessField(h);

/* ── header spellings ────────────────────────────────────────────────────── */

check('description', g('Description') === 'description', `→ ${g('Description')}`);
check('item is a description', g('Item') === 'description', `→ ${g('Item')}`);
check('scope of work is a description', g('Scope of Work') === 'description', `→ ${g('Scope of Work')}`);
check('quantity', g('Quantity') === 'quantity', `→ ${g('Quantity')}`);
check('qty abbreviation', g('QTY') === 'quantity', `→ ${g('QTY')}`);
check('unit', g('Unit') === 'unit', `→ ${g('Unit')}`);
check('uom', g('UOM') === 'unit', `→ ${g('UOM')}`);
check('cost code', g('Cost Code') === 'csi_code', `→ ${g('Cost Code')}`);
check('CSI division', g('CSI Division') === 'csi_code', `→ ${g('CSI Division')}`);
check('waste', g('Waste %') === 'waste_factor_pct', `→ ${g('Waste %')}`);

check('material cost', g('Material Cost') === 'unit_material_cost', `→ ${g('Material Cost')}`);
check('bare "Material"', g('Material') === 'unit_material_cost', `→ ${g('Material')}`);
check('labor cost', g('Labor Cost') === 'unit_labor_cost', `→ ${g('Labor Cost')}`);
check('British spelling', g('Labour Rate') === 'unit_labor_cost', `→ ${g('Labour Rate')}`);
check('equipment', g('Equipment') === 'unit_equipment_cost', `→ ${g('Equipment')}`);
check('subcontract', g('Subcontractor Price') === 'unit_sub_cost', `→ ${g('Subcontractor Price')}`);

/* The traps. */
check('"Unit Cost" is a COST, not the unit column',
  g('Unit Cost') === 'unit_material_cost',
  `→ ${g('Unit Cost')} — matching the "unit" rule first would put money in the unit column`);
check('"Unit Price" is a cost', g('Unit Price') === 'unit_material_cost', `→ ${g('Unit Price')}`);
check('"Labor Rate" beats the generic price rule',
  g('Labor Rate') === 'unit_labor_cost', `→ ${g('Labor Rate')} — not unit_material_cost`);
check('a Total column is skipped, not imported as a cost',
  g('Total') === 'ignore' && g('Extended Amount') === 'ignore' && g('Line Total') === 'ignore',
  'importing a total as a unit cost multiplies it by quantity a second time');
check('an unrecognised header is skipped rather than guessed at',
  g('Supervisor Initials') === 'ignore', `→ ${g('Supervisor Initials')}`);
check('a blank header is skipped', g('') === 'ignore' && g('   ') === 'ignore', 'blank → ignore');

/* ── whole-row mapping ───────────────────────────────────────────────────── */

const headers = ['Cost Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Total'];
const mapped = guessMapping(headers);
check('a typical header row maps end to end',
  mapped.join(',') === 'csi_code,description,quantity,unit,unit_material_cost,ignore',
  mapped.join(','));

check('a field is claimed only once',
  guessMapping(['Description', 'Item Description']).join(',') === 'description,ignore',
  'the second description-ish column is left for the user rather than overwriting the first');

/* Buildern's own export shape. */
const buildern = guessMapping(['Name', 'Cost Type', 'Group', 'Quantity', 'Unit', 'Unit Cost', 'Markup', 'Description']);
check('a Buildern-shaped export maps its quantities and costs',
  buildern[3] === 'quantity' && buildern[4] === 'unit' && buildern[5] === 'unit_material_cost',
  buildern.join(','));

/* ── header detection ────────────────────────────────────────────────────── */

check('a word row is a header', isHeaderRow(['Code', 'Description', 'Qty']), 'words');
check('a number row is data', !isHeaderRow(['03-300', '1200', '4.25']), 'mostly numeric');
check('a mixed row leaning numeric is data',
  !isHeaderRow(['03-300', 'Slab', '1200', '4.25', '2.10']), '3 of 5 numeric');
check('an empty row is not a header', !isHeaderRow(['', '  ']), 'blank');

/* ── applying the mapping ────────────────────────────────────────────────── */

const sheet: unknown[][] = [
  ['Cost Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Total'],
  ['03-300', 'Slab on grade', '1,200', 'SF', '$4.25', '$5,100.00'],
  ['03-350', 'Curing compound', 1200, 'SF', 0.15, 180],
  ['', '', '', '', '', ''],
  ['26-100', '', '10', 'EA', '900', '9000'],
];
const applied = applyMapping(sheet, mapped, { hasHeader: true });

check('rows parse with formatted numbers',
  applied.rows[0].quantity === 1200 && applied.rows[0].unit_material_cost === 4.25,
  `qty=${applied.rows[0].quantity} cost=${applied.rows[0].unit_material_cost} from "1,200" and "$4.25"`);
check('the Total column is not imported',
  (applied.rows[0] as Record<string, unknown>).unit_sub_cost === undefined &&
  Object.values(applied.rows[0]).every((v) => v !== 5100),
  'no field received 5100');
check('a fully blank row is dropped and counted',
  applied.emptyRows === 1, `emptyRows=${applied.emptyRows}`);
check('a priced row with no description is KEPT with a placeholder',
  applied.rows.length === 3 && applied.rows[2].description === 'Imported line' && applied.rows[2].quantity === 10,
  'dropping it would quietly understate the bid');
check('numeric cells that are already numbers work',
  applied.rows[1].quantity === 1200 && applied.rows[1].unit_material_cost === 0.15,
  'xlsx hands back real numbers, not strings');

/* ── the whole preview ───────────────────────────────────────────────────── */

const preview = buildPreview(sheet);
check('preview detects the header', preview.skippedHeader === true, 'skippedHeader=true');
check('preview maps and counts', preview.totalRows === 3 && preview.emptyRows === 1,
  `${preview.totalRows} rows, ${preview.emptyRows} empty`);
check('preview keeps raw cells for display', preview.raw.length > 0 && preview.raw[0][1] === 'Description',
  'raw[0][1]=Description');

const noHeader = buildPreview([['03-300', 'Slab', '100', 'SF', '4']]);
check('a headerless sheet falls back to this app\'s own column order',
  noHeader.skippedHeader === false && noHeader.rows[0].description === 'Slab' && noHeader.rows[0].quantity === 100,
  `desc=${noHeader.rows[0].description} qty=${noHeader.rows[0].quantity}`);

check('an empty sheet produces an empty preview, not a crash',
  buildPreview([]).totalRows === 0 && buildPreview([[], ['', '']]).totalRows === 0, 'handled');

check('ragged rows do not throw',
  buildPreview([['Code', 'Description', 'Qty'], ['03-300'], ['03-350', 'Curing', '5']]).totalRows === 2,
  'short rows padded');

check('every option the dropdown offers has a label',
  FIELD_OPTIONS.every((f) => typeof f === 'string' && f.length > 0) && FIELD_OPTIONS.includes('ignore' as ImportField),
  `${FIELD_OPTIONS.length} options`);

console.log(failures === 0 ? '\nALL ESTIMATE-IMPORT ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
