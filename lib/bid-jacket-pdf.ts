/**
 * lib/bid-jacket-pdf.ts: the printed bid jacket, made from the live one.
 *
 * There is exactly one way to make a jacket PDF, and it is this file:
 *   - the GC's Download PDF  (POST /api/bid-packages/[id]/generate-jacket)
 *   - a new package          (lib/triggers onBidPackageCreated, a direct call)
 *   - Sage's takeoff run     (app/api/takeoff/[id]/sage-auto-docs)
 *
 * What was here before was three different documents. The route printed
 * boilerplate instructions, insurance limits nobody had entered and an owner
 * that was always blank. Sage printed its own guesses. The trigger reached
 * the route over HTTP with no login, was refused, and an empty catch hid it,
 * so most stored PDFs were whatever Sage wrote when the package was created.
 * A fourth path (document-generator) read a table that does not exist.
 *
 * Now the PDF is built from assembleJacket(), the same assembly the GC and
 * bidder screens show, without the correspondence (the PDF is what a bidder
 * receives). jacketToPdfInput() is the only place that decides what the PDF
 * says. Change the jacket and the PDF follows.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assembleJacket, type Jacket } from '@/lib/bid-jacket';
import {
  generateBidJacket, saveDocument, resolveBranding,
  type BidJacketPdfInput, type BidJacketPdfDoc, type DocBranding,
} from '@/lib/pdf-engine';
import { resolveTenantCompany, type TenantCompany } from '@/lib/tenant-company';
import { signUrl } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';

type Db = SupabaseClient<any, any, any>;

/** Bump when the layout changes, so stored PDFs of unchanged jackets are rebuilt. */
const LAYOUT_VERSION = 2;
const DAY = 86_400_000;

/* ── Formatting ─────────────────────────────────────────────────────────── */

/* Deadlines print with their zone named, so the instant is never ambiguous.
   The zone is the job's (by state) because that is where bids are due;
   anywhere unlisted uses the product's default. */
const ZONE_BY_STATE: Record<string, string> = {
  AZ: 'America/Phoenix', CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles',
  WA: 'America/Los_Angeles', UT: 'America/Denver', CO: 'America/Denver', NM: 'America/Denver', TX: 'America/Chicago',
};
export const DEFAULT_ZONE = 'America/Phoenix';
export const zoneFor = (state: unknown) => ZONE_BY_STATE[String(state ?? '').trim().toUpperCase()] || DEFAULT_ZONE;

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };

/**
 * A date as a bidder should read it.
 *  - "2026-10-20" (a date column) is that calendar day. No zone shift: read as
 *    UTC midnight it used to print as the day before in Arizona.
 *  - A timestamp at exactly 00:00 UTC is a date typed without a time and is
 *    treated the same way.
 *  - Any other timestamp shows its time in the job's zone, with the zone named.
 */
export function fmtWhen(v: unknown, zone: string): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = ymd ? new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3])) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  if (ymd || (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)) {
    return d.toLocaleDateString('en-US', { ...LONG_DATE, timeZone: 'UTC' });
  }
  const date = d.toLocaleDateString('en-US', { ...LONG_DATE, timeZone: zone });
  const time = d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return `${date}, ${time}`;
}

/** A coverage figure as entered. Numbers (or numeric text) read as dollars; "Statutory" stays "Statutory". */
export function fmtCoverage(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : null;
  if (typeof v === 'boolean') return v ? 'Required' : 'Not required';
  const s = String(v).trim();
  if (!s) return null;
  const n = s.replace(/[$,\s]/g, '');
  if (/^\d+(\.\d+)?$/.test(n)) return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return s;
}

const humanize = (k: string) => {
  const t = k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* GL, auto and WC are written several ways (columns, JSON keys, requirement
   types). One key per coverage, so the same limit is not printed twice. */
const COVERAGE_KEY: Record<string, string> = {
  generalliability: 'gl', gl: 'gl', cgl: 'gl', commercialgeneralliability: 'gl',
  autoliability: 'auto', auto: 'auto', automobileliability: 'auto', commercialauto: 'auto',
  workerscomp: 'wc', workerscompensation: 'wc', wc: 'wc',
  minimumcoverage: 'min',
};
const coverageKey = (label: string) => COVERAGE_KEY[label.toLowerCase().replace(/[^a-z]/g, '')] ?? null;

/**
 * Insurance text as a bidder can read it. Sage wrote an object into this
 * TEXT column, so most packages hold {"general_liability": …} JSON. That is
 * still what was entered, so it is turned into label/value lines rather than
 * printed as raw JSON or dropped. Anything else is printed as written.
 */
export function readInsuranceText(text: unknown): { entries: Array<{ label: string; value: string }>; text: string | null } {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return { entries: [], text: null };
  if (t.startsWith('{')) {
    let parsed: unknown = null;
    try { parsed = JSON.parse(t); } catch { parsed = null; /* text that happens to start with a brace: print it */ }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries: Array<{ label: string; value: string }> = [];
      const walk = (o: Record<string, unknown>, prefix: string) => {
        for (const [k, v] of Object.entries(o)) {
          const label = prefix ? `${prefix} - ${humanize(k)}` : humanize(k);
          if (v && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, label);
          else {
            const value = Array.isArray(v) ? v.map((x) => fmtCoverage(x) ?? '').filter(Boolean).join(', ') : fmtCoverage(v);
            if (value) entries.push({ label, value });
          }
        }
      };
      walk(parsed as Record<string, unknown>, '');
      return { entries, text: null };
    }
  }
  return { entries: [], text: t };
}

