'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEMO_PROJECT, DEMO_PAY_APPS, DEMO_RFIS, DEMO_AUTOPILOT_ALERTS, DEMO_SUBS } from '../../demo-data';

const GOLD  = '#D4A017';
const DARK  = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM   = '#8fa3c0';
const TEXT  = '#e8edf8';
const GREEN = '#1a8a4a';
const RED   = '#c03030';
const BLUE  = '#1a5fa8';
const ORANGE = '#B85C2A';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface DashStats {
  activeProjects: number;
  openBids: number;
  pendingPayApps: number;
  totalContractValue: number;
  monthlyRevenue: number;
}

interface TodayItem {
  type: 'pay-app' | 'insurance' | 'rfi' | 'compliance';
  title: string;
  subtitle: string;
  urgency: 'high' | 'medium' | 'low';
  actionUrl: string;
  actionLabel: string;
}

interface ScoreResult {
  score: number;
  recommendation: string;
  reasoning: string;
  suggestedMargin: number;
}

/* ─── KPI Card ────────────────────────────────────────────────────────── */
function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: DIM, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? TEXT, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>{sub}</div>}
    </div>
  );
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
const TYPE_META: Record<TodayItem['type'], { icon: string; borderColor: string; label: string }> = {
  'pay-app':   { icon: '💰', borderColor: GOLD,    label: 'Pay App' },
  'insurance': { icon: '🛡️', borderColor: RED,     label: 'Insurance' },
  'rfi':       { icon: '📋', borderColor: ORANGE,  label: 'RFI' },
  'compliance':{ icon: '✅', borderColor: '#2a6db8', label: 'Compliance' },
};

const URGENCY_COLOR: Record<TodayItem['urgency'], string> = {
  high:   RED,
  medium: ORANGE,
  low:    DIM,
};

