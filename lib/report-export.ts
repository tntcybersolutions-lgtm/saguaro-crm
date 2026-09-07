/**
 * lib/report-export.ts
 * Shared server-side export builders (CSV / XLSX / PDF) used by the report
 * export routes. Extracted from app/api/reports/export/route.ts so saved-report
 * and ad-hoc exports share one implementation. Pure functions — no auth / I/O
 * except the optional logo fetch inside buildPdf.
 */
import ExcelJS from 'exceljs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, PageOrientation,
} from 'docx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColumnType = 'text' | 'currency' | 'date' | 'number' | 'badge' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function todayStamp(): string {
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

/**
 * DISPLAY formatting, for documents a person reads rather than a machine parses.
 *
 * Deliberately NOT formatCsvValue: that one emits bare numbers (1234.56, 50) so
 * a spreadsheet or script can consume them. A Word table wants "$1,234.56" and
 * "50%" — the .docx carries no number formats of its own, so whatever is written
 * into the cell is exactly what the reader sees.
 */
function formatCellValue(value: unknown, type: ColumnType): string {
  if (value == null || value === '') return '';
  switch (type) {
    case 'currency': {
      const n = currencyToNumber(value);
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
    case 'number': {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(n) ? String(value) : n.toLocaleString('en-US');
    }
    case 'percent': {
      const raw = String(value).replace('%', '').trim();
      const n = parseFloat(raw);
      if (isNaN(n)) return String(value);
      // tolerate both 0.5 and 50 meaning "50%"
      return (n > 1 ? n : n * 100).toFixed(1).replace(/\.0$/, '') + '%';
    }
    case 'date': {
      const d = new Date(String(value));
      return isNaN(d.getTime())
        ? String(value)
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function buildCsv(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
  companyName?: string,
): string {
  const BOM = '﻿';

  // Optional company/title meta row
  const metaRow = companyName ? `${csvField(companyName)} — ${csvField(title)}\r\n` : '';

  // Header row
  const headerRow = columns.map(c => csvField(c.label)).join(',');

  // Data rows
  const dataRows = rows.map(row =>
    columns.map(col => csvField(formatCsvValue(row[col.key], col.type))).join(','),
  );

  // Totals row
  const parts: string[] = [BOM + metaRow + headerRow, ...dataRows];
  if (totals && Object.keys(totals).length > 0) {
    const totalsRow = columns.map((col, i) => {
      if (col.key in totals) return csvField(String(totals[col.key]));
      if (i === 0) return csvField('TOTALS');
      return '';
    }).join(',');
    parts.push(totalsRow);
  }

  return parts.join('\r\n');
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/**
 * Styled XLSX.
 *
 * REPLACED the xlsx@0.18.5 implementation, whose styling never existed. That
 * build's writer reads only `cell.z` (get_cell_style, xlsx.js:14433) and
 * ignores `cell.s` entirely, so the bold dark headers and gold totals this
 * function used to set were silently discarded on every export — and `!freeze`
 * is not implemented in that build at all. exceljs writes real cell formatting,
 * so what is described below is what the user actually opens.
 *
 * Async because exceljs serialises through a stream. Callers must await.
 */
export async function buildXlsx(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
  companyName?: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName || 'Saguaro Control Systems — Construction Management & Project Controls';
  wb.created = new Date();
  const ws = wb.addWorksheet('Report', {
    views: [{ state: 'frozen', ySplit: 3 }],   // title + spacer + header stay pinned
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const DARK = 'FF0D1116';
  const GOLD = 'FFD4A017';
  const HAIRLINE = 'FFD9DDE3';
  const isNumeric = (t: ColumnType) => t === 'currency' || t === 'number' || t === 'percent';

  // Row 1 - title, merged across the table
  ws.addRow([companyName ? companyName + ' \u2014 ' + title : title]);
  ws.mergeCells(1, 1, 1, Math.max(1, columns.length));
  const titleCell = ws.getCell('A1');
  titleCell.font = { bold: true, size: 14, color: { argb: DARK } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.addRow([]); // Row 2 - breathing room

  // Row 3 - column headers
  const header = ws.addRow(columns.map(c => c.label));
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: DARK } } };
  });
  header.height = 20;

  // Rows 4+ - data, typed so Excel can sum, sort and filter it
  for (const row of rows) {
    ws.addRow(columns.map(col => {
      const val = row[col.key];
      switch (col.type) {
        case 'currency':
          return currencyToNumber(val);
        case 'number': {
          const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
          return isNaN(n) ? (val ?? '') : n;
        }
        case 'percent': {
          const raw = String(val ?? '').replace('%', '').trim();
          const parsed = parseFloat(raw);
          // stored as a fraction so Excel's % format renders it correctly
          return isNaN(parsed) ? (val ?? '') : parsed > 1 ? parsed / 100 : parsed;
        }
        case 'date': {
          if (!val) return '';
          const d = new Date(String(val));
          return isNaN(d.getTime()) ? String(val) : d;
        }
        default:
          return val == null ? '' : String(val);
      }
    }));
  }

  const hasTotals = !!totals && Object.keys(totals).length > 0;
  if (hasTotals) {
    const tr = ws.addRow(columns.map((col, i) => {
      if (col.key in totals!) return totals![col.key];
      if (i === 0) return 'TOTALS';
      return '';
    }));
    tr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: GOLD } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
      cell.border = { top: { style: 'thin', color: { argb: DARK } } };
    });
    tr.height = 18;
  }

  const firstDataRow = 4;
  const lastDataRow = firstDataRow + rows.length - 1;
  columns.forEach((col, i) => {
    const column = ws.getColumn(i + 1);
    const headerLen = col.label.length;
    const widest = rows.reduce((acc, r) => {
      const v = r[col.key];
      return Math.max(acc, v == null ? 0 : String(v).length);
    }, 0);
    column.width = Math.min(40, Math.max(10, headerLen + 2, widest + 2));

    const fmt =
      col.type === 'currency' ? '"$"#,##0.00' :
      col.type === 'percent' ? '0.00%' :
      col.type === 'number' ? '#,##0' :
      col.type === 'date' ? 'mmm d, yyyy' : null;
    if (fmt) {
      const last = hasTotals ? lastDataRow + 1 : lastDataRow;
      for (let r = firstDataRow; r <= last; r++) ws.getCell(r, i + 1).numFmt = fmt;
    }
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      if (isNumeric(col.type)) ws.getCell(r, i + 1).alignment = { horizontal: 'right' };
      ws.getCell(r, i + 1).border = { bottom: { style: 'hair', color: { argb: HAIRLINE } } };
    }
  });

  // Let the reader filter and sort without setting it up first
  if (rows.length > 0) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: lastDataRow, column: columns.length } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Word (.docx) export - the third format the owner asked for, and the one that
 * did not exist anywhere in the app. Built with `docx` rather than an HTML file
 * renamed to .doc, so Word opens a real document with a real table it can
 * restyle - not a web page wearing the wrong extension.
 */