/** The owner as text. owner_entity is a TEXT column; on some jobs it holds "{}". */
export function ownerOf(project: Record<string, any> | null | undefined): { name: string; address: string } | null {
  const p = project || {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  let name = str(p.owner_entity);
  let address = str(p.owner_address);
  if (name.startsWith('{')) {
    let o: Record<string, unknown> | null = null;
    try { o = JSON.parse(name); } catch { o = null; /* not JSON: keep it as the name */ }
    if (o && typeof o === 'object') { name = str(o.name); address = address || str(o.address); }
  }
  name = name || str(p.owner_name);
  return name ? { name, address } : null;
}

const fmtQty = (q: unknown) => {
  if (q == null || q === '') return '';
  const n = Number(q);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(q);
};

/* ── The mapping: Jacket → what the PDF prints ─────────────────────────── */

/** Sections whose documents form the index even when empty, so "none" is said out loud. */
const INDEX_SECTIONS = new Set(['drawings', 'specs', 'addenda', 'attachments']);

export type PdfContext = {
  gc: TenantCompany;
  owner: { name: string; address: string } | null;
  zone: string;
  preparedOn: Date;
};

/**
 * Everything the printed jacket says, decided here and only here.
 *
 * Coded against the Jacket that assembleJacket returns. The document index is
 * every section that carries documents (whatever assembleJacket puts in them),
 * so new sources of drawings or specs reach the PDF without a change here.
 * GC-only parts of the jacket (bidder counts, estimated value, completeness,
 * correspondence) are never read.
 */
export function jacketToPdfInput(jacket: Jacket, ctx: PdfContext): BidJacketPdfInput {
  const k = jacket.package;
  const pr = jacket.project;
  const section = (key: string) => jacket.sections.find((s) => s.key === key);

  const cityLine = [pr.city, pr.state].filter(Boolean).join(', ');
  const street = String(pr.address || '').trim();
  const address = street && cityLine && street.toLowerCase().includes(String(pr.city || '').toLowerCase())
    ? street
    : [street, cityLine].filter(Boolean).join(', ');

  const headline = String(k.trade || k.name || 'Bid Package');
  const detail = [
    k.name && k.name !== headline ? k.name : null,
    k.number ? `Package ${k.number}` : null,
    k.csiDivision ? `CSI Division ${k.csiDivision}` : null,
  ].filter(Boolean).join(' | ');

  const preBidWhen = fmtWhen(k.preBidDate, ctx.zone);
  const preBid = preBidWhen || k.preBidLocation
    ? [preBidWhen, k.preBidLocation, k.preBidRequired ? 'Attendance required' : null].filter(Boolean).join(' - ')
    : k.preBidRequired ? 'Attendance required (date and place not provided)' : null;

  const invitation = section('invitation')?.pages ?? [];
  const instructions = invitation.length
    ? invitation.map((p) => (invitation.length > 1 ? `${p.title}\n${p.body}` : p.body)).join('\n\n')
    : null;

  // Insurance & bonding, in the order and words of the live jacket.
  const r = jacket.requirements;
  const cover: Array<{ label: string; value: string | null }> = [
    { label: 'General Liability', value: fmtCoverage(r.generalLiability) },
    { label: 'Auto Liability', value: fmtCoverage(r.autoLiability) },
    { label: "Workers' Comp", value: fmtCoverage(r.workersComp) },
    { label: 'Minimum Coverage', value: fmtCoverage(r.insuranceAmount) },
  ];
  const fromText = readInsuranceText(r.insuranceText);
  const extra: Array<{ label: string; value: string }> = [];
  for (const e of fromText.entries) {
    const key = coverageKey(e.label);
    const slot = key ? cover.find((c) => coverageKey(c.label) === key) : undefined;
    if (slot) { if (!slot.value) slot.value = e.value; } else extra.push(e);
  }
  const additional = (r.additional ?? []).map((a) => ({
    label: `${a.type}${a.required ? '' : ' (optional)'}`,
    value: [a.coverage != null ? fmtCoverage(a.coverage) : null, a.description, a.notes].filter(Boolean).join(' - ')
      || (a.required ? 'Required' : 'Optional'),
  }));
  const insurance = {
    lines: [
      ...cover.map((c) => ({ label: c.label, value: c.value ?? 'Not provided' })),
      ...extra,
      { label: 'Payment & Performance Bond', value: r.bond ? 'Required' : 'Not required' },
      { label: 'Prevailing Wage', value: r.prevailingWage ? 'Required' : 'Not required' },
      ...additional,
    ],
    text: fromText.text,
  };

  const index = jacket.sections
    .filter((s) => s.key !== 'correspondence' && (s.docs.length > 0 || INDEX_SECTIONS.has(s.key)))
    .map((s) => ({
      label: s.label,
      docs: s.docs.map((d): BidJacketPdfDoc => ({ name: d.name, meta: d.meta, sub: d.sub, url: d.url })),
    }));

  return {
    gc: { name: ctx.gc.name, address: ctx.gc.address, license: ctx.gc.license },
    project: { name: String(pr.name || k.name || 'Project'), address },
    owner: ctx.owner,
    pkg: {
      name: String(k.name || headline),
      headline,
      detail,
      due: fmtWhen(k.dueDate, ctx.zone),
      validity: k.validityDays != null ? `${k.validityDays} days` : null,
      preBid,
    },
    instructions,
    scope: (section('scope')?.pages ?? []).map((p) => ({ title: p.title, body: p.body })),
    lineItems: jacket.lineItems.map((li) => ({
      code: String(li.code || ''),
      description: String(li.description || ''),
      quantity: fmtQty(li.quantity),
      unit: String(li.unit || ''),
    })),
    insurance,
    index,
    linksValidUntil: null,
    preparedOn: ctx.preparedOn.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: ctx.zone }),
  };
}

