import { NextRequest, NextResponse } from 'next/server'
import {
  DELETION_WINDOW_DAYS,
  verifyDeletionToken,
  recordDeletionRequest,
  sendDeletionMail,
} from '@/lib/account-deletion'

/* Confirms a deletion request raised by a logged-out visitor.
 *
 * Public by design — the signed token in the query string IS the credential.
 * Following the link proves control of the mailbox, which is what authorises
 * the request. Nothing is written until this route runs.
 */

const back = (status: string) => {
  const base = process.env.NEXT_PUBLIC_APP_URL || ''
  return NextResponse.redirect(`${base}/legal/data-deletion?status=${status}`, { status: 303 })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return back('invalid')

  try {
    const email = verifyDeletionToken(token)
    if (!email) return back('expired')

    await recordDeletionRequest(email, 'confirmed_by_email')

    const when = new Date(Date.now() + DELETION_WINDOW_DAYS * 86400000).toLocaleDateString()
    await sendDeletionMail(email, 'Data deletion scheduled — Saguaro CRM', `
      <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 16px;">Deletion Scheduled</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 16px;">Your request to delete the Saguaro account for <strong>${email}</strong> is confirmed.</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="font-size:13px;color:#374151;margin:0 0 6px;"><strong>Scheduled deletion:</strong> ${when}</p>
        <p style="font-size:13px;color:#374151;margin:0;">All account data, projects, documents and financial records will be permanently deleted.</p>
      </div>`)

    return back('confirmed')
  } catch (e: unknown) {
    console.error('[account/delete/confirm] error:', e instanceof Error ? e.message : e)
    return back('error')
  }
}
