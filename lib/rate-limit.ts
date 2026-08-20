/**
 * lib/rate-limit.ts — Simple in-memory rate limiter for API routes
 * Stores request counts per IP with automatic expiry.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a given key (usually IP + endpoint).
 * @param key - Unique identifier (e.g., "lookup:192.168.1.1")
 * @param limit - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60s)
 * @returns { allowed: boolean, remaining: number, resetIn: number }
 */
export function checkRateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetIn: windowMs };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const resetIn = entry.resetAt - now;

  return { allowed: entry.count <= limit, remaining, resetIn };
}

/**
 * Get client IP from request (handles proxies)
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return '0.0.0.0';
}

/**
 * Pre-configured rate limiter for AI routes (30 requests per minute).
 * Returns a 429 Response if limit exceeded, or null if allowed.
 */
export const aiLimiter = {
  check(req: Request): Response | null {
    const ip = getClientIP(req);
    const { allowed, resetIn } = checkRateLimit(`ai:${ip}`, 30, 60_000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again shortly.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(resetIn / 1000)),
          },
        }
      );
    }
    return null;
  },
};

/**
 * Pre-configured rate limiter for auth routes (10 requests per minute).
 */
export const authLimiter = {
  check(req: Request): Response | null {
    const ip = getClientIP(req);
    const { allowed, resetIn } = checkRateLimit(`auth:${ip}`, 10, 60_000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please wait and try again.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(resetIn / 1000)),
          },
        }
      );
    }
    return null;
  },
};
