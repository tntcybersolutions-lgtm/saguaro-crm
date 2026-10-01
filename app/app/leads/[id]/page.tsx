'use client';
/*
 * app/app/leads/[id] — the deal page (MUST-PASS Path 12, SALES-PLAN Phase 1).
 *
 * Until now every lead was a modal on the board: there was no URL you could
 * send someone, and no place to actually WORK a deal — move it through the
 * stages, log a call, see its history. This is that page. Its spine is the
 * stage button bar: one tap advances (or rewinds) the deal, writes through the
 * one PATCH /api/leads/[id] that normalises stage casing (Path 10), and stamps
 * won_at / lost_at so the board, the sales overview and the journey signal — all
 * reading one aggregation now (Path 14) — agree the instant the stage changes.
 * When a deal reaches Won it offers the handoff that opens the job (Path 13).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/errors';
import { fmtDate as fmtDateSafe } from '@/lib/format-date';
import { LEAD_STAGES } from '@/lib/lead-stages';

/* Tokens match app/app/leads/page.tsx so the deal page and the board read as
   one surface. */
const GOLD = '#F59E0B', BG = '#1c1c1e', RAISED = '#141416';
const BORDER = 'rgba(255,255,255,0.12)', TEXT = '#FFFFFF', DIM = '#CBD5E1';
const GREEN = '#22C55E', RED = '#EF4444', AMBER = '#F59E0B', PURPLE = '#8B5CF6';

const STAGE_COLORS: Record<string, string> = {
  New: '#3B82F6', Contacted: PURPLE, Qualified: AMBER, Proposal: GOLD,
  Negotiation: '#F97316', Won: GREEN, Lost: RED,
};
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const;
const ACTIVITY_LABELS: Record<string, string> = { call: 'Phone Call', email: 'Email', meeting: 'Meeting', note: 'Note' };

type Lead = {
  id: string; company_name: string | null; contact_name: string | null;
  email: string | null; phone: string | null; source: string | null;
  stage: string | null; estimated_value: number | string | null;
  probability: number | string | null; project_type: string | null;
  location: string | null; notes: string | null; next_action: string | null;
  next_action_date: string | null; assigned_to: string | null;
  won_at: string | null; lost_at: string | null;
  project_id: string | null; customer_id: string | null;
  created_at: string | null; updated_at: string | null;
};
type Activity = {
  id: string; lead_id: string; activity_type: string; description: string;
  scheduled_at: string | null; created_at: string;
};

const fmt = (n: unknown) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d: string | null) => (d ? fmtDateSafe(d) : '—');

