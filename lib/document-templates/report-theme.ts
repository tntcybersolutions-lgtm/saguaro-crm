/**
 * lib/document-templates/report-theme.ts
 *
 * Shared EXEC-REPORT foundation for every generated document and report PDF.
 * One place owns the corporate look: tenant letterhead (real logo + tenant
 * accent color), KPI summary bands, and page footers (Page X of Y, generated
 * date, company name) — so every generator renders the same corporate system.
 *
 * Branding is ALWAYS tenant-first: the tenant's own company name, logo and
 * primary color (tenants.settings.{company_name,logo_url,primary_color}).
 * Honest fallbacks only — when a tenant has no logo we render a clean
 * typographic letterhead with the company name; we never fabricate a mark.
 *
 * Money is NUMERIC-as-TEXT server-side — num()/money() Number() everything,
 * and effectiveTotal() implements the house rule that a stale 0 total defers
 * to amount + tax. Colours come from lib/document-palette (white paper, navy
 * ink, the app's cyan-blue deepened for print) — the same palette the HTML
 * print documents use.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { DOC_HEX, type DocRole } from '../document-palette';

export type ThemeRGB = ReturnType<typeof rgb>;

// ─── Document palette (lib/document-palette) ────────────────────────────────
function rgbOf(hex: string): ThemeRGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
/** Every document colour by role, as pdf-lib colours. Generators use these, never rgb(). */
export const DOC = Object.fromEntries(Object.entries(DOC_HEX).map(([k, v]) => [k, rgbOf(v)])) as Record<DocRole, ThemeRGB>;
export const GOLD = DOC.accent;     // accent fallback (name kept for callers)
export const INK = DOC.ink;         // letterhead band and figures
export const PAPER = DOC.paper;
export const SLATE = DOC.muted;     // labels
export const FAINT = DOC.faint;     // footer text
export const MIST = DOC.zebra;      // zebra / KPI fill
export const HAIRLINE = DOC.rule;

// ─── Money + date helpers (NUMERIC-as-TEXT safe) ─────────────────────────────
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** House rule: a 0/blank stored total defers to amount + tax. */
export function effectiveTotal(total: unknown, amount: unknown, tax: unknown): number {
  const t = num(total);
  return t > 0 ? t : num(amount) + num(tax);
}

export function money(v: unknown): string {
  return '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Local date-only parsing — never new Date('YYYY-MM-DD') for display. */
export function fmtDateLocal(v?: string | Date | null): string {
  if (!v) return '';
  if (v instanceof Date) {
    return v.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Tenant branding resolution ──────────────────────────────────────────────
export interface BrandingValues {
  companyName: string;
  logoUrl: string;
  accentHex: string; // '' when the tenant has not set a color
}

function safeHex(v: unknown): string {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) ? v.trim() : '';
}

export function hexToRgb01(hex: string): ThemeRGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Resolve the tenant's branding values (name / logo / color) with honest
 * fallbacks. Accepts a tenantId directly, or a projectId to derive it.
 */
export async function resolveBrandingValues(opts: {
  tenantId?: string | null;
  projectId?: string | null;
}): Promise<BrandingValues> {
  const fallback: BrandingValues = { companyName: 'Saguaro Control Systems', logoUrl: '', accentHex: '' };
  try {
    const { createServerClient } = await import('../supabase-server');
    const db = createServerClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    let tenantId = opts.tenantId || null;
    if (!tenantId && opts.projectId) {
      const { data: p } = await db.from('projects').select('tenant_id').eq('id', opts.projectId).maybeSingle();
      tenantId = p?.tenant_id || null;
    }
    if (!tenantId) return fallback;
    const { data: tenant } = await db.from('tenants').select('name, settings').eq('id', tenantId).maybeSingle();
    if (!tenant) return fallback;
    const s = (tenant.settings && typeof tenant.settings === 'object') ? tenant.settings : {};
    return {
      companyName: (typeof s.company_name === 'string' && s.company_name.trim()) || tenant.name || fallback.companyName,
      logoUrl: typeof s.logo_url === 'string' ? s.logo_url : '',
      accentHex: safeHex(s.primary_color),
    };
  } catch {
    return fallback;
  }
}

// ─── Brand kit (per-document: fonts + embedded logo) ─────────────────────────
export interface BrandKit {
  companyName: string;
  accent: ThemeRGB; // tenant primary color, document accent fallback (on paper)
  bandAccent: ThemeRGB; // tenant primary color, the app's title cyan fallback (on the navy band)
  logo: { img: import('pdf-lib').PDFImage; w: number; h: number } | null;
  reg: PDFFont;
  bold: PDFFont;
}

/** Best-effort logo embed — pdf-lib supports PNG/JPG; anything else stays typographic. */
async function embedLogo(doc: PDFDocument, logoUrl: string): Promise<BrandKit['logo']> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const url = logoUrl.toLowerCase();
    const isPng = (bytes[0] === 0x89 && bytes[1] === 0x50) || ct.includes('png') || url.endsWith('.png');
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    return { img, w: img.width, h: img.height };
  } catch {
    return null;
  }
}

/**
 * Build the brand kit for one PDF document: resolves the tenant's branding,
 * embeds the standard fonts and (when present) the tenant's real logo.
 */
