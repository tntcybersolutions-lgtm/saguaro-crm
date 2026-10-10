'use client';
/**
 * The GC's compliance checklist: every sub on a portal link, their COI and
 * W-9 — current, expiring, expired or missing — and an "Ask for it" button
 * that drops a message in the sub's portal naming exactly what's needed.
 * Real data (GET /api/sub-portal/compliance); asking writes and reloads.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { PaperPlaneTilt, ShieldCheck } from '@phosphor-icons/react';
import { StatusPill } from '@/components/ui/Status';
import { PremiumEmpty } from '@/components/ui/premium';
import { humanError } from '@/lib/errors';
import { LOCAL_DAY_HEADER, localDay } from '@/lib/calendar-day';
import { DOC_LABEL, type DocCheck, type RequiredDoc } from '@/lib/compliance-ask';

interface SubRow { subId: string; company: string; jobs: Array<{ id: string; name: string }>; checks: DocCheck[]; lastAsked: Partial<Record<RequiredDoc, string>>; needs: number }

const CSS = `
.ccl { display: grid; gap: 12px; min-width: 0; }
.ccl-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.ccl-head b { font-size: 16px; }
.ccl-sub { font-size: 13px; color: var(--text-secondary); }
.ccl-card { border: 1px solid var(--border-default); background: var(--bg-surface); border-radius: 14px; padding: 14px; display: grid; gap: 10px; min-width: 0; }
.ccl-card[data-needs="true"] { border-color: color-mix(in srgb, var(--warning) 40%, transparent); }
.ccl-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border-subtle); }
.ccl-row:first-of-type { border-top: 0; }
.ccl-doc { display: grid; gap: 2px; min-width: 0; }
.ccl-doc b { font-size: 14.5px; }
.ccl-btn { min-height: 44px; padding: 0 16px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px; }
.ccl-btn[data-kind="go"] { background: var(--brand-primary); color: var(--on-brand); border-color: transparent; }
.ccl-btn:disabled { opacity: .55; cursor: default; }
.ccl-ok { font-size: 13px; color: var(--success); font-weight: 700; }
.ccl-err { font-size: 13px; color: var(--c-red); font-weight: 700; }
.ccl-toggle { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-secondary); cursor: pointer; }
.ccl-toggle input { width: 20px; height: 20px; accent-color: var(--brand-primary); }
`;

const fmtDay = (ymd: string | null) => {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ymd;
};
const ago = (iso?: string) => {
  if (!iso) return '';
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function pill(c: DocCheck) {
  if (c.state === 'current') return <StatusPill module="compliance" status="compliant" label={c.expiry ? `Current · to ${fmtDay(c.expiry)}` : 'On file'} size="sm" />;
  if (c.state === 'expiring') return <StatusPill module="compliance" status="at_risk" label={c.days === 0 ? 'Expires today' : `Expires ${fmtDay(c.expiry)}`} size="sm" />;
  if (c.state === 'expired') return <StatusPill module="compliance" status="non_compliant" label={`Expired ${fmtDay(c.expiry)}`} size="sm" />;
  return <StatusPill module="compliance" status="non_compliant" label="Missing" size="sm" />;
}

export default function ComplianceChecklist() {
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [error, setError] = useState('');
  const [onlyNeeds, setOnlyNeeds] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok?: string; err?: string }>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/sub-portal/compliance', { headers: { [LOCAL_DAY_HEADER]: localDay() } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't load your subs' compliance.");
      setSubs(j.subs || []); setError('');
    } catch (e) { setError(humanError(e, "Couldn't load your subs' compliance.")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ask = async (s: SubRow, docs?: RequiredDoc[]) => {
    const key = `${s.subId}:${docs?.join(',') || 'all'}`;
    setBusy(key); setNotes((n) => ({ ...n, [s.subId]: {} }));
    try {
      const r = await fetch('/api/sub-portal/compliance', {
        method: 'POST', headers: { 'Content-Type': 'application/json', [LOCAL_DAY_HEADER]: localDay() },
        body: JSON.stringify({ subId: s.subId, ...(docs ? { docs } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't send the request.");
      const what = (j.asked as RequiredDoc[]).map((d) => DOC_LABEL[d]).join(' and ');
      setNotes((n) => ({ ...n, [s.subId]: { ok: `Asked ${s.company} for the ${what} — it's in their portal${j.jobs > 1 ? ` on ${j.jobs} jobs` : ''}.` } }));
      await load();
    } catch (e) {
      setNotes((n) => ({ ...n, [s.subId]: { err: humanError(e, "Couldn't send the request.") } }));
    } finally { setBusy(null); }
  };

  if (error && !subs) return <div className="ccl-card" role="alert"><span className="ccl-err">{error}</span><button className="ccl-btn" onClick={() => void load()}>Retry</button></div>;
  if (!subs) return <div className="ccl-card" aria-busy="true">Checking your subs&apos; paperwork…</div>;

  const shown = onlyNeeds ? subs.filter((s) => s.needs > 0) : subs;
  const needing = subs.filter((s) => s.needs > 0).length;
  return (
    <section className="ccl" aria-label="Compliance checklist">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ccl-head">
        <div><b>Paperwork by sub</b><div className="ccl-sub">{needing ? `${needing} of ${subs.length} sub${subs.length === 1 ? '' : 's'} owe you a COI or W-9` : subs.length ? 'Every sub is current' : 'No subs on a portal link yet'}</div></div>
        {subs.length > 0 && <label className="ccl-toggle"><input type="checkbox" checked={onlyNeeds} onChange={(e) => setOnlyNeeds(e.target.checked)} /> Only subs who owe something</label>}
      </div>
      {shown.length === 0 && (
        <PremiumEmpty compact icon={<ShieldCheck size={30} weight="duotone" />} title={subs.length ? 'Everyone is current' : 'No subs on a portal link yet'}
          description={subs.length ? 'Every sub on a portal link has a current COI and W-9 on file.' : 'Invite a sub to a job and their COI and W-9 show here.'} />
      )}
      {shown.map((s) => {
        const owed = s.checks.filter((c) => c.state !== 'current');
        const fresh = (d: RequiredDoc) => !!s.lastAsked[d] && Date.now() - Date.parse(s.lastAsked[d]!) < COOLDOWN_MS;
        const askable = owed.filter((c) => !fresh(c.doc));
        return (
          <article key={s.subId} className="ccl-card" data-needs={s.needs > 0}>
            <div className="ccl-head">
              <div style={{ minWidth: 0 }}><b>{s.company}</b><div className="ccl-sub">{s.jobs.map((j) => j.name).join(' · ') || 'No job'}</div></div>
              {askable.length > 1 && (
                <button type="button" className="ccl-btn" data-kind="go" disabled={!!busy} onClick={() => void ask(s, askable.map((c) => c.doc))}>
                  <PaperPlaneTilt size={16} weight="bold" /> {busy === `${s.subId}:${askable.map((c) => c.doc).join(',')}` ? 'Asking…' : 'Ask for both'}
                </button>
              )}
            </div>
            {s.checks.map((c) => (
              <div key={c.doc} className="ccl-row">
                <div className="ccl-doc">
                  <b>{DOC_LABEL[c.doc]}</b>
                  <div>{pill(c)}</div>
                  {s.lastAsked[c.doc] && <span className="ccl-sub">Asked {ago(s.lastAsked[c.doc])}</span>}
                </div>
                {c.state !== 'current' && (
                  <button type="button" className="ccl-btn" data-kind={fresh(c.doc) ? undefined : 'go'} disabled={!!busy || fresh(c.doc)}
                    title={fresh(c.doc) ? 'Asked in the last day — give them time' : undefined} onClick={() => void ask(s, [c.doc])}>
                    <PaperPlaneTilt size={16} weight="bold" /> {busy === `${s.subId}:${c.doc}` ? 'Asking…' : fresh(c.doc) ? 'Asked' : 'Ask for it'}
                  </button>
                )}
              </div>
            ))}
            {notes[s.subId]?.ok && <div className="ccl-ok" role="status">{notes[s.subId].ok}</div>}
            {notes[s.subId]?.err && <div className="ccl-err" role="alert">{notes[s.subId].err}</div>}
          </article>
        );
      })}
    </section>
  );
}
