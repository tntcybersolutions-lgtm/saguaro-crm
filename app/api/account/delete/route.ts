import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase-server'
import {
  DELETION_WINDOW_DAYS,
  DELETION_TOKEN_TTL_MS,
  signDeletionToken,
  recordDeletionRequest,
  sendDeletionMail,
} from '@/lib/account-deletion'

/* Account deletion request.
 *
 * Reachable logged-out on purpose — /legal/data-deletion is a public compliance
 * page and the app stores require it to stay that way, so this cannot be closed
 * with a getUser() guard alone.
 *
 * It previously took an email straight from the request body and scheduled that
 * account for deletion, so anyone could queue deletion of anyone else's account.
 * Two paths now:
 *
 *   authenticated    identity comes from the session, the body email is ignored,
 *                    the request is recorded immediately.
 *   unauthenticated  nothing is written. A signed, expiring link is mailed to the
 *                    address; only following it — which proves control of the
 *                    mailbox — records the request, via ./confirm.
 *
 * Both paths return the same shape so account existence is never revealed.
 */

export async function POST(req: NextRequest) {
  let body: { email?: string; reason?: string; confirmed?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 })
  }

  const reason = body.reason || ''
  if (!body.confirmed) {
    return NextResponse.json({ error: 'confirmed is required' }, { status: 400 })
  }

  try {
    const user = await getUser(req)

    // --- authenticated: identity from the session, never from the body ---
    if (user?.email) {
      await recordDeletionRequest(user.email, reason)
      const when = new Date(Date.now() + DELETION_WINDOW_DAYS * 86400000).toLocaleDateString()
      await sendDeletionMail(user.email, 'Data deletion request received — Saguaro CRM', `
        <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 16px;">Data Deletion Request Received</h2>
        <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 16px;">We received your request to delete the Saguaro account for <strong>${user.email}</strong>.</p>
        <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <p style="font-size:13px;color:#374151;margin:0 0 6px;"><strong>Scheduled deletion:</strong> ${when}</p>
          <p style="font-size:13px;color:#374151;margin:0;">All account data, projects, documents and financial records will be permanently deleted.</p>
        </div>`)
      return NextResponse.json({ success: true, verified: true })
    }

    // --- unauthenticated: verify the mailbox before recording anything ---
    const email = (body.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

    const base = process.env.NEXT_PUBLIC_APP_URL || ''
    const token = signDeletionToken(email, Date.now() + DELETION_TOKEN_TTL_MS)
    const link = `${base}/api/account/delete/confirm?token=${encodeURIComponent(token)}`

    await sendDeletionMail(email, 'Confirm your data deletion request — Saguaro CRM', `
      <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 16px;">Confirm Your Deletion Request</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 20px;">Someone requested deletion of the Saguaro account for <strong>${email}</strong>. Nothing has been scheduled yet. Confirm below to start the ${DELETION_WINDOW_DAYS}-day deletion window.</p>
      <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#D4A017;color:#1a1a1a;font-weight:800;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;">Confirm deletion request</a></p>
      <p style="font-size:13px;color:#94a3b8;margin:0 0 16px;">This link expires in one hour.</p>`)

    // Identical response whether or not the account exists.
    return NextResponse.json({ success: true, verified: false })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('[account/delete] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
