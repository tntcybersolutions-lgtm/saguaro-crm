import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/bid-packages/[id]/jacket
 *
 * Assembles the contents of a bid jacket.
 *
 * A bid jacket used to be one generated PDF: an AI scope narrative flattened
 * into a single file. That is a document ABOUT the package, not the package —
 * a sub who opens it still has to go and find the drawings, the specs, the bid
 * form and the insurance requirements somewhere else. The Documents list showed
 * twenty-eight rows all called "Bid Jacket" with nothing to distinguish them.
 *
 * A real jacket is a container. This returns what is actually inside one, drawn
 * from the tables that already hold it — drawings, spec_sections, line items,
 * addenda files, the requirements recorded on the package itself — so the
 * jacket reflects the live project rather than a snapshot taken at generation
 * time. Nothing here is invented: a section with no rows comes back empty and
 * is reported as missing rather than filled with a placeholder.
 *
 * Every section also declares whether it is `required`, which drives the
 * completeness read on the jacket cover. A GC finding out the insurance limits
 * were never set BEFORE the invitations go out is the whole point — that is the
 * phone call a physical jacket generates and nobody wants.
 */

export const dynamic = 'force-dynamic';

type Doc = {
  id: string;
  name: string;
  url: string | null;
  meta?: string;
  sub?: string;
  kind: 'pdf' | 'sheet' | 'spec' | 'form' | 'text';
};

/* Private buckets hand out expiring links, so documents are opened through the
   signing proxy rather than by their stored URL. */