export async function brandDoc(
  doc: PDFDocument,
  opts: { tenantId?: string | null; projectId?: string | null; values?: BrandingValues },
): Promise<BrandKit> {
  const values = opts.values ?? await resolveBrandingValues(opts);
  const [reg, bold, logo] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    embedLogo(doc, values.logoUrl),
  ]);
  return {
    companyName: values.companyName,
    accent: values.accentHex ? hexToRgb01(values.accentHex) : GOLD,
    bandAccent: values.accentHex ? hexToRgb01(values.accentHex) : DOC.accentOnBand,
    logo,
    reg,
    bold,
  };
}

// ─── Corporate letterhead header ─────────────────────────────────────────────
export const HEADER_BAND_H = 44;

/**
 * Draw the corporate letterhead band across the top of a page:
 * charcoal band, tenant logo (or typographic company wordmark), document
 * title, optional right-aligned tag (doc number), accent rule, and an
 * optional subtitle line beneath. Returns the y where content may start.
 */
export function drawBrandHeader(
  page: PDFPage,
  kit: BrandKit,
  opts: { title: string; docTag?: string; subtitle?: string },
): number {
  const { width, height } = page.getSize();
  const M = 36;

  // Band + accent rule
  page.drawRectangle({ x: 0, y: height - HEADER_BAND_H, width, height: HEADER_BAND_H, color: INK });
  page.drawRectangle({ x: 0, y: height - HEADER_BAND_H - 2.5, width, height: 2.5, color: kit.accent });

  let textX = M;
  if (kit.logo) {
    const lh = Math.min(28, HEADER_BAND_H - 12);
    const lw = Math.min(120, (kit.logo.w * lh) / kit.logo.h);
    page.drawImage(kit.logo.img, { x: M, y: height - HEADER_BAND_H + (HEADER_BAND_H - lh) / 2, width: lw, height: lh });
    textX = M + lw + 12;
  }

  // Typographic letterhead: company wordmark above the doc title.
  const wordmark = kit.companyName.toUpperCase().slice(0, 60);
  page.drawText(wordmark, { x: textX, y: height - 16, size: 8, font: kit.bold, color: kit.bandAccent });
  page.drawText(opts.title.slice(0, 90), { x: textX, y: height - 32, size: 12.5, font: kit.bold, color: PAPER });

  if (opts.docTag) {
    const tag = opts.docTag.slice(0, 40);
    const tw = kit.bold.widthOfTextAtSize(tag, 10);
    page.drawText(tag, { x: width - M - tw, y: height - 28, size: 10, font: kit.bold, color: kit.bandAccent });
  }

  let contentY = height - HEADER_BAND_H - 16;
  if (opts.subtitle) {
    page.drawText(opts.subtitle.slice(0, 130), { x: M, y: contentY, size: 8, font: kit.reg, color: SLATE });
    contentY -= 16;
  }
  return contentY;
}

// ─── KPI summary band ────────────────────────────────────────────────────────
export interface KpiItem {
  label: string;
  value: string;
  money?: boolean; // money values: accent bar, navy figure
}

/**
 * Draw a row of KPI cells (label over value). Money values render gold.
 * Returns the y beneath the band.
 */
export function drawKpiBand(
  page: PDFPage,
  kit: BrandKit,
  y: number,
  kpis: KpiItem[],
  opts?: { x?: number; width?: number },
): number {
  if (kpis.length === 0) return y;
  const { width: pageW } = page.getSize();
  const x0 = opts?.x ?? 36;
  const bandW = opts?.width ?? pageW - x0 * 2;
  const GAP = 8;
  const H = 38;
  const cellW = (bandW - GAP * (kpis.length - 1)) / kpis.length;

  kpis.forEach((kpi, i) => {
    const cx = x0 + i * (cellW + GAP);
    page.drawRectangle({ x: cx, y: y - H, width: cellW, height: H, color: MIST, borderColor: HAIRLINE, borderWidth: 0.75 });
    page.drawRectangle({ x: cx, y: y - H, width: 2.5, height: H, color: kpi.money ? GOLD : kit.accent });
    page.drawText(kpi.label.toUpperCase().slice(0, 30), { x: cx + 9, y: y - 13, size: 6.5, font: kit.bold, color: SLATE });
    // Value auto-shrinks to fit the cell.
    let size = 12.5;
    const val = kpi.value.slice(0, 40);
    while (size > 7 && kit.bold.widthOfTextAtSize(val, size) > cellW - 16) size -= 0.5;
    page.drawText(val, { x: cx + 9, y: y - 30, size, font: kit.bold, color: INK });
  });
  return y - H - 10;
}

// ─── Page footers (Page X of Y • generated date • company) ───────────────────
/**
 * Stamp the corporate footer on EVERY page of the document. Call once, after
 * all content pages exist and immediately before doc.save().
 */
export function stampFooters(doc: PDFDocument, kit: BrandKit, docLabel?: string): void {
  const pages = doc.getPages();
  const total = pages.length;
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const center = [kit.companyName, docLabel].filter(Boolean).join(' • ');

  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const M = 36;
    page.drawLine({ start: { x: M, y: 30 }, end: { x: width - M, y: 30 }, thickness: 0.5, color: HAIRLINE });
    page.drawText(`Page ${i + 1} of ${total}`, { x: M, y: 19, size: 7, font: kit.reg, color: FAINT });
    const cw = kit.reg.widthOfTextAtSize(center, 7);
    page.drawText(center.slice(0, 110), { x: Math.max(M + 70, (width - cw) / 2), y: 19, size: 7, font: kit.reg, color: FAINT });
    const right = `Generated ${dateStr}`;
    const rw = kit.reg.widthOfTextAtSize(right, 7);
    page.drawText(right, { x: width - M - rw, y: 19, size: 7, font: kit.reg, color: FAINT });
  });
}
