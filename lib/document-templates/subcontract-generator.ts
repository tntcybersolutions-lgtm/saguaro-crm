import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters } from './report-theme';

export interface SubcontractInput {
  projectId: string;
  subId: string;
  bidPackageId?: string;
  /* What the GC actually typed. Every printed value still derives from the
     database exactly as before; an override simply wins. The form sends only
     what a person changed, so there is one document and one source of truth
     rather than a second copy of the contract living in the UI. */
  overrides?: Record<string, unknown>;
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
  const kit = await brandDoc(pdf, { projectId: input.projectId });
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

  /* Anything the GC typed on the contract form wins over what the database
     guessed. Blank is not an override — an empty box means "you had it right".
     Declared before the first drawn field so the header and the body cannot
     disagree about who the parties are. */
  const ov = (input.overrides ?? {}) as Record<string, any>;
  const pick = (k: string, fallback: any) => {
    const v = ov[k];
    return v === undefined || v === null || v === '' ? fallback : v;
  };
  const contractorName = pick('contractorName', p?.gc_entity?.name || 'Contractor');
  const subName = pick('subName', sub?.company_name || sub?.name || 'Subcontractor');

  // === PAGE 1 ===
  const page1 = pdf.addPage(PageSizes.Letter);
  const { width, height } = page1.getSize();

  // Corporate letterhead (report-theme): tenant logo + accent color
  drawBrandHeader(page1, kit, { title: 'SUBCONTRACT AGREEMENT', docTag: 'AIA A401 STYLE' });

  // Project fields
  let y = height - 65;
  drawField(page1, font, bold, 'PROJECT:', p?.name || '', 10, y, 200);
  drawField(page1, font, bold, 'PROJECT NO:', p?.project_number || '', 215, y, 130);
  drawField(page1, font, bold, 'DATE:', new Date().toLocaleDateString(), 350, y, 130);

  y -= 30;
  drawField(page1, font, bold, 'CONTRACTOR:', contractorName, 10, y, 260);
  drawField(page1, font, bold, 'SUBCONTRACTOR:', subName, 275, y, 260);

  y -= 30;
  drawField(page1, font, bold, 'TRADE:', pick('subTrade', sub?.trade || bidPkg?.trade || ''), 10, y, 200);
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
  const scope = pick('scope', bidPkg?.scope || sub?.scope || sub?.trade || 'As described in the Contract Documents.');
  y = wrapText(
    page1,
    `The Subcontractor shall perform the following Work in accordance with the Subcontract Documents: ${scope}`,
    10,
    y
  );

  /* From here the scope article can outrun page one, so drawing follows a
     cursor rather than a fixed page. */
  let flow = page1;
  const room = (needed: number) => {
    if (y - needed < 60) { flow = pdf.addPage(PageSizes.Letter); y = height - 65; }
  };

