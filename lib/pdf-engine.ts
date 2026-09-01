/**
 * lib/pdf-engine.ts
 * Complete PDF generation engine for Saguaro Control Systems
 * Generates: G702, G703, G704, G706, A310, A312, Lien Waivers, Bid Jackets, WH-347, Closeout
 */
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { createServerClient } from './supabase-server';
import type { Database } from '@/lib/database.types';

export { PageSizes, StandardFonts, rgb, PDFDocument };

let _supabaseAdmin: ReturnType<typeof createServerClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createServerClient();
  return _supabaseAdmin;
}

// ─── Color constants ─────────────────────────────────────────────────────────
const GOLD  = rgb(0.831, 0.627, 0.090);
const DARK  = rgb(0.051, 0.067, 0.086);
const GRAY  = rgb(0.4,   0.4,   0.4);
const LGRAY = rgb(0.94,  0.94,  0.94);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

// ─── Tenant branding (white-label) ───────────────────────────────────────────
// Documents default to Saguaro. On the white-label tier the tenant's brand
// color replaces the gold accent, their company name replaces "Saguaro" in the
// footer, and their logo (PNG/JPG) is drawn in the letterhead.
export interface DocBranding {
  companyName: string;
  accent: ReturnType<typeof rgb>;
  logoUrl: string;
  whiteLabel: boolean;
}
const SAGUARO_BRANDING: DocBranding = { companyName: 'Saguaro', accent: GOLD, logoUrl: '', whiteLabel: false };

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Resolve a tenant's document branding. Returns Saguaro defaults unless the
 *  tenant is on the white-label tier (design_addon_subscriptions). */
export async function resolveBranding(tenantId?: string | null): Promise<DocBranding> {
  if (!tenantId) return SAGUARO_BRANDING;
  try {
    const db = getSupabaseAdmin();
    const [{ data: tenant }, { data: addon }] = await Promise.all([
      db.from('tenants').select('name, settings').eq('id', tenantId).single(),
      db.from('design_addon_subscriptions').select('white_label_enabled, status').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    const wl = !!(addon as any)?.white_label_enabled && (addon as any)?.status !== 'canceled';
    if (!wl) return SAGUARO_BRANDING;
    const s = (tenant as any)?.settings ?? {};
    const raw = typeof s.primary_color === 'string' ? s.primary_color.trim() : '';
    const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : null;
    return {
      companyName: s.company_name || (tenant as any)?.name || 'Company',
      accent: hex ? hexToRgb(hex) : GOLD,
      logoUrl: typeof s.logo_url === 'string' ? s.logo_url : '',
      whiteLabel: true,
    };
  } catch {
    return SAGUARO_BRANDING;
  }
}

// Best-effort logo embed (pdf-lib supports PNG/JPG only; SVG/WEBP are skipped).
async function embedLogo(doc: PDFDocument, branding: DocBranding): Promise<{ img: any; w: number; h: number } | null> {
  if (!branding.whiteLabel || !branding.logoUrl) return null;
  try {
    const res = await fetch(branding.logoUrl);
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const url = branding.logoUrl.toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    let img: any;
    if (ct.includes('png') || url.endsWith('.png')) img = await doc.embedPng(bytes);
    else if (ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g$/.test(url)) img = await doc.embedJpg(bytes);
    else return null;
    return { img, w: img.width, h: img.height };
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function fmtCurrency(n: number): string {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function baseFonts(doc: PDFDocument) {
  return {
    reg:  await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

function drawBox(page: any, x: number, y: number, w: number, h: number, fill = LGRAY, border = GRAY) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: border, borderWidth: 0.5 });
}

function drawText(page: any, text: string, x: number, y: number, size: number, font: any, color = BLACK) {
  page.drawText(String(text ?? '').slice(0, 120), { x, y, size, font, color });
}

function fieldBox(page: any, label: string, value: string, x: number, y: number, w: number, reg: any, bold: any) {
  drawBox(page, x, y - 20, w, 20);
  drawText(page, label, x + 3, y - 8,  7, reg,  GRAY);
  drawText(page, value,  x + 3, y - 18, 9, bold, DARK);
}

function headerBar(page: any, title: string, subtitle: string, bold: any, reg: any, branding: DocBranding = SAGUARO_BRANDING) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 32, width, height: 32, color: DARK });
  drawText(page, (branding.whiteLabel ? branding.companyName : 'SAGUARO').toUpperCase(), 10, height - 20, 11, bold, branding.accent);
  drawText(page, title,     80, height - 20, 11, bold, WHITE);
  drawText(page, subtitle, 10, height - 46, 9, reg, GRAY);
}

function footerText(page: any, reg: any, branding: DocBranding = SAGUARO_BRANDING) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 36, y: 36 }, end: { x: width - 36, y: 36 }, color: LGRAY, thickness: 0.5 });
  const who = branding.whiteLabel ? branding.companyName : 'Saguaro Control Systems';
  drawText(page, `Generated by ${who} — ${new Date().toLocaleDateString()}`, 36, 22, 7, reg, GRAY);
  if (!branding.whiteLabel) drawText(page, 'saguarocrm.com', width - 90, 22, 7, reg, GRAY);
}

