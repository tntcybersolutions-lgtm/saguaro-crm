import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';

export interface A101Input {
  projectId: string;
}

export async function generateA101(input: A101Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // --- Helper to wrap text ---
  function wrapText(page: any, text: string, x: number, startY: number, maxChars: number = 95): number {
    let y = startY;
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).length > maxChars) {
        page.drawText(line.trim(), { x, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) });
        y -= 12;
        line = word;
      } else {
        line = line + ' ' + word;
      }
    }
    if (line.trim()) {
      page.drawText(line.trim(), { x, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 12;
    }
    return y;
  }

  // === PAGE 1 ===
  const page1 = pdf.addPage(PageSizes.Letter);
  const { width, height } = page1.getSize();

  // Gold header bar
  page1.drawRectangle({
    x: 0,
    y: height - 40,
    width,
    height: 40,
    color: rgb(0.831, 0.627, 0.09),
  });
  page1.drawText('AIA DOCUMENT A101 \u2014 OWNER-CONTRACTOR AGREEMENT', {
    x: 10,
    y: height - 26,
    size: 12,
    font: bold,
    color: rgb(0.05, 0.07, 0.09),
  });
  page1.drawText('SAGUARO CONSTRUCTION INTELLIGENCE PLATFORM', {
    x: 10,
    y: height - 36,
    size: 7,
    font,
    color: rgb(0.2, 0.1, 0),
  });

  // Project fields
  let y = height - 65;
  drawField(page1, font, bold, 'PROJECT:', p?.name || '', 10, y, 200);
  drawField(page1, font, bold, 'PROJECT NO:', p?.project_number || '', 215, y, 130);
  drawField(page1, font, bold, 'DATE:', new Date().toLocaleDateString(), 350, y, 130);

  y -= 30;
  drawField(page1, font, bold, 'OWNER:', (ctx.owner as any)?.name || '', 10, y, 240);
  drawField(page1, font, bold, 'CONTRACTOR:', p?.gc_entity?.name || '', 265, y, 240);

  y -= 30;
  drawField(page1, font, bold, 'PROJECT ADDRESS:', p?.address || '', 10, y, 330);

  // Separator
  y -= 20;
  page1.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Preamble
  y -= 18;
  page1.drawText('AGREEMENT', {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: rgb(0, 0, 0),
  });

  y -= 14;
  y = wrapText(
    page1,
    `This Agreement is made as of the date set forth above between the Owner and the Contractor for the Project identified above. The Owner and Contractor agree as follows.`,
    10,
    y
  );

  // Article 1
  y -= 10;
  page1.drawText('ARTICLE 1 \u2014 THE CONTRACT DOCUMENTS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page1,
    'The Contract Documents consist of this Agreement, Conditions of the Contract (General, Supplementary and other Conditions), Drawings, Specifications, Addenda issued prior to execution of this Agreement, other documents listed in this Agreement, and Modifications issued after execution of this Agreement, all of which form the Contract.',
    10,
    y
  );

  // Article 2
  y -= 10;
  page1.drawText('ARTICLE 2 \u2014 THE WORK', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  const projectDesc = p?.description || p?.scope || `General construction for ${p?.name || 'the Project'} located at ${p?.address || 'the project site'}.`;
  y = wrapText(
    page1,
    `The Contractor shall fully execute the Work described in the Contract Documents, except as specifically indicated in the Contract Documents to be the responsibility of others. The Work of this Contract comprises: ${projectDesc}`,
    10,
    y
  );

  // Article 3
  y -= 10;
  page1.drawText('ARTICLE 3 \u2014 DATE OF COMMENCEMENT AND SUBSTANTIAL COMPLETION', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;

  const dateRows = [
    ['Date of Commencement:', p?.start_date || 'To be determined'],
    ['Date of Substantial Completion:', p?.substantial_date || 'To be determined'],
    ['Date of Final Completion:', p?.final_completion_date || p?.end_date || 'To be determined'],
  ];

  dateRows.forEach(([label, value], i) => {
    y -= 18;
    page1.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 18,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    page1.drawText(label, {
      x: 15,
      y: y + 2,
      size: 9,
      font: bold,
      color: rgb(0.2, 0.2, 0.2),
    });
    page1.drawText(value, {
      x: 280,
      y: y + 2,
      size: 9,
      font,
      color: rgb(0, 0, 0),
    });
  });

  // Article 4
  y -= 25;
  page1.drawText('ARTICLE 4 \u2014 CONTRACT SUM', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page1,
    `The Owner shall pay the Contractor the Contract Sum in current funds for the Contractor's performance of the Contract. The Contract Sum shall be:`,
    10,
    y
  );

  // Contract sum highlight
  y -= 5;
  page1.drawRectangle({
    x: 10,
    y: y - 5,
    width: width - 20,
    height: 28,
    color: rgb(0.05, 0.07, 0.09),
  });
  page1.drawText('CONTRACT SUM:', {
    x: 20,
    y: y + 7,
    size: 11,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  page1.drawText(fmtCurrency(p?.contract_amount || 0), {
    x: 380,
    y: y + 7,
    size: 13,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });

  y -= 35;
  const retainagePct = p?.retainage_pct || p?.retainage_percent || 10;
  page1.drawText(`Retainage: ${retainagePct}%`, {
    x: 15,
    y,
    size: 9,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Footer page 1
  page1.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  AIA A101`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  // === PAGE 2 ===
  const page2 = pdf.addPage(PageSizes.Letter);
  const { height: h2 } = page2.getSize();
  y = h2 - 40;

  // Article 5
  page2.drawText('ARTICLE 5 \u2014 PAYMENTS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page2,
    'Progress Payments: Based upon Applications for Payment submitted to the Architect by the Contractor and Certificates for Payment issued by the Architect, the Owner shall make progress payments on account of the Contract Sum to the Contractor as provided below.',
    10,
    y
  );
  y -= 5;
  y = wrapText(
    page2,
    `Payment terms are Net 30 days from the date of the Application for Payment. Retainage of ${retainagePct}% shall be withheld from each progress payment until Substantial Completion, at which time the retainage shall be reduced as mutually agreed.`,
    10,
    y
  );

  // Article 6
  y -= 15;
  page2.drawText('ARTICLE 6 \u2014 INSURANCE AND BONDS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;

  const bondingRequired = p?.bonding_required || p?.bonds_required || false;
  if (bondingRequired) {
    y = wrapText(
      page2,
      'The Contractor shall purchase and maintain insurance and provide bonds as set forth in the Contract Documents. Performance and Payment Bonds are required for this project, each in the amount of the Contract Sum.',
      10,
      y
    );
  } else {
    y = wrapText(
      page2,
      'The Contractor shall purchase and maintain insurance as set forth in the Contract Documents. The Owner does not require Performance and Payment Bonds for this project unless otherwise specified.',
      10,
      y
    );
  }

  // Signature blocks
  y -= 30;
  page2.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;
  page2.drawText('IN WITNESS WHEREOF, the parties have executed this Agreement.', {
    x: 10,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 25;
  // Owner signature
  page2.drawText('OWNER:', { x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0) });
  page2.drawText((ctx.owner as any)?.name || '', {
    x: 10,
    y: y - 12,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  page2.drawLine({
    start: { x: 10, y: y - 30 },
    end: { x: 260, y: y - 30 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page2.drawText('Signature / Title / Date', {
    x: 10,
    y: y - 40,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Contractor signature
  page2.drawText('CONTRACTOR:', {
    x: 310,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  page2.drawText(p?.gc_entity?.name || '', {
    x: 310,
    y: y - 12,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  page2.drawLine({
    start: { x: 310, y: y - 30 },
    end: { x: width - 10, y: y - 30 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page2.drawText('Signature / Title / Date', {
    x: 310,
    y: y - 40,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Footer page 2
  page2.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  AIA A101`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'a101', pdfBytes, {
    contractAmount: p?.contract_amount || 0,
    retainagePct,
    ownerName: (ctx.owner as any)?.name || '',
    contractorName: p?.gc_entity?.name || '',
  });

  return { pdfBytes, pdfUrl };
}
