import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';

interface HazardRow {
  task: string;
  hazard: string;
  control: string;
}

export interface JHAInput {
  projectId: string;
  trade?: string;
  hazards?: HazardRow[];
}

const DEFAULT_HAZARDS: Record<string, HazardRow[]> = {
  concrete: [
    { task: 'Formwork erection', hazard: 'Formwork collapse', control: 'Inspect bracing, use engineered shoring' },
    { task: 'Concrete cutting/grinding', hazard: 'Silica dust exposure', control: 'Wet cutting, N95/P100 respirator' },
    { task: 'Concrete placement', hazard: 'Chemical burns from wet concrete', control: 'Rubber boots, gloves, long sleeves' },
    { task: 'Rebar installation', hazard: 'Impalement on rebar', control: 'Rebar caps, awareness barriers' },
    { task: 'Form stripping', hazard: 'Struck by falling forms', control: 'Barricade area, hard hats, controlled lowering' },
    { task: 'Finishing operations', hazard: 'Ergonomic strain', control: 'Knee pads, rotate tasks, stretch breaks' },
    { task: 'Elevated pours', hazard: 'Falls from elevation', control: 'Guardrails, harness/lanyard, nets' },
    { task: 'Pump truck operation', hazard: 'Boom contact with power lines', control: 'Spotter, 10-ft clearance, de-energize if possible' },
    { task: 'Material handling', hazard: 'Overexertion / back injury', control: 'Mechanical lifts, team lifting, proper technique' },
    { task: 'Vibrator operation', hazard: 'Hand-arm vibration syndrome', control: 'Anti-vibration gloves, limit exposure time' },
  ],
  electrical: [
    { task: 'Panel installation', hazard: 'Arc flash / arc blast', control: 'De-energize, LOTO, arc-rated PPE' },
    { task: 'Wire pulling', hazard: 'Electrical shock', control: 'Verify zero energy, insulated tools, GFCIs' },
    { task: 'Conduit routing at height', hazard: 'Falls from ladders/lifts', control: 'Three-point contact, harness on lifts' },
    { task: 'Trenching for underground', hazard: 'Trench collapse', control: 'Sloping/shoring per OSHA, competent person' },
    { task: 'Switchgear energization', hazard: 'Electrocution', control: 'Qualified persons only, PPE, flash study' },
    { task: 'Overhead work', hazard: 'Struck by falling tools', control: 'Tool lanyards, barricade below' },
    { task: 'Cable termination', hazard: 'Burns from hot surfaces', control: 'Thermal gloves, cool-down period' },
    { task: 'Generator connection', hazard: 'Back-feed electrocution', control: 'Transfer switch, LOTO, verification' },
    { task: 'Testing and commissioning', hazard: 'Unexpected energization', control: 'LOTO, communication plan, buddy system' },
    { task: 'Material storage', hazard: 'Tripping / struck-by', control: 'Housekeeping, organized laydown area' },
  ],
  roofing: [
    { task: 'Roof access', hazard: 'Falls from elevation', control: 'Guardrails, harness/lanyard, warning lines' },
    { task: 'Hot asphalt application', hazard: 'Burns from hot materials', control: 'Thermal PPE, first aid kit, buddy system' },
    { task: 'Membrane torching', hazard: 'Fire hazard', control: 'Fire watch, extinguisher, hot work permit' },
    { task: 'Material hoisting', hazard: 'Struck by falling loads', control: 'Tag lines, barricade below, signalman' },
    { task: 'Prolonged sun exposure', hazard: 'Heat illness / sunburn', control: 'Shade breaks, hydration, acclimatization' },
    { task: 'Sheet metal flashing', hazard: 'Lacerations', control: 'Cut-resistant gloves, deburr edges' },
    { task: 'Skylight proximity', hazard: 'Falls through openings', control: 'Skylight screens/guards, 6-ft rule' },
    { task: 'Tear-off operations', hazard: 'Ergonomic strain', control: 'Mechanical removal, task rotation' },
    { task: 'Edge work', hazard: 'Falls from leading edge', control: 'PFAS, controlled access zone' },
    { task: 'Chemical adhesive use', hazard: 'Inhalation / skin irritation', control: 'Ventilation, respirator, gloves' },
  ],
  steel: [
    { task: 'Steel erection', hazard: 'Crane struck-by', control: 'Rigger signals, exclusion zone, tag lines' },
    { task: 'Iron walking', hazard: 'Falls from steel', control: 'Connectors: harness above 15 ft, nets' },
    { task: 'Welding/cutting', hazard: 'Burns and UV exposure', control: 'Welding hood, leathers, fire watch' },
    { task: 'Bolt-up operations', hazard: 'Pinch points / hand injuries', control: 'Impact gloves, spud wrench technique' },
    { task: 'Decking installation', hazard: 'Falls through openings', control: 'Hole covers, PFAS, controlled decking zone' },
    { task: 'Column splicing', hazard: 'Falling objects', control: 'Barricade below, tool lanyards, hard hats' },
    { task: 'Shear stud installation', hazard: 'Arc flash / noise', control: 'Eye/face protection, hearing protection' },
    { task: 'Material handling', hazard: 'Overexertion', control: 'Crane/forklift, team lifts' },
    { task: 'Torch cutting', hazard: 'Fire / fume inhalation', control: 'Hot work permit, ventilation, fire watch' },
    { task: 'Plumbing and aligning', hazard: 'Structural instability', control: 'Temporary bracing per erection plan' },
  ],
  general: [
    { task: 'Walking/working surfaces', hazard: 'Slips, trips, and falls', control: 'Housekeeping, proper lighting, footwear' },
    { task: 'Overhead operations', hazard: 'Struck by falling objects', control: 'Hard hats, barricades, tool lanyards' },
    { task: 'Excavation work', hazard: 'Caught in trench collapse', control: 'Sloping/shoring, competent person, egress' },
    { task: 'Power tool use', hazard: 'Lacerations / amputations', control: 'Guards in place, training, PPE' },
    { task: 'Material handling', hazard: 'Overexertion / back injury', control: 'Proper lifting, mechanical aids' },
    { task: 'Scaffold work', hazard: 'Falls from elevation', control: 'Competent person, full planking, guardrails' },
    { task: 'Ladder use', hazard: 'Falls', control: 'Three-point contact, inspect before use' },
    { task: 'Confined space entry', hazard: 'Atmospheric hazards', control: 'Permit, air monitoring, rescue plan' },
    { task: 'Demolition', hazard: 'Structural collapse', control: 'Engineering survey, controlled sequence' },
    { task: 'Traffic / equipment areas', hazard: 'Struck by vehicles', control: 'High-vis vests, spotters, barricades' },
  ],
};