// Word-wrap helpers (measure with the embedded font). drawWrapped returns the
// new y cursor after the paragraph.
function wrapLines(text: string, font: any, size: number, maxW: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && font.widthOfTextAtSize(t, size) > maxW) { lines.push(cur); cur = w; }
    else { cur = t; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawWrapped(page: any, text: string, x: number, y: number, maxW: number, size: number, font: any, color: any, lh: number): number {
  for (const ln of wrapLines(text, font, size, maxW)) {
    page.drawText(ln, { x, y, size, font, color });
    y -= lh;
  }
  return y;
}

// ─── Project Context ──────────────────────────────────────────────────────────
export async function getProjectContext(projectId: string) {
  try {
    const [
      { data: project },
      { data: subs },
      { data: changeOrders },
      { data: priorPayApps },
      { data: lienWaivers },
    ] = await Promise.all([
      getSupabaseAdmin().from('projects').select('*').eq('id', projectId).single(),
      getSupabaseAdmin().from('subcontractors').select('*').eq('project_id', projectId),
      getSupabaseAdmin().from('change_orders').select('*').eq('project_id', projectId).eq('status', 'approved'),
      getSupabaseAdmin().from('pay_applications').select('*').eq('project_id', projectId).order('app_number', { ascending: false }),
      getSupabaseAdmin().from('lien_waivers').select('*').eq('project_id', projectId),
    ]);

    const p = project as any;
    const cos = (changeOrders as any[]) || [];
    const apps = (priorPayApps as any[]) || [];
    const contractSumToDate = (p?.contract_amount || 0) + cos.reduce((s: number, co: any) => s + (co.cost_impact || 0), 0);
    const lastAppNumber = apps[0]?.app_number || 0;
    const totalCompletedToDate = apps[0] ? (apps[0].prev_completed || 0) + (apps[0].this_period || 0) : 0;

    return {
      project: p || null,
      subs: (subs as any[]) || [],
      changeOrders: cos,
      priorPayApps: apps,
      lienWaivers: (lienWaivers as any[]) || [],
      lastAppNumber,
      contractSumToDate,
      totalCompletedToDate,
      owner: p?.owner_entity || { name: 'Owner', address: '' },
      architect: p?.architect_entity || { name: 'Architect', address: '' },
    };
  } catch {
    return {
      project: null, subs: [], changeOrders: [], priorPayApps: [], lienWaivers: [],
      lastAppNumber: 0, contractSumToDate: 0, totalCompletedToDate: 0,
      owner: { name: 'Owner', address: '' }, architect: { name: 'Architect', address: '' },
    };
  }
}

// ─── G702 — AIA Pay Application Cover ────────────────────────────────────────
export async function generateG702(input: {
  projectName: string; projectAddress: string;
  ownerName: string; architectName: string; gcName: string;
  appNumber: number; periodFrom: string; periodTo: string;
  contractSum: number; changeOrdersTotal: number; contractSumToDate: number;
  prevCompleted: number; thisPeriod: number; materialsStored: number;
  totalCompleted: number; percentComplete: number;
  retainagePercent: number; retainageAmount: number;
  totalEarnedLessRetainage: number; prevPayments: number; currentPaymentDue: number;
  branding?: DocBranding;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);
  const branding = input.branding ?? SAGUARO_BRANDING;
  const accent = branding.accent;
  const logo = await embedLogo(doc, branding);

  // Header — tenant logo (left) + title beside it on the white-label tier.
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  let titleX = 36;
  if (logo) {
    const lh = 34, lw = Math.min(140, logo.w * lh / logo.h);
    page.drawImage(logo.img, { x: 36, y: height - 48, width: lw, height: lh });
    titleX = 36 + lw + 16;
  }
  drawText(page, 'AIA DOCUMENT G702', titleX, height - 22, 14, bold, accent);
  drawText(page, 'APPLICATION AND CERTIFICATE FOR PAYMENT', titleX, height - 40, 10, reg, WHITE);
  drawText(page, `Application No. ${input.appNumber}`, width - 150, height - 22, 10, bold, accent);

  let y = height - 80;

  // Project info fields
  fieldBox(page, 'TO OWNER:', input.ownerName, 36, y, 220, reg, bold);
  fieldBox(page, 'FROM CONTRACTOR:', input.gcName, 270, y, 220, reg, bold);
  fieldBox(page, 'ARCHITECT:', input.architectName, 504, y, 72, reg, bold);
  y -= 30;
  fieldBox(page, 'PROJECT:', input.projectName, 36, y, 220, reg, bold);
  fieldBox(page, 'CONTRACT DATE:', fmtDate(input.periodFrom), 270, y, 110, reg, bold);
  fieldBox(page, 'CONTRACT FOR:', 'General Construction', 394, y, 182, reg, bold);
  y -= 30;
  fieldBox(page, 'PERIOD FROM:', fmtDate(input.periodFrom), 36, y, 150, reg, bold);
  fieldBox(page, 'PERIOD TO:', fmtDate(input.periodTo), 200, y, 150, reg, bold);

  y -= 45;
  drawText(page, 'CONTRACTOR\'S APPLICATION FOR PAYMENT', 36, y, 11, bold, DARK);

  y -= 20;
  const rows = [
    ['1. Original Contract Sum',                          fmtCurrency(input.contractSum)],
    ['2. Net Change by Change Orders',                    fmtCurrency(input.changeOrdersTotal)],
    ['3. Contract Sum to Date (1±2)',                     fmtCurrency(input.contractSumToDate)],
    ['4. Total Completed & Stored to Date',               fmtCurrency(input.totalCompleted)],
    ['   a. Work Completed (Previous)',                   fmtCurrency(input.prevCompleted)],
    ['   b. Work Completed (This Period)',                fmtCurrency(input.thisPeriod)],
    ['   c. Materials Stored',                           fmtCurrency(input.materialsStored)],
    ['5. Retainage:',                                    ''],
    [`   ${input.retainagePercent}% of Completed Work`,  fmtCurrency(input.retainageAmount)],
    ['6. Total Earned Less Retainage (4-5)',             fmtCurrency(input.totalEarnedLessRetainage)],
    ['7. Less Previous Certificates for Payment',        fmtCurrency(input.prevPayments)],
    ['8. CURRENT PAYMENT DUE (6-7)',                    fmtCurrency(input.currentPaymentDue)],
  ];

  rows.forEach(([label, val], i) => {
    const rowY = y - i * 22;
    const isBold = label.includes('8.') || label.includes('3.') || label.includes('6.');
    if (isBold) page.drawRectangle({ x: 36, y: rowY - 14, width: 504, height: 20, color: LGRAY });
    drawText(page, label, 40, rowY - 5, 9, isBold ? bold : reg, DARK);
    drawText(page, val, width - 130, rowY - 5, 9, isBold ? bold : reg, DARK);
    page.drawLine({ start: { x: 36, y: rowY - 14 }, end: { x: width - 36, y: rowY - 14 }, color: LGRAY, thickness: 0.3 });
  });

  y -= rows.length * 22 + 30;

  // Signature blocks
  drawText(page, 'CONTRACTOR\'S CERTIFICATION', 36, y, 10, bold, DARK);
  y -= 16;
  drawText(page, 'The undersigned Contractor certifies that to the best of the Contractor\'s knowledge, information and', 36, y, 8, reg, GRAY);
  y -= 12;
  drawText(page, 'belief the Work covered by this Application for Payment has been completed in accordance with the', 36, y, 8, reg, GRAY);
  y -= 12;
  drawText(page, 'Contract Documents, that all amounts have been paid by the Contractor for Work for which previous', 36, y, 8, reg, GRAY);
  y -= 12;
  drawText(page, 'Certificates for Payment were issued and payments received from the Owner.', 36, y, 8, reg, GRAY);

  y -= 35;
  page.drawLine({ start: { x: 36, y }, end: { x: 270, y }, color: DARK, thickness: 0.5 });
  drawText(page, 'Contractor Signature', 36, y - 14, 8, reg, GRAY);
  page.drawLine({ start: { x: 310, y }, end: { x: 540, y }, color: DARK, thickness: 0.5 });
  drawText(page, 'Date', 310, y - 14, 8, reg, GRAY);

  footerText(page, reg, branding);
  return await doc.save();
}

// ─── G703 — Schedule of Values Continuation ──────────────────────────────────
export async function generateG703(input: {
  projectName: string; appNumber: number; periodTo: string;
  lineItems: Array<{
    lineNumber: number; description: string; scheduledValue: number;
    workFromPrev: number; workThisPeriod: number; materialsStored: number;
    totalCompleted: number; percentComplete: number; balanceToFinish: number; retainage: number;
  }>;
  branding?: DocBranding;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  /* `let`: the continuation sheet PAGINATES. It used to stop dead at
   * `if (y < 60) return;` — a schedule of values longer than one page simply
   * lost its remaining lines, silently, on the document that backs a pay
   * application. */
  let page = doc.addPage([792, 612]); // Landscape Letter
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);
  const g703Pages: any[] = [page];
  const branding = input.branding ?? SAGUARO_BRANDING;
  const accent = branding.accent;
  const logo = await embedLogo(doc, branding);

  page.drawRectangle({ x: 0, y: height - 40, width, height: 40, color: DARK });
  let titleX = 36;
  if (logo) {
    const lh = 26, lw = Math.min(120, logo.w * lh / logo.h);
    page.drawImage(logo.img, { x: 36, y: height - 33, width: lw, height: lh });
    titleX = 36 + lw + 14;
  }
  drawText(page, 'AIA G703 — CONTINUATION SHEET', titleX, height - 22, 12, bold, accent);
  drawText(page, `${input.projectName} | Application No. ${input.appNumber} | Period To: ${fmtDate(input.periodTo)}`, titleX, height - 36, 8, reg, WHITE);

  const cols = [
    { label: 'A\nItem No', x: 36,  w: 30 },
    { label: 'B\nDescription', x: 66, w: 180 },
    { label: 'C\nScheduled Value', x: 246, w: 70 },
    { label: 'D\nPrev Work', x: 316, w: 65 },
    { label: 'E\nThis Period', x: 381, w: 65 },
    { label: 'F\nStored', x: 446, w: 60 },
    { label: 'G\nTotal Complete', x: 506, w: 70 },
    { label: 'H\n%', x: 576, w: 35 },
    { label: 'I\nBalance', x: 611, w: 65 },
    { label: 'J\nRetainage', x: 676, w: 80 },
  ];

  let y = height - 55;
  /** Column header strip — repeated on every continuation sheet. */
  const drawG703Heads = () => {
    cols.forEach(col => {
      drawBox(page, col.x, y - 24, col.w, 24, LGRAY);
      const lines = col.label.split('\n');
      drawText(page, lines[0], col.x + 2, y - 10, 7, bold, DARK);
      drawText(page, lines[1], col.x + 2, y - 20, 6, reg,  GRAY);
    });
    y -= 30;
  };
  drawG703Heads();

  /* Break BEFORE a row that will not fit, reserving 90pt so the totals row is
   * never orphaned from the last line item it sums. This replaced
   * `if (y < 60) return;`, which abandoned every remaining line of the schedule
   * of values without a word — on the sheet that backs a pay application. */
  const g703Room = (needed: number) => {
    if (y - needed >= 90) return;
    page = doc.addPage([792, 612]);
    g703Pages.push(page);
    page.drawRectangle({ x: 0, y: height - 40, width, height: 40, color: DARK });
    drawText(page, 'AIA G703 — CONTINUATION SHEET (CONTINUED)', 36, height - 22, 12, bold, accent);
    drawText(page, `${input.projectName} | Application No. ${input.appNumber}`, 36, height - 36, 8, reg, WHITE);
    y = height - 55;
    drawG703Heads();
  };

  input.lineItems.forEach((item, i) => {
    g703Room(14);
    const bg = i % 2 === 0 ? WHITE : LGRAY;
    page.drawRectangle({ x: 36, y: y - 14, width: width - 72, height: 14, color: bg });
    drawText(page, String(item.lineNumber), 38, y - 11, 7, reg, DARK);
    drawText(page, item.description, 68, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.scheduledValue),   248, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.workFromPrev),     318, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.workThisPeriod),   383, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.materialsStored),  448, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.totalCompleted),   508, y - 11, 7, reg, DARK);
    drawText(page, `${item.percentComplete.toFixed(0)}%`, 578, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.balanceToFinish),  613, y - 11, 7, reg, DARK);
    drawText(page, fmtCurrency(item.retainage),        678, y - 11, 7, reg, DARK);
    y -= 14;
  });

  // Totals row
  const totals = input.lineItems.reduce((acc, item) => ({
    sv: acc.sv + item.scheduledValue,
    prev: acc.prev + item.workFromPrev,
    curr: acc.curr + item.workThisPeriod,
    stored: acc.stored + item.materialsStored,
    total: acc.total + item.totalCompleted,
    bal: acc.bal + item.balanceToFinish,
    ret: acc.ret + item.retainage,
  }), { sv: 0, prev: 0, curr: 0, stored: 0, total: 0, bal: 0, ret: 0 });

  page.drawRectangle({ x: 36, y: y - 16, width: width - 72, height: 16, color: DARK });
  drawText(page, 'TOTALS', 68, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.sv),    248, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.prev),  318, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.curr),  383, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.stored),448, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.total), 508, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.bal),   613, y - 12, 8, bold, WHITE);
  drawText(page, fmtCurrency(totals.ret),   678, y - 12, 8, bold, WHITE);

  footerText(page, reg, branding);
  return await doc.save();
}

