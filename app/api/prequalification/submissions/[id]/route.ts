import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

const REVIEW_STATUSES = new Set(['pending', 'submitted', 'under_review', 'approved', 'rejected']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();
    const ALLOWED_SUBMISSION_COLUMNS = [
      'invite_id', 'sub_id', 'template_id', 'answers', 'documents', 'score', 'status',
      'reviewed_by', 'reviewed_at', 'notes', 'updated_at',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_SUBMISSION_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update — send status or notes.' }, { status: 400 });
    }
    const status = typeof updates.status === 'string' ? updates.status : null;
    if (status && !REVIEW_STATUSES.has(status)) {
      return NextResponse.json({ error: `status must be one of ${[...REVIEW_STATUSES].join(', ')}`, field: 'status' }, { status: 400 });
    }
    // Who decided and when are the server's facts, not the browser's.
    if (status) {
      updates.reviewed_by = user.id;
      updates.reviewed_at = new Date().toISOString();
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('prequalification_submissions')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    /* APPROVING A PREQUAL MUST PREQUALIFY THE SUB.
       The decision used to stop at this row. subcontractors.prequalified — the
       flag Subs & Vendors counts, the bid invite list reads and the directory
       shows as "Prequalified" — never moved, so a sub could be approved here
       and still read as unqualified everywhere else. The portal links a
       submission by invite, so the directory record is sub_id when the invite
       carried one, else the company with the submitting email. */
    if (status === 'approved' || status === 'rejected') {
      const row = data as { sub_id: string | null; vendor_email: string | null; score: number | string | null; max_score: number | string | null };
      let subId = row.sub_id;
      if (!subId && row.vendor_email) {
        const email = String(row.vendor_email).trim().toLowerCase();
        const { data: dir, error: dirErr } = await db
          .from('subcontractors')
          .select('id, email, contact_email')
          .eq('tenant_id', user.tenantId);
        if (dirErr) throw dirErr;
        const match = (dir || []).filter((x: { email: string | null; contact_email: string | null }) =>
          [x.email, x.contact_email].some((e) => String(e || '').trim().toLowerCase() === email));
        // Only an unambiguous match is linked; two companies on one address is a GC's call.
        if (match.length === 1) {
          subId = (match[0] as { id: string }).id;
          const { error: linkErr } = await db.from('prequalification_submissions')
            .update({ sub_id: subId }).eq('id', id).eq('tenant_id', user.tenantId);
          if (linkErr) throw linkErr;
        }
      }
      if (subId) {
        const max = Number(row.max_score) || 0;
        const pct = max > 0 ? Math.round((Number(row.score) || 0) / max * 100) : null;
        const today = new Date().toISOString().slice(0, 10);
        const { error: subErr } = await db
          .from('subcontractors')
          .update({
            prequalified: status === 'approved',
            prequalification_status: status,
            prequalification_date: today,
            prequal_at: new Date().toISOString(),
            ...(pct !== null ? { prequal_score: pct } : {}),
          })
          .eq('id', subId)
          .eq('tenant_id', user.tenantId);
        if (subErr) throw subErr;
      }
      return NextResponse.json({ data: { ...data, sub_id: subId }, subUpdated: !!subId });
    }

    return NextResponse.json({ data });
  } catch (e) {
    // Scoring/approving a prequal (status, score, reviewed_by) that failed must
    // not read as a flat 500 with no trace — this gates whether a sub is
    // compliant to work. Honest surface + correlation id (§0/§3).
    return apiError('prequalification/submissions/id', e, 'Could not update the prequalification submission');
  }
}
