import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { supabaseAdmin } from '../../supabase/admin';

export interface G706Input {
  projectId: string;
  contractorName: string;
  contractorAddress: string;
  contractDate: string;
  finalPaymentAmount: number;
  certificationDate?: string;
}

export async function generateG706(input: G706Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
  error?: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project, subs, lienWaivers } = ctx;

  // Validate all subs have unconditional_final lien waivers
  const missingWaivers: string[] = [];
  for (const sub of subs) {
    const hasUnconditionalFinal = lienWaivers.some(
      (w: any) =>
        w.claimant === sub.name && w.waiver_type === 'unconditional_final'
    );
    if (!hasUnconditionalFinal) {
      missingWaivers.push(sub.name);
    }
  }

  if (missingWaivers.length > 0) {
    return {
      pdfBytes: new Uint8Array(),
      pdfUrl: '',
      error: `Missing unconditional final lien waivers for: ${missingWaivers.join(', ')}`,
    };
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
  page.drawText(
    "AIA DOCUMENT G706 \u2014 CONTRACTOR'S AFFIDAVIT OF PAYMENT OF DEBTS AND CLAIMS",
    {
      x: 10,
      y: height - 26,
      size: 10,
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

  // Project info
  let y = height - 65;
  drawField(
    page,
    font,
    bold,
    'PROJECT:',
    (project as any)?.name || 'Project Name',
    10,
    y,
    220
  );
  drawField(
    page,
    font,
    bold,
    'PROJECT NO:',
    (project as any)?.project_number || '',
    235,
    y,
    130
  );
  drawField(
    page,
    font,
    bold,
    'CONTRACT DATE:',
    input.contractDate,
    370,
    y,
    170
  );

  y -= 30;
  drawField(
    page,
    font,
    bold,
    'OWNER:',
    (ctx.owner as any)?.name || '',
    10,
    y,
    220
  );
  drawField(
    page,
    font,
    bold,
    'ARCHITECT:',
    (ctx.architect as any)?.name || '',
    235,
    y,
    165
  );
  drawField(
    page,
    font,
    bold,
    'FINAL PAYMENT AMOUNT:',
    fmtCurrency(input.finalPaymentAmount),
    405,
    y,
    135
  );

  y -= 30;
  drawField(
    page,
    font,
    bold,
    'CONTRACTOR:',
    input.contractorName,
    10,
    y,
    270
  );
  drawField(
    page,
    font,
    bold,
    'CONTRACTOR ADDRESS:',
    input.contractorAddress,
    285,
    y,
    255
  );

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Affidavit text
  y -= 18;
  page.drawText("CONTRACTOR'S AFFIDAVIT", {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: rgb(0, 0, 0),
  });

  y -= 14;
  const affidavitText =
    `STATE OF ________________     COUNTY OF ________________\n\n` +
    `The undersigned hereby certifies that, to the best of the affiant's knowledge, information and belief, ` +
    `except as listed below, Releases or Waivers of Lien have been received from all laborers, persons, firms, ` +
    `and corporations furnishing labor, materials, equipment, or services for the Work, including ` +
    `transportation and insurance, and that all payrolls, material bills and other indebtedness connected with ` +
    `the Work for which the Owner or the Owner's property might in any way be responsible have been paid or ` +
    `otherwise satisfied.`;

  const affWords = affidavitText.split(' ');
  let affLine = '';
  for (const word of affWords) {
    if (word === '\n\n') {
      if (affLine.trim()) {
        page.drawText(affLine.trim(), {
          x: 10,
          y,
          size: 8.5,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
      }
      y -= 8;
      affLine = '';
      continue;
    }
    if ((affLine + ' ' + word).length > 95) {
      page.drawText(affLine.trim(), {
        x: 10,
        y,
        size: 8.5,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      affLine = word;
    } else {
      affLine = affLine + ' ' + word;
    }
  }
  if (affLine.trim()) {
    page.drawText(affLine.trim(), {
      x: 10,
      y,
      size: 8.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

  // Exceptions box
  y -= 15;
  page.drawText('EXCEPTIONS (attach supporting documentation if needed):', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 5;
  page.drawRectangle({
    x: 10,
    y: y - 50,
    width: width - 20,
    height: 50,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 0.5,
    color: rgb(0.98, 0.98, 0.98),
  });
  y -= 60;

  // Sub listing with waiver status
  y -= 10;
  page.drawText('SUBCONTRACTORS / SUPPLIERS — LIEN WAIVER STATUS:', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 5;
  page.drawRectangle({
    x: 10,
    y: y - 14,
    width: width - 20,
    height: 14,
    color: rgb(0.15, 0.2, 0.25),
  });
  page.drawText('SUBCONTRACTOR / SUPPLIER NAME', {
    x: 15,
    y: y - 10,
    size: 7.5,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText('TRADE', {
    x: 270,
    y: y - 10,
    size: 7.5,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText('CONTRACT AMOUNT', {
    x: 360,
    y: y - 10,
    size: 7.5,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText('FINAL WAIVER', {
    x: 480,
    y: y - 10,
    size: 7.5,
    font: bold,
    color: rgb(1, 1, 1),
  });

  const maxSubRows = Math.min(subs.length, 10);
  for (let i = 0; i < maxSubRows; i++) {
    const sub = subs[i] as any;
    y -= 14;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 14,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    const hasWaiver = lienWaivers.some(
      (w: any) =>
        w.claimant === sub.name && w.waiver_type === 'unconditional_final'
    );
    page.drawText(sub.name.slice(0, 36), {
      x: 15,
      y: y + 1,
      size: 8,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(sub.trade || '', {
      x: 270,
      y: y + 1,
      size: 8,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(fmtCurrency(sub.contract_amount || 0), {
      x: 360,
      y: y + 1,
      size: 8,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(hasWaiver ? 'RECEIVED' : 'PENDING', {
      x: 480,
      y: y + 1,
      size: 8,
      font: bold,
      color: hasWaiver ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.3, 0.1),
    });
  }

  if (subs.length > 10) {
    y -= 14;
    page.drawText(`... and ${subs.length - 10} more. See attached schedule.`, {
      x: 15,
      y,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Notary block
  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;
  page.drawText('CONTRACTOR CERTIFICATION AND NOTARY ACKNOWLEDGMENT', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });

  y -= 18;
  page.drawText('Subscribed and sworn to before me this _____ day of ________________, 20___.', {
    x: 10,
    y,
    size: 8.5,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 260, y },
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
  page.drawText('Notary Public / Commission Expiration', {
    x: 310,
    y,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  AIA G706`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'g706', pdfBytes, {
    contractorName: input.contractorName,
    finalPaymentAmount: input.finalPaymentAmount,
    certificationDate: input.certificationDate || new Date().toISOString(),
  });

  return { pdfBytes, pdfUrl };
}
