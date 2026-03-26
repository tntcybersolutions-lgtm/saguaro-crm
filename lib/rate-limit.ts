/**
 * lib/rate-limit.ts
 * In-memory sliding-window rate limiter for API routes.
 * No external dependencies — works on Vercel serverless and Edge.
 *
 * Usage in a route handler:
 *   import { rateLimit } from '@/lib/rate-limit';
 *
 *   const limiter = rateLimit({ windowMs: 60_000, max: 100 });
 *
 *   export async function POST(req: NextRequest) {
 *     const limited = limiter.check(req);
 *     if (limited) return limited;
 *     // ... handle request
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Max requests per window (default: 100) */
  max?: number;
  /** Custom key extractor — defaults to IP address */
  keyFn?: (req: NextRequest) => string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Create a rate limiter instance.
 * Each instance maintains its own bucket store.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const keyFn = options.keyFn ?? defaultKeyFn;
  const buckets = new Map<string, TokenBucket>();

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  const CLEANUP_INTERVAL = 5 * 60_000;
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 2) {
        buckets.delete(key);
      }
    }
  }

  return {
    /**
     * Check if the request is rate-limited.
     * Returns null if allowed, or a 429 Response if blocked.
     */
    check(req: NextRequest): NextResponse | null {
      cleanup();

      const key = keyFn(req);
      const now = Date.now();
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = { tokens: max - 1, lastRefill: now };
        buckets.set(key, bucket);
        return null;
      }

      // Refill tokens based on elapsed time
      const elapsed = now - bucket.lastRefill;
      const refill = Math.floor((elapsed / windowMs) * max);
      if (refill > 0) {
        bucket.tokens = Math.min(max, bucket.tokens + refill);
        bucket.lastRefill = now;
      }

      if (bucket.tokens <= 0) {
        const retryAfter = Math.ceil(windowMs / 1000);
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(max),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(bucket.lastRefill + windowMs).toISOString(),
            },
          },
        );
      }

      bucket.tokens--;
      return null;
    },
  };
}

function defaultKeyFn(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.ip ||
    'unknown'
  );
}

// ─── Pre-configured limiters for common use cases ─────────────────────────────

/** General API: 100 requests per minute */
export const apiLimiter = rateLimit({ windowMs: 60_000, max: 100 });

/** Auth endpoints: 10 requests per minute (brute-force protection) */
export const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

/** AI chat: 30 requests per minute */
export const aiLimiter = rateLimit({ windowMs: 60_000, max: 30 });
