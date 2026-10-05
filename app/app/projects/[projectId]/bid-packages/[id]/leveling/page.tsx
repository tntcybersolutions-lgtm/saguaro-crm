'use client';

/**
 * Package-scoped leveling — now an entry point, not a second implementation.
 *
 * This route used to render its own leveling screen: base bid plus a scope gap,
 * a spread, and a list of who had not answered. It worked, but /app/bids/leveling
 * already existed with far more — the scope matrix, per-line coverage across
 * bidders, alternates, bond and tax adjustments, stacked leveled-total bars and
 * a branded bid-tab PDF — all computed by lib/bidleveling, the same
 * deterministic engine the iOS app uses.
 *
 * Two screens levelling the same bids will eventually disagree, and a GC would
 * have had no way to know which number to trust. That is the same shape of
 * problem as the two invite tables that meant no bid could ever be submitted.
 *
 * So there is one board. It takes ?package= and loads the real package: line
 * items become the scope checklist, submissions become the bidders, Sage's
 * reading pre-fills the scope grid, and the levelled figures save back to
 * scope_gap_amount and leveling_complete. This route survives as the link from
 * the jacket and the package page, and forwards to it.
 */

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function BidPackageLevelingRedirect() {
  const { id } = useParams<{ projectId: string; id: string }>();
  const router = useRouter();

  useEffect(() => {
    /* replace, not push: this route is a signpost and should not sit in the
       history for the back button to land on. */
    router.replace(`/app/bids/leveling?package=${id}`);
  }, [id, router]);

  return <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Opening bid leveling…</div>;
}
