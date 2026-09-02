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
 * Nothing here invents content. A section with no rows comes back empty and is
 * reported as missing, because a jacket you can see through is one the GC needs
 * to fix before sending, not one to paper over.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type JacketDoc = {
  id: string;
  name: string;
  url: string | null;
  meta?: string;
  sub?: string;
  kind: 'pdf' | 'sheet' | 'spec' | 'form' | 'text';
};

export type JacketPage = { id: string; title: string; body: string };

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

const written = (title: string, body: unknown): JacketPage | null => {
  const t = typeof body === 'string' ? body.trim() : '';
  return t ? { id: title.toLowerCase().replace(/\W+/g, '-'), title, body: t } : null;
};

export async function assembleJacket(
  db: Db,
  opts: { packageId: string; tenantId: string; pkg: Record<string, any>; resolveUrl: ResolveUrl },
) {
  const { packageId, tenantId, pkg, resolveUrl } = opts;
  const p = pkg;
  const project = p.projects || {};
  const projectId = p.project_id;

  const [items, drawings, specs, packageDocs, packageReqs, invites, submissions] = await Promise.all([
    db.from('bid_package_items').select('*').eq('bid_package_id', packageId).eq('tenant_id', tenantId).order('sort_order'),
    db.from('drawings').select('id,name,url,sheet_number,discipline,version,revision_date,status')
      .eq('project_id', projectId).eq('tenant_id', tenantId).is('deleted_at', null).order('sheet_number'),
    db.from('spec_sections').select('id,section_number,section_title,division,division_title,doc_url,revision,issued_date')
      .eq('project_id', projectId).eq('tenant_id', tenantId).order('section_number'),
    db.from('bid_package_documents').select('id,file_name,file_url,file_type,category,label,sort_order,created_at')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId).is('deleted_at', null).order('sort_order'),
    /* bid_package_requirements has no tenant_id column, so it cannot carry the
       mandatory tenant filter. Its parent package is proven to belong to the
       caller before this runs — that ownership check IS the isolation here. */
    db.from('bid_package_requirements').select('id,requirement_type,description,min_coverage,is_required,notes')
      .eq('bid_package_id', packageId),
    db.from('bid_package_invites').select('id,company_name,sub_name,sub_email,trade,status,response_status,invited_at')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId),
    db.from('bid_submissions').select('id,company_name,sub_name,base_amount,amount,status,submitted_at')
      .eq('bid_package_id', packageId).eq('tenant_id', tenantId),
  ]);

  const url = async (u: string | null | undefined) => (u ? await resolveUrl(u) : null);

  /* Documents attached to THIS jacket, keyed by bid_package_id. Filtering
     project_files by category instead used to put a file named "Addendum 3.pdf"
     in two sections at once and leak one package's addenda into another's. */
  const attachedDocs = (packageDocs.data || []) as Record<string, any>[];
  const isAddendum = (f: Record<string, any>) => /addend/i.test(String(f.category || ''));

  const asDoc = async (f: Record<string, any>): Promise<JacketDoc> => ({
    id: String(f.id),
    /* `label` is the name the GC gave it when placing it in the jacket, which
       reads better on the shelf than the uploaded filename. */
    name: String(f.label || f.file_name || 'Untitled'),
    url: await url(f.file_url),
    meta: f.file_type ? String(f.file_type).toUpperCase() : undefined,
    sub: f.category || undefined,
    kind: 'pdf',
  });

  const addenda = await Promise.all(attachedDocs.filter(isAddendum).map(asDoc));
  const attached = await Promise.all(attachedDocs.filter((f) => !isAddendum(f)).map(asDoc));

  const trade = String(p.trade || '').toLowerCase();
  const relevant = Object.entries(DISCIPLINE_FOR_TRADE).find(([k]) => trade.includes(k))?.[1] ?? null;

  const drawingDocs: JacketDoc[] = await Promise.all(
    ((drawings.data || []) as Record<string, any>[]).map(async (d) => ({
      id: String(d.id),
      name: [d.sheet_number, d.name].filter(Boolean).join(' — ') || 'Sheet',
      url: await url(d.url),
      meta: d.version ? `Rev ${d.version}` : undefined,
      sub: d.discipline || undefined,
      kind: 'sheet' as const,
    })),
  );
  if (relevant) {
    drawingDocs.sort((a, b) =>
      (relevant.test(String(a.sub || '')) ? 0 : 1) - (relevant.test(String(b.sub || '')) ? 0 : 1));
  }

  const specDocs: JacketDoc[] = await Promise.all(
    ((specs.data || []) as Record<string, any>[]).map(async (s) => ({
      id: String(s.id),
      name: [s.section_number, s.section_title].filter(Boolean).join(' — ') || 'Section',
      url: await url(s.doc_url),
      meta: s.revision ? `Rev ${s.revision}` : undefined,
      sub: s.division_title || s.division || undefined,
      kind: 'spec' as const,
    })),
  );

  const lineItems = ((items.data || []) as Record<string, any>[]).map((i) => ({
    id: String(i.id),
    code: i.csi_code || i.code || i.cost_code || '',
    description: i.description || i.title || '',
    quantity: i.quantity ?? null,
    unit: i.unit || i.uom || '',
  }));

  const scopePages = [
    written('Scope Narrative', p.scope_narrative || p.scope_of_work || p.scope_summary),
    written('Work Included', p.work_included),
    written('Work Excluded', p.work_excluded),
    written('Coordination Notes', p.coordination_notes),
    written('Quality Standards', p.quality_standards),
    written('Special Requirements', p.special_requirements),
  ].filter(Boolean) as JacketPage[];

  /* Requirements come from two places: a fixed handful of columns on
     bid_packages, and bid_package_requirements which can hold any requirement
     with a coverage figure. The structured rows win where they overlap — a GC
     who recorded a specific requirement meant it. */
  const reqRows = (packageReqs.data || []) as Record<string, any>[];
  const reqOf = (re: RegExp) => reqRows.find((r) => re.test(String(r.requirement_type || r.description || '')));
  const cov = (r: Record<string, any> | undefined) => (r && r.min_coverage != null ? Number(r.min_coverage) : null);
  const SIX = /bond|prevailing|davis.?bacon|general.?liab|\bgl\b|cgl|auto|workers?.?comp|\bwc\b|umbrella|excess|aggregate|minimum/i;

  const requirements = {
    bond: !!p.requires_bond || !!reqOf(/bond/i)?.is_required,
    prevailingWage: !!p.requires_prevailing_wage || !!reqOf(/prevailing|davis.?bacon/i)?.is_required,
    insuranceAmount: cov(reqOf(/umbrella|excess|aggregate|minimum/i)) ?? p.insurance_required_amount ?? null,
    generalLiability: cov(reqOf(/general.?liab|\bgl\b|cgl/i)) ?? p.general_liability ?? null,
    autoLiability: cov(reqOf(/auto/i)) ?? p.auto_liability ?? null,
    workersComp: cov(reqOf(/workers?.?comp|\bwc\b/i)) ?? p.workers_compensation ?? null,
    insuranceText: p.insurance_requirements ?? reqOf(/insurance/i)?.description ?? null,
    additional: reqRows
      .filter((r) => !SIX.test(String(r.requirement_type || '')))
      .map((r) => ({
        id: String(r.id),
        type: r.requirement_type || 'Requirement',
        description: r.description || null,
        coverage: r.min_coverage != null ? Number(r.min_coverage) : null,
        required: r.is_required !== false,
        notes: r.notes || null,
      })),
  };

  const hasRequirements =
    !!requirements.insuranceText ||
    requirements.insuranceAmount != null ||
    requirements.generalLiability != null ||
    requirements.autoLiability != null ||
    requirements.workersComp != null ||
    requirements.additional.length > 0 ||
    requirements.bond ||
    requirements.prevailingWage;

  const sections: JacketSection[] = [
    {
      key: 'invitation', label: 'Invitation & Instructions', required: true,
      count: (p.bid_instructions ? 1 : 0) + 1,
      pages: [written('Instructions to Bidders', p.bid_instructions)].filter(Boolean) as JacketPage[],
      docs: [],
    },
    { key: 'scope', label: 'Scope of Work', required: true, count: scopePages.length, pages: scopePages, docs: [] },
    { key: 'drawings', label: 'Drawings', required: true, count: drawingDocs.length, pages: [], docs: drawingDocs },
    { key: 'specs', label: 'Specifications', required: true, count: specDocs.length, pages: [], docs: specDocs },
    { key: 'bidform', label: 'Bid Form', required: true, count: lineItems.length, pages: [], docs: [] },
    {
      key: 'requirements', label: 'Insurance & Bonding', required: true,
      count: hasRequirements ? 1 : 0,
      pages: [written('Insurance Requirements', requirements.insuranceText)].filter(Boolean) as JacketPage[],
      docs: [],
    },
    { key: 'addenda', label: 'Addenda', required: false, count: addenda.length, pages: [], docs: addenda },
    { key: 'attachments', label: 'Attachments', required: false, count: attached.length, pages: [], docs: attached },
  ];

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
      estimatedValue: p.estimated_value ?? p.budget_estimate ?? null,
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
    bidders: {
      invited: (invites.data || []).length,
      responded: (submissions.data || []).length,
    },
    completeness: {
      complete: requiredSections.length - missing.length,
      total: requiredSections.length,
      missing,
    },
  };
}

export type Jacket = Awaited<ReturnType<typeof assembleJacket>>;
