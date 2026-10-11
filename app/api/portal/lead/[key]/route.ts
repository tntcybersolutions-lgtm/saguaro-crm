import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createNotification } from '@/lib/notifications';
import { budgetValue, leadNotes, parseLeadSubmission } from '@/lib/lead-intake';

export const runtime = 'nodejs';

/**
 * /api/portal/lead/[key] — the contractor's public "request a quote" form
 * (lib/lead-intake). No login: `key` (tenants.settings.lead_form_key) names
 * the company, and nothing about the company is returned beyond its name.
 *
 *   GET   { company } for the hosted form's header
 *   POST  JSON from the hosted form → { ok }; form-encoded from a form pasted
 *         into the contractor's own site → 303 to the hosted thank-you page
 *
 * Service-role client: the tenant comes from the key, never from the body.
 */
const KEY_RE = /^[a-z0-9]{24,64}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tenantFor(db: any, key: string) {
  if (!KEY_RE.test(key)) return null;
  const { data, error } = await db.from('tenants').select('id, name, company_name')
    .eq('settings->>lead_form_key', key).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data as { id: string; name: string | null; company_name: string | null } | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  try {
    const t = await tenantFor(createServerClient(), key);
    if (!t) return NextResponse.json({ error: 'This form link is no longer active.' }, { status: 404 });
    return NextResponse.json({ company: t.company_name || t.name || 'Your contractor' });
  } catch (e) {
    return apiError('portal/lead', e, 'The form could not be loaded.');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const isForm = !(req.headers.get('content-type') || '').includes('application/json');
  const thanks = new URL(`/portals/lead/${encodeURIComponent(key)}?sent=1`, req.nextUrl.origin);
  const done = () => (isForm ? NextResponse.redirect(thanks, 303) : NextResponse.json({ ok: true }));
  const fail = (error: string, status: number) => (isForm
    ? NextResponse.redirect(new URL(`/portals/lead/${encodeURIComponent(key)}?error=${encodeURIComponent(error)}`, req.nextUrl.origin), 303)
    : NextResponse.json({ error }, { status }));

  const ip = getClientIP(req);
  if (!checkRateLimit(`lead-form:${ip}`, 5, 10 * 60_000).allowed) {
    return fail('Too many requests from here — please try again in a few minutes.', 429);
  }

  let fields: Record<string, unknown> = {};
  try {
    if (isForm) {
      const fd = await req.formData();
      fd.forEach((v, k) => { if (typeof v === 'string') fields[k] = v; });
    } else {
      fields = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    }
  } catch {
    return fail('The form could not be read.', 400);
  }

  try {
    const db = createServerClient();
    const t = await tenantFor(db, key);
    if (!t) return fail('This form link is no longer active.', 404);

    const parsed = parseLeadSubmission(fields);
    if (!parsed.ok) {
      // A bot gets the same thank-you a person does — and nothing is saved.
      if (parsed.spam) return done();
      return fail(parsed.error, 400);
    }
    const l = parsed.lead;
    const { data: lead, error } = await db.from('lead_pipeline').insert({
      tenant_id: t.id,
      contact_name: l.contact_name,
      // The list leads with company_name; a homeowner's request is their name.
      company_name: l.company_name || l.contact_name,
      email: l.email,
      phone: l.phone,
      location: l.location,
      project_type: l.project_type,
      estimated_value: budgetValue(l.budget),
      probability: 10,
      source: 'Website',
      stage: 'New',
      notes: leadNotes(l),
      next_action: 'Call back about their website request',
    }).select('id').single();
    if (error) throw error;

    await createNotification(
      t.id, null, 'lead_new',
      `New website lead: ${l.contact_name}`,
      [l.project_type, l.location, l.budget].filter(Boolean).join(' · ') || 'Asked for a quote on your website.',
      `/app/leads/${lead.id}`,
    );
    return done();
  } catch (e) {
    if (isForm) return fail('Something went wrong — please try again.', 500);
    return apiError('portal/lead', e, 'Your request could not be sent. Please try again.');
  }
}
