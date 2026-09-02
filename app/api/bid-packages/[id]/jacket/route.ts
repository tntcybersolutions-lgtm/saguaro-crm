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
    const [items, drawings, specs, files, invites, submissions] = await Promise.all([
      db.from('bid_package_items').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('sort_order'),
      db.from('drawings').select('id,name,url,sheet_number,discipline,version,revision_date,status')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).is('deleted_at', null)
        .order('sheet_number'),
      db.from('spec_sections').select('id,section_number,section_title,division,division_title,doc_url,revision,issued_date')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).order('section_number'),
      db.from('project_files').select('id,file_name,file_url,file_size,file_type,category,folder,created_at,entity_type,entity_id')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false }),
      db.from('bid_package_invites').select('id,company_name,sub_name,sub_email,trade,status,response_status,invited_at')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
      db.from('bid_submissions').select('id,company_name,sub_name,base_amount,amount,status,submitted_at')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
    ]);

    const allFiles = (files.data || []) as Record<string, any>[];

    /* Files pinned to this package, plus project files a bidder needs. A file
       is "in the jacket" if it was attached to the package, or it sits in a
       category a bidder is expected to receive. */
    const attached = allFiles.filter(
      (f) => f.entity_type === 'bid_package' && f.entity_id === id,
    );
    const inCategory = (re: RegExp) =>
      allFiles.filter((f) => re.test(String(f.category || f.folder || '')));

    const addenda = [
      ...attached.filter((f) => /addend/i.test(String(f.category || f.file_name || ''))),
      ...inCategory(/addend/i),
    ].filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i);

    const asDoc = (f: Record<string, any>): Doc => ({
      id: String(f.id),
      name: String(f.file_name || 'Untitled'),
      url: via(f.file_url),
      meta: f.file_size ? `${Math.max(1, Math.round(Number(f.file_size) / 1024))} KB` : undefined,
      sub: f.category || f.folder || undefined,
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

    const requirements = {
      bond: !!p.requires_bond,
      prevailingWage: !!p.requires_prevailing_wage,
      insuranceAmount: p.insurance_required_amount ?? null,
      generalLiability: p.general_liability ?? null,
      autoLiability: p.auto_liability ?? null,
      workersComp: p.workers_compensation ?? null,
      insuranceText: p.insurance_requirements ?? null,
    };
    const hasRequirements =
      !!requirements.insuranceText ||
      requirements.insuranceAmount != null ||
      requirements.generalLiability != null ||
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
        count: attached.filter((f) => !/addend/i.test(String(f.category || ''))).length,
        pages: [],
        docs: attached.filter((f) => !/addend/i.test(String(f.category || ''))).map(asDoc),
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
