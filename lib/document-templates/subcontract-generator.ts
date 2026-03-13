import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';

export interface SubcontractInput {
  projectId: string;
  subId: string;
  bidPackageId?: string;
}

export async function generateSubcontract(input: SubcontractInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  // Fetch subcontractor
  const { createServerClient } = await import('../supabase-server');
  const db = createServerClient();
  const { data: subData } = await db
    .from('subcontractors')
    .select('*')
    .eq('id', input.subId)
    .single();
  const sub = subData as any;

  // Fetch bid package if applicable
  let bidPkg: any = null;
  if (input.bidPackageId) {
    const { data: bpData } = await db
      .from('bid_packages')
      .select('*')
      .eq('id', input.bidPackageId)
      .single();
    bidPkg = bpData as any;
  }

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
  page1.drawText('SUBCONTRACT AGREEMENT', {
    x: 10,
    y: height - 26,
    size: 13,
    font: bold,
    color: rgb(0.05, 0.07, 0.09),
  });
  page1.drawText('SAGUARO CONSTRUCTION INTELLIGENCE PLATFORM  \u2022  AIA A401 STYLE', {
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
  drawField(page1, font, bold, 'CONTRACTOR:', p?.gc_entity?.name || '', 10, y, 260);
  drawField(page1, font, bold, 'SUBCONTRACTOR:', sub?.company_name || sub?.name || '', 275, y, 260);

  y -= 30;
  drawField(page1, font, bold, 'TRADE:', sub?.trade || bidPkg?.trade || '', 10, y, 200);
  drawField(page1, font, bold, 'PROJECT ADDRESS:', p?.address || '', 215, y, 330);

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
  const contractorName = p?.gc_entity?.name || 'Contractor';
  const subName = sub?.company_name || sub?.name || 'Subcontractor';
  y = wrapText(
    page1,
    `This Subcontract Agreement is entered into by and between ${contractorName} ("Contractor") and ${subName} ("Subcontractor") for work on the Project identified above. The Contractor and Subcontractor agree as follows.`,
    10,
    y
  );

  // Article 1
  y -= 10;
  page1.drawText('ARTICLE 1 \u2014 THE SUBCONTRACT DOCUMENTS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page1,
    'The Subcontract Documents consist of this Agreement, the Prime Contract between Owner and Contractor (including General and Supplementary Conditions), Drawings, Specifications, Addenda, and any Modifications issued after execution of this Agreement.',
    10,
    y
  );

  // Article 2
  y -= 10;
  page1.drawText('ARTICLE 2 \u2014 SCOPE OF WORK', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  const scope = bidPkg?.scope || sub?.scope || sub?.trade || 'As described in the Contract Documents.';
  y = wrapText(
    page1,
    `The Subcontractor shall perform the following Work in accordance with the Subcontract Documents: ${scope}`,
    10,
    y
  );

  // Article 3 - Subcontract Sum
  y -= 10;
  page1.drawText('ARTICLE 3 \u2014 SUBCONTRACT SUM', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;

  const subAmount = sub?.contract_amount || sub?.amount || bidPkg?.awarded_amount || 0;
  y = wrapText(
    page1,
    `The Contractor shall pay the Subcontractor in current funds for the performance of the Subcontract Work, subject to additions and deductions as provided in the Subcontract Documents, the Subcontract Sum of:`,
    10,
    y
  );

  // Sum highlight
  y -= 5;
  page1.drawRectangle({
    x: 10,
    y: y - 5,
    width: width - 20,
    height: 28,
    color: rgb(0.05, 0.07, 0.09),
  });
  page1.drawText('SUBCONTRACT SUM:', {
    x: 20,
    y: y + 7,
    size: 11,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  page1.drawText(fmtCurrency(subAmount), {
    x: 380,
    y: y + 7,
    size: 13,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Footer page 1
  page1.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Subcontract Agreement`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  // === PAGE 2 ===
  const page2 = pdf.addPage(PageSizes.Letter);
  const { height: h2 } = page2.getSize();
  y = h2 - 40;

  // Article 4
  page2.drawText('ARTICLE 4 \u2014 PAYMENT', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  const retainagePct = p?.retainage_pct || p?.retainage_percent || 10;
  y = wrapText(
    page2,
    `Progress Payments shall be made monthly based on the Subcontractor's Application for Payment, less retainage of ${retainagePct}%. Payment shall be made within seven (7) days after the Contractor receives payment from the Owner for the Subcontractor's Work. Retainage shall be released upon Substantial Completion and acceptance of the Subcontractor's Work.`,
    10,
    y
  );

  // Article 5
  y -= 15;
  page2.drawText('ARTICLE 5 \u2014 INSURANCE REQUIREMENTS', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page2,
    'The Subcontractor shall maintain the following insurance coverage throughout the duration of the Subcontract Work: (a) Commercial General Liability with minimum limits of $1,000,000 per occurrence and $2,000,000 general aggregate; (b) Workers\u2019 Compensation as required by applicable state law; (c) Automobile Liability with minimum limits of $1,000,000 combined single limit. Certificates of Insurance (COI) naming the Contractor as additional insured shall be provided prior to commencing work.',
    10,
    y
  );

  // Article 6
  y -= 15;
  page2.drawText('ARTICLE 6 \u2014 INDEMNIFICATION', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page2,
    'To the fullest extent permitted by law, the Subcontractor shall indemnify and hold harmless the Owner, Contractor, and their agents and employees from and against claims, damages, losses, and expenses, including but not limited to attorney fees, arising out of or resulting from performance of the Subcontractor\u2019s Work, provided that such claim, damage, loss, or expense is attributable to bodily injury, death, or property damage caused in whole or in part by negligent acts or omissions of the Subcontractor.',
    10,
    y
  );

  // Article 7
  y -= 15;
  page2.drawText('ARTICLE 7 \u2014 TERMINATION', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  y = wrapText(
    page2,
    'Termination for Cause: If the Subcontractor persistently or repeatedly fails to perform the Work in accordance with the Subcontract Documents, the Contractor may terminate this Subcontract upon seven (7) days\u2019 written notice.',
    10,
    y
  );
  y -= 5;
  y = wrapText(
    page2,
    'Termination for Convenience: The Contractor may terminate this Subcontract for convenience upon fourteen (14) days\u2019 written notice. The Subcontractor shall be entitled to payment for Work properly performed through the date of termination.',
    10,
    y
  );

  // Signature blocks
  y -= 25;
  page2.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;
  page2.drawText('IN WITNESS WHEREOF, the parties have executed this Subcontract Agreement.', {
    x: 10,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 25;
  // Contractor signature
  page2.drawText('CONTRACTOR:', { x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0) });
  page2.drawText(contractorName, {
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

  // Subcontractor signature
  page2.drawText('SUBCONTRACTOR:', {
    x: 310,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  page2.drawText(subName, {
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
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Subcontract Agreement`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'subcontract', pdfBytes, {
    subId: input.subId,
    subName,
    trade: sub?.trade || '',
    subcontractSum: subAmount,
    bidPackageId: input.bidPackageId || null,
  });

  return { pdfBytes, pdfUrl };
}
