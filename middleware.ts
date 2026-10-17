/**
 * middleware.ts — Next.js Edge Middleware
 * Handles token validation and proactive refresh for all /app/* routes.
 * API routes are left to route handlers (getUser() has its own refresh fallback).
 */
import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const PUBLIC_PREFIXES = [
  '/api/', '/_next/', '/auth/', '/favicon', '/robots', '/sitemap',
  '/images/', '/fonts/', '/bid-portal', '/sub-portal', '/owner-portal', '/w9/',
];
const PUBLIC_PATHS = new Set([
  '/', '/pricing', '/features', '/demo', '/sandbox', '/blog',
  '/about', '/contact', '/privacy', '/terms', '/security',
  '/login', '/signup', '/forgot-password', '/reset-password', '/marketing.html',
]);
const EXTRA_PUBLIC = ['/onboarding/'];

// The iPhone app's WebView: the Capacitor shell appends "SaguaroField/" to its
// user agent (capacitor.config.ts, ios.appendUserAgent).
const IN_APP_UA = /\bSaguaroField\//;
// Marketing pages that show plan prices or link straight to them.
const PRICED_PAGES = /^\/(?:$|pricing|compare|features|get-the-app|how-it-works|how-to-get-started|roi-calculator|sandbox|switch-from-procore|design)(?:\/|$)/;

function isPublic(p: string): boolean {
  return PUBLIC_PATHS.has(p) ||
    PUBLIC_PREFIXES.some(x => p.startsWith(x)) ||
    EXTRA_PUBLIC.some(x => p.startsWith(x));
}

function isConfigured(): boolean {
  return !!(
    SUPABASE_URL &&
    SUPABASE_URL !== 'https://demo.supabase.co' &&
    SUPABASE_ANON &&
    !SUPABASE_ANON.includes('placeholder') &&
    !SUPABASE_ANON.startsWith('demo_') &&
    SUPABASE_ANON.length >= 20
  );
}

/** Decode JWT exp without verifying signature (Edge-safe, no crypto needed). */
function jwtExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const payload = JSON.parse(json);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Returns true if the token exists and won't expire in the next 30 seconds. */
function isValid(token: string | undefined): boolean {
  if (!token) return false;
  const exp = jwtExpiry(token);
  if (!exp) return false;
  return Date.now() / 1000 < exp - 30;
}

/** Call Supabase token refresh endpoint directly (no SDK — Edge-safe). */
async function refreshTokens(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at?: number;
} | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.access_token || !d.refresh_token) return null;
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supabase not configured — let everything through (initial setup)
  if (!isConfigured()) {
    return NextResponse.next();
  }

  // Demo mode — only allowed in non-production environments
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return NextResponse.next();
  }

  // Inside the iPhone app the plans and their prices are never shown: the app
  // is a free companion to the paid web platform, and App Store rule 3.1.1 /
  // 3.1.3(b) bars pointing people to buy outside the app. The sign-in screen's
  // logo links to "/", so a signed-out reviewer reached the plans in two taps.
  // Those pages send the app to /app (sign-in when signed out); browsers are
  // untouched. The in-app plan screens are gated the same way (lib/use-in-app.ts).
  if (PRICED_PAGES.test(pathname) && IN_APP_UA.test(request.headers.get('user-agent') || '')) {
    return NextResponse.redirect(new URL('/app', request.url));
  }

  // A signed-in user opening the ROOT should land in the app, not on the
  // marketing homepage. The iOS app loads server.url (/), so without this a
  // logged-in rep opens the app onto "Start free trial / Pricing" and is lost —
  // the #1 "confused on open" complaint. Logged-out visitors still get
  // marketing; redirecting to /app sends a logged-out device to /login via the
  // /app guard below. The native server.url now starts at /app as well, which
  // covers a logged-out device; this still covers older installed builds.
  if (pathname === '/') {
    const at = request.cookies.get('sb-access-token')?.value;
    const rt = request.cookies.get('sb-refresh-token')?.value;
    if (isValid(at) || !!rt) {
      return NextResponse.redirect(new URL('/app', request.url));
    }
  }

  const accessToken  = request.cookies.get('sb-access-token')?.value;
  const refreshToken = request.cookies.get('sb-refresh-token')?.value;

  const cookieOpts = {
    path: '/',
    sameSite: 'lax' as const,
    secure: true,
    httpOnly: true,
  };

  // API calls: refresh HERE, not in the route — and BEFORE the public-path return
  // below, because PUBLIC_PREFIXES includes '/api/' and this block used to sit
  // under it, so it never ran. It only acts when a refresh cookie exists and the
  // access token is expired; public API routes are untouched. Route handlers call getUser(req)
  // without a response, so when the hour-old access token expired the first
  // API call rotated the refresh token server-side and never wrote the new
  // pair back — the browser kept replaying the revoked token, every call went
  // 401 and the next page load bounced to /login (the mid-session sign-outs on
  // the preview and, since the iOS WebView loads this same site, on phones).
  // Refresh once, store the new pair, and hand the route the fresh token.
  // /api/auth/* is excluded: those routes rotate the token themselves, and a
  // second rotation of the same old token right after ours is exactly the
  // "already used" rejection that clears the cookies and signs the user out.
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    if (isValid(accessToken) || !refreshToken) return NextResponse.next();
    const session = await refreshTokens(refreshToken);
    if (!session) return NextResponse.next();
    // The forwarded request carries the fresh pair too, so a route that reads
    // the cookies directly (not just the Authorization header) sees them.
    request.cookies.set('sb-access-token', session.access_token);
    request.cookies.set('sb-refresh-token', session.refresh_token);
    if (!request.headers.has('authorization')) request.headers.set('authorization', `Bearer ${session.access_token}`);
    const response = NextResponse.next({ request: { headers: request.headers } });
    response.cookies.set('sb-access-token', session.access_token, {
      ...cookieOpts,
      expires: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    });
    response.cookies.set('sb-refresh-token', session.refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 365 });
    return response;
  }

  // Always allow public paths
  if (isPublic(pathname)) return NextResponse.next();


  // Only enforce auth on /app/*
  if (!pathname.startsWith('/app')) return NextResponse.next();

  // Token is present and not expired — pass through immediately
  if (isValid(accessToken)) {
    return NextResponse.next();
  }

  // Token missing or expired — attempt silent refresh
  if (refreshToken) {
    const session = await refreshTokens(refreshToken);
    if (session) {
      // Refresh succeeded — rewrite cookies and continue
      const response = NextResponse.next();
      response.cookies.set('sb-access-token', session.access_token, {
        ...cookieOpts,
        expires: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
      });
      response.cookies.set('sb-refresh-token', session.refresh_token, {
        ...cookieOpts,
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }
  }

  // No valid session — redirect to login
  // The whole address, query included, so a link to one record (an RFI's
  // ?tab=responses, a list's ?open=) opens that record after sign-in.
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
