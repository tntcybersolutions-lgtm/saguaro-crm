import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const body = await req.json();
    const { emails, expiresInDays = 21 } = body as { emails: string[]; expiresInDays?: number };

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'At least one email is required' }, { status: 400 });
    }

    // Verify ownership
    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('id, name, sub_portal_token, project_id, tenant_id, trade, bid_due_date, scope_narrative, requires_bond')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (pkgErr || !pkg) {
      return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    }

    // Get project name for email
    const { data: proj } = await db
      .from('projects')
      .select('name')
      .eq('id', pkg.project_id)
      .eq('tenant_id', user.tenantId)
      .single();

    // Enable portal + set expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const inviteSentTo = emails.map(email => ({
      email: email.trim().toLowerCase(),
      sent_at: new Date().toISOString(),
    }));

    const { error: updateErr } = await db
      .from('bid_packages')
      .update({
        sub_portal_enabled: true,
        sub_portal_expires_at: expiresAt.toISOString(),
        invite_sent_at: new Date().toISOString(),
        invite_sent_to: inviteSentTo,
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (updateErr) throw updateErr;

    // Send invitation emails via Resend (if available)
    let emailsSent = 0;
    const portalUrl = `https://saguarocontrol.net/bid/${pkg.sub_portal_token}`;

    try {
      const { sendEmail } = await import('@/lib/email/send');
      for (const email of emails) {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@')) continue;

        await sendEmail({
          to: trimmed,
          subject: `Bid Invitation — ${pkg.name} — ${proj?.name || 'Project'}`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #0d1117; color: #e6edf3; padding: 32px; border-radius: 12px;">
                <div style="font-size: 11px; color: #C8960F; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 8px;">
                  🏗 Bid Invitation
                </div>
                <h1 style="font-size: 22px; color: #e6edf3; margin: 0 0 8px;">${pkg.name}</h1>
                <p style="font-size: 14px; color: #8b949e; margin: 0 0 24px;">${proj?.name || 'Project'}</p>

                <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  ${pkg.trade ? `<div style="margin-bottom: 8px;"><span style="color: #8b949e; font-size: 12px;">Trade:</span> <span style="color: #e6edf3;">${pkg.trade}</span></div>` : ''}
                  ${pkg.bid_due_date ? `<div style="margin-bottom: 8px;"><span style="color: #8b949e; font-size: 12px;">Due Date:</span> <span style="color: #e6edf3; font-weight: 600;">${new Date(pkg.bid_due_date).toLocaleDateString()}</span></div>` : ''}
                  <div><span style="color: #8b949e; font-size: 12px;">Bond Required:</span> <span style="color: #e6edf3;">${pkg.requires_bond ? 'Yes' : 'No'}</span></div>
                </div>

                ${pkg.scope_narrative ? `<p style="font-size: 13px; color: #8b949e; line-height: 1.6; margin-bottom: 24px;">${pkg.scope_narrative.substring(0, 200)}${pkg.scope_narrative.length > 200 ? '...' : ''}</p>` : ''}

                <a href="${portalUrl}" style="display: inline-block; background: #C8960F; color: #0d1117; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px;">
                  Submit Your Bid →
                </a>

                <p style="font-size: 12px; color: #484f58; margin-top: 24px;">
                  Click the button above to submit your bid online. No account required.
                </p>
              </div>
            </div>
          `,
        });
        emailsSent++;
      }
    } catch {
      // Email sending failed — portal is still enabled, just no emails sent
    }

    return NextResponse.json({
      data: {
        token: pkg.sub_portal_token,
        invited_count: emailsSent || emails.length,
        portal_url: portalUrl,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
