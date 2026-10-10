import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { assembleJacket, snapshotJacket } from '@/lib/bid-jacket';
import { sendCorrespondenceEmail } from '@/lib/email';
import { withComm } from '@/lib/comm-log';

/**
 * POST /api/bid-packages/[id]/addendum — issue a numbered addendum.
 *
 * Once a jacket is out, the scope cannot change quietly. If a fixture schedule
 * is revised and only some bidders hear about it, the bids are not comparable
 * and the low number is meaningless — that is the whole reason addenda are
 * numbered and issued to everyone at once rather than emailed to whoever asked.
 *
 * So this: allocates the next number, re-snapshots the manifest at a new
 * version so what-was-issued stays a matter of record, and notifies every
 * invitee — including the ones who already declined, because an addendum is
 * frequently what changes their mind.
 *
 * addendum_count and last_addendum_date exist on bid_packages and had never
 * been written. No new table is needed.
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

    const summary = String(body.summary || '').trim();
    if (!summary) {
      return NextResponse.json({ error: 'Describe what changed — bidders are told this verbatim.' }, { status: 400 });
    }

    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    const p = pkg as Record<string, any>;

    if (!p.jacket_generated_at) {
      return NextResponse.json(
        { error: 'This jacket has not been issued yet — there is nobody holding it to send an addendum to.' },
        { status: 409 },
      );
    }

    const n = Number(p.addendum_count ?? 0) + 1;
    const now = new Date();
    const nowIso = now.toISOString();

    /* Any file uploaded with the addendum goes into the jacket's Addenda
       divider, so a bidder opening the link later sees it in place rather than
       having to dig through an old email. */
    if (body.fileUrl) {
      await tryWrite(
        db.from('bid_package_documents').insert({
          tenant_id: user.tenantId,
          bid_package_id: id,
          category: 'addendum',
          label: `Addendum ${String(n).padStart(2, '0')} — ${summary.slice(0, 80)}`,
          file_url: String(body.fileUrl),
          file_name: String(body.fileName || `Addendum-${n}.pdf`),
          file_type: String(body.fileType || 'pdf'),
          sort_order: n,
        } as never),
        'bid_package_documents addendum',
      );
    }

    /* Re-snapshot AFTER attaching, so the manifest records the jacket as it now
       stands — that is what the drift check compares against next time. */
    const jacket = await assembleJacket(db, {
      packageId: id,
      tenantId: user.tenantId,
      pkg: p,
      resolveUrl: (u) => (u ? `/api/files/open?u=${encodeURIComponent(u)}` : null),
    });
    const version = Number(p.jacket_version ?? 1) + 1;

    await must(
      db.from('bid_packages').update({
        addendum_count: n,
        last_addendum_date: nowIso.slice(0, 10),
        jacket_sections: snapshotJacket(jacket, version) as never,
        jacket_version: version,
      } as never)
        .eq('id', id)
        .eq('tenant_id', user.tenantId),
      'bid_packages addendum',
    );

    const { data: invites } = await db
      .from('bid_package_invites')
      .select('id, sub_id, sub_email, company_name, sub_name, token, response_status')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId);

    const recipients = ((invites || []) as Record<string, string>[]).filter((i) => i.sub_email);
    const project = p.projects || {};
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    /* sendCorrespondenceEmail rather than the invite sender: it reports which
       addresses were actually reached, and an addendum that silently failed to
       send is the single worst outcome here. */
    const delivery: Array<{ email: string; sent: boolean }> = [];
    for (const inv of recipients) {
      try {
        const res = await withComm(
          { tenantId: user.tenantId, projectId: p.project_id ?? null, bidPackageId: id, subId: inv.sub_id || null,
            relatedType: 'addendum', relatedId: inv.id || null,
            toName: inv.company_name || inv.sub_name || null, createdBy: user.id },
          () => sendCorrespondenceEmail({
          to: [inv.sub_email],
          subject: `Addendum ${n} — ${p.trade || p.name} — ${project.name || 'Project'}`,
          body:
            `${summary}\n\n` +
            `This addendum forms part of the bid documents. Your bid must reflect it.\n\n` +
            `Open the updated bid jacket: ${appUrl}/portals/bid/${inv.token}`,
          correspondenceType: 'Addendum',
          referenceNumber: `ADD-${String(n).padStart(2, '0')}`,
          projectName: project.name || null,
        }));
        delivery.push({ email: inv.sub_email, sent: res?.sent !== false });
      } catch (e) {
        console.error('[bid addendum] send failed', inv.sub_email, e);
        delivery.push({ email: inv.sub_email, sent: false });
      }
    }

    return NextResponse.json({
      success: true,
      addendumNumber: n,
      version,
      notified: delivery.filter((d) => d.sent).length,
      recipients: delivery.length,
      delivery,
    });
  } catch (e) {
    return apiError('bid_package_addendum', e);
  }
}
