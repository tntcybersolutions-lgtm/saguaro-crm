'use client';

/**
 * Error boundary for the entire signed-in app — 223 pages that had none.
 *
 * app/app/layout.tsx wraps its children in <ErrorBoundary>, which catches a
 * render throw but cannot catch one from a server component, from the data
 * fetch a page does before it renders, or from the layout itself. Those fell
 * through to a blank screen. This file is the boundary Next.js itself invokes,
 * so it covers the cases the React component cannot.
 *
 * It sits inside the layout, which means the sidebar, header and project
 * switcher stay mounted — the GC can navigate straight out instead of being
 * stranded.
 */

import RouteError from '@/components/RouteError';

export default function AppError({
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
      homeHref="/app"
      homeLabel="Back to Dashboard"
      scope="app"
      inShell
    />
  );
}
