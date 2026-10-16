/**
 * lib/document-templates/proposal-signed-generator.ts — the signed proposal PDF.
 *
 * Page 1+ is the proposal exactly as the customer saw it (the frozen snapshot
 * from lib/proposal-esign: letterhead, prepared-for, line items, total, scope,
 * terms) with the signature block filled in. The last page is the signature
 * certificate: who signed, when (UTC), from which IP and device, how, the
 * consent they agreed to, the SHA-256 fingerprint of the content they signed,
 * and the audit trail of every event on the link.
 *
 * Pure rendering: the caller passes everything in, so it can be tested without
 * a database. Colors come from report-theme's DOC palette (white paper).
 */
import { PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts } from 'pdf-lib';
import { brandDoc, drawBrandHeader, stampFooters, DOC, type BrandingValues, type BrandKit } from './report-theme';
import { money, type ProposalSnapshot } from '../proposal-esign-core';

export interface SignedProposalInput {
  snapshot: ProposalSnapshot;
  contentHash: string;
  requestId: string;
  branding: BrandingValues;
  signer: {
    name: string;
    title: string | null;
    email: string;
    method: 'drawn' | 'typed';
    signaturePng: Uint8Array | null;
    signedAt: string;
    ip: string | null;
    userAgent: string | null;
    consentText: string;
  };
  events: Array<{ event: string; actor: string; created_at: string; ip: string | null; detail?: Record<string, unknown> | null }>;
}

const M = 46;
const BOTTOM = 52;

/* The standard PDF fonts are WinAnsi: a character outside it throws inside
   drawText. Map the usual typographic ones and replace the rest. */
function safe(s: unknown): string {
  return String(s ?? '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/\t/g, '  ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= maxW) { line = tryLine; continue; }
      if (line) out.push(line);
      // A single word longer than the line (a URL, a hash) is broken by width.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxW) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxW) cut--;
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

function fmtUtc(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return safe(iso);
  return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

function fmtDay(v: string | null): string {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return isNaN(d.getTime()) ? safe(v) : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const EVENT_LABEL: Record<string, string> = {
  sent: 'Sent for signature', viewed: 'Opened by signer', signed: 'Signed', declined: 'Declined', voided: 'Voided by sender',
};

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private kit: BrandKit, private title: string, private tag: string) { this.newPage(); }
  get width() { return this.page.getSize().width; }
  newPage() {
    this.page = this.doc.addPage(PageSizes.Letter);
    this.y = drawBrandHeader(this.page, this.kit, { title: this.title, docTag: this.tag }) - 6;
  }
  ensure(h: number) { if (this.y - h < BOTTOM) this.newPage(); }
  text(s: string, opts: { size?: number; bold?: boolean; color?: typeof DOC.ink; x?: number; maxW?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.kit.bold : this.kit.reg;
    const x = opts.x ?? M;
    const maxW = opts.maxW ?? this.width - x - M;
    for (const line of wrap(s, font, size, maxW)) {
      this.ensure(size + 4);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? DOC.ink });
      this.y -= size + 4;
    }
    this.y -= opts.gap ?? 0;
  }
  label(s: string, x?: number) { this.ensure(26); this.y -= 6; this.text(s.toUpperCase(), { size: 7.5, bold: true, color: DOC.muted, gap: 2, x }); }
  rule() { this.ensure(10); this.page.drawLine({ start: { x: M, y: this.y }, end: { x: this.width - M, y: this.y }, thickness: 0.6, color: DOC.rule }); this.y -= 8; }
}

