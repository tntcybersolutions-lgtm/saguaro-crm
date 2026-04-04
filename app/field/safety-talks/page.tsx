'use client';
/**
 * Saguaro Field — OSHA Toolbox Talks
 * AI-generated safety talks with attendance tracking and signature capture.
 * Real Supabase data via API routes.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';

const BASE   = '#F8F9FB';
const CARD   = '#F8F9FB';
const GOLD   = '#C8960F';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BORDER = '#2A3144';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const BLUE   = '#3B82F6';

interface TalkData {
  title: string;
  talking_points: string[];
  discussion_questions: string[];
  osha_reference: string;
}

interface Attendee {
  id: string;
  name: string;
  signature: string | null;
}

interface HistoryItem {
  id: string;
  title: string;
  date: string;
  attendee_count: number;
  osha_reference?: string;
  talking_points?: string[];
  discussion_questions?: string[];
  attendees?: { name: string; signature: string | null }[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: `${CARD}cc`,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 16,
    ...extra,
  };
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Inline Signature Canvas ───────────────────────────────────── */
function InlineSignature({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (parent) { c.width = Math.min(parent.clientWidth, 320); c.height = 120; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, c.height - 20);
    ctx.lineTo(c.width - 12, c.height - 20);
    ctx.stroke();
    ctx.fillStyle = DIM;
    ctx.font = '9px sans-serif';
    ctx.fillText('Sign above', 12, c.height - 6);
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) e.preventDefault();
    drawingRef.current = true;
    hasStrokesRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.strokeStyle = TEXT; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.moveTo(x, y);
  };

  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawingRef.current) return;
    if ('touches' in e) e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const onEnd = () => { drawingRef.current = false; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <canvas
        ref={canvasRef}
        style={{ borderRadius: 8, border: `1px solid ${BORDER}`, touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={smBtn(DIM)}>Cancel</button>
        <button onClick={() => {
          if (hasStrokesRef.current && canvasRef.current) onSave(canvasRef.current.toDataURL('image/png'));
        }} style={smBtn(GREEN)}>Accept</button>
      </div>
    </div>
  );
}

function smBtn(color: string): React.CSSProperties {
  return { flex: 1, padding: '6px 0', borderRadius: 6, border: `1px solid ${color}33`, background: `${color}15`, color, fontSize: 11, fontWeight: 600, cursor: 'pointer' };
}

/* ─── Main Component ────────────────────────────────────────────── */
export default function SafetyTalksPage() {
  const { showToast } = useToast();
  const [view, setView] = useState<'main' | 'detail'>('main');
  const [generating, setGenerating] = useState(false);
  const [talk, setTalk] = useState<TalkData | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [newName, setNewName] = useState('');
  const [signingId, setSigningId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);

  const projectId = typeof window !== 'undefined' ? localStorage.getItem('saguaro_active_project') || '' : '';
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('saguaro_tenant_id') || '' : '';

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/safety-talks?tenantId=${tenantId}&projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : data.talks || []);
      }
    } catch { /* ignore */ } finally { setLoadingHistory(false); }
  }, [tenantId, projectId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const generateTalk = async () => {
    setGenerating(true);
    setTalk(null);
    setAttendees([]);
    try {
      const res = await fetch('/api/ai/toolbox-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, tenantId }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setTalk({
        title: data.title || 'Safety Talk',
        talking_points: data.talking_points || data.talkingPoints || [],
        discussion_questions: data.discussion_questions || data.discussionQuestions || [],
        osha_reference: data.osha_reference || data.oshaReference || '',
      });
    } catch {
      showToast('Failed to generate toolbox talk', 'error');
    } finally { setGenerating(false); }
  };

  const addAttendee = () => {
    if (!newName.trim()) return;
    setAttendees((prev) => [...prev, { id: uid(), name: newName.trim(), signature: null }]);
    setNewName('');
  };

  const removeAttendee = (id: string) => setAttendees((prev) => prev.filter((a) => a.id !== id));

  const saveSignature = (attendeeId: string, dataUrl: string) => {
    setAttendees((prev) => prev.map((a) => a.id === attendeeId ? { ...a, signature: dataUrl } : a));
    setSigningId(null);
  };

  const saveTalk = async () => {
    if (!talk) return;
    setSaving(true);
    try {
      const res = await fetch('/api/safety-talks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          title: talk.title,
          talking_points: talk.talking_points,
          discussion_questions: talk.discussion_questions,
          osha_reference: talk.osha_reference,
          attendees: attendees.map((a) => ({ name: a.name, signature: a.signature })),
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Safety talk saved', 'success');
      setTalk(null);
      setAttendees([]);
      fetchHistory();
    } catch {
      showToast('Failed to save safety talk', 'error');
    } finally { setSaving(false); }
  };

  const openDetail = (item: HistoryItem) => {
    setDetailItem(item);
    setView('detail');
  };

  /* ── Detail View ──────────────────────────────────────────────── */
  if (view === 'detail' && detailItem) {
    return (
      <div style={{ minHeight: '100vh', background: BASE, padding: '16px 16px 100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', padding: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT, flex: 1 }}>{detailItem.title}</h1>
        </div>

        <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>
          {formatDate(detailItem.date)} &middot; {detailItem.attendee_count} attendee{detailItem.attendee_count !== 1 ? 's' : ''}
        </div>

        {detailItem.osha_reference && (
          <div style={{ ...glassCard({ marginBottom: 14, padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>{detailItem.osha_reference}</span>
          </div>
        )}

        {detailItem.talking_points && detailItem.talking_points.length > 0 && (
          <div style={{ ...glassCard({ marginBottom: 14 }) }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>Talking Points</h3>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detailItem.talking_points.map((pt, i) => (
                <li key={i} style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{pt}</li>
              ))}
            </ol>
          </div>
        )}

        {detailItem.discussion_questions && detailItem.discussion_questions.length > 0 && (
          <div style={{ ...glassCard({ marginBottom: 14 }) }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>Discussion Questions</h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {detailItem.discussion_questions.map((q, i) => (
                <li key={i} style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {detailItem.attendees && detailItem.attendees.length > 0 && (
          <div style={glassCard()}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>Attendance Record</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detailItem.attendees.map((att, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < detailItem.attendees!.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>{att.name}</span>
                  {att.signature ? (
                    <img src={att.signature} alt="Signature" style={{ height: 30, borderRadius: 4, background: BASE }} />
                  ) : (
                    <span style={{ fontSize: 11, color: `${RED}88` }}>No signature</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Main View ────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: BASE, padding: '16px 16px 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Toolbox Talks</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>OSHA Safety Briefings</p>
        </div>
        <button
          onClick={generateTalk}
          disabled={generating}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: generating ? DIM : `linear-gradient(135deg, ${GOLD}, ${GOLD}cc)`,
            color: BASE,
            fontWeight: 700,
            fontSize: 14,
            cursor: generating ? 'wait' : 'pointer',
            boxShadow: `0 4px 16px ${GOLD}33`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid transparent', borderTopColor: BASE, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Generating...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Generate Talk
            </>
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Generated Talk */}
      {talk && (
        <div style={{ marginBottom: 24 }}>
          {/* Talk content */}
          <div style={{ ...glassCard({ marginBottom: 14, borderColor: `${GOLD}44` }) }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: TEXT }}>{talk.title}</h2>

            {talk.osha_reference && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: `${GOLD}15`, border: `1px solid ${GOLD}33`, marginBottom: 14 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{talk.osha_reference}</span>
              </div>
            )}

            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: TEXT }}>Talking Points</h3>
            <ol style={{ margin: '0 0 16px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {talk.talking_points.map((pt, i) => (
                <li key={i} style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{pt}</li>
              ))}
            </ol>

            {talk.discussion_questions.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: TEXT }}>Discussion Questions</h3>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {talk.discussion_questions.map((q, i) => (
                    <li key={i} style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>{q}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Attendance section */}
          <div style={{ ...glassCard({ marginBottom: 14 }) }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: TEXT }}>
              Attendance ({attendees.length})
            </h3>

            {/* Add attendee */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAttendee()}
                placeholder="Attendee name"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  background: `${BASE}cc`,
                  color: TEXT,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button onClick={addAttendee} style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${GOLD}44`,
                background: `${GOLD}15`,
                color: GOLD,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
              }}>
                Add
              </button>
            </div>

            {/* Attendee list */}
            {attendees.length === 0 && (
              <p style={{ fontSize: 12, color: DIM, margin: 0, textAlign: 'center', padding: '8px 0' }}>
                No attendees added yet
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attendees.map((att) => (
                <div key={att.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: `${BASE}66`,
                  border: `1px solid ${BORDER}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: TEXT }}>{att.name}</span>
                    {att.signature ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>Signed</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSigningId(att.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: `1px solid ${BLUE}33`,
                          background: `${BLUE}15`,
                          color: BLUE,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Sign
                      </button>
                    )}
                    <button
                      onClick={() => removeAttendee(att.id)}
                      style={{ background: 'none', border: 'none', color: `${RED}88`, cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                    >&times;</button>
                  </div>

                  {/* Inline signature canvas */}
                  {signingId === att.id && !att.signature && (
                    <InlineSignature
                      onSave={(dataUrl) => saveSignature(att.id, dataUrl)}
                      onCancel={() => setSigningId(null)}
                    />
                  )}

                  {/* Show captured signature */}
                  {att.signature && (
                    <img src={att.signature} alt={`${att.name} signature`} style={{ height: 40, borderRadius: 4, background: BASE, alignSelf: 'flex-start' }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={saveTalk}
            disabled={saving || attendees.length === 0}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              background: saving || attendees.length === 0
                ? DIM
                : `linear-gradient(135deg, ${GREEN}, ${GREEN}cc)`,
              color: saving || attendees.length === 0 ? TEXT : BASE,
              fontWeight: 800,
              fontSize: 15,
              cursor: saving || attendees.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: `0 4px 20px ${GREEN}33`,
            }}
          >
            {saving ? 'Saving...' : 'Save & Complete'}
          </button>
        </div>
      )}

      {/* History */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 12 }}>History</h2>

        {loadingHistory && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glassCard(), height: 60, opacity: 0.5 }}>
                <div style={{ width: '50%', height: 12, background: `${DIM}22`, borderRadius: 4, marginBottom: 6 }} />
                <div style={{ width: '30%', height: 10, background: `${DIM}15`, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        )}

        {!loadingHistory && history.length === 0 && (
          <div style={{ ...glassCard(), textAlign: 'center', padding: 30 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <p style={{ color: DIM, fontSize: 13, margin: 0 }}>No safety talks recorded yet.</p>
          </div>
        )}

        {!loadingHistory && history.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => openDetail(item)}
                style={{
                  ...glassCard({ cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }),
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: DIM }}>
                    {formatDate(item.date)} &middot; {item.attendee_count} attendee{item.attendee_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
