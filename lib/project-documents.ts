/**
 * lib/project-documents.ts — every bid document a GC has put on a job.
 *
 * A GC does not file plans in one place. On a real job the plan set went up
 * through the takeoff, a sheet or two through the Drawings page, the spec book
 * through Specs, and a stray "A-201 Electrical Plan.pdf" through the Files
 * page. The bid jacket used to read exactly one of those tables per divider
 * (and for Specifications, a table nothing writes), so on the live database
 * not one of 89 jackets was complete while the plans sat a click away.
 *
 * This is the one reader. It gathers from every place a GC can put a document
 * on a job, tenant- and project-scoped, de-duplicated by the stored object, and
 * says which divider each belongs in:
 *
 *   drawings        the Drawing Register (Drawings page, takeoff plan register)  -> drawing
 *   specifications  the Specs page                                                -> specification
 *   takeoffs        the plan set uploaded for a takeoff (one entry per set)        -> drawing
 *   project_files   the Files page — classified by folder, category and name;
 *                   anything that is not recognisably a bid document is left OUT
 *
 * What is deliberately NOT gathered, because it must never reach a bidder:
 *   - project_files tagged to an entity (a contract markup, a permit letter, a
 *     file placed in ANOTHER package's jacket). Those belong to that thing.
 *   - project_files in a folder that holds the GC's own business — Contracts,
 *     Invoices & Pay Apps, Bonds & Insurance, Change Orders, RFIs, Submittals,
 *     Daily Reports, Closeout, Photos.
 *   - photos, video and audio, unless the GC filed an image under Drawings or
 *     its name is a sheet number (a PNG floor plan is a sheet; a site photo is
 *     not).
 *   - an unrecognised file. Sending every PDF on a job to every bidder would
 *     put the owner contract in front of twenty subs. A GC who wants one in a
 *     jacket places it with Add Document, which is explicit.
 *   - submittals: they are a subcontractor's own shop drawings and product
 *     data, and sending one sub's submittal to its competitors is a leak.
 *   - generated documents (Sage jackets, G70x, COI requests): documents about
 *     the job, not documents to price it from.
 *
 * Nothing is copied. Each entry references the stored object, so a file the
 * GC uploads anywhere on the job appears in every package on that job, live.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { storageObjectKey } from './storage-signing';

type Db = SupabaseClient<any, any, any>;

export type DocClass = 'drawing' | 'specification' | 'addendum' | 'other';

export type ProjectDocument = {
  /** Stable across reads. Drawing Register rows keep their bare id, which is
   *  what an issued manifest already holds for them. */
  id: string;
  source: 'drawing' | 'specification' | 'takeoff' | 'file';
  name: string;
  /** The stored reference, never a signed link — the caller resolves it. */
  url: string | null;
  docClass: DocClass;
  /** Shown beside the name: "Rev 2", "25 pages". */
  meta?: string;
  /** Shown under the name: a discipline, a division, a folder. */
  sub?: string;
  /** Sheet or section number, for ordering. */
  number: string | null;
  /** Identity of the stored object — a replaced file changes it. */
  fingerprint: string | null;
};

/* ── Classification ──────────────────────────────────────────────────────── */

/** Discipline designators a sheet number starts with (US National CAD Standard,
 *  plus the two-letter forms GCs actually use). W is left out on purpose: "W-9"
 *  is a tax form, not a sheet. */
const SHEET_PREFIXES = [
  'A', 'AD', 'AS', 'B', 'C', 'CS', 'D', 'E', 'ED', 'EL', 'EP', 'F', 'FA', 'FP', 'G', 'GI', 'H', 'I', 'ID',
  'L', 'LS', 'M', 'MD', 'MP', 'O', 'P', 'PD', 'PL', 'Q', 'R', 'S', 'SD', 'SS', 'T', 'TN', 'V', 'X', 'Z',
];
const SHEET_RE = new RegExp(
  `(?:^|[^A-Za-z0-9])((?:${SHEET_PREFIXES.join('|')})[-.\\s]?\\d{1,4}(?:\\.\\d{1,3})?)(?![A-Za-z0-9])`,
  'i',
);
/** AIA forms look like sheets (G702) and are not. */
const NOT_A_SHEET = /^(?:G-?7\d\d|I-?9)$/i;

