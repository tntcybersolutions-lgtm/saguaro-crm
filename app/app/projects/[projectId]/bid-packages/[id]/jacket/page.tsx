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
 * This route owns fetching, loading and failure, and the kit page frame. What
 * a jacket looks like lives in components/BidJacketView (shared with the
 * logged-out bidder view, so it keeps its own cover); what a GC can DO with it
 * lives in components/BidJacketAssembly, mounted into the view's slot so the
 * same view can be rendered for a bidder without carrying GC-only actions.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WarningCircle, ArrowLeft, ArrowClockwise } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { PageShell, Card, Button, EmptyState } from '@/components/ui/kit';
import BidJacketView, { type Jacket } from '@/components/BidJacketView';
import BidJacketAssembly, { type Drift, type Issued } from '@/components/BidJacketAssembly';
import JacketPdfButton from '@/components/JacketPdfButton';

type Payload = Jacket & { issued: Issued; drift: Drift | null };

export default function BidJacketPage() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const { ctx } = useProjectContext(projectId);

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

  const base = `/app/projects/${projectId}`;
  const packageLabel = jacket?.package.name || jacket?.package.trade || 'Bid Package';
  const crumbs = [
    { label: 'Projects', href: '/app/projects' },
    { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
    { label: 'Bid Packages', href: `${base}/bid-packages` },
    { label: packageLabel, href: `${base}/bid-packages/${id}` },
    { label: 'Bid Jacket' },
  ];

  /* Only the FIRST load blanks the page. A refresh after Issue or an addendum
     used to swap the whole jacket for "Opening jacket…", which unmounted the
     assembly controls and threw away the very result the GC needed to read —
     who was emailed and who was not. */
  if (loading && !jacket) {
    return (
      <PageShell crumbs={crumbs} title="Bid Jacket" subtitle="Opening jacket…">
        <Card>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }} aria-busy="true">Opening jacket…</div>
        </Card>
      </PageShell>
    );
  }

  if (error || !jacket) {
    return (
      <PageShell crumbs={crumbs} title="Bid Jacket">
        <Card flush>
          <EmptyState
            icon={<WarningCircle size={22} />}
            title="This jacket could not be opened"
            text={error || 'The bid package was not found.'}
            action={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {error && <Button icon={<ArrowClockwise size={15} />} onClick={load}>Try again</Button>}
                <Button variant="ghost" icon={<ArrowLeft size={15} />} href={`${base}/bid-packages`}>Back to Bid Packages</Button>
              </div>
            }
          />
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      crumbs={crumbs}
      title="Bid Jacket"
      subtitle={jacket.package.trade || jacket.package.name}
      actions={
        /* The view's "Printed Jacket" opens the stored PDF, which is right for
           a bidder (no login, it is the copy they were sent). The GC gets
           Download PDF here instead, built from the jacket on this screen,
           so the stored copy's button is not offered twice. */
        <JacketPdfButton packageId={id} title={`${jacket.package.trade || jacket.package.name} — Bid Jacket`} />
      }
    >
      <BidJacketView
        jacket={{ ...jacket, package: { ...jacket.package, jacketPdfUrl: null } }}
        projectId={projectId}
        packageId={id}
        /* The breadcrumb leads back to the package; the view's own back link
           would say the same thing twice. */
        backHref={null}
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
    </PageShell>
  );
}
