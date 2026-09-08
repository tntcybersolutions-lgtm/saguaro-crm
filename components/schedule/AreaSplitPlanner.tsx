'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SquaresFour, ArrowsInLineVertical, ArrowRight, Check, Warning,
  CaretDown, CaretRight, ArrowCounterClockwise, Buildings,
} from '@phosphor-icons/react';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';

type AreaStyle = 'zone' | 'level' | 'area' | 'building' | 'phase';

interface Piece {
  id: string; name: string; area: string; areaIndex: number;
  duration: number; startDate: string | null; endDate: string | null; wbs: string | null;
}
interface Plan {
  taskId: string; taskName: string; originalDuration: number; pieces: Piece[]; reason: string;
}
interface Impact {
  score: { before: number; after: number };
  longTasks: { before: number; after: number };
  finishToStart: { before: number; after: number };
  lagged: { before: number; after: number };
  finish: { before: string | null; after: string | null };
}
interface Proposal {
  plans: Plan[];
  skipped: { taskId: string; taskName: string; reason: string }[];
  newRelationships: number;
  taktLinks: number;
  impact: Impact;
  existing: string[];
}

const STYLES: { id: AreaStyle; label: string; hint: string }[] = [
  { id: 'zone', label: 'Zones', hint: 'Zone A, B, C — a warehouse or a floor plate split by grid' },
  { id: 'level', label: 'Levels', hint: 'Level 1, 2, 3 — anything that stacks' },
  { id: 'building', label: 'Buildings', hint: 'Building A, B — a campus or a phased site' },
  { id: 'area', label: 'Areas', hint: 'Area 1, 2, 3 — when nothing else fits' },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const daysBetween = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000) : 0;

/**
 * Breaking whole-building activities into areas that sequence finish-to-start.
 *
 * The screen exists because three of the DCMA findings on a typical schedule
 * have one cause and no relationship-level cure. "Structural Steel Erection, 55
 * working days" covers the whole building, so it necessarily overlaps every
 * other whole-building activity, so the only logic writable between them is
 * start-to-start with a large lag. Editing those relationships one at a time
 * cannot fix it — the task list is too coarse to carry logic at all.
 *
 * It is also the honest answer to "how is the steel going". Against a
 * whole-building task the answer is "about half", and half of the steel is not
 * a place. Against zones it is: A is done, B is framing, C has not started.
 *
 * Nothing here is applied until somebody chooses it. The proposal shows what
 * the split costs and what it buys, measured — including the thing worth the
 * most, which is that the trades stop waiting for each other's last zone.
 */
