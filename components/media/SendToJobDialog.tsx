'use client';
/**
 * Send a photo or video to another job — the job's Photos page viewer opens
 * this from the selected item's actions. Pick the job, Send; the item moves
 * (POST /api/media/move) and leaves this job's gallery. The file itself is not
 * re-uploaded, so it is instant.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PaperPlaneTilt, X } from '@phosphor-icons/react';

export type MoveItem = { kind: 'photo' | 'file'; id: string };
type Job = { id: string; name: string };

const CSS = `
.stj { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(4,5,7,0.72); }
.stjBox { width: min(460px, 100%); border-radius: 16px; border: 1px solid var(--border-default); background: var(--bg-solid-2); color: var(--text-primary); padding: 18px; display: grid; gap: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.6); }
.stjHead { display: flex; align-items: flex-start; gap: 12px; }
.stjHead h2 { margin: 0; font-size: 18px; font-weight: 800; }
.stjHead p { margin: 4px 0 0; font-size: 13px; color: var(--text-tertiary); }
.stjX { margin-left: auto; width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.04); color: var(--text-primary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.stj label { font-size: 13px; font-weight: 800; color: var(--brand-primary); }
.stj select { width: 100%; min-height: 48px; margin-top: 6px; padding: 0 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent); background: var(--bg-solid); color: var(--text-primary); font: inherit; font-size: 16px; font-weight: 700; }
.stjErr { color: var(--c-red); font-size: 13.5px; }
.stjFoot { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.stjBtn { min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.04); color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.stjBtn[data-primary] { border: none; background: var(--brand-primary); color: var(--on-brand); }
.stjBtn:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 640px) { .stj { align-items: flex-end; padding: 0; } .stjBox { border-radius: 20px 20px 0 0; padding-bottom: max(18px, env(safe-area-inset-bottom)); } }
`;

export default function SendToJobDialog({ open, items, fromProjectId, what, onClose, onSent }: {
  open: boolean;
  items: MoveItem[];
  fromProjectId: string;
  /** "this photo" / "this video" */
  what: string;
  onClose: () => void;
  onSent: (jobName: string) => void;
}) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (jobs) return;
    let alive = true;
    fetch('/api/projects?limit=200&fields=id,name', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((j) => {
        if (!alive) return;
        const list = ((j?.projects || []) as Job[]).filter((p) => p?.id && p.name && p.id !== fromProjectId);
        setJobs(list);
        setTo(list[0]?.id || '');
      })
      .catch(() => { if (alive) setJobs([]); });
    return () => { alive = false; };
  }, [open, jobs, fromProjectId]);

  if (!open || typeof document === 'undefined') return null;

  const send = async () => {
    if (!to || busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/media/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: to, items }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Couldn't send it. Try again.");
      onSent(j?.project?.name || jobs?.find((x) => x.id === to)?.name || 'the job');
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="stj" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="stjBox" role="dialog" aria-modal="true" aria-label="Send to another job" data-no-guard="">
        <div className="stjHead">
          <div>
            <h2>Send to another job</h2>
            <p>Moves {what} to the job you pick. Nothing re-uploads.</p>
          </div>
          <button type="button" className="stjX" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} weight="bold" /></button>
        </div>
        <div>
          <label htmlFor="stj-job">Send to</label>
          <select id="stj-job" value={to} onChange={(e) => setTo(e.target.value)} disabled={!jobs || !jobs.length}>
            {!jobs && <option value="">Loading jobs…</option>}
            {jobs && !jobs.length && <option value="">No other jobs</option>}
            {jobs?.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </div>
        {err && <div className="stjErr" role="alert">{err}</div>}
        <div className="stjFoot">
          <button type="button" className="stjBtn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="stjBtn" data-primary="" onClick={send} disabled={!to || busy}>
            <PaperPlaneTilt size={16} weight="bold" /> {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
