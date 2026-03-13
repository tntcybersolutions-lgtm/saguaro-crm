import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';

export interface SubstantialCompletionInput {
  projectId: string;
  completionDate: string;
}

export async function generateSubstantialCompletionCert(input: SubstantialCompletionInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

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
  page.drawText('CERTIFICATE OF SUBSTANTIAL COMPLETION', {
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
  drawField(page, font, bold, 'PROJECT:', p?.name || '', 10, y, 200);
  drawField(page, font, bold, 'PROJECT NO:', p?.project_number || '', 215, y, 130);
  drawField(page, font, bold, 'CONTRACT DATE:', p?.start_date || '', 350, y, 130);

  y -= 30;
  drawField(page, font, bold, 'OWNER:', (ctx.owner as any)?.name || '', 10, y, 200);
  drawField(page, font, bold, 'ARCHITECT:', (ctx.architect as any)?.name || '', 215, y, 165);
  drawField(page, font, bold, 'CONTRACTOR:', p?.gc_entity?.name || '', 385, y, 165);

  y -= 30;
  drawField(page, font, bold, 'PROJECT ADDRESS:', p?.address || '', 10, y, 330);
  drawField(page, font, bold, 'CONTRACT AMOUNT:', fmtCurrency(p?.contract_amount || 0), 345, y, 200);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Certificate body
  y -= 18;
  page.drawText('CERTIFICATE OF SUBSTANTIAL COMPLETION', {
    x: 10, y, size: 11, font: bold, color: rgb(0, 0, 0),
  });

  y -= 18;
  const certText =
    'The Work performed under this Contract has been reviewed and found to be substantially complete. ' +
    'Substantial Completion is the stage in the progress of the Work when the Work or designated portion thereof ' +
    'is sufficiently complete in accordance with the Contract Documents so that the Owner can occupy or utilize ' +
    'the Work for its intended use.';

  const certWords = certText.split(' ');
  let certLine = '';
  for (const word of certWords) {
    if ((certLine + ' ' + word).length > 95) {
      page.drawText(certLine.trim(), {
        x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      certLine = word;
    } else {
      certLine = certLine + ' ' + word;
    }
  }
  if (certLine.trim()) {
    page.drawText(certLine.trim(), {
      x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

  // Key dates
  y -= 15;
  page.drawText('COMPLETION DATES', {
    x: 10, y, size: 10, font: bold, color: rgb(0, 0, 0),
  });
  y -= 5;

  const completionDateFormatted = new Date(input.completionDate).toLocaleDateString();
  const dateRows = [
    ['Date of Issuance:', new Date().toLocaleDateString()],
    ['Date of Substantial Completion:', completionDateFormatted],
    ['Warranty Start Date:', completionDateFormatted],
    ['Original Contract Completion Date:', p?.substantial_date ? new Date(p.substantial_date).toLocaleDateString() : ''],
  ];

  dateRows.forEach(([label, value], i) => {
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 18,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    page.drawText(label, {
      x: 15, y: y + 2, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(value, {
      x: 280, y: y + 2, size: 9, font, color: rgb(0, 0, 0),
    });
  });

  // Punch list section
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.83, 0.63, 0.09),
  });
  y -= 15;
  page.drawText('ITEMS TO COMPLETE OR CORRECT (PUNCH LIST)', {
    x: 10, y, size: 10, font: bold, color: rgb(0, 0, 0),
  });

  y -= 14;
  page.drawText('See attached punch list for items remaining to be completed or corrected.', {
    x: 15, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
  });

  // Responsibilities section
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.83, 0.63, 0.09),
  });
  y -= 15;
  page.drawText('DIVISION OF RESPONSIBILITIES', {
    x: 10, y, size: 10, font: bold, color: rgb(0, 0, 0),
  });

  y -= 14;
  const respText =
    `As of the date of Substantial Completion (${completionDateFormatted}), the Owner assumes responsibility ` +
    'for maintenance of the Work, including insurance, security, and utilities, unless otherwise provided in ' +
    'the Contract Documents. The Contractor shall complete or correct the items on the attached punch list ' +
    'within the time established by the Contract Documents.';

  const respWords = respText.split(' ');
  let respLine = '';
  for (const word of respWords) {
    if ((respLine + ' ' + word).length > 95) {
      page.drawText(respLine.trim(), {
        x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      respLine = word;
    } else {
      respLine = respLine + ' ' + word;
    }
  }
  if (respLine.trim()) {
    page.drawText(respLine.trim(), {
      x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

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
    { label: 'ARCHITECT/ENGINEER:', x: 10 },
    { label: 'CONTRACTOR:', x: 210 },
    { label: 'OWNER:', x: 410 },
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
    page.drawLine({
      start: { x: col.x, y: y - 45 },
      end: { x: col.x + 180, y: y - 45 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    page.drawText('Printed Name / Title', {
      x: col.x, y: y - 55, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });
  });

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Substantial Completion`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'substantial_completion', pdfBytes, {
    completionDate: input.completionDate,
  });

  return { pdfBytes, pdfUrl };
}
