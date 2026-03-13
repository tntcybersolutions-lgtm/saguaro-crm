import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  saveDocument,
} from '../pdf-engine';

export interface PreliminaryNoticeInput {
  projectId: string;
  subId?: string;
  lenderName?: string;
  lenderAddress?: string;
}

export async function generatePreliminaryNotice(input: PreliminaryNoticeInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  // Fetch sub info if applicable
  let sub: any = null;
  if (input.subId) {
    const { createServerClient } = await import('../supabase-server');
    const db = createServerClient();
    const { data: subData } = await db
      .from('subcontractors')
      .select('*')
      .eq('id', input.subId)
      .single();
    sub = subData as any;
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
  page.drawText('PRELIMINARY TWENTY-DAY NOTICE', {
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

  // Legal citation
  let y = height - 60;
  page.drawText('Pursuant to Arizona Revised Statutes \u00A733-992.01', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Owner info
  y -= 25;
  drawField(page, font, bold, 'OWNER NAME:', (ctx.owner as any)?.name || '', 10, y, 260);
  drawField(page, font, bold, 'OWNER ADDRESS:', (ctx.owner as any)?.address || '', 275, y, 270);

  // GC info
  y -= 30;
  drawField(page, font, bold, 'GENERAL CONTRACTOR:', p?.gc_entity?.name || '', 10, y, 260);
  drawField(page, font, bold, 'GC ADDRESS:', p?.gc_entity?.address || p?.address || '', 275, y, 270);

  // Lender info
  y -= 30;
  drawField(page, font, bold, 'LENDER NAME:', input.lenderName || 'N/A', 10, y, 260);
  drawField(page, font, bold, 'LENDER ADDRESS:', input.lenderAddress || 'N/A', 275, y, 270);

  // Project info
  y -= 30;
  drawField(page, font, bold, 'PROJECT DESCRIPTION:', p?.name || '', 10, y, 260);
  drawField(page, font, bold, 'PROJECT ADDRESS:', p?.address || '', 275, y, 270);

  // Claimant info
  if (sub) {
    y -= 30;
    drawField(page, font, bold, 'CLAIMANT (SUBCONTRACTOR):', sub?.company_name || sub?.name || '', 10, y, 260);
    drawField(page, font, bold, 'CLAIMANT ADDRESS:', sub?.address || '', 275, y, 270);

    y -= 30;
    drawField(page, font, bold, 'TRADE / SCOPE:', sub?.trade || sub?.scope || '', 10, y, 330);
  }

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Notice body
  y -= 18;
  page.drawText('NOTICE IS HEREBY GIVEN THAT:', {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: rgb(0, 0, 0),
  });

  y -= 14;
  const claimantName = sub?.company_name || sub?.name || p?.gc_entity?.name || 'The undersigned';
  const claimantTrade = sub?.trade || sub?.scope || 'labor, services, and/or materials';
  const noticeBody =
    `${claimantName} has been employed to furnish ${claimantTrade} for the improvement of the property described above. ` +
    `This notice is provided to preserve the claimant's lien rights under Arizona law. ` +
    `The general description of the labor, services, equipment, or materials furnished or to be furnished is: ${claimantTrade}.`;

  const noticeWords = noticeBody.split(' ');
  let noticeLine = '';
  for (const word of noticeWords) {
    if ((noticeLine + ' ' + word).length > 95) {
      page.drawText(noticeLine.trim(), {
        x: 10,
        y,
        size: 8.5,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      noticeLine = word;
    } else {
      noticeLine = noticeLine + ' ' + word;
    }
  }
  if (noticeLine.trim()) {
    page.drawText(noticeLine.trim(), {
      x: 10,
      y,
      size: 8.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

  // Warning text
  y -= 15;
  page.drawRectangle({
    x: 10,
    y: y - 55,
    width: width - 20,
    height: 70,
    color: rgb(0.96, 0.97, 0.98),
  });

  y -= 5;
  page.drawText('WARNING', {
    x: 15,
    y,
    size: 9,
    font: bold,
    color: rgb(0.7, 0.1, 0.1),
  });

  y -= 12;
  const warningText =
    'This is not a lien. This is a notice required by Arizona law (A.R.S. \u00A733-992.01) to preserve lien rights. ' +
    'Even though you have received this notice, if the person who gave this notice is not paid in full, a lien may be ' +
    'filed against the property. A lien filed against your property may result in foreclosure and loss of your property.';

  const warningWords = warningText.split(' ');
  let warningLine = '';
  for (const word of warningWords) {
    if ((warningLine + ' ' + word).length > 95) {
      page.drawText(warningLine.trim(), {
        x: 15,
        y,
        size: 8,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      y -= 11;
      warningLine = word;
    } else {
      warningLine = warningLine + ' ' + word;
    }
  }
  if (warningLine.trim()) {
    page.drawText(warningLine.trim(), {
      x: 15,
      y,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 11;
  }

  // Date and signature
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;

  page.drawText('CLAIMANT:', { x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0) });
  page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 310,
    y,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: 10, y: y - 20 },
    end: { x: 260, y: y - 20 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText(claimantName, {
    x: 10,
    y: y - 30,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText('Signature / Title', {
    x: 10,
    y: y - 40,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Footer
  page.drawText(
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Preliminary 20-Day Notice`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'preliminary_notice', pdfBytes, {
    subId: input.subId || null,
    claimantName,
    lenderName: input.lenderName || null,
  });

  return { pdfBytes, pdfUrl };
}
