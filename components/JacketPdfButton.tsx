'use client';

/**
 * Download PDF for a bid jacket (GC screens only: it needs a signed-in user).
 *
 * Every press builds the PDF from the jacket as it is now, so what prints is
 * what the jacket screen shows. While it builds, the button says so and cannot
 * be pressed twice. When it fails, the reason is shown (inline, or handed to
 * the screen's own toast through onError).
 */

import React, { useState } from 'react';
import { FileText } from '@phosphor-icons/react';
import { ghostButtonStyle } from '@/components/ui/premium';
import { openPdf } from '@/components/PdfViewer';
import { buildJacketPdf, type BuiltJacketPdf } from '@/lib/jacket-pdf-client';

export default function JacketPdfButton({
  packageId, title, onBuilt, onError, style,
}: {
  packageId: string;
  /** Title for the PDF reader. */
  title: string;
  onBuilt?: (pdf: BuiltJacketPdf) => void;
  /** Give the failure to the screen's own toast instead of showing it under the button. */
  onError?: (message: string) => void;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const pdf = await buildJacketPdf(packageId);
      onBuilt?.(pdf);
      openPdf({ url: pdf.openUrl, title });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't build the bid jacket PDF. Please try again.";
      if (onError) onError(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    // Column, right-aligned: an error under the button must not stretch the button to its width.
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: '100%' }}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className="pmBtn jacket-pdf-btn"
        style={{ ...ghostButtonStyle, minHeight: 44, opacity: busy ? 0.7 : 1, cursor: busy ? 'progress' : 'pointer', ...style }}
      >
        <FileText size={16} weight="regular" /> {busy ? 'Building PDF…' : 'Download PDF'}
      </button>
      {error && (
        <span role="alert" style={{ color: 'var(--danger)', fontSize: 13, lineHeight: 1.4, textAlign: 'right' }}>
          {error}
        </span>
      )}
    </span>
  );
}
