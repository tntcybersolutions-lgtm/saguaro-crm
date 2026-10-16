import { NextRequest, NextResponse } from 'next/server';
import { nextJobColor } from '@/lib/project-colors';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { normaliseStage } from '@/lib/lead-stages';
import { BUILDING_TYPES, CATEGORY_BY_BUILDING_TYPE } from '@/lib/contractor-trades';
import { stateFromAddress } from '@/lib/us-state';
import { requestDay } from '@/lib/time-zone';
import { classifyKind } from '@/lib/filekind';
import { onProjectCreated } from '@/lib/triggers';
import { logActivity } from '@/lib/activity';
import { runInBackground } from '@/lib/background';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { acceptProposal } from '@/lib/proposal-accept';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'project-files';

/**
 * POST /api/leads/[id]/convert — win a lead and open its job.
 *
 * MUST-PASS Path 13. One button: the deal becomes a customer and a job without
 * retyping anything.
 *   1) the customer: the one already on the lead, else this company's customer
 *      with the same email, else a new one;
 *   2) the job, filed the same way /api/projects/create files one: name, value
 *      (into every contract column the money screens read), category + building
 *      type, location → address and state, the customer as Owner, phase
 *      "building" (a won job is built, not bid), created_by, award date;
 *   3) the deal's files copied onto the job's Files, its contact into the job
 *      directory as Owner;
 *   4) both ids written back onto the lead, stage Won.
 *
 * It used to write contract_value only (the job's budget and pay-app screens
 * read contract_amount / original_contract_amount → $0), the lead's free-text
 * type into the category column, no address ("projects has no location
 * column" — it has `address`), no phase (so a WON deal opened as a job still
 * being bid) and no owner, while the deal page promised the files came along.
 *
 * Idempotent and race-safe: a lead already linked returns its job; the link is
 * written only while project_id is still empty, and a losing double-tap
 * removes the job it just opened and returns the winner's.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const db = createServerClient();
  const loose = db as unknown as { from: (t: string) => any; storage: any };
  const tenantId = g.user.tenantId;
  const userId = g.user.id;
  const { id } = params;

  try {
    const { data: lead, error: leadErr } = await db
      .from('lead_pipeline')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const L = lead as Record<string, any>;

    // Idempotent: already converted. Double-tap / retry returns the same job.
    if (L.project_id) {
      return NextResponse.json({
        ok: true,
        alreadyConverted: true,
        projectId: L.project_id,
        customerId: L.customer_id ?? null,
        nextUrl: `/app/projects/${L.project_id}/overview`,
      });
    }

    const company = String(L.company_name || '').trim();
    const contact = String(L.contact_name || '').trim();
    const email = String(L.email || '').trim() || null;
    const phone = String(L.phone || '').trim() || null;
    const location = String(L.location || '').trim() || null;
    const value = Number(L.estimated_value) || 0;
    const { today } = await requestDay(req.headers, db, tenantId, 'leads/convert');

    // 1) Customer — the lead's own, else the same email already on file, else new.
    let customerId: string | null = L.customer_id ?? null;
    let createdCustomer = false;
    if (!customerId && email) {
      const { data: match, error: mErr } = await loose.from('customer_profiles').select('id')
        .eq('tenant_id', tenantId).ilike('email', email).order('created_at', { ascending: true }).limit(1);
      if (mErr) throw mErr;
      customerId = (match as Array<{ id: string }> | null)?.[0]?.id ?? null;
    }
    if (customerId) {
      // A won deal makes them a customer, whatever they were filed as before.
      await must(loose.from('customer_profiles').update({ status: 'customer', updated_at: new Date().toISOString() })
        .eq('id', customerId).eq('tenant_id', tenantId), 'customer_profiles status');
    } else {
      const { data: cust, error: custErr } = await loose
        .from('customer_profiles')
        .insert({
          tenant_id: tenantId,
          name: company || contact || 'New Customer',
          email,
          phone,
          state: stateFromAddress(location),
          source: 'lead',
          status: 'customer',
        })
        .select('id')
        .single();
      if (custErr || !cust) throw custErr ?? new Error('customer insert returned no row');
      customerId = (cust as { id: string }).id;
      createdCustomer = true;
    }

    // 2) The job.
    const leadType = String(L.project_type || '').trim();
    const buildingType = (BUILDING_TYPES as readonly string[]).includes(leadType) ? leadType : null;
    const category = (buildingType && CATEGORY_BY_BUILDING_TYPE[buildingType]) || 'commercial';
    const state = stateFromAddress(location);
    const name = company || (contact ? `Project — ${contact}` : 'New Project');
    const { count: priorCount } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { data: project, error: projErr } = await loose
      .from('projects')
      .insert({
        tenant_id: tenantId,
        color: nextJobColor(Number(priorCount) || 0),
        name,
        address: location,
        ...(state ? { state, state_jurisdiction: state } : {}),
        project_type: category,
        building_type: buildingType,
        // A free-text scope on the deal ("BAS Modernization") is the job's description.
        description: buildingType ? '' : leadType,
        status: 'active',
        phase: 'building',
        percent_complete: 0,
        contract_value: value,
        contract_amount: value,
        original_contract: value,
        original_contract_amount: value,
        customer_id: customerId,
        owner_name: company || contact || '',
        owner_email: email || '',
        owner_phone: phone,
        owner_entity: { name: company || contact || '', email: email || '' },
        award_date: today,
        source: 'lead',
        metadata: { fromLeadId: id, awardDate: today },
        created_by: userId,
      })
      .select('id')
      .single();
    if (projErr || !project) throw projErr ?? new Error('project insert returned no row');
    const projectId = (project as { id: string }).id;

    // 3) Link both ids onto the lead and mark it Won — only while it is still
    //    unlinked, so two taps can never leave two jobs behind one deal.
    const nowIso = new Date().toISOString();
    const { data: linked, error: upErr } = await loose
      .from('lead_pipeline')
      .update({
        project_id: projectId,
        customer_id: customerId,
        stage: normaliseStage('Won'),
        won_at: L.won_at || nowIso,
        lost_at: null,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('project_id', null)
      .select('id, project_id');
    if (upErr) throw upErr;
    if (!(linked as unknown[] | null)?.length) {
      // Another request linked it first: undo ours, hand back theirs.
      await must(loose.from('projects').delete().eq('id', projectId).eq('tenant_id', tenantId), 'projects race cleanup');
      if (createdCustomer) await tryWrite(loose.from('customer_profiles').delete().eq('id', customerId).eq('tenant_id', tenantId), 'customer race cleanup');
      const { data: winner, error: wErr } = await db.from('lead_pipeline').select('project_id, customer_id')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
      if (wErr) throw wErr;
      const w = winner as { project_id?: string | null; customer_id?: string | null } | null;
      if (!w?.project_id) throw new Error('lead link lost without a winning project');
      return NextResponse.json({ ok: true, alreadyConverted: true, projectId: w.project_id, customerId: w.customer_id ?? null, nextUrl: `/app/projects/${w.project_id}/overview` });
    }

    // 4) The deal's contact is the job's Owner in its directory (what the prime
    //    contract, RFIs and pay apps print), as /api/projects/create seeds it.
    if (contact || company) {
      await tryWrite(loose.from('contacts').insert({
        tenant_id: tenantId, project_id: projectId, customer_id: customerId,
        name: contact || company, company: company || null, email, phone, role: 'Owner',
        created_at: nowIso,
      }), 'convert: owner contact');
    }

    // 4b) The deal's proposals move onto the job, and a SIGNED one is the
    //     contract: its amount goes into every contract column and the budget
    //     starts from the takeoff (lib/proposal-accept). The job already
    //     exists, so a failure here is logged and reported, never a 500.
    let contractFromProposal: string | null = null;
    try {
      await must(loose.from('proposals').update({ project_id: projectId })
        .eq('lead_id', id).eq('tenant_id', tenantId).is('project_id', null), 'convert: proposals onto the job');
      await must(loose.from('proposal_signatures').update({ project_id: projectId })
        .eq('lead_id', id).eq('tenant_id', tenantId).is('project_id', null), 'convert: signature requests onto the job');
      const { data: signedProps, error: spErr } = await loose.from('proposals').select('id, title')
        .eq('lead_id', id).eq('tenant_id', tenantId).not('locked_at', 'is', null)
        .order('signed_at', { ascending: false }).limit(1);
      if (spErr) throw spErr;
      const sp = (signedProps as Array<{ id: string; title: string | null }> | null)?.[0];
      if (sp) {
        await acceptProposal(loose, tenantId, sp.id);
        contractFromProposal = sp.title || 'the signed proposal';
      }
    } catch (e) {
      console.error('[leads/convert] carrying the proposals onto the job failed', id, e);
    }

    // 5) The deal's files, COPIED onto the job's Files (the deal keeps its own,
    //    so deleting the deal later never breaks the job). Counted, not assumed.
    const { data: media, error: mediaErr } = await loose.from('deal_media')
      .select('name, path, content_type, size_bytes').eq('lead_id', id).eq('tenant_id', tenantId);
    if (mediaErr) throw mediaErr;
    let carried = 0;
    const failed: string[] = [];
    for (const m of (media || []) as Array<{ name: string; path: string; content_type: string | null; size_bytes: number | null }>) {
      const dest = `${tenantId}/projects/${projectId}/files/${Date.now()}-${m.name}`;
      const { error: cpErr } = await loose.storage.from(BUCKET).copy(m.path, dest);
      if (cpErr) { console.error('[leads/convert] file copy', m.path, cpErr); failed.push(m.name); continue; }
      const mime = m.content_type || 'application/octet-stream';
      const { error: rowErr } = await loose.from('project_files').insert({
        tenant_id: tenantId, project_id: projectId,
        file_name: m.name, file_url: loose.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl,
        file_size: m.size_bytes, file_type: mime, mime_type: mime, kind: classifyKind(mime, m.name),
        storage_bucket: BUCKET, storage_path: dest, category: classifyKind(mime, m.name),
        uploaded_by: userId, uploaded_by_name: g.user.email, is_current: true, version_number: 1,
      });
      if (rowErr) {
        console.error('[leads/convert] file record', m.path, rowErr);
        await loose.storage.from(BUCKET).remove([dest]).then(() => {}, () => {});
        failed.push(m.name);
        continue;
      }
      carried++;
    }

    // The deal's own history says where it went.
    await tryWrite(loose.from('lead_activities').insert({
      tenant_id: tenantId, lead_id: id, activity_type: 'note', created_by: userId,
      description: `Won — opened the job "${name}"${carried ? ` with ${carried} file${carried === 1 ? '' : 's'}` : ''}.`,
      completed_at: nowIso,
    }), 'convert: lead activity');

    runInBackground(onProjectCreated(projectId), 'onProjectCreated');
    void logActivity({
      tenantId, projectId, userId, userName: g.user.email,
      action: 'created', entityType: 'project', entityId: projectId,
      description: `Opened the job ${name} from a won deal`,
      metadata: { leadId: id, address: location },
    });

    return NextResponse.json(
      { ok: true, projectId, customerId, nextUrl: `/app/projects/${projectId}/overview`, files: { carried, failed }, contractFromProposal },
      { status: 201 },
    );
  } catch (err) {
    return apiError('leads/[id]/convert POST', err, 'Could not convert the lead to a project');
  }
}