// ─── G704 — Substantial Completion Certificate ────────────────────────────────
export async function generateG704(input: {
  projectName: string; projectAddress: string;
  ownerName: string; architectName: string; gcName: string;
  contractDate: string; completionDate: string;
  contractSum: number; punchListItems?: string[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage(PageSizes.Letter);
  const g704Pages: any[] = [page]; // every sheet this document grows, for page stamping
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);

  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  drawText(page, 'AIA DOCUMENT G704', 36, height - 22, 14, bold, GOLD);
  drawText(page, 'CERTIFICATE OF SUBSTANTIAL COMPLETION', 36, height - 40, 10, reg, WHITE);

  let y = height - 80;
  fieldBox(page, 'PROJECT:', input.projectName, 36, y, 300, reg, bold);
  fieldBox(page, 'CONTRACT DATE:', fmtDate(input.contractDate), 350, y, 200, reg, bold);
  y -= 30;
  fieldBox(page, 'OWNER:', input.ownerName, 36, y, 200, reg, bold);
  fieldBox(page, 'CONTRACTOR:', input.gcName, 250, y, 200, reg, bold);
  fieldBox(page, 'ARCHITECT:', input.architectName, 464, y, 110, reg, bold);
  y -= 40;

  drawText(page, 'DEFINITION OF SUBSTANTIAL COMPLETION', 36, y, 10, bold, DARK);
  y -= 16;
  const defText = 'Substantial Completion is the stage in the progress of the Work when the Work or designated portion thereof is sufficiently complete in accordance with the Contract Documents so that the Owner can occupy or utilize the Work for its intended use.';
  const words = defText.split(' ');
  let line = '';
  words.forEach(word => {
    if ((line + word).length > 85) {
      drawText(page, line, 36, y, 9, reg, GRAY);
      y -= 13;
      line = word + ' ';
    } else {
      line += word + ' ';
    }
  });
  if (line) { drawText(page, line, 36, y, 9, reg, GRAY); y -= 13; }

  y -= 20;
  page.drawRectangle({ x: 36, y: y - 30, width: width - 72, height: 30, color: LGRAY, borderColor: GOLD, borderWidth: 1 });
  drawText(page, 'DATE OF SUBSTANTIAL COMPLETION:', 46, y - 12, 9, reg, GRAY);
  drawText(page, fmtDate(input.completionDate), 250, y - 12, 12, bold, DARK);

  y -= 60;
  if (input.punchListItems && input.punchListItems.length > 0) {
    drawText(page, 'PUNCH LIST ITEMS TO COMPLETE:', 36, y, 10, bold, DARK);
    y -= 16;
    /* Was `.slice(0, 10)`. A Certificate of Substantial Completion whose punch
     * list quietly stops at ten items understates what is still owed on the
     * job. All items are listed; the signature blocks need ~110pt beneath, so
     * the list continues on a second sheet rather than running under them. */
    input.punchListItems.forEach(item => {
      if (y < 150) {
        page = doc.addPage(PageSizes.Letter);
        g704Pages.push(page);
        headerBar(page, 'CERTIFICATE OF SUBSTANTIAL COMPLETION (CONTINUED)', input.projectName, bold, reg);
        y = height - 90;
        drawText(page, 'PUNCH LIST ITEMS TO COMPLETE (CONTINUED):', 36, y, 10, bold, DARK);
        y -= 16;
      }
      drawText(page, `• ${item}`, 46, y, 9, reg, DARK);
      y -= 14;
    });
  }

  y -= 30;
  // Signature blocks
  [['ARCHITECT', input.architectName], ['OWNER', input.ownerName], ['CONTRACTOR', input.gcName]].forEach(([role, name], i) => {
    const bx = 36 + i * 180;
    page.drawLine({ start: { x: bx, y }, end: { x: bx + 160, y }, color: DARK, thickness: 0.5 });
    drawText(page, name, bx, y - 12, 8, bold, DARK);
    drawText(page, role, bx, y - 22, 7, reg, GRAY);
    drawText(page, `Date: _______________`, bx, y - 36, 7, reg, GRAY);
  });

  footerText(page, reg);
  return await doc.save();
}

// ─── G706 — Contractor's Affidavit of Payment ────────────────────────────────
export async function generateG706(input: {
  projectName: string; projectAddress: string;
  ownerName: string; gcName: string; gcAddress: string;
  finalAmount: number; completionDate: string;
  allWaiversReceived: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);

  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  drawText(page, 'AIA DOCUMENT G706', 36, height - 22, 14, bold, GOLD);
  drawText(page, 'CONTRACTOR\'S AFFIDAVIT OF PAYMENT OF DEBTS AND CLAIMS', 36, height - 40, 9, reg, WHITE);

  let y = height - 80;
  fieldBox(page, 'PROJECT:', input.projectName, 36, y, 300, reg, bold);
  fieldBox(page, 'FINAL CONTRACT AMOUNT:', fmtCurrency(input.finalAmount), 350, y, 206, reg, bold);
  y -= 30;
  fieldBox(page, 'OWNER:', input.ownerName, 36, y, 250, reg, bold);
  fieldBox(page, 'DATE OF COMPLETION:', fmtDate(input.completionDate), 300, y, 256, reg, bold);
  y -= 50;

  const body = `STATE OF _______________, COUNTY OF _______________\n\nThe undersigned, being duly sworn, deposes and says that he or she is the ${input.gcName} (the Contractor) having contracted with ${input.ownerName} (the Owner) for the construction of the Project. The Contractor further states that, to the best of his or her knowledge, information and belief, except as listed below, the Releases or Waivers of Lien attached hereto include the Contractor, all Subcontractors, all suppliers of materials and equipment, and all performers of Work, labor or services who have or may have Lien rights against the Owner's Property.`;

  const words2 = body.split(' ');
  let line2 = '';
  words2.forEach(word => {
    if (word === '\n\n') { drawText(page, line2, 36, y, 9, reg, DARK); y -= 26; line2 = ''; return; }
    if ((line2 + word).length > 88) {
      drawText(page, line2, 36, y, 9, reg, DARK); y -= 13; line2 = word + ' ';
    } else { line2 += word + ' '; }
  });
  if (line2) { drawText(page, line2, 36, y, 9, reg, DARK); y -= 13; }

  y -= 20;
  if (input.allWaiversReceived) {
    page.drawRectangle({ x: 36, y: y - 24, width: width - 72, height: 24, color: rgb(0.9, 1, 0.9), borderColor: rgb(0.2, 0.7, 0.3), borderWidth: 1 });
    drawText(page, '✓ All lien waivers have been received and verified.', 46, y - 14, 10, bold, rgb(0.1, 0.5, 0.1));
  } else {
    page.drawRectangle({ x: 36, y: y - 24, width: width - 72, height: 24, color: rgb(1, 0.95, 0.9), borderColor: rgb(0.8, 0.3, 0.1), borderWidth: 1 });
    drawText(page, '⚠ Outstanding lien waivers — see attached list.', 46, y - 14, 10, bold, rgb(0.7, 0.2, 0.05));
  }

  y -= 60;
  page.drawLine({ start: { x: 36, y }, end: { x: 280, y }, color: DARK, thickness: 0.5 });
  drawText(page, 'Contractor Signature', 36, y - 12, 8, reg, GRAY);
  drawText(page, input.gcName, 36, y - 22, 9, bold, DARK);
  drawText(page, 'Sworn to before me this _____ day of _______________, 20___', 36, y - 50, 9, reg, DARK);
  drawText(page, 'Notary Public: _________________________', 36, y - 70, 9, reg, DARK);

  footerText(page, reg);
  return await doc.save();
}

// ─── A310 — Bid Bond ─────────────────────────────────────────────────────────
export async function generateA310(input: {
  projectName: string; projectAddress: string; ownerName: string;
  gcName: string; gcAddress: string; suretyName: string;
  bondAmount: number; bidDate: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);

  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  drawText(page, 'AIA DOCUMENT A310', 36, height - 22, 14, bold, GOLD);
  drawText(page, 'BID BOND', 36, height - 40, 10, reg, WHITE);

  let y = height - 80;
  fieldBox(page, 'PRINCIPAL (Contractor):', input.gcName, 36, y, 250, reg, bold);
  fieldBox(page, 'SURETY:', input.suretyName, 300, y, 256, reg, bold);
  y -= 30;
  fieldBox(page, 'OWNER (Obligee):', input.ownerName, 36, y, 250, reg, bold);
  fieldBox(page, 'BOND AMOUNT:', fmtCurrency(input.bondAmount), 300, y, 256, reg, bold);
  y -= 30;
  fieldBox(page, 'PROJECT:', input.projectName, 36, y, 400, reg, bold);
  fieldBox(page, 'BID DATE:', fmtDate(input.bidDate), 450, y, 106, reg, bold);
  y -= 50;

  const text = `KNOW ALL PERSONS BY THESE PRESENTS, that we, the Principal and Surety, are held and firmly bound unto the Owner in the sum stated above for the payment of which we bind ourselves, our heirs, executors, administrators, successors and assigns, jointly and severally.

THE CONDITION OF THIS OBLIGATION is such that if the Principal shall faithfully submit a bid for the Work described herein, and if said bid is accepted, enter into a contract with the Owner upon the terms of such bid and give such bond or bonds as may be specified, then this obligation shall be null and void; otherwise, the Surety shall pay to the Owner the difference between the amount of the Principal's bid and the amount for which the Owner legally contracts with another party to perform the work, if the latter is greater.`;

  const words3 = text.split(' ');
  let line3 = '';
  words3.forEach(word => {
    if (word === '\n\n') { drawText(page, line3, 36, y, 9, reg, DARK); y -= 24; line3 = ''; return; }
    if ((line3 + word).length > 88) {
      drawText(page, line3, 36, y, 9, reg, DARK); y -= 13; line3 = word + ' ';
    } else { line3 += word + ' '; }
  });
  if (line3) { drawText(page, line3, 36, y, 9, reg, DARK); y -= 13; }

  y -= 40;
  [['PRINCIPAL', input.gcName], ['SURETY', input.suretyName]].forEach(([role, name], i) => {
    const bx = 36 + i * 280;
    page.drawLine({ start: { x: bx, y }, end: { x: bx + 240, y }, color: DARK, thickness: 0.5 });
    drawText(page, name, bx, y - 12, 9, bold, DARK);
    drawText(page, role, bx, y - 22, 8, reg, GRAY);
    drawText(page, 'Authorized Representative', bx, y - 36, 7, reg, GRAY);
    drawText(page, 'Date: _________________', bx, y - 50, 7, reg, GRAY);
  });

  footerText(page, reg);
  return await doc.save();
}

// ─── A312 — Performance and Payment Bond ─────────────────────────────────────
export async function generateA312(input: {
  projectName: string; ownerName: string; gcName: string; gcAddress: string;
  suretyName: string; suretyAddress: string;
  contractAmount: number; bondAmount: number; contractDate: string;
  bondType: 'performance' | 'payment' | 'both';
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);

  const bondTitle = input.bondType === 'performance' ? 'PERFORMANCE BOND' :
                    input.bondType === 'payment' ? 'PAYMENT BOND' : 'PERFORMANCE AND PAYMENT BOND';

  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  drawText(page, 'AIA DOCUMENT A312', 36, height - 22, 14, bold, GOLD);
  drawText(page, bondTitle, 36, height - 40, 10, reg, WHITE);

  let y = height - 80;
  fieldBox(page, 'PRINCIPAL (Contractor):', input.gcName, 36, y, 250, reg, bold);
  fieldBox(page, 'SURETY:', input.suretyName, 300, y, 256, reg, bold);
  y -= 30;
  fieldBox(page, 'OWNER:', input.ownerName, 36, y, 250, reg, bold);
  fieldBox(page, 'BOND AMOUNT:', fmtCurrency(input.bondAmount), 300, y, 256, reg, bold);
  y -= 30;
  fieldBox(page, 'PROJECT:', input.projectName, 36, y, 300, reg, bold);
  fieldBox(page, 'CONTRACT AMOUNT:', fmtCurrency(input.contractAmount), 350, y, 206, reg, bold);
  y -= 30;
  fieldBox(page, 'CONTRACT DATE:', fmtDate(input.contractDate), 36, y, 200, reg, bold);

  y -= 50;
  const perfText = input.bondType !== 'payment'
    ? 'PERFORMANCE BOND: The Surety, in consideration of the payment of the premium, does hereby agree to faithfully perform and fulfill all the covenants, conditions and requirements of the Contract. If the Principal fails to perform, the Surety shall immediately remedy the default or shall promptly complete the Contract through its agents.'
    : '';
  const payText = input.bondType !== 'performance'
    ? 'PAYMENT BOND: The Principal and Surety are bound to the Owner for the performance of the following obligation: If Principal promptly pays all claimants providing labor and material in the prosecution of the Work provided for in the Contract, this obligation shall be null and void.'
    : '';

  [perfText, payText].filter(Boolean).forEach(text => {
    const words = text.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 88) {
        drawText(page, line, 36, y, 9, reg, DARK); y -= 13; line = word + ' ';
      } else { line += word + ' '; }
    });
    if (line) { drawText(page, line, 36, y, 9, reg, DARK); y -= 13; }
    y -= 12;
  });

  y -= 30;
  [['PRINCIPAL', input.gcName], ['SURETY', input.suretyName]].forEach(([role, name], i) => {
    const bx = 36 + i * 280;
    page.drawLine({ start: { x: bx, y }, end: { x: bx + 240, y }, color: DARK, thickness: 0.5 });
    drawText(page, name, bx, y - 12, 9, bold, DARK);
    drawText(page, role, bx, y - 22, 8, reg, GRAY);
    drawText(page, 'Date: _________________', bx, y - 36, 7, reg, GRAY);
  });

  footerText(page, reg);
  return await doc.save();
}

