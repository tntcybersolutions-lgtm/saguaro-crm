'use client';
import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useDashboardStats, useTodayItems } from '@/lib/hooks/useDashboard';
import { useProjects } from '@/lib/hooks/useProjects';
import { useRFIs } from '@/lib/hooks/useRFIs';
import { useRealtimeDashboard } from '@/lib/useRealtime';
import { CurrencyDollar, ShieldCheck, ClipboardText, CheckCircle, ChartBar, TrendUp } from '@phosphor-icons/react';

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

const GOLD   = '#D4A017';
const DARK   = '#000000';
const RAISED = '#0A0A0A';
const BORDER = 'rgba(255,255,255,0.05)';
const DIM    = '#86868B';
const TEXT   = '#F5F5F7';
const GREEN  = '#1a8a4a';
const RED    = '#c03030';
const BLUE   = '#1a5fa8';
const ORANGE = '#B85C2A';

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

/* ─── KPI Card with trend indicator ──────────────────────────────────── */
function KPI({
  label, value, sub, color, onClick, href, trend,
}: {
  label: string; value: string; sub?: string; color?: string;
  onClick?: () => void; href?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; pct?: number };
}) {
  const trendColor = trend?.direction === 'up' ? GREEN : trend?.direction === 'down' ? RED : DIM;
  const trendArrow = trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '→';

  const inner = (
    <div
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 10,
        padding: '18px 20px',
        cursor: onClick || href ? 'pointer' : 'default',
        transition: 'border-color .2s, background .2s, box-shadow .2s',
      }}
      onMouseEnter={e => {
        if (onClick || href) {
          e.currentTarget.style.borderColor = 'rgba(212,160,23,.3)';
          e.currentTarget.style.background = 'rgba(212,160,23,.04)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(212,160,23,.08)';
        }
      }}
      onMouseLeave={e => {
        if (onClick || href) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: DIM, marginBottom: 6 }}>{label}</div>
        {trend && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 11, fontWeight: 700, color: trendColor,
            padding: '2px 6px', borderRadius: 4,
            background: `${trendColor}15`,
          }}>
            {trendArrow} {trend.pct != null ? `${trend.pct}%` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? TEXT, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>{sub}</div>}
      {(onClick || href) && (
        <div style={{ fontSize: 10, color: GOLD, marginTop: 8, letterSpacing: .5, fontWeight: 700 }}>VIEW DETAILS →</div>
      )}
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
  'compliance': { icon: <CheckCircle size={22} weight="duotone" color="#3B82F6" />, borderColor: '#2a6db8', label: 'Compliance' },
};
const URGENCY_COLOR: Record<TodayItem['urgency'], string> = { high: RED, medium: ORANGE, low: DIM };

