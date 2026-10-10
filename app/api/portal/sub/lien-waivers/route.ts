import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { getClientIP } from '@/lib/rate-limit';
import { createNotification } from '@/lib/notifications';
import { generateLienWaiver, saveDocument } from '@/lib/pdf-engine';
import { signUrl, storageObjectKey } from '@/lib/storage-signing';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';
import { senderCompany, senderContact } from '@/lib/sub-portal-sender';
import {
  checkSignature, invoiceWaiver, isDbWaiverType, isSignableWaiver, isSignedWaiver,
  pdfWaiverType, waiverTypeForInvoice, waiverTypeLabel, type DbWaiverType, type WaiverLike,
} from '@/lib/sub-lien-waiver';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * /api/portal/sub/lien-waivers?token=…  — lien waivers in the sub portal.
 *
 * Auth is the portal token (portal_sub_sessions, status active). Every query is
 * pinned to that session's tenant and job and to its roster sub — nothing is
 * read or written outside them. An email-only invite (no roster sub) has no
 * waivers and cannot sign one (lib/sub-portal-scope).
 *
 *   GET   this sub's waivers on this job, newest first, each with a fresh
 *         signed link to its PDF (file_url).
 *   POST  { pay_app_id | waiver_id, signed_name, signer_title?, signature }
 *         sign the waiver for an approved / paid portal invoice, or a waiver
 *         the GC filed and is waiting on. Writes the lien_waivers row, files a
 *         PDF with the drawn signature (pdf-engine saveDocument → documents
 *         bucket + generated_documents), logs portal_activity and notifies the
 *         GC's team.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmtMoney = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function authenticateSubPortal(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();
  return session;
}

type Db = ReturnType<typeof createServerClient>;
/* lien_waivers has ~100 columns; the route reads a handful by name. */
type WaiverRow = WaiverLike & Record<string, any>;

/** The sub's waivers on this job: filed against either sub column the app uses. */
function subWaivers(db: Db, scope: { tenantId: string; projectId: string; subId: string }) {
  return db
    .from('lien_waivers')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
    .or(`sub_id.eq.${scope.subId},subcontractor_id.eq.${scope.subId}`)
    .is('deleted_at', null);
}