// ─── Lien Waivers — All 4 Types with State Language ─────────────────────────
type WaiverType = 'conditional_partial' | 'unconditional_partial' | 'conditional_final' | 'unconditional_final';

export async function generateLienWaiver(input: {
  waiverType: WaiverType; state: string;
  claimantName: string; projectName: string; projectAddress: string;
  ownerName: string; gcName: string;
  throughDate: string; amount: number;
  checkNumber?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);

  const titles: Record<WaiverType, string> = {
    conditional_partial:   'CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
    unconditional_partial: 'UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
    conditional_final:     'CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
    unconditional_final:   'UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
  };

  const isConditional = input.waiverType.startsWith('conditional');
  const isFinal = input.waiverType.includes('final');

  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  drawText(page, `LIEN WAIVER — ${input.state}`, 36, height - 22, 12, bold, GOLD);
  drawText(page, titles[input.waiverType], 36, height - 40, 9, reg, WHITE);

  let y = height - 80;
  fieldBox(page, 'CLAIMANT:', input.claimantName, 36, y, 250, reg, bold);
  fieldBox(page, 'CUSTOMER (GC/Owner):', input.gcName, 300, y, 256, reg, bold);
  y -= 30;
  fieldBox(page, 'PROJECT:', input.projectName, 36, y, 300, reg, bold);
  fieldBox(page, 'AMOUNT:', fmtCurrency(input.amount), 350, y, 100, reg, bold);
  y -= 30;
  fieldBox(page, 'THROUGH DATE:', fmtDate(input.throughDate), 36, y, 200, reg, bold);
  if (input.checkNumber) fieldBox(page, 'CHECK/PAYMENT NO.:', input.checkNumber, 250, y, 200, reg, bold);

  y -= 50;
  // State-specific statutory language
  const stateLanguage: Record<string, string> = {
    AZ: `ARIZONA STATUTORY LIEN WAIVER (A.R.S. § 33-1008). ${isConditional ? 'Claimant has been paid and has received a progress payment in the sum stated above for labor, services, equipment, or materials furnished through the Through Date, and upon receipt of this payment, waives and releases any claim or right to a mechanic\'s lien, stop payment notice, or any right against a labor and material bond.' : 'Claimant has received the sum stated above and hereby unconditionally waives and releases any mechanic\'s lien, stop payment notice, or any right against a labor and material bond for labor, services, equipment, or materials furnished through the Through Date.'}`,
    CA: `CALIFORNIA STATUTORY LIEN WAIVER (Civil Code § 8132-8138). ${isConditional ? 'This document waives and releases lien rights and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the Through Date. Rights based upon labor or service provided, or equipment or material delivered, after the Through Date are not waived or released. This document is effective only upon claimant\'s receipt of payment from the financial institution on which the check is drawn.' : 'This document waives and releases lien rights and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the Through Date.'}`,
    TX: `TEXAS STATUTORY LIEN WAIVER (Tex. Prop. Code § 53.281). ${isConditional ? 'Claimant has been paid the amount stated above for improvements to the above Property through the Through Date. Upon receipt of such payment, Claimant waives and releases its lien and right to claim a lien for labor or materials furnished to the Property through the Through Date.' : 'Claimant has received payment in the full amount stated above. Claimant waives and releases its lien and all claims for labor or materials furnished to the above-named project through the Through Date.'}`,
  };

  const defaultLanguage = `${isConditional ? 'CONDITIONAL' : 'UNCONDITIONAL'} ${isFinal ? 'FINAL' : 'PROGRESS'} LIEN WAIVER. The undersigned claimant, upon ${isConditional ? 'receipt of the sum stated above' : 'having been paid the sum stated above'}, hereby waives and releases any and all lien, claim, or right to lien upon the above-described project for labor, services, equipment, or materials furnished through the Through Date stated above.`;

  const langText = stateLanguage[input.state] || defaultLanguage;
  const words = langText.split(' ');
  let line = '';
  words.forEach(word => {
    if ((line + word).length > 88) {
      drawText(page, line, 36, y, 9, reg, DARK); y -= 13; line = word + ' ';
    } else { line += word + ' '; }
  });
  if (line) { drawText(page, line, 36, y, 9, reg, DARK); y -= 13; }

  if (isConditional) {
    y -= 15;
    page.drawRectangle({ x: 36, y: y - 30, width: width - 72, height: 30, color: rgb(1, 0.97, 0.9), borderColor: GOLD, borderWidth: 1 });
    drawText(page, '⚠ CONDITIONAL: This waiver is only effective upon receipt of the payment specified above.', 46, y - 18, 9, bold, rgb(0.6, 0.3, 0));
    y -= 40;
  } else {
    y -= 20;
  }

  page.drawLine({ start: { x: 36, y }, end: { x: 280, y }, color: DARK, thickness: 0.5 });
  drawText(page, 'Authorized Signature', 36, y - 12, 8, reg, GRAY);
  drawText(page, input.claimantName, 36, y - 22, 9, bold, DARK);
  drawText(page, 'Title: _______________________', 36, y - 36, 8, reg, DARK);
  drawText(page, 'Date: ________________________', 36, y - 50, 8, reg, DARK);
  page.drawLine({ start: { x: 310, y }, end: { x: 540, y }, color: DARK, thickness: 0.5 });
  drawText(page, 'Notary (if required)', 310, y - 12, 8, reg, GRAY);
  drawText(page, 'Notary Signature: _______________', 310, y - 36, 8, reg, DARK);
  drawText(page, 'Commission Expires: ____________', 310, y - 50, 8, reg, DARK);

  footerText(page, reg);
  return await doc.save();
}