function TodayActionCard({ item }: { item: TodayItem }) {
  const meta = TYPE_META[item.type];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
        borderBottom: `1px solid ${BORDER}`, borderLeft: `4px solid ${meta.borderColor}`,
        background: 'transparent', transition: 'background .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.025)')}
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
          background: `rgba(212,160,23,.12)`, color: GOLD,
          border: `1px solid rgba(212,160,23,.3)`, textDecoration: 'none',
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
          estValue: parseFloat(form.estValue.replace(/[^0-9.]/g, '')),
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
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
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
              {error && <div style={{ color: RED, fontSize: 12, marginBottom: 12 }}>{error}</div>}
              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '11px', background: loading ? 'rgba(212,160,23,.4)' : GOLD, border: 'none', borderRadius: 8, color: '#000000', fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
              >
                {loading ? 'Analyzing...' : 'Score This Bid →'}
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
              <div style={{ background: `rgba(212,160,23,.08)`, border: `1px solid rgba(212,160,23,.2)`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
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
    payapps:  { href: '/app/pay-applications',       label: 'View Pay Applications', desc: 'Submitted and pending pay apps' },
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
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: DARK, borderRadius: 10, border: `1px solid ${BORDER}`,
            textDecoration: 'none', marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{link.label}</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{link.desc}</div>
          </div>
          <span style={{ color: GOLD, fontSize: 18 }}>→</span>
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
  const { stats, loading: statsLoading, revalidate: revalidateStats } = useDashboardStats();
  const { items: todayItems, loading: todayLoading } = useTodayItems();
  const { projects, loading: projectsLoading } = useProjects();
  const { openRFIs, loading: rfisLoading } = useRFIs();

  // Realtime: any DB change to critical tables auto-invalidates stats
  const handleRealtimeChange = useCallback(() => {
    revalidateStats();
  }, [revalidateStats]);
  useRealtimeDashboard(handleRealtimeChange);

  const formatCurrency = (n: number) => '$' + n.toLocaleString();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

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

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Portfolio Overview</div>
              <LivePulse />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '4px 0', color: TEXT }}>
              {greeting}
            </h1>
            <div style={{ fontSize: 14, color: DIM }}>Here's what needs your attention today.</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/app/projects/new" style={{ padding: '10px 18px', background: GOLD, color: '#000000', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              + New Project
            </Link>
            <button
              onClick={() => setShowScoreModal(true)}
              style={{ padding: '10px 18px', background: 'rgba(212,160,23,.12)', color: GOLD, border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Score a Bid
            </button>
          </div>
        </div>

        {/* KPI Row — every metric is drillable */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
                <div className="skeleton-pulse" style={{ height: 10, width: '60%', borderRadius: 4, background: BORDER, marginBottom: 10 }} />
                <div className="skeleton-pulse" style={{ height: 28, width: '45%', borderRadius: 4, background: BORDER, marginBottom: 6 }} />
                <div className="skeleton-pulse" style={{ height: 10, width: '70%', borderRadius: 4, background: BORDER }} />
              </div>
            ))
          ) : (
            <>
              <KPI
                label="Active Projects" value={String(activeProjects)} color={GOLD}
                sub={activeProjects === 1 ? '1 in progress' : `${activeProjects} in progress`}
                onClick={() => setDrillDown('projects')}
              />
              <KPI
                label="Total Contract Value" value={formatCurrency(totalContract)}
                sub="active projects"
                href="/app/projects"
              />
              <KPI
                label="Open Bids" value={String(openBids)} color={BLUE}
                sub="awaiting award"
                onClick={() => setDrillDown('bids')}
              />
              <KPI
                label="Pending Pay Apps" value={String(pendingPayApps)} color={pendingPayApps > 0 ? ORANGE : DIM}
                sub="submitted / approved"
                onClick={() => setDrillDown('payapps')}
              />
              <KPI
                label="Open RFIs"
                value={rfisLoading ? '—' : String(openRFIs.length)}
                sub={openRFIs.some(r => r.due_date && new Date(r.due_date) < new Date()) ? 'some overdue' : 'none overdue'}
                color={openRFIs.length ? ORANGE : DIM}
                onClick={() => setDrillDown('rfis')}
              />
            </>
          )}
        </div>

        {/* ── Charts Section ─────────────────────────────────────────── */}
        {!statsLoading && !projectsLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 28 }}>

            {/* Project Budget Chart */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <ChartBar size={18} weight="duotone" color={GOLD} />
                <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Project Budgets</span>
              </div>
              {projects.length > 0 ? (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projects.slice(0, 6).map(p => ({
                      name: p.name?.length > 12 ? p.name.slice(0, 12) + '…' : p.name || 'Unnamed',
                      budget: p.budget ?? p.contract_value ?? 0,
                    }))}>
                      <XAxis dataKey="name" tick={{ fill: DIM, fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
                      <YAxis tick={{ fill: DIM, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: TEXT }}
                        labelStyle={{ color: GOLD, fontWeight: 700 }}
                        formatter={(v: number) => [`$${v.toLocaleString()}`, 'Budget']}
                      />
                      <Bar dataKey="budget" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 13 }}>
                  No project data to display yet
                </div>
              )}
            </div>

            {/* Portfolio Status Donut */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <TrendUp size={18} weight="duotone" color={GOLD} />
                <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Portfolio Status</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ width: 160, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Active', value: stats?.activeProjects ?? 0 },
                          { name: 'Open Bids', value: stats?.openBids ?? 0 },
                          { name: 'Pay Apps', value: stats?.pendingPayApps ?? 0 },
                          { name: 'RFIs', value: openRFIs?.length ?? 0 },
                        ].filter(d => d.value > 0)}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill={GOLD} />
                        <Cell fill={BLUE} />
                        <Cell fill={ORANGE} />
                        <Cell fill={RED} />
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: TEXT }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Active Projects', value: stats?.activeProjects ?? 0, color: GOLD },
                    { label: 'Open Bids', value: stats?.openBids ?? 0, color: BLUE },
                    { label: 'Pending Pay Apps', value: stats?.pendingPayApps ?? 0, color: ORANGE },
                    { label: 'Open RFIs', value: openRFIs?.length ?? 0, color: RED },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: DIM }}>{item.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginLeft: 'auto' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Today's Priority Actions */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Today's Priority Actions</span>
              <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Items requiring your attention</div>
            </div>
            {!todayLoading && todayItems.filter((i: TodayItem) => i.urgency === 'high').length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'rgba(192,48,48,.15)', color: RED, border: '1px solid rgba(192,48,48,.3)' }}>
                {todayItems.filter((i: TodayItem) => i.urgency === 'high').length} urgent
              </span>
            )}
          </div>
          {todayLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
          {!todayLoading && todayItems.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: DIM, fontSize: 13 }}>
              All caught up — no urgent items right now.
            </div>
          )}
          {!todayLoading && todayItems.map((item: TodayItem, i: number) => (
            <TodayActionCard key={i} item={item} />
          ))}
        </div>

        {/* Main 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>

          {/* Active Projects */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Active Projects</span>
              <Link href="/app/projects" style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>All Projects →</Link>
            </div>
            <div style={{ padding: 16 }}>
              {projectsLoading && <><SkeletonRow /><SkeletonRow /></>}
              {!projectsLoading && projects.length === 0 && (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10, display: 'flex', justifyContent: 'center' }}><ClipboardText size={32} weight="duotone" color={DIM} /></div>
                  <div style={{ color: DIM, fontSize: 13, marginBottom: 14 }}>No active projects yet.</div>
                  <Link href="/app/projects/new" style={{ display: 'inline-block', padding: '8px 18px', background: GOLD, color: '#000000', borderRadius: 7, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                    Create your first project
                  </Link>
                </div>
              )}
              {!projectsLoading && projects.slice(0, 3).map(proj => (
                <Link key={proj.id} href={`/app/projects/${proj.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: 10 }}>
                  <div style={{ padding: '14px 16px', background: DARK, borderRadius: 8, border: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'border-color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 2 }}>{proj.name}</div>
                        <div style={{ fontSize: 12, color: DIM }}>{proj.address}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: 'rgba(26,138,74,.15)', color: '#3dd68c', border: '1px solid rgba(26,138,74,.3)', height: 'fit-content', textTransform: 'uppercase' }}>
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
          </div>

          {/* Open RFIs */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Open RFIs</span>
              <Link href="/app/projects" style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>View Projects →</Link>
            </div>
            {rfisLoading && <><SkeletonRow /><SkeletonRow /></>}
            {!rfisLoading && openRFIs.length === 0 && (
              <div style={{ padding: '28px 18px', textAlign: 'center', color: DIM, fontSize: 13 }}>
                No open RFIs. Add projects to track RFIs here.
              </div>
            )}
            {!rfisLoading && openRFIs.length > 0 && (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: DARK }}>
                      {['RFI #', 'Subject', 'Status', 'Due'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openRFIs.slice(0, 8).map(rfi => {
                      const overdue = rfi.due_date && new Date(rfi.due_date) < new Date();
                      return (
                        <tr key={rfi.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '10px 14px', color: DIM }}>{rfi.rfi_number}</td>
                          <td style={{ padding: '10px 14px', color: TEXT, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rfi.subject}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(184,92,42,.15)', color: ORANGE, border: `1px solid rgba(184,92,42,.3)`, textTransform: 'uppercase' }}>
                              {rfi.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: overdue ? RED : DIM, fontWeight: overdue ? 700 : 400 }}>
                            {rfi.due_date ? new Date(rfi.due_date).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showScoreModal && <BidScoreModal onClose={() => setShowScoreModal(false)} />}
      {drillDown && <DrillDownPanel type={drillDown} onClose={() => setDrillDown(null)} />}
    </>
  );
}
