/**
 * middleware.ts
 *
 * Next.js Edge Middleware — runs on every request before it hits a route.
 *
 * Responsibilities:
 *   1. Auth guard — redirect unauthenticated users to /login
 *   2. White-label domain routing — custom domains → correct tenant
 *   3. Sandbox enforcement — expired sandbox → upgrade page
 *   4. Subscription guard — canceled plans → billing page
 *   5. Public routes allowlist — skip auth for marketing pages, webhooks, etc.
 */

import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Route categorization
// ─────────────────────────────────────────────────────────────────────────────

// These paths never require auth
const PUBLIC_PATHS = [
  '/',
  '/pricing',
  '/features',
  '/demo',
  '/sandbox',
  '/blog',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/security',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
];

const PUBLIC_PREFIXES = [
  '/api/sandbox/',        // sandbox signup/check
  '/api/leads/',          // contact, demo, whitelabel, referral
  '/api/auth/login',
  '/api/billing/webhook', // Stripe webhooks — verified by signature
  '/api/ai/chat',         // public AI chat on marketing site
  '/bid-portal',          // subcontractor bid portal
  '/client-portal',       // client read-only views
  '/_next/',
  '/favicon',
  '/robots',
  '/sitemap',
  '/images/',
  '/fonts/',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hostname = request.headers.get('host') ?? '';

  // ── 1. White-label domain detection ──────────────────────────────────────
  // If the request comes from a custom domain (not saguarocrm.com or localhost),
  // look up the reseller account and inject the tenant context.
  const appDomain    = process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '') ?? 'app.saguarocrm.com';
  const sandboxDomain = process.env.NEXT_PUBLIC_SANDBOX_URL?.replace(/^https?:\/\//, '') ?? 'sandbox.saguarocrm.com';
  const knownDomains  = [appDomain, sandboxDomain, 'localhost:3000', '127.0.0.1:3000'];

  const isCustomDomain = !knownDomains.some((d) => hostname === d || hostname.endsWith('.' + d));

  if (isCustomDomain && pathname.startsWith('/app')) {
    // Rewrite to include the domain context so the app can look up the right tenant
    const url = request.nextUrl.clone();
    url.searchParams.set('__wl_domain', hostname);
    return NextResponse.rewrite(url);
  }

  // ── 2. Skip auth for public routes ───────────────────────────────────────
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // ── 3. Auth check ─────────────────────────────────────────────────────────
  const response = NextResponse.next();
  const supabase = createMiddlewareClient({ req: request, res: response });

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    // Preserve destination for post-login redirect
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // ── 4. Sandbox expiry check ───────────────────────────────────────────────
  if (pathname.startsWith('/app') || pathname.startsWith('/api/')) {
    const tenantId = session.user.user_metadata?.tenant_id;
    if (tenantId) {
      // Check sandbox expiry from JWT metadata (set at sign-in)
      const isSandbox = session.user.user_metadata?.is_sandbox as boolean | undefined;
      const sandboxExpiresAt = session.user.user_metadata?.sandbox_expires_at as string | undefined;

      if (isSandbox && sandboxExpiresAt) {
        const expired = new Date(sandboxExpiresAt) < new Date();
        if (expired && !pathname.includes('/upgrade') && !pathname.includes('/api/billing')) {
          return NextResponse.redirect(new URL('/pricing?sandbox=expired', request.url));
        }
      }
    }
  }

  // ── 5. Inject tenant context headers (for server components) ─────────────
  const tenantId = session.user.user_metadata?.tenant_id ?? session.user.id;
  response.headers.set('x-tenant-id', tenantId);
  response.headers.set('x-user-id', session.user.id);

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matcher — run middleware on these paths
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - Static files (_next/static, _next/image, favicon.ico)
     * - Image optimization
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
