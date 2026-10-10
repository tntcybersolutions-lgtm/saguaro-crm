/**
 * lib/bid-jacket.ts — what is inside a bid jacket.
 *
 * One assembly, two readers: the GC's authed view and the bidder's token-gated
 * portal view. They MUST agree. The whole reason a bid package had never once
 * reached a subcontractor is that the GC half and the sub half were written
 * against different tables and drifted until neither worked — so the assembly
 * lives here, called from both, rather than copied into the portal route.
 *
 * The only thing that differs between callers is how a stored file reference
 * becomes an openable URL, so that is the one injected parameter:
 *
 *   GC     -> /api/files/open?u=…   (proxy; calls getUser, 401s for a bidder)
 *   bidder -> a real signed URL     (the proxy would give them dead links)
 *
 * …and what the bidder is allowed to see, which forBidder() strips.
 *
 * Nothing here invents content. A section with no rows comes back empty and is
 * reported as missing, because a jacket you can see through is one the GC needs
 * to fix before sending, not one to paper over. A read that FAILS throws: an
 * error dressed up as an empty divider is how Specifications stayed silently
 * empty on every package for as long as it read a table nothing writes.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCorrespondence, type CommItem } from './jacket-correspondence';
import { projectDocuments, byNumber, type ProjectDocument } from './project-documents';
import { storageObjectKey } from './storage-signing';
import { coverageValue, parseInsuranceText, insuranceSentence, INSURANCE_AMOUNT_DEFAULT } from './jacket-insurance';

export { coverageValue, parseInsuranceText, insuranceSentence, INSURANCE_AMOUNT_DEFAULT } from './jacket-insurance';

export type JacketDoc = {
  id: string;
  name: string;
  url: string | null;
  meta?: string;
  sub?: string;
  kind: 'pdf' | 'sheet' | 'spec' | 'form' | 'text';
  /** Identity of the stored file. A drawing replaced under the same revision
   *  number is still a different drawing, and drift has to say so. */
  fp?: string | null;
};

/** A written page. Lists (work included / excluded) carry their items so they
 *  render as bullets; `body` holds the same text for anything that reads prose. */
export type JacketPage = { id: string; title: string; body: string; bullets?: string[] };

export type JacketSection = {
  key: string;
  label: string;
  required: boolean;
  count: number;
  pages: JacketPage[];
  docs: JacketDoc[];
};

/** Turns a stored file reference into something the caller's audience can open. */
export type ResolveUrl = (stored: string | null | undefined) => Promise<string | null> | string | null;

type Db = SupabaseClient<any, any, any>;
type Row = Record<string, any>;

/** Drawings a given trade cares about, surfaced first. Nothing is hidden — a
 *  bidder must still be able to reach the whole set — but a plumber should not
 *  have to scroll past the electrical package to find P-101. */
const DISCIPLINE_FOR_TRADE: Record<string, RegExp> = {
  electrical: /^e|electric/i,
  plumbing: /^p|plumb/i,
  mechanical: /^m|mech|hvac/i,
  structural: /^s|struct/i,
  civil: /^c|civil/i,
  architectural: /^a|arch/i,
  fire: /^f|fire/i,
};

/* ── Written pages ─────────────────────────────────────────────────────────── */

const pageId = (title: string) => title.toLowerCase().replace(/\W+/g, '-');

/**
 * A page from a column. Text columns give prose; the text[] columns
 * (work_included, work_excluded) give a bullet list — they used to be dropped
 * because only strings were accepted.
 */
export function writtenPage(title: string, body: unknown): JacketPage | null {
  if (Array.isArray(body)) {
    const bullets = body.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return bullets.length ? { id: pageId(title), title, body: bullets.map((b) => `• ${b}`).join('\n'), bullets } : null;
  }
  const t = typeof body === 'string' ? body.trim() : '';
  return t ? { id: pageId(title), title, body: t } : null;
}

/* ── Insurance & bonding ───────────────────────────────────────────────────── */

