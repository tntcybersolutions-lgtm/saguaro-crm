/**
 * insurance-tracker.ts
 *
 * ACORD 25 Insurance Certificate Tracking System
 *
 * Complete workflow:
 *   1. Request COI from sub (email with upload link)
 *   2. Sub uploads their ACORD 25 PDF
 *   3. Claude reads the PDF and extracts all fields
 *   4. System validates against project requirements
 *   5. Daily cron checks for expiring certificates
 *   6. Auto-alerts PM when COI expires or is deficient
 *
 * API Routes:
 *   POST /api/insurance/request          — request COI from vendor
 *   POST /api/insurance/upload           — sub uploads their COI PDF
 *   GET  /api/insurance/[projectId]      — list all COIs for project
 *   GET  /api/insurance/dashboard        — compliance dashboard
 *   POST /api/insurance/check-expiry     — cron: check and alert on expiring COIs
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

import { supabaseAdmin } from './supabase/admin';
import { getProjectContext } from './project-context';

const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FROM    = process.env.EMAIL_FROM    ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

function resend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard insurance requirements by project value
// ─────────────────────────────────────────────────────────────────────────────

function getRequiredLimits(contractAmount: number): {
  glEachOccurrence:  number;
  glAggregate:       number;
  autoCombined:      number;
  umbrella:          number;
  wcElEachAccident:  number;
} {
  if (contractAmount >= 5_000_000) {
    return { glEachOccurrence: 2_000_000, glAggregate: 4_000_000, autoCombined: 1_000_000, umbrella: 10_000_000, wcElEachAccident: 1_000_000 };
  }
  if (contractAmount >= 1_000_000) {
    return { glEachOccurrence: 2_000_000, glAggregate: 4_000_000, autoCombined: 1_000_000, umbrella: 5_000_000,  wcElEachAccident: 1_000_000 };
  }
  if (contractAmount >= 500_000) {
    return { glEachOccurrence: 1_000_000, glAggregate: 2_000_000, autoCombined: 1_000_000, umbrella: 3_000_000,  wcElEachAccident: 500_000 };
  }
  return { glEachOccurrence: 1_000_000, glAggregate: 2_000_000, autoCombined: 1_000_000, umbrella: 0, wcElEachAccident: 500_000 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REQUEST COI FROM VENDOR
// POST /api/insurance/request
// ─────────────────────────────────────────────────────────────────────────────

export async function requestCOIHandler(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId    = String(body['tenantId']    ?? '');
  const projectId   = String(body['projectId']   ?? '');
  const vendorName  = String(body['vendorName']  ?? '');
  const vendorEmail = String(body['vendorEmail'] ?? '');
  const subId       = body['subcontractorCompanyId'] as string | undefined;

  if (!tenantId || !projectId || !vendorName || !vendorEmail) {
    return NextResponse.json({ error: 'tenantId, projectId, vendorName, vendorEmail required' }, { status: 400 });
  }

  const ctx = await getProjectContext(tenantId, projectId);
  const now = new Date().toISOString();
  const required = getRequiredLimits(ctx.project.contract_amount);

  // Generate upload token
  const token = (await import('node:crypto')).randomBytes(32).toString('hex');

  // Create COI record (pending)
  const { data: coi, error } = await supabaseAdmin
    .from('insurance_certificates')
    .insert({
      tenant_id:              tenantId,
      project_id:             projectId,
      subcontractor_company_id: subId ?? null,
      vendor_name:            vendorName,
      cert_holder_name:       ctx.gc?.name ?? process.env.COMPANY_NAME ?? 'General Contractor',
      cert_holder_address:    ctx.gc?.address ?? null,
      status:                 'pending',
      created_at:             now,
      updated_at:             now,
    })
    .select('id')
    .single();

  if (error || !coi) {
    return NextResponse.json({ error: `COI record: ${error?.message}` }, { status: 500 });
  }

  // Email the vendor
  const uploadUrl = `${APP_URL}/insurance/upload?token=${token}&coi=${coi.id as string}&vendor=${encodeURIComponent(vendorName)}`;
  const r = resend();
  if (r) {
    await r.emails.send({
      from:    FROM,
      to:      vendorEmail,
      subject: `Insurance Certificate Required — ${ctx.project.name}`,
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#1b3a5c;padding:20px 28px;border-radius:6px 6px 0 0">
            <h2 style="color:#fff;margin:0">Certificate of Insurance Required</h2>
            <p style="color:#a8c4e0;margin:4px 0 0">${ctx.project.name}</p>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;padding:24px 28px;border-radius:0 0 6px 6px">
            <p>Dear ${vendorName},</p>
            <p>A current Certificate of Insurance is required for your work on <strong>${ctx.project.name}</strong>.</p>

            <p><strong>Required Minimum Limits:</strong></p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">
              <tr style="background:#f7fafc"><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600">Commercial General Liability</td><td style="padding:6px 10px;border:1px solid #e2e8f0">$${(required.glEachOccurrence/1000000).toFixed(0)}M per occurrence / $${(required.glAggregate/1000000).toFixed(0)}M aggregate</td></tr>
              <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600">Automobile Liability</td><td style="padding:6px 10px;border:1px solid #e2e8f0">$${(required.autoCombined/1000000).toFixed(0)}M combined single limit</td></tr>
              <tr style="background:#f7fafc"><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600">Workers' Compensation</td><td style="padding:6px 10px;border:1px solid #e2e8f0">Statutory limits / $${(required.wcElEachAccident/1000).toFixed(0)}K employer's liability</td></tr>
              ${required.umbrella > 0 ? `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600">Umbrella/Excess Liability</td><td style="padding:6px 10px;border:1px solid #e2e8f0">$${(required.umbrella/1000000).toFixed(0)}M</td></tr>` : ''}
            </table>

            <p><strong>Certificate Holder (name your certificate holder as):</strong><br/>
            ${ctx.gc?.name ?? 'General Contractor'}<br/>
            ${ctx.gc?.address ?? ''}</p>

            <p><strong>Additional Insured:</strong> ${ctx.gc?.name ?? 'General Contractor'} and ${ctx.owner?.name ?? 'Owner'} must be named as Additional Insured on a primary and non-contributory basis.</p>

            <p>Please upload your ACORD 25 below:</p>

            <div style="text-align:center;margin:20px 0">
              <a href="${uploadUrl}" style="display:inline-block;background:#e07b39;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700">Upload Certificate of Insurance →</a>
            </div>

            <p style="font-size:12px;color:#718096">Questions? Contact ${ctx.gc?.email ?? 'the general contractor'}. Certificate must be received before work begins on site.</p>
          </div>
        </div>
      `,
    });
  }

  return NextResponse.json({
    success:   true,
    coiId:     coi.id,
    uploadUrl,
    emailSent: !!r && !!vendorEmail,
    requiredLimits: required,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UPLOAD + PARSE COI (Claude reads ACORD 25)
// POST /api/insurance/upload  (multipart/form-data)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadCOIHandler(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });

  const coiId    = String(formData.get('coiId')    ?? '');
  const tenantId = String(formData.get('tenantId') ?? '');
  const file     = formData.get('file') as File | null;

  if (!coiId || !file) return NextResponse.json({ error: 'coiId and file are required' }, { status: 400 });

  const buffer      = Buffer.from(await file.arrayBuffer());
  const base64      = buffer.toString('base64');
  const now         = new Date().toISOString();

  // Upload to Supabase Storage
  const storagePath = `${tenantId}/insurance/${coiId}/${Date.now()}_${file.name}`;
  await supabaseAdmin.storage.from('documents').upload(storagePath, buffer, {
    contentType: 'application/pdf',
    upsert: false,
  });

  // Use Claude to extract ACORD 25 fields
  let extracted: Record<string, unknown> = {};
  let aiConfidence: 'high' | 'medium' | 'low' = 'low';
  const aiFlags: string[] = [];

  try {
    const response = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      system: `You are an expert insurance certificate reviewer. Extract all fields from this ACORD 25 Certificate of Insurance. Return ONLY valid JSON with these exact fields. If a field is not visible, use null.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type:       'base64',
              media_type: file.type === 'application/pdf' ? 'image/png' : file.type as 'image/jpeg' | 'image/png',
              data:       base64,
            },
          } as Anthropic.ImageBlockParam,
          {
            type: 'text',
            text: `Extract from this ACORD 25 Certificate of Insurance:
{
  "insured_name": string,
  "insured_address": string,
  "cert_holder_name": string,
  "cert_holder_address": string,
  "gl_insurer": string,
  "gl_policy_number": string,
  "gl_effective": "YYYY-MM-DD",
  "gl_expiry": "YYYY-MM-DD",
  "gl_each_occurrence": number,
  "gl_general_aggregate": number,
  "gl_products_completed_ops": number,
  "auto_insurer": string,
  "auto_policy_number": string,
  "auto_effective": "YYYY-MM-DD",
  "auto_expiry": "YYYY-MM-DD",
  "auto_combined_limit": number,
  "wc_insurer": string,
  "wc_policy_number": string,
  "wc_effective": "YYYY-MM-DD",
  "wc_expiry": "YYYY-MM-DD",
  "wc_el_each_accident": number,
  "umbrella_insurer": string,
  "umbrella_policy_number": string,
  "umbrella_effective": "YYYY-MM-DD",
  "umbrella_expiry": "YYYY-MM-DD",
  "umbrella_limit": number,
  "additional_insured": boolean,
  "waiver_of_subrogation": boolean,
  "primary_noncontributory": boolean,
  "acord_version": string,
  "confidence": "high|medium|low"
}`,
          },
        ],
      }],
    });

    const text = response.content.find(b => b.type === 'text');
    if (text && text.type === 'text') {
      extracted = JSON.parse(text.text.replace(/```json?\n?/g,'').replace(/```\n?/g,'').trim());
      aiConfidence = (extracted['confidence'] as 'high'|'medium'|'low') ?? 'medium';
      delete extracted['confidence'];
    }
  } catch (err) {
    aiFlags.push(`AI extraction failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Fetch project context for validation
  const { data: coiRecord } = await supabaseAdmin
    .from('insurance_certificates')
    .select('project_id, tenant_id')
    .eq('id', coiId)
    .single();

  let deficiencies: string[] = [];
  if (coiRecord && extracted['gl_each_occurrence']) {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('contract_amount')
      .eq('id', coiRecord.project_id as string)
      .single();

    if (project) {
      const required = getRequiredLimits(Number(project.contract_amount ?? 0));
      if (Number(extracted['gl_each_occurrence'] ?? 0) < required.glEachOccurrence) {
        deficiencies.push(`GL each occurrence $${(Number(extracted['gl_each_occurrence'])/1000000).toFixed(1)}M is below required $${(required.glEachOccurrence/1000000).toFixed(0)}M`);
      }
      if (Number(extracted['gl_general_aggregate'] ?? 0) < required.glAggregate) {
        deficiencies.push(`GL aggregate $${(Number(extracted['gl_general_aggregate'])/1000000).toFixed(1)}M is below required $${(required.glAggregate/1000000).toFixed(0)}M`);
      }
      if (!extracted['additional_insured']) {
        deficiencies.push('Additional Insured endorsement not confirmed on certificate');
      }
      if (extracted['gl_expiry'] && new Date(extracted['gl_expiry'] as string) < new Date()) {
        deficiencies.push(`GL policy EXPIRED on ${extracted['gl_expiry']}`);
      }
    }
  }

  // Determine earliest expiry for status logic
  const expiryDates = [
    extracted['gl_expiry'],
    extracted['auto_expiry'],
    extracted['wc_expiry'],
  ].filter(Boolean).map(d => new Date(d as string));

  const earliestExpiry = expiryDates.length > 0 ? new Date(Math.min(...expiryDates.map(d => d.getTime()))) : null;
  const daysToExpiry   = earliestExpiry ? Math.floor((earliestExpiry.getTime() - Date.now()) / 86400000) : null;

  let status: string;
  if (deficiencies.length > 0) status = 'deficient';
  else if (daysToExpiry !== null && daysToExpiry < 0) status = 'expired';
  else if (daysToExpiry !== null && daysToExpiry <= 30) status = 'expiring_soon';
  else status = 'active';

  // Save all extracted data
  await supabaseAdmin
    .from('insurance_certificates')
    .update({
      ...extracted,
      coi_pdf_url:    storagePath,
      ai_extracted:   true,
      ai_confidence:  aiConfidence,
      ai_flags:       [...aiFlags, ...deficiencies],
      status,
      deficiency_notes: deficiencies.length > 0 ? deficiencies.join('; ') : null,
      updated_at:     now,
    })
    .eq('id', coiId);

  return NextResponse.json({
    coiId,
    status,
    aiConfidence,
    extracted,
    deficiencies,
    daysToExpiry,
    message: deficiencies.length > 0
      ? `COI uploaded but has ${deficiencies.length} deficiency(ies) — PM notified`
      : `COI verified and approved (${status})`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET COI LIST FOR PROJECT
// GET /api/insurance/[projectId]?tenantId=xxx
// ─────────────────────────────────────────────────────────────────────────────

export async function getCOIListHandler(req: NextRequest, projectId: string) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const { data } = await supabaseAdmin
    .from('insurance_certificates')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const required = await (async () => {
    const { data: p } = await supabaseAdmin.from('projects').select('contract_amount').eq('id', projectId).single();
    return getRequiredLimits(Number(p?.contract_amount ?? 0));
  })();

  return NextResponse.json({ certificates: data ?? [], requiredLimits: required });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DAILY EXPIRY CHECK CRON
// POST /api/insurance/check-expiry
// Called by Vercel Cron or external scheduler daily at 7am
// ─────────────────────────────────────────────────────────────────────────────

export async function checkExpiryHandler(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.AUTOPILOT_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now      = new Date().toISOString();
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  // Find certificates expiring within 30 days or already expired
  const { data: expiring } = await supabaseAdmin
    .from('insurance_certificates')
    .select('*, projects!inner(name, tenant_id)')
    .or(`gl_expiry.lte.${in30Days},auto_expiry.lte.${in30Days},wc_expiry.lte.${in30Days}`)
    .eq('status', 'active');

  let notified = 0;
  const r = resend();

  for (const cert of expiring ?? []) {
    const project = cert.projects as Record<string, unknown>;
    const ctx = await getProjectContext(cert.tenant_id as string, cert.project_id as string).catch(() => null);
    if (!ctx) continue;

    const gcEmail = ctx.gc?.email;
    if (!r || !gcEmail) continue;

    const glDays   = cert.gl_expiry   ? Math.floor((new Date(cert.gl_expiry as string).getTime() - Date.now()) / 86400000) : null;
    const autoDays = cert.auto_expiry  ? Math.floor((new Date(cert.auto_expiry as string).getTime() - Date.now()) / 86400000) : null;
    const wcDays   = cert.wc_expiry    ? Math.floor((new Date(cert.wc_expiry as string).getTime() - Date.now()) / 86400000) : null;

    const expired  = [glDays, autoDays, wcDays].some(d => d !== null && d < 0);
    const critical = [glDays, autoDays, wcDays].some(d => d !== null && d <= 7);

    const subject = expired
      ? `🚨 EXPIRED COI — ${cert.vendor_name} — ${project.name}`
      : critical
        ? `⚠️ COI Expiring Soon — ${cert.vendor_name} — ${project.name}`
        : `COI Renewal Needed — ${cert.vendor_name} — ${project.name}`;

    await r.emails.send({
      from: FROM,
      to:   gcEmail,
      subject,
      html: `
        <p><strong>${cert.vendor_name}</strong>'s Certificate of Insurance on <strong>${project.name}</strong> requires attention:</p>
        <ul>
          ${glDays !== null ? `<li>GL Policy: ${glDays < 0 ? `<strong style="color:red">EXPIRED ${Math.abs(glDays)} days ago</strong>` : `expires in ${glDays} days (${cert.gl_expiry})`}</li>` : ''}
          ${autoDays !== null ? `<li>Auto Policy: ${autoDays < 0 ? `<strong style="color:red">EXPIRED</strong>` : `expires in ${autoDays} days`}</li>` : ''}
          ${wcDays !== null ? `<li>WC Policy: ${wcDays < 0 ? `<strong style="color:red">EXPIRED</strong>` : `expires in ${wcDays} days`}</li>` : ''}
        </ul>
        <p><strong>Action required:</strong> Request updated certificate from ${cert.vendor_name} immediately. Work must stop if COI is expired.</p>
        <p><a href="${APP_URL}/projects/${cert.project_id as string}/insurance">Manage Insurance Certificates →</a></p>
      `,
    });

    // Update status
    await supabaseAdmin
      .from('insurance_certificates')
      .update({ status: expired ? 'expired' : 'expiring_soon', updated_at: now })
      .eq('id', cert.id);

    notified++;
  }

  return NextResponse.json({ checked: (expiring ?? []).length, notified });
}
