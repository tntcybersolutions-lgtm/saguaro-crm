/**
 * lib/document-templates/exec-report-generator.ts
 *
 * Corporate tabular report PDF — the exec-style rendering behind every
 * report export (/api/reports/export and /api/reports/[id]/export).
 *
 * Layout: tenant letterhead (real logo + tenant accent, typographic fallback),
 * KPI summary band (record count + every summed money column), detailed
 * line-item table with correct columns, right-aligned gold money, zebra rows,
 * repeated headers on every page, dark totals row, and Page X of Y footers.
 */
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import {
  brandDoc,
  resolveBrandingValues,
  drawBrandHeader,
  drawKpiBand,
  stampFooters,
  money,
  INK,
  PAPER,
  MIST,
  SLATE,
  HAIRLINE,
  GOLD,
  type BrandKit,
  type BrandingValues,
  type KpiItem,
} from './report-theme';

export type ExecColumnType = 'text' | 'currency' | 'date' | 'number' | 'badge' | 'percent';

export interface ExecReportColumn {
  key: string;
  label: string;
  type: ExecColumnType;
}

export interface ExecReportInput {
  title: string;
  description?: string;
  columns: ExecReportColumn[];
  rows: Record<string, unknown>[];
  /** Totals per column key. Missing → computed from currency columns (Number() safe). */
  totals?: Record<string, number>;
  /** Tenant to brand for; overrides let a caller pass pre-resolved values. */
  tenantId?: string | null;
  brandingOverride?: Partial<BrandingValues>;
  docLabel?: string;
}

const PAGE_W = 792; // landscape Letter
const PAGE_H = 612;
const M = 36;
const CONTENT_W = PAGE_W - M * 2;
const ROW_H = 16;
const COL_HDR_H = 20;
const FOOTER_CLEAR = 44; // keep clear of the stamped footer
const GOLD_TEXT = rgb(0.72, 0.46, 0.03); // legible gold on paper

const NUMERIC_TYPES = new Set<ExecColumnType>(['currency', 'number', 'percent']);

function fmtCell(value: unknown, type: ExecColumnType): string {
  if (value == null || value === '') return '';
  switch (type) {
    case 'currency':
      return money(typeof value === 'number' ? value : String(value).replace(/[$,\s]/g, ''));
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value);
    }
    case 'percent': {
      const n = parseFloat(String(value).replace('%', '').trim());
      return Number.isFinite(n) ? `${n.toFixed(1)}%` : String(value);
    }
    case 'date': {
      const s = String(value);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m) {
        // Local date-only parsing — never new Date('YYYY-MM-DD') for display.
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    case 'badge':
      return String(value).replace(/[_-]+/g, ' ').toUpperCase().slice(0, 24);
    default:
      return String(value).slice(0, 60);
  }
}

/** Compute currency-column totals from the raw rows when the caller has none. */
export function computeCurrencyTotals(
  columns: ExecReportColumn[],
  rows: Record<string, unknown>[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of columns) {
    if (col.type !== 'currency') continue;
    // Money is NUMERIC-as-TEXT — Number() every cell.
    totals[col.key] = rows.reduce((sum, row) => {
      const raw = row[col.key];
      const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[$,\s]/g, ''));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }
  return totals;
}