const card: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
};
const labelS: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: 0.3, textTransform: 'uppercase' };
const inputS: React.CSSProperties = {
  padding: '9px 13px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
  color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btn = (bg: string, c = '#000'): React.CSSProperties => ({
  padding: '9px 18px', background: bg, color: c, border: 'none', borderRadius: 8,
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
});

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const [actType, setActType] = useState<string>('call');
  const [actDesc, setActDesc] = useState('');
  const [actSaving, setActSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lr, ar] = await Promise.all([
        fetch(`/api/leads/${id}`),
        fetch(`/api/leads/${id}/activities`),
      ]);
      if (lr.status === 404) { setError('This deal could not be found.'); setLead(null); return; }
      if (!lr.ok) throw new Error((await lr.json().catch(() => ({}))).error || 'Could not load the deal');
      const lj = await lr.json();
      setLead(lj.lead as Lead);
      // Activities are secondary — a failed log must not blank the deal.
      if (ar.ok) { const aj = await ar.json(); setActivities((aj.activities || []) as Activity[]); }
      else setActivities([]);
    } catch (e) {
      setError(humanError(e, 'Could not load the deal.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /* The spine: move the deal to a stage. One PATCH, which normalises casing;
     won_at / lost_at are stamped here so every pipeline reader agrees at once. */
  const moveStage = useCallback(async (stage: string) => {
    if (!lead || stage === lead.stage || savingStage) return;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      stage,
      won_at: stage === 'Won' ? now : null,
      lost_at: stage === 'Lost' ? now : null,
    };
    const prev = lead;
    setSavingStage(stage);
    setLead({ ...lead, stage, won_at: patch.won_at as string | null, lost_at: patch.lost_at as string | null });
    try {
      const r = await fetch(`/api/leads/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not move the deal');
      const j = await r.json();
      setLead(j.lead as Lead);
      showToast(`Moved to ${stage}.`, 'success');
    } catch (e) {
      setLead(prev); // roll the optimistic move back
      showToast(humanError(e, 'Could not move the deal.'), 'error');
    } finally {
      setSavingStage(null);
    }
  }, [lead, id, savingStage, showToast]);

  const addActivity = useCallback(async () => {
    if (!actDesc.trim() || actSaving) return;
    setActSaving(true);
    try {
      const r = await fetch(`/api/leads/${id}/activities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: actType, description: actDesc.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not add the activity');
      const j = await r.json();
      setActivities((a) => [j.activity as Activity, ...a]);
      setActDesc('');
      showToast('Activity logged.', 'success');
    } catch (e) {
      showToast(humanError(e, 'Could not add the activity.'), 'error');
    } finally {
      setActSaving(false);
    }
  }, [actDesc, actType, actSaving, id, showToast]);

  /* Won → open the job (Path 13). Idempotent server-side; we follow nextUrl. */
  const convert = useCallback(async () => {
    if (!lead || converting) return;
    setConverting(true);
    try {
      const r = await fetch(`/api/leads/${id}/convert`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not open the job');
      showToast(j.alreadyConverted ? 'Opening the existing job…' : 'Job created — opening it…', 'success');
      if (j.nextUrl) router.push(j.nextUrl as string);
    } catch (e) {
      showToast(humanError(e, 'Could not open the job.'), 'error');
    } finally {
      setConverting(false);
    }
  }, [lead, id, converting, router, showToast]);

  const back = (
    <button onClick={() => router.push('/app/leads')} style={{ ...btn('transparent', DIM), border: `1px solid ${BORDER}`, marginBottom: 18 }}>
      ← Back to pipeline
    </button>
  );

  if (loading) {
    return <div style={{ padding: '28px 32px', color: DIM }}>{back}Loading deal…</div>;
  }
  if (error || !lead) {
    return (
      <div style={{ padding: '28px 32px', color: TEXT }}>
        {back}
        <div style={{ ...card, borderColor: RED }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Deal unavailable</div>
          <div style={{ color: DIM, fontSize: 13 }}>{error || 'This deal could not be found.'}</div>
        </div>
      </div>
    );
  }

  const stageColor = STAGE_COLORS[lead.stage || ''] || DIM;
  const isWon = lead.stage === 'Won';

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto', color: TEXT }}>
      {back}

      {/* Header */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{lead.company_name || 'Untitled deal'}</div>
            <div style={{ color: DIM, fontSize: 14, marginTop: 2 }}>
              {lead.contact_name || 'No contact'}{lead.project_type ? ` · ${lead.project_type}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: GOLD }}>{fmt(lead.estimated_value)}</div>
            <span style={{ display: 'inline-block', marginTop: 6, padding: '3px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800, background: `${stageColor}22`, color: stageColor }}>
              {lead.stage || 'Unstaged'}
            </span>
          </div>
        </div>
      </div>

      {/* Stage button bar — the Path 12 spine */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ ...labelS, marginBottom: 10 }}>Move this deal</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LEAD_STAGES.map((s) => {
            const active = lead.stage === s;
            const c = STAGE_COLORS[s] || DIM;
            return (
              <button
                key={s}
                onClick={() => moveStage(s)}
                disabled={!!savingStage || active}
                aria-current={active ? 'step' : undefined}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: active || savingStage ? 'default' : 'pointer',
                  background: active ? c : 'transparent',
                  color: active ? '#000' : c,
                  border: `1px solid ${active ? c : BORDER}`,
                  opacity: savingStage && savingStage !== s ? 0.5 : 1,
                }}
              >
                {savingStage === s ? 'Saving…' : s}
              </button>
            );
          })}
        </div>

        {/* Win → job handoff (Path 13) */}
        {isWon && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {lead.project_id ? (
              <>
                <span style={{ color: GREEN, fontWeight: 700, fontSize: 13 }}>✓ This deal is open as a job.</span>
                <button onClick={() => router.push(`/app/projects/${lead.project_id}`)} style={btn(GREEN)}>View the job →</button>
              </>
            ) : (
              <>
                <span style={{ color: DIM, fontSize: 13 }}>Won — ready to become a project.</span>
                <button onClick={convert} disabled={converting} style={btn(GREEN)}>
                  {converting ? 'Opening…' : 'Open the job →'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        {/* Details */}
        <div style={card}>
          <div style={{ ...labelS, marginBottom: 12 }}>Details</div>
          {([
            ['Contact', lead.contact_name],
            ['Email', lead.email],
            ['Phone', lead.phone],
            ['Source', lead.source],
            ['Location', lead.location],
            ['Probability', lead.probability != null ? `${Number(lead.probability)}%` : null],
            ['Next action', lead.next_action],
            ['Next action date', lead.next_action_date ? fmtDate(lead.next_action_date) : null],
            ['Created', lead.created_at ? fmtDate(lead.created_at) : null],
          ] as [string, string | null][]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: DIM, fontSize: 13 }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{v || '—'}</span>
            </div>
          ))}
          {lead.notes && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...labelS, marginBottom: 6 }}>Notes</div>
              <div style={{ color: DIM, fontSize: 13, whiteSpace: 'pre-wrap' }}>{lead.notes}</div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div style={card}>
          <div style={{ ...labelS, marginBottom: 12 }}>Activity</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={actType} onChange={(e) => setActType(e.target.value)} style={{ ...inputS, width: 140, cursor: 'pointer', appearance: 'auto' }}>
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>)}
            </select>
            <input
              value={actDesc}
              onChange={(e) => setActDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addActivity(); }}
              placeholder="Log a call, email, or note…"
              style={inputS}
            />
            <button onClick={addActivity} disabled={actSaving || !actDesc.trim()} style={btn(GOLD)}>
              {actSaving ? '…' : 'Add'}
            </button>
          </div>
          {activities.length === 0 ? (
            <div style={{ color: DIM, fontSize: 13, padding: '12px 0' }}>No activity yet. The first call or note shows up here.</div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {activities.map((a) => (
                <div key={a.id} style={{ padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>{ACTIVITY_LABELS[a.activity_type] || a.activity_type}</span>
                    <span style={{ fontSize: 11, color: DIM }}>{fmtDate(a.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: TEXT, marginTop: 3, whiteSpace: 'pre-wrap' }}>{a.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
