import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { normalisePhase } from '@/lib/project-phase';
import type { Database } from '@/lib/database.types';
import { onProjectCreated } from '@/lib/triggers';
import { templateByKey } from '@/lib/project-templates';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });

    // Accept both camelCase (web) and snake_case (mobile) for every field the
    // clients send, and honor the user's choices instead of hard-coding them.
    /* A template answers the questions a GC would otherwise answer by hand on
       every job — retainage, contract type, filing structure. Anything the
       client sent explicitly still wins; the template only fills the blanks. */
    const template = templateByKey(body.template ?? body.templateKey);

    const projectType = body.projectType ?? body.project_type ?? template?.projectType ?? 'commercial';
    const status = body.status ?? 'active';
    /* Are we chasing this job or building it? One answer at creation decides
       which journey the overview teaches and which nav sections lead. See
       lib/project-phase — projects.phase existed and was read by nothing. */
    const phase = normalisePhase(body.phase);
    // Numeric contract — the projects LIST/dashboard read `contract_value`, so
    // that column MUST be populated; mirror to the contract_amount/original_*
    // columns the web detail + financial views read.
    const contractValue = Number(body.contractValue ?? body.contract_value ?? body.contractAmount ?? body.contract_amount ?? 0) || 0;
    const startDate = body.startDate ?? body.start_date ?? null;
    /* Only a real uuid, never '' — the column has a foreign key to
       customer_profiles and an empty string is not a null. */
    const rawCustomer = String(body.customer_id ?? body.customerId ?? '').trim();
    const customerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(rawCustomer) ? rawCustomer : null;

    const db = createServerClient();

    const { data: project, error } = await db.from('projects').insert({
      tenant_id: user.tenantId,
      name: body.name,
      address: body.address,
      state_jurisdiction: body.stateJurisdiction || 'AZ',
      project_type: projectType,
      status,
      phase,
      percent_complete: 0,
      contract_value: contractValue,
      contract_amount: contractValue,
      original_contract: contractValue,
      original_contract_amount: contractValue,
      description: body.description || '',
      // Dates
      start_date: startDate,
      ntp_date: body.noticeToProceedDate || null,
      substantial_date: body.substantialCompletionDate || null,
      final_completion_date: body.finalCompletionDate || null,
      /* Owner. customer_id is the real link now that projects carries the
         column; the owner_* columns stay because they are what the prime
         contract, the RFIs and the pay application print, and because every
         project created before this has only them. A project created from
         anywhere other than the Customers page simply has no customer_id,
         which is why the rollup still falls back to matching on email. */
      customer_id: customerId,
      owner_name: body.ownerName || '',
      owner_email: body.ownerEmail || '',
      owner_entity: body.ownerName ? { name: body.ownerName, email: body.ownerEmail } : {},
      // Architect
      architect_name: body.architectName || '',
      architect_email: body.architectEmail || '',
      architect_entity: body.architectName ? { name: body.architectName, email: body.architectEmail } : {},
      // Contract settings
      retainage_pct: body.retainagePct ?? template?.retainagePct ?? 10,
      contract_type: body.contractType ?? template?.contractType ?? null,
      template_name: template?.key ?? null,
      is_public_project: body.publicProject || false,
      prevailing_wage: body.prevailingWage || false,
      // Extras stored in metadata
      project_number: body.projectNumber || null,
      building_type: body.buildingType || null,
      metadata: {
        awardDate: body.awardDate || null,
        contractType: body.contractType || 'Lump Sum GMP',
        buildingType: body.buildingType || null,
      },
      created_by: user.id,
    } as unknown as Database['public']['Tables']['projects']['Insert']).select().single();

    if (error) throw error;

    const projectId = (project as any).id;

    // Trigger async scaffolding (non-blocking)
    /* Lay the filing structure down now, empty. A folder with nothing in it is
       still a map: it tells a GC where drawings, permits and closeout go before
       they have any. Non-fatal — a project without folders is a project, and
       failing creation over a filing cabinet would be absurd. */
    if (template?.folders?.length) {
      /* project_folders is newer than the checked-in generated types, so this
         one call is cast rather than regenerating the whole type file. */
      const { error: folderErr } = await (db as unknown as {
        from: (t: string) => { insert: (rows: unknown[]) => Promise<{ error: unknown }> };
      }).from('project_folders').insert(
        template.folders.map((name, i) => ({
          tenant_id: user.tenantId,
          project_id: projectId,
          name,
          sort_order: i,
          seeded_from: template.key,
        })) as never,
      );
      if (folderErr) console.error('[projects/create] folder seed', folderErr);
    }

    /* The GC has just typed the owner and the architect into the form. Those
       same two names are then asked for again by the prime contract, by every
       RFI, by submittals and by the pay application — because nothing kept
       them. They go into the directory now, at the moment they are known. */
    /* The Owner row carries customer_id where we know it, so the person
       outlives the job: contacts hang off project_id, and without this a
       customer's people disappear the moment the project closes. Only the
       Owner — the architect is a different party, not the customer. */
    const directory = [
      { role: 'Owner',     name: body.ownerName,     email: body.ownerEmail,     customerId },
      { role: 'Architect', name: body.architectName, email: body.architectEmail, customerId: null },
    ]
      .filter((c) => String(c.name || '').trim())
      .map((c) => ({
        tenant_id: user.tenantId,
        project_id: projectId,
        customer_id: c.customerId,
        name: String(c.name).trim(),
        email: String(c.email || '').trim() || null,
        role: c.role,
        created_at: new Date().toISOString(),
      }));

    if (directory.length) {
      /* `contacts` — the table /api/projects/[id]/directory reads, which is what
         both the desktop directory and the field app show. project_contacts is a
         second, older table; writing to it here would have put the owner and the
         architect somewhere neither screen looks. */
      const { error: dirErr } = await db.from('contacts').insert(directory as never);
      if (dirErr) console.error('[projects/create] directory seed', dirErr);
    }

    onProjectCreated(projectId).catch(console.error);

    return NextResponse.json({ projectId, project, success: true });
  } catch (err) {
    console.error('[projects/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
