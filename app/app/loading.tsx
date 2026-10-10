import { RouteSkeleton } from '@/components/ui/PageSkeleton';

/**
 * The app's fallback first paint (Home, and any route without its own
 * loading.tsx): the header area and rows on hairlines, the flat page's own
 * shape — never a blank black screen while a page's code and data load.
 * Each section under /app has its own loading.tsx that also names the page.
 */
export default function AppLoading() {
  return <RouteSkeleton />;
}