// ─── Bid Jacket ───────────────────────────────────────────────────────────────
export async function generateBidJacket(input: {
  projectName: string; projectAddress: string;
  ownerName: string; ownerAddress: string;
  gcName: string; gcAddress: string; gcLicense?: string;
  tradeName: string; dueDate: string;
  scopeNarrative: string;
  csiSections: string[];
  lineItems: Array<{ description: string; quantity?: number; unit?: string; unitPrice?: number }>;
  requiresBond: boolean;
  insuranceRequirements?: { gl?: number; wc?: string; auto?: number };
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { reg, bold } = await baseFonts(doc);

  // PAGE 1 — Cover
  {
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: 0, width, height, color: DARK });
    page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: GOLD });
    page.drawRectangle({ x: 0, y: 0, width, height: 8, color: GOLD });
    drawText(page, 'CONFIDENTIAL BID DOCUMENTS', width / 2 - 100, height - 60, 12, bold, GOLD);
    drawText(page, input.gcName.toUpperCase(), width / 2 - 100, height - 100, 16, bold, WHITE);
    drawText(page, input.gcAddress, width / 2 - 100, height - 118, 9, reg, rgb(0.6, 0.7, 0.8));
    if (input.gcLicense) drawText(page, `License: ${input.gcLicense}`, width / 2 - 100, height - 132, 8, reg, rgb(0.5, 0.6, 0.7));
    drawText(page, input.projectName, 60, height / 2 + 60, 24, bold, WHITE);
    drawText(page, input.projectAddress, 60, height / 2 + 36, 10, reg, rgb(0.6, 0.7, 0.8));
    drawText(page, `TRADE: ${input.tradeName.toUpperCase()}`, 60, height / 2 - 10, 14, bold, GOLD);
    page.drawRectangle({ x: 58, y: height / 2 - 60, width: width - 116, height: 40, color: GOLD });
    drawText(page, 'BID DUE DATE', 80, height / 2 - 32, 9, reg, DARK);
    drawText(page, fmtDate(input.dueDate), 80, height / 2 - 50, 14, bold, DARK);
    drawText(page, 'OWNER', 60, 120, 9, reg, rgb(0.5, 0.6, 0.7));
    drawText(page, input.ownerName, 60, 105, 11, bold, WHITE);
    drawText(page, input.ownerAddress, 60, 90, 8, reg, rgb(0.6, 0.7, 0.8));
  }

  // PAGE 2 — Instructions to Bidders
  {
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    headerBar(page, 'INSTRUCTIONS TO BIDDERS', `${input.projectName} | Due: ${fmtDate(input.dueDate)}`, bold, reg);
    let y = height - 70;
    const sections = [
      ['1. BID SUBMISSION', `Bids must be submitted by ${fmtDate(input.dueDate)}. Late bids will not be accepted. Submit electronically via the Saguaro Control Systems portal link provided in your invitation.`],
      ['2. BOND REQUIREMENTS', input.requiresBond ? 'A Bid Bond equal to 10% of the bid amount is required (AIA A310). Performance and Payment Bonds equal to 100% of the contract amount will be required upon award.' : 'No bid bond is required for this project.'],
      ['3. INSURANCE REQUIREMENTS', `General Liability: $${(input.insuranceRequirements?.gl || 2000000).toLocaleString()} per occurrence / $4M aggregate. Workers Compensation: Statutory limits. Commercial Auto: $${(input.insuranceRequirements?.auto || 1000000).toLocaleString()} combined single limit. Additional Insured endorsement required naming Owner and GC.`],
      ['4. BID VALIDITY', 'All bids shall remain valid for a period of ninety (90) calendar days from the bid due date.'],
      ['5. OWNER\'S RIGHT TO REJECT', 'The Owner reserves the right to reject any or all bids, to waive any informality or irregularity in any bid received, and to accept the bid deemed most advantageous to the Owner.'],
      ['6. QUESTIONS', 'Submit all questions in writing via the project portal no later than 5 business days prior to bid due date. Answers will be issued as addenda to all invited bidders.'],
      ['7. SUBCONTRACTOR LIST', 'Bidder shall list all sub-subcontractors and major material suppliers on the provided form.'],
    ];
    sections.forEach(([title, body]) => {
      drawText(page, title, 36, y, 10, bold, DARK);
      y -= 15;
      const words = body.split(' ');
      let line = '';
      words.forEach(word => {
        if ((line + word).length > 88) { drawText(page, line, 46, y, 9, reg, GRAY); y -= 12; line = word + ' '; }
        else { line += word + ' '; }
      });
      if (line) { drawText(page, line, 46, y, 9, reg, GRAY); y -= 12; }
      y -= 15;
    });
    footerText(page, reg);
  }

  // PAGE 3 — Scope of Work
  {
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    headerBar(page, 'SCOPE OF WORK', input.tradeName, bold, reg);
    let y = height - 70;
    drawText(page, 'SCOPE NARRATIVE', 36, y, 10, bold, DARK);
    y -= 18;
    const words = input.scopeNarrative.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 88) { drawText(page, line, 36, y, 9, reg, DARK); y -= 13; line = word + ' '; }
      else { line += word + ' '; }
    });
    if (line) { drawText(page, line, 36, y, 9, reg, DARK); y -= 13; }

    y -= 20;
    if (input.csiSections.length > 0) {
      drawText(page, 'APPLICABLE CSI SPEC SECTIONS', 36, y, 10, bold, DARK);
      y -= 15;
      input.csiSections.forEach((sec: unknown) => {
        const label = typeof sec === 'string' ? sec : (sec as Record<string, string>).name || String(sec);
        drawText(page, `• ${label}`, 46, y, 9, reg, DARK);
        y -= 13;
      });
    }
    footerText(page, reg);
  }

  // PAGE 4 — Bid Form / Schedule of Values
  {
    let page = doc.addPage(PageSizes.Letter);
    const bidPages: any[] = [page]; // sheets this section grows
    const { width, height } = page.getSize();
    headerBar(page, 'BID FORM — SCHEDULE OF VALUES', `Submit by: ${fmtDate(input.dueDate)}`, bold, reg);
    let y = height - 70;
    drawText(page, 'Bidder Name: ____________________________________________  License: __________________', 36, y, 9, reg, DARK);
    y -= 20;

    // Table header
    page.drawRectangle({ x: 36, y: y - 16, width: width - 72, height: 16, color: DARK });
    drawText(page, '#', 38, y - 12, 8, bold, WHITE);
    drawText(page, 'Description of Work', 55, y - 12, 8, bold, WHITE);
    drawText(page, 'Qty', 350, y - 12, 8, bold, WHITE);
    drawText(page, 'Unit', 385, y - 12, 8, bold, WHITE);
    drawText(page, 'Unit Price', 420, y - 12, 8, bold, WHITE);
    drawText(page, 'Total', 490, y - 12, 8, bold, WHITE);
    y -= 16;

    /* Was `.slice(0, 20)`. A bid jacket that drops line item 21 understates
     * the bid. Rows now break to a new sheet instead of vanishing. */
    input.lineItems.forEach((item, i) => {
      if (y < 90) {
        page = doc.addPage(PageSizes.Letter);
        bidPages.push(page);
        headerBar(page, 'BID JACKET (CONTINUED)', input.projectName, bold, reg);
        y = height - 90;
      }
      const bg = i % 2 === 0 ? WHITE : LGRAY;
      page.drawRectangle({ x: 36, y: y - 14, width: width - 72, height: 14, color: bg });
      drawText(page, String(i + 1), 38, y - 10, 8, reg, DARK);
      drawText(page, item.description, 55, y - 10, 8, reg, DARK);
      drawText(page, item.quantity ? String(item.quantity) : '', 350, y - 10, 8, reg, DARK);
      drawText(page, item.unit || '', 385, y - 10, 8, reg, DARK);
      drawText(page, '$ __________', 420, y - 10, 8, reg, DARK);
      drawText(page, '$ __________', 490, y - 10, 8, reg, DARK);
      y -= 14;
    });

    y -= 10;
    page.drawRectangle({ x: 36, y: y - 20, width: width - 72, height: 20, color: LGRAY, borderColor: GOLD, borderWidth: 1 });
    drawText(page, 'TOTAL BID AMOUNT:', 40, y - 14, 10, bold, DARK);
    drawText(page, '$ ___________________________', 250, y - 14, 10, bold, DARK);

    y -= 40;
    drawText(page, 'ALTERNATES (if any):', 36, y, 9, bold, DARK);
    y -= 14;
    ['Add Alt 1: _____________________', 'Deduct Alt 1: ___________________', 'Add Alt 2: _____________________'].forEach(alt => {
      drawText(page, alt, 46, y, 9, reg, DARK); y -= 14;
    });

    footerText(page, reg);
  }

  // PAGE 5 — Sub/Supplier List
  {
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    headerBar(page, 'SUB AND SUPPLIER LIST', 'Required — attach to bid', bold, reg);
    let y = height - 70;
    drawText(page, 'Bidder must list all sub-subcontractors and material suppliers:', 36, y, 9, reg, DARK);
    y -= 20;
    page.drawRectangle({ x: 36, y: y - 16, width: width - 72, height: 16, color: DARK });
    ['Sub/Supplier Name', 'Trade / Material', 'License #', 'Amount'].forEach((h, i) => {
      drawText(page, h, 40 + i * 130, y - 12, 8, bold, WHITE);
    });
    y -= 16;
    for (let i = 0; i < 12; i++) {
      const bg = i % 2 === 0 ? WHITE : LGRAY;
      page.drawRectangle({ x: 36, y: y - 20, width: width - 72, height: 20, color: bg });
      [0, 1, 2, 3].forEach(col => {
        page.drawLine({ start: { x: 36 + col * 130, y: y - 20 }, end: { x: 36 + col * 130, y }, color: LGRAY, thickness: 0.5 });
      });
      y -= 20;
    }
    footerText(page, reg);
  }

  // PAGE 6 — Required Attachments Checklist
  {
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    headerBar(page, 'REQUIRED ATTACHMENTS CHECKLIST', 'Include all checked items with bid', bold, reg);
    let y = height - 70;
    const items = [
      [input.requiresBond, 'Bid Bond (AIA A310) — 10% of Bid Amount'],
      [true, 'Certificate of Insurance — GL, WC, Auto'],
      [true, 'Contractor License Copy'],
      [true, 'Three (3) References from Similar Projects'],
      [true, 'Sub and Supplier List (Page 5)'],
      [true, 'Completed Bid Form (Page 4) with all line items priced'],
      [false, 'Unit Price Schedule (if alternates apply)'],
      [false, 'List of Key Personnel'],
    ];
    items.forEach(([required, label]) => {
      const color = required ? rgb(0.9, 1, 0.9) : LGRAY;
      page.drawRectangle({ x: 36, y: y - 22, width: width - 72, height: 22, color, borderColor: GRAY, borderWidth: 0.3 });
      drawText(page, required ? '☑ REQUIRED' : '☐ Optional', 46, y - 14, 8, bold, required ? rgb(0.1, 0.5, 0.1) : GRAY);
      drawText(page, String(label), 145, y - 14, 9, reg, DARK);
      y -= 24;
    });

    y -= 20;
    page.drawLine({ start: { x: 36, y }, end: { x: 280, y }, color: DARK, thickness: 0.5 });
    drawText(page, 'Bidder Authorized Signature', 36, y - 14, 8, reg, GRAY);
    drawText(page, 'Date: _____________________', 310, y - 14, 8, reg, DARK);

    footerText(page, reg);
  }

  return await doc.save();
}

