import { RouteSkeleton } from '@/components/ui/PageSkeleton';

/** Painted the instant this section is opened, while its code and data load — never a blank screen. */
export default function Loading() {
  return <RouteSkeleton title="Classic" />;
}
