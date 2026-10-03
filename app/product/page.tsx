import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';
import { GoldButton, GhostButton, PremiumFX } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';

export const metadata: Metadata = {
  title: 'Product — Every Module, One Platform',
  description:
    'The full Saguaro Control Systems module lineup: Takeoff Studio, Bid Jackets, Signal Studio, Daily Logs, Crews, T&M Tickets, Saguaro Radio, pay applications, invoicing — every module included, no add-on pricing.',
};

/*
 * The lineup below lists ONLY modules that exist in the shipped app, grouped
 * the way a contractor thinks about the work: win it, run it, talk about it,
 * get paid for it. One honest sentence per module — no roadmap fiction.
 * Accent chips come from lib/module-identity (the platform-wide accent map).
 */

type Mod = { key: string; name: string; mono: string; desc: string };

const WIN_WORK: Mod[] = [
  { key: 'takeoff', name: 'Takeoff Studio', mono: 'TS', desc: 'Measure straight off the plans — counts, lengths, and areas that price into a bid.' },
  { key: 'bids', name: 'Bid Jackets', mono: 'BJ', desc: 'Scope, pricing, and documents for every bid, packaged in one place.' },
  { key: 'bids', name: 'Bid Leveling', mono: 'BL', desc: 'Sub quotes side by side on a level sheet, so the low number is a real number.' },
  { key: 'signal', name: 'Signal Studio', mono: 'SS', desc: 'Draw the building, place the devices, and turn a coverage design into a priced bid.' },
  { key: 'catalog', name: 'Materials Catalog', mono: 'MC', desc: 'Priced materials with provenance, pulled straight into estimates and orders.' },
];

const RUN_WORK: Mod[] = [
  { key: 'daily', name: 'Daily Logs', mono: 'DL', desc: 'Auto-fill drafts the day from what the system already knows — you confirm and sign.' },
  { key: 'crews', name: 'Crews', mono: 'CR', desc: 'Who is on which job and clocked in where — the workforce board for the field.' },
  { key: 'tm', name: 'T&M Tickets', mono: 'TM', desc: 'Time and materials captured on site, signed, and ready to bill.' },
  { key: 'punch', name: 'Punch List', mono: 'PL', desc: 'Items with photos, assignees, and due dates — opened and closed from the field.' },
  { key: 'rfis', name: 'RFIs', mono: 'RF', desc: 'Questions out, answers tracked, nothing lost in a text thread.' },
  { key: 'work', name: 'My Work', mono: 'MW', desc: 'One person’s punch items, tickets, and tasks across every project.' },
];

const GET_PAID: Mod[] = [
  { key: 'payapps', name: 'Pay Applications', mono: 'PA', desc: 'G702/G703 pay apps built from the schedule of values, not retyped into it.' },
  { key: 'invoices', name: 'Invoicing', mono: 'IN', desc: 'Invoices that render as real PDFs your clients can actually open.' },
  { key: 'contracts', name: 'Contract to Cash', mono: 'CC', desc: 'Contract, change orders, pay app, invoice — one connected chain you can trace to cash.' },
];

const RADIO_FEATURES = [
  'Push-to-Talk',
  'EN ↔ ES Live Translation',
  'Panic with Live Location',
  'Dispatch Map',
  'Channel Patching',
  'Guest Links for Subs',
];

function IncludedTag() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999,
      background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)',
      color: '#22C55E', fontSize: 11, fontWeight: 800,
      whiteSpace: 'nowrap',
    }}>Included</span>
  );
}

function ModCard({ mod }: { mod: Mod }) {
  const a = moduleAccent(mod.key);
  return (
    <div className="mkt-page prodCard">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: a.vivid || a.hex, color: '#F8FAFC',
          fontSize: 11.5, fontWeight: 900, letterSpacing: '0.04em',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 8px rgba(0,0,0,0.35)',
        }} aria-hidden>{mod.mono}</span>
        <IncludedTag />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 6, letterSpacing: '-0.01em' }}>{mod.name}</div>
      <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.65, margin: 0 }}>{mod.desc}</p>
    </div>
  );
}

function GroupHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 10 }}>{eyebrow}</div>
      <h2 style={{ fontWeight: 600, letterSpacing: '-0.02em', color: '#FFFFFF', margin: '0 0 8px', lineHeight: 1.2 }}>{title}</h2>
      <p style={{ fontSize: 14.5, color: '#CBD5E1', lineHeight: 1.65, margin: 0, maxWidth: 560 }}>{sub}</p>
    </div>
  );
}

