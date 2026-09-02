'use client';

/**
 * Portal shell.
 *
 * There was no layout under /portals at all, which meant the in-app PDF reader
 * — mounted once in app/app/layout.tsx — did not exist for any customer-facing
 * portal. Every document a client, sub or owner opened from a portal was
 * therefore handed to the browser's own PDF plugin in a new tab: they left the
 * branded portal, landed on a raw file with a Chrome toolbar, and had no way
 * back except the back button.
 *
 * This mounts the reader for the whole /portals subtree. It renders children
 * untouched, so each portal keeps its own layout and branding; the only thing
 * added is the reader, which is inert until openPdf() is called.
 */

import PdfViewer from '@/components/PdfViewer';

export default function PortalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PdfViewer />
    </>
  );
}