// ─── WH-347 — Certified Payroll ──────────────────────────────────────────────
export async function generateWH347(input: {
  projectName: string; projectAddress: string; gcName: string;
  weekEnding: string; payrollNumber: number;
  employees: Array<{
    name: string; title: string; classification: string;
    hoursMonday: number; hoursTuesday: number; hoursWednesday: number;
    hoursThursday: number; hoursFriday: number; hoursSaturday: number; hoursSunday: number;
    regularRate: number; otRate: number; grossEarnings: number;
    fica: number; withholding: number; stateWH: number; otherDed: number; netPay: number;
  }>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  /* `let`, not `const`: this form PAGINATES. It previously drew
   * `input.employees.slice(0, 15)` onto a single page with no continuation and
   * no notice, so a crew of 40 produced a federal Davis-Bacon filing showing 15
   * people and nothing on the page said the other 25 existed. Every row is now
   * drawn, flowing onto as many pages as it takes. */
  let page = doc.addPage([792, 612]); // Landscape
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);
  const pages: any[] = [page];

  /** The DOL title band — repeated on every page so a loose sheet is identifiable. */
  const drawBand = (p: any, contPage: number) => {
    p.drawRectangle({ x: 0, y: height - 40, width, height: 40, color: DARK });
    drawText(p, 'U.S. DEPARTMENT OF LABOR — WH-347', 36, height - 18, 11, bold, GOLD);
    drawText(p, contPage > 1 ? `CERTIFIED PAYROLL FORM (CONTINUED)` : 'CERTIFIED PAYROLL FORM', 36, height - 32, 8, reg, WHITE);
    drawText(p, `Week Ending: ${fmtDate(input.weekEnding)} | Payroll #${input.payrollNumber}`, 400, height - 22, 9, reg, WHITE);
  };

  drawBand(page, 1);

  let y = height - 50;
  fieldBox(page, 'CONTRACTOR:', input.gcName, 36, y, 200, reg, bold);
  fieldBox(page, 'PROJECT:', input.projectName, 250, y, 200, reg, bold);
  fieldBox(page, 'ADDRESS:', input.projectAddress, 464, y, 292, reg, bold);
  y -= 28;

  // Column headers
  const cols = [
    { h: 'Employee Name', x: 36, w: 110 },
    { h: 'Classification', x: 146, w: 80 },
    { h: 'M', x: 226, w: 22 }, { h: 'T', x: 248, w: 22 }, { h: 'W', x: 270, w: 22 },
    { h: 'Th', x: 292, w: 22 }, { h: 'F', x: 314, w: 22 }, { h: 'Sa', x: 336, w: 22 }, { h: 'Su', x: 358, w: 22 },
    { h: 'Reg', x: 380, w: 46 }, { h: 'OT', x: 426, w: 46 },
    { h: 'Gross', x: 472, w: 50 }, { h: 'FICA', x: 522, w: 42 }, { h: 'Fed WH', x: 564, w: 42 },
    { h: 'State WH', x: 606, w: 44 }, { h: 'Other', x: 650, w: 44 }, { h: 'Net Pay', x: 694, w: 62 },
  ];

  /** Column header strip — repeated at the top of every continuation page, so a
   *  reader never has to flip back to know which column is Net Pay. */
  const drawColumnHeads = () => {
    page.drawRectangle({ x: 36, y: y - 16, width: width - 72, height: 16, color: DARK });
    cols.forEach(c => drawText(page, c.h, c.x + 2, y - 12, 6, bold, WHITE));
    y -= 16;
  };
  drawColumnHeads();

  /* Break BEFORE a row that would not fit. 150pt of reserve is the totals strip
   * (30) plus the statement of compliance and signature rule (~110) — the parts
   * that legally have to sit under the last row rather than orphaned alone. */
  const ROW_H = 18;
  const ensureRoom = (needed: number) => {
    if (y - needed >= 150) return;
    page = doc.addPage([792, 612]);
    pages.push(page);
    drawBand(page, pages.length);
    y = height - 50;
    drawColumnHeads();
  };

  input.employees.forEach((emp, i) => {
    ensureRoom(ROW_H);
    const bg = i % 2 === 0 ? WHITE : LGRAY;
    page.drawRectangle({ x: 36, y: y - ROW_H, width: width - 72, height: ROW_H, color: bg });
    drawText(page, emp.name, 38, y - 13, 7, reg, DARK);
    drawText(page, emp.classification, 148, y - 13, 7, reg, DARK);
    [emp.hoursMonday, emp.hoursTuesday, emp.hoursWednesday, emp.hoursThursday, emp.hoursFriday, emp.hoursSaturday, emp.hoursSunday]
      .forEach((h, idx) => drawText(page, h > 0 ? String(h) : '', 228 + idx * 22, y - 13, 7, reg, DARK));
    drawText(page, `$${emp.regularRate.toFixed(2)}`, 382, y - 13, 6, reg, DARK);
    drawText(page, `$${emp.otRate.toFixed(2)}`, 428, y - 13, 6, reg, DARK);
    drawText(page, fmtCurrency(emp.grossEarnings), 474, y - 13, 7, reg, DARK);
    drawText(page, fmtCurrency(emp.fica), 524, y - 13, 6, reg, DARK);
    drawText(page, fmtCurrency(emp.withholding), 566, y - 13, 6, reg, DARK);
    drawText(page, fmtCurrency(emp.stateWH), 608, y - 13, 6, reg, DARK);
    drawText(page, fmtCurrency(emp.otherDed), 652, y - 13, 6, reg, DARK);
    drawText(page, fmtCurrency(emp.netPay), 696, y - 13, 7, bold, DARK);
    y -= 18;
  });

  /* Totals + compliance block: 30 for the totals strip, 60 for the statement,
   * 30 for the signature rule. ensureRoom() keeps them together on one page. */
  ensureRoom(120);
  y -= 16;
  page.drawRectangle({ x: 36, y: y - 20, width: width - 72, height: 20, color: DARK });
  const totGross = input.employees.reduce((s, e) => s + e.grossEarnings, 0);
  const totFica = input.employees.reduce((s, e) => s + e.fica, 0);
  const totFedWH = input.employees.reduce((s, e) => s + e.withholding, 0);
  const totStateWH = input.employees.reduce((s, e) => s + e.stateWH, 0);
  const totOther = input.employees.reduce((s, e) => s + e.otherDed, 0);
  const totNet = input.employees.reduce((s, e) => s + e.netPay, 0);
  drawText(page, 'TOTALS', 38, y - 14, 8, bold, WHITE);
  drawText(page, fmtCurrency(totGross), 474, y - 14, 7, bold, GOLD);
  drawText(page, fmtCurrency(totFica), 524, y - 14, 6, bold, WHITE);
  drawText(page, fmtCurrency(totFedWH), 566, y - 14, 6, bold, WHITE);
  drawText(page, fmtCurrency(totStateWH), 608, y - 14, 6, bold, WHITE);
  drawText(page, fmtCurrency(totOther), 652, y - 14, 6, bold, WHITE);
  drawText(page, fmtCurrency(totNet), 696, y - 14, 7, bold, GOLD);
  y -= 30;

  // Statement of Compliance
  page.drawRectangle({ x: 36, y: y - 50, width: width - 72, height: 50, color: LGRAY, borderColor: GOLD, borderWidth: 1 });
  drawText(page, 'STATEMENT OF COMPLIANCE — I, the undersigned, do hereby state that the above is correct and complete; that the wage rates for laborers', 46, y - 14, 7, reg, DARK);
  drawText(page, 'or mechanics contained herein are not less than the applicable wage rates contained in any wage determination incorporated into', 46, y - 26, 7, reg, DARK);
  drawText(page, 'the contract; and that any fringe benefits paid to approved plans, funds, or programs are bona fide fringe benefits.', 46, y - 38, 7, reg, DARK);
  y -= 60;
  page.drawLine({ start: { x: 36, y }, end: { x: 300, y }, color: DARK, thickness: 0.5 });
  drawText(page, `${input.gcName} — Authorized Representative`, 36, y - 12, 8, reg, GRAY);
  drawText(page, 'Title: _______________  Date: _______________', 320, y - 12, 8, reg, DARK);

  /* "Page 1 of 3" on every sheet, plus the employee count. A certified payroll
   * gets printed, signed and mailed; without this a reader cannot tell whether
   * they are holding the whole filing. Stamped at the end because the total is
   * not known until the last row is drawn. */
  pages.forEach((p, i) => {
    drawText(p, `Page ${i + 1} of ${pages.length}`, width - 96, 20, 7, reg, GRAY);
    drawText(p, `${input.employees.length} employee${input.employees.length === 1 ? '' : 's'} reported`, 36, 20, 7, reg, GRAY);
  });

  return await doc.save();
}