export async function renderSignedProposalPdf(input: SignedProposalInput): Promise<Uint8Array> {
  const { snapshot: s, signer } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`${s.title} - signed`));
  pdf.setAuthor(safe(s.company.name));
  pdf.setSubject(`Content SHA-256 ${input.contentHash}`);
  pdf.setCreationDate(new Date(signer.signedAt));
  const kit = await brandDoc(pdf, { values: input.branding });
  const sigFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const tag = s.number ? `No. ${safe(s.number)}` : 'PROPOSAL';
  const w = new Writer(pdf, kit, safe(s.title).slice(0, 80) || 'Proposal', tag);

  // ── Prepared for / from ───────────────────────────────────────────────
  const colW = (w.width - 2 * M - 20) / 2;
  const top = w.y;
  w.label('Prepared for');
  w.text([s.prepared_for.name, s.prepared_for.company, s.prepared_for.email].filter(Boolean).join('\n'), { maxW: colW });
  const leftEnd = w.y;
  w.y = top;
  w.label('From', M + colW + 20);
  w.text([s.company.name, s.project_name ? `Project: ${s.project_name}` : '', `Issued ${fmtDay(s.sent_at)}`, s.valid_until ? `Valid until ${fmtDay(s.valid_until)}` : '']
    .filter(Boolean).join('\n'), { x: M + colW + 20, maxW: colW });
  w.y = Math.min(leftEnd, w.y) - 6;

  if (s.introduction) { w.label('Introduction'); w.text(s.introduction, { gap: 4 }); }

  // ── Line items ────────────────────────────────────────────────────────
  const xQty = w.width - M - 250, xUnit = w.width - M - 190, xPrice = w.width - M - 150, xAmt = w.width - M;
  const right = (t: string, x: number, size: number, bold = false) => {
    const f = bold ? kit.bold : kit.reg;
    w.page.drawText(t, { x: x - f.widthOfTextAtSize(t, size), y: w.y - size, size, font: f, color: DOC.ink });
  };
  if (s.line_items.length) {
    w.label('Line items');
    w.ensure(22);
    w.page.drawRectangle({ x: M, y: w.y - 16, width: w.width - 2 * M, height: 16, color: DOC.zebra });
    w.y -= 3;
    w.page.drawText('DESCRIPTION', { x: M + 6, y: w.y - 9, size: 7, font: kit.bold, color: DOC.muted });
    for (const [t, x] of [['QTY', xQty], ['UNIT PRICE', xPrice + 70], ['AMOUNT', xAmt - 6]] as const) {
      w.page.drawText(t, { x: x - kit.bold.widthOfTextAtSize(t, 7), y: w.y - 9, size: 7, font: kit.bold, color: DOC.muted });
    }
    w.page.drawText('UNIT', { x: xUnit, y: w.y - 9, size: 7, font: kit.bold, color: DOC.muted });
    w.y -= 17;
    for (const l of s.line_items) {
      const lines = wrap(l.description || '-', kit.reg, 9.5, xQty - M - 20);
      w.ensure(lines.length * 13 + 8);
      const rowTop = w.y;
      right(String(l.quantity), xQty, 9.5);
      w.page.drawText(safe(l.unit).slice(0, 10), { x: xUnit, y: w.y - 9.5, size: 9.5, font: kit.reg, color: DOC.ink });
      right(money(l.unit_price), xPrice + 70, 9.5);
      right(money(l.amount), xAmt - 6, 9.5, true);
      for (const ln of lines) { w.page.drawText(ln, { x: M + 6, y: w.y - 9.5, size: 9.5, font: kit.reg, color: DOC.ink }); w.y -= 13; }
      w.y = Math.min(w.y, rowTop - 13) - 4;
      w.page.drawLine({ start: { x: M, y: w.y + 2 }, end: { x: w.width - M, y: w.y + 2 }, thickness: 0.4, color: DOC.rule });
    }
  }
  w.ensure(30);
  w.y -= 6;
  w.page.drawRectangle({ x: w.width - M - 220, y: w.y - 24, width: 220, height: 24, color: DOC.highlight });
  w.page.drawText('TOTAL', { x: w.width - M - 212, y: w.y - 16, size: 8, font: kit.bold, color: DOC.muted });
  w.y -= 4;
  right(money(s.total), xAmt - 8, 13, true);
  w.y -= 30;

  for (const [label, body] of [['Scope of work', s.scope], ['Payment terms', s.payment_terms], ['Exclusions', s.exclusions]] as const) {
    if (body) { w.label(label); w.text(body, { gap: 4 }); }
  }

  // ── Acceptance ────────────────────────────────────────────────────────
  w.ensure(150);
  w.label('Acceptance');
  w.text(`Accepted and signed electronically by ${signer.name}${signer.title ? `, ${signer.title}` : ''}${s.prepared_for.company ? ` (${s.prepared_for.company})` : ''}.`, { size: 9.5, gap: 6 });
  const boxTop = w.y;
  if (signer.signaturePng && signer.signaturePng.length) {
    const img = await pdf.embedPng(signer.signaturePng);
    const h = 60;
    const iw = Math.min(260, (img.width * h) / img.height);
    w.page.drawImage(img, { x: M, y: boxTop - h, width: iw, height: h });
  } else {
    w.page.drawText(safe(signer.name).slice(0, 60), { x: M + 4, y: boxTop - 40, size: 26, font: sigFont, color: DOC.ink });
  }
  w.y = boxTop - 66;
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: M + 260, y: w.y }, thickness: 0.8, color: DOC.ink });
  w.y -= 4;
  w.text(`${signer.name}${signer.title ? ` - ${signer.title}` : ''}`, { size: 9, bold: true });
  w.text(`Signed ${fmtUtc(signer.signedAt)} - see the signature certificate`, { size: 8, color: DOC.muted });

  // ── Certificate ───────────────────────────────────────────────────────
  w.newPage();
  w.text('Signature Certificate', { size: 15, bold: true, gap: 2 });
  w.text('This page records how this proposal was signed. It is part of the signed document.', { size: 9, color: DOC.muted, gap: 6 });
  const row = (k: string, v: string) => {
    const lines = wrap(v || '-', kit.reg, 9.5, w.width - 2 * M - 150);
    w.ensure(lines.length * 13 + 6);
    w.page.drawText(k.toUpperCase(), { x: M, y: w.y - 9, size: 7.5, font: kit.bold, color: DOC.muted });
    for (const ln of lines) { w.page.drawText(ln, { x: M + 150, y: w.y - 9.5, size: 9.5, font: kit.reg, color: DOC.ink }); w.y -= 13; }
    w.y -= 4;
  };
  row('Document', `${s.title}${s.number ? ` (No. ${s.number})` : ''}`);
  row('Amount', money(s.total));
  row('Issued by', s.company.name);
  row('Content SHA-256', input.contentHash);
  row('Signer', signer.name);
  if (signer.title) row('Signer title', signer.title);
  row('Signer email', signer.email);
  row('Signature', signer.method === 'drawn' ? 'Drawn by hand on screen' : 'Typed name adopted as signature');
  row('Signed at', fmtUtc(signer.signedAt));
  row('IP address', signer.ip || 'unknown');
  row('Device', signer.userAgent || 'unknown');
  row('Consent', signer.consentText);
  row('Request ID', input.requestId);
  w.y -= 4;
  w.rule();
  w.text('Audit trail', { size: 11, bold: true, gap: 4 });
  for (const e of input.events) {
    const who = e.actor === 'signer' ? 'Signer' : 'Sender';
    const extra = e.detail && typeof e.detail === 'object' && typeof (e.detail as Record<string, unknown>).reason === 'string'
      ? ` - "${(e.detail as Record<string, string>).reason}"` : '';
    w.text(`${fmtUtc(e.created_at)}   ${EVENT_LABEL[e.event] || e.event} (${who})${e.ip ? `   IP ${e.ip}` : ''}${extra}`, { size: 8.5 });
  }
  w.y -= 6;
  w.text('The content fingerprint is the SHA-256 of the proposal content exactly as it was sent and shown to the signer. Any change to that content produces a different fingerprint.', { size: 8, color: DOC.muted });

  stampFooters(pdf, kit, `${safe(s.title).slice(0, 50)} - signed`);
  return pdf.save();
}
