import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('bid_package_invites')
      .select('*, bid_packages(*, projects(name), bid_package_items(*))')
      .eq('token', token)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
    const invite = data as any;
    const pkg = invite.bid_packages;
    return NextResponse.json({
      package: {
        id: pkg?.id,
        title: pkg?.title,
        trade: pkg?.trade,
        csi_division: pkg?.csi_division,
        description: pkg?.description,
        scope_summary: pkg?.scope_summary,
        due_date: pkg?.due_date,
        estimated_value: pkg?.estimated_value,
        bonding_required: pkg?.bonding_required,
        items: pkg?.bid_package_items || [],
        projectName: pkg?.projects?.name,
        invite: { status: invite.status },
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data: invite } = await db
      .from('bid_package_invites')
      .select('*, bid_packages(tenant_id, project_id)')
      .eq('token', token)
      .single();
    if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    const inv = invite as any;

    // Record submission — the bid row MUST land before we tell the sub it was
    // received. supabase-js does not throw on a failed write; it returns { error }.
    // Silently swallowing that error is how bid_submissions stayed empty while
    // subs were shown "submitted".
    const { data: submission, error: submitErr } = await db.from('bid_submissions').insert({
      bid_package_id: inv.bid_package_id,
      sub_id: inv.sub_id,
      tenant_id: inv.bid_packages?.tenant_id,
      project_id: inv.bid_packages?.project_id,
      company_name: body.companyName,
      contact_name: body.contactName,
      contact_email: body.email,
      contact_phone: body.phone,
      license_number: body.licenseNumber,
      bonding_capacity: body.bondingCapacity,
      base_amount: parseFloat(body.baseAmount) || 0,
      alternates: body.alternates,
      exclusions: body.exclusions,
      inclusions: body.inclusions,
      proposed_schedule: body.schedule,
      notes: body.notes,
      bond_available: body.bondAvailable,
      insurance_meets: body.insuranceMeets,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).select('id').single();

    if (submitErr || !submission) {
      console.error('[api/bid-packages/portal] bid_submissions insert failed:', submitErr?.message, submitErr?.details);
      return apiError('bid-packages/portal', submitErr, 'Your bid could not be saved. Nothing was recorded — please try again or contact the general contractor directly.');
    }

    // Only now that the bid row is confirmed written may the invite be closed out.
    const { error: inviteErr } = await db
      .from('bid_package_invites')
      .update({ status: 'submitted' })
      .eq('token', token);
    if (inviteErr) {
      // The bid IS saved, so this is not a submission failure — but say so honestly
      // rather than silently leaving the invite showing as still open.
      console.error('[api/bid-packages/portal] invite status update failed:', inviteErr.message);
      return NextResponse.json({
        success: true,
        submissionId: submission.id,
        warning: 'Your bid was received and saved, but the invitation status could not be updated. No action is needed from you.',
      });
    }

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (err) {
    console.error('[api/bid-packages/portal] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Your bid could not be saved. Nothing was recorded — please try again or contact the general contractor directly.' }, { status: 500 });
  }
}
