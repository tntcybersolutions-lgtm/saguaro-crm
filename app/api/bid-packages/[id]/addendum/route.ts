import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { assembleJacket, snapshotJacket } from '@/lib/bid-jacket';
import { sendCorrespondenceEmail } from '@/lib/email';
import { withComm } from '@/lib/comm-log';
import { inviteState } from '@/lib/bid-invite-state';

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

    /* The file is named by its project_files id, never by a URL from the
       request. The upload goes through /api/files/upload first (service role,
       tenant-prefixed path); here the stored file_url is read back from that
       row, scoped to this tenant AND this package's project — so a caller
       cannot point every bidder at an arbitrary link or another job's file,
       and the jacket does not keep the upload's one-hour signed URL. */
    if (body.fileUrl && !body.projectFileId) {
      return NextResponse.json(
        { error: 'Attach the addendum file by uploading it — a link cannot be attached directly.' },
        { status: 400 },
      );
    }
    let file: Record<string, any> | null = null;
    if (body.projectFileId) {
      const { data: f, error: fErr } = await db
        .from('project_files')
        .select('id, file_name, file_url, file_type, mime_type')
        .eq('id', String(body.projectFileId))
        .eq('tenant_id', user.tenantId)
        .eq('project_id', p.project_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (fErr) throw fErr;
      if (!f || !(f as Record<string, any>).file_url) {
        return NextResponse.json({ error: 'That file was not found on this project. Upload it again.' }, { status: 404 });
      }
      file = f as Record<string, any>;
    }

    const n = Number(p.addendum_count ?? 0) + 1;
    const now = new Date();
    const nowIso = now.toISOString();

    /* The file goes into the jacket's Addenda divider, so a bidder opening the
       link later sees it in place rather than digging through an old email.
       must(): an addendum announced to every bidder with its drawing missing
       is the worst outcome here, so a refused write stops everything. */
    let docId: string | null = null;
    if (file) {
      const { data: doc } = await must(
        db.from('bid_package_documents').insert({
          tenant_id: user.tenantId,
          bid_package_id: id,
          category: 'addendum',
          label: `Addendum ${String(n).padStart(2, '0')} — ${summary.slice(0, 80)}`,
          file_url: file.file_url,
          file_name: file.file_name || `Addendum-${n}.pdf`,
          file_type: file.file_type || file.mime_type || null,
          sort_order: n,
        } as never).select('id').single(),
        'bid_package_documents addendum',
      );
      docId = (doc as Record<string, any> | null)?.id ?? null;
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

    try {
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
    } catch (e) {
      /* The addendum was not recorded, so its file must not sit in the jacket
         under a number the next attempt will reuse. */
      if (docId) {
        await tryWrite(
          db.from('bid_package_documents').update({ deleted_at: nowIso } as never).eq('id', docId).eq('tenant_id', user.tenantId),
          'bid_package_documents addendum rollback',
        );
      }
      throw e;
    }

    const { data: invites, error: invErr } = await db
      .from('bid_package_invites')
      .select('id, sub_id, sub_email, company_name, sub_name, token, status, response_status')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId);
    if (invErr) throw invErr;

    /* Everyone holding a link — declined included, since a change of scope is
       often what changes their mind. Not a revoked link: the GC cut it off. */
    const recipients = ((invites || []) as Record<string, string>[])
      .filter((i) => i.sub_email && i.token && !['revoked', 'suggested'].includes(inviteState(i)));
    const project = p.projects || {};
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    /* sendCorrespondenceEmail rather than the invite sender: it reports which
       addresses were actually reached, and an addendum that silently failed to
       send is the single worst outcome here. */
    const delivery: Array<{ email: string; sent: boolean; error?: string }> = [];
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
        delivery.push(res?.sent === true ? { email: inv.sub_email, sent: true } : { email: inv.sub_email, sent: false, error: res?.error || 'Not delivered.' });
      } catch (e) {
        console.error('[bid addendum] send failed', inv.sub_email, e);
        delivery.push({ email: inv.sub_email, sent: false, error: 'The addendum could not be sent.' });
      }
    }

    return NextResponse.json({
      success: true,
      addendumNumber: n,
      version,
      notified: delivery.filter((d) => d.sent).length,
      recipients: delivery.length,
      delivery,
      attached: file ? { name: file.file_name || null, documentId: docId } : null,
    });
  } catch (e) {
    return apiError('bid_package_addendum', e, 'The addendum was not issued. Nothing was sent to bidders — try again.');
  }
}
