/**
 * middleware.ts
 *
 * Next.js Edge Middleware.
 * In demo mode (no real Supabase) — allows all routes through.
 * In production — enforces auth on /app/* routes.
 */
import { NextRequest, NextResponse } from 'next/server';

// Public paths — never require authentication
const PUBLIC_PREFIXES = [
  '/api/',
  '/_next/',
  '/favicon',
  '/robots',
  '/sitemap',
  '/images/',
  '/fonts/',
  '/bid-portal',
  '/sub-portal',
  '/owner-portal',
  '/w9/',
];

const PUBLIC_PATHS = new Set([
  '/', '/pricing', '/features', '/demo', '/sandbox', '/blog',
  '/about', '/contact', '/privacy', '/terms', '/security',
  '/login', '/signup', '/forgot-password', '/reset-password',
  '/marketing.html',
]);

// Prefixes that are also public
const EXTRA_PUBLIC_PREFIXES = ['/onboarding/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return EXTRA_PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // In demo mode or if Supabase is not configured — let everything through
  const isDemoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://demo.supabase.co';

  if (isDemoMode) {
    return NextResponse.next();
  }

  // Public routes — no auth needed
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Protected routes (/app/*) — check auth token
  if (pathname.startsWith('/app')) {
    const token = request.cookies.get('sb-access-token')?.value ||
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      const loginUrl = new URL('/login', request.url);
      if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