export async function generateExecReportPdf(input: ExecReportInput): Promise<Uint8Array> {
  const { title, columns, rows } = input;
  const doc = await PDFDocument.create();

  // Tenant branding first; caller-supplied overrides only fill gaps the tenant
  // record leaves empty (honest — never override the tenant's own identity).
  const resolved = await resolveBrandingValues({ tenantId: input.tenantId });
  const ov = input.brandingOverride ?? {};
  const values = {
    companyName: (resolved.companyName !== 'Saguaro Control Systems — Construction Management & Project Controls' && resolved.companyName)
      ? resolved.companyName
      : (ov.companyName || resolved.companyName),
    logoUrl: resolved.logoUrl || ov.logoUrl || '',
    accentHex: resolved.accentHex || ov.accentHex || '',
  };
  const kit = await brandDoc(doc, { values });

  const totals = (input.totals && Object.keys(input.totals).length > 0)
    ? input.totals
    : computeCurrencyTotals(columns, rows);

  // Column widths — weighted by header + sampled content length.
  const weights = columns.map((col) => {
    const headerLen = col.label.length;
    const maxDataLen = rows.slice(0, 200).reduce((acc, row) => {
      const v = row[col.key];
      return Math.max(acc, v == null ? 0 : Math.min(28, fmtCell(v, col.type).length));
    }, 0);
    return Math.max(9, headerLen, maxDataLen);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const colWidths = weights.map((w) => Math.floor((w / weightSum) * CONTENT_W));

  const drawCellText = (page: PDFPage, text: string, colIdx: number, x: number, y: number, opts: {
    size: number; bold?: boolean; color?: ReturnType<typeof rgb>;
  }) => {
    const font = opts.bold ? kit.bold : kit.reg;
    const w = colWidths[colIdx];
    let s = text;
    while (s.length > 1 && font.widthOfTextAtSize(s, opts.size) > w - 8) s = s.slice(0, -1);
    const numeric = NUMERIC_TYPES.has(columns[colIdx].type);
    const tx = numeric ? x + w - 6 - font.widthOfTextAtSize(s, opts.size) : x + 4;
    page.drawText(s, { x: tx, y, size: opts.size, font, color: opts.color ?? INK });
  };

  const drawColumnHeaders = (page: PDFPage, yTop: number): number => {
    page.drawRectangle({ x: M, y: yTop - COL_HDR_H, width: CONTENT_W, height: COL_HDR_H, color: INK });
    let x = M;
    columns.forEach((col, i) => {
      const label = col.label.toUpperCase().slice(0, 24);
      const numeric = NUMERIC_TYPES.has(col.type);
      const w = colWidths[i];
      const lw = kit.bold.widthOfTextAtSize(label, 7);
      const tx = numeric ? x + w - 6 - lw : x + 4;
      page.drawText(label, { x: tx, y: yTop - COL_HDR_H + 6, size: 7, font: kit.bold, color: PAPER });
      x += w;
    });
    return yTop - COL_HDR_H;
  };

  const newPage = (first: boolean): { page: PDFPage; y: number } => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    let y = drawBrandHeader(page, kit, {
      title,
      docTag: input.docLabel || 'EXECUTIVE REPORT',
      subtitle: first ? (input.description || undefined) : undefined,
    });

    if (first) {
      // KPI summary band: record count + every summed money column (max 4 money KPIs).
      const kpis: KpiItem[] = [{ label: 'Records', value: rows.length.toLocaleString('en-US') }];
      const totalKeys = Object.keys(totals);
      for (const key of totalKeys.slice(0, 4)) {
        const col = columns.find((c) => c.key === key);
        kpis.push({ label: `Total ${col?.label ?? key}`.slice(0, 28), value: money(totals[key]), money: true });
      }
      y = drawKpiBand(page, kit, y, kpis.slice(0, 5));
    }
    y = drawColumnHeaders(page, y);
    return { page, y };
  };

  let { page, y } = newPage(true);
  let odd = false;

  for (const row of rows) {
    if (y - ROW_H < FOOTER_CLEAR) {
      ({ page, y } = newPage(false));
      odd = false;
    }
    if (odd) {
      page.drawRectangle({ x: M, y: y - ROW_H, width: CONTENT_W, height: ROW_H, color: MIST });
    }
    odd = !odd;
    let x = M;
    columns.forEach((col, i) => {
      const text = fmtCell(row[col.key], col.type);
      if (text) {
        const isMoney = col.type === 'currency';
        drawCellText(page, text, i, x, y - ROW_H + 5, {
          size: 8,
          bold: isMoney,
          color: isMoney ? GOLD_TEXT : (col.type === 'date' ? SLATE : INK),
        });
      }
      x += colWidths[i];
    });
    page.drawLine({ start: { x: M, y: y - ROW_H }, end: { x: M + CONTENT_W, y: y - ROW_H }, thickness: 0.25, color: HAIRLINE });
    y -= ROW_H;
  }

  // Totals row — dark band, gold figures.
  const totalKeys = Object.keys(totals);
  if (totalKeys.length > 0 && rows.length > 0) {
    if (y - (ROW_H + 6) < FOOTER_CLEAR) {
      ({ page, y } = newPage(false));
    }
    page.drawRectangle({ x: M, y: y - ROW_H - 6, width: CONTENT_W, height: ROW_H + 6, color: INK });
    let x = M;
    columns.forEach((col, i) => {
      let text = '';
      if (col.key in totals) text = fmtCell(totals[col.key], col.type === 'currency' ? 'currency' : 'number');
      else if (i === 0) text = 'TOTALS';
      if (text) {
        const w = colWidths[i];
        const numeric = NUMERIC_TYPES.has(col.type) || i !== 0;
        let s = text;
        while (s.length > 1 && kit.bold.widthOfTextAtSize(s, 8) > w - 8) s = s.slice(0, -1);
        const tx = i === 0 ? x + 4 : (numeric ? x + w - 6 - kit.bold.widthOfTextAtSize(s, 8) : x + 4);
        page.drawText(s, { x: tx, y: y - ROW_H + 1, size: 8, font: kit.bold, color: i === 0 ? PAPER : GOLD });
      }
      x += colWidths[i];
    });
  }

  if (rows.length === 0) {
    page.drawText('No records matched this report definition.', { x: M, y: y - 24, size: 9, font: kit.reg, color: SLATE });
  }

  stampFooters(doc, kit, input.docLabel || 'Executive Report');
  return doc.save();
}

// Re-export the branding resolver so report routes have one import surface.
export { resolveBrandingValues } from './report-theme';
export type { BrandKit };