/* ── Links in the index ─────────────────────────────────────────────────── */

/**
 * How long the index's links work. A bidder needs the files until bids are
 * due, so links last until two weeks after the due date: at least a week,
 * at most sixty days, thirty days when there is no due date. After that the
 * bidder's invitation link (the portal) always has the current set.
 */
export function linkWindow(due: unknown, now: Date): { seconds: number; until: Date } {
  let end = now.getTime() + 30 * DAY;
  if (due) {
    const s = String(due);
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const t = ymd ? Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3], 23, 59) : new Date(s).getTime();
    if (Number.isFinite(t)) end = t + 14 * DAY;
  }
  end = Math.min(Math.max(end, now.getTime() + 7 * DAY), now.getTime() + 60 * DAY);
  return { seconds: Math.round((end - now.getTime()) / 1000), until: new Date(end) };
}

/** Swap each stored file reference for a link that opens without a login. */
async function signIndex(input: BidJacketPdfInput, seconds: number): Promise<BidJacketPdfInput> {
  const index = await Promise.all(input.index.map(async (s) => ({
    ...s,
    docs: await Promise.all(s.docs.map(async (d) => {
      if (!d.url) return d;
      const signed = await signUrl(d.url, seconds);
      // signUrl returns '' (logged) when signing failed, and a bare path unchanged. Neither is a link.
      return { ...d, url: /^https?:\/\//i.test(signed) ? signed : null };
    })),
  })));
  return { ...input, index };
}

/* ── Store ──────────────────────────────────────────────────────────────── */

/** Identity of what the PDF says. Excludes the print date and link expiry, which differ every run. */
function contentHash(input: BidJacketPdfInput, branding: DocBranding): string {
  const { preparedOn: _p, linksValidUntil: _l, ...content } = input;
  void _p; void _l;
  return createHash('sha256')
    .update(JSON.stringify({ v: LAYOUT_VERSION, content, brand: [branding.whiteLabel, branding.companyName, branding.logoUrl, branding.accent] }))
    .digest('hex')
    .slice(0, 32);
}

/* saveDocument hands back a SIGNED url that dies in an hour. Store the
   object's own address instead; every reader signs on read (/api/files/open
   for the GC, signUrl in the bidder portal). */
const SIGNED = '/storage/v1/object/sign/';
const PUBLIC = '/storage/v1/object/public/';
export const stableStorageUrl = (u: string) => (u.includes(SIGNED) ? u.replace(SIGNED, PUBLIC).replace(/\?.*$/, '') : u);

export type JacketPdfResult = {
  /** Opens now (signed for an hour). */
  pdfUrl: string;
  /** What bid_packages.jacket_pdf_url holds; never expires, signed on read. */
  storedUrl: string;
  generatedAt: string;
  /** True when the jacket had not changed and the stored PDF was handed back. */
  reused: boolean;
};

/**
 * Build the jacket PDF from the live jacket, store it, and point the package
 * at it. Returns null when the package is not this tenant's.
 *
 * When nothing in the jacket has changed since the last stored PDF, and that
 * PDF's links still have three days left, that PDF is returned instead of
 * filing an identical copy. Every Download press used to add another row
 * called "Bid Jacket" to Documents.
 *
 * Throws DocumentNotStoredError when storage refuses the file, and the
 * database error when the package row cannot be updated. Callers decide what
 * that means; nothing here swallows it.
 *
 * Does NOT touch jacket_generated_at: that column records when the jacket was
 * ISSUED (the jacket route's "issued" banner and the addendum gate read it).
 */
export async function storeJacketPdf(db: Db, opts: { packageId: string; tenantId: string; now?: Date }): Promise<JacketPdfResult | null> {
  const { packageId, tenantId } = opts;
  const now = opts.now ?? new Date();

  const { data: row, error } = await db
    .from('bid_packages')
    .select('*, projects(*)')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const p = row as Record<string, any>;
  const project = (p.projects || {}) as Record<string, any>;
  const projectId = String(p.project_id || project.id || '');
  if (!projectId) throw new Error(`[bid-jacket-pdf] package ${packageId} has no project`);

  // The bidder's jacket: no correspondence. File references stay as stored
  // here; they are signed for the PDF only when a new one is actually made.
  const jacket = await assembleJacket(db, { packageId, tenantId, pkg: p, resolveUrl: (u) => u ?? null });

  const [gc, branding] = await Promise.all([resolveTenantCompany(db, tenantId, project), resolveBranding(tenantId)]);
  const base = jacketToPdfInput(jacket, { gc, owner: ownerOf(project), zone: zoneFor(project.state), preparedOn: now });
  const hash = contentHash(base, branding);

  const { data: prev, error: prevErr } = await db
    .from('generated_documents')
    .select('id, pdf_url, data_snapshot, created_at')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'bid_package')
    .eq('source_id', packageId)
    .eq('doc_type', 'bid-jacket')
    .order('created_at', { ascending: false })
    .limit(1);
  if (prevErr) throw prevErr;
  const last = ((prev || []) as Record<string, any>[])[0];
  const snap = (last?.data_snapshot || {}) as Record<string, any>;
  const linksLast = !snap.linksValidUntil || Date.parse(snap.linksValidUntil) > now.getTime() + 3 * DAY;
  if (last?.pdf_url && snap.contentHash === hash && linksLast) {
    const storedUrl = stableStorageUrl(String(last.pdf_url));
    if (p.jacket_pdf_url !== storedUrl) {
      await must(db.from('bid_packages').update({ jacket_pdf_url: storedUrl }).eq('id', packageId).eq('tenant_id', tenantId), 'bid_packages jacket_pdf_url');
    }
    const signed = await signUrl(storedUrl, 3600);
    return { pdfUrl: signed || storedUrl, storedUrl, generatedAt: String(last.created_at), reused: true };
  }

  const win = linkWindow(jacket.package.dueDate, now);
  const signedInput = await signIndex(base, win.seconds);
  const anyLink = signedInput.index.some((s) => s.docs.some((d) => d.url));
  const input: BidJacketPdfInput = {
    ...signedInput,
    linksValidUntil: anyLink ? win.until.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: zoneFor(project.state) }) : null,
  };

  const bytes = await generateBidJacket(input, branding);
  const signedPdf = await saveDocument(
    projectId, 'bid-jacket', bytes,
    { bidPackageId: packageId, contentHash: hash, linksValidUntil: anyLink ? win.until.toISOString() : null, layout: LAYOUT_VERSION },
    tenantId,
    /* The package name is what tells one jacket from the next in Documents;
       the id is what lets the library open the live jacket instead. */
    { title: p.name || p.trade || 'Bid Jacket', sourceType: 'bid_package', sourceId: packageId },
  );
  const storedUrl = stableStorageUrl(signedPdf);
  await must(db.from('bid_packages').update({ jacket_pdf_url: storedUrl }).eq('id', packageId).eq('tenant_id', tenantId), 'bid_packages jacket_pdf_url');

  return { pdfUrl: signedPdf, storedUrl, generatedAt: now.toISOString(), reused: false };
}