// ─── Closeout Package ─────────────────────────────────────────────────────────
export async function generateCloseoutPackage(input: {
  projectName: string; projectAddress: string;
  ownerName: string; gcName: string; completionDate: string;
  contractAmount: number; finalAmount: number;
  checklist: Array<{ category: string; item: string; status: 'complete' | 'pending' | 'na' }>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { reg, bold } = await baseFonts(doc);

  // Cover page
  {
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: 0, width, height, color: DARK });
    page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: GOLD });
    page.drawRectangle({ x: 0, y: 0, width, height: 10, color: GOLD });
    drawText(page, 'PROJECT CLOSEOUT PACKAGE', width / 2 - 120, height - 80, 16, bold, GOLD);
    drawText(page, input.projectName, 60, height / 2 + 40, 22, bold, WHITE);
    drawText(page, input.projectAddress, 60, height / 2 + 18, 10, reg, rgb(0.6, 0.7, 0.8));
    drawText(page, `Owner: ${input.ownerName}`, 60, height / 2 - 10, 10, reg, WHITE);
    drawText(page, `Contractor: ${input.gcName}`, 60, height / 2 - 26, 10, reg, WHITE);
    drawText(page, `Completion: ${fmtDate(input.completionDate)}`, 60, height / 2 - 42, 10, reg, WHITE);
    drawText(page, `Final Contract Sum: ${fmtCurrency(input.finalAmount)}`, 60, height / 2 - 58, 10, bold, GOLD);
    drawText(page, 'Prepared by Saguaro Control Systems', 60, 50, 8, reg, rgb(0.4, 0.5, 0.6));
  }

  // Checklist page
  {
    let page = doc.addPage(PageSizes.Letter);
    const closeoutPages: any[] = [page]; // sheets this section grows
    const { width, height } = page.getSize();
    headerBar(page, 'CLOSEOUT CHECKLIST', input.projectName, bold, reg);
    let y = height - 70;

    let curCat = '';
    input.checklist.forEach(item => {
      if (item.category !== curCat) {
        curCat = item.category;
        y -= 8;
        page.drawRectangle({ x: 36, y: y - 16, width: width - 72, height: 16, color: DARK });
        drawText(page, item.category.toUpperCase(), 40, y - 12, 9, bold, GOLD);
        y -= 18;
      }
      const statusColor = item.status === 'complete' ? rgb(0.9, 1, 0.9) : item.status === 'na' ? LGRAY : rgb(1, 0.95, 0.9);
      const statusText = item.status === 'complete' ? '✓ Complete' : item.status === 'na' ? '— N/A' : '○ Pending';
      page.drawRectangle({ x: 36, y: y - 18, width: width - 72, height: 18, color: statusColor });
      drawText(page, statusText, 40, y - 12, 8, bold,
        item.status === 'complete' ? rgb(0.1, 0.5, 0.1) : item.status === 'na' ? GRAY : rgb(0.7, 0.3, 0.1));
      drawText(page, item.item, 120, y - 12, 9, reg, DARK);
      y -= 20;
      /* Was a silent `return` that abandoned the rest of the list mid-page. */
      if (y < 60) {
        page = doc.addPage(PageSizes.Letter);
        closeoutPages.push(page);
        headerBar(page, 'PROJECT CLOSEOUT PACKAGE (CONTINUED)', input.projectName, bold, reg);
        y = height - 90;
      }
    });

    const complete = input.checklist.filter(i => i.status === 'complete').length;
    const total = input.checklist.filter(i => i.status !== 'na').length;
    const pct = total > 0 ? Math.round(complete / total * 100) : 0;

    y -= 20;
    page.drawRectangle({ x: 36, y: y - 30, width: width - 72, height: 30, color: pct === 100 ? rgb(0.9, 1, 0.9) : LGRAY, borderColor: GOLD, borderWidth: 1 });
    drawText(page, `Closeout Progress: ${complete}/${total} complete (${pct}%)`, 46, y - 18, 11, bold, pct === 100 ? rgb(0.1, 0.5, 0.1) : DARK);

    footerText(page, reg);
  }

  return await doc.save();
}

