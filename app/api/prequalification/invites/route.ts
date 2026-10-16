import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { sendPrequalInvite } from '@/lib/email';
import type { Database } from '@/lib/database.types';
import crypto from 'crypto';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/** Opaque, high-entropy portal token (256 bits, url-safe). */
function makeToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('prequalification_invites')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('prequalification/invites GET', e);
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = g.db;

    const subEmail = String(body.sub_email ?? body.email ?? '').trim().toLowerCase();
    if (!subEmail || !subEmail.includes('@')) {
      return NextResponse.json({ error: 'A valid subcontractor email is required.' }, { status: 400 });
    }
    const subName = (body.sub_name ?? body.name ?? '').toString().trim() || null;
    const templateId = body.template_id || null;

    // Always mint our own high-entropy token server-side (do NOT trust a
    // client-supplied token). The DB has a uuid default but a 256-bit token is
    // stronger and unguessable.
    const token = makeToken();

    const { data: invite, error } = await db
      .from('prequalification_invites')
      .insert({
        tenant_id: user.tenantId,
        sub_email: subEmail,
        sub_name: subName,
        template_id: templateId,
        sub_id: body.sub_id || null,
        token,
        status: 'sent',
        sent_at: new Date().toISOString(),
      } as Database['public']['Tables']['prequalification_invites']['Insert'])
      .select()
      .single();
    if (error) throw error;

    const portalUrl = `${APP_URL}/prequal/${token}`;

    // Company name for the email — the GC's company (from their profile).
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, company')
      .eq('id', user.id)
      .maybeSingle();
    const companyName =
      (profile as { company?: string; full_name?: string } | null)?.company ||
      (profile as { company?: string; full_name?: string } | null)?.full_name ||
      'Your General Contractor';

    // Template name (optional) for the email body.
    let templateName: string | null = null;
    if (templateId) {
      const { data: tpl } = await db
        .from('prequalification_templates')
        .select('name')
        .eq('id', templateId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      templateName = (tpl as { name?: string } | null)?.name ?? null;
    }

    // Send the real email. Honest result — never fake "sent".
    const emailResult = await sendPrequalInvite({
      to: subEmail,
      subName,
      companyName,
      templateName,
      portalUrl,
    });

    // If the email did not actually go out, reflect that on the row so the admin
    // list doesn't imply a delivery that never happened.
    if (!emailResult.sent) {
      await must(db
        .from('prequalification_invites')
        .update({ status: 'pending' })
        .eq('id', (invite as { id: string }).id)
        .eq('tenant_id', user.tenantId), 'prequalification_invites write');
      (invite as { status?: string }).status = 'pending';
    }

    return NextResponse.json({
      data: invite,
      portalUrl,
      emailSent: emailResult.sent,
      emailError: emailResult.error ?? null,
    });
  } catch (e) {
    return apiError('prequalification/invites POST', e);
  }
}