const via = (u: string | null | undefined) =>
  u ? `/api/files/open?u=${encodeURIComponent(u)}` : null;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const p = pkg as Record<string, any>;
    const project = p.projects || {};
    const projectId = p.project_id;

    /* The package is proven to belong to the caller above; everything below is
       filtered by tenant as well, since these are service-role reads. */
    const [items, drawings, specs, packageDocs, packageReqs, invites, submissions] = await Promise.all([
      db.from('bid_package_items').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('sort_order'),
      db.from('drawings').select('id,name,url,sheet_number,discipline,version,revision_date,status')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).is('deleted_at', null)
        .order('sheet_number'),
      db.from('spec_sections').select('id,section_number,section_title,division,division_title,doc_url,revision,issued_date')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).order('section_number'),
      db.from('bid_package_documents').select('id,file_name,file_url,file_type,category,label,sort_order,created_at')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId).is('deleted_at', null)
        .order('sort_order'),
      /* bid_package_requirements has NO tenant_id column, so it cannot carry the
         mandatory .eq('tenant_id') filter. Its parent package was proven to
         belong to the caller above, and bid_package_id is the only key here —
         the ownership check on the package IS the isolation for this read. */
      db.from('bid_package_requirements').select('id,requirement_type,description,min_coverage,is_required,notes')
        .eq('bid_package_id', id),
      db.from('bid_package_invites').select('id,company_name,sub_name,sub_email,trade,status,response_status,invited_at')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
      db.from('bid_submissions').select('id,company_name,sub_name,base_amount,amount,status,submitted_at')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
    ]);

    /* Documents attached to THIS jacket live in bid_package_documents — a table
       built for exactly this (bid_package_id, category, label, sort_order, soft
       delete) that no code had ever read or written.

       This previously filtered project_files, and did it wrongly in two ways:
       the addenda test matched on `category || file_name` while the attachments
       test matched on category alone, so a file named "Addendum 3.pdf" filed
       under Attachments appeared in BOTH sections; and the category scan ran
       across every file on the project with no check that the file belonged to
       this package, so one package's addenda showed up inside another's jacket.
       Keying on bid_package_id removes both by construction. */
    const attachedDocs = (packageDocs.data || []) as Record<string, any>[];

    const isAddendum = (f: Record<string, any>) => /addend/i.test(String(f.category || ''));
    const addenda = attachedDocs.filter(isAddendum);
    const attached = attachedDocs.filter((f) => !isAddendum(f));

    /* bid_package_documents carries `label` — the name the GC gave the document
       when they put it in the jacket ("Addendum 01 — Fixture schedule"), which
       reads far better on the shelf than the uploaded filename. Fall back to the
       filename when no label was set. */
    const asDoc = (f: Record<string, any>): Doc => ({
      id: String(f.id),
      name: String(f.label || f.file_name || 'Untitled'),
      url: via(f.file_url),
      meta: f.file_type ? String(f.file_type).toUpperCase() : undefined,
      sub: f.category || undefined,
      kind: 'pdf',
    });

    /* Trade-relevant drawings first. A plumbing sub does not need the whole
       set fanned out in front of them, but they must still be able to reach it,
       so nothing is hidden — the relevant discipline is marked. */
    const trade = String(p.trade || '').toLowerCase();
    const DISCIPLINE_FOR_TRADE: Record<string, RegExp> = {
      electrical: /^e|electric/i,
      plumbing: /^p|plumb/i,
      mechanical: /^m|mech|hvac/i,
      structural: /^s|struct/i,
      civil: /^c|civil/i,
      architectural: /^a|arch/i,
      fire: /^f|fire/i,
    };
    const relevant = Object.entries(DISCIPLINE_FOR_TRADE)
      .find(([k]) => trade.includes(k))?.[1] ?? null;

    const drawingDocs: Doc[] = ((drawings.data || []) as Record<string, any>[]).map((d) => ({
      id: String(d.id),
      name: [d.sheet_number, d.name].filter(Boolean).join(' — ') || 'Sheet',
      url: via(d.url),
      meta: d.version ? `Rev ${d.version}` : undefined,
      sub: d.discipline || undefined,
      kind: 'sheet',
    }));
    if (relevant) {
      drawingDocs.sort((a, b) => {
        const ra = relevant.test(String(a.sub || '')) ? 0 : 1;
        const rb = relevant.test(String(b.sub || '')) ? 0 : 1;
        return ra - rb;
      });
    }

    const specDocs: Doc[] = ((specs.data || []) as Record<string, any>[]).map((s) => ({
      id: String(s.id),
      name: [s.section_number, s.section_title].filter(Boolean).join(' — ') || 'Section',
      url: via(s.doc_url),
      meta: s.revision ? `Rev ${s.revision}` : undefined,
      sub: s.division_title || s.division || undefined,
      kind: 'spec',
    }));

    const lineItems = ((items.data || []) as Record<string, any>[]).map((i) => ({
      id: String(i.id),
      code: i.csi_code || i.code || i.cost_code || '',
      description: i.description || i.title || '',
      quantity: i.quantity ?? null,
      unit: i.unit || i.uom || '',
    }));

    /* Written sections held on the package itself. These are documents in the
       jacket even though they are not files — a sub reads them the same way. */
    const written = (label: string, body: unknown) => {
      const t = typeof body === 'string' ? body.trim() : '';
      return t ? { id: label.toLowerCase().replace(/\W+/g, '-'), title: label, body: t } : null;
    };

    const scopePages = [
      written('Scope Narrative', p.scope_narrative || p.scope_of_work || p.scope_summary),
      written('Work Included', p.work_included),
      written('Work Excluded', p.work_excluded),
      written('Coordination Notes', p.coordination_notes),
      written('Quality Standards', p.quality_standards),
      written('Special Requirements', p.special_requirements),
    ].filter(Boolean);

    /* Requirements come from two places. bid_packages carries a fixed handful
       of columns (GL, auto, workers' comp, bond, prevailing wage);
       bid_package_requirements is a purpose-built table that can hold any
       requirement with a coverage figure and a required/optional flag — and
       which, like bid_package_documents, no code had ever read.

       The structured rows win where they overlap: a GC who took the trouble to
       record a specific requirement means it, and the flat columns are only
       ever the six defaults. Anything the table holds beyond those six is
       carried through as an extra line rather than dropped. */
    const reqRows = (packageReqs.data || []) as Record<string, any>[];
    const reqOf = (re: RegExp) => reqRows.find((r) => re.test(String(r.requirement_type || r.description || '')));
    const cov = (r: Record<string, any> | undefined) =>
      r && r.min_coverage != null ? Number(r.min_coverage) : null;

    const requirements = {
      bond: !!p.requires_bond || !!reqOf(/bond/i)?.is_required,
      prevailingWage: !!p.requires_prevailing_wage || !!reqOf(/prevailing|davis.?bacon/i)?.is_required,
      insuranceAmount: cov(reqOf(/umbrella|excess|aggregate|minimum/i)) ?? p.insurance_required_amount ?? null,
      generalLiability: cov(reqOf(/general.?liab|\bgl\b|cgl/i)) ?? p.general_liability ?? null,
      autoLiability: cov(reqOf(/auto/i)) ?? p.auto_liability ?? null,
      workersComp: cov(reqOf(/workers?.?comp|\bwc\b/i)) ?? p.workers_compensation ?? null,
      insuranceText: p.insurance_requirements ?? reqOf(/insurance/i)?.description ?? null,
      /* Requirements that are not one of the six the package columns model. */
      additional: reqRows
        .filter((r) => !/bond|prevailing|davis.?bacon|general.?liab|\bgl\b|cgl|auto|workers?.?comp|\bwc\b|umbrella|excess|aggregate|minimum/i
          .test(String(r.requirement_type || '')))
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

    const sections = [
      {
        key: 'invitation',
        label: 'Invitation & Instructions',
        required: true,
        count: (p.bid_instructions ? 1 : 0) + 1,
        pages: [
          written('Instructions to Bidders', p.bid_instructions),
        ].filter(Boolean),
        docs: [] as Doc[],
      },
      {
        key: 'scope',
        label: 'Scope of Work',
        required: true,
        count: scopePages.length,
        pages: scopePages,
        docs: [] as Doc[],
      },
      {
        key: 'drawings',
        label: 'Drawings',
        required: true,
        count: drawingDocs.length,
        pages: [],
        docs: drawingDocs,
      },
      {
        key: 'specs',
        label: 'Specifications',
        required: true,
        count: specDocs.length,
        pages: [],
        docs: specDocs,
      },
      {
        key: 'bidform',
        label: 'Bid Form',
        required: true,
        count: lineItems.length,
        pages: [],
        docs: [] as Doc[],
      },
      {
        key: 'requirements',
        label: 'Insurance & Bonding',
        required: true,
        count: hasRequirements ? 1 : 0,
        pages: [written('Insurance Requirements', requirements.insuranceText)].filter(Boolean),
        docs: [] as Doc[],
      },
      {
        key: 'addenda',
        label: 'Addenda',
        required: false,
        count: addenda.length,
        pages: [],
        docs: addenda.map(asDoc),
      },
      {
        key: 'attachments',
        label: 'Attachments',
        required: false,
        count: attached.length,
        pages: [],
        docs: attached.map(asDoc),
      },
    ];

    /* Completeness is judged only on sections a jacket must have. Missing ones
       are named, because "82% complete" tells a GC nothing they can act on. */
    const required = sections.filter((s) => s.required);
    const missing = required.filter((s) => s.count === 0).map((s) => s.label);
    const complete = required.length - missing.length;

    return NextResponse.json({
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
        jacketPdfUrl: via(p.jacket_pdf_url),
        jacketGeneratedAt: p.jacket_generated_at ?? null,
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
        responded: ((submissions.data || []) as Record<string, any>[]).length,
      },
      completeness: {
        complete,
        total: required.length,
        missing,
      },
    });
  } catch (e) {
    return apiError('bid_jacket', e);
  }
}
