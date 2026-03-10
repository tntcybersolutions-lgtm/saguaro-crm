import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { supabaseAdmin } from '../../supabase/admin';

export interface G702Input {
  projectId: string;
  periodFrom: string;
  periodTo: string;
  lineItems?: Array<{
    description: string;
    scheduledValue: number;
    thisPeriod: number;
    prevCompleted: number;
  }>;
  storedMaterials?: number;
}

export async function generateG702(input: G702Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
  appNumber: number;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project, lastAppNumber, contractSumToDate } = ctx;

  const appNumber = lastAppNumber + 1;
  const totalScheduled =
    input.lineItems?.reduce((s, l) => s + l.scheduledValue, 0) || 0;
  const thisPeriod =
    input.lineItems?.reduce((s, l) => s + l.thisPeriod, 0) || 0;
  const prevCompleted =
    input.lineItems?.reduce((s, l) => s + l.prevCompleted, 0) || 0;
  const storedMaterials = input.storedMaterials || 0;
  const totalCompletedStored = prevCompleted + thisPeriod + storedMaterials;
  const retainagePct = (project as any)?.retainage_pct || 10;
  const retainageHeld = totalCompletedStored * (retainagePct / 100);
  const totalEarnedLessRetainage = totalCompletedStored - retainageHeld;
  const prevCertified = prevCompleted * (1 - retainagePct / 100);
  const currentPaymentDue = totalEarnedLessRetainage - prevCertified;

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
  page.drawText(
    'AIA DOCUMENT G702 \u2014 APPLICATION AND CERTIFICATE FOR PAYMENT',
    {
      x: 10,
      y: height - 26,
      size: 11,
      font: bold,
      color: rgb(0.05, 0.07, 0.09),
    }
  );
  page.drawText('SAGUARO CONSTRUCTION INTELLIGENCE PLATFORM', {
    x: 10,
    y: height - 36,
    size: 7,
    font,
    color: rgb(0.2, 0.1, 0),
  });

  // Application info header row
  let y = height - 60;
  page.drawText(`Application No: ${appNumber}`, {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  page.drawText(`Period From: ${input.periodFrom}`, {
    x: 200,
    y,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(`Period To: ${input.periodTo}`, {
    x: 380,
    y,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  y -= 25;
  drawField(
    page,
    font,
    bold,
    'PROJECT:',
    (project as any)?.name || 'Project Name',
    10,
    y,
    200
  );
  drawField(
    page,
    font,
    bold,
    'OWNER:',
    (ctx.owner as any)?.name || '',
    215,
    y,
    170
  );
  drawField(
    page,
    font,
    bold,
    'ARCHITECT:',
    (ctx.architect as any)?.name || '',
    390,
    y,
    170
  );

  y -= 30;
  drawField(
    page,
    font,
    bold,
    'CONTRACT DATE:',
    (project as any)?.start_date || '',
    10,
    y,
    140
  );
  drawField(
    page,
    font,
    bold,
    'PROJECT NO:',
    (project as any)?.project_number || '',
    155,
    y,
    120
  );
  drawField(
    page,
    font,
    bold,
    'CONTRACT FOR:',
    'General Construction',
    280,
    y,
    170
  );

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Financial summary section
  y -= 20;
  page.drawText("CONTRACTOR'S APPLICATION FOR PAYMENT", {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });

  const rows: [string, string][] = [
    ['1. ORIGINAL CONTRACT SUM', fmtCurrency((project as any)?.contract_amount || 0)],
    [
      '2. NET CHANGE BY CHANGE ORDERS',
      fmtCurrency(contractSumToDate - ((project as any)?.contract_amount || 0)),
    ],
    ['3. CONTRACT SUM TO DATE (Line 1+2)', fmtCurrency(contractSumToDate)],
    ['4. TOTAL COMPLETED & STORED TO DATE', fmtCurrency(totalCompletedStored)],
    [
      `   (${(
        (totalCompletedStored / (contractSumToDate || 1)) *
        100
      ).toFixed(1)}% of Contract Sum)`,
      '',
    ],
    [`5. RETAINAGE: ${retainagePct}%`, fmtCurrency(retainageHeld)],
    [
      '6. TOTAL EARNED LESS RETAINAGE (Line 4-5)',
      fmtCurrency(totalEarnedLessRetainage),
    ],
    ['7. LESS PREVIOUS CERTIFICATES', fmtCurrency(prevCertified)],
  ];

  rows.forEach(([label, val], i) => {
    y -= 18;
    page.drawText(label, {
      x: 20,
      y,
      size: 9,
      font:
        i === 0 || i === 2 || i === 5 || i === 6 ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    if (val) {
      page.drawText(val, {
        x: 430,
        y,
        size: 9,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  });

  // Current Payment Due - highlighted
  y -= 28;
  page.drawRectangle({
    x: 10,
    y: y - 5,
    width: width - 20,
    height: 28,
    color: rgb(0.05, 0.07, 0.09),
  });
  page.drawText('8. CURRENT PAYMENT DUE', {
    x: 20,
    y: y + 7,
    size: 12,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  page.drawText(fmtCurrency(currentPaymentDue), {
    x: 400,
    y: y + 7,
    size: 14,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });

  y -= 20;
  page.drawText('9. BALANCE TO FINISH (Line 3-Line 6)', {
    x: 20,
    y,
    size: 9,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(fmtCurrency(contractSumToDate - totalEarnedLessRetainage), {
    x: 430,
    y,
    size: 9,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Signature blocks
  y -= 40;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;
  page.drawText("CONTRACTOR'S CERTIFICATION:", {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 12;
  page.drawText(
    "The undersigned Contractor certifies that to the best of the Contractor's knowledge, information and belief the Work covered",
    { x: 10, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 10;
  page.drawText(
    'by this Application for Payment has been completed in accordance with the Contract Documents.',
    { x: 10, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );

  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 250, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: 310, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 10;
  page.drawText('Contractor Signature / Date', {
    x: 10,
    y,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText("Architect's Certificate for Payment", {
    x: 310,
    y,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Page number and timestamp footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Application #${appNumber}`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();

  // Save to DB
  const pdfUrl = await saveDocument(input.projectId, 'g702', pdfBytes, {
    appNumber,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    currentPaymentDue,
  });

  // Insert pay_application record
  try {
    await supabaseAdmin.from('pay_applications').insert({
      project_id: input.projectId,
      app_number: appNumber,
      period_to: input.periodTo,
      scheduled_value: totalScheduled,
      prev_completed: prevCompleted,
      this_period: thisPeriod,
      stored_materials: storedMaterials,
      retainage_held: retainageHeld,
      net_payment_due: currentPaymentDue,
      status: 'draft',
      g702_pdf_url: pdfUrl,
    });
  } catch {
    /* DB may not have table yet */
  }

  return { pdfBytes, pdfUrl, appNumber };
}
