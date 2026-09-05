import { createServerClient } from '@/lib/supabase-server'
import { signToken, verifyToken } from '@/lib/signed-token'

/* Helpers for the account deletion flow.
 *
 * These live here rather than in the route file because Next's App Router only
 * permits handler and config exports from route.ts — anything else fails the
 * build with a route type mismatch.
 */

export const DELETION_WINDOW_DAYS = 30
export const DELETION_TOKEN_TTL_MS = 60 * 60 * 1000   // one hour

export const DELETION_PURPOSE = 'account-deletion'

/** Signed proof that the holder controls `email`, valid until `expMs`. */
export function signDeletionToken(email: string, expMs: number): string {
  return signToken(DELETION_PURPOSE, email, Math.max(0, expMs - Date.now()))
}

/** Returns the email the token attests to, or null if forged or expired. */
export function verifyDeletionToken(token: string): string | null {
  return verifyToken(DELETION_PURPOSE, token)
}

/** Writes the pending row. The caller must already have established ownership. */
export async function recordDeletionRequest(email: string, reason: string): Promise<boolean> {
  const db = createServerClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, tenant_id')
    .eq('email', email.toLowerCase())
    .single()
  if (!profile) return false

  const { error } = await db.from('deletion_requests').upsert({
    email: email.toLowerCase(),
    user_id: profile.id,
    tenant_id: profile.tenant_id,
    reason: reason || 'not_provided',
    requested_at: new Date().toISOString(),
    scheduled_deletion_at: new Date(Date.now() + DELETION_WINDOW_DAYS * 86400000).toISOString(),
    status: 'pending',
  }, { onConflict: 'email' })
  if (error) throw error
  return true
}

export async function sendDeletionMail(to: string, subject: string, inner: string): Promise<void> {
  const html = `
  <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;">
    <h1 style="color:#D4A017;font-size:24px;font-weight:900;margin:0 0 24px;">Saguaro</h1>
    ${inner}
    <p style="font-size:13px;color:#94a3b8;">If you did not make this request, ignore this email or contact
      <a href="mailto:privacy@saguarocrm.com" style="color:#D4A017;">privacy@saguarocrm.com</a>.</p>
  </div>`
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: 'Saguaro CRM <noreply@saguarocrm.com>', to, subject, html })
  } catch (e: unknown) {
    // A mail failure must not surface as a 500 — that would leak whether the
    // account exists — but it must not vanish silently either.
    console.error('[account/delete] mail failed:', e instanceof Error ? e.message : e)
  }
}
