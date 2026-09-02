import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { assembleJacket, snapshotJacket } from '@/lib/bid-jacket';
import { onSubInvitedToBid } from '@/lib/triggers';

/**
 * POST /api/bid-packages/[id]/issue — send the jacket out.
 *
 * The verb the module never had. A GC could build a package, price it and
 * invite people, but there was no single act that said "this is the jacket, it
 * is complete, it goes to these bidders, as of now" — which is why 70 packages
 * existed against zero invitations. `bid_packages.status` even declares 'sent'
 * in lib/status-system and nothing had ever written it.
 *
 * Issuing does three things a bare invite loop cannot:
 *
 *   1. REFUSES AN INCOMPLETE JACKET. If a required section is empty it answers
 *      409 and names it. A jacket sent without drawings generates a day of
 *      phone calls; catching it here costs one click. `force: true` overrides,
 *      because sometimes a GC genuinely is issuing scope-only for pricing.
 *
 *   2. SNAPSHOTS A MANIFEST. What was in the jacket, at what revision, on what
 *      date — into jacket_sections / jacket_version. Without it a drawing
 *      revised after issue silently changes what every bidder is pricing, and
 *      nobody can later say what was actually sent.
 *
 *   3. FANS OUT and reports honestly. The response says which invitations were
 *      actually delivered, because email can fail and "invited 12 subs" must
 *      not be a guess.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    const p = pkg as Record<string, any>;

    const jacket = await assembleJacket(db, {
      packageId: id,
      tenantId: user.tenantId,
      pkg: p,
      resolveUrl: (u) => (u ? `/api/files/open?u=${encodeURIComponent(u)}` : null),
    });

    if (jacket.completeness.missing.length > 0 && !force) {
      return NextResponse.json(
        {
          error: 'This jacket is not complete yet.',
          missing: jacket.completeness.missing,
          /* Named, not scored. "Drawings, Specifications" is something a GC can
             go and fix; "67% complete" is not. */
          message: `${jacket.completeness.missing.join(' and ')} ${
            jacket.completeness.missing.length === 1 ? 'is' : 'are'
          } empty. Add them, or issue anyway if that is deliberate.`,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const version = Number(p.jacket_version ?? 0) + 1;
    const manifest = snapshotJacket(jacket, version);

    /* New bidders named on this call, plus everyone already invited. Issuing
       twice must not create duplicate invites — the unique index on
       (bid_package_id, sub_email) makes the upsert idempotent. */
    const incoming = Array.isArray(body.subs) ? body.subs : [];
    for (const sub of incoming as Array<Record<string, string | undefined>>) {
      const email = String(sub.email || '').trim().toLowerCase();
      if (!email) continue;
      await tryWrite(
        db.from('bid_package_invites').upsert(
          {
            tenant_id: user.tenantId,
            bid_package_id: id,
            sub_id: sub.subId || null,
            sub_name: sub.name || sub.company || email,
            sub_email: email,
            company_name: sub.company || sub.name || null,
            contact_name: sub.contactName || sub.name || null,
            trade: (p.trade as string) || null,
            status: 'invited',
            response_status: 'invited',
            invitation_sent_at: now,
          } as never,
          { onConflict: 'bid_package_id,sub_email' },
        ),
        'bid_package_invites issue upsert',
      );
    }

    const { data: invites } = await db
      .from('bid_package_invites')
      .select('id, sub_email, response_status')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId);

    const recipients = (invites || []) as Record<string, string>[];
    if (!recipients.length) {
      return NextResponse.json(
        { error: 'There is nobody to send this to. Invite subcontractors first.' },
        { status: 400 },
      );
    }

    await must(
      db.from('bid_packages').update({
        status: 'sent',
        jacket_sections: manifest as never,
        jacket_version: version,
        jacket_generated_at: now,
        invite_sent_at: now,
        invite_sent_to: recipients.map((r) => r.sub_email) as never,
        num_invited: recipients.length,
        /* Issuing is what grants portal access — the invite links have to work
           the moment they land. */
        sub_portal_enabled: true,
      } as never)
        .eq('id', id)
        .eq('tenant_id', user.tenantId),
      'bid_packages issue',
    );

    /* Sent one at a time so a single bad address cannot swallow the batch, and
       so the response can say exactly who was reached. */
    const delivery: Array<{ email: string; sent: boolean }> = [];
    for (const inv of recipients) {
      try {
        await onSubInvitedToBid(id, inv.id);
        delivery.push({ email: inv.sub_email, sent: true });
      } catch (e) {
        console.error('[bid issue] invite email failed', inv.sub_email, e);
        delivery.push({ email: inv.sub_email, sent: false });
      }
    }

    return NextResponse.json({
      success: true,
      version,
      issuedAt: now,
      invited: recipients.length,
      delivered: delivery.filter((d) => d.sent).length,
      delivery,
      forced: force && jacket.completeness.missing.length > 0,
      missing: jacket.completeness.missing,
    });
  } catch (e) {
    return apiError('bid_package_issue', e);
  }
}