// ─── W-9 (Request for Taxpayer Identification Number) ────────────────────────
export async function generateW9(input: {
  vendorName?: string; businessName?: string; taxClassification?: string;
  tin?: string; ssn?: string; ein?: string;
  address?: string; city?: string; state?: string; zip?: string;
  signature?: string; signedDate?: string; projectName?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const { reg, bold } = await baseFonts(doc);
  const M = 56;
  let y = height - 64;

  page.drawText('Form W-9', { x: M, y, size: 24, font: bold, color: DARK });
  page.drawText('(Substitute)', { x: M + 132, y: y + 2, size: 10, font: reg, color: GRAY });
  y -= 20;
  page.drawText('Request for Taxpayer Identification Number and Certification', { x: M, y, size: 10, font: reg, color: GRAY });
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1.2, color: GOLD });
  y -= 34;

  const row = (label: string, value?: string) => {
    page.drawText(label, { x: M, y, size: 8.5, font: bold, color: GRAY });
    page.drawText((value && String(value).trim()) || '—', { x: M, y: y - 16, size: 12, font: reg, color: BLACK });
    y -= 42;
  };
  row('1. Name (as shown on your income tax return)', input.vendorName);
  row('2. Business name / disregarded entity name', input.businessName);
  row('3. Federal tax classification', input.taxClassification);
  row('5/6. Address, city, state, ZIP',
    [input.address, [input.city, input.state, input.zip].filter(Boolean).join(', ')].filter(Boolean).join('   •   '));
  row('Part I — Taxpayer Identification Number (SSN/EIN)', input.ein || input.ssn || input.tin);

  y -= 6;
  page.drawText('Part II — Certification', { x: M, y, size: 9.5, font: bold, color: DARK }); y -= 16;
  page.drawText('Under penalties of perjury, I certify that the number shown is correct and that I am not subject to backup withholding.',
    { x: M, y, size: 8.5, font: reg, color: GRAY, maxWidth: width - 2 * M, lineHeight: 12 });
  y -= 40;
  row('Signature of U.S. person', input.signature);
  row('Date', input.signedDate);

  if (input.projectName) page.drawText(`Project: ${input.projectName}`, { x: M, y: 44, size: 8, font: reg, color: GRAY });
  page.drawText(`Generated by Saguaro Control Systems on ${fmtDate(new Date())}`, { x: M, y: 30, size: 7.5, font: reg, color: GRAY });
  return doc.save();
}

// ─── Certificate of Insurance (COI) Request Letter ───────────────────────────
// Real, filable request document generated per bid-package trade scope. Lists
// the required ACORD 25 limits, certificate holder and additional-insured
// language so a sub's agent can issue a compliant certificate. Filed to the
// project's Documents/Compliance area via saveDocument by the caller.
export async function generateCOIRequest(input: {
  projectName: string;
  projectAddress?: string;
  gcName: string;
  gcAddress?: string;
  gcEmail?: string;
  ownerName?: string;
  tradeName: string;
  packageName: string;
  vendorName?: string;
  dueDate?: string;
  requiredLimits: {
    glEachOccurrence: number; glAggregate: number;
    autoCombined: number; wcElEachAccident: number; umbrella: number;
  };
  branding?: DocBranding;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { reg, bold } = await baseFonts(doc);
  const branding = input.branding ?? SAGUARO_BRANDING;
  const accent = branding.accent;
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const M = 54;
  const money = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');

  headerBar(page, 'CERTIFICATE OF INSURANCE — REQUEST', input.projectName, bold, reg, branding);

  let y = height - 82;
  drawText(page, 'INSURANCE COMPLIANCE — ACTION REQUIRED', M, y, 13, bold, DARK); y -= 16;
  drawText(page, `Trade Package: ${input.packageName}`, M, y, 10, reg, GRAY); y -= 24;

  const kv = (label: string, val: string) => {
    drawText(page, label, M, y, 9, bold, DARK);
    drawText(page, val, M + 140, y, 9, reg, DARK);
    y -= 15;
  };
  kv('To (Subcontractor):', input.vendorName || 'Awarded subcontractor (TBD)');
  kv('From (Contractor):', input.gcName);
  if (input.gcEmail) kv('Contractor Contact:', input.gcEmail);
  kv('Project:', input.projectName);
  if (input.projectAddress) kv('Project Address:', input.projectAddress);
  if (input.dueDate) kv('COI Due By:', fmtDate(input.dueDate));
  y -= 8;

  const intro = `A current ACORD 25 Certificate of Insurance is required before any work may begin on ${input.projectName}. Please have your insurance agent issue a certificate meeting or exceeding the minimum limits below and naming the certificate holder and additional insureds exactly as specified.`;
  y = drawWrapped(page, intro, M, y, width - 2 * M, 9.5, reg, GRAY, 13);
  y -= 10;

  drawText(page, 'REQUIRED MINIMUM LIMITS', M, y, 10.5, bold, accent); y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, color: LGRAY, thickness: 0.75 }); y -= 16;

  const rl = input.requiredLimits;
  const rows: Array<[string, string]> = [
    ['Commercial General Liability', `$${money(rl.glEachOccurrence)} per occurrence / $${money(rl.glAggregate)} aggregate`],
    ['Automobile Liability', `$${money(rl.autoCombined)} combined single limit`],
    ["Workers' Compensation", `Statutory limits / $${money(rl.wcElEachAccident)} employer's liability`],
  ];
  if (rl.umbrella > 0) rows.push(['Umbrella / Excess Liability', `$${money(rl.umbrella)}`]);
  for (const [k, v] of rows) {
    drawText(page, k, M, y, 9, bold, DARK);
    drawText(page, v, M + 220, y, 9, reg, DARK);
    y -= 15;
  }
  y -= 12;

  const holder = `${input.gcName}${input.gcAddress ? `, ${input.gcAddress}` : ''}`;
  y = drawWrapped(page, `Certificate Holder: ${holder}`, M, y, width - 2 * M, 9, bold, DARK, 12);
  y -= 4;
  y = drawWrapped(
    page,
    `Additional Insured: ${input.gcName}${input.ownerName ? ` and ${input.ownerName}` : ''} shall be named as Additional Insured on a primary and non-contributory basis, with Waiver of Subrogation in favor of the same. Coverage shall not be canceled without 30 days prior written notice.`,
    M, y, width - 2 * M, 9, reg, GRAY, 12,
  );

  footerText(page, reg, branding);
  return doc.save();
}

// ─── Save Document to Storage + DB ───────────────────────────────────────────
export async function saveDocument(
  projectId: string,
  docType: string,
  pdfBytes: Uint8Array,
  snapshot: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  try {
    /* Every generated document was being filed under a tenant_id equal to the
       PROJECT id, because most callers do not pass one and the fallback was
       `tenantId || projectId`. /api/documents/list filters on tenant_id, so
       nothing generated this way ever appeared in the Documents list. The
       project row knows its own tenant; ask it. */
    let tenant = tenantId;
    if (!tenant) {
      const { data: proj } = await getSupabaseAdmin()
        .from('projects')
        .select('tenant_id')
        .eq('id', projectId)
        .single();
      tenant = (proj as { tenant_id?: string } | null)?.tenant_id || undefined;
    }

    const fileName = `${projectId}/${docType}-${Date.now()}.pdf`;
    await getSupabaseAdmin().storage
      .from('documents')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    const { data: urlData } = getSupabaseAdmin().storage.from('documents').getPublicUrl(fileName);
    const pdfUrl = urlData?.publicUrl || '';

    // Real columns only — the previous insert named storage_path/file_size/
    // snapshot which DON'T exist on generated_documents, so every insert
    // 42703'd and no generated doc (W-9, pay-app, lien) ever reached the
    // Documents list. (storage path is derivable from pdf_url when signing.)
    await getSupabaseAdmin().from('generated_documents').insert({
      tenant_id: tenant || projectId,
      project_id: projectId,
      doc_type: docType,
      pdf_url: pdfUrl,
      data_snapshot: snapshot,
      status: 'generated',
    } as Database['public']['Tables']['generated_documents']['Insert']);

    // Return a short-lived SIGNED url for immediate viewing — the 'documents'
    // bucket is private (W-9 SSNs / financial PDFs); later reads re-sign the
    // stored pdf_url. Falls back to the stored value if signing fails.
    const { data: signed } = await getSupabaseAdmin().storage
      .from('documents')
      .createSignedUrl(fileName, 3600);
    return signed?.signedUrl || pdfUrl;
  } catch {
    return `demo://generated/${docType}-${Date.now()}.pdf`;
  }
}

// ─── Merge PDFs ───────────────────────────────────────────────────────────────
export async function mergePDFs(pdfBytesArray: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of pdfBytesArray) {
    try {
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch { /* skip corrupt */ }
  }
  return await merged.save();
}

// ─── Utility helpers (re-exported for use in other files) ─────────────────────
export function createPDF() { return PDFDocument.create(); }
export function addDocumentHeader(page: any, font: any, boldFont: any, title: string, subtitle: string) {
  headerBar(page, title, subtitle, boldFont, font);
}
export function drawField(page: any, font: any, boldFont: any, label: string, value: string, x: number, y: number, w: number) {
  fieldBox(page, label, value, x, y, w, font, boldFont);
}
