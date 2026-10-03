'use client';

/**
 * The bid jacket route (GC side).
 *
 * What this replaces: one generated PDF called "Bid Jacket". The Documents list
 * showed twenty-eight rows with that same name, and opening any of them gave a
 * scope narrative and nothing else — no drawings, no specs, no bid form. A sub
 * who received it still had to go looking for everything that actually lets
 * them price the work.
 *
 * This route owns fetching, loading and failure. What a jacket looks like lives
 * in components/BidJacketView; what a GC can DO with it lives in
 * components/BidJacketAssembly, mounted into the view's slot so the same view
 * can be rendered for a logged-out bidder without carrying GC-only actions.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WarningCircle } from '@phosphor-icons/react';
import { PremiumSurface, SectionCard, PremiumEmpty, ghostButtonStyle } from '@/components/ui/premium';
import BidJacketView, { type Jacket } from '@/components/BidJacketView';
import BidJacketAssembly, { type Drift, type Issued } from '@/components/BidJacketAssembly';

const DIM = '#8BAAC8';
const AMBER = 'var(--warning)';

type Payload = Jacket & { issued: Issued; drift: Drift | null };

export default function BidJacketPage() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const router = useRouter();

  const [jacket, setJacket] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bid-packages/${id}/jacket`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not open this jacket.');
      setJacket(d as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this jacket.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <PremiumSurface>
        <div style={{ padding: 40, color: DIM }}>Opening jacket…</div>
      </PremiumSurface>
    );
  }

  if (error || !jacket) {
    return (
      <PremiumSurface>
        <SectionCard>
          <PremiumEmpty
            icon={<WarningCircle size={30} weight="duotone" color={AMBER} />}
            title="This Jacket Could Not Be Opened"
            description={error || 'The bid package was not found.'}
            action={
              <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={ghostButtonStyle}>
                Back to Bid Packages
              </button>
            }
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface>
      <BidJacketView
        jacket={jacket}
        projectId={projectId}
        packageId={id}
        slot={
          <BidJacketAssembly
            packageId={id}
            projectId={projectId}
            responded={jacket.bidders.responded}
            issued={jacket.issued}
            drift={jacket.drift}
            missing={jacket.completeness.missing}
            invited={jacket.bidders.invited}
            /* Re-fetch rather than patch local state: issuing and addenda both
               change the manifest, and the drift read has to come from the
               server that holds it. */
            onChanged={load}
          />
        }
      />
    </PremiumSurface>
  );
}
