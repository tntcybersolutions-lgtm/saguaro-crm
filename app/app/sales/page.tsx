'use client';
/*
 * app/app/sales — the Sales rep's home (sales workspace, Phase 1).
 *
 * The ask: a salesperson should land on their own world — pipeline, what's
 * late, the jobs, one hop to everything they touch — the way JobTread drops a
 * rep onto a dashboard, not onto a GC's build board. The pieces already exist
 * (SalesOverview self-fetches /api/sales/overview: pipeline value, follow-ups
 * late/today/upcoming, won vs active). They were only ever buried halfway down
 * the shared dashboard. This assembles them into one rep-facing page and hangs
 * the quick hops (Jobs, Leads, Customers, Reports, People/permissions) above
 * it, so "what does the sales guy see when he logs in" has one answer.
 *
 * Gated on Sales:View. A user without it is sent to the normal dashboard rather
 * than shown an empty sales shell.
 */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';
import SalesOverview from '@/components/SalesOverview';
import { ModuleHero } from '@/components/ui/premium';

const BG = '#1c1c1e', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const TEXT = '#FFFFFF', DIM = '#CBD5E1', BLUE = '#3B82F6', GOLD = '#F59E0B';

/** One quick-hop tile. */
function Hop({ href, title, desc, tone }: { href: string; title: string; desc: string; tone: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block', textDecoration: 'none', color: TEXT,
        background: RAISED, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${tone}`,
        borderRadius: 12, padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{desc}</div>
    </Link>
  );
}

export default function SalesHomePage() {
  const { can, resolved, name } = usePermissions();
  const router = useRouter();

  // Only send someone away once we actually know they lack Sales (resolved);
  // until then usePermissions fails open, so we render rather than flash-redirect.
  React.useEffect(() => {
    if (resolved && !can('Sales', 'View')) router.replace('/app');
  }, [resolved, can, router]);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto', color: TEXT }}>
      <ModuleHero
        eyebrow="Winning the work"
        title={name ? `${name.split(' ')[0]}'s pipeline` : 'Your pipeline'}
        subtitle="What you're chasing, what it's worth, and what's gone quiet — first thing, every day."
        accentColor={BLUE}
        actions={
          <Link href="/app/leads" style={{
            padding: '9px 18px', background: GOLD, color: '#000', borderRadius: 8,
            fontWeight: 800, fontSize: 13, textDecoration: 'none',
          }}>Open the pipeline →</Link>
        }
      />

      {/* Quick hops — the rep's whole surface, one tap each. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12, marginBottom: 22,
      }}>
        <Hop href="/app/leads"     title="Leads & deals"  desc="The stage board — move a deal, open its page" tone={BLUE} />
        <Hop href="/app/projects"  title="Jobs"           desc="Everything won and running" tone={GOLD} />
        <Hop href="/app/customers" title="Customers"      desc="Who you're working with" tone={BLUE} />
        <Hop href="/app/reports"   title="Reports"        desc="Win rate, revenue, activity" tone={GOLD} />
        <Hop href="/app/people"    title="Reps & access"  desc="Add a rep, set what each role can touch" tone={BLUE} />
      </div>

      {/* Pipeline + follow-ups, self-fetched from /api/sales/overview. */}
      <SalesOverview />
    </div>
  );
}
