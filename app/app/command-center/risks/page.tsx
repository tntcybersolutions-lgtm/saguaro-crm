'use client';
import { useMemo, useState } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useRisks, createRisk } from '@/lib/hooks/useFranchise';
import { computeRisk, SEVERITY_ORDER, type Severity } from '@/lib/franchise';
import { ShieldWarning, Plus } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatStrip, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import {
  C, font, fmtDate, useFranchiseGate, GateLoading,
  SevDot, SevBadge, Chip, SearchInput, EmptyState, AttentionBanner, Metric, LiftCard,
} from '@/components/franchise/kit';

const SEV_LABEL: Record<Severity, string> = { red: 'Critical', yellow: 'At Risk', green: 'Low' };

export default function RisksPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { risks: raw, loading } = useRisks();
  const { projects } = useProjects();
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const list = ((raw as any[]) || []).map((it) => ({ it, h: computeRisk(it) }));
    // Worst-first, then by descending exposure score.
    list.sort((a, b) =>
      SEVERITY_ORDER[a.h.severity] - SEVERITY_ORDER[b.h.severity] ||
      (b.h.score ?? -1) - (a.h.score ?? -1));
    return list;
  }, [raw]);

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, open: 0, overdue: 0, unowned: 0, total: rows.length };
    rows.forEach(({ it, h }) => {
      s[h.severity]++;
      if (h.isOpen) s.open++;
      if (h.isOpen && it.due_date && Date.parse(String(it.due_date)) < Date.now()) s.overdue++;
      if (h.isOpen && !it.owner) s.unowned++;
    });
    return s;
  }, [rows]);

  const filtered = rows.filter(({ it, h }) =>
    (filter === 'all' || h.severity === filter) &&
    (!q || `${it.risk_title || ''} ${it.project_name || ''} ${it.owner || ''} ${it.risk_category || ''}`.toLowerCase().includes(q.toLowerCase())));

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Portfolio Exposure"
        eyebrowIcon={<ShieldWarning size={13} weight="fill" color="var(--text-secondary)" />}
        title="Risk"
        accent="Register"
        subtitle="Every risk across all sites, ranked by exposure."
        actions={
          <button onClick={() => setAdding((v) => !v)} className="pmBtn" style={adding ? ghostButtonStyle : goldButtonStyle}>
            {adding ? 'Close' : <><Plus size={15} weight="bold" /> Add Risk</>}
          </button>
        }
      />

      {adding && <AddRiskForm projects={projects} onDone={() => setAdding(false)} />}

      {/* Register pulse — where the exposure sits and what needs an owner or a date */}
      <StatStrip items={[
        {href: '/app/command-center/risks',  label: 'Total Risks', value: String(summary.total), sub: `${summary.open} open` },
        {href: '/app/command-center/risks',  label: 'Critical / High', value: String(summary.red), accent: summary.red > 0 ? C.red : undefined, sub: 'Attack these first' },
        {href: '/app/command-center/risks',  label: 'Medium', value: String(summary.yellow), accent: summary.yellow > 0 ? C.yellow : undefined, sub: 'Review weekly' },
        {href: '/app/command-center/risks',  label: 'Low', value: String(summary.green), accent: C.green, sub: 'Monitor' },
        {href: '/app/command-center/risks',  label: 'Past Due', value: String(summary.overdue), accent: summary.overdue > 0 ? C.red : undefined, sub: 'Mitigation date blown' },
        {href: '/app/command-center/risks',  label: 'No Owner', value: String(summary.unowned), accent: summary.unowned > 0 ? C.yellow : undefined, sub: 'Assign accountability' },
      ]} />

      <AttentionBanner red={summary.red} yellow={summary.yellow} noun="risk" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {(['all', 'red', 'yellow', 'green'] as const).map((f) => (
          <Chip key={f} active={filter === f} color={f === 'all' ? C.text : ({ red: C.red, yellow: C.yellow, green: C.green } as any)[f]}
            onClick={() => setFilter(f)} count={f === 'all' ? summary.total : (summary as any)[f]}>
            {f !== 'all' && <SevDot sev={f as Severity} size={8} />}
            {f === 'all' ? 'All' : SEV_LABEL[f as Severity]}
          </Chip>
        ))}
        <SearchInput value={q} onChange={setQ} placeholder="Search risk, site, owner…" />
      </div>

      {loading ? (
        <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading risks…</div>
      ) : filtered.length === 0 ? (
        rows.length === 0 ? (
          <PremiumEmpty icon={<ShieldWarning size={34} weight="duotone" color="var(--text-secondary)" />} title="No risks logged yet"
            description="Capture what could derail each site — permitting delays, weather, long-lead gaps, design churn. The register scores every risk by likelihood × impact, ranks the portfolio worst-first, and rolls the counts up to the Command Center and KPI dashboard automatically."
            action={<button onClick={() => setAdding(true)} className="pmBtn" style={goldButtonStyle}><Plus size={15} weight="bold" /> Log Your First Risk</button>} />
        ) : (
          <EmptyState title="Nothing matches this filter" />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtered.map(({ it, h }) => {
            const overdue = !!it.due_date && h.isOpen && Date.parse(String(it.due_date)) < Date.now();
            return (
              <LiftCard key={it.id} sev={h.severity}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.risk_title || 'Untitled Risk'}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      {it.project_id ? (
                        <Link href={`/app/projects/${it.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{it.project_name || 'Project'}</Link>
                      ) : 'Unassigned'}
                      {it.project_city ? ` · ${it.project_city}, ${it.project_state}` : ''}
                    </div>
                  </div>
                  <SevBadge sev={h.severity} label={h.band} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 13 }}>
                  <Metric label="Score" value={h.score != null ? `${h.score}${h.likelihood != null && h.impact != null ? ` (${h.likelihood}×${h.impact})` : ''}` : '—'} color={h.severity === 'red' ? C.red : h.severity === 'yellow' ? C.yellow : C.text} />
                  <Metric label="Category" value={it.risk_category || '—'} />
                  <Metric label="Owner" value={it.owner || '—'} />
                  <Metric label="Due" value={fmtDate(it.due_date)} color={overdue ? C.red : C.text} />
                  <Metric label="Status" value={it.status || '—'} color={h.isOpen ? C.text : C.dim} />
                </div>

                {it.mitigation_plan && (
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 12, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    <span style={{ fontWeight: 700, color: C.faint }}>Mitigation: </span>{it.mitigation_plan}
                  </div>
                )}
              </LiftCard>
            );
          })}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}

function AddRiskForm({ projects, onDone }: { projects: any[]; onDone: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ status: 'open' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', background: 'var(--bg-surface-2)', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.project_id || !f.risk_title) { setErr('Site and risk title are required.'); return; }
    setBusy(true); setErr('');
    try { await createRisk(f); onDone(); }
    catch (e: any) { setErr(e?.message || "Couldn't save the risk. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Log a Risk</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Risk Title *</label>
          <input style={inp} placeholder="e.g. Utility transformer lead time slipping" value={f.risk_title || ''} onChange={(e) => set('risk_title', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Site *</label>
          <select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">Select site…</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Category</label>
          <select style={inp} value={f.risk_category || ''} onChange={(e) => set('risk_category', e.target.value)}>
            <option value="">Select…</option>
            {['Schedule', 'Cost', 'Safety', 'Quality', 'Procurement', 'Permitting', 'Weather', 'Design', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Likelihood</label>
          <select style={inp} value={f.likelihood || ''} onChange={(e) => set('likelihood', e.target.value)}>
            <option value="">Select…</option>
            {['Low', 'Medium', 'High'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Impact</label>
          <select style={inp} value={f.impact || ''} onChange={(e) => set('impact', e.target.value)}>
            <option value="">Select…</option>
            {['Low', 'Medium', 'High'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Owner</label><input style={inp} placeholder="Accountable person" value={f.owner || ''} onChange={(e) => set('owner', e.target.value)} /></div>
        <div><label style={lbl}>Due Date</label><SaguaroDatePicker style={inp} value={f.due_date || ''} onChange={(v) => set('due_date', v)} /></div>
        <div>
          <label style={lbl}>Status</label>
          <select style={inp} value={f.status || 'open'} onChange={(e) => set('status', e.target.value)}>
            {['open', 'mitigating', 'monitoring', 'closed'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Mitigation Plan</label>
          <textarea style={{ ...inp, minHeight: 64, resize: 'vertical', fontFamily: font }} placeholder="How the team will reduce or absorb this risk…" value={f.mitigation_plan || ''} onChange={(e) => set('mitigation_plan', e.target.value)} />
        </div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={submit} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: busy ? C.dim : C.gold, color: 'var(--on-brand)', fontWeight: 800, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Saving…' : 'Save Risk'}</button>
        <button onClick={onDone} style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'var(--bg-surface-2)', color: C.dim, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}
