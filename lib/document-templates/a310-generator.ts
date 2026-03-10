import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { drawField, fmtCurrency, saveDocument } from '../pdf-engine';

export interface A310Input {
  projectId: string;
  principalName: string;
  principalAddress: string;
  obligeeName: string;
  obligeeAddress: string;
  projectDescription: string;
  projectAddress: string;
  bidDate: string;
  bidAmount: number;
  suretyName: string;
  suretyAddress: string;
  suretyState: string;
  bondNumber?: string;
  bondDate?: string;
}

export async function generateA310(input: A310Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const penalSum = input.bidAmount * 0.1; // 10% of bid amount

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
  page.drawText('AIA DOCUMENT A310 \u2014 BID BOND', {
    x: 10,
    y: height - 26,
    size: 13,
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

  let y = height - 65;

  // Bond number and date
  if (input.bondNumber) {
    page.drawText(`Bond No: ${input.bondNumber}`, {
      x: width - 180,
      y,
      size: 9,
      font: bold,
      color: rgb(0, 0, 0),
    });
  }
  page.drawText(`Date: ${input.bondDate || new Date().toLocaleDateString()}`, {
    x: width - 180,
    y: y - 12,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  // Principal and Obligee
  drawField(page, font, bold, 'PRINCIPAL (CONTRACTOR):', input.principalName, 10, y, 280);
  y -= 30;
  drawField(page, font, bold, 'PRINCIPAL ADDRESS:', input.principalAddress, 10, y, 330);

  y -= 30;
  drawField(page, font, bold, 'OBLIGEE (OWNER):', input.obligeeName, 10, y, 280);
  y -= 30;
  drawField(page, font, bold, 'OBLIGEE ADDRESS:', input.obligeeAddress, 10, y, 330);

  y -= 30;
  drawField(page, font, bold, 'SURETY COMPANY:', input.suretyName, 10, y, 280);
  drawField(page, font, bold, 'STATE OF INCORPORATION:', input.suretyState, 295, y, 170);
  y -= 30;
  drawField(page, font, bold, 'SURETY ADDRESS:', input.suretyAddress, 10, y, 330);

  y -= 30;
  drawField(page, font, bold, 'PROJECT DESCRIPTION:', input.projectDescription, 10, y, 330);
  drawField(page, font, bold, 'BID DATE:', input.bidDate, 345, y, 120);

  y -= 30;
  drawField(page, font, bold, 'PROJECT ADDRESS:', input.projectAddress, 10, y, 280);
  drawField(page, font, bold, 'BID AMOUNT:', fmtCurrency(input.bidAmount), 295, y, 130);
  drawField(page, font, bold, 'PENAL SUM (10%):', fmtCurrency(penalSum), 430, y, 120);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Penal sum highlight
  y -= 15;
  page.drawRectangle({
    x: 10,
    y: y - 5,
    width: width - 20,
    height: 28,
    color: rgb(0.05, 0.07, 0.09),
  });
  page.drawText('PENAL SUM OF THIS BOND:', {
    x: 20,
    y: y + 7,
    size: 11,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  page.drawText(fmtCurrency(penalSum), {
    x: 380,
    y: y + 7,
    size: 13,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  page.drawText('(10% of Bid Amount)', {
    x: 380,
    y: y - 2,
    size: 7,
    font,
    color: rgb(0.7, 0.6, 0.3),
  });

  // Bond body text
  y -= 35;
  page.drawText('KNOW ALL MEN BY THESE PRESENTS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });

  y -= 14;
  const bondText =
    `That we, the Principal and Surety are held and firmly bound unto the Obligee in the penal sum stated above ` +
    `for the payment of which we bind ourselves, our heirs, executors, administrators, successors and assigns, jointly ` +
    `and severally, firmly by these presents. The condition of this obligation is such that if the above-named Principal ` +
    `shall submit a bid for the Contract described above and, if the Principal shall be awarded such Contract, the Principal ` +
    `shall execute a Contract in accordance with the bid and upon the terms, conditions and price(s) set forth therein, ` +
    `and shall give bond for the faithful performance of such Contract and for the payment of all persons performing labor ` +
    `or furnishing materials in connection therewith, then this obligation shall be null and void; otherwise it shall remain ` +
    `in full force and virtue.`;

  const bondWords = bondText.split(' ');
  let bondLine = '';
  for (const word of bondWords) {
    if ((bondLine + ' ' + word).length > 95) {
      page.drawText(bondLine.trim(), {
        x: 10,
        y,
        size: 8.5,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      bondLine = word;
    } else {
      bondLine = bondLine + ' ' + word;
    }
  }
  if (bondLine.trim()) {
    page.drawText(bondLine.trim(), {
      x: 10,
      y,
      size: 8.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
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
  page.drawText('IN WITNESS WHEREOF, the parties have executed this instrument.', {
    x: 10,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 25;
  // Principal signature
  page.drawText('PRINCIPAL:', { x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0) });
  page.drawLine({
    start: { x: 10, y: y - 18 },
    end: { x: 260, y: y - 18 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText(input.principalName, {
    x: 10,
    y: y - 28,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText('Signature / Title / Date', {
    x: 10,
    y: y - 38,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Surety signature
  page.drawText('SURETY:', {
    x: 310,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: 310, y: y - 18 },
    end: { x: width - 10, y: y - 18 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText(input.suretyName, {
    x: 310,
    y: y - 28,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText('Attorney-in-Fact Signature / Date', {
    x: 310,
    y: y - 38,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Notary acknowledgment
  y -= 60;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 14;
  page.drawText('NOTARY ACKNOWLEDGMENT', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 12;
  page.drawText(
    'State of _____________  County of _____________  On this _____ day of ________________, 20___, before me personally appeared',
    { x: 10, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 12;
  page.drawText(
    '___________________________, known to me to be the person(s) whose name(s) is/are subscribed to the within instrument.',
    { x: 10, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 18;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 260, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText('Notary Public / Commission Expiration', {
    x: 10,
    y: y - 10,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  AIA A310 Bid Bond`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'a310-bid-bond', pdfBytes, {
    principalName: input.principalName,
    bidAmount: input.bidAmount,
    penalSum,
    bidDate: input.bidDate,
  });

  // Save to bonds table
  try {
    await import('../../supabase/admin').then(({ supabaseAdmin }) =>
      supabaseAdmin.from('bonds').insert({
        project_id: input.projectId,
        bond_type: 'bid',
        bond_number: input.bondNumber || null,
        principal_name: input.principalName,
        surety_name: input.suretyName,
        bond_amount: penalSum,
        pdf_url: pdfUrl,
      })
    );
  } catch {
    /* ignore */
  }

  return { pdfBytes, pdfUrl };
}
