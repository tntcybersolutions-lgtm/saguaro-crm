import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { getProjectContext, saveDocument, fmtCurrency } from '../pdf-engine';

export interface G703LineItem {
  itemNo: string;
  description: string;
  scheduledValue: number;
  prevCompleted: number;
  thisPeriod: number;
  storedMaterials?: number;
}

export async function generateG703(
  projectId: string,
  appNumber: number,
  periodTo: string,
  lineItems: G703LineItem[]
): Promise<{ pdfBytes: Uint8Array; pdfUrl: string }> {
  const ctx = await getProjectContext(projectId);
  const { project } = ctx;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // May need multiple pages for many line items
  const ITEMS_PER_PAGE = 20;
  let pageItems = [...lineItems];
  let pageNum = 1;

  while (pageItems.length > 0) {
    const page = pdf.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();

    // Header
    page.drawRectangle({
      x: 0,
      y: height - 36,
      width,
      height: 36,
      color: rgb(0.831, 0.627, 0.09),
    });
    page.drawText('AIA G703 \u2014 CONTINUATION SHEET', {
      x: 10,
      y: height - 25,
      size: 11,
      font: bold,
      color: rgb(0.05, 0.07, 0.09),
    });
    page.drawText(
      `${(project as any)?.name || 'Project'}  |  App #${appNumber}  |  Period To: ${periodTo}  |  Page ${pageNum}`,
      { x: 10, y: height - 34, size: 7, font, color: rgb(0.2, 0.1, 0) }
    );

    // Column headers
    const cols = [
      { label: 'A ITEM NO.', x: 10, w: 35 },
      { label: 'B DESCRIPTION OF WORK', x: 48, w: 160 },
      { label: 'C SCHEDULED VALUE', x: 211, w: 70 },
      { label: 'D PREV COMPLETED', x: 284, w: 65 },
      { label: 'E THIS PERIOD', x: 352, w: 65 },
      { label: 'F STORED MATLS', x: 420, w: 55 },
      { label: 'G TOTAL (D+E+F)', x: 478, w: 65 },
    ];

    let y = height - 55;
    page.drawRectangle({
      x: 10,
      y: y - 20,
      width: width - 20,
      height: 20,
      color: rgb(0.15, 0.2, 0.25),
    });
    cols.forEach((col) => {
      page.drawText(col.label, {
        x: col.x + 2,
        y: y - 14,
        size: 6.5,
        font: bold,
        color: rgb(1, 1, 1),
        maxWidth: col.w - 4,
      });
    });

    y -= 22;
    const batch = pageItems.splice(0, ITEMS_PER_PAGE);

    batch.forEach((item, i) => {
      const rowY = y - i * 16;
      if (i % 2 === 0) {
        page.drawRectangle({
          x: 10,
          y: rowY - 14,
          width: width - 20,
          height: 14,
          color: rgb(0.96, 0.97, 0.98),
        });
      }
      const total =
        item.prevCompleted + item.thisPeriod + (item.storedMaterials || 0);
      const pct =
        item.scheduledValue > 0
          ? ((total / item.scheduledValue) * 100).toFixed(0)
          : '0';
      page.drawText(item.itemNo, { x: 12, y: rowY - 10, size: 8, font });
      page.drawText(item.description.slice(0, 28), {
        x: 50,
        y: rowY - 10,
        size: 8,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawText(fmtCurrency(item.scheduledValue), {
        x: 213,
        y: rowY - 10,
        size: 8,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawText(fmtCurrency(item.prevCompleted), {
        x: 286,
        y: rowY - 10,
        size: 8,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      page.drawText(fmtCurrency(item.thisPeriod), {
        x: 354,
        y: rowY - 10,
        size: 8,
        font: bold,
        color: rgb(0.05, 0.3, 0.1),
      });
      page.drawText(fmtCurrency(item.storedMaterials || 0), {
        x: 422,
        y: rowY - 10,
        size: 8,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      page.drawText(`${fmtCurrency(total)} (${pct}%)`, {
        x: 480,
        y: rowY - 10,
        size: 8,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
    });

    // Totals row
    const totY = y - Math.min(batch.length, ITEMS_PER_PAGE) * 16 - 8;
    page.drawRectangle({
      x: 10,
      y: totY - 14,
      width: width - 20,
      height: 16,
      color: rgb(0.05, 0.07, 0.09),
    });
    const totSched = batch.reduce((s, l) => s + l.scheduledValue, 0);
    const totPrev = batch.reduce((s, l) => s + l.prevCompleted, 0);
    const totThis = batch.reduce((s, l) => s + l.thisPeriod, 0);
    const totStored = batch.reduce((s, l) => s + (l.storedMaterials || 0), 0);
    page.drawText('TOTALS', {
      x: 50,
      y: totY - 10,
      size: 8,
      font: bold,
      color: rgb(0.83, 0.63, 0.09),
    });
    page.drawText(fmtCurrency(totSched), {
      x: 213,
      y: totY - 10,
      size: 8,
      font: bold,
      color: rgb(0.83, 0.63, 0.09),
    });
    page.drawText(fmtCurrency(totPrev), {
      x: 286,
      y: totY - 10,
      size: 8,
      font: bold,
      color: rgb(0.83, 0.63, 0.09),
    });
    page.drawText(fmtCurrency(totThis), {
      x: 354,
      y: totY - 10,
      size: 8,
      font: bold,
      color: rgb(0.83, 0.63, 0.09),
    });
    page.drawText(fmtCurrency(totPrev + totThis + totStored), {
      x: 480,
      y: totY - 10,
      size: 8,
      font: bold,
      color: rgb(0.83, 0.63, 0.09),
    });

    page.drawText(
      `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}`,
      { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
    );
    pageNum++;
  }

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(projectId, 'g703', pdfBytes, {
    appNumber,
    periodTo,
  });

  try {
    await import('../../supabase/admin').then(({ supabaseAdmin }) =>
      supabaseAdmin
        .from('pay_applications')
        .update({ g703_pdf_url: pdfUrl })
        .eq('project_id', projectId)
        .eq('app_number', appNumber)
    );
  } catch {
    /* ignore */
  }

  return { pdfBytes, pdfUrl };
}