/** "A-201", "S2.1", "E401" in a file name, or null. */
export function sheetNumberIn(name: string): string | null {
  const m = SHEET_RE.exec(name || '');
  if (!m) return null;
  const n = m[1].replace(/\s+/, '-').toUpperCase();
  return NOT_A_SHEET.test(n) ? null : n;
}

/** A CSI MasterFormat section number written the way a spec book writes it:
 *  "09 21 16", "26 05 00.13", or "Section 092116". A bare run of digits is
 *  not one — "ZZ AUDIT 123456" is a run id, not Division 12. */
export function csiSectionIn(name: string): string | null {
  const s = name || '';
  const spaced = /(?:^|\D)([0-4]\d [0-9]\d [0-9]\d(?:\.\d{2})?)(?!\d)/.exec(s);
  if (spaced) return spaced[1];
  const worded = /\bsection\s+([0-4]\d)\s?(\d\d)\s?(\d\d)\b/i.exec(s);
  return worded ? `${worded[1]} ${worded[2]} ${worded[3]}` : null;
}

/* "sheet" is left out: a "cut sheet" or "data sheet" is product data, not a plan. */
const DRAWING_WORDS = /\b(?:plans|plan set|drawings?|blueprints?|floor ?plans?|site plan|elevations?|reflected ceiling)\b/i;
const SPEC_WORDS = /\b(?:specs?|specifications?|project manual|spec book)\b/i;

/** Folders whose contents are the GC's own business, never a bidder's. */
const PRIVATE_FOLDERS = /^(?:contracts?|invoices?(?: & pay apps)?|pay apps?|bonds? & insurance|insurance|change orders?|rfis?|submittals?|daily reports?|closeout|photos?(?: & video)?|videos?|payroll|financials?|accounting)$/i;
/** Folders that hold documents bidders are routinely given. */
const BID_FOLDERS = /^(?:geotech(?:nical)?(?: & survey)?|survey|bid documents?|bid set|reports?)$/i;

/**
 * Which divider a project file belongs in, or null when it is not a bid
 * document and must stay off the jacket.
 */
export function classifyProjectFile(f: {
  name: string; category?: string | null; folder?: string | null; kind?: string | null; mime?: string | null;
}): DocClass | null {
  const name = String(f.name || '');
  const cat = String(f.category || '').trim().toLowerCase();
  const folder = String(f.folder || '').trim();
  const kind = String(f.kind || '').toLowerCase();
  const mime = String(f.mime || '').toLowerCase();
  const isImage = kind === 'image' || mime.startsWith('image/');
  const isMotion = kind === 'video' || kind === 'audio' || mime.startsWith('video/') || mime.startsWith('audio/');

  if (isMotion) return null;
  if (folder && PRIVATE_FOLDERS.test(folder)) return null;

  if (/addend/i.test(`${name} ${cat} ${folder}`)) return isImage ? null : 'addendum';
  if (/^(?:drawings?|plans?|blueprints?|sheets?)$/i.test(folder) || ['drawing', 'drawings', 'plans', 'blueprint', 'blueprints', 'sheet'].includes(cat)) return 'drawing';
  if (/^spec/i.test(folder) || ['specification', 'specifications', 'spec', 'specs'].includes(cat)) return isImage ? null : 'specification';

  if (!isImage && (SPEC_WORDS.test(name) || csiSectionIn(name))) return 'specification';
  if (sheetNumberIn(name) || DRAWING_WORDS.test(name.replace(/[-_]+/g, ' '))) return 'drawing';
  if (isImage) return null;
  if (folder && BID_FOLDERS.test(folder)) return 'other';
  return null;
}