export type JacketRequirements = {
  bond: boolean;
  prevailingWage: boolean;
  /** Null unless the GC actually set it — see deriveRequirements. */
  insuranceAmount: number | null;
  generalLiability: number | string | null;
  autoLiability: number | string | null;
  workersComp: number | string | null;
  insuranceText: string | null;
  additional: Array<{
    id: string; type: string; description: string | null;
    coverage: number | null; required: boolean; notes: string | null;
  }>;
};

/**
 * Insurance & bonding terms, from the bid_packages columns and any
 * bid_package_requirements rows. The structured rows win where they overlap — a
 * GC who recorded a specific requirement meant it.
 *
 * insurance_required_amount defaults to 1,000,000 at the column, so every
 * package had a "$1,000,000 minimum" nobody entered and the section could never
 * be empty. It is shown only beside other insurance terms, or when it is not
 * the default, and it never satisfies the section on its own.
 */
export function deriveRequirements(p: Row, reqRows: Row[]): { requirements: JacketRequirements; satisfied: boolean } {
  const reqOf = (re: RegExp) => reqRows.find((r) => re.test(String(r.requirement_type || r.description || '')));
  const cov = (r: Row | undefined) => (r && r.min_coverage != null ? coverageValue(r.min_coverage) : null);
  const num = (v: number | string | null) => (typeof v === 'number' ? v : null);
  const SIX = /bond|prevailing|davis.?bacon|general.?liab|\bgl\b|cgl|auto|workers?.?comp|\bwc\b|umbrella|excess|aggregate|minimum/i;

  const parsed = parseInsuranceText(p.insurance_requirements);
  const generalLiability = cov(reqOf(/general.?liab|\bgl\b|cgl/i)) ?? coverageValue(p.general_liability) ?? parsed.gl;
  const autoLiability = cov(reqOf(/auto/i)) ?? coverageValue(p.auto_liability) ?? parsed.auto;
  const workersComp = cov(reqOf(/workers?.?comp|\bwc\b/i)) ?? coverageValue(p.workers_compensation) ?? parsed.wc;
  /* A JSON value's sentence is derived, so it is rebuilt from the figures
     actually in force — a GL column set to $3M must not sit under a sentence
     still reading $2M. Text a GC wrote is shown as written. */
  const fromJson = parsed.structured
    ? [insuranceSentence({ gl: generalLiability, auto: autoLiability, wc: workersComp }), ...parsed.others].filter(Boolean).join('\n') || null
    : parsed.text;
  const insuranceText = fromJson ?? (reqOf(/insurance/i)?.description ? String(reqOf(/insurance/i)!.description) : null);

  const additional = reqRows
    .filter((r) => !SIX.test(String(r.requirement_type || '')))
    .map((r) => ({
      id: String(r.id),
      type: r.requirement_type || 'Requirement',
      description: r.description || null,
      coverage: num(coverageValue(r.min_coverage)),
      required: r.is_required !== false,
      notes: r.notes || null,
    }));

  const bond = !!p.requires_bond || !!reqOf(/bond/i)?.is_required;
  const prevailingWage = !!p.requires_prevailing_wage || !!reqOf(/prevailing|davis.?bacon/i)?.is_required;

  const otherInsuranceTerms =
    !!insuranceText || generalLiability != null || autoLiability != null || workersComp != null ||
    additional.length > 0 || reqRows.length > 0;

  const amountRow = num(cov(reqOf(/umbrella|excess|aggregate|minimum/i)));
  const amountColumn = num(coverageValue(p.insurance_required_amount));
  const insuranceAmount = amountRow
    ?? (amountColumn != null && (otherInsuranceTerms || amountColumn !== INSURANCE_AMOUNT_DEFAULT) ? amountColumn : null);

  return {
    requirements: { bond, prevailingWage, insuranceAmount, generalLiability, autoLiability, workersComp, insuranceText, additional },
    satisfied: otherInsuranceTerms || bond || prevailingWage,
  };
}

/* ── Where a placed document goes ──────────────────────────────────────────── */

export type DividerKey = 'drawings' | 'specs' | 'addenda' | 'attachments';

/** The divider for a document the GC placed in this jacket. Their category is
 *  the decision — a "Site Logistics Plan" filed as an attachment stays one. */