  const inclusions = String(pick('inclusions', ''));
  if (inclusions) {
    y -= 6;
    room(30);
    flow.drawText('Included in this scope:', { x: 10, y, size: 8.5, font: bold, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
    y = wrapText(flow, inclusions, 10, y);
  }

  /* The exclusions checklist plus anything typed into the free box. Numbered,
     because a sub who has to argue about item 7 needs to be able to name it. */
  const picked = Array.isArray(ov.exclusions) ? (ov.exclusions as string[]) : [];
  const extraExclusions = String(pick('exclusionsOther', ''))
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter(Boolean);
  const exclusions = [...picked, ...extraExclusions];
  if (exclusions.length) {
    y -= 6;
    room(30);
    flow.drawText('Expressly excluded from this scope:', { x: 10, y, size: 8.5, font: bold, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
    exclusions.forEach((item, i) => {
      room(14);
      y = wrapText(flow, `${i + 1}. ${item}`, 14, y, 92);
    });
  }

  /* Article 3 needs its heading, a paragraph and the sum band together. */
  room(110);

  // Article 3 - Subcontract Sum
  y -= 10;
  flow.drawText('ARTICLE 3 \u2014 SUBCONTRACT SUM', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;

  const subAmount = Number(pick('subAmount', sub?.contract_amount || sub?.amount || bidPkg?.awarded_amount || 0)) || 0;
  y = wrapText(
    flow,
    `The Contractor shall pay the Subcontractor in current funds for the performance of the Subcontract Work, subject to additions and deductions as provided in the Subcontract Documents, the Subcontract Sum of:`,
    10,
    y
  );

  // Sum highlight
  y -= 5;
  flow.drawRectangle({
    x: 10,
    y: y - 5,
    width: width - 20,
    height: 28,
    color: rgb(0.05, 0.07, 0.09),
  });
  flow.drawText('SUBCONTRACT SUM:', {
    x: 20,
    y: y + 7,
    size: 11,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  flow.drawText(fmtCurrency(subAmount), {
    x: 380,
    y: y + 7,
    size: 13,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });

  // === PAGE 2 ===
  const page2 = pdf.addPage(PageSizes.Letter);
  const { height: h2 } = page2.getSize();
  drawBrandHeader(page2, kit, { title: 'SUBCONTRACT AGREEMENT (CONT.)', docTag: 'AIA A401 STYLE' });
  y = h2 - 64;

  // Article 4
  page2.drawText('ARTICLE 4 \u2014 PAYMENT', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  const retainagePct = pick('retainagePct', p?.retainage_pct || p?.retainage_percent || 10);
  y = wrapText(
    page2,
    `Progress Payments shall be made monthly based on the Subcontractor's Application for Payment, less retainage of ${retainagePct}%, on terms of ${pick('paymentTerms', 'Net 30 after Owner payment')}. Payment shall be made within seven (7) days after the Contractor receives payment from the Owner for the Subcontractor's Work. Retainage shall be released upon Substantial Completion and acceptance of the Subcontractor's Work.`,
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
    `The Subcontractor shall maintain the following insurance coverage throughout the duration of the Subcontract Work: (a) Commercial General Liability with minimum limits of ${pick('glLimits', '$1,000,000 per occurrence / $2,000,000 aggregate')}; (b) Workers\u2019 Compensation as required by applicable state law; (c) Automobile Liability with minimum limits of $1,000,000 combined single limit. Certificates of Insurance (COI) naming the Contractor as additional insured shall be provided prior to commencing work.`,
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

  /* Article 8 — the terms the GC filled in on the form that the standard
     A401 body has no printed slot for. Only what was actually supplied is
     printed, so a subcontract with none of these reads exactly as before. */
  const supplementary = ([
    ['Subcontractor address', String(pick('subAddress', ''))],
    ['Subcontractor licence', String(pick('subLicense', ''))],
    ['Contract type', String(pick('contractType', ''))],
    ['Start on site', String(pick('startDate', ''))],
    ['Completion', String(pick('completionDate', ''))],
    ['Liquidated damages', String(pick('liquidatedDamages', ''))],
    ['Payment & performance bond', String(pick('bondRequired', ''))],
    ['Special conditions', String(pick('specialConditions', ''))],
  ] as Array<[string, string]>).filter((row) => Boolean(row[1]));

  if (supplementary.length) {
    y -= 15;
    page2.drawText('ARTICLE 8 — SUPPLEMENTARY CONDITIONS', {
      x: 10,
      y,
      size: 10,
      font: bold,
      color: rgb(0, 0, 0),
    });
    y -= 14;
    for (const [label, value] of supplementary) {
      page2.drawText(label + ':', { x: 10, y, size: 8.5, font: bold, color: rgb(0.2, 0.2, 0.2) });
      y = wrapText(page2, value, 150, y, 74);
      y -= 3;
    }
  }

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

  // Corporate footer on every page: Page X of Y + company + generated date
  stampFooters(pdf, kit, 'Subcontract Agreement');

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