function TodayActionCard({ item }: { item: TodayItem }) {
  const meta = TYPE_META[item.type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      borderBottom: `1px solid ${BORDER}`,
      borderLeft: `4px solid ${meta.borderColor}`,
      background: 'transparent',
      transition: 'background .15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.025)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{meta.icon}</span>
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
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/bids/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: form.projectName,
          estValue: parseFloat(form.estValue.replace(/[^0-9.]/g, '')),
          trade: form.trade,
          location: form.location,
          targetMargin: parseFloat(form.targetMargin),
        }),
      });
      if (!res.ok) throw new Error('Failed to score bid');
      const data = await res.json();
      setResult(data);
    } catch {
      setError('Unable to reach scoring engine. Please try again.');
    }
    setLoading(false);
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  const scoreColor = result
    ? result.score >= 70 ? GREEN : result.score >= 45 ? ORANGE : RED
    : TEXT;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>🎯 Score a Bid</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>AI-powered bid scoring and recommendation</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {!result ? (
            <form onSubmit={handleSubmit}>
              {[
                { label: 'Project Name', field: 'projectName' as const, placeholder: 'e.g. Tempe Office Complex' },
                { label: 'Estimated Value ($)', field: 'estValue' as const, placeholder: 'e.g. 2,500,000' },
                { label: 'Trade / Scope', field: 'trade' as const, placeholder: 'e.g. General Contractor, Electrical' },
                { label: 'Location', field: 'location' as const, placeholder: 'e.g. Phoenix, AZ' },
                { label: 'Our Target Margin (%)', field: 'targetMargin' as const, placeholder: 'e.g. 8.5' },
              ].map(({ label, field, placeholder }) => (
                <div key={field} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>{label}</label>
                  <input
                    value={form[field]}
                    onChange={f(field)}
                    placeholder={placeholder}
                    required
                    style={{ width: '100%', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '9px 12px', color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = GOLD)}
                    onBlur={e => (e.target.style.borderColor = BORDER)}
                  />
                </div>
              ))}
              {error && <div style={{ color: RED, fontSize: 12, marginBottom: 12 }}>{error}</div>}
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '11px', background: loading ? 'rgba(212,160,23,.4)' : GOLD, border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
              >
                {loading ? 'Analyzing...' : 'Score This Bid →'}
              </button>
            </form>
          ) : (
            <div>
              {/* Score Badge */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: DARK, border: `2px solid ${scoreColor}`, borderRadius: 14, padding: '18px 32px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Bid Score</div>
                  <div style={{ fontSize: 52, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{result.score}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>out of 100</div>
                </div>
              </div>
              {/* Recommendation */}
              <div style={{ background: DARK, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>Recommendation</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>{result.recommendation}</div>
              </div>
              {/* Reasoning */}
              <div style={{ background: DARK, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>Reasoning</div>
                <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{result.reasoning}</div>
              </div>
              {/* Suggested Margin */}
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

/* ─── Main Dashboard ─────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [todayItems, setTodayItems] = useState<TodayItem[] | null>(null);
  const [showScoreModal, setShowScoreModal] = useState(false);

  const proj = DEMO_PROJECT;
  const alerts = DEMO_AUTOPILOT_ALERTS;

  const formatCurrency = (n: number) => '$' + n.toLocaleString();

  // Fetch dashboard stats (real data with demo fallback)
  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => setStats({
        activeProjects: 1,
        openBids: 3,
        pendingPayApps: 1,
        totalContractValue: 2_850_000,
        monthlyRevenue: 257_400,
      }));
  }, []);

  // Fetch today priority actions
  useEffect(() => {
    fetch('/api/dashboard/today')
      .then(r => r.json())
      .then(data => setTodayItems(data.items ?? []))
      .catch(() => setTodayItems(null));
  }, []);

  const activeProjects = stats?.activeProjects ?? 1;
  const openBids       = stats?.openBids ?? 3;
  const pendingPayApps = stats?.pendingPayApps ?? 1;
  const totalContract  = stats?.totalContractValue ?? 2_850_000;

  return (
    <>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes skeletonPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: .35; }
        }
        .skeleton-pulse { animation: skeletonPulse 1.4s ease-in-out infinite; }
      `}</style>

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Portfolio Overview</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '4px 0', color: TEXT }}>Good morning, Chad 👋</h1>
            <div style={{ fontSize: 14, color: DIM }}>Here's what needs your attention today.</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/app/projects/new" style={{ padding: '10px 18px', background: GOLD, color: '#0d1117', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              + New Project
            </Link>
            <button
              onClick={() => setShowScoreModal(true)}
              style={{ padding: '10px 18px', background: 'rgba(212,160,23,.12)', color: GOLD, border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              🎯 Score a Bid
            </button>
          </div>
        </div>

        {/* Autopilot Alerts */}
        {alerts.length > 0 && (
          <div style={{ background: 'rgba(192,48,48,.08)', border: '1px solid rgba(192,48,48,.25)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>🤖</span>
              <span style={{ fontWeight: 800, color: TEXT, fontSize: 14 }}>Autopilot — {alerts.length} Alert{alerts.length > 1 ? 's' : ''} Need Attention</span>
              <Link href="/app/autopilot" style={{ marginLeft: 'auto', fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 700 }}>View All →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.slice(0, 3).map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(0,0,0,.2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: a.severity === 'critical' ? '#c03030' : a.severity === 'high' ? '#B85C2A' : '#856d00', color: '#fff', textTransform: 'uppercase' }}>
                    {a.severity}
                  </span>
                  <span style={{ fontSize: 13, color: TEXT, flex: 1 }}>{a.title}</span>
                  <span style={{ fontSize: 12, color: DIM, maxWidth: 300 }}>{a.summary.slice(0, 60)}…</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
          <KPI label="Active Projects"      value={String(activeProjects)}           sub={`${activeProjects} in progress`}    color={GOLD} />
          <KPI label="Total Contract Value" value={formatCurrency(totalContract)}     sub="+$45K change orders" />
          <KPI label="Billed to Date"       value={formatCurrency(428_500)}           sub="14.8% complete" />
          <KPI label="Open RFIs"            value="2"                                 sub="1 urgent — blocking"                color={RED} />
          <KPI label="Win Rate (30 days)"   value="67%"                               sub={`${openBids} bids open`}           color={GREEN} />
        </div>

        {/* ── Today's Priority Actions ──────────────────────────────────── */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Today's Priority Actions</span>
              <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Items requiring your attention</div>
            </div>
            {todayItems && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'rgba(192,48,48,.15)', color: RED, border: '1px solid rgba(192,48,48,.3)' }}>
                {todayItems.filter(i => i.urgency === 'high').length} urgent
              </span>
            )}
          </div>

          {/* Loading skeletons */}
          {todayItems === null && (
            <div>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}

          {/* Loaded items */}
          {todayItems !== null && todayItems.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: DIM, fontSize: 13 }}>
              ✅ All caught up — no urgent items right now.
            </div>
          )}

          {todayItems !== null && todayItems.map((item, i) => (
            <TodayActionCard key={i} item={item} />
          ))}
        </div>

        {/* Main 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>

          {/* Active Projects */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Active Projects</span>
              <Link href="/app/projects" style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>All Projects →</Link>
            </div>
            <div style={{ padding: 16 }}>
              <Link href={`/app/projects/${DEMO_PROJECT.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ padding: '14px 16px', background: '#0d1117', borderRadius: 8, border: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'border-color .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 2 }}>{proj.name}</div>
                      <div style={{ fontSize: 12, color: DIM }}>{proj.address}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: 'rgba(26,138,74,.15)', color: '#3dd68c', border: '1px solid rgba(26,138,74,.3)', height: 'fit-content' }}>ACTIVE</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DIM, marginBottom: 4 }}>
                      <span>Progress</span><span>14.8% — {formatCurrency(428_500)} billed</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: '14.8%', background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 3 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span style={{ color: DIM }}>Contract: <strong style={{ color: TEXT }}>{formatCurrency(proj.contract_amount)}</strong></span>
                    <span style={{ color: DIM }}>Start: <strong style={{ color: TEXT }}>Jan 15, 2026</strong></span>
                    <span style={{ color: DIM }}>Sub: <strong style={{ color: TEXT }}>Sep 30, 2026</strong></span>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent RFIs */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Open RFIs</span>
              <Link href={`/app/projects/${DEMO_PROJECT.id}/rfis`} style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>View All →</Link>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0d1117' }}>
                  {['RFI #','Title','Status','Due'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: DIM, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_RFIS.filter(r => r.status !== 'closed').map(rfi => (
                  <tr key={rfi.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                    <td style={{ padding: '10px 12px', color: GOLD, fontWeight: 700 }}>{rfi.number}</td>
                    <td style={{ padding: '10px 12px', color: TEXT, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rfi.title}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: rfi.status === 'open' ? 'rgba(212,160,23,.15)' : 'rgba(26,95,168,.15)', color: rfi.status === 'open' ? GOLD : '#4a9de8' }}>
                        {rfi.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: rfi.response_due_date && new Date(rfi.response_due_date) < new Date() ? RED : DIM }}>
                      {rfi.response_due_date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        {/* Subcontractor Compliance */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Subcontractor Compliance</span>
            <span style={{ fontSize: 12, color: DIM }}>6 subs on active project</span>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0d1117' }}>
                {['Subcontractor','Trade','Contract Value','COI','W-9','Status'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: DIM, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_SUBS.map(sub => (
                <tr key={sub.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: TEXT }}>{sub.name}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{sub.trade}</td>
                  <td style={{ padding: '10px 14px', color: TEXT }}>${sub.contract_amount.toLocaleString()}</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ color: '#3dd68c' }}>✓ Active</span></td>
                  <td style={{ padding: '10px 14px' }}><span style={{ color: '#3dd68c' }}>✓ On file</span></td>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(26,138,74,.15)', color: '#3dd68c', fontWeight: 700 }}>COMPLIANT</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

      </div>

      {/* Bid Score Modal */}
      {showScoreModal && <BidScoreModal onClose={() => setShowScoreModal(false)} />}
    </>
  );
}
