'use client';

/**
 * Root error boundary — the marketing site, the portals, the auth screens, and
 * anything else not covered by a nearer error.tsx.
 *
 * It also catches a throw from app/app/layout.tsx, which the boundary inside
 * that layout cannot catch itself. Without this file that case is a blank page
 * with no route left to render.
 */

import RouteError from '@/components/RouteError';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      homeHref="/"
      homeLabel="Back to Home"
      scope="root"
    />
  );
}
