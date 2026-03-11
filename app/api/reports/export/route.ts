import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/reports/export
 * POST { type, data: rows[][], columns: string[], title, format: 'csv' | 'pdf' }
 * Returns CSV download or PDF (via pdf-lib)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { format = 'csv', columns = [], rows = [], title = 'Report', type = 'report' } = body;

    if (format === 'csv') {
      // Build CSV
      const header = (columns as string[]).join(',');
      const csvRows = (rows as string[][])
        .map(row =>
          row.map((cell: string) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');
      const csv = header ? `${header}\n${csvRows}` : csvRows;
      const filename = `${type}-${new Date().toISOString().split('T')[0]}.csv`;

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // PDF format — use pdf-lib
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const GOLD = rgb(0.831, 0.627, 0.09);
      const DARK = rgb(0.051, 0.067, 0.086);
      const WHITE = rgb(1, 1, 1);
      const LIGHT = rgb(0.9, 0.9, 0.9);

      const page = pdfDoc.addPage([792, 612]); // Landscape letter
      const { width, height } = page.getSize();

      // Gold header bar
      page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
      page.drawText('SAGUARO CRM', { x: 40, y: height - 38, size: 20, font: boldFont, color: GOLD });
      page.drawText(title, { x: 200, y: height - 38, size: 14, font, color: WHITE });
      page.drawText(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
        x: width - 240, y: height - 38, size: 10, font, color: LIGHT,
      });

      let y = height - 80;
      const colWidth = columns.length > 0 ? Math.min(120, (width - 80) / columns.length) : 120;
      const rowHeight = 22;

      // Column headers
      if (columns.length > 0) {
        page.drawRectangle({ x: 40, y: y - rowHeight, width: width - 80, height: rowHeight, color: GOLD });
        (columns as string[]).forEach((col, i) => {
          page.drawText(String(col).toUpperCase().slice(0, 15), {
            x: 44 + i * colWidth, y: y - 16, size: 8, font: boldFont, color: DARK,
          });
        });
        y -= rowHeight + 2;
      }

      // Data rows
      let odd = false;
      for (const row of (rows as string[][])) {
        if (y < 60) {
          // New page needed
          const newPage = pdfDoc.addPage([792, 612]);
          y = newPage.getSize().height - 40;
          // Re-draw header on new page? For simplicity, just continue
        }

        if (odd) {
          page.drawRectangle({ x: 40, y: y - rowHeight, width: width - 80, height: rowHeight, color: rgb(0.97, 0.97, 0.97) });
        }
        odd = !odd;

        row.forEach((cell, i) => {
          if (i >= columns.length && columns.length > 0) return;
          const text = String(cell ?? '').slice(0, 20);
          page.drawText(text, {
            x: 44 + i * colWidth, y: y - 15, size: 8, font, color: DARK,
          });
        });
        y -= rowHeight;
      }

      const pdfBytes = await pdfDoc.save();
      const filename = `${type}-${new Date().toISOString().split('T')[0]}.pdf`;

      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (pdfErr) {
      console.error('[reports/export] PDF generation error:', pdfErr);
      // Fall back to CSV if PDF fails
      const header = (columns as string[]).join(',');
      const csvRows = (rows as string[][]).map(row => row.join(',')).join('\n');
      const csv = `${header}\n${csvRows}`;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${type}.csv"`,
        },
      });
    }
  } catch (err: any) {
    console.error('[reports/export]', err?.message);
    return NextResponse.json({ error: 'Export failed', details: err?.message }, { status: 500 });
  }
}
