import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';

export interface NTPInput {
  projectId: string;
  ntpDate?: string;
}

export async function generateNTP(input: NTPInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;

  const p = project as any;
  const ntpDate = input.ntpDate || new Date().toISOString().split('T')[0];
  const contractDate = p?.start_date || '';
  const substantialDate = p?.substantial_date || '';
  const finalDate = p?.final_completion_date || '';

  // Calculate calendar days
  let calendarDays = '';
  if (substantialDate) {
    const ntp = new Date(ntpDate);
    const sub = new Date(substantialDate);
    const diffMs = sub.getTime() - ntp.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    calendarDays = days > 0 ? String(days) : '';
  }

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
  page.drawText('NOTICE TO PROCEED', {
    x: 10,
    y: height - 26,
    size: 14,
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
  drawField(page, font, bold, 'PROJECT:', p?.name || '', 10, y, 220);
  drawField(page, font, bold, 'PROJECT NO:', p?.project_number || '', 235, y, 130);
  drawField(page, font, bold, 'CONTRACT AMOUNT:', fmtCurrency(p?.contract_amount || 0), 370, y, 170);

  y -= 30;
  drawField(page, font, bold, 'OWNER:', (ctx.owner as any)?.name || '', 10, y, 220);
  drawField(page, font, bold, 'PROJECT ADDRESS:', p?.address || '', 235, y, 305);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Date
  y -= 18;
  page.drawText(`Date: ${new Date(ntpDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
    x: 10, y, size: 9, font, color: rgb(0.2, 0.2, 0.2),
  });

  // Letter format
  y -= 25;
  const contractorName = p?.gc_entity?.name || 'Contractor';
  page.drawText(`To: ${contractorName}`, {
    x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0),
  });

  y -= 25;
  page.drawText(`Dear ${contractorName},`, {
    x: 10, y, size: 9, font, color: rgb(0.1, 0.1, 0.1),
  });

  // Body text
  y -= 20;
  const bodyParagraphs = [
    `You are hereby notified to commence work under the contract for ${p?.name || 'the Project'} ` +
    `located at ${p?.address || 'the project site'}. The Contract provides for the completion of the ` +
    `Work within the time established in the Contract Documents.`,
    '',
    `The following key dates shall govern the performance of the Work:`,
  ];

  for (const para of bodyParagraphs) {
    if (para === '') {
      y -= 8;
      continue;
    }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).length > 95) {
        page.drawText(line.trim(), {
          x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
        line = word;
      } else {
        line = line + ' ' + word;
      }
    }
    if (line.trim()) {
      page.drawText(line.trim(), {
        x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
    }
  }

  // Key dates table
  y -= 10;
  const dateRows = [
    ['Contract Date:', contractDate ? new Date(contractDate).toLocaleDateString() : '_______________'],
    ['Notice to Proceed Date:', new Date(ntpDate).toLocaleDateString()],
    ['Substantial Completion Date:', substantialDate ? new Date(substantialDate).toLocaleDateString() : '_______________'],
    ['Final Completion Date:', finalDate ? new Date(finalDate).toLocaleDateString() : '_______________'],
    ['Calendar Days:', calendarDays || '_______________'],
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

  // Closing text
  y -= 25;
  const closingText =
    'Please acknowledge receipt of this Notice to Proceed by signing below and returning a copy ' +
    'to the Owner. Failure to commence work within the specified time may result in termination of ' +
    'the Contract in accordance with the Contract Documents.';
  const closingWords = closingText.split(' ');
  let closingLine = '';
  for (const word of closingWords) {
    if ((closingLine + ' ' + word).length > 95) {
      page.drawText(closingLine.trim(), {
        x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      closingLine = word;
    } else {
      closingLine = closingLine + ' ' + word;
    }
  }
  if (closingLine.trim()) {
    page.drawText(closingLine.trim(), {
      x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

  // Owner signature block
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;
  page.drawText('OWNER:', {
    x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0),
  });
  y -= 5;
  page.drawText((ctx.owner as any)?.name || '', {
    x: 10, y: y - 10, size: 9, font, color: rgb(0.1, 0.1, 0.1),
  });
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 300, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 10;
  page.drawText('Signature / Date', {
    x: 10, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });
  y -= 15;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 300, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 10;
  page.drawText('Printed Name / Title', {
    x: 10, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });

  // Contractor acknowledgment
  y -= 25;
  page.drawText('CONTRACTOR ACKNOWLEDGMENT:', {
    x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0),
  });
  y -= 18;
  page.drawText('Receipt of the above Notice to Proceed is hereby acknowledged.', {
    x: 10, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
  });
  y -= 20;
  page.drawText(contractorName, {
    x: 10, y, size: 9, font, color: rgb(0.1, 0.1, 0.1),
  });
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 300, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 10;
  page.drawText('Contractor Signature / Date', {
    x: 10, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Notice to Proceed`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'notice_to_proceed', pdfBytes, {
    ntpDate,
    calendarDays,
  });

  return { pdfBytes, pdfUrl };
}