export default function ProductPage() {
  // Set NEXT_PUBLIC_DEMO_RADIO_TOKEN to a live guest-radio token to light up
  // the #radio-demo band with the real guest channel at /portals/radio/<token>.
  // Until it is set, the band shows a quiet coming-online line — never a fake player.
  const demoRadioToken = process.env.NEXT_PUBLIC_DEMO_RADIO_TOKEN;
  const radioAccent = moduleAccent('radio');

  return (
    <div style={{ background: 'var(--bg-base)', color: '#FFFFFF', minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <PremiumFX />
      <style>{`
        .prodGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .prodCard {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 20px;
          transition: border-color .2s ease, transform .2s ease;
        }
        .prodCard:hover { border-color: rgba(255,255,255,0.16); transform: translateY(-2px); }
        .prodSection { max-width: 1100px; margin: 0 auto; padding: 56px 32px; }
        .prodFootLinks { display: flex; gap: 24px; flex-wrap: wrap; }
        @media (max-width: 1024px) { .prodGrid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) {
          .prodGrid { grid-template-columns: 1fr; }
          .prodSection { padding: 44px 16px; }
        }
      `}</style>

      <MarketingNav />

      {/* ── HERO ── */}
      <section className="prodSection" style={{ paddingTop: 'clamp(48px, 7vh, 64px)', paddingBottom: 36, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 100, padding: '6px 14px', marginBottom: 24, fontSize: 12, fontWeight: 500, color: '#CBD5E1' }}>
          The Full Module Lineup
        </div>
        <h1 style={{ fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 16px' }}>
          Every Module. One Platform.<br />Nothing Sold in Pieces.
        </h1>
        <p style={{ fontSize: 15, color: '#CBD5E1', lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}>
          Grouped the way you actually think about the work: win it, run it, talk to the crew about it, and get paid for it. Every module below ships with the platform — no per-module add-on pricing.
        </p>
      </section>

      {/* ── WIN WORK ── */}
      <section className="prodSection" style={{ paddingTop: 24 }}>
        <GroupHeader eyebrow="Win Work" title="Price the Work" sub="From plans on screen to a bid you can defend — measured, leveled, and packaged." />
        <div className="prodGrid">
          {WIN_WORK.map((m, i) => <ModCard key={`${m.name}-${i}`} mod={m} />)}
        </div>
      </section>

      {/* ── RUN WORK ── */}
      <section className="prodSection" style={{ paddingTop: 16, background: '#141416', borderTop: '1px solid rgba(255,255,255,0.12)', borderBottom: '1px solid rgba(255,255,255,0.12)', maxWidth: 'none' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <GroupHeader eyebrow="Run Work" title="Run the Job" sub="The day-to-day of the jobsite, captured where it happens instead of reconstructed on Friday." />
          <div className="prodGrid">
            {RUN_WORK.map((m, i) => <ModCard key={`${m.name}-${i}`} mod={m} />)}
          </div>
        </div>
      </section>

      {/* ── TALK ── */}
      <section className="prodSection">
        <GroupHeader eyebrow="Talk" title="Talk to the Crew" sub="Saguaro Radio is the platform's comms flagship — a real radio for the jobsite, on the phones your crew already carries." />
        <div className="prodCard" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <span style={{
              width: 42, height: 42, borderRadius: 11, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: radioAccent.vivid || radioAccent.hex, color: '#F8FAFC',
              fontSize: 13, fontWeight: 900, letterSpacing: '0.04em',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 8px rgba(0,0,0,0.35)',
            }} aria-hidden>SR</span>
            <IncludedTag />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>Saguaro Radio</div>
          <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.7, margin: '0 0 18px', maxWidth: 640 }}>
            Push-to-talk over the network, with live English&ndash;Spanish translation on the channel, a panic button that broadcasts live location, a dispatch map of the crew, channel patching, and guest links so a sub can join without an account.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {RADIO_FEATURES.map((f) => (
              <span key={f} style={{
                display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: 999,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#CBD5E1', fontSize: 12, fontWeight: 500,
              }}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── RADIO DEMO ── */}
      <section id="radio-demo" className="prodSection" style={{ paddingTop: 0 }}>
        <div style={{ border: '1px solid var(--brand-primary-25)', background: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)', borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Try the Radio</h2>
          {demoRadioToken ? (
            <>
              <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.65, margin: '0 0 18px', maxWidth: 620 }}>
                This is a live guest channel on the real Saguaro Radio — the same guest link a sub gets. Key up and say something.
              </p>
              <iframe
                src={`/portals/radio/${demoRadioToken}`}
                title="Saguaro Radio — live guest demo channel"
                allow="microphone; autoplay"
                style={{ width: '100%', height: 480, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'var(--bg-base)', display: 'block', marginBottom: 12 }}
              />
              <a href={`/portals/radio/${demoRadioToken}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--brand-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Open the Guest Channel Full Screen →
              </a>
            </>
          ) : (
            <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.65, margin: 0 }}>
              Live demo channel coming online.
            </p>
          )}
        </div>
      </section>

      {/* ── GET PAID ── */}
      <section className="prodSection" style={{ paddingTop: 0 }}>
        <GroupHeader eyebrow="Get Paid" title="From Signed Contract to Money in the Bank" sub="The paperwork that gets you paid, generated from the numbers you already entered." />
        <div className="prodGrid">
          {GET_PAID.map((m, i) => <ModCard key={`${m.name}-${i}`} mod={m} />)}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="prodSection" style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', maxWidth: 'none', background: 'var(--bg-surface)' }}>
        <h2 style={{ fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 24px' }}>All of It, in One Login.</h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <GoldButton href="/signup">Start Free Trial</GoldButton>
          <GhostButton href="/get-the-app">Get the iOS App</GhostButton>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(203,213,225,0.6)', marginTop: 20 }}>30-day trial. No credit card required.</p>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.12)', padding: '40px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <span style={{ fontSize: 13, color: 'rgba(203,213,225,0.4)' }}>&copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.</span>
          <div className="prodFootLinks">
            <Link href="/pricing" style={{ fontSize: 13, color: 'rgba(203,213,225,0.5)', textDecoration: 'none' }}>Pricing</Link>
            <Link href="/get-the-app" style={{ fontSize: 13, color: 'rgba(203,213,225,0.5)', textDecoration: 'none' }}>The App</Link>
            <Link href="/compare/procore" style={{ fontSize: 13, color: 'rgba(203,213,225,0.5)', textDecoration: 'none' }}>vs Procore</Link>
            <Link href="/privacy" style={{ fontSize: 13, color: 'rgba(203,213,225,0.5)', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: 13, color: 'rgba(203,213,225,0.5)', textDecoration: 'none' }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
