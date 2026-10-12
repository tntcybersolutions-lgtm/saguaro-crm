'use client';
/**
 * components/franchise/kit.tsx — shared UI for the Franchise Rollout suite.
 * One design language across Command Center, Long-Lead, Risk, Milestones, etc.
 */
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Circle } from '@phosphor-icons/react';
import { useFeature } from '@/lib/hooks/useEntitlements';
import type { Severity } from '@/lib/franchise';

export const C = {
  gold: '#FBBF24', green: '#4ADE80', yellow: '#FBBF24', red: '#F87171', blue: '#FBBF24',
  bg: '#0a0a0a', card: '#1B2636', border: 'rgba(255,255,255,0.12)', dim: 'var(--text-secondary)', text: '#FFFFFF', faint: 'var(--text-secondary)',
};
export const SEV_COLOR: Record<Severity, string> = { green: C.green, yellow: C.yellow, red: C.red };
export const font = "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString();
export const fmtMoneyShort = (n: number | null | undefined) => {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return '$' + Math.round(n).toLocaleString();
};
export const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  const t = Date.parse(String(s));
  return isNaN(t) ? '—' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};
export const fmtDays = (d: number | null | undefined) => {
  if (d == null) return '—';
  if (d === 0) return 'today';
  return d < 0 ? `${Math.abs(d)}d ago` : `in ${d}d`;
};

/* ── Fail-closed client gate ───────────────────────────────────────────
 * Call at the top of every franchise page (before the early return). Bounces
 * non-entitled users to /app even if they type the URL. The API routes are
 * ALSO gated server-side, so this is UX, not the security boundary. */
export function useFranchiseGate() {
  const router = useRouter();
  const { enabled, loading } = useFeature('command_center');
  useEffect(() => {
    if (!loading && !enabled) router.replace('/app');
  }, [loading, enabled, router]);
  return { ready: !loading && enabled, loading, enabled };
}

export function GateLoading() {
  return <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontFamily: font }}>Loading…</div>;
}

/* ── Pieces ────────────────────────────────────────────────────────── */

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px', letterSpacing: -0.4 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: C.dim, margin: 0 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Tile({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', minWidth: 120, flex: '1 1 130px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.dim }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || C.text, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function SevDot({ sev, size = 10 }: { sev: Severity; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: SEV_COLOR[sev], display: 'inline-block', boxShadow: `0 0 0 3px ${SEV_COLOR[sev]}22` }} />;
}

export function SevBadge({ sev, label }: { sev: Severity; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${SEV_COLOR[sev]}14`, color: SEV_COLOR[sev], fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      <SevDot sev={sev} size={7} />{label}
    </span>
  );
}

export function Chip({ active, color, onClick, children, count }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode; count?: number }) {
  const col = color || C.text;
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      border: `1px solid ${active ? col : C.border}`, background: active ? `color-mix(in srgb, ${col} 8%, transparent)` : C.card, color: active ? col : C.dim,
      display: 'inline-flex', alignItems: 'center', gap: 7,
    }}>
      {children}
      {count != null && <span style={{ opacity: 0.7 }}>{count}</span>}
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Search…'}
      style={{ marginLeft: 'auto', flex: '1 1 220px', maxWidth: 300, padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: C.card }} />
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div style={{ color: C.dim, padding: 48, textAlign: 'center', background: C.card, border: `1px dashed ${C.border}`, borderRadius: 14 }}>
      {icon && <div style={{ fontSize: 34, marginBottom: 8 }}>{icon}</div>}
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>{title}</div>
      {body && <div style={{ fontSize: 13, maxWidth: 460, margin: '0 auto 14px' }}>{body}</div>}
      {action}
    </div>
  );
}

export function AttentionBanner({ red, yellow, noun }: { red: number; yellow: number; noun: string }) {
  const n = red + yellow;
  if (n <= 0) return null;
  const hot = red > 0;
  return (
    <div style={{ background: hot ? 'rgba(248,113,113,0.08)' : 'rgba(255,149,0,0.08)', border: `1px solid ${hot ? 'rgba(248,113,113,0.25)' : 'rgba(255,149,0,0.25)'}`, borderRadius: 12, padding: '13px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
      <Circle size={18} weight="fill" color={hot ? C.red : C.yellow} />
      <span style={{ color: C.text }}>
        <b>{n}</b> {n === 1 ? `${noun} needs` : `${noun}s need`} attention
        {red > 0 && <> — <b style={{ color: C.red }}>{red} critical</b></>}. Handle these first.
      </span>
    </div>
  );
}

export function Metric({ label, value, color }: { label: React.ReactNode; value: React.ReactNode; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, color: C.faint }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: color || C.text, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

/** Standard hover-lift card shell used across the suite. */
export function LiftCard({ sev, children }: { sev?: Severity; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: sev ? `4px solid ${SEV_COLOR[sev]}` : `1px solid ${C.border}`, borderRadius: 14, padding: '15px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'box-shadow .15s, transform .15s', height: '100%' }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; }}>
      {children}
    </div>
  );
}
