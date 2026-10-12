import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';

export interface G707Input {
  projectId: string;
  suretyName?: string;
  suretyAddress?: string;
  bondNumber?: string;
}

export async function generateG707(input: G707Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead \u2014 tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, {
    title: 'AIA G707 \u2014 CONSENT OF SURETY TO FINAL PAYMENT',
    docTag: input.bondNumber ? `BOND ${input.bondNumber}` : undefined,
  });

  // Project info
  let y = height - 65;
  drawField(page, font, bold, 'PROJECT:', (project as any)?.name || '', 10, y, 220);
  drawField(page, font, bold, 'PROJECT NO:', (project as any)?.project_number || '', 235, y, 130);
  drawField(page, font, bold, 'CONTRACT DATE:', (project as any)?.start_date || '', 370, y, 170);

  y -= 30;
  drawField(page, font, bold, 'OWNER:', (ctx.owner as any)?.name || '', 10, y, 220);
  drawField(page, font, bold, 'CONTRACTOR:', (project as any)?.gc_entity?.name || '', 235, y, 165);
  drawField(page, font, bold, 'CONTRACT AMOUNT:', fmtCurrency((project as any)?.contract_amount || 0), 405, y, 135);

  y -= 30;
  drawField(page, font, bold, 'SURETY:', input.suretyName || '', 10, y, 220);
  drawField(page, font, bold, 'SURETY ADDRESS:', input.suretyAddress || '', 235, y, 200);
  drawField(page, font, bold, 'BOND NO:', input.bondNumber || '', 440, y, 100);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: DOC.accent,
  });

  // Body heading
  y -= 18;
  page.drawText('CONSENT OF SURETY', {
    x: 10, y, size: 11, font: bold, color: DOC.ink,
  });

  // Body text
  y -= 18;
  const bodyParagraphs = [
    `In accordance with the provisions of the Contract between the Owner and the Contractor as indicated above, ` +
    `the Surety on Bond No. ${input.bondNumber || '_______________'} hereby approves of the final payment to the Contractor, ` +
    `and agrees that final payment to the Contractor shall not relieve the Surety of any of its obligations to ` +
    `the Owner, as set forth in the said Surety's Bond.`,
    '',
    `The Surety hereby acknowledges that the Work performed under the above-referenced Contract has been found ` +
    `to be substantially complete. The Surety consents to the Owner making final payment to the Contractor in ` +
    `accordance with the terms and conditions of the Contract Documents.`,
    '',
    `This Consent of Surety does not waive any rights the Surety may have under the terms of the Bond, and the ` +
    `Surety reserves all rights and defenses available under the Bond and applicable law.`,
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
          x: 10, y, size: 8.5, font, color: DOC.text,
        });
        y -= 12;
        line = word;
      } else {
        line = line + ' ' + word;
      }
    }
    if (line.trim()) {
      page.drawText(line.trim(), {
        x: 10, y, size: 8.5, font, color: DOC.text,
      });
      y -= 12;
    }
  }

  // Surety signature block
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.rule,
  });
  y -= 15;
  page.drawText('SURETY COMPANY', {
    x: 10, y, size: 9, font: bold, color: DOC.ink,
  });
  y -= 20;
  page.drawText(input.suretyName || '___________________________', {
    x: 10, y, size: 9, font, color: DOC.ink,
  });

  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 300, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  y -= 10;
  page.drawText('By: Attorney-in-Fact (Signature)', {
    x: 10, y, size: 8, font, color: DOC.faint,
  });

  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 300, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  y -= 10;
  page.drawText('Printed Name / Title', {
    x: 10, y, size: 8, font, color: DOC.faint,
  });

  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 200, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  y -= 10;
  page.drawText('Date', {
    x: 10, y, size: 8, font, color: DOC.faint,
  });

  // Notary acknowledgment
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.rule,
  });
  y -= 15;
  page.drawText('NOTARY ACKNOWLEDGMENT', {
    x: 10, y, size: 9, font: bold, color: DOC.ink,
  });

  y -= 18;
  page.drawText('STATE OF ________________     COUNTY OF ________________', {
    x: 10, y, size: 8.5, font, color: DOC.text,
  });

  y -= 18;
  page.drawText('Subscribed and sworn to before me this _____ day of ________________, 20___.', {
    x: 10, y, size: 8.5, font, color: DOC.text,
  });

  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 260, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  page.drawLine({
    start: { x: 310, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  y -= 10;
  page.drawText('Notary Public', {
    x: 10, y, size: 8, font, color: DOC.faint,
  });
  page.drawText('Commission Expiration', {
    x: 310, y, size: 8, font, color: DOC.faint,
  });

  // Corporate footer: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, 'AIA G707 Consent of Surety');

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'g707', pdfBytes, {
    suretyName: input.suretyName || '',
    bondNumber: input.bondNumber || '',
  });

  return { pdfBytes, pdfUrl };
}
