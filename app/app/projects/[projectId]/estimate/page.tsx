/**
 * /app/projects/[id]/estimate — permanent redirect to the estimate workspace.
 *
 * There were two estimate pages for one job. This route held a 367-line
 * read-only summary: takeoff totals, a bid-package count, a link to the budget
 * and a "Go to Takeoff" button. /takeoff/estimate holds the workspace that
 * adds lines, applies crews and assemblies, sets markup and exports the PDF
 * and the Excel.
 *
 * Which one a GC met was decided by which link they happened to click — the
 * guided journey's "Price it" step and both copies of the project nav pointed
 * here, at the summary, while the only door to the real tool was a link on the
 * takeoff page. So the people following the product's own instructions were
 * the ones who never found it, and "Price it" opened a screen on which pricing
 * is the one thing you cannot do.
 *
 * All three now point at the workspace. This stays as a redirect rather than
 * being deleted so that a bookmark, an emailed link or a browser's history
 * still lands somewhere that works. Nothing the summary showed is lost from
 * the product: bid packages and the budget are their own entries in the
 * project navigation, which is where someone looking for them would go.
 */
import { redirect } from 'next/navigation';

export default async function EstimateRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/app/projects/${projectId}/takeoff/estimate`);
}
