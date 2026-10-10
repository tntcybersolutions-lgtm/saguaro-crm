'use client';

/**
 * The GC's way to a bid jacket PDF, from any screen: ask the server to build
 * it from the live jacket (as the signed-in user) and get back a link that
 * opens it.
 *
 * Screens used to open bid_packages.jacket_pdf_url as stored. That was an
 * expired signed link or a private-bucket address pdf.js cannot fetch, and the
 * file itself was usually the snapshot Sage took when the package was created.
 */

import { STATUS_HEADER, reasonFromResponse } from '@/lib/ui/status-fetch';

export type BuiltJacketPdf = {
  /** Same-origin link that signs the stored file and redirects to it. */
  openUrl: string;
  storedUrl: string;
  generatedAt: string;
  reused: boolean;
};

export async function buildJacketPdf(packageId: string): Promise<BuiltJacketPdf> {
  const r = await fetch(`/api/bid-packages/${encodeURIComponent(packageId)}/generate-jacket`, {
    method: 'POST',
    // The status box names this step in these words instead of guessing from the URL.
    headers: { [STATUS_HEADER]: "Building the bid jacket PDF|Bid jacket PDF ready|Couldn't build the bid jacket PDF" },
  });
  if (!r.ok) throw new Error(await reasonFromResponse(r));
  const d = (await r.json().catch(() => null)) as Partial<BuiltJacketPdf> | null;
  if (!d?.storedUrl) throw new Error('The server did not return the PDF. Please try again.');
  return {
    openUrl: `/api/files/open?u=${encodeURIComponent(d.storedUrl)}`,
    storedUrl: d.storedUrl,
    generatedAt: String(d.generatedAt || ''),
    reused: !!d.reused,
  };
}
