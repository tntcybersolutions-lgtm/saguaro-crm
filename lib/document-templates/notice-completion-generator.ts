import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';

export interface NoticeCompletionInput {
  projectId: string;
  completionDate: string;
}

export async function generateNoticeCompletion(input: NoticeCompletionInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead — tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, { title: 'NOTICE OF COMPLETION' });

  // Legal citation
  let y = height - 60;
  page.drawText('Pursuant to Arizona Revised Statutes \u00A733-993', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: DOC.muted,
  });

  // Owner info
  y -= 25;
  drawField(page, font, bold, 'OWNER NAME:', (ctx.owner as any)?.name || '', 10, y, 260);
  drawField(page, font, bold, 'OWNER ADDRESS:', (ctx.owner as any)?.address || '', 275, y, 270);

  // GC info
  y -= 30;
  drawField(page, font, bold, 'GENERAL CONTRACTOR:', p?.gc_entity?.name || '', 10, y, 260);

  // Project info
  y -= 30;
  drawField(page, font, bold, 'PROJECT DESCRIPTION:', p?.name || '', 10, y, 260);
  drawField(page, font, bold, 'PROJECT ADDRESS:', p?.address || '', 275, y, 270);

  // Completion date
  y -= 30;
  drawField(page, font, bold, 'DATE OF COMPLETION:', input.completionDate, 10, y, 260);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: DOC.accent,
  });

  // Body text
  y -= 18;
  page.drawText('NOTICE', {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: DOC.ink,
  });

  y -= 14;
  const ownerName = (ctx.owner as any)?.name || 'The undersigned owner';
  const projectName = p?.name || 'the project';
  const projectAddress = p?.address || 'the project site';
  const gcName = p?.gc_entity?.name || 'the general contractor';

  const bodyText =
    `Notice is hereby given that ${ownerName}, as Owner, certifies that the work of improvement ` +
    `known as "${projectName}" located at ${projectAddress}, for which ${gcName} was the general ` +
    `contractor, was completed on ${input.completionDate}. This Notice of Completion is filed ` +
    `pursuant to the provisions of Arizona Revised Statutes \u00A733-993.`;

  const bodyWords = bodyText.split(' ');
  let bodyLine = '';
  for (const word of bodyWords) {
    if ((bodyLine + ' ' + word).length > 95) {
      page.drawText(bodyLine.trim(), {
        x: 10,
        y,
        size: 8.5,
        font,
        color: DOC.text,
      });
      y -= 12;
      bodyLine = word;
    } else {
      bodyLine = bodyLine + ' ' + word;
    }
  }
  if (bodyLine.trim()) {
    page.drawText(bodyLine.trim(), {
      x: 10,
      y,
      size: 8.5,
      font,
      color: DOC.text,
    });
    y -= 12;
  }

  // Recording instructions
  y -= 20;
  page.drawRectangle({
    x: 10,
    y: y - 30,
    width: width - 20,
    height: 45,
    color: DOC.zebra,
  });
  y -= 5;
  page.drawText('RECORDING INSTRUCTIONS', {
    x: 15,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  y -= 12;
  page.drawText(
    'TO BE RECORDED in the office of the County Recorder of the county in which the property is located.',
    { x: 15, y, size: 8.5, font, color: DOC.muted }
  );
  y -= 12;
  page.drawText(
    'This notice must be recorded within ten (10) days of completion of the work of improvement.',
    { x: 15, y, size: 8.5, font, color: DOC.muted }
  );

  // Owner signature
  y -= 35;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.rule,
  });
  y -= 15;

  page.drawText('OWNER:', { x: 10, y, size: 9, font: bold, color: DOC.ink });
  page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 310,
    y,
    size: 9,
    font,
    color: DOC.ink,
  });
  page.drawLine({
    start: { x: 10, y: y - 20 },
    end: { x: 260, y: y - 20 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page.drawText(ownerName, {
    x: 10,
    y: y - 30,
    size: 8,
    font,
    color: DOC.muted,
  });
  page.drawText('Signature / Title', {
    x: 10,
    y: y - 40,
    size: 7,
    font,
    color: DOC.faint,
  });

  // Notary acknowledgment
  y -= 60;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.rule,
  });
  y -= 14;
  page.drawText('NOTARY ACKNOWLEDGMENT', {
    x: 10,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  y -= 12;
  page.drawText(
    'State of Arizona    County of _____________    On this _____ day of ________________, 20___, before me personally appeared',
    { x: 10, y, size: 8, font, color: DOC.muted }
  );
  y -= 12;
  page.drawText(
    '___________________________, known to me to be the person(s) whose name(s) is/are subscribed to the within instrument,',
    { x: 10, y, size: 8, font, color: DOC.muted }
  );
  y -= 12;
  page.drawText(
    'and acknowledged to me that he/she/they executed the same in his/her/their authorized capacity(ies).',
    { x: 10, y, size: 8, font, color: DOC.muted }
  );
  y -= 18;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 260, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  page.drawText('Notary Public / Commission Expiration', {
    x: 10,
    y: y - 10,
    size: 7,
    font,
    color: DOC.faint,
  });

  // Corporate footer: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, 'Notice of Completion');

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'notice_of_completion', pdfBytes, {
    completionDate: input.completionDate,
    ownerName,
    projectName,
  });

  return { pdfBytes, pdfUrl };
}
