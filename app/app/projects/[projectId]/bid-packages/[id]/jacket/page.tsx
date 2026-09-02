'use client';

/**
 * The bid jacket route.
 *
 * What this replaces: one generated PDF called "Bid Jacket". The Documents list
 * showed twenty-eight rows with that same name, and opening any of them gave a
 * scope narrative and nothing else — no drawings, no specs, no bid form. A sub
 * who received it still had to go looking for everything that actually lets
 * them price the work.
 *
 * This route owns fetching, loading and failure only. What a jacket looks like
 * lives in components/BidJacketView, which takes its data as a prop.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WarningCircle } from '@phosphor-icons/react';
import { PremiumSurface, SectionCard, PremiumEmpty, ghostButtonStyle } from '@/components/ui/premium';
import BidJacketView, { type Jacket } from '@/components/BidJacketView';

const DIM = '#8BAAC8';
const AMBER = '#F59E0B';

export default function BidJacketPage() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const router = useRouter();

  const [jacket, setJacket] = useState<Jacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bid-packages/${id}/jacket`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not open this jacket.');
      setJacket(d as Jacket);
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
            title="This jacket could not be opened"
            description={error || 'The bid package was not found.'}
            action={
              <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={ghostButtonStyle}>
                Back to bid packages
              </button>
            }
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface>
      <BidJacketView jacket={jacket} projectId={projectId} packageId={id} />
    </PremiumSurface>
  );
}
