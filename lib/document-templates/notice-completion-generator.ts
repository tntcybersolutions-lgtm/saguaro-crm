import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  saveDocument,
} from '../pdf-engine';

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
  page.drawText('NOTICE OF COMPLETION', {
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

  // Legal citation
  let y = height - 60;
  page.drawText('Pursuant to Arizona Revised Statutes \u00A733-993', {
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
    color: rgb(0.83, 0.63, 0.09),
  });

  // Body text
  y -= 18;
  page.drawText('NOTICE', {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: rgb(0, 0, 0),
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
        color: rgb(0.2, 0.2, 0.2),
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
      color: rgb(0.2, 0.2, 0.2),
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
    color: rgb(0.96, 0.97, 0.98),
  });
  y -= 5;
  page.drawText('RECORDING INSTRUCTIONS', {
    x: 15,
    y,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 12;
  page.drawText(
    'TO BE RECORDED in the office of the County Recorder of the county in which the property is located.',
    { x: 15, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 12;
  page.drawText(
    'This notice must be recorded within ten (10) days of completion of the work of improvement.',
    { x: 15, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) }
  );

  // Owner signature
  y -= 35;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;

  page.drawText('OWNER:', { x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0) });
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
  page.drawText(ownerName, {
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
    'State of Arizona    County of _____________    On this _____ day of ________________, 20___, before me personally appeared',
    { x: 10, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 12;
  page.drawText(
    '___________________________, known to me to be the person(s) whose name(s) is/are subscribed to the within instrument,',
    { x: 10, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= 12;
  page.drawText(
    'and acknowledged to me that he/she/they executed the same in his/her/their authorized capacity(ies).',
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
    `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  Notice of Completion`,
    { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
  );

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'notice_of_completion', pdfBytes, {
    completionDate: input.completionDate,
    ownerName,
    projectName,
  });

  return { pdfBytes, pdfUrl };
}
