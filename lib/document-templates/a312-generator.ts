import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { getProjectContext, drawField, fmtCurrency, saveDocument } from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';

export interface A312Input {
  projectId: string;
  principalName: string;
  principalAddress: string;
  obligeeName: string;
  obligeeAddress: string;
  contractAmount: number;
  contractDate: string;
  projectDescription: string;
  projectAddress: string;
  suretyName: string;
  suretyAddress: string;
  suretyState: string;
  bondNumber: string;
  bondDate?: string;
}

export async function generateA312(input: A312Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const bondAmount = input.contractAmount; // 100% of contract amount

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ─── PAGE 1: PERFORMANCE BOND ────────────────────────────────────────────
  const page1 = pdf.addPage(PageSizes.Letter);
  const { width, height } = page1.getSize();

  // Corporate letterhead \u2014 tenant logo + accent color (report-theme)
  drawBrandHeader(page1, kit, {
    title: 'AIA A312 \u2014 PERFORMANCE BOND',
    docTag: `BOND ${input.bondNumber}`,
  });

  let y = height - 65;

  // Principal, Obligee, Surety fields
  drawField(page1, font, bold, 'PRINCIPAL (CONTRACTOR):', input.principalName, 10, y, 280);
  drawField(page1, font, bold, 'BOND DATE:', input.bondDate || new Date().toLocaleDateString(), 295, y, 150);
  y -= 30;
  drawField(page1, font, bold, 'PRINCIPAL ADDRESS:', input.principalAddress, 10, y, 330);

  y -= 30;
  drawField(page1, font, bold, 'OBLIGEE (OWNER):', input.obligeeName, 10, y, 280);
  y -= 30;
  drawField(page1, font, bold, 'OBLIGEE ADDRESS:', input.obligeeAddress, 10, y, 330);

  y -= 30;
  drawField(page1, font, bold, 'SURETY COMPANY:', input.suretyName, 10, y, 280);
  drawField(page1, font, bold, 'STATE OF INCORPORATION:', input.suretyState, 295, y, 170);
  y -= 30;
  drawField(page1, font, bold, 'SURETY ADDRESS:', input.suretyAddress, 10, y, 330);

  y -= 30;
  drawField(page1, font, bold, 'PROJECT / CONTRACT DESCRIPTION:', input.projectDescription, 10, y, 350);
  drawField(page1, font, bold, 'CONTRACT DATE:', input.contractDate, 365, y, 135);

  y -= 30;
  drawField(page1, font, bold, 'PROJECT ADDRESS:', input.projectAddress, 10, y, 280);

  // Bond amount highlight
  y -= 25;
  page1.drawRectangle({
    x: 10,
    y: y - 5,
    width: width - 20,
    height: 28,
    color: DOC.ink,
  });
  page1.drawText('PERFORMANCE BOND AMOUNT (100% of Contract):', {
    x: 20,
    y: y + 7,
    size: 10,
    font: bold,
    color: DOC.accentOnBand,
  });
  page1.drawText(fmtCurrency(bondAmount), {
    x: 400,
    y: y + 7,
    size: 13,
    font: bold,
    color: DOC.accentOnBand,
  });

  // Separator
  y -= 30;
  page1.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: DOC.accentOnBand,
  });

  // Performance bond body
  y -= 14;
  page1.drawText('PERFORMANCE BOND — TERMS AND CONDITIONS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: DOC.ink,
  });

  y -= 12;
  const perfText =
    `The Principal and the Surety, jointly and severally, bind themselves, their heirs, executors, administrators, ` +
    `successors and assigns to the Obligee for the performance of the Construction Contract, which is incorporated herein ` +
    `by reference. If the Principal performs the Construction Contract, the Surety and the Principal shall have no ` +
    `obligation under this Bond, except when applicable to participate in a conference as provided in Section 3. If there ` +
    `is no Owner Default under the Construction Contract, the Surety's obligation under this Bond shall arise after: ` +
    `(1) The Obligee first provides notice to the Principal and the Surety that the Obligee is considering declaring a ` +
    `Principal Default; (2) The Obligee has declared a Principal Default and formally terminated the Principal's right ` +
    `to complete the contract. The Obligee has agreed to pay the Balance of the Contract Price in accordance with the ` +
    `terms of the Construction Contract to the Surety or to a contractor selected to perform the Construction Contract; ` +
    `and (3) The Obligee has agreed to discharge the Surety from its obligations under this Bond if the Principal ` +
    `completes the Construction Contract and pays all amounts due under the Contract.`;

  const perfWords = perfText.split(' ');
  let perfLine = '';
  for (const word of perfWords) {
    if ((perfLine + ' ' + word).length > 95) {
      page1.drawText(perfLine.trim(), {
        x: 10,
        y,
        size: 8,
        font,
        color: DOC.text,
      });
      y -= 11;
      perfLine = word;
    } else {
      perfLine = perfLine + ' ' + word;
    }
  }
  if (perfLine.trim()) {
    page1.drawText(perfLine.trim(), {
      x: 10,
      y,
      size: 8,
      font,
      color: DOC.text,
    });
    y -= 11;
  }

  // Performance bond signature blocks
  y -= 20;
  page1.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.rule,
  });
  y -= 15;
  page1.drawText(
    'IN WITNESS WHEREOF, the parties have hereunto set their hands and seals on the date set forth below.',
    { x: 10, y, size: 8.5, font, color: DOC.text }
  );

  y -= 25;
  page1.drawText('PRINCIPAL:', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page1.drawLine({
    start: { x: 10, y: y - 18 },
    end: { x: 260, y: y - 18 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page1.drawText('Signature / Title / Date', {
    x: 10,
    y: y - 28,
    size: 7,
    font,
    color: DOC.faint,
  });
  page1.drawText(input.principalName, {
    x: 10,
    y: y - 38,
    size: 8,
    font,
    color: DOC.muted,
  });

  page1.drawText('SURETY:', {
    x: 310,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page1.drawLine({
    start: { x: 310, y: y - 18 },
    end: { x: width - 10, y: y - 18 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page1.drawText('Attorney-in-Fact / Date', {
    x: 310,
    y: y - 28,
    size: 7,
    font,
    color: DOC.faint,
  });
  page1.drawText(input.suretyName, {
    x: 310,
    y: y - 38,
    size: 8,
    font,
    color: DOC.muted,
  });

  // ─── PAGE 2: PAYMENT BOND ─────────────────────────────────────────────────
  const page2 = pdf.addPage(PageSizes.Letter);

  // Corporate letterhead \u2014 tenant logo + accent color (report-theme)
  drawBrandHeader(page2, kit, {
    title: 'AIA A312 \u2014 PAYMENT BOND',
    docTag: `BOND ${input.bondNumber}`,
  });

  let y2 = height - 65;

  // Same party fields for page 2
  drawField(page2, font, bold, 'PRINCIPAL (CONTRACTOR):', input.principalName, 10, y2, 280);
  drawField(page2, font, bold, 'BOND DATE:', input.bondDate || new Date().toLocaleDateString(), 295, y2, 150);
  y2 -= 30;
  drawField(page2, font, bold, 'PRINCIPAL ADDRESS:', input.principalAddress, 10, y2, 330);
  y2 -= 30;
  drawField(page2, font, bold, 'OBLIGEE (OWNER):', input.obligeeName, 10, y2, 280);
  y2 -= 30;
  drawField(page2, font, bold, 'OBLIGEE ADDRESS:', input.obligeeAddress, 10, y2, 330);
  y2 -= 30;
  drawField(page2, font, bold, 'SURETY COMPANY:', input.suretyName, 10, y2, 280);
  drawField(page2, font, bold, 'STATE OF INCORPORATION:', input.suretyState, 295, y2, 170);
  y2 -= 30;
  drawField(page2, font, bold, 'PROJECT / CONTRACT DESCRIPTION:', input.projectDescription, 10, y2, 350);
  drawField(page2, font, bold, 'CONTRACT DATE:', input.contractDate, 365, y2, 135);

  // Payment bond amount highlight
  y2 -= 25;
  page2.drawRectangle({
    x: 10,
    y: y2 - 5,
    width: width - 20,
    height: 28,
    color: DOC.ink,
  });
  page2.drawText('PAYMENT BOND AMOUNT (100% of Contract):', {
    x: 20,
    y: y2 + 7,
    size: 10,
    font: bold,
    color: DOC.accentOnBand,
  });
  page2.drawText(fmtCurrency(bondAmount), {
    x: 400,
    y: y2 + 7,
    size: 13,
    font: bold,
    color: DOC.accentOnBand,
  });

  y2 -= 30;
  page2.drawLine({
    start: { x: 10, y: y2 },
    end: { x: width - 10, y: y2 },
    thickness: 1,
    color: DOC.accentOnBand,
  });

  y2 -= 14;
  page2.drawText('PAYMENT BOND \u2014 TERMS AND CONDITIONS', {
    x: 10,
    y: y2,
    size: 10,
    font: bold,
    color: DOC.ink,
  });

  y2 -= 12;
  const payText =
    `The Principal and the Surety, jointly and severally, bind themselves, their heirs, executors, administrators, ` +
    `successors and assigns to the Obligee to pay for labor, materials and equipment furnished for use in the performance ` +
    `of the Construction Contract, which is incorporated herein by reference, subject to the following terms. ` +
    `If the Principal promptly makes payment of all sums due to Claimants, and defends, indemnifies and holds harmless ` +
    `the Obligee from claims, demands, liens or suits by any person or entity seeking payment for labor, materials or ` +
    `equipment furnished for use in the performance of the Construction Contract, then the Surety and the Principal ` +
    `shall have no obligation under this Bond. ` +
    `A Claimant has "substantially performed" if: (1) the Claimant has furnished labor, materials or equipment worth ` +
    `at least fifty percent (50%) of the amount of the Claimant's contract; and (2) the Claimant is continuing to ` +
    `provide such performance. Claimants who have directly contracted with the Principal shall give notice of non-payment ` +
    `within 90 days after first furnishing labor, materials or equipment; other Claimants shall give notice within ` +
    `30 days after last furnishing labor, materials or equipment.`;

  const payWords = payText.split(' ');
  let payLine = '';
  for (const word of payWords) {
    if ((payLine + ' ' + word).length > 95) {
      page2.drawText(payLine.trim(), {
        x: 10,
        y: y2,
        size: 8,
        font,
        color: DOC.text,
      });
      y2 -= 11;
      payLine = word;
    } else {
      payLine = payLine + ' ' + word;
    }
  }
  if (payLine.trim()) {
    page2.drawText(payLine.trim(), {
      x: 10,
      y: y2,
      size: 8,
      font,
      color: DOC.text,
    });
    y2 -= 11;
  }

  // Payment bond signature blocks
  y2 -= 20;
  page2.drawLine({
    start: { x: 10, y: y2 },
    end: { x: width - 10, y: y2 },
    thickness: 0.5,
    color: DOC.rule,
  });
  y2 -= 15;
  page2.drawText(
    'IN WITNESS WHEREOF, the parties have hereunto set their hands and seals on the date set forth below.',
    { x: 10, y: y2, size: 8.5, font, color: DOC.text }
  );

  y2 -= 25;
  page2.drawText('PRINCIPAL:', {
    x: 10,
    y: y2,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page2.drawLine({
    start: { x: 10, y: y2 - 18 },
    end: { x: 260, y: y2 - 18 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page2.drawText('Signature / Title / Date', {
    x: 10,
    y: y2 - 28,
    size: 7,
    font,
    color: DOC.faint,
  });
  page2.drawText(input.principalName, {
    x: 10,
    y: y2 - 38,
    size: 8,
    font,
    color: DOC.muted,
  });

  page2.drawText('SURETY:', {
    x: 310,
    y: y2,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page2.drawLine({
    start: { x: 310, y: y2 - 18 },
    end: { x: width - 10, y: y2 - 18 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page2.drawText('Attorney-in-Fact / Date', {
    x: 310,
    y: y2 - 28,
    size: 7,
    font,
    color: DOC.faint,
  });
  page2.drawText(input.suretyName, {
    x: 310,
    y: y2 - 38,
    size: 8,
    font,
    color: DOC.muted,
  });

  // Corporate footer on every page: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, `AIA A312 Bond ${input.bondNumber}`);

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(
    input.projectId,
    'a312-performance-payment-bond',
    pdfBytes,
    {
      principalName: input.principalName,
      contractAmount: input.contractAmount,
      bondAmount,
      bondNumber: input.bondNumber,
    }
  );

  // Save to bonds table
  try {
    await import('../../supabase/admin').then(({ supabaseAdmin }) =>
      supabaseAdmin.from('bonds').insert([
        {
          project_id: input.projectId,
          bond_type: 'performance',
          bond_number: input.bondNumber,
          principal_name: input.principalName,
          surety_name: input.suretyName,
          bond_amount: bondAmount,
          pdf_url: pdfUrl,
        },
        {
          project_id: input.projectId,
          bond_type: 'payment',
          bond_number: input.bondNumber,
          principal_name: input.principalName,
          surety_name: input.suretyName,
          bond_amount: bondAmount,
          pdf_url: pdfUrl,
        },
      ])
    );
  } catch {
    /* ignore */
  }

  return { pdfBytes, pdfUrl };
}