/** Discipline from a sheet prefix, so trade-relevant sheets can be surfaced first. */
export function disciplineOfSheet(sheet: string | null): string | null {
  const p = /^([A-Z]{1,2})/.exec(String(sheet || '').toUpperCase())?.[1] || '';
  const map: Record<string, string> = {
    A: 'Architectural', AD: 'Architectural', AS: 'Architectural', S: 'Structural', SD: 'Structural', SS: 'Structural',
    M: 'Mechanical', MD: 'Mechanical', MP: 'Mechanical', E: 'Electrical', ED: 'Electrical', EL: 'Electrical', EP: 'Electrical',
    P: 'Plumbing', PD: 'Plumbing', PL: 'Plumbing', F: 'Fire Protection', FA: 'Fire Alarm', FP: 'Fire Protection',
    C: 'Civil', CS: 'Civil', L: 'Landscape', LS: 'Landscape', G: 'General', GI: 'General', I: 'Interiors', ID: 'Interiors',
    T: 'Telecommunications', TN: 'Telecommunications', Q: 'Equipment', R: 'Resource', V: 'Survey', H: 'Hazardous Materials',
  };
  return map[p] || null;
}

const stripExt = (n: string) => n.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || n;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** "E-101 — Power Plan", or just the name when the sheet number IS the name
 *  (the takeoff register files "Plan Set.pdf" as sheet "PLAN SET"). */
export function drawingName(sheet: string | null | undefined, name: string | null | undefined): string {
  const s = String(sheet || '').trim();
  const n = String(name || '').trim();
  if (s && n && (norm(n) === norm(s) || norm(n).startsWith(norm(s)))) return n;
  return [s, n].filter(Boolean).join(' — ') || 'Sheet';
}

const pages = (n: unknown) => {
  const c = Number(n);
  return Number.isFinite(c) && c > 0 ? `${c} page${c === 1 ? '' : 's'}` : null;
};

const division = (d: unknown) => {
  const s = String(d ?? '').trim();
  if (!s) return undefined;
  return /^\d{1,2}$/.test(s) ? `Division ${s.padStart(2, '0')}` : s;
};

