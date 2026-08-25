'use client';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useDashboardStats, useTodayItems } from '@/lib/hooks/useDashboard';
import { useProjects } from '@/lib/hooks/useProjects';
import { useRFIs } from '@/lib/hooks/useRFIs';
import { useRealtimeDashboard } from '@/lib/useRealtime';
import { CurrencyDollar, ShieldCheck, ClipboardText, CheckCircle, ChartBar, TrendUp, WarningCircle, SlidersHorizontal, Buildings, Receipt, Gavel, Plus, Sparkle, ArrowRight, Lightning } from '@phosphor-icons/react';
import { useSavedLayout, ConfiguredDashboard } from '@/components/dashboard-widgets';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import GettingStartedRail from '@/components/GettingStartedRail';
import SuggestionTicker from '@/components/intelligence/SuggestionTicker';

// Lazy-load Recharts to avoid SSR issues
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false });

const GOLD   = '#F59E0B';
const DARK   = '#1c1c1e';
const RAISED = '#141416';
const RAISED_ALT = '#1c1c1e';
const BORDER = 'rgba(255,255,255,0.12)';
const BORDER_SUBTLE = 'rgba(0,0,0,0.06)';
const DIM    = '#CBD5E1';
const TEXT   = '#FFFFFF';
// Desert-dusk semantic palette — retuned off raw iOS system colors so the
// accents harmonize with gold-on-navy instead of clashing (turquoise, sage,
// terracotta, amber are authentic Sonoran hues that sit on the dark bg).
const GREEN  = '#45B37D'; // money / positive — muted emerald-sage
const RED    = '#E0644E'; // alert / overdue  — terracotta
const BLUE   = '#F59E0B'; // info / open bids — unified to brand gold (Chad's call)
const ORANGE = '#F0A63C'; // warning / pending — warm amber (folds into gold)
const SHADOW_SM = '0 1px 2px rgba(0,0,0,0.06)';
const SHADOW_MD = '0 4px 14px rgba(0,0,0,0.08)';
const SHADOW_LG = '0 16px 44px rgba(0,0,0,0.10)';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface ScoreResult {
  score: number;
  recommendation: string;
  reasoning: string;
  suggestedMargin: number;
}

interface TodayItem {
  type: 'pay-app' | 'insurance' | 'rfi' | 'compliance';
  title: string;
  subtitle: string;
  urgency: 'high' | 'medium' | 'low';
  actionUrl: string;
  actionLabel: string;
}

