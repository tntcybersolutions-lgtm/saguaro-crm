import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColumnType = 'text' | 'currency' | 'date' | 'number' | 'badge' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

interface ExportBody {
  format: 'csv' | 'xlsx' | 'pdf';
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  logoUrl?: string;
  companyName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** RFC 4180 – quote a single CSV field */
function csvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Strip currency formatting so Excel imports as a number */
function currencyToNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Format a cell value for CSV output */
function formatCsvValue(value: unknown, type: ColumnType): string {
  if (value == null || value === '') return '';
  switch (type) {
    case 'currency':
      return String(currencyToNumber(value));
    case 'number':
      return String(typeof value === 'number' ? value : parseFloat(String(value)) || 0);
    case 'percent': {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(n) ? '' : String(n);
    }
    case 'date': {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-US');
    }
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function buildCsv(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
): string {
  const BOM = '\uFEFF';

  // Header row
  const headerRow = columns.map(c => csvField(c.label)).join(',');

  // Data rows
  const dataRows = rows.map(row =>
    columns.map(col => csvField(formatCsvValue(row[col.key], col.type))).join(','),
  );

  // Totals row
  const parts: string[] = [BOM + headerRow, ...dataRows];
  if (totals && Object.keys(totals).length > 0) {
    const totalsRow = columns.map(col => {
      if (col.key in totals) return csvField(String(totals[col.key]));
      if (col === columns[0]) return csvField('TOTALS');
      return '';
    }).join(',');
    parts.push(totalsRow);
  }

  return parts.join('\r\n');
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function buildXlsx(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
  companyName?: string,
): Buffer {
  const wb = XLSX.utils.book_new();
  const wsData: unknown[][] = [];

  // Row 1: title (will be merged)
  wsData.push([companyName ? `${companyName} — ${title}` : title]);

  // Row 2: blank
  wsData.push([]);

  // Row 3: column headers
  wsData.push(columns.map(c => c.label));

  // Rows 4+: data
  for (const row of rows) {
    const dataRow: unknown[] = columns.map(col => {
      const val = row[col.key];
      switch (col.type) {
        case 'currency':
          return currencyToNumber(val);
        case 'number': {
          const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
          return isNaN(n) ? (val ?? '') : n;
        }
        case 'percent': {
          const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
          // Store as decimal (e.g. 0.42 for 42%)
          if (!isNaN(n)) {
            // If value looks like "42%" or 42, normalise to 0.42
            const raw = String(val ?? '').replace('%', '').trim();
            const parsed = parseFloat(raw);
            return isNaN(parsed) ? val : parsed > 1 ? parsed / 100 : parsed;
          }
          return val ?? '';
        }
        case 'date': {
          if (!val) return '';
          const d = new Date(String(val));
          if (isNaN(d.getTime())) return String(val);
          // Return as JS Date so xlsx can format it
          return d;
        }
        default:
          return val == null ? '' : String(val);
      }
    });
    wsData.push(dataRow);
  }

  // Totals row (if provided)
  const hasTotals = totals && Object.keys(totals).length > 0;
  if (hasTotals) {
    const totalsRow: unknown[] = columns.map((col, i) => {
      if (col.key in totals!) return totals![col.key];
      if (i === 0) return 'TOTALS';
      return '';
    });
    wsData.push(totalsRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const numCols = columns.length;
  const numDataRows = rows.length;
  const headerRowIndex = 2; // 0-based, row 3 in spreadsheet
  const dataStartIndex = 3; // row 4
  const totalsRowIndex = hasTotals ? dataStartIndex + numDataRows : null;

  // Column widths: auto-fit based on content
  const colWidths: number[] = columns.map(col => {
    const headerLen = col.label.length;
    const maxDataLen = rows.reduce((acc, row) => {
      const v = row[col.key];
      return Math.max(acc, v == null ? 0 : String(v).length);
    }, 0);
    return Math.min(40, Math.max(10, headerLen, maxDataLen));
  });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  // Merge title across all columns (row 1)
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }];

  // Cell styles — xlsx community edition supports limited styling via cell objects
  // We set number formats via the z property on individual cells

  // Title cell style
  const titleCell = ws['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: 'center' },
    };
  }

  // Header row styling + number formats for data
  const HEADER_STYLE = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0D1116' } },
  };
  const TOTALS_STYLE = {
    font: { bold: true, color: { rgb: 'D4A017' } },
    fill: { fgColor: { rgb: '0D1116' } },
  };

  for (let c = 0; c < numCols; c++) {
    const col = columns[c];
    const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    if (ws[cellAddress]) {
      ws[cellAddress].s = HEADER_STYLE;
    }

    // Number formats for data rows
    let fmt: string | null = null;
    if (col.type === 'currency') fmt = '"$"#,##0.00';
    if (col.type === 'percent') fmt = '0.00%';
    if (col.type === 'number') fmt = '#,##0';
    if (col.type === 'date') fmt = 'mmm d, yyyy';

    if (fmt) {
      for (let r = dataStartIndex; r < dataStartIndex + numDataRows; r++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) ws[addr].z = fmt;
      }
      if (totalsRowIndex !== null) {
        const addr = XLSX.utils.encode_cell({ r: totalsRowIndex, c });
        if (ws[addr]) ws[addr].z = fmt;
      }
    }

    // Totals row styling
    if (totalsRowIndex !== null) {
      const addr = XLSX.utils.encode_cell({ r: totalsRowIndex, c });
      if (ws[addr]) {
        ws[addr].s = TOTALS_STYLE;
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return xlsxBuffer;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function buildPdf(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
  logoUrl?: string,
  companyName?: string,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, PageSizes } = await import('pdf-lib');

  // Colors
  const GOLD   = rgb(0.831, 0.627,  0.09);
  const DARK   = rgb(0.051, 0.067,  0.086);
  const WHITE  = rgb(1,     1,      1);
  const LGRAY  = rgb(0.965, 0.965,  0.965);
  const MGRAY  = rgb(0.85,  0.85,   0.85);

  const pdfDoc = await PDFDocument.create();
  const font      = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Try to embed logo image
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (logoUrl) {
    try {
      const logoRes = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (logoRes.ok) {
        const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
        // Detect PNG vs JPEG by magic bytes
        const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
        logoImage = isPng
          ? await pdfDoc.embedPng(logoBytes)
          : await pdfDoc.embedJpg(logoBytes);
      }
    } catch { /* logo fetch failed — continue without logo */ }
  }

  // Landscape letter
  const PAGE_W = 792;
  const PAGE_H = 612;
  const MARGIN = 36;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const HEADER_H   = 56;
  const SUBHDR_H   = 22;
  const COL_HDR_H  = 20;
  const ROW_H      = 16;
  const FOOTER_H   = 20;

  const brandName = companyName?.trim() || 'SAGUARO CRM';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Column widths — proportional but bounded
  function computeColWidths(cols: ReportColumn[], contentW: number): number[] {
    const BASE = 10;
    const raw = cols.map(col => {
      const headerLen = col.label.length;
      const maxDataLen = rows.reduce((acc, row) => {
        const v = row[col.key];
        return Math.max(acc, v == null ? 0 : Math.min(25, String(v).length));
      }, 0);
      return Math.max(BASE, headerLen, maxDataLen);
    });
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map(w => Math.floor((w / total) * contentW));
  }

  const colWidths = computeColWidths(columns, CONTENT_W);

  // Format a cell value for PDF display
  function formatPdfValue(value: unknown, type: ColumnType): string {
    if (value == null || value === '') return '';
    switch (type) {
      case 'currency': {
        const n = currencyToNumber(value);
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      case 'number': {
        const n = typeof value === 'number' ? value : parseFloat(String(value));
        return isNaN(n) ? String(value) : n.toLocaleString('en-US');
      }
      case 'percent': {
        const raw = String(value).replace('%', '').trim();
        const n = parseFloat(raw);
        return isNaN(n) ? String(value) : `${n.toFixed(2)}%`;
      }
      case 'date': {
        const d = new Date(String(value));
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      default:
        return String(value).slice(0, 25);
    }
  }

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let pageNum = 1;

  function drawPageHeader(p: ReturnType<typeof pdfDoc.addPage>): void {
    // Dark header bar
    p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: DARK });

    let textX = MARGIN;

    // Logo image — draw at left edge of header, vertically centered
    if (logoImage) {
      const logoMaxH = HEADER_H - 12;
      const logoMaxW = 120;
      const scale    = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height);
      const logoW    = logoImage.width  * scale;
      const logoH    = logoImage.height * scale;
      const logoY    = PAGE_H - HEADER_H + (HEADER_H - logoH) / 2;
      p.drawImage(logoImage, { x: MARGIN, y: logoY, width: logoW, height: logoH });
      textX = MARGIN + logoW + 10;
    }

    p.drawText(brandName, { x: textX, y: PAGE_H - HEADER_H + 28, size: 13, font: boldFont, color: GOLD });
    p.drawText(title,     { x: textX, y: PAGE_H - HEADER_H + 13, size: 11, font: boldFont, color: WHITE });

    // Sub-header bar
    p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - SUBHDR_H, width: PAGE_W, height: SUBHDR_H, color: MGRAY });
    p.drawText(`Generated: ${dateStr}`, { x: MARGIN, y: PAGE_H - HEADER_H - SUBHDR_H + 6, size: 8, font, color: DARK });
    p.drawText(`${rows.length} records`, { x: PAGE_W - MARGIN - 70, y: PAGE_H - HEADER_H - SUBHDR_H + 6, size: 8, font, color: DARK });
  }

  function drawColumnHeaders(p: ReturnType<typeof pdfDoc.addPage>, yPos: number): void {
    p.drawRectangle({ x: MARGIN, y: yPos - COL_HDR_H, width: CONTENT_W, height: COL_HDR_H, color: DARK });
    let x = MARGIN + 4;
    for (let i = 0; i < columns.length; i++) {
      const label = columns[i].label.toUpperCase().slice(0, 20);
      p.drawText(label, { x, y: yPos - COL_HDR_H + 5, size: 7, font: boldFont, color: WHITE });
      x += colWidths[i];
    }
  }

  function drawFooter(p: ReturnType<typeof pdfDoc.addPage>, pNum: number): void {
    p.drawLine({ start: { x: MARGIN, y: FOOTER_H + 4 }, end: { x: PAGE_W - MARGIN, y: FOOTER_H + 4 }, thickness: 0.5, color: MGRAY });
    p.drawText(`Page ${pNum}`, { x: MARGIN, y: 6, size: 8, font, color: DARK });
    p.drawText(`Generated by ${brandName} — ${dateStr}`, { x: PAGE_W / 2 - 100, y: 6, size: 8, font, color: DARK });
  }

  // Draw first page header & column headers
  drawPageHeader(page);
  let y = PAGE_H - HEADER_H - SUBHDR_H - 4;
  drawColumnHeaders(page, y);
  y -= COL_HDR_H + 2;

  // Data rows
  let odd = false;
  for (const row of rows) {
    // New page check
    if (y - ROW_H < FOOTER_H + 10) {
      drawFooter(page, pageNum);
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      drawPageHeader(page);
      y = PAGE_H - HEADER_H - SUBHDR_H - 4;
      drawColumnHeaders(page, y);
      y -= COL_HDR_H + 2;
      odd = false;
    }

    if (odd) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: CONTENT_W, height: ROW_H, color: LGRAY });
    }
    odd = !odd;

    let x = MARGIN + 4;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const text = formatPdfValue(row[col.key], col.type);
      page.drawText(text, { x, y: y - ROW_H + 4, size: 8, font, color: DARK });
      x += colWidths[i];
    }
    y -= ROW_H;
  }

  // Totals row
  if (totals && Object.keys(totals).length > 0) {
    if (y - ROW_H < FOOTER_H + 10) {
      drawFooter(page, pageNum);
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      drawPageHeader(page);
      y = PAGE_H - HEADER_H - SUBHDR_H - 4;
    }
    page.drawRectangle({ x: MARGIN, y: y - ROW_H - 2, width: CONTENT_W, height: ROW_H + 4, color: DARK });
    let x = MARGIN + 4;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      let text = '';
      if (col.key in totals) {
        text = formatPdfValue(totals[col.key], col.type);
      } else if (i === 0) {
        text = 'TOTALS';
      }
      page.drawText(text, { x, y: y - ROW_H + 2, size: 8, font: boldFont, color: GOLD });
      x += colWidths[i];
    }
    y -= ROW_H + 4;
  }

  drawFooter(page, pageNum);

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body: ExportBody = await req.json().catch(() => ({} as ExportBody));
    const {
      format = 'csv',
      title = 'Report',
      columns = [],
      rows = [],
      totals,
      logoUrl,
      companyName,
    } = body;

    const safeTitle = title.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '-') || 'report';
    const dateStamp = today();

    // ---- CSV ---------------------------------------------------------------
    if (format === 'csv') {
      const csv = buildCsv(columns, rows, title, totals);
      const filename = `${safeTitle}-${dateStamp}.csv`;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // ---- XLSX --------------------------------------------------------------
    if (format === 'xlsx') {
      const xlsxBuffer = buildXlsx(columns, rows, title, totals, companyName);
      const filename = `${safeTitle}-${dateStamp}.xlsx`;
      return new NextResponse(xlsxBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // ---- PDF ---------------------------------------------------------------
    if (format === 'pdf') {
      const pdfBytes = await buildPdf(columns, rows, title, totals, logoUrl, companyName);
      const filename = `${safeTitle}-${dateStamp}.pdf`;
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[reports/export]', msg);
    return NextResponse.json({ error: 'Export failed', details: msg }, { status: 500 });
  }
}
