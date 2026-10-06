'use client';
/**
 * Sage — Ask your project docs (keyword-retrieval RAG). Pick a project, ask in
 * plain English, get a cited answer grounded in the project's real records
 * (RFIs, submittals, daily logs, change orders, safety, meetings…). Calls
 * /api/sage/ask-docs which retrieves → re-ranks (lib/rag) → Claude answers.
 */
import { useEffect, useRef, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import { Sparkle, PaperPlaneRight, FileText, CaretRight, Question, GearSix } from '@phosphor-icons/react';
import { Aurora, PremiumFX, ModuleHero, SectionCard, StatStrip, goldButtonStyle } from '@/components/ui/premium';
import SageSettings from '@/components/SageSettings';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)', BLUE = 'var(--brand-primary-strong)';
const TYPE_LABEL: Record<string, string> = { rfi: 'RFI', change_order: 'Change Order', daily_log: 'Daily Log', inspection: 'Inspection', safety: 'Safety', punch: 'Punch List', submittal: 'Submittal', meeting: 'Meeting', correspondence: 'Correspondence', observation: 'Observation', tm: 'T&M Ticket', field_issue: 'Field Issue' };
const EXAMPLES = ['What tile is specified in the lobby?', 'Any open RFIs about the footing rebar?', 'What did the latest daily log say about weather?', 'Were there any safety incidents this month?', 'What change orders affect the schedule?'];

interface Citation { n: number; source: string; sourceType: string; recordId?: string; route?: string }
interface Turn { q: string; answer: string; citations: Citation[]; searched: number }

