import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';

export interface PrevailingWageInput {
  projectId: string;
  county?: string;
}

interface WageRate {
  trade: string;
  baseRate: number;
  fringe: number;
  total: number;
}

const ARIZONA_RATES: WageRate[] = [
  { trade: 'Electrician', baseRate: 38.50, fringe: 16.20, total: 54.70 },
  { trade: 'Plumber/Pipefitter', baseRate: 36.80, fringe: 15.90, total: 52.70 },
  { trade: 'Carpenter', baseRate: 28.50, fringe: 12.80, total: 41.30 },
  { trade: 'Ironworker', baseRate: 32.40, fringe: 14.50, total: 46.90 },
  { trade: 'Laborer', baseRate: 18.50, fringe: 8.20, total: 26.70 },
  { trade: 'Operating Engineer', baseRate: 32.00, fringe: 13.60, total: 45.60 },
  { trade: 'Cement Mason', baseRate: 26.50, fringe: 11.90, total: 38.40 },
  { trade: 'Painter', baseRate: 24.80, fringe: 10.50, total: 35.30 },
  { trade: 'Roofer', baseRate: 25.20, fringe: 11.00, total: 36.20 },
  { trade: 'Sheet Metal Worker', baseRate: 35.00, fringe: 15.00, total: 50.00 },
  { trade: 'HVAC Mechanic', baseRate: 34.50, fringe: 14.80, total: 49.30 },
  { trade: 'Truck Driver', baseRate: 22.00, fringe: 9.50, total: 31.50 },
];

export async function generatePrevailingWage(input: PrevailingWageInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  const county = input.county || 'Maricopa';

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
  page.drawText('PREVAILING WAGE RATE DETERMINATION', {
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

  // Subtitle
  let y = height - 55;
  page.drawText('Davis-Bacon Act \u2014 State of Arizona', {
    x: 10, y, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2),
  });

  // Project info
  y -= 20;
  drawField(page, font, bold, 'PROJECT:', p?.name || '', 10, y, 200);
  drawField(page, font, bold, 'PROJECT NO:', p?.project_number || '', 215, y, 130);
  drawField(page, font, bold, 'DATE:', new Date().toLocaleDateString(), 350, y, 130);

  y -= 30;
  drawField(page, font, bold, 'PROJECT ADDRESS:', p?.address || '', 10, y, 270);
  drawField(page, font, bold, 'COUNTY:', county, 285, y, 130);
  drawField(page, font, bold, 'STATE:', 'Arizona', 420, y, 130);

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
  page.drawText('TRADE CLASSIFICATION', {
    x: 15, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText('BASE RATE', {
    x: 250, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText('FRINGE BENEFITS', {
    x: 350, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText('TOTAL RATE', {
    x: 480, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1),
  });

  // Wage rows
  for (let i = 0; i < ARIZONA_RATES.length; i++) {
    const rate = ARIZONA_RATES[i];
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 18,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    page.drawText(rate.trade, {
      x: 15, y: y + 2, size: 9, font, color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(fmtCurrency(rate.baseRate), {
      x: 250, y: y + 2, size: 9, font, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(fmtCurrency(rate.fringe), {
      x: 350, y: y + 2, size: 9, font, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(fmtCurrency(rate.total), {
      x: 480, y: y + 2, size: 9, font: bold, color: rgb(0, 0, 0),
    });
  }

  // Footer note
  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.83, 0.63, 0.09),
  });
  y -= 15;
  page.drawText('NOTICE:', {
    x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0),
  });
  y -= 14;
  page.drawText(
    'Rates are approximate and subject to change. Verify current rates at sam.gov before use.',
    { x: 10, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 12;
  page.drawText(
    'These rates are based on publicly available Davis-Bacon wage determinations for the State of Arizona.',
    { x: 10, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 12;
  page.drawText(
    `County: ${county}. Contractors must comply with all applicable federal and state prevailing wage requirements.`,
    { x: 10, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) }
  );

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Prevailing Wage`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'prevailing_wage', pdfBytes, {
    county,
    rateCount: ARIZONA_RATES.length,
  });

  return { pdfBytes, pdfUrl };
}