export async function generateJHA(input: JHAInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;

  const trade = input.trade || 'general';
  const hazards = input.hazards || DEFAULT_HAZARDS[trade.toLowerCase()] || DEFAULT_HAZARDS.general;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Gold header bar
  page.drawRectangle({
    x: 0,
    y: height - 40,
    width,
    height: 40,
    color: rgb(0.831, 0.627, 0.09),
  });
  page.drawText('JOB HAZARD ANALYSIS (JHA)', {
    x: 10,
    y: height - 26,
    size: 12,
    font: bold,
    color: rgb(0.05, 0.07, 0.09),
  });
  page.drawText('SAGUARO CONSTRUCTION INTELLIGENCE PLATFORM', {
    x: 10,
    y: height - 36,
    size: 7,
    font,
    color: rgb(0.2, 0.1, 0),
  });

  // Project info
  let y = height - 65;
  drawField(page, font, bold, 'PROJECT:', (project as any)?.name || '', 10, y, 200);
  drawField(page, font, bold, 'DATE:', new Date().toLocaleDateString(), 215, y, 130);
  drawField(page, font, bold, 'TRADE/ACTIVITY:', trade, 350, y, 200);

  y -= 30;
  drawField(page, font, bold, 'PREPARED BY:', '', 10, y, 200);
  drawField(page, font, bold, 'PROJECT ADDRESS:', (project as any)?.address || '', 215, y, 335);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Table header
  y -= 18;
  page.drawRectangle({
    x: 10,
    y: y - 4,
    width: width - 20,
    height: 16,
    color: rgb(0.15, 0.2, 0.25),
  });
  page.drawText('TASK / ACTIVITY', {
    x: 15, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText('POTENTIAL HAZARD', {
    x: 210, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText('CONTROLS / MITIGATION', {
    x: 400, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });

  // Hazard rows
  const maxRows = Math.min(hazards.length, 12);
  for (let i = 0; i < maxRows; i++) {
    const row = hazards[i];
    y -= 16;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 16,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    page.drawText(row.task.slice(0, 28), {
      x: 15, y: y + 1, size: 8, font, color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(row.hazard.slice(0, 28), {
      x: 210, y: y + 1, size: 8, font, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(row.control.slice(0, 35), {
      x: 400, y: y + 1, size: 8, font, color: rgb(0.2, 0.2, 0.2),
    });
  }

  // PPE Requirements section
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.83, 0.63, 0.09),
  });
  y -= 15;
  page.drawText('REQUIRED PPE', {
    x: 10, y, size: 10, font: bold, color: rgb(0, 0, 0),
  });
  y -= 14;
  const ppeItems = [
    'Hard Hat', 'Safety Glasses', 'High-Vis Vest', 'Steel-Toe Boots',
    'Gloves (task-appropriate)', 'Hearing Protection (when required)',
  ];
  ppeItems.forEach((item) => {
    page.drawText(`\u2022  ${item}`, {
      x: 15, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  });

  // Emergency contacts section
  y -= 10;
  page.drawText('EMERGENCY CONTACTS', {
    x: 10, y, size: 10, font: bold, color: rgb(0, 0, 0),
  });
  y -= 14;
  const emergencyItems = [
    'Emergency Services: 911',
    'Site Superintendent: _______________',
    'Safety Manager: _______________',
    'Nearest Hospital: _______________',
  ];
  emergencyItems.forEach((item) => {
    page.drawText(item, {
      x: 15, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  });

  // Signature blocks
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;

  const sigCols = [
    { label: 'PREPARED BY:', x: 10 },
    { label: 'REVIEWED BY:', x: 210 },
    { label: 'SITE SUPERINTENDENT:', x: 410 },
  ];

  sigCols.forEach((col) => {
    page.drawText(col.label, {
      x: col.x, y, size: 8, font: bold, color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: col.x, y: y - 20 },
      end: { x: col.x + 180, y: y - 20 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    page.drawText('Signature / Date', {
      x: col.x, y: y - 30, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });
  });

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  JHA`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'jha', pdfBytes, {
    trade,
    hazardCount: hazards.length,
  });

  return { pdfBytes, pdfUrl };
}
