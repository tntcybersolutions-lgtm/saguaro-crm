'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check } from '@phosphor-icons/react';

const C = {
  gold: 'var(--brand-primary)', green: '#2CFF7A', yellow: '#FF8A00', red: '#FF3B30', blue: 'var(--brand-primary)',
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'rgba(255,255,255,0.12)', dim: '#CBD5E1', text: '#FFFFFF', faint: '#8094B0',
};
const font = "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const STATUS = { green: { c: C.green, l: 'On Track' }, yellow: { c: C.yellow, l: 'In Progress' }, red: { c: C.red, l: 'Needs Attention' } } as const;
const fmtDate = (s: any) => { if (!s) return '—'; const t = Date.parse(String(s)); return isNaN(t) ? '—' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const fmtMoney = (n: any) => n == null ? '—' : '$' + Math.round(n).toLocaleString();
const BUDGET = { 'on-budget': { c: C.green, l: 'On Budget' }, watch: { c: C.yellow, l: 'Watch' }, 'over-budget': { c: C.red, l: 'Trending Over' } } as const;

export default function FranchisePortalPage() {
  const params = useParams();
  const token = String((params as any)?.token || '');
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    fetch(`/api/franchise/portal/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { if (live) { setData(d); setState('ok'); } })
      .catch((e) => { if (live) setState(String(e.message) === '404' || String(e.message) === '410' ? 'notfound' : 'error'); });
    return () => { live = false; };
  }, [token]);

  if (state === 'loading') return <Shell><div style={{ padding: 60, textAlign: 'center', color: C.dim }}>Loading…</div></Shell>;
  if (state === 'notfound') return <Shell><Center title="Portal Not Available" body="This owner link is no longer active. Please contact your Saguaro Control Systems coordinator for an updated link." /></Shell>;
  if (state === 'error') return <Shell><Center title="Something Went Wrong" body="Please try again in a moment." /></Shell>;

  const p = data.project; const st = STATUS[(p.status as keyof typeof STATUS)] || STATUS.yellow;
  const bud = BUDGET[(p.budgetStatus as keyof typeof BUDGET)] || BUDGET['on-budget'];

  return (
    <Shell>
      {/* Hero */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `5px solid ${st.c}`, borderRadius: 16, padding: '26px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>Owner Portal{data.owner?.company ? ` · ${data.owner.company}` : ''}</div>
            <h1 style={{ fontSize: 30, fontWeight: 900, margin: '6px 0 4px', letterSpacing: -0.5 }}>{p.name}</h1>
            <div style={{ fontSize: 14, color: C.dim }}>{[p.city, p.state].filter(Boolean).join(', ') || ''}{p.stage ? ` · ${p.stage}` : ''}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${st.c}18`, color: st.c, fontWeight: 800, fontSize: 14, padding: '8px 16px', borderRadius: 999 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: st.c }} />{st.l}
          </span>
        </div>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.dim, marginBottom: 6 }}>
            <span>Overall Progress</span><span style={{ fontWeight: 800, color: C.text }}>{p.percentComplete != null ? `${Math.round(p.percentComplete)}%` : '—'}</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: '#1c1c1e', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, p.percentComplete || 0))}%`, background: st.c, borderRadius: 5 }} />
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 16 }}>
        <Tile label="Target Completion" value={fmtDate(p.targetDate)} />
        <Tile label="Contract Value" value={fmtMoney(p.contractValue)} />
        <Tile label="Budget" value={bud.l} color={bud.c} />
        <Tile label="Items Being Managed" value={p.openItems ?? 0} />
      </div>

      {/* Milestones */}
      <Section title="What's Next">
        {data.milestones?.next?.length ? data.milestones.next.map((m: any, i: number) => (
          <Row key={i} left={m.title} right={fmtDate(m.date)} />
        )) : <Empty>No upcoming milestones scheduled.</Empty>}
      </Section>

      {data.milestones?.recentlyCompleted?.length > 0 && (
        <Section title="Recently Completed">
          {data.milestones.recentlyCompleted.map((m: any, i: number) => (
            <Row key={i} left={<span><Check size={13} weight="bold" style={{ verticalAlign: 'middle' }} /> {m.title}</span>} right={fmtDate(m.date)} color={C.green} />
          ))}
        </Section>
      )}

      {data.verifications?.length > 0 && (
        <Section title="Verified On-Site">
          {data.verifications.map((v: any, i: number) => (
            <Row key={i} left={<span><Check size={13} weight="bold" style={{ verticalAlign: 'middle' }} /> {v.title}</span>} right={fmtDate(v.verified_at)} color={C.green} />
          ))}
        </Section>
      )}

      <div style={{ textAlign: 'center', marginTop: 30, fontSize: 12, color: C.faint, lineHeight: 1.7 }}>
        Prepared by <b style={{ color: C.dim }}>Saguaro Control Systems</b><br />
        Control Every Project. Deliver Every Promise.
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: font, color: C.text, padding: '32px 16px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>{children}</div>
    </div>
  );
}
function Center({ title, body }: { title: string; body: string }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 14, color: C.dim, maxWidth: 420, margin: '0 auto' }}>{body}</div>
  </div>;
}
function Tile({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.dim }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 900, color: color || C.text, marginTop: 4 }}>{value}</div>
  </div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginTop: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: C.dim, marginBottom: 12 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>;
}
function Row({ left, right, color }: { left: React.ReactNode; right: React.ReactNode; color?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
    <span style={{ color: color || C.text, fontWeight: 600 }}>{left}</span><span style={{ color: C.dim, whiteSpace: 'nowrap' }}>{right}</span>
  </div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: C.faint }}>{children}</div>;
}