/* ─── KPI Card ────────────────────────────────────────────────────────── */
function KPI({
  label, value, sub, color, onClick, href,
}: {
  label: string; value: string; sub?: string; color?: string;
  onClick?: () => void; href?: string;
}) {
  const inner = (
    <div
      onClick={onClick}
      style={{
        background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
        padding: '18px 20px', cursor: onClick || href ? 'pointer' : 'default',
        boxShadow: SHADOW_SM,
        transition: 'border-color .18s, box-shadow .18s, transform .12s',
      }}
      onMouseEnter={e => { if (onClick || href) { const t = e.currentTarget as HTMLDivElement; t.style.borderColor = 'rgba(0,0,0,0.14)'; t.style.boxShadow = SHADOW_LG; t.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={e => { if (onClick || href) { const t = e.currentTarget as HTMLDivElement; t.style.borderColor = BORDER; t.style.boxShadow = SHADOW_SM; t.style.transform = 'translateY(0)'; } }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: DIM, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? TEXT, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>{sub}</div>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link>;
  return inner;
}

/* ─── Skeleton Row ────────────────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: 4, height: 48, borderRadius: 2, background: BORDER, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton-pulse" style={{ height: 14, width: '55%', borderRadius: 4, background: BORDER, marginBottom: 8 }} />
        <div className="skeleton-pulse" style={{ height: 11, width: '75%', borderRadius: 4, background: BORDER }} />
      </div>
      <div className="skeleton-pulse" style={{ height: 30, width: 80, borderRadius: 6, background: BORDER }} />
    </div>
  );
}

/* ─── Today Action Item Card ─────────────────────────────────────────── */
const TYPE_META: Record<TodayItem['type'], { icon: React.ReactNode; borderColor: string; label: string }> = {
  'pay-app':    { icon: <CurrencyDollar size={22} weight="duotone" color={GOLD} />, borderColor: GOLD, label: 'Pay App' },
  'insurance':  { icon: <ShieldCheck size={22} weight="duotone" color={RED} />, borderColor: RED, label: 'Insurance' },
  'rfi':        { icon: <ClipboardText size={22} weight="duotone" color={ORANGE} />, borderColor: ORANGE, label: 'RFI' },
  'compliance': { icon: <CheckCircle size={22} weight="duotone" color={BLUE} />, borderColor: BLUE, label: 'Compliance' },
};
const URGENCY_COLOR: Record<TodayItem['urgency'], string> = { high: RED, medium: ORANGE, low: DIM };

function TodayActionCard({ item }: { item: TodayItem }) {
  const meta = TYPE_META[item.type];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
        borderBottom: `1px solid ${BORDER_SUBTLE}`, borderLeft: `3px solid ${meta.borderColor}`,
        background: 'transparent', transition: 'background .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
        <div style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subtitle}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: URGENCY_COLOR[item.urgency], textTransform: 'uppercase', letterSpacing: .5, flexShrink: 0, marginRight: 8 }}>
        {item.urgency}
      </span>
      <Link
        href={item.actionUrl}
        style={{
          padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          background: `rgba(245, 158, 11,0.12)`, color: GOLD,
          border: `1px solid rgba(245, 158, 11,0.3)`, textDecoration: 'none',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {item.actionLabel}
      </Link>
    </div>
  );
}

/* ─── Bid Score Modal ─────────────────────────────────────────────────── */
function BidScoreModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ projectName: '', estValue: '', trade: '', location: '', targetMargin: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/bids/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: form.projectName,
          estimatedValue: parseFloat(form.estValue.replace(/[^0-9.]/g, '')),
          trade: form.trade, location: form.location,
          targetMargin: parseFloat(form.targetMargin),
        }),
      });
      if (!res.ok) throw new Error('Failed to score bid');
      setResult(await res.json());
    } catch { setError('Unable to reach scoring engine. Please try again.'); }
    setLoading(false);
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  const scoreColor = result ? (result.score >= 70 ? GREEN : result.score >= 45 ? ORANGE : RED) : TEXT;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: SHADOW_LG, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>Score a Bid</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>AI-powered bid scoring and recommendation</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          {!result ? (
            <form onSubmit={handleSubmit}>
              {([
                { label: 'Project Name', field: 'projectName' as const, placeholder: 'e.g. Tempe Office Complex' },
                { label: 'Estimated Value ($)', field: 'estValue' as const, placeholder: 'e.g. 2,500,000' },
                { label: 'Trade / Scope', field: 'trade' as const, placeholder: 'e.g. General Contractor, Electrical' },
                { label: 'Location', field: 'location' as const, placeholder: 'e.g. Phoenix, AZ' },
                { label: 'Our Target Margin (%)', field: 'targetMargin' as const, placeholder: 'e.g. 8.5' },
              ] as const).map(({ label, field, placeholder }) => (
                <div key={field} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>{label}</label>
                  <input
                    value={form[field]} onChange={f(field)} placeholder={placeholder} required
                    style={{ width: '100%', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '9px 12px', color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = GOLD)}
                    onBlur={e => (e.target.style.borderColor = BORDER)}
                  />
                </div>
              ))}
              {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: RED, fontSize: 12, fontWeight: 600, marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(224,100,78,0.10)', border: '1px solid rgba(224,100,78,0.28)' }}><WarningCircle size={16} weight="duotone" /> {error}</div>}
              <button
                type="submit" disabled={loading}
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', background: loading ? '#1c1c1e' : 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))', border: 'none', borderRadius: 'var(--radius-md)', color: loading ? DIM : '#241500', fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4, boxShadow: loading ? 'none' : '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)' }}
              >
                {loading ? 'Analyzing…' : <>Score This Bid <ArrowRight size={15} weight="bold" /></>}
              </button>
            </form>
          ) : (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: DARK, border: `2px solid ${scoreColor}`, borderRadius: 14, padding: '18px 32px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Bid Score</div>
                  <div style={{ fontSize: 52, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{result.score}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>out of 100</div>
                </div>
              </div>
              <div style={{ background: DARK, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>Recommendation</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>{result.recommendation}</div>
              </div>
              <div style={{ background: DARK, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>Reasoning</div>
                <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{result.reasoning}</div>
              </div>
              <div style={{ background: `rgba(245, 158, 11,0.12)`, border: `1px solid rgba(245, 158, 11,0.2)`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Suggested Margin</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{result.suggestedMargin}%</div>
              </div>
              <button
                onClick={() => setResult(null)}
                style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Score Another Bid
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Live Pulse Indicator ───────────────────────────────────────────── */
function LivePulse() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: GREEN }}>
      <span style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: GREEN, animation: 'livePulse 2s ease-in-out infinite',
      }} />
      LIVE
    </span>
  );
}

/* ─── Drill-Down Panel ───────────────────────────────────────────────── */
type DrillDownType = 'projects' | 'bids' | 'payapps' | 'rfis' | null;

function DrillDownPanel({ type, onClose }: { type: DrillDownType; onClose: () => void }) {
  const LINKS: Record<NonNullable<DrillDownType>, { href: string; label: string; desc: string }> = {
    projects: { href: '/app/projects',               label: 'View All Projects',    desc: 'Full project list with status and financials' },
    bids:     { href: '/app/bids',                   label: 'View All Bids',        desc: 'Open bids awaiting award' },
    payapps:  { href: '/app/billing',                label: 'View Pay Applications', desc: 'Submitted and pending pay apps' },
    rfis:     { href: '/app/projects',               label: 'View Projects',         desc: 'Open RFIs across all projects' },
  };
  if (!type) return null;
  const link = LINKS[type];

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 600, padding: '20px 24px 32px', animation: 'slideUp 0.2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Drill Down</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <Link
          href={link.href}
          onClick={onClose}
          className="lift"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: DARK, borderRadius: 10, border: `1px solid ${BORDER}`,
            textDecoration: 'none', marginBottom: 10, boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{link.label}</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{link.desc}</div>
          </div>
          <ArrowRight size={18} weight="bold" color={GOLD} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownType>(null);

  // SWR-powered data — auto-refreshes in background
  const { stats, loading: statsLoading, error: statsError, revalidate: revalidateStats } = useDashboardStats();
  const { items: todayItems, loading: todayLoading, error: todayError, revalidate: revalidateToday } = useTodayItems();
  const { projects, loading: projectsLoading, error: projectsError, revalidate: revalidateProjects } = useProjects();
  const { openRFIs, loading: rfisLoading, error: rfisError, revalidate: revalidateRFIs } = useRFIs();

  // The user's saved dashboard layout (from the Dashboard Config builder). When one
  // exists with widgets, the home screen renders THAT configured layout with live data.
  const { layout: savedLayout } = useSavedLayout();
  const hasCustomLayout = !!savedLayout && Array.isArray(savedLayout.widgets) && savedLayout.widgets.length > 0;

  // Realtime: any DB change to critical tables auto-invalidates stats
  const handleRealtimeChange = useCallback(() => {
    revalidateStats();
  }, [revalidateStats]);
  useRealtimeDashboard(handleRealtimeChange);

  const formatCurrency = (n: number | null | undefined) => '$' + (n ?? 0).toLocaleString();

  // Time-based greeting is computed AFTER mount so the server-rendered HTML and
  // the first client render match (both 'Welcome back'); otherwise the UTC-vs-local
  // hour difference causes a React hydration mismatch (#418/#425) on /app.
  const [greeting, setGreeting] = useState('Welcome back');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  /* Greet the person by name — "Good evening, Rob".
   * firstName is null whenever the profile has no real full_name; /api/auth/me
   * refuses to fall back to the email prefix precisely so this cannot render
   * "Good evening, tntcybersolutions". No name => the greeting stays as it was. */
  const [firstName, setFirstName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && typeof d.firstName === 'string') setFirstName(d.firstName); })
      .catch(() => { /* greeting simply stays nameless */ });
    return () => { alive = false; };
  }, []);

  // "Good" stays white; "evening, Rob" carries the gold accent.
  const greetLead = greeting.split(' ')[0];
  const greetRest = greeting.split(' ').slice(1).join(' ');
  const greetAccent = firstName ? `${greetRest}, ${firstName}` : greetRest;

  // Win/loss learned outcomes — headline win rate + per-trade breakdown
  // (GET /api/bids/win-factors; winRate is a 0..1 fraction over decided bids, or null).
  const [winData, setWinData] = useState<{
    winRate: number | null; wins: number; losses: number;
    factors: { csi_division?: string; trade?: string | null; win_rate?: number | null }[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/bids/win-factors')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setWinData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const activeProjects = stats?.activeProjects ?? 0;
  const openBids       = stats?.openBids ?? 0;
  const pendingPayApps = stats?.pendingPayApps ?? 0;
  const totalContract  = stats?.totalContractValue ?? 0;

  return (
    <>
      <style>{`
        @keyframes skeletonPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .skeleton-pulse { animation: skeletonPulse 1.4s ease-in-out infinite; }
        @keyframes livePulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(1.4); } }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <PremiumSurface maxWidth={1600}>

        {/* Header */}
        <ModuleHero
          eyebrow="Portfolio Overview"
          eyebrowIcon={<Sparkle size={13} weight="fill" />}
          aux={<LivePulse />}
          title={greetLead}
          accent={greetAccent}
          subtitle="Here's what needs your attention today."
          actions={<>
            <Link href="/app/projects/new" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> New Project</Link>
            <button onClick={() => setShowScoreModal(true)} style={goldOutlineButtonStyle} className="pmBtn"><Sparkle size={15} weight="fill" /> Score a Bid</button>
            <Link href="/app/dashboard-config" title="Customize dashboard" style={ghostButtonStyle} className="pmBtn"><SlidersHorizontal size={15} weight="bold" /> Customize</Link>
          </>}
        />

        {/* Live suggestion ticker — real learning moments with honest $ impact,
            each deep-linking to the flagged module section (NudgeRing sync). */}
        <SuggestionTicker style={{ marginBottom: 24 }} />

        {/* GC Guided Journey — 8 steps from first project to first payment */}
        <GettingStartedRail />

        {hasCustomLayout && savedLayout ? (
          <ConfiguredDashboard layout={savedLayout} />
        ) : (
        <>
        {/* KPI Row — every metric is drillable */}
        {statsError && !statsLoading ? (
          <div style={{ marginBottom: 28 }}>
            <SectionCard>
              <PremiumEmpty
                tone="error"
                icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                title="Couldn't load dashboard stats"
                description="We hit a problem fetching your portfolio metrics. Your data is safe — try again."
                action={<button onClick={() => revalidateStats()} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
              />
            </SectionCard>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 28 }}>
          {statsLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px' }}>
                <div className="skeleton-pulse" style={{ height: 38, width: 38, borderRadius: 11, background: BORDER, marginBottom: 14 }} />
                <div className="skeleton-pulse" style={{ height: 28, width: '45%', borderRadius: 6, background: BORDER, marginBottom: 8 }} />
                <div className="skeleton-pulse" style={{ height: 10, width: '70%', borderRadius: 4, background: BORDER }} />
              </div>
            ))
          ) : (
            <>
              <StatCard
                icon={<Buildings size={19} weight="duotone" color={GOLD} />}
                label="Active Projects" value={String(activeProjects)} accent={GOLD}
                sub={activeProjects === 1 ? '1 in progress' : `${activeProjects} in progress`}
                href="/app/projects" delay={0.02}
              />
              <Link href="/app/projects" style={{ textDecoration: 'none', display: 'block' }}>
                <StatCard
                  icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
                  label="Total Contract Value" value={formatCurrency(totalContract)}
                  sub="active projects" interactive delay={0.06}
                />
              </Link>
              <StatCard
                icon={<Gavel size={19} weight="duotone" color={BLUE} />}
                label="Open Bids" value={String(openBids)} accent={BLUE}
                sub="awaiting award"
                href="/app/bids" delay={0.10}
              />
              <StatCard
                icon={<Receipt size={19} weight="duotone" color={ORANGE} />}
                label="Pending Pay Apps" value={String(pendingPayApps)} accent={pendingPayApps > 0 ? ORANGE : undefined}
                sub="submitted / approved"
                href="/app/billing" delay={0.14}
              />
              <StatCard
                icon={<ClipboardText size={19} weight="duotone" color={ORANGE} />}
                label="Open RFIs"
                value={rfisError ? '—' : rfisLoading ? '—' : String(openRFIs.length)}
                sub={rfisError ? 'unavailable' : openRFIs.some(r => r.due_date && new Date(r.due_date) < new Date()) ? 'some overdue' : 'none overdue'}
                accent={!rfisError && openRFIs.length ? ORANGE : undefined}
                href="/app/projects" delay={0.18}
              />
              <StatCard
                icon={<TrendUp size={19} weight="duotone" color={GREEN} />}
                label="Win Rate"
                value={winData?.winRate != null ? `${Math.round(winData.winRate * 100)}%` : '—'}
                accent={winData?.winRate != null ? GREEN : undefined}
                sub={winData?.winRate != null ? `${winData.wins} won / ${winData.losses} lost` : 'No bids marked yet'}
                delay={0.22}
              />
            </>
          )}
        </div>
        )}

        {/* ── Charts Section ─────────────────────────────────────────── */}
        {!statsLoading && !statsError && !projectsLoading && !projectsError && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 28 }}>

            {/* Project Budget Chart */}
            <SectionCard title="Project Budgets" icon={<ChartBar size={17} weight="duotone" color={GOLD} />}>
              {projects.length > 0 ? (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projects.slice(0, 6).map((p: typeof projects[number] & { budget?: number; contract_value?: number }) => ({
                      name: p.name?.length > 12 ? p.name.slice(0, 12) + '…' : p.name || 'Unnamed',
                      budget: p.budget ?? p.contract_value ?? 0,
                    }))}>
                      <XAxis dataKey="name" tick={{ fill: DIM, fontSize: 11 }} axisLine={{ stroke: BORDER_SUBTLE }} tickLine={false} />
                      <YAxis tick={{ fill: DIM, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        contentStyle={{ background: RAISED_ALT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12, color: TEXT, boxShadow: SHADOW_MD }}
                        labelStyle={{ color: GOLD, fontWeight: 700 }}
                        formatter={((v: number) => [`$${v.toLocaleString()}`, 'Budget']) as React.ComponentProps<typeof Tooltip>['formatter']}
                      />
                      <Bar dataKey="budget" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 13 }}>
                  Add your first project to see budgets here
                </div>
              )}
            </SectionCard>

            {/* Portfolio Status Donut */}
            <SectionCard title="Portfolio Status" icon={<TrendUp size={17} weight="duotone" color={GOLD} />}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ width: 160, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Active', value: stats?.activeProjects ?? 0, fill: '#F59E0B' },
                          { name: 'Open Bids', value: stats?.openBids ?? 0, fill: '#FBBF24' },
                          { name: 'Pay Apps', value: stats?.pendingPayApps ?? 0, fill: '#D97706' },
                          { name: 'RFIs', value: openRFIs?.length ?? 0, fill: '#9CA3AF' },
                        ].filter(d => d.value > 0)}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      />
                      {/* Per-datum `fill` colors each slice; dynamically-imported <Cell> is
                          not recognized by recharts so its fill was being ignored (gray donut). */}
                      <Tooltip
                        contentStyle={{ background: RAISED_ALT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12, color: TEXT, boxShadow: SHADOW_MD }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Active Projects', value: stats?.activeProjects ?? 0, color: '#F59E0B' },
                    { label: 'Open Bids', value: stats?.openBids ?? 0, color: '#FBBF24' },
                    { label: 'Pending Pay Apps', value: stats?.pendingPayApps ?? 0, color: '#D97706' },
                    { label: 'Open RFIs', value: openRFIs?.length ?? 0, color: '#9CA3AF' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: DIM }}>{item.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginLeft: 'auto' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Win Rate by Trade */}
            <SectionCard title="Win Rate by Trade" icon={<Gavel size={17} weight="duotone" color={GOLD} />}>
              {winData && winData.factors.length > 0 ? (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={winData.factors.slice(0, 7).map(f => {
                        const raw = f.trade || f.csi_division || '—';
                        return {
                          name: raw.length > 14 ? raw.slice(0, 14) + '…' : raw,
                          winRate: Math.round((f.win_rate ?? 0) * 100),
                        };
                      })}
                      margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                    >
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: DIM, fontSize: 11 }} axisLine={{ stroke: BORDER_SUBTLE }} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: DIM, fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        contentStyle={{ background: RAISED_ALT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12, color: TEXT, boxShadow: SHADOW_MD }}
                        labelStyle={{ color: GOLD, fontWeight: 700 }}
                        formatter={((v: number) => [`${v}%`, 'Win Rate']) as React.ComponentProps<typeof Tooltip>['formatter']}
                      />
                      <Bar dataKey="winRate" fill={GREEN} radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 13 }}>
                  No bid outcomes recorded yet
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* Today's Priority Actions */}
        <SectionCard
          icon={<Lightning size={17} weight="duotone" color={GOLD} />}
          title="Today's Priority Actions"
          subtitle="Items requiring your attention"
          flush
          style={{ marginBottom: 24 }}
          action={!todayLoading && !todayError && todayItems.filter((i: TodayItem) => i.urgency === 'high').length > 0 ? (
            <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 999, background: 'rgba(255,59,48,0.14)', color: RED, border: '1px solid rgba(255,59,48,0.3)' }}>
              {todayItems.filter((i: TodayItem) => i.urgency === 'high').length} urgent
            </span>
          ) : undefined}
        >
          {todayLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
          {!todayLoading && todayError && (
            <div style={{ padding: 8 }}>
              <PremiumEmpty
                tone="error"
                icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                title="Couldn't load today's actions"
                description="We couldn't reach the priority-actions feed. Try again to reload your tasks."
                action={<button onClick={() => revalidateToday()} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
                compact
              />
            </div>
          )}
          {!todayLoading && !todayError && todayItems.length === 0 && (
            <div style={{ padding: '6px 8px' }}>
              <PremiumEmpty
                icon={<CheckCircle size={30} weight="duotone" color={GREEN} />}
                title="All caught up"
                description="No urgent items need your attention right now."
                compact
              />
            </div>
          )}
          {!todayLoading && !todayError && todayItems.map((item: TodayItem, i: number) => (
            <TodayActionCard key={i} item={item} />
          ))}
        </SectionCard>

        {/* Main 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>

          {/* Active Projects */}
          <SectionCard
            flush
            icon={<Buildings size={17} weight="duotone" color={GOLD} />}
            title="Active Projects"
            action={<Link href="/app/projects" style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>All Projects <ArrowRight size={13} weight="bold" /></Link>}
          >
            <div style={{ padding: 16 }}>
              {projectsLoading && <><SkeletonRow /><SkeletonRow /></>}
              {!projectsLoading && projectsError && (
                <PremiumEmpty
                  tone="error"
                  icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                  title="Couldn't load projects"
                  description="We couldn't reach your project list. This doesn't mean you have none — try again."
                  action={<button onClick={() => revalidateProjects()} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
                  compact
                />
              )}
              {!projectsLoading && !projectsError && projects.length === 0 && (
                <PremiumEmpty
                  icon={<Buildings size={30} weight="duotone" color={GOLD} />}
                  title="No active projects yet"
                  description="Create your first project to start tracking your construction work."
                  action={<Link href="/app/projects/new" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Create your first project</Link>}
                  compact
                />
              )}
              {!projectsLoading && !projectsError && projects.slice(0, 3).map(proj => (
                <Link key={proj.id} href={`/app/projects/${proj.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: 10 }}>
                  <div className="lift" style={{ padding: '14px 16px', background: RAISED_ALT, borderRadius: 10, border: `1px solid ${BORDER_SUBTLE}`, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(245, 158, 11,0.5)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER_SUBTLE)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 2 }}>{proj.name}</div>
                        <div style={{ fontSize: 12, color: DIM }}>{proj.address}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(52,199,89,0.14)', color: GREEN, border: '1px solid rgba(52,199,89,0.3)', height: 'fit-content', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {proj.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <span style={{ color: DIM }}>Contract: <strong style={{ color: TEXT }}>{formatCurrency(proj.contract_amount)}</strong></span>
                      {proj.project_number && <span style={{ color: DIM }}>#{proj.project_number}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Open RFIs */}
          <SectionCard
            flush
            icon={<ClipboardText size={17} weight="duotone" color={GOLD} />}
            title="Open RFIs"
            action={<Link href="/app/projects" style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>View Projects <ArrowRight size={13} weight="bold" /></Link>}
          >
            {rfisLoading && <><SkeletonRow /><SkeletonRow /></>}
            {!rfisLoading && rfisError && (
              <div style={{ padding: 8 }}>
                <PremiumEmpty
                  tone="error"
                  icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                  title="Couldn't load RFIs"
                  description="We couldn't reach the RFI feed. Try again to reload open requests for information."
                  action={<button onClick={() => revalidateRFIs()} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
                  compact
                />
              </div>
            )}
            {!rfisLoading && !rfisError && openRFIs.length === 0 && (
              <div style={{ padding: '6px 8px' }}>
                <PremiumEmpty
                  icon={<ClipboardText size={30} weight="duotone" color={GOLD} />}
                  title="No open RFIs"
                  description="Add projects to track requests for information here."
                  compact
                />
              </div>
            )}
            {!rfisLoading && !rfisError && openRFIs.length > 0 && (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: RAISED_ALT }}>
                      {['RFI #', 'Subject', 'Status', 'Due'].map(h => (
                        <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: DIM, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openRFIs.slice(0, 8).map(rfi => {
                      const overdue = rfi.due_date && new Date(rfi.due_date) < new Date();
                      return (
                        <tr key={rfi.id} style={{ borderBottom: `1px solid ${BORDER_SUBTLE}` }}>
                          <td style={{ padding: '10px 16px', color: DIM }}>{rfi.rfi_number}</td>
                          <td style={{ padding: '10px 16px', color: TEXT, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rfi.subject}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,149,0,0.14)', color: ORANGE, border: `1px solid rgba(255,149,0,0.3)`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {rfi.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', color: overdue ? RED : DIM, fontWeight: overdue ? 700 : 400 }}>
                            {rfi.due_date ? new Date(rfi.due_date).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
        </>
        )}
      </PremiumSurface>

      {/* Modals */}
      {showScoreModal && <BidScoreModal onClose={() => setShowScoreModal(false)} />}
      {drillDown && <DrillDownPanel type={drillDown} onClose={() => setDrillDown(null)} />}
    </>
  );
}
