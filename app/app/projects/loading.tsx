import { RouteSkeleton } from '@/components/ui/PageSkeleton';

/** Painted the instant this section is opened, while its code and data load — never a blank screen. No title:
 *  this boundary also covers opening a job, so it must not say "Jobs" over it. */
export default function Loading() {
  return <RouteSkeleton />;
}
