'use client';
/**
 * SageSettings — the transparent Sage Brain surface (R16–R18).
 * Lives in Sage's own UI (Ask Sage page + chat widget menu), NOT app settings.
 *
 *  • Style profile (R16): shows the EXACT profile text Sage was given, the
 *    inferred dimensions, and where they came from. Editable + toggleable.
 *  • Automation rules (R18): every GC-approved rule, visible and revocable.
 *  • Activity trail (R18): everything Sage (or you) changed, logged.
 *  • Bid brain (R17): win-rate by markup band with sample-size honesty.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)', DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)';
const RED = 'var(--danger)', GREEN = 'var(--success)';

interface StyleProfile {
  enabled: boolean;
  brevity: number; formality: number; emoji_use: number;
  directness: number; technical_depth: number; humor: number;
  profile_text: string;
  sample_count: number;
  sources: string[];
  user_edited: boolean;
  computed_at: string | null;
}

interface Rule {
  id: string; title: string; description: string | null;
  trigger_type: string; action_type: string; enabled: boolean; created_at: string;
}

interface ActivityEntry {
  id: string; actor: string; action_type: string; summary: string; created_at: string;
}

interface Band { band: string; n: number; wins: number; winRate: number | null; expectedValue: number | null }
interface BidAnalysis {
  totalBids: number; decidedBids: number; wonBids: number;
  overallWinRate: number | null; enoughHistory: boolean;
  bands: Band[]; markupAdvice: string | null;
  workflowSuggestions: { suggestion: string; why: string }[];
}

type Tab = 'style' | 'rules' | 'activity' | 'bids';

const DIM_META: Array<{ key: keyof StyleProfile; label: string }> = [
  { key: 'brevity', label: 'Brevity' },
  { key: 'formality', label: 'Formality' },
  { key: 'emoji_use', label: 'Emoji Use' },
  { key: 'directness', label: 'Directness' },
  { key: 'technical_depth', label: 'Technical Depth' },
  { key: 'humor', label: 'Humor' },
];

type Dims = { brevity: number; formality: number; emoji_use: number; directness: number; technical_depth: number; humor: number };

// R16 presets — canned dimension sets applied through the same PUT as manual edits (user_edited: true).
const STYLE_PRESETS: Array<{ name: string; hint: string; dims: Dims }> = [
  {
    name: 'Strict & Brief',
    hint: 'Short, direct, no jokes',
    dims: { brevity: 9, formality: 7, emoji_use: 1, directness: 9, technical_depth: 7, humor: 1 },
  },
  {
    name: 'Neutral',
    hint: 'Balanced professional default',
    dims: { brevity: 5, formality: 5, emoji_use: 2, directness: 5, technical_depth: 5, humor: 2 },
  },
  {
    name: 'Detailed & Formal',
    hint: 'Thorough, structured, formal',
    dims: { brevity: 2, formality: 9, emoji_use: 1, directness: 4, technical_depth: 7, humor: 1 },
  },
];

export default function SageSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('style');
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [bids, setBids] = useState<BidAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [editingText, setEditingText] = useState<string | null>(null);
  const [runningRules, setRunningRules] = useState(false);
  const [runNote, setRunNote] = useState('');

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [p, r, a, b] = await Promise.all([
        fetch('/api/sage/style-profile').then((x) => x.json()).catch(() => null),
        fetch('/api/sage/rules').then((x) => x.json()).catch(() => null),
        fetch('/api/sage/activity').then((x) => x.json()).catch(() => null),
        fetch('/api/sage/bid-brain').then((x) => x.json()).catch(() => null),
      ]);
      if (p?.profile) setProfile(p.profile);
      if (r?.rules) setRules(r.rules);
      if (a?.entries) setActivity(a.entries);
      if (a?.note) setNote(a.note);
      if (b?.analysis) setBids(b.analysis);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Dimension edits still pending a debounced PUT — merged over any server
  // response so an in-flight save never clobbers a slider mid-drag.
  const pendingDimsRef = useRef<Partial<Dims>>({});
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const putProfile = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/sage/style-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d?.profile) setProfile({ ...d.profile, ...pendingDimsRef.current });
      if (d?.note) setNote(d.note);
    } finally { setBusy(false); }
  }, []);

  // Debounced slider edits: update the UI instantly, PUT once ~500ms after the
  // last change — a drag is one save, not a burst spamming the activity trail.
  const setDimension = useCallback((key: keyof Dims, value: number) => {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    pendingDimsRef.current = { ...pendingDimsRef.current, [key]: value };
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    dimTimerRef.current = setTimeout(() => {
      const dimensions = pendingDimsRef.current;
      pendingDimsRef.current = {};
      dimTimerRef.current = null;
      putProfile({ dimensions });
    }, 500);
  }, [putProfile]);

  const applyPreset = useCallback((dims: Dims) => {
    // A preset supersedes any pending slider edits — cancel them and save the full set now.
    if (dimTimerRef.current) { clearTimeout(dimTimerRef.current); dimTimerRef.current = null; }
    pendingDimsRef.current = {};
    setProfile((prev) => (prev ? { ...prev, ...dims } : prev));
    putProfile({ dimensions: dims });
  }, [putProfile]);

  // Unmount: flush any pending dimension edits so a close mid-debounce still saves.
  useEffect(() => () => {
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    const dimensions = pendingDimsRef.current;
    if (Object.keys(dimensions).length > 0) {
      fetch('/api/sage/style-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dimensions }),
      }).catch(() => {});
    }
  }, []);

  const recompute = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/sage/style-profile', { method: 'POST' });
      const d = await res.json();
      if (d?.profile) setProfile(d.profile);
    } finally { setBusy(false); }
  }, []);

  const toggleRule = useCallback(async (id: string, enabled: boolean) => {
    const res = await fetch('/api/sage/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }),
    });
    const d = await res.json();
    if (d?.rules) setRules(d.rules);
    if (d?.error) setNote(d.error);
  }, []);

  // R18: evaluate every enabled rule against live rows right now. Drafts only —
  // the endpoint never sends; results land in the activity trail (refreshed here).
  const runRulesNow = useCallback(async () => {
    setRunningRules(true);
    setRunNote('');
    try {
      const res = await fetch('/api/sage/rules/run', { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (d?.note) setRunNote(d.note);
      else if (d?.error) setRunNote(d.error);
      const a = await fetch('/api/sage/activity').then((x) => x.json()).catch(() => null);
      if (a?.entries) setActivity(a.entries);
    } finally {
      setRunningRules(false);
    }
  }, []);

  const revokeRule = useCallback(async (id: string) => {
    const res = await fetch(`/api/sage/rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const d = await res.json();
    if (d?.rules) setRules(d.rules);
    if (d?.error) setNote(d.error);
  }, []);

  const card: React.CSSProperties = { background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, fontWeight: 700 };
  const btn: React.CSSProperties = { background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ width: 'min(680px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.75)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: RAISED, zIndex: 2 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--on-brand)', fontFamily: 'Georgia, serif' }}>S</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Sage Settings</div>
            <div style={{ color: DIM, fontSize: 12 }}>Everything Sage knows about how to work with you — visible, editable, revocable.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 18px', borderBottom: `1px solid ${BORDER}` }}>
          {([['style', 'Style Profile'], ['rules', 'Automation Rules'], ['activity', 'Activity Trail'], ['bids', 'Bid Brain']] as Array<[Tab, string]>).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? GOLD : 'transparent'}`, color: tab === t ? GOLD : DIM, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {note && <div style={{ ...card, borderColor: 'var(--border-default)', color: 'var(--text-primary)', fontSize: 13 }}>{note}</div>}

          {/* ── STYLE PROFILE ─────────────────────────────────────────── */}
          {tab === 'style' && (
            <>
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Style Mirroring</div>
                  <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                    Sage learns how you write from your real messages in Saguaro and mirrors your tone. The profile below is the exact text Sage is given — nothing hidden. Turn it off and Sage uses a neutral professional default.
                  </div>
                </div>
                <button
                  onClick={() => profile && putProfile({ enabled: !profile.enabled })}
                  disabled={busy || !profile}
                  style={{ ...btn, background: profile?.enabled ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)', borderColor: profile?.enabled ? 'rgba(74,222,128,0.4)' : BORDER, color: profile?.enabled ? GREEN : DIM, minWidth: 60 }}
                >{profile?.enabled ? 'ON' : 'OFF'}</button>
              </div>

              {profile && (
                <>
                  <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <span style={label}>Presets</span>
                      <span style={{ marginLeft: 'auto', color: DIM, fontSize: 12 }}>one click sets all six dimensions</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {STYLE_PRESETS.map((p) => {
                        const active = DIM_META.every(({ key }) => Number(profile[key] ?? 0) === p.dims[key as keyof Dims]);
                        return (
                          <button
                            key={p.name}
                            onClick={() => applyPreset(p.dims)}
                            disabled={busy}
                            title={p.hint}
                            style={{
                              ...btn,
                              flex: '1 1 0',
                              minWidth: 140,
                              textAlign: 'left',
                              background: active ? 'var(--brand-primary-18)' : 'rgba(255,255,255,0.04)',
                              borderColor: active ? 'color-mix(in srgb, var(--brand-primary) 55%, transparent)' : BORDER,
                              color: active ? GOLD : TEXT,
                            }}
                          >
                            <div>{p.name}</div>
                            <div style={{ color: DIM, fontSize: 12, fontWeight: 400, marginTop: 2 }}>{p.hint}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <span style={label}>Inferred Dimensions</span>
                      <span style={{ marginLeft: 'auto', color: DIM, fontSize: 12 }}>
                        from {profile.sample_count} message{profile.sample_count === 1 ? '' : 's'}
                        {profile.sources?.length ? ` · ${profile.sources.join(', ')}` : ''}
                        {profile.user_edited ? ' · edited by you' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {DIM_META.map(({ key, label: l }) => {
                        const v = Number(profile[key] ?? 5);
                        return (
                          <div key={String(key)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: DIM, marginBottom: 3 }}>
                              <span>{l}</span><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{v}/10</span>
                            </div>
                            <input
                              type="range" min={1} max={10} value={v}
                              onChange={(e) => setDimension(key as keyof Dims, Number(e.target.value))}
                              style={{ width: '100%', accentColor: GOLD }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <span style={label}>Exact Text Injected into Sage&apos;s Prompt</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        {editingText == null ? (
                          <button style={btn} onClick={() => setEditingText(profile.profile_text)}>Edit</button>
                        ) : (
                          <>
                            <button style={btn} onClick={() => { putProfile({ profile_text: editingText }); setEditingText(null); }}>Save</button>
                            <button style={{ ...btn, color: DIM, borderColor: BORDER, background: 'none' }} onClick={() => setEditingText(null)}>Cancel</button>
                          </>
                        )}
                        <button style={btn} disabled={busy} onClick={recompute}>Recompute</button>
                      </div>
                    </div>
                    {editingText == null ? (
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: TEXT, fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit' }}>{profile.profile_text || 'No profile text yet.'}</pre>
                    ) : (
                      <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={8}
                        style={{ width: '100%', background: RAISED, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5 }} />
                    )}
                  </div>
                </>
              )}
              {!profile && !busy && <div style={{ color: DIM, fontSize: 13 }}>Could not load a style profile.</div>}
            </>
          )}

          {/* ── AUTOMATION RULES ──────────────────────────────────────── */}
          {tab === 'rules' && (
            <>
              <div style={{ ...card }}>
                <div style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Consent-First Automation</div>
                <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                  Sage only automates under rules you explicitly approve here. Every rule is visible and revocable, and every automated action is written to the activity trail. No rule — no automation; Sage asks in chat instead.
                </div>
              </div>
              {rules.some((r) => r.enabled) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={runRulesNow}
                    disabled={runningRules}
                    style={{ ...btn, color: 'var(--text-primary)', borderColor: 'rgba(212,175,55,0.45)', background: 'rgba(212,175,55,0.10)', opacity: runningRules ? 0.6 : 1 }}
                  >
                    {runningRules ? 'Running…' : 'Run Rules Now'}
                  </button>
                  {runNote && <div style={{ color: DIM, fontSize: 12 }}>{runNote}</div>}
                </div>
              )}
              {rules.length === 0 ? (
                <div style={{ color: DIM, fontSize: 13 }}>No rules yet. When Sage offers &quot;Create rule&quot; in chat and you accept, the rule appears here.</div>
              ) : rules.map((r) => (
                <div key={r.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>{r.title}</div>
                    <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>
                      trigger: {r.trigger_type} → action: {r.action_type}
                      {r.description ? ` — ${r.description}` : ''}
                    </div>
                  </div>
                  <button onClick={() => toggleRule(r.id, !r.enabled)} style={{ ...btn, background: r.enabled ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)', borderColor: r.enabled ? 'rgba(74,222,128,0.4)' : BORDER, color: r.enabled ? GREEN : DIM }}>{r.enabled ? 'ON' : 'OFF'}</button>
                  <button onClick={() => revokeRule(r.id)} style={{ ...btn, color: RED, borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}>Revoke</button>
                </div>
              ))}
            </>
          )}

          {/* ── ACTIVITY TRAIL ────────────────────────────────────────── */}
          {tab === 'activity' && (
            <>
              <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5 }}>
                Everything Sage did (or you changed about Sage) is logged here. Nothing Sage does is invisible.
              </div>
              {activity.length === 0 ? (
                <div style={{ color: DIM, fontSize: 13 }}>No activity yet.</div>
              ) : activity.map((a) => (
                <div key={a.id} style={{ ...card, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: a.actor === 'sage' ? 'var(--info)' : GREEN, flexShrink: 0, textTransform: 'capitalize' }}>{a.actor}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.5 }}>{a.summary}</div>
                    <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{a.action_type} · {new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── BID BRAIN ─────────────────────────────────────────────── */}
          {tab === 'bids' && (
            <>
              {!bids ? (
                <div style={{ color: DIM, fontSize: 13 }}>{busy ? 'Analyzing your bid history…' : 'Could not load bid history.'}</div>
              ) : (
                <>
                  <div style={{ ...card }}>
                    <span style={label}>From Your Real Bid History</span>
                    <div style={{ color: TEXT, fontSize: 13, marginTop: 6 }}>
                      {bids.totalBids} bids on file · {bids.decidedBids} decided · {bids.wonBids} won
                      {bids.overallWinRate != null && <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}> · {bids.overallWinRate}% win rate</span>}
                    </div>
                    {!bids.enoughHistory && (
                      <div style={{ color: DIM, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                        Not enough history yet — fewer than 5 decided bids. Sage won&apos;t pretend to see a trend in this little data; win-rate analysis unlocks as your history grows.
                      </div>
                    )}
                  </div>
                  {bids.enoughHistory && (
                    <div style={card}>
                      <span style={label}>Win Rate by Markup Band</span>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {bids.bands.filter((b) => b.n > 0).map((b) => (
                          <div key={b.band} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                            <span style={{ color: TEXT }}>{b.band}</span>
                            <span style={{ textAlign: 'right' }}>
                              <span style={{ color: b.winRate != null ? 'var(--text-primary)' : DIM, fontWeight: b.winRate != null ? 700 : 400 }}>
                                {b.winRate != null ? `${b.winRate}% (${b.wins}/${b.n})` : `not enough data (n=${b.n})`}
                              </span>
                              {b.expectedValue != null && (
                                <span style={{ color: DIM }}> · expected margin ~{b.expectedValue}%</span>
                              )}
                            </span>
                          </div>
                        ))}
                        {bids.bands.every((b) => b.n === 0) && <div style={{ color: DIM, fontSize: 13 }}>No decided bids carry cost/margin data to derive a markup band.</div>}
                        {bids.bands.some((b) => b.expectedValue != null) && (
                          <div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Expected margin = win rate × band-midpoint markup. Only shown for bands with 5+ decided bids.</div>
                        )}
                      </div>
                      {bids.markupAdvice && <div style={{ color: DIM, fontSize: 13, marginTop: 10, lineHeight: 1.55, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>{bids.markupAdvice}</div>}
                    </div>
                  )}
                  {bids.workflowSuggestions.length > 0 && (
                    <div style={card}>
                      <span style={label}>Workflow Suggestions</span>
                      {bids.workflowSuggestions.map((s, i) => (
                        <div key={i} style={{ marginTop: 8 }}>
                          <div style={{ color: TEXT, fontSize: 13, fontWeight: 700 }}>{s.suggestion}</div>
                          <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>Why: {s.why}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