export default function AskDocsPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [err, setErr] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { projects: liveProjects } = useProjects();
  useEffect(() => { const ps = liveProjects; setProjects(ps); if (ps[0]) setProjectId((prev) => prev || ps[0].id); }, [liveProjects]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  const ask = async (question?: string) => {
    const query = (question ?? q).trim();
    if (!query) return;
    if (!projectId) { setErr('Pick a project first.'); return; }
    setErr(''); setBusy(true); setQ('');
    try {
      const r = await fetch('/api/sage/ask-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, question: query }) });
      const d = await r.json();
      if (d.error) { setErr(d.error); setBusy(false); return; }
      setTurns((t) => [...t, { q: query, answer: d.answer || '', citations: d.citations || [], searched: d.searched || 0 }]);
    } catch (e) { console.error(e); setErr(humanError(e, 'Something went wrong. Please try again.')); }
    setBusy(false);
  };

  const inp: React.CSSProperties = { background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, padding: '12px 14px', fontSize: 15, width: '100%' };

  return (
    // Inline premium surface (not the kit's PremiumSurface wrapper) — that wrapper sets
    // overflow:hidden, which would break the sticky composer. Aurora clips itself.
    <div className="pmRoot" style={{ position: 'relative', background: DARK, color: TEXT, minHeight: '100vh', fontFamily: 'system-ui,Segoe UI,sans-serif' }}>
      <PremiumFX />
      <Aurora soft />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: '34px 22px 40px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <ModuleHero
          eyebrow="Sage Intelligence"
          eyebrowIcon={<Sparkle size={13} weight="fill" color={GOLD} />}
          title="Ask Your"
          accent="Project Docs"
          subtitle="Answers from this project's records, with every source cited."
          style={{ marginBottom: 16 }}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inp, width: 'auto', padding: '9px 11px', fontSize: 14 }}>
                {projects.length === 0 ? <option value="">No projects yet</option> : projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                onClick={() => setShowSettings(true)}
                title="Sage settings — style profile, automation rules, activity trail, bid brain"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand-primary-08)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', borderRadius: 10, color: GOLD, padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                <GearSix size={15} weight="bold" /> Sage Settings
              </button>
            </div>
          }
        />
        {showSettings && <SageSettings onClose={() => setShowSettings(false)} />}

        {/* Live session intelligence — what Sage can reach and what it has done */}
        {projects.length > 0 && (
          <StatStrip items={[
            {href: '/app/ask',  label: 'Projects', value: String(projects.length), sub: 'Searchable right now' },
            {href: '/app/ask',  label: 'Doc Types', value: String(Object.keys(TYPE_LABEL).length), sub: 'RFIs to T&M tickets' },
            {href: '/app/ask',  label: 'Questions Asked', value: String(turns.length), sub: 'This session' },
            {href: '/app/ask',  label: 'Records Searched', value: String(turns.reduce((s, t) => s + t.searched, 0)), sub: 'Across your questions' },
            {href: '/app/ask',  label: 'Sources Cited', value: String(turns.reduce((s, t) => s + t.citations.length, 0)), accent: turns.some((t) => t.citations.length > 0) ? GOLD : undefined, sub: 'Every answer grounded' },
          ]} />
        )}

        <div style={{ flex: 1, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {turns.length === 0 && !busy && (
            <SectionCard title="Try Asking" subtitle="One tap runs the question against this project's records" icon={<Question size={17} weight="duotone" color={GOLD} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{EXAMPLES.map((ex) => <button key={ex} onClick={() => ask(ex)} className="pmBtn" style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', color: TEXT, cursor: 'pointer', fontSize: 14 }}><Question size={16} color={GOLD} />{ex}</button>)}</div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontWeight: 700, marginBottom: 8 }}>Sage Reads</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.values(TYPE_LABEL).map((t) => <span key={t} style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--brand-primary-08)', border: '1px solid var(--brand-primary-25)', color: DIM, fontSize: 11.5 }}>{t}</span>)}
                </div>
                <div style={{ color: DIM, fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>Answers cite the exact records they came from — click a citation to open it. If the records do not contain the answer, Sage says so instead of guessing.</div>
              </div>
            </SectionCard>
          )}
          {turns.map((t, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><div style={{ background: 'var(--brand-primary-12)', color: TEXT, borderRadius: '14px 14px 4px 14px', padding: '10px 14px', maxWidth: '80%', fontSize: 15 }}>{t.q}</div></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--brand-primary-12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkle size={16} weight="fill" color={GOLD} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: '14px 14px 14px 4px', padding: '12px 14px', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.answer}</div>
                  {t.citations.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {t.citations.map((c) => <a key={c.n} href={c.route || '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', color: DIM, textDecoration: 'none', fontSize: 12.5 }}><span style={{ color: GOLD, fontWeight: 800 }}>{c.n}</span><FileText size={13} color={BLUE} /><span style={{ color: TEXT }}>{c.source}</span><span style={{ color: DIM }}>· {TYPE_LABEL[c.sourceType] || c.sourceType}</span><CaretRight size={11} /></a>)}
                    </div>
                  )}
                  <div style={{ color: DIM, fontSize: 11.5, marginTop: 6 }}>Searched {t.searched} matching record{t.searched === 1 ? '' : 's'} in this project.</div>
                </div>
              </div>
            </div>
          ))}
          {busy && <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: DIM, fontSize: 14 }}><div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--brand-primary-12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkle size={16} weight="fill" color={GOLD} /></div>Reading the project records…</div>}
          <div ref={endRef} />
        </div>

        {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ position: 'sticky', bottom: 0, background: DARK, paddingTop: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && ask()} placeholder="Ask anything about this project…" style={inp} />
            <button onClick={() => ask()} disabled={busy || !q.trim()} className="pmBtn" style={{ ...goldButtonStyle, padding: '0 18px', cursor: busy ? 'default' : 'pointer', opacity: busy || !q.trim() ? 0.6 : 1 }}><PaperPlaneRight size={20} weight="fill" /></button>
          </div>
          <div style={{ color: DIM, fontSize: 11, marginTop: 6, textAlign: 'center' }}>Grounded in your records only — Sage cites its sources and won’t invent answers.</div>
        </div>
      </div>
    </div>
  );
}
