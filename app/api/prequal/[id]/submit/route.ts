import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: token } = await params;

  try {
    /* ── Validate token ──────────────────────────────────────────── */
    const { data: submission, error: lookupErr } = await db
      .from('prequal_submissions')
      .select('id, status, portal_expires_at')
      .eq('portal_token', token)
      .single();

    if (lookupErr || !submission) {
      return NextResponse.json({ error: 'Invalid or expired prequalification link' }, { status: 404 });
    }

    if (submission.status === 'submitted' || submission.status === 'under_review' || submission.status === 'approved') {
      return NextResponse.json({ error: 'This prequalification has already been submitted' }, { status: 409 });
    }

    if (submission.portal_expires_at && new Date(submission.portal_expires_at) < new Date()) {
      return NextResponse.json({ error: 'This prequalification link has expired' }, { status: 410 });
    }

    /* ── Parse and validate body ─────────────────────────────────── */
    const body = await req.json();

    if (!body.company_name?.trim()) {
      return NextResponse.json({ error: 'Missing required field: company_name' }, { status: 400 });
    }
    if (!body.contact_name?.trim()) {
      return NextResponse.json({ error: 'Missing required field: contact_name' }, { status: 400 });
    }
    if (!body.contact_email?.trim()) {
      return NextResponse.json({ error: 'Missing required field: contact_email' }, { status: 400 });
    }

    /* EMR validation */
    for (const field of ['emr_current', 'emr_prior_year', 'emr_two_years_prior'] as const) {
      if (body[field] != null && body[field] !== '') {
        const val = parseFloat(body[field]);
        if (isNaN(val) || val < 0.1 || val > 3.0) {
          return NextResponse.json({ error: `${field} must be between 0.1 and 3.0` }, { status: 400 });
        }
      }
    }

    /* ── Update submission ────────────────────────────────────────── */
    const { error: updateErr } = await db
      .from('prequal_submissions')
      .update({
        company_name: body.company_name,
        dba_name: body.dba_name || null,
        year_established: body.year_established || null,
        contact_name: body.contact_name,
        contact_email: body.contact_email,
        contact_phone: body.contact_phone || null,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        website: body.website || null,
        primary_trade: body.primary_trade || null,
        license_number: body.license_number || null,
        license_state: body.license_state || null,
        license_expiry: body.license_expiry || null,
        license_type: body.license_type || null,
        emr_current: body.emr_current ?? null,
        emr_prior_year: body.emr_prior_year ?? null,
        emr_two_years_prior: body.emr_two_years_prior ?? null,
        osha_recordable_incidents: body.osha_recordable_incidents ?? null,
        osha_lost_time_incidents: body.osha_lost_time_incidents ?? null,
        has_safety_officer: body.has_safety_officer ?? false,
        safety_program_description: body.safety_program_description || null,
        annual_revenue: body.annual_revenue ?? null,
        largest_single_project: body.largest_single_project ?? null,
        current_backlog: body.current_backlog ?? null,
        bonding_limit: body.bonding_limit ?? null,
        bonding_agent: body.bonding_agent || null,
        bonding_agent_phone: body.bonding_agent_phone || null,
        references: body.references || [],
        gl_carrier: body.gl_carrier || null,
        gl_expiry: body.gl_expiry || null,
        gl_limit: body.gl_limit ?? null,
        wc_carrier: body.wc_carrier || null,
        wc_expiry: body.wc_expiry || null,
        auto_carrier: body.auto_carrier || null,
        auto_expiry: body.auto_expiry || null,
        umbrella_limit: body.umbrella_limit ?? null,
        w9_url: body.w9_url || null,
        license_cert_url: body.license_cert_url || null,
        insurance_cert_url: body.insurance_cert_url || null,
        financial_statement_url: body.financial_statement_url || null,
        safety_program_url: body.safety_program_url || null,
        osha_logs_url: body.osha_logs_url || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', submission.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      confirmation_number: submission.id.slice(0, 8).toUpperCase(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
