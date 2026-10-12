import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';

export interface DailyReportInput {
  projectId: string;
  dailyLogId: string;
}

export async function generateDailyReport(input: DailyReportInput): Promise<{
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

  // Corporate letterhead — tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, {
    title: 'DAILY CONSTRUCTION REPORT',
    docTag: `LOG ${input.dailyLogId.slice(0, 8).toUpperCase()}`,
  });

  // Project info
  let y = height - 65;
  drawField(
    page, font, bold,
    'PROJECT:',
    (project as any)?.name || 'Project Name',
    10, y, 200
  );
  drawField(
    page, font, bold,
    'PROJECT NO:',
    (project as any)?.project_number || '',
    215, y, 130
  );
  drawField(
    page, font, bold,
    'DATE:',
    new Date().toLocaleDateString(),
    350, y, 130
  );

  y -= 30;
  drawField(
    page, font, bold,
    'REPORT #:',
    input.dailyLogId.slice(0, 8),
    10, y, 130
  );
  drawField(
    page, font, bold,
    'SUPERINTENDENT:',
    '',
    145, y, 200
  );

  // Weather section
  y -= 30;
  drawField(
    page, font, bold,
    'WEATHER CONDITION:',
    '',
    10, y, 180
  );
  drawField(
    page, font, bold,
    'TEMP HIGH:',
    '',
    195, y, 100
  );
  drawField(
    page, font, bold,
    'TEMP LOW:',
    '',
    300, y, 100
  );

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: DOC.accent,
  });

  // Helper to draw a section
  const drawSection = (title: string, content: string, startY: number): number => {
    let sy = startY - 18;
    page.drawText(title, {
      x: 10, y: sy, size: 10, font: bold, color: DOC.ink,
    });
    sy -= 5;
    page.drawRectangle({
      x: 10,
      y: sy - 45,
      width: width - 20,
      height: 45,
      borderColor: DOC.rule,
      borderWidth: 0.5,
      color: DOC.zebra,
    });
    if (content) {
      const words = content.split(' ');
      let line = '';
      let ly = sy - 12;
      for (const word of words) {
        if ((line + ' ' + word).length > 95) {
          page.drawText(line.trim(), {
            x: 15, y: ly, size: 8.5, font, color: DOC.text,
          });
          ly -= 12;
          line = word;
        } else {
          line = line + ' ' + word;
        }
      }
      if (line.trim()) {
        page.drawText(line.trim(), {
          x: 15, y: ly, size: 8.5, font, color: DOC.text,
        });
      }
    }
    return sy - 50;
  };

  y = drawSection('WORKFORCE', '', y);
  y = drawSection('WORK PERFORMED', '', y);
  y = drawSection('EQUIPMENT ON SITE', '', y);
  y = drawSection('MATERIALS RECEIVED', '', y);
  y = drawSection('VISITORS', '', y);
  y = drawSection('DELAYS / ISSUES', '', y);
  y = drawSection('SAFETY NOTES', '', y);

  // Signature line
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: 260, y },
    thickness: 0.5,
    color: DOC.ink,
  });
  y -= 10;
  page.drawText('Superintendent Signature / Date', {
    x: 10, y, size: 8, font, color: DOC.faint,
  });

  // Corporate footer on every page: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, 'Daily Construction Report');

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'daily_report', pdfBytes, {
    dailyLogId: input.dailyLogId,
  });

  return { pdfBytes, pdfUrl };
}
