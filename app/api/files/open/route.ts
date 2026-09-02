import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { signUrl } from '@/lib/storage-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open a stored document, whatever state its URL is in.
 *
 * saveDocument returns a SIGNED url and a good number of routes store what it
 * returns, so rows across the app hold links with an hour on them. An hour
 * later the GC clicks PDF and gets
 *
 *   {"statusCode":"400","error":"InvalidJWT",
 *    "message":"\"exp\" claim timestamp check failed"}
 *
 * There are forty routes returning a stored document URL without signing it,
 * and patching forty routes is a week of work that leaves the forty-first
 * broken. This is the one door instead: hand it whatever is stored — public
 * form, signed, or expired — and it mints a fresh link and redirects.
 *
 *   /api/files/open?u=<stored url>
 *
 * Auth is required, so a stale link in somebody's inbox is not a way in, and
 * only storage URLs on this project's own domain are followed — an open
 * redirect that took any URL would be a phishing gadget.
 */

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stored = new URL(req.url).searchParams.get('u') || '';
  if (!stored) return NextResponse.json({ error: 'Nothing to open' }, { status: 400 });

  /* Only our own storage. Redirecting to an arbitrary URL because it arrived in
     a query string is how an open redirect becomes a phishing link. */
  const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host; } catch { return ''; }
  })();
  let host = '';
  try { host = new URL(stored).host; } catch { /* a bare path is fine — no host to check */ }
  if (host && host !== supabaseHost) {
    return NextResponse.json({ error: 'That link is not one of ours' }, { status: 400 });
  }
  if (!/\/storage\/v1\/object\/(public|sign)\//.test(stored) && host) {
    return NextResponse.json({ error: 'That link is not a stored document' }, { status: 400 });
  }

  const fresh = await signUrl(stored, 3600);
  if (!fresh) {
    return NextResponse.json(
      { error: 'That document could not be opened. It may have been moved or deleted.' },
      { status: 404 },
    );
  }

  /* 302, not a JSON body: the caller is a link or a window.open, and a redirect
     means the browser lands on the PDF itself rather than on a payload it then
     has to do something with. */
  return NextResponse.redirect(fresh, 302);
}