/** What the portal shows for a waiver — the fields it renders plus a live PDF link. */
async function waiverView(w: WaiverRow) {
  const stored = (w.signed_pdf_url as string | null) || (w.pdf_url as string | null) || null;
  const fileUrl = stored ? await signUrl(stored, 3600) : '';
  return {
    id: w.id,
    waiver_type: w.waiver_type ?? null,
    amount: w.amount ?? null,
    through_date: w.through_date ?? null,
    status: w.status ?? null,
    signed_at: w.signed_at ?? null,
    signed_name: w.signed_name ?? null,
    signer_title: w.signer_title ?? null,
    created_at: w.created_at ?? null,
    file_url: fileUrl || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });

    const scope = subRecordScope(session);
    if (!scope) return NextResponse.json({ lien_waivers: [] });

    const db = createServerClient();
    const { data, error } = await subWaivers(db, scope).order('created_at', { ascending: false });
    if (error) throw error;
    const lien_waivers = await Promise.all(((data || []) as WaiverRow[]).map(waiverView));
    return NextResponse.json({ lien_waivers });
  } catch (err) {
    return apiError('portal/sub/lien-waivers', err, "Couldn't load your lien waivers.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a lien waiver');
      return NextResponse.json(r.body, { status: r.status });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Send the waiver to sign and your signature.' }, { status: 400 });

    const sig = checkSignature(body);
    if (!sig.ok) return NextResponse.json({ error: sig.message, field: sig.field }, { status: 400 });

    const payAppId = typeof body.pay_app_id === 'string' ? body.pay_app_id.trim() : '';
    const waiverId = typeof body.waiver_id === 'string' ? body.waiver_id.trim() : '';
    if (!payAppId && !waiverId) {
      return NextResponse.json({ error: 'pay_app_id or waiver_id is required' }, { status: 400 });
    }
    if ((payAppId && !UUID.test(payAppId)) || (waiverId && !UUID.test(waiverId))) {
      return NextResponse.json({ error: 'That waiver or invoice id is not valid.' }, { status: 400 });
    }

    const db = createServerClient();

    // ── What is being signed — always looked up inside this session's tenant, job and sub ──
    let existing: WaiverRow | null = null;
    let type: DbWaiverType;
    let amount: number;
    let throughDate: string | null;
    let note: string | null = null;

    if (waiverId) {
      const { data: w, error } = await subWaivers(db, scope).eq('id', waiverId).maybeSingle();
      if (error) throw error;
      if (!w) return NextResponse.json({ error: 'That lien waiver isn’t on this job for your company.' }, { status: 404 });
      const row = w as WaiverRow;
      if (isSignedWaiver(row)) {
        return NextResponse.json({ error: 'This lien waiver is already signed.', lien_waiver: await waiverView(row) }, { status: 409 });
      }
      if (!isSignableWaiver(row) || !isDbWaiverType(row.waiver_type)) {
        return NextResponse.json({ error: 'This lien waiver isn’t waiting on a signature.' }, { status: 409 });
      }
      existing = row;
      type = row.waiver_type;
      amount = Number(row.amount) || 0;
      throughDate = (row.through_date as string | null) ?? null;
    } else {
      const { data: pa, error } = await db
        .from('portal_sub_pay_apps')
        .select('id, status, period_from, period_to, net_amount')
        .eq('id', payAppId)
        .eq('tenant_id', scope.tenantId)
        .eq('project_id', scope.projectId)
        .eq('sub_id', scope.subId)
        .maybeSingle();
      if (error) throw error;
      if (!pa) return NextResponse.json({ error: 'That invoice isn’t on this job for your company.' }, { status: 404 });
      const invoiceType = waiverTypeForInvoice(pa.status);
      if (!invoiceType) {
        return NextResponse.json({
          error: `A lien waiver is signed once the invoice is approved. This one is ${String(pa.status || 'not approved yet').replace(/_/g, ' ')}.`,
        }, { status: 409 });
      }
      const { data: ws, error: wErr } = await subWaivers(db, scope).eq('waiver_type', invoiceType);
      if (wErr) throw wErr;
      const match = invoiceWaiver(pa, (ws || []) as WaiverRow[]);
      if (match && isSignedWaiver(match)) {
        return NextResponse.json({ error: 'The lien waiver for this invoice is already signed.', lien_waiver: await waiverView(match) }, { status: 409 });
      }
      existing = match && isSignableWaiver(match) ? match : null;
      type = invoiceType;
      amount = Number(pa.net_amount) || 0;
      throughDate = pa.period_to ?? null;
      note = `Signed in the subcontractor portal for the invoice covering ${pa.period_from ? `${pa.period_from} to ` : 'through '}${pa.period_to ?? '—'}.`;
    }

    // ── Who is signing, on what job, for whom ──
    const [subRes, projectRes, tenantRes] = await Promise.all([
      db.from('subcontractors').select('company_name, contact_name, email, contact_email')
        .eq('id', scope.subId).eq('tenant_id', scope.tenantId).maybeSingle(),
      db.from('projects').select('name, address, state, gc_name, owner_entity, owner_name')
        .eq('id', scope.projectId).eq('tenant_id', scope.tenantId).maybeSingle(),
      db.from('tenants').select('name, company_name').eq('id', scope.tenantId).maybeSingle(),
    ]);
    if (subRes.error) throw subRes.error;
    if (projectRes.error) throw projectRes.error;
    if (tenantRes.error) console.error('[portal/sub/lien-waivers] tenant name lookup failed; GC name left to the project', tenantRes.error);
    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: 'This job is no longer available on this link.' }, { status: 404 });

    const sub = subRes.data;
    const company = senderCompany(sub, session) || 'Subcontractor';
    const contact = senderContact(sub, session) || null;
    const email = (sub?.contact_email || sub?.email || session.sub_email || '').trim() || null;
    const gcName = (project.gc_name || tenantRes.data?.company_name || tenantRes.data?.name || '').trim();
    const ownerName = (project.owner_entity || project.owner_name || '').trim();
    // The job's state picks the statutory language (pdf-engine knows AZ / CA / TX; others get the generic form).
    const rawState = String(existing?.state || project.state || '').trim();
    const state = (rawState.length <= 3 ? rawState.toUpperCase() : rawState) || 'AZ';
    const signedAt = new Date().toISOString();
    const id = existing?.id || randomUUID();
    // The PDF names a through date; a waiver filed without one is signed through today, and the row says so too.
    const pdfThrough = throughDate || signedAt.slice(0, 10);

    // ── The signed document: the statutory waiver with the drawn signature on it ──
    const pdf = await generateLienWaiver({
      waiverType: pdfWaiverType(type),
      state,
      claimantName: company,
      projectName: project.name || 'Project',
      projectAddress: project.address || '',
      ownerName,
      gcName,
      throughDate: pdfThrough,
      amount,
      signature: { png: sig.png, name: sig.name, title: sig.title, signedAt },
    });
    const stored = await saveDocument(
      scope.projectId,
      `lien-waiver-${type}`,
      pdf,
      { source: 'sub_portal', lien_waiver_id: id, claimant: company, signed_name: sig.name, signed_at: signedAt, amount, through_date: pdfThrough, waiver_type: type },
      scope.tenantId,
      { title: `Signed ${waiverTypeLabel(type).toLowerCase()} — ${company}`, sourceType: 'lien_waiver', sourceId: id },
    );
    /* saveDocument never throws: a failed upload comes back as demo:// or as a
       URL for an object that isn't there. Signing it is the check — signUrl
       returns '' when the object can't be found. A waiver whose PDF didn't
       file is not recorded as signed. */
    const key = storageObjectKey(stored);
    const viewUrl = key ? await signUrl(stored, 3600) : '';
    if (!key || !viewUrl) throw new Error(`signed lien waiver PDF did not reach storage (${stored.slice(0, 40)})`);
    const slash = key.indexOf('/');
    const publicUrl = db.storage.from(key.slice(0, slash)).getPublicUrl(key.slice(slash + 1)).data.publicUrl;

    const signing = {
      status: 'signed',
      signed_at: signedAt,
      signed_date: signedAt.slice(0, 10),
      signed_name: sig.name,
      signed_by: sig.name,
      signer_title: sig.title,
      signature_method: 'sub_portal',
      signed_ip: getClientIP(req),
      received_at: signedAt,
      pdf_url: publicUrl,
      signed_pdf_url: publicUrl,
      signed_pdf_sha256: createHash('sha256').update(pdf).digest('hex'),
      pdf_generated_at: signedAt,
    };

    let saved: WaiverRow | null;
    if (existing) {
      const { data, error } = await db
        .from('lien_waivers')
        .update({ ...signing, ...(existing.through_date ? {} : { through_date: pdfThrough }) })
        .eq('id', existing.id)
        .eq('tenant_id', scope.tenantId)
        .eq('project_id', scope.projectId)
        .is('signed_at', null)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      saved = data as WaiverRow | null;
      if (!saved) return NextResponse.json({ error: 'This lien waiver was signed a moment ago. Reload to see it.' }, { status: 409 });
    } else {
      const { data, error } = await db
        .from('lien_waivers')
        .insert({
          id,
          tenant_id: scope.tenantId,
          project_id: scope.projectId,
          sub_id: scope.subId,
          subcontractor_id: scope.subId,
          claimant_type: 'subcontractor',
          claimant_name: company,
          company_name: company,
          contact_name: contact,
          contact_email: email,
          claimant_email: email,
          gc_name: gcName || null,
          gc_company_name: gcName || null,
          owner_name: ownerName || null,
          project_address: project.address || null,
          state,
          waiver_type: type,
          amount,
          through_date: pdfThrough,
          notes: note,
          ...signing,
        })
        .select('*')
        .single();
      if (error) throw error;
      saved = data as WaiverRow;
    }

    // ── History + the GC's bell ──
    await must(db.from('portal_activity').insert({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      session_id: session.id,
      action: 'lien_waiver_signed',
      description: `Signed ${waiverTypeLabel(type).toLowerCase()} for ${fmtMoney(amount)}`,
      metadata: { lien_waiver_id: saved.id, waiver_type: type, amount, through_date: pdfThrough, signed_name: sig.name, by: company },
    } as never), 'portal_activity insert');

    await createNotification(
      scope.tenantId,
      null,
      'lien_waiver_signed',
      `${company} signed a lien waiver`,
      `${waiverTypeLabel(type)} for ${fmtMoney(amount)} through ${pdfThrough}, signed by ${sig.name}${sig.title ? `, ${sig.title}` : ''}.`,
      `/app/projects/${scope.projectId}/lien-waivers`,
      scope.projectId,
    );

    return NextResponse.json({ lien_waiver: { ...(await waiverView(saved)), file_url: viewUrl } }, { status: 201 });
  } catch (err) {
    return apiError('portal/sub/lien-waivers', err, "Couldn't save your signed lien waiver. Please try again.");
  }
}