export default function AreaSplitPlanner({
  projectId, onApplied,
}: {
  projectId: string;
  onApplied?: () => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [areaCount, setAreaCount] = useState(0);
  const [style, setStyle] = useState<AreaStyle>('zone');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async (count: number, s: AreaStyle) => {
    setLoading(true); setError('');
    try {
      const q = count >= 2 ? `?areaCount=${count}&areaStyle=${s}` : '';
      const r = await fetch(`/api/projects/${projectId}/schedule/split${q}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Could not work out the area breakdown');
      setProposal(j);
      setChosen(new Set(j.plans.map((p: Plan) => p.taskId)));
      if (count < 2 && j.plans.length) setAreaCount(j.plans[0].pieces.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not work out the area breakdown');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(0, 'zone'); }, [load]);

  const apply = async () => {
    if (chosen.size === 0) return;
    setBusy(true); setError(''); setNote('');
    try {
      const r = await fetch(`/api/projects/${projectId}/schedule/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: [...chosen], areaCount, areaStyle: style }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Could not apply the split');
      setNote(`${j.split} task${j.split === 1 ? '' : 's'} split into ${j.pieces} areas · schedule now scores ${j.score}`);
      onApplied?.();
      await load(areaCount, style);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the split');
    } finally {
      setBusy(false);
    }
  };

  const undo = async (parentId: string) => {
    setBusy(true); setError(''); setNote('');
    try {
      const r = await fetch(`/api/projects/${projectId}/schedule/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge: parentId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Could not undo the split');
      setNote(`Put back together from ${j.removed} areas.`);
      onApplied?.();
      await load(areaCount, style);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo the split');
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => {
    const plans = (proposal?.plans ?? []).filter((p) => chosen.has(p.taskId));
    return {
      tasks: plans.length,
      pieces: plans.reduce((a, p) => a + p.pieces.length, 0),
      links: plans.reduce((a, p) => a + p.pieces.length - 1, 0),
      longest: plans.length ? Math.max(...plans.flatMap((p) => p.pieces.map((x) => x.duration))) : 0,
    };
  }, [proposal, chosen]);

  const card: React.CSSProperties = {
    background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden',
  };

  if (loading && !proposal) {
    return <div style={{ ...card, padding: 18, fontSize: 12.5, color: DIM }}>Working out how this schedule comes apart…</div>;
  }

  const pulled = proposal ? daysBetween(proposal.impact.finish.before, proposal.impact.finish.after) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {error && (
        <div style={{ background: 'rgba(224,100,78,.09)', border: `1px solid ${RED}55`, borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: TEXT, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Warning size={15} weight="fill" color={RED} style={{ flexShrink: 0 }} />{error}
        </div>
      )}
      {note && (
        <div style={{ background: 'rgba(69,179,125,.09)', border: `1px solid ${GREEN}55`, borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: TEXT, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Check size={15} weight="bold" color={GREEN} style={{ flexShrink: 0 }} />{note}
        </div>
      )}

      {/* Splits already in place, and the way back out of them. */}
      {proposal && proposal.existing.length > 0 && (
        <div style={{ ...card, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <SquaresFour size={16} weight="duotone" color={GREEN} />
          <div style={{ fontSize: 12.5, color: TEXT, fontWeight: 600 }}>
            {proposal.existing.length} task{proposal.existing.length === 1 ? '' : 's'} already broken into areas
          </div>
          <div style={{ fontSize: 11, color: DIM, flex: 1, minWidth: 200 }}>
            A split is a judgement about the job, and judgements get reversed.
          </div>
          {proposal.existing.map((id) => (
            <button key={id} onClick={() => void undo(id)} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid ' + BORDER, borderRadius: 7, padding: '5px 9px', fontSize: 11, color: DIM, cursor: busy ? 'default' : 'pointer' }}>
              <ArrowCounterClockwise size={12} weight="bold" /> Undo
            </button>
          ))}
        </div>
      )}

      {proposal && proposal.plans.length === 0 ? (
        <div style={{ ...card, padding: 18, fontSize: 12.5, color: DIM, lineHeight: 1.65 }}>
          <strong style={{ color: GREEN }}>Nothing here is too coarse to schedule.</strong> Every task is short
          enough to sequence finish-to-start and short enough that &ldquo;how is it going&rdquo; has an answer
          more precise than &ldquo;about half&rdquo;.
          {proposal.skipped.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid ' + BORDER, fontSize: 11.5 }}>
              {proposal.skipped.length} long task{proposal.skipped.length === 1 ? ' was' : 's were'} left alone:{' '}
              {proposal.skipped.map((s) => s.taskName).join(', ')} — {proposal.skipped[0].reason}
            </div>
          )}
        </div>
      ) : proposal && (
        <>
          {/* How the building comes apart. */}
          <div style={{ ...card, padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
              <Buildings size={16} weight="duotone" color={GOLD} />
              <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>How the building comes apart</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>
                one breakdown for the whole job
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.6, marginBottom: 12 }}>
              Every trade walks the same areas — that is what lets the deck crew follow the steel crew one
              zone behind instead of waiting for all of it. Two trades split into two different sets of
              zones would be working in two different buildings.
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {STYLES.map((s) => (
                <button key={s.id} title={s.hint}
                  onClick={() => { setStyle(s.id); void load(areaCount, s.id); }}
                  style={{
                    background: style === s.id ? 'rgba(245,158,11,.14)' : 'transparent',
                    border: '1px solid ' + (style === s.id ? GOLD : BORDER),
                    borderRadius: 8, padding: '6px 12px', fontSize: 12,
                    color: style === s.id ? GOLD : DIM, fontWeight: style === s.id ? 700 : 500, cursor: 'pointer',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: DIM }}>Split into</span>
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} onClick={() => { setAreaCount(n); void load(n, style); }}
                  style={{
                    width: 34, height: 30, borderRadius: 8,
                    background: areaCount === n ? 'rgba(245,158,11,.14)' : 'transparent',
                    border: '1px solid ' + (areaCount === n ? GOLD : BORDER),
                    color: areaCount === n ? GOLD : DIM, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {n}
                </button>
              ))}
              <span style={{ fontSize: 11.5, color: DIM }}>
                {STYLES.find((s) => s.id === style)?.label.toLowerCase()}
                {totals.longest > 0 && <> · longest piece {totals.longest} working days</>}
              </span>
            </div>
          </div>

          {/* What it buys, measured. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Finish-to-start', before: `${proposal.impact.finishToStart.before}%`, after: `${proposal.impact.finishToStart.after}%`, good: proposal.impact.finishToStart.after >= 90, sub: 'DCMA wants 90%' },
              { label: 'Too long to track', before: proposal.impact.longTasks.before, after: proposal.impact.longTasks.after, good: proposal.impact.longTasks.after === 0, sub: 'over 44 working days' },
              { label: 'Lagged links', before: proposal.impact.lagged.before, after: proposal.impact.lagged.after, good: proposal.impact.lagged.after < proposal.impact.lagged.before, sub: 'DCMA wants under 5%' },
              { label: 'Quality score', before: proposal.impact.score.before, after: proposal.impact.score.after, good: proposal.impact.score.after >= proposal.impact.score.before, sub: 'DCMA 14-point' },
            ].map((s) => (
              <div key={s.label} style={{ ...card, flex: '1 1 165px', padding: '10px 13px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 4 }}>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,.35)', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>{s.before}</span>
                  <ArrowRight size={11} weight="bold" color={DIM} />
                  <span style={{ fontSize: 19, fontWeight: 800, color: s.good ? GREEN : AMBER, fontVariantNumeric: 'tabular-nums' }}>{s.after}</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* The takt result — the thing neither Procore nor Buildern will tell you. */}
          {proposal.taktLinks > 0 && (
            <div style={{ ...card, borderColor: `${GOLD}55`, padding: '13px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <ArrowsInLineVertical size={16} weight="duotone" color={GOLD} />
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>The trades start flowing</div>
              </div>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.65 }}>
                <strong style={{ color: TEXT }}>{proposal.taktLinks} takt links</strong> — where one trade
                follows another through the same areas, each zone waits on the zone in front of it rather
                than on the whole activity. The deck crew starts as soon as the steel in Zone A is done.
                {pulled > 0 && (
                  <> That pulls the finish in by <strong style={{ color: GOLD }}>{pulled} days</strong>, to{' '}
                    {fmtDate(proposal.impact.finish.after)} — compression that was always available and had
                    no way of being seen.</>
                )}
              </div>
            </div>
          )}

          {/* The plans themselves. */}
          <div style={card}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
              <SquaresFour size={16} weight="duotone" color={GOLD} />
              <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>
                {proposal.plans.length} task{proposal.plans.length === 1 ? '' : 's'} too coarse to sequence
              </div>
              <button
                onClick={() => setChosen(chosen.size === proposal.plans.length ? new Set() : new Set(proposal.plans.map((p) => p.taskId)))}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 11, color: GOLD, cursor: 'pointer', fontWeight: 600 }}>
                {chosen.size === proposal.plans.length ? 'Clear all' : 'Select all'}
              </button>
            </div>

            <div style={{ maxHeight: 380, overflow: 'auto' }}>
              {proposal.plans.map((p, i) => {
                const on = chosen.has(p.taskId);
                const expanded = open === p.taskId;
                return (
                  <div key={p.taskId} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px' }}>
                      <input type="checkbox" checked={on}
                        onChange={() => {
                          const next = new Set(chosen);
                          if (on) next.delete(p.taskId); else next.add(p.taskId);
                          setChosen(next);
                        }}
                        style={{ width: 15, height: 15, accentColor: GOLD, cursor: 'pointer', flexShrink: 0 }} />
                      <button onClick={() => setOpen(expanded ? null : p.taskId)}
                        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, textAlign: 'left' }}>
                        {expanded ? <CaretDown size={11} color={DIM} /> : <CaretRight size={11} color={DIM} />}
                        <span style={{ fontSize: 12.5, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.taskName}
                        </span>
                      </button>
                      <span style={{ fontSize: 11.5, color: AMBER, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {p.originalDuration}d
                      </span>
                      <ArrowRight size={11} weight="bold" color={DIM} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: GREEN, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {p.pieces.map((x) => x.duration).join(' + ')}
                      </span>
                    </div>

                    {expanded && (
                      <div style={{ padding: '2px 16px 12px 41px' }}>
                        <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.6, marginBottom: 9 }}>{p.reason}</div>
                        {p.pieces.map((x, j) => (
                          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', fontSize: 11.5 }}>
                            <span style={{ width: 26, color: 'rgba(255,255,255,.3)', fontVariantNumeric: 'tabular-nums' }}>{x.wbs ?? j + 1}</span>
                            <span style={{ width: 7, height: 7, borderRadius: 99, background: GOLD, flexShrink: 0 }} />
                            <span style={{ color: TEXT, minWidth: 0, flex: 1 }}>{x.area}</span>
                            <span style={{ color: DIM, whiteSpace: 'nowrap' }}>
                              {fmtDate(x.startDate)} → {fmtDate(x.endDate)}
                            </span>
                            <span style={{ color: GREEN, fontWeight: 700, width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{x.duration}d</span>
                            {j > 0 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', width: 46 }}>FS from {p.pieces[j - 1].area}</span>}
                            {j === 0 && <span style={{ width: 46 }} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '11px 16px', borderTop: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11.5, color: DIM, flex: 1, minWidth: 200 }}>
                {totals.tasks === 0
                  ? 'Nothing selected.'
                  : <>{totals.tasks} task{totals.tasks === 1 ? '' : 's'} → <strong style={{ color: TEXT }}>{totals.pieces} areas</strong>, {totals.links} new finish-to-start links. The original rows are replaced.</>}
              </div>
              <button onClick={() => void apply()} disabled={busy || totals.tasks === 0}
                style={{
                  background: totals.tasks === 0 ? 'transparent' : GOLD,
                  border: '1px solid ' + (totals.tasks === 0 ? BORDER : GOLD),
                  borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700,
                  color: totals.tasks === 0 ? DIM : '#1a1204',
                  cursor: busy || totals.tasks === 0 ? 'default' : 'pointer', opacity: busy ? .6 : 1,
                }}>
                {busy ? 'Splitting…' : `Split into ${STYLES.find((s) => s.id === style)?.label.toLowerCase()}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
