'use client';
/**
 * Cost Catalog — the GC's learning rates. Edit unit costs (manual) or press
 * "Learn from my jobs" to compute quantity-weighted rates from past takeoffs.
 * These override the book everywhere the takeoff engine prices.
 */
import { useEffect, useState } from 'react';
import { Sparkle, PencilSimple, CheckCircle, Coins, BookOpen } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, goldButtonStyle } from '@/components/ui/premium';

const PANEL = 'var(--bg-surface)', LINE = 'rgba(255,255,255,0.09)', GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-secondary)', DIM = 'var(--text-tertiary)', GREEN = 'var(--success)', BLUE = 'var(--brand-primary-strong)';
type Row = { cost_key: string; unit: string; note: string; bookCents: number; ownCents: number | null; source: string | null; samples: number };

export default function CostCatalogPage() {
  const [list, setList] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/takeoff/cost-rates').then((r) => r.json()).then((d) => setList(d.list || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const saveRate = async (k: string) => {
    const dollars = parseFloat(edit[k]); if (!(dollars >= 0)) return;
    await fetch('/api/takeoff/cost-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costKey: k, materialCents: Math.round(dollars * 100) }) });
    setEdit((e) => { const n = { ...e }; delete n[k]; return n; }); load();
  };
  const revert = async (k: string) => { await fetch(`/api/takeoff/cost-rates?costKey=${k}`, { method: 'DELETE' }); load(); };
  const learn = async () => {
    setBusy(true); setMsg('Learning from your past takeoffs…');
    const d = await fetch('/api/takeoff/cost-rates/learn', { method: 'POST' }).then((r) => r.json());
    setMsg(d.error ? `Error: ${d.error}` : d.learned ? `✓ Learned ${d.learned} rates from ${d.fromLines} historical line items${d.skippedManual ? ` (kept ${d.skippedManual} manual)` : ''}` : (d.message || 'No history yet.'));
    setBusy(false); load();
  };
  const money = (c: number) => '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inp: React.CSSProperties = { background: 'var(--bg-surface-2)', border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, padding: '6px 8px', width: 90, fontSize: 13 };
  const learnedCount = list.filter((r) => r.source === 'learned').length, manualCount = list.filter((r) => r.source === 'manual').length;
  const bookCount = list.length - learnedCount - manualCount;

  const isError = msg.startsWith('Error');
  const isDone = msg.startsWith('✓');

  return (
    <PremiumSurface maxWidth={1040}>
      {/* Header */}
      <ModuleHero
        eyebrow="Learning Cost Database"
        eyebrowIcon={<Sparkle size={13} weight="fill" color={GOLD} />}
        title="Your Cost"
        accent="Catalog"
        subtitle={<>Your rates override the book everywhere the takeoff prices — so every estimate reflects <b style={{ color: TEXT }}>your</b> real numbers.</>}
        actions={
          <button onClick={learn} disabled={busy} className="pmBtn" style={{ ...goldButtonStyle, padding: '11px 22px', fontSize: 14.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.85 : 1 }}>
            {busy ? 'Learning…' : <><Sparkle size={16} weight="fill" color="var(--on-brand)" /> Learn from My Jobs</>}
          </button>
        }
      />

      {/* Learn status banner */}
      {msg && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20,
          padding: '9px 15px', borderRadius: 10, fontSize: 13,
          background: isDone ? 'rgba(52,211,153,0.10)' : isError ? 'rgba(255,59,48,0.10)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isDone ? 'rgba(52,211,153,0.3)' : isError ? 'rgba(255,59,48,0.3)' : LINE}`,
          color: isDone ? GREEN : isError ? 'var(--danger)' : DIM,
        }}>
          {isDone && <CheckCircle size={15} weight="fill" color={GREEN} />}
          {msg.replace(/^✓ /, '')}
        </div>
      )}

      {/* Source breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={<Sparkle size={19} weight="duotone" color={GREEN} />} label="Learned" value={String(learnedCount)} accent={GREEN} sub="Computed from your jobs" delay={0.02}  href="/app/takeoff/rates"/>
        <StatCard icon={<PencilSimple size={19} weight="duotone" color={BLUE} />} label="Manual" value={String(manualCount)} accent={BLUE} sub="Rates you set" delay={0.06}  href="/app/takeoff/rates"/>
        <StatCard icon={<BookOpen size={19} weight="duotone" color={GOLD} />} label="On Book" value={String(bookCount)} sub="Default book rates" delay={0.10}  href="/app/takeoff/rates"/>
      </div>

      {/* Rates table */}
      <SectionCard title="Cost Rates" subtitle="Effective unit cost applied by the takeoff engine" icon={<Coins size={17} weight="duotone" color={GOLD} />} flush>
        {/* Column header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 1fr', background: PANEL, padding: '10px 20px', fontSize: 11, color: DIM, fontWeight: 700}}>
          <span>Item</span><span>Book</span><span>Your Rate</span><span>Source</span>
        </div>
        {list.length === 0 ? (
          <PremiumEmpty
            compact
            icon={<Coins size={30} weight="duotone" color={GOLD} />}
            title="No cost rates yet"
            description="Press “Learn from My Jobs” to compute quantity-weighted rates from your past takeoffs, or edit any rate manually."
          />
        ) : list.map((r) => {
          const eff = r.ownCents ?? r.bookCents;
          const editing = edit[r.cost_key] != null;
          return (
            <div key={r.cost_key} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 1fr', padding: '10px 20px', borderTop: `1px solid ${LINE}`, alignItems: 'center', fontSize: 13.5 }}>
              <span><b style={{ fontWeight: 600, color: TEXT }}>{r.cost_key}</b> <span style={{ color: DIM, fontSize: 12 }}>/{r.unit} {r.note ? `· ${r.note}` : ''}</span></span>
              <span style={{ color: DIM }}>{money(r.bookCents)}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {editing ? (
                  <>
                    <input value={edit[r.cost_key]} onChange={(e) => setEdit((x) => ({ ...x, [r.cost_key]: e.target.value }))} style={inp} autoFocus />
                    <button onClick={() => saveRate(r.cost_key)} style={{ background: GREEN, color: 'var(--bg-base)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Save</button>
                  </>
                ) : (
                  <>
                    <span style={{ color: r.ownCents != null ? (r.source === 'learned' ? GREEN : BLUE) : TEXT, fontWeight: r.ownCents != null ? 700 : 400 }}>{money(eff)}</span>
                    <button onClick={() => setEdit((x) => ({ ...x, [r.cost_key]: (eff / 100).toFixed(2) }))} style={{ background: 'transparent', color: DIM, border: `1px solid ${LINE}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                    {r.ownCents != null && <button onClick={() => revert(r.cost_key)} style={{ background: 'transparent', color: DIM, border: 'none', cursor: 'pointer', fontSize: 11 }}>Revert</button>}
                  </>
                )}
              </span>
              <span>{r.source === 'learned' ? <span style={{ color: GREEN, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Sparkle size={12} weight="fill" color={GREEN} /> Learned ({r.samples})</span> : r.source === 'manual' ? <span style={{ color: BLUE, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><PencilSimple size={12} weight="fill" color={BLUE} /> Manual</span> : <span style={{ color: DIM, fontSize: 12 }}>Book</span>}</span>
            </div>
          );
        })}
      </SectionCard>
    </PremiumSurface>
  );
}