export async function buildDocx(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
  companyName?: string,
): Promise<Buffer> {
  const DARK = '0D1116';
  const GOLD = 'D4A017';
  const isNumeric = (t: ColumnType) => t === 'currency' || t === 'number' || t === 'percent';

  const cell = (
    text: string,
    opts: { bold?: boolean; color?: string; shade?: string; right?: boolean } = {},
  ) =>
    new TableCell({
      shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 18 })],
      })],
    });

  const headerRow = new TableRow({
    // repeats on every page, the same courtesy the paginated PDFs give
    tableHeader: true,
    children: columns.map(c =>
      cell(c.label, { bold: true, color: 'FFFFFF', shade: DARK, right: isNumeric(c.type) })),
  });

  const bodyRows = rows.map(r => new TableRow({
    children: columns.map(c =>
      cell(formatCellValue(r[c.key], c.type), { right: isNumeric(c.type) })),
  }));

  const hasTotals = !!totals && Object.keys(totals).length > 0;
  const totalRows = hasTotals ? [new TableRow({
    children: columns.map((c, i) =>
      cell(
        c.key in totals! ? formatCellValue(totals![c.key], c.type) : i === 0 ? 'TOTALS' : '',
        { bold: true, color: GOLD, shade: DARK, right: isNumeric(c.type) },
      )),
  })] : [];

  const generated = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const doc = new Document({
    creator: companyName || 'Saguaro Control Systems — Construction Management & Project Controls',
    title,
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
      children: [
        new Paragraph({
          children: [new TextRun({
            text: companyName || 'Saguaro Control Systems — Construction Management & Project Controls',
            bold: true, size: 28, color: DARK,
          })],
        }),
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: title, size: 22, color: '5B677A' })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows, ...totalRows],
        }),
        new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({
            text: rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' \u00b7 generated ' + generated,
            size: 16, color: '8094B0',
          })],
        }),
      ],
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function buildPdf(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  title: string,
  totals?: Record<string, number>,
  logoUrl?: string,
  companyName?: string,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const GOLD   = rgb(0.831, 0.627,  0.09);
  const DARK   = rgb(0.051, 0.067,  0.086);
  const WHITE  = rgb(1,     1,      1);
  const LGRAY  = rgb(0.965, 0.965,  0.965);
  const MGRAY  = rgb(0.85,  0.85,   0.85);

  const pdfDoc = await PDFDocument.create();
  const font      = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (logoUrl) {
    try {
      const logoRes = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (logoRes.ok) {
        const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
        const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
        logoImage = isPng
          ? await pdfDoc.embedPng(logoBytes)
          : await pdfDoc.embedJpg(logoBytes);
      }
    } catch { /* logo fetch failed — continue without logo */ }
  }

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
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map(w => Math.floor((w / total) * contentW));
  }

  const colWidths = computeColWidths(columns, CONTENT_W);

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
    p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: DARK });

    let textX = MARGIN;

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

  drawPageHeader(page);
  let y = PAGE_H - HEADER_H - SUBHDR_H - 4;
  drawColumnHeaders(page, y);
  y -= COL_HDR_H + 2;

  let odd = false;
  for (const row of rows) {
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
// Response helpers — turn a built artifact into a downloadable NextResponse body
// ---------------------------------------------------------------------------

export function safeFilename(title: string): string {
  return title.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '-') || 'report';
}

export const EXPORT_CONTENT_TYPE: Record<'csv' | 'xlsx' | 'pdf' | 'docx', string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