/** Natural order on sheet / section numbers: A-2 before A-10. */
export function byNumber(a: { number: string | null; name: string }, b: { number: string | null; name: string }) {
  return (a.number || a.name).localeCompare(b.number || b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/* ── The reader ──────────────────────────────────────────────────────────── */

const fail = (what: string, error: { message?: string } | null) => {
  const e = new Error(`[project-documents] ${what} read failed: ${error?.message || 'unknown error'}`);
  (e as Error & { cause?: unknown }).cause = error;
  return e;
};

const DEAD_STATUS = /^(?:superseded|void|voided|archived|obsolete|deleted|withdrawn)$/i;

export async function projectDocuments(db: Db, tenantId: string, projectId: string | null | undefined): Promise<ProjectDocument[]> {
  if (!projectId) return [];

  const [drawings, specs, takeoffs, files] = await Promise.all([
    db.from('drawings')
      .select('id,name,url,sheet_number,discipline,version,status,file_hash,created_at')
      .eq('tenant_id', tenantId).eq('project_id', projectId).is('deleted_at', null)
      .order('sheet_number').limit(2000),
    db.from('specifications')
      .select('id,section_number,title,division,file_url,pdf_url,file_name,version,status,created_at')
      .eq('tenant_id', tenantId).eq('project_id', projectId)
      .order('section_number').limit(2000),
    db.from('takeoffs')
      .select('id,name,file_url,file_name,file_type,file_size,storage_path,page_count,source_files,rev_label,created_at')
      .eq('tenant_id', tenantId).eq('project_id', projectId).is('deleted_at', null)
      .not('file_url', 'is', null)
      .order('created_at', { ascending: false }).limit(500),
    db.from('project_files')
      .select('id,file_name,file_url,file_type,mime_type,kind,category,folder,file_hash,is_current,created_at')
      .eq('tenant_id', tenantId).eq('project_id', projectId).is('deleted_at', null).is('entity_type', null)
      .order('created_at', { ascending: false }).limit(2000),
  ]);
  if (drawings.error) throw fail('drawings', drawings.error);
  if (specs.error) throw fail('specifications', specs.error);
  if (takeoffs.error) throw fail('takeoffs', takeoffs.error);
  if (files.error) throw fail('project_files', files.error);

  const out: ProjectDocument[] = [];
  const seen = new Set<string>();
  /** First claim on a stored object wins; registered rows go first because
   *  they carry the richest metadata (sheet number, revision, discipline). */
  const claim = (u: string | null | undefined) => {
    const k = storageObjectKey(u) || (u ? String(u) : null);
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };

  for (const d of (drawings.data || []) as Record<string, any>[]) {
    if (DEAD_STATUS.test(String(d.status || ''))) continue;
    if (!claim(d.url)) continue;
    out.push({
      id: String(d.id),
      source: 'drawing',
      name: drawingName(d.sheet_number, d.name),
      url: d.url || null,
      docClass: 'drawing',
      meta: d.version ? `Rev ${d.version}` : undefined,
      sub: d.discipline || disciplineOfSheet(d.sheet_number) || undefined,
      number: d.sheet_number || null,
      fingerprint: d.file_hash || storageObjectKey(d.url) || d.url || null,
    });
  }

  for (const s of (specs.data || []) as Record<string, any>[]) {
    if (DEAD_STATUS.test(String(s.status || ''))) continue;
    const url = s.file_url || s.pdf_url || null;
    if (url && !claim(url)) continue;
    out.push({
      id: String(s.id),
      source: 'specification',
      name: [s.section_number, s.title].filter((x) => String(x || '').trim()).join(' — ') || 'Section',
      url,
      docClass: 'specification',
      meta: s.version ? `Rev ${s.version}` : undefined,
      sub: division(s.division),
      number: s.section_number || null,
      fingerprint: storageObjectKey(url) || url,
    });
  }

  /* A takeoff's plan set. Since the register learned to file each plan the
     takeoff was run on, the same sheets usually arrive through `drawings`
     first — then the set is already in the jacket and is not listed twice. The
     same file run through several takeoffs is one set, not three. */
  const sets = new Set<string>();
  for (const t of (takeoffs.data || []) as Record<string, any>[]) {
    const sources = (Array.isArray(t.source_files) ? t.source_files : []) as Array<{ path?: string; name?: string }>;
    const bucketOf = storageObjectKey(t.file_url)?.split('/')[0] || 'blueprints';
    const keys = [storageObjectKey(t.file_url), ...sources.map((s) => (s.path ? `${bucketOf}/${s.path}` : null))]
      .filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) continue;
    const label = sources.length > 1
      ? `${String(t.name || 'Plan set')} — ${sources.length} files`
      : stripExt(String(t.file_name || sources[0]?.name || t.name || 'Plan set'));
    const twin = `${norm(label)}|${Number(t.file_size) || ''}`;
    if (sets.has(twin)) continue;
    sets.add(twin);
    keys.forEach((k) => seen.add(k));
    const sheet = sheetNumberIn(label);
    out.push({
      id: `takeoff:${t.id}`,
      source: 'takeoff',
      name: label,
      url: t.file_url,
      docClass: 'drawing',
      meta: [t.rev_label, pages(t.page_count)].filter(Boolean).join(' · ') || undefined,
      sub: 'Plan set',
      number: sheet,
      fingerprint: storageObjectKey(t.file_url) || t.file_url,
    });
  }

  for (const f of (files.data || []) as Record<string, any>[]) {
    if (f.is_current === false) continue;
    const name = String(f.file_name || '');
    const docClass = classifyProjectFile({ name, category: f.category, folder: f.folder, kind: f.kind, mime: f.mime_type || f.file_type });
    if (!docClass) continue;
    if (!claim(f.file_url)) continue;
    const label = stripExt(name);
    const number = docClass === 'specification' ? csiSectionIn(label) : sheetNumberIn(label);
    out.push({
      id: `file:${f.id}`,
      source: 'file',
      name: label || 'Document',
      url: f.file_url || null,
      docClass,
      meta: undefined,
      sub: docClass === 'drawing' ? (disciplineOfSheet(number) || f.folder || undefined) : (f.folder || undefined),
      number,
      fingerprint: f.file_hash || storageObjectKey(f.file_url) || f.file_url || null,
    });
  }

  return out;
}
