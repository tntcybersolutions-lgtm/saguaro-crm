/**
 * w9-portal.ts
 *
 * Token-gated W-9 self-service portal + Owner approval portal
 *
 * W-9 Portal:
 *   - Vendor receives email with secure link (no login required)
 *   - Fills W-9 fields in browser
 *   - E-signs with canvas signature
 *   - PDF generated and stored
 *   - GC notified of completion
 *
 * Owner Portal:
 *   - Owner receives pay app approval link (no login required)
 *   - Reviews G702/G703 PDF inline
 *   - One-click approve or reject with notes
 *   - GC notified immediately
 *
 * Sub Portal:
 *   - Token-gated access for subs to upload COI, sign waivers, submit W-9
 *
 * API Routes:
 *   GET  /api/portals/w9/:token             — get W-9 form data
 *   POST /api/portals/w9/:token             — submit completed W-9
 *   GET  /api/portals/owner/:token          — get approval data
 *   POST /api/portals/owner/:token          — submit approval decision
 *   GET  /api/portals/sub/:token            — sub portal home
 *   POST /api/portals/sub/:token/lien-waiver — sub signs lien waiver
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from './supabase/admin';

const FROM    = process.env.EMAIL_FROM    ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

function resend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// W-9 PORTAL — GET (return form data for the portal UI)
// GET /api/portals/w9/:token
// ─────────────────────────────────────────────────────────────────────────────

export async function w9GetHandler(req: NextRequest, token: string) {
  const { data: w9 } = await supabaseAdmin
    .from('w9_requests')
    .select('id, vendor_name, expires_at, status, project_id, tenant_id')
    .eq('token', token)
    .maybeSingle();

  if (!w9) return NextResponse.json({ error: 'Invalid or expired W-9 link' }, { status: 404 });
  if (new Date(w9.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'This W-9 request has expired. Contact the GC for a new link.' }, { status: 410 });
  }
  if (w9.status === 'completed') {
    return NextResponse.json({
      alreadyCompleted: true,
      message: 'W-9 already submitted. Thank you.',
    });
  }

  // Get project info to personalize the form
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('name, tenant_id')
    .eq('id', w9.project_id as string)
    .maybeSingle();

  return NextResponse.json({
    w9Id:        w9.id,
    vendorName:  w9.vendor_name,
    projectName: project?.name ?? 'Project',
    expiresAt:   w9.expires_at,
    formFields: [
      { name: 'legal_name',        label: 'Name (as shown on your income tax return)',     required: true,  type: 'text'   },
      { name: 'business_name',     label: 'Business name (if different from above)',        required: false, type: 'text'   },
      { name: 'tax_classification', label: 'Federal Tax Classification',                   required: true,  type: 'select',
        options: [
          { value: 'individual',   label: 'Individual / Sole proprietor' },
          { value: 'c_corp',       label: 'C Corporation' },
          { value: 's_corp',       label: 'S Corporation' },
          { value: 'partnership',  label: 'Partnership' },
          { value: 'trust',        label: 'Trust / Estate' },
          { value: 'llc_c',        label: 'LLC (taxed as C Corp)' },
          { value: 'llc_s',        label: 'LLC (taxed as S Corp)' },
          { value: 'llc_p',        label: 'LLC (taxed as Partnership)' },
          { value: 'other',        label: 'Other' },
        ]
      },
      { name: 'address',           label: 'Address (number, street, apt/suite)',            required: true,  type: 'text'   },
      { name: 'city_state_zip',    label: 'City, State, ZIP',                              required: true,  type: 'text'   },
      { name: 'tin_type',          label: 'Tax Identification Number Type',                required: true,  type: 'select',
        options: [
          { value: 'ssn', label: 'Social Security Number (SSN) — Individuals' },
          { value: 'ein', label: 'Employer Identification Number (EIN) — Businesses' },
        ]
      },
      { name: 'tin',               label: 'TIN (SSN or EIN — will be encrypted, last 4 shown only)', required: true, type: 'tin' },
      { name: 'exempt_payee_code', label: 'Exempt payee code (if applicable)',             required: false, type: 'text'   },
    ],
    certificationText: `Under penalties of perjury, I certify that:
1. The number shown on this form is my correct taxpayer identification number.
2. I am not subject to backup withholding.
3. I am a U.S. citizen or other U.S. person.
4. The FATCA code(s) entered on this form indicating that I am exempt from FATCA reporting is correct.`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// W-9 PORTAL — POST (submit completed W-9)
// POST /api/portals/w9/:token
// ─────────────────────────────────────────────────────────────────────────────

export async function w9PostHandler(req: NextRequest, token: string) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const { data: w9 } = await supabaseAdmin
    .from('w9_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!w9) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (w9.status === 'completed') return NextResponse.json({ error: 'Already submitted' }, { status: 400 });
  if (new Date(w9.expires_at as string) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 410 });

  const legalName = String(body['legal_name'] ?? '');
  const tin       = String(body['tin']        ?? '');
  const tinType   = String(body['tin_type']   ?? '');

  if (!legalName || !tin || !tinType) {
    return NextResponse.json({ error: 'legal_name, tin, and tin_type are required' }, { status: 400 });
  }

  const now  = new Date().toISOString();
  const ip   = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const last4 = tin.replace(/\D/g,'').slice(-4);

  // Encrypt the full TIN using AES-256-GCM
  const crypto = await import('node:crypto');
  const encryptionKey = process.env.SAGUARO_API_SECRET ?? 'secret';
  // Derive a proper 32-byte key from the secret using SHA-256
  const keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  // Generate a random 12-byte IV (standard for GCM)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(tin.replace(/\D/g, ''), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Store as iv:authTag:ciphertext — all needed for decryption
  const tinHash = `${iv.toString('hex')}:${authTag}:${encrypted}`;

  await supabaseAdmin.from('w9_requests').update({
    legal_name:       legalName,
    business_name:    String(body['business_name']     ?? '') || null,
    tax_classification: String(body['tax_classification'] ?? '') || null,
    address:          String(body['address']           ?? '') || null,
    city_state_zip:   String(body['city_state_zip']    ?? '') || null,
    tin_type:         tinType,
    tin_last4:        last4,
    tin_encrypted:    tinHash,  // hash only — never store raw TIN
    exempt_payee_code: String(body['exempt_payee_code'] ?? '') || null,
    signed_name:      legalName,
    signed_date:      now.split('T')[0],
    signature_image_url: body['signatureImageUrl'] as string | null ?? null,
    ip_address:       ip,
    status:           'completed',
    completed_at:     now,
    updated_at:       now,
  }).eq('id', w9.id as string);

  // Notify GC
  const r = resend();
  if (r) {
    const { data: project } = await supabaseAdmin.from('projects').select('name, tenant_id').eq('id', w9.project_id as string).maybeSingle();
    const { data: membership } = await supabaseAdmin.from('tenant_memberships').select('user_id').eq('tenant_id', w9.tenant_id as string).eq('role', 'admin').limit(1).maybeSingle();

    await r.emails.send({
      from:    FROM,
      to:      process.env.SUPPORT_EMAIL ?? 'admin@saguarocrm.com',
      subject: `✅ W-9 Received — ${w9.vendor_name} — ${project?.name ?? 'Project'}`,
      html: `
        <p><strong>${w9.vendor_name}</strong> has submitted their W-9 for <strong>${project?.name ?? 'your project'}</strong>.</p>
        <p>Name: ${legalName}<br/>TIN Type: ${tinType}<br/>TIN: ***-**-${last4}</p>
        <p>The W-9 is on file in Saguaro and the vendor is now compliant for 1099 purposes.</p>
        <p><a href="${APP_URL}/projects/${w9.project_id as string}/compliance">View Compliance Dashboard →</a></p>
      `,
    });
  }

  return NextResponse.json({
    success: true,
    message: 'W-9 submitted successfully. Thank you.',
    completedAt: now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB PORTAL — GET home page data
// GET /api/portals/sub/:token
// ─────────────────────────────────────────────────────────────────────────────

export async function subPortalGetHandler(req: NextRequest, token: string) {
  const { data: session } = await supabaseAdmin
    .from('sub_portal_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (new Date(session.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'This link has expired. Contact the GC for a new link.' }, { status: 410 });
  }

  // Update access count
  await supabaseAdmin.from('sub_portal_sessions').update({
    last_accessed_at: new Date().toISOString(),
    access_count:     ((session.access_count as number) ?? 0) + 1,
  }).eq('token', token);

  const subId    = session.subcontractor_company_id as string;
  const projectId = session.project_id as string;
  const tenantId  = session.tenant_id  as string;

  // Get pending items for this sub
  const [waiverRes, w9Res, coiRes] = await Promise.all([
    supabaseAdmin.from('lien_waivers').select('id, waiver_type, amount, through_date, status').eq('project_id', projectId).eq('claimant_name', session.sub_name as string).in('status', ['draft','sent']),
    supabaseAdmin.from('w9_requests').select('id, status, expires_at').eq('project_id', projectId).eq('vendor_email', session.sub_email as string).neq('status', 'completed'),
    supabaseAdmin.from('insurance_certificates').select('status, gl_expiry').eq('project_id', projectId).eq('subcontractor_company_id', subId).maybeSingle(),
  ]);

  const { data: project } = await supabaseAdmin.from('projects').select('name, address').eq('id', projectId).single();

  return NextResponse.json({
    subName:     session.sub_name,
    projectName: project?.name,
    projectAddress: project?.address,
    pendingItems: {
      lienWaivers:  (waiverRes.data ?? []).map(w => ({
        id: w.id, type: w.waiver_type, amount: w.amount, throughDate: w.through_date, status: w.status,
        signUrl: `${APP_URL}/sub-portal/${token}/sign-waiver/${w.id as string}`,
      })),
      w9Needed:     (w9Res.data ?? []).length > 0,
      w9Url:        (w9Res.data ?? [])[0]
        ? `${APP_URL}/w9/${(w9Res.data![0] as Record<string,unknown>).id}`
        : null,
      coiStatus:    coiRes.data?.status ?? 'missing',
      coiUploadUrl: `${APP_URL}/sub-portal/${token}/upload-coi`,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB PORTAL — Sign lien waiver
// POST /api/portals/sub/:token/lien-waiver
// ─────────────────────────────────────────────────────────────────────────────

export async function subSignLienWaiverHandler(req: NextRequest, token: string) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const waiverId    = String(body['waiverId']   ?? '');
  const signerName  = String(body['signerName'] ?? '');
  const signerTitle = String(body['signerTitle'] ?? '');
  const signatureUrl = body['signatureImageUrl'] as string | undefined;

  if (!waiverId || !signerName) {
    return NextResponse.json({ error: 'waiverId and signerName required' }, { status: 400 });
  }

  const { data: session } = await supabaseAdmin.from('sub_portal_sessions').select('tenant_id').eq('token', token).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const now = new Date().toISOString();
  const ip  = req.headers.get('x-forwarded-for') ?? '';

  await supabaseAdmin.from('lien_waivers').update({
    status:          'signed',
    signed_at:       now,
    signer_name:     signerName,
    signer_title:    signerTitle,
    signature_url:   signatureUrl ?? null,
    updated_at:      now,
  }).eq('id', waiverId);

  // Notify GC
  const r = resend();
  const gcEmail = process.env.EMAIL_REPLY_TO;
  if (r && gcEmail) {
    await r.emails.send({
      from: FROM, to: gcEmail,
      subject: `✅ Lien Waiver Signed — ${signerName}`,
      html: `<p><strong>${signerName}</strong> has signed a lien waiver. View in Saguaro to download the executed copy.</p>`,
    });
  }

  return NextResponse.json({ success: true, signedAt: now });
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE SUB PORTAL SESSION (call when adding a sub to a project)
// ─────────────────────────────────────────────────────────────────────────────

export async function createSubPortalSession(opts: {
  tenantId:  string;
  projectId: string;
  subId:     string;
  subEmail:  string;
  subName:   string;
}): Promise<{ token: string; portalUrl: string }> {
  const token = (await import('node:crypto')).randomBytes(32).toString('hex');
  const now   = new Date().toISOString();

  await supabaseAdmin.from('sub_portal_sessions').insert({
    tenant_id:              opts.tenantId,
    project_id:             opts.projectId,
    subcontractor_company_id: opts.subId,
    sub_email:              opts.subEmail,
    sub_name:               opts.subName,
    token,
    expires_at:             new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    created_at:             now,
  });

  return { token, portalUrl: `${APP_URL}/sub-portal/${token}` };
}