export function dividerForCategory(category: unknown): DividerKey {
  const c = String(category || '').trim().toLowerCase();
  if (/addend/.test(c)) return 'addenda';
  if (c === 'drawing' || c === 'drawings') return 'drawings';
  if (c === 'specification' || c === 'specifications' || c === 'spec' || c === 'specs') return 'specs';
  return 'attachments';
}

const DIVIDER_FOR_CLASS: Record<ProjectDocument['docClass'], DividerKey> = {
  drawing: 'drawings', specification: 'specs', addendum: 'addenda', other: 'attachments',
};

const readFailed = (what: string, error: { message?: string } | null) => {
  const e = new Error(`[bid-jacket] ${what} read failed: ${error?.message || 'unknown error'}`);
  (e as Error & { cause?: unknown }).cause = error;
  return e;
};

/** Two-digit CSI divisions the package covers ("26" from "26 05 00"). */
function packageDivisions(p: Row): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => { const d = String(v ?? '').replace(/\s/g, '').slice(0, 2); if (/^\d\d$/.test(d)) out.add(d); };
  add(p.csi_division);
  if (Array.isArray(p.csi_codes)) p.csi_codes.forEach(add);
  return out;
}

/* ── The assembly ──────────────────────────────────────────────────────────── */

export async function assembleJacket(
  db: Db,
  opts: {
    packageId: string; tenantId: string; pkg: Row; resolveUrl: ResolveUrl;
    /** GC view only: every email, chat, ask and bid on the package. Never for a bidder, the PDF or the issued snapshot. */
    includeCorrespondence?: boolean;
  },
) {
  const { packageId, tenantId, pkg, resolveUrl, includeCorrespondence = false } = opts;
  const p = pkg;
  const project = p.projects || {};
  const projectId = p.project_id;

  const [items, packageDocs, packageReqs, invites, submissions, onJob] = await Promise.all([
    /* sort_order first; every legacy row has 0 there, so created_at then id
       make the order stable instead of whatever the planner returns today. */
    db.from('bid_package_items').select('*').eq('bid_package_id', packageId).eq('tenant_id', tenantId)
      .order('sort_order').order('created_at').order('id'),
    db.from('bid_package_documents').select('id,file_name,file_url,file_type,category,label,sort_order,created_at')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId).is('deleted_at', null).order('sort_order').order('created_at'),
    db.from('bid_package_requirements').select('id,requirement_type,description,min_coverage,is_required,notes')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId),
    db.from('bid_package_invites').select('id,sub_id,company_name,sub_name,sub_email,trade,status,response_status,invited_at,invitation_sent_at,invitation_viewed_at')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId),
    db.from('bid_submissions').select('id,sub_id,company_name,sub_name,base_amount,amount,base_bid,status,submitted_at,received_at,created_at,clarifications,exclusions,notes')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId),
    /* Every document on the job, from wherever the GC put it. */
    projectDocuments(db, tenantId, projectId),
  ]);
  for (const [what, r] of [
    ['bid_package_items', items], ['bid_package_documents', packageDocs], ['bid_package_requirements', packageReqs],
    ['bid_package_invites', invites], ['bid_submissions', submissions],
  ] as const) {
    if (r.error) throw readFailed(what, r.error);
  }

  const url = async (u: string | null | undefined) => (u ? await resolveUrl(u) : null);

  /* ── Documents ──────────────────────────────────────────────────────────
     Two sources, one shelf. Documents the GC placed in THIS jacket come first,
     in the divider they chose. Then everything on the job, classified by
     lib/project-documents. A file placed here that is also on the job is
     listed once, as the placed one. */
  const placed = (packageDocs.data || []) as Row[];
  const objectOf = (u: string | null | undefined) => storageObjectKey(u) || (u ? String(u) : null);
  const placedObjects = new Set(placed.map((f) => objectOf(f.file_url)).filter(Boolean) as string[]);

  const shelves: Record<DividerKey, JacketDoc[]> = { drawings: [], specs: [], addenda: [], attachments: [] };

  for (const f of placed) {
    const divider = dividerForCategory(f.category);
    shelves[divider].push({
      id: String(f.id),
      /* `label` is the name the GC gave it when placing it in the jacket, which
         reads better on the shelf than the uploaded filename. */
      name: String(f.label || f.file_name || 'Untitled').replace(/\.(?:pdf|dwg|dxf|docx?|xlsx?|png|jpe?g|tiff?)$/i, '') || 'Untitled',
      url: await url(f.file_url),
      meta: f.file_type ? String(f.file_type).replace(/^application\//, '').toUpperCase() : undefined,
      sub: divider === 'attachments' && f.category && !/^attachment$/i.test(f.category) ? String(f.category) : 'Placed in this jacket',
      kind: divider === 'drawings' ? 'sheet' : divider === 'specs' ? 'spec' : 'pdf',
      fp: objectOf(f.file_url),
    });
  }

  const trade = String(p.trade || '').toLowerCase();
  const relevantDiscipline = Object.entries(DISCIPLINE_FOR_TRADE).find(([k]) => trade.includes(k))?.[1] ?? null;
  const divisions = packageDivisions(p);
  const specDivision = (d: ProjectDocument) => String(d.number || '').replace(/\s/g, '').slice(0, 2);
  const relevant = (d: ProjectDocument) =>
    d.docClass === 'drawing' ? !!relevantDiscipline && relevantDiscipline.test(String(d.sub || ''))
      : d.docClass === 'specification' ? divisions.has(specDivision(d)) : false;

  const jobDocs = ((onJob || []) as ProjectDocument[])
    .filter((d) => !placedObjects.has(objectOf(d.url) || ''))
    .sort(byNumber)
    /* Stable: within "relevant" and "the rest" the sheet order holds. */
    .sort((a, b) => (relevant(a) ? 0 : 1) - (relevant(b) ? 0 : 1));

  const jobShelved = await Promise.all(jobDocs.map(async (d) => ({
    divider: DIVIDER_FOR_CLASS[d.docClass],
    doc: {
      id: d.id,
      name: d.name,
      url: await url(d.url),
      meta: d.meta,
      sub: d.sub,
      kind: d.docClass === 'drawing' ? 'sheet' : d.docClass === 'specification' ? 'spec' : 'pdf',
      fp: d.fingerprint,
    } as JacketDoc,
  })));
  for (const { divider, doc } of jobShelved) shelves[divider].push(doc);

  const lineItems = ((items.data || []) as Row[]).map((i) => ({
    id: String(i.id),
    code: i.csi_code || i.code || i.cost_code || '',
    description: i.description || i.title || '',
    quantity: i.quantity ?? null,
    unit: i.unit || i.uom || '',
  }));

  /* Columns nothing writes yet (coordination, quality, special requirements)
     only appear when they hold something — an empty heading is noise. */
  const scopePages = [
    writtenPage('Scope Narrative', p.scope_narrative || p.scope_of_work || p.scope_summary),
    writtenPage('Work Included', p.work_included),
    writtenPage('Work Excluded', p.work_excluded),
    writtenPage('Coordination Notes', p.coordination_notes),
    writtenPage('Quality Standards', p.quality_standards),
    writtenPage('Special Requirements', p.special_requirements),
  ].filter(Boolean) as JacketPage[];

  const invitationPages = [writtenPage('Instructions to Bidders', p.bid_instructions)].filter(Boolean) as JacketPage[];

  const { requirements, satisfied } = deriveRequirements(p, (packageReqs.data || []) as Row[]);

  const sections: JacketSection[] = [
    /* Counts what is actually there. It used to add 1 for the cover, so a
       package with no instructions could never show as missing them. */
    { key: 'invitation', label: 'Invitation & Instructions', required: true, count: invitationPages.length, pages: invitationPages, docs: [] },
    { key: 'scope', label: 'Scope of Work', required: true, count: scopePages.length, pages: scopePages, docs: [] },
    { key: 'drawings', label: 'Drawings', required: true, count: shelves.drawings.length, pages: [], docs: shelves.drawings },
    { key: 'specs', label: 'Specifications', required: true, count: shelves.specs.length, pages: [], docs: shelves.specs },
    { key: 'bidform', label: 'Bid Form', required: true, count: lineItems.length, pages: [], docs: [] },
    {
      key: 'requirements', label: 'Insurance & Bonding', required: true,
      count: satisfied ? 1 : 0,
      pages: [writtenPage('Insurance Requirements', requirements.insuranceText)].filter(Boolean) as JacketPage[],
      docs: [],
    },
    { key: 'addenda', label: 'Addenda', required: false, count: shelves.addenda.length, pages: [], docs: shelves.addenda },
    { key: 'attachments', label: 'Attachments', required: false, count: shelves.attachments.length, pages: [], docs: shelves.attachments },
  ];

  /* Correspondence (GC only): the emails Saguaro sent about this package, the
     portal chats and Ask-for-it requests with its invited subs, bids as they
     came in, and when invitations were opened — the whole conversation, so the
     jacket is the complete record. It holds no documents, so the issued
     manifest's drift check is untouched by new mail. */
  let correspondence: CommItem[] | null = null;
  if (includeCorrespondence) {
    const inviteRows = (invites.data || []) as Row[];
    const subIds = [...new Set(inviteRows.map((i) => i.sub_id).filter(Boolean))] as string[];
    const [log, chats] = await Promise.all([
      db.from('communication_log').select('*').eq('tenant_id', tenantId).eq('bid_package_id', packageId)
        .order('created_at', { ascending: false }).limit(1000),
      subIds.length && projectId
        ? db.from('portal_sub_messages').select('id,sub_id,sender_type,sender_name,content,created_at')
          .eq('tenant_id', tenantId).eq('project_id', projectId).in('sub_id', subIds)
          .order('created_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (log.error) throw log.error;
    if (chats.error) throw chats.error;
    correspondence = buildCorrespondence({
      log: (log.data || []) as Row[],
      chats: (chats.data || []) as Row[],
      invites: inviteRows,
      submissions: (submissions.data || []) as Row[],
    });
    sections.push({ key: 'correspondence', label: 'Correspondence', required: false, count: correspondence.length, pages: [], docs: [] });
  }

  /* Completeness counts only the sections a jacket must have, and names the
     empty ones. "82% complete" tells a GC nothing they can act on; "Drawings,
     Specifications" tells them exactly what to go and fix. */
  const requiredSections = sections.filter((s) => s.required);
  const missing = requiredSections.filter((s) => s.count === 0).map((s) => s.label);

  return {
    package: {
      id: p.id,
      name: p.name,
      number: p.package_number ?? null,
      trade: p.trade ?? null,
      status: p.status ?? null,
      dueDate: p.bid_due_date ?? p.due_date ?? null,
      validityDays: p.bid_validity_days ?? null,
      preBidDate: p.pre_bid_meeting_date ?? p.pre_bid_date ?? null,
      preBidLocation: p.pre_bid_meeting_location ?? null,
      preBidRequired: !!p.pre_bid_meeting_required,
      csiDivision: p.csi_division ?? null,
      /** GC only — forBidder() removes it. */
      estimatedValue: (p.estimated_value ?? p.budget_estimate ?? null) as number | null,
      jacketPdfUrl: await url(p.jacket_pdf_url),
      jacketGeneratedAt: p.jacket_generated_at ?? null,
      addendumCount: p.addendum_count ?? 0,
    },
    project: {
      id: project.id ?? projectId,
      name: project.name ?? null,
      address: project.address ?? null,
      city: project.city ?? null,
      state: project.state ?? null,
    },
    sections,
    lineItems,
    requirements,
    /** GC only — forBidder() removes it. */
    bidders: {
      invited: (invites.data || []).length,
      responded: (submissions.data || []).length,
    },
    /** GC view only (null otherwise). */
    correspondence,
    /** GC only — forBidder() removes it. */
    completeness: {
      complete: requiredSections.length - missing.length,
      total: requiredSections.length,
      missing,
    },
  };
}

export type Jacket = Awaited<ReturnType<typeof assembleJacket>>;

/* ── The bidder's copy ─────────────────────────────────────────────────────── */

export type BidderJacket = Omit<Jacket, 'bidders' | 'completeness' | 'correspondence' | 'package'> & {
  package: Omit<Jacket['package'], 'estimatedValue'>;
};

/**
 * What a bidder may see. Same documents, same scope, same bid form — but not
 * how many competitors were invited or have bid, not the GC's budget for the
 * work (a bidder who sees it prices to it), and not the GC's own "Incomplete"
 * checklist, which is a note to the GC, not to the trade.
 */
export function forBidder(jacket: Jacket): BidderJacket {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bidders, completeness, correspondence, package: pkg, ...rest } = jacket;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { estimatedValue, ...pkgRest } = pkg;
  return {
    ...rest,
    package: pkgRest,
    sections: rest.sections.filter((s) => s.key !== 'correspondence'),
  };
}

/* ── The manifest ──────────────────────────────────────────────────────────
 *
 * A jacket assembled live is right while a GC is building it and wrong the
 * moment it is sent. If a drawing is revised after issue, every bidder is
 * quietly pricing a different scope from the one they were invited to, with no
 * addendum and no record of what was actually issued. That is how bid protests
 * start, and it is the difference between a page that lists documents and a
 * bid jacket.
 *
 * So issuing writes a manifest: what this jacket contained, at that version, on
 * that date. bid_packages.jacket_sections (jsonb) and jacket_version (int) have
 * existed all along with nothing writing them — this is what they are for.
 *
 * The GC side keeps serving live and diffs it against the manifest, which turns
 * "something may have changed" into "3 drawings have been revised since you
 * issued this — send an addendum." Documents are compared one by one, and since
 * hashes were added the written parts are too: instructions, scope, the bid
 * form, insurance and the dates. Manifests written before that still diff on
 * their documents and the counts they stored.
 */

type ContentPart = 'invitation' | 'scope' | 'bidform' | 'requirements' | 'schedule';

export type JacketManifest = {
  version: number;
  issuedAt: string;
  /** Stable identity per document, so a revision is a change rather than a
   *  delete plus an unrelated add. `fp` is the stored file's identity. */
  docs: Array<{ key: string; section: string; name: string; rev: string | null; fp?: string | null }>;
  counts: Record<string, number>;
  /** One hash per written part. Absent on manifests issued before it existed. */
  hashes?: Partial<Record<ContentPart, string>>;
  /** All of `hashes` together. */
  hash?: string;
};

const docKey = (section: string, d: JacketDoc) => `${section}:${d.id}`;

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

type Hashable = Pick<Jacket, 'sections' | 'lineItems' | 'requirements'> & { package: Pick<Jacket['package'], 'dueDate' | 'preBidDate' | 'preBidLocation' | 'preBidRequired' | 'validityDays'> };

export function contentHashes(jacket: Hashable): Record<ContentPart, string> {
  const pagesOf = (key: string) => (jacket.sections.find((s) => s.key === key)?.pages || [])
    .map((pg) => ({ t: pg.title, b: pg.body }));
  const r = jacket.requirements;
  return {
    invitation: digest(pagesOf('invitation')),
    scope: digest(pagesOf('scope')),
    bidform: digest(jacket.lineItems.map((l) => [l.code, l.description, l.quantity, l.unit])),
    requirements: digest([r.bond, r.prevailingWage, r.insuranceAmount, r.generalLiability, r.autoLiability, r.workersComp,
      r.insuranceText, (r.additional || []).map((a) => [a.type, a.description, a.coverage, a.required, a.notes])]),
    schedule: digest([jacket.package.dueDate, jacket.package.preBidDate, jacket.package.preBidLocation,
      jacket.package.preBidRequired, jacket.package.validityDays]),
  };
}

export function snapshotJacket(jacket: Jacket, version: number): JacketManifest {
  const docs: JacketManifest['docs'] = [];
  const counts: Record<string, number> = {};
  for (const s of jacket.sections) {
    if (s.key === 'correspondence') continue;
    counts[s.key] = s.count;
    for (const d of s.docs) {
      docs.push({ key: docKey(s.key, d), section: s.label, name: d.name, rev: d.meta ?? null, fp: d.fp ?? null });
    }
  }
  const hashes = contentHashes(jacket);
  return { version, issuedAt: new Date().toISOString(), docs, counts, hashes, hash: digest(hashes) };
}

export type JacketDrift = {
  hasDrift: boolean;
  added: Array<{ section: string; name: string }>;
  removed: Array<{ section: string; name: string }>;
  revised: Array<{ section: string; name: string; from: string | null; to: string | null }>;
  /** Written parts edited since issue: instructions, scope, line items, insurance, dates. */
  changed: Array<{ section: string; name: string }>;
  issuedVersion: number | null;
  issuedAt: string | null;
};

const PARTS: Array<{ part: ContentPart; section: string; name: string; countKey?: string; noun?: string }> = [
  { part: 'invitation', section: 'Invitation & Instructions', name: 'Instructions to bidders' },
  { part: 'schedule', section: 'Invitation & Instructions', name: 'Bid due date or pre-bid meeting' },
  { part: 'scope', section: 'Scope of Work', name: 'Scope of work', countKey: 'scope', noun: 'pages' },
  { part: 'bidform', section: 'Bid Form', name: 'Line items', countKey: 'bidform', noun: 'lines' },
  { part: 'requirements', section: 'Insurance & Bonding', name: 'Insurance and bonding terms' },
];

/** What has changed in the live jacket since it was issued. */
export function diffAgainstManifest(jacket: Jacket, manifest: unknown): JacketDrift {
  const empty: JacketDrift = {
    hasDrift: false, added: [], removed: [], revised: [], changed: [], issuedVersion: null, issuedAt: null,
  };
  const m = manifest as JacketManifest | null;
  if (!m || !Array.isArray(m.docs)) return empty;

  const live = new Map<string, { section: string; name: string; rev: string | null; fp: string | null }>();
  for (const s of jacket.sections) {
    for (const d of s.docs) live.set(docKey(s.key, d), { section: s.label, name: d.name, rev: d.meta ?? null, fp: d.fp ?? null });
  }
  const issued = new Map(m.docs.map((d) => [d.key, d]));

  const added: JacketDrift['added'] = [];
  const removed: JacketDrift['removed'] = [];
  const revised: JacketDrift['revised'] = [];
  const changed: JacketDrift['changed'] = [];

  for (const [key, d] of live) {
    const was = issued.get(key);
    if (!was) { added.push({ section: d.section, name: d.name }); continue; }
    if ((was.rev ?? null) !== (d.rev ?? null)) {
      revised.push({ section: d.section, name: d.name, from: was.rev ?? null, to: d.rev ?? null });
    } else if ('fp' in was && (was.fp ?? null) !== (d.fp ?? null)) {
      /* Same revision number, different file: someone replaced the sheet
         without bumping its revision. Still a different drawing. */
      revised.push({ section: d.section, name: d.name, from: null, to: `${d.rev ? `${d.rev}, ` : ''}file replaced` });
    }
  }
  for (const [key, d] of issued) {
    if (!live.has(key)) removed.push({ section: d.section, name: d.name });
  }

  const liveCounts = Object.fromEntries(jacket.sections.map((s) => [s.key, s.count]));
  const countNote = (key: string | undefined, noun: string | undefined) => {
    if (!key || !m.counts || typeof m.counts[key] !== 'number' || m.counts[key] === liveCounts[key]) return '';
    return ` (${m.counts[key]} → ${liveCounts[key] ?? 0} ${noun})`;
  };

  if (m.hashes && typeof m.hashes === 'object') {
    const now = contentHashes(jacket);
    for (const p of PARTS) {
      const then = m.hashes[p.part];
      if (then && then !== now[p.part]) changed.push({ section: p.section, name: p.name + countNote(p.countKey, p.noun) });
    }
  } else if (m.counts && typeof m.counts === 'object') {
    /* A manifest from before hashing. Only the counts whose meaning has not
       changed since can be compared: the cover used to count itself on the
       invitation and the $1,000,000 column default on insurance, so those two
       would read as edits that never happened. */
    for (const p of PARTS) {
      if (!p.countKey) continue;
      const note = countNote(p.countKey, p.noun);
      if (note) changed.push({ section: p.section, name: p.name + note });
    }
  }

  return {
    hasDrift: added.length + removed.length + revised.length + changed.length > 0,
    added, removed, revised, changed,
    issuedVersion: m.version ?? null,
    issuedAt: m.issuedAt ?? null,
  };
}
