'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import { humanError } from '@/lib/errors';
import { SUB_TRADES as TRADES } from '@/lib/construction-intelligence';
import { Clipboard, NotePencil, Envelope, CheckCircle, XCircle, CaretUp, CaretDown, X, ShieldCheck, Plus, WarningCircle, ChartBar, Clock } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';

/* ─── Palette ─── */
const GOLD = 'var(--brand-primary)', BG = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)',
  TEXT = 'var(--text-primary)', DIM = 'var(--text-secondary)', GREEN = 'var(--success)', RED = 'var(--danger)',
  AMBER = 'var(--warning)', BLUE = 'var(--brand-primary)', PURPLE = 'var(--warning)';

/* ─── Types ─── */
type QType = 'text' | 'number' | 'yes_no' | 'rating' | 'file_upload' | 'multi_choice';
type SubStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

interface Question {
  id: string; label: string; type: QType; required: boolean;
  options?: string[]; category: string; points: number;
  scoringKey?: Record<string, number>;
}
interface Template {
  id: string; name: string; description: string; questions: Question[];
  threshold: number; requiredDocs: string[]; created_at: string;
}
interface Submission {
  id: string; sub_name: string; sub_email: string; sub_trade: string;
  status: SubStatus; submitted_at: string; expires_at: string;
  total_score: number; max_score: number; scores: Record<string, number>;
  answers: Record<string, any>; documents: { name: string; uploaded: boolean; expires_at?: string }[];
  notes: string; template_id: string; reviewer_notes: string;
}
interface Invite { id: string; email: string; sub_name: string; template_id: string; sent_at: string; status: 'pending' | 'sent' | 'opened' | 'completed'; token: string }

/* ─── Constants ─── */
const CATEGORIES = ['Insurance', 'Bonding', 'Safety', 'References', 'Certifications'] as const;
// TRADES = canonical SUB_TRADES taxonomy from @/lib/construction-intelligence
const DEFAULT_DOCS = ['Certificate of Insurance (COI)', 'Performance Bond Letter', 'Safety Record / OSHA Logs', 'References (3+)', 'W-9 Form', 'Business License', 'EMR Letter', 'OSHA 300 Log'];
const CATEGORY_COLORS: Record<string, string> = { Insurance: BLUE, Bonding: PURPLE, Safety: GREEN, References: GOLD, Certifications: AMBER };
const STATUS_COLORS: Record<string, string> = { pending: AMBER, under_review: BLUE, approved: GREEN, rejected: RED };
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected' };

/* Real address check — the invite email is delivered there. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
function daysUntil(d: string) { if (!d) return 999; return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); }
function pctColor(pct: number) { return pct >= 80 ? GREEN : pct >= 60 ? AMBER : RED; }

/* ─── Shared Styles ─── */
const inputS: React.CSSProperties = { padding: '9px 13px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const btnS = (bg: string, c: string = 'var(--bg-base)'): React.CSSProperties => ({ padding: '8px 18px', background: bg, color: c, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' });
const cardS: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 10 };
const chipS = (bg: string, c: string): React.CSSProperties => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `color-mix(in srgb, ${bg} 13%, transparent)`, color: c });
// 10000 = the kit overlay layer: above the chat launcher (9999), which otherwise sits on a phone dialog's buttons.
const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 };
const modalBox: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 'var(--radius-lg)', padding: 28, width: '90%', maxWidth: 700, maxHeight: '85vh', overflowY: 'auto', color: TEXT, boxShadow: 'var(--shadow-lg)' };
const selectS: React.CSSProperties = { ...inputS, appearance: 'auto' as any };
const labelS: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, display: 'block', fontWeight: 700};
const tableHeaderS: React.CSSProperties = { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const tableCellS: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: TEXT, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)`, whiteSpace: 'nowrap' };

/* Escape closes the open dialog — only the most recently opened one (a
   stack), so with the question editor open over the template builder, Escape
   closes just the question editor. The handler reads the latest onClose from a
   ref, so re-renders don't reorder the stack. */
const escStack: Array<() => void> = [];
function useEscapeToClose(onClose: () => void, enabled = true) {
  const latest = React.useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const entry = () => latest.current();
    escStack.push(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escStack[escStack.length - 1] !== entry) return;
      e.preventDefault();
      entry();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = escStack.lastIndexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [enabled]);
}

/* ─── Small Components ─── */
function StatusBadge({ status }: { status: string }) {
  return <span style={chipS(STATUS_COLORS[status] || DIM, STATUS_COLORS[status] || DIM)}>{STATUS_LABELS[status] || status}</span>;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: BG, borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pctColor(pct), borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12, color: pctColor(pct), fontWeight: 700, minWidth: 40 }}>{pct}%</span>
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: 60, color: GOLD, fontSize: 16, fontWeight: 600 }}>Loading…</div>;
}

/* ─── Radar Chart ─── */
function RadarChart({ scores, maxScores, size = 220 }: { scores: Record<string, number>; maxScores: Record<string, number>; size?: number }) {
  const cats = CATEGORIES.filter(c => maxScores[c] && maxScores[c] > 0);
  if (cats.length < 3) return null;
  const cx = size / 2, cy = size / 2, r = size / 2 - 30;
  const step = (2 * Math.PI) / cats.length;
  const pts = cats.map((c, i) => {
    const pct = maxScores[c] ? (scores[c] || 0) / maxScores[c] : 0;
    const a = i * step - Math.PI / 2;
    return { x: cx + r * pct * Math.cos(a), y: cy + r * pct * Math.sin(a) };
  });
  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      {[0.25, 0.5, 0.75, 1].map(lv => (
        <polygon key={lv} points={cats.map((_, i) => { const a = i * step - Math.PI / 2; return `${cx + r * lv * Math.cos(a)},${cy + r * lv * Math.sin(a)}`; }).join(' ')} fill="none" stroke={BORDER} strokeWidth={1} />
      ))}
      {cats.map((c, i) => { const a = i * step - Math.PI / 2; const lx = cx + (r + 18) * Math.cos(a); const ly = cy + (r + 18) * Math.sin(a); return <text key={c} x={lx} y={ly} fill={CATEGORY_COLORS[c] || DIM} fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="middle">{c}</text>; })}
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={`color-mix(in srgb, ${GOLD} 20%, transparent)`} stroke={GOLD} strokeWidth={2} />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={GOLD} />)}
    </svg>
  );
}


/* ─── API row normalizers ───
   Real prequalification_submissions / templates rows are snake_case and may
   omit the nested arrays/objects the UI iterates (documents, scores, answers,
   questions, requiredDocs). Coerce every such field to a safe default so the
   dashboard's .some()/.forEach()/.map() calls never crash. */
function normalizeSubmission(s: any): Submission {
  return {
    id: String(s?.id ?? uid()),
    sub_name: s?.sub_name ?? s?.name ?? '',
    sub_email: s?.sub_email ?? s?.email ?? '',
    sub_trade: s?.sub_trade ?? s?.trade ?? '',
    status: (s?.status as SubStatus) ?? 'pending',
    submitted_at: s?.submitted_at ?? s?.created_at ?? '',
    expires_at: s?.expires_at ?? '',
    total_score: Number(s?.total_score ?? 0),
    max_score: Number(s?.max_score ?? 0),
    scores: (s?.scores && typeof s.scores === 'object') ? s.scores : {},
    answers: (s?.answers && typeof s.answers === 'object') ? s.answers : {},
    documents: Array.isArray(s?.documents) ? s.documents : [],
    notes: s?.notes ?? '',
    template_id: s?.template_id ?? '',
    // Live DB stores reviewer notes in the `notes` column; fall back to any
    // legacy `reviewer_notes` field so both shapes render.
    reviewer_notes: s?.notes ?? s?.reviewer_notes ?? '',
  };
}

function normalizeTemplate(t: any): Template {
  return {
    id: String(t?.id ?? uid()),
    name: t?.name ?? '',
    description: t?.description ?? '',
    questions: Array.isArray(t?.questions) ? t.questions : [],
    threshold: Number(t?.threshold ?? 70),
    requiredDocs: Array.isArray(t?.requiredDocs) ? t.requiredDocs : (Array.isArray(t?.required_docs) ? t.required_docs : []),
    created_at: t?.created_at ?? new Date().toISOString(),
  };
}

function normalizeInvite(i: any): Invite {
  // A submitted invite may be recorded as 'completed' or 'submitted'; treat both
  // as completed. Anything else that isn't a known status falls back to 'pending'.
  const raw = i?.status;
  const status: Invite['status'] =
    raw === 'submitted' ? 'completed'
    : ['pending', 'sent', 'opened', 'completed'].includes(raw) ? raw
    : 'pending';
  return {
    id: String(i?.id ?? uid()),
    email: i?.sub_email ?? i?.email ?? '',
    sub_name: i?.sub_name ?? i?.name ?? '',
    template_id: i?.template_id ?? '',
    sent_at: i?.sent_at ?? i?.created_at ?? '',
    status,
    token: i?.token ?? '',
  };
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
export default function PrequalificationPage() {
  const [tab, setTab] = useState<'dashboard' | 'submissions' | 'templates' | 'invites'>('dashboard');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  const [scoreMin, setScoreMin] = useState('');
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toast, setToast] = useState('');

  /* ─── Fetch data ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes, iRes] = await Promise.allSettled([
        fetch('/api/prequalification/templates'),
        fetch('/api/prequalification/submissions'),
        fetch('/api/prequalification/invites'),
      ]);
      // Real tenant data only — no seeded/fabricated subs, templates, or invites.
      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        const d = await tRes.value.json();
        const raw = Array.isArray(d) ? d : (d.templates ?? d.data ?? []);
        setTemplates((Array.isArray(raw) ? raw : []).map(normalizeTemplate));
      } else { setTemplates([]); }
      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        const d = await sRes.value.json();
        const raw = Array.isArray(d) ? d : (d.submissions ?? d.data ?? []);
        setSubmissions((Array.isArray(raw) ? raw : []).map(normalizeSubmission));
      } else { setSubmissions([]); }
      if (iRes.status === 'fulfilled' && iRes.value.ok) {
        const d = await iRes.value.json();
        const raw = Array.isArray(d) ? d : (d.invites ?? d.data ?? []);
        setInvites((Array.isArray(raw) ? raw : []).map(normalizeInvite));
      } else { setInvites([]); }
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, 'Failed to load prequalification data. Please try again.'));
      setTemplates([]);
      setSubmissions([]);
      setInvites([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  /* ─── Filtered submissions ─── */
  const filtered = useMemo(() => {
    return submissions.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (tradeFilter !== 'all' && s.sub_trade !== tradeFilter) return false;
      if (scoreMin && s.max_score > 0 && (s.total_score / s.max_score) * 100 < Number(scoreMin)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (![s.sub_name, s.sub_email, s.sub_trade].some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [submissions, statusFilter, tradeFilter, scoreMin, search]);
  const columns: Column<Submission>[] = [
    { key: 'sub_name', header: 'Subcontractor', primary: true, phone: 'show', accessor: s => s.sub_name || '',
      render: s => (
        <span className="k-name">
          <span className="k-avatar" aria-hidden>{(s.sub_name || '?').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')}</span>
          <span className="k-name-text"><span>{s.sub_name}</span><span>{s.sub_email}</span></span>
        </span>
      ) },
    { key: 'sub_trade', header: 'Trade', phone: 'show', accessor: s => s.sub_trade || '', render: s => s.sub_trade || '—' },
    { key: 'score', header: 'Score', phone: 'show', accessor: s => (s.max_score > 0 ? s.total_score / s.max_score : 0),
      render: s => { const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0; return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 800, color: pctColor(pct) }}>{pct}%</span><span style={{ fontSize: 12, color: DIM }}>({s.total_score}/{s.max_score})</span></span>; } },
    { key: 'status', header: 'Status', phone: 'show', accessor: s => s.status, render: s => <StatusPill module="prequalification" status={s.status} size="sm" /> },
    { key: 'submitted_at', header: 'Submitted', phone: 'hide', accessor: s => s.submitted_at || '', render: s => fmtDate(s.submitted_at) },
    { key: 'expires_at', header: 'Prequal Expires', phone: 'show', accessor: s => s.expires_at || '',
      render: s => { if (!s.expires_at) return '—'; const dl = daysUntil(s.expires_at); return dl <= 0 ? <StatusPill module="paperwork" status="expired" size="sm" /> : dl <= 30 ? <StatusPill module="paperwork" status="expiring" label={`${fmtDate(s.expires_at)} · ${dl}d`} size="sm" /> : <span>{fmtDate(s.expires_at)}</span>; } },
    { key: 'docs', header: 'Docs', phone: 'show', accessor: s => (s.documents.length ? s.documents.filter(d => d.uploaded).length / s.documents.length : null),
      render: s => { const ok = s.documents.filter(d => d.uploaded).length; const t = s.documents.length; return <span style={{ color: ok === t ? GREEN : AMBER, fontWeight: 700 }}>{ok}/{t}</span>; } },
    { key: 'actions', header: 'Actions', sortable: false, phone: 'show',
      render: s => (
        <span style={{ display: 'inline-flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          {s.status === 'pending' && <button className="k-btn k-btn-secondary k-btn-sm" onClick={() => updateStatus(s.id, 'under_review')}>Start Review</button>}
          {s.status === 'under_review' && <>
            <button className="k-btn k-btn-primary k-btn-sm" onClick={() => updateStatus(s.id, 'approved')}>Approve</button>
            <button className="k-btn k-btn-secondary k-btn-sm" style={{ color: RED }} onClick={() => updateStatus(s.id, 'rejected')}>Reject</button>
          </>}
        </span>
      ) },
  ];

  /* ─── Dashboard stats ─── */
  const stats = useMemo(() => {
    const total = submissions.length;
    const pending = submissions.filter(s => s.status === 'pending').length;
    const review = submissions.filter(s => s.status === 'under_review').length;
    const approved = submissions.filter(s => s.status === 'approved').length;
    const rejected = submissions.filter(s => s.status === 'rejected').length;
    const avgScore = total > 0 ? Math.round(submissions.reduce((a, s) => a + (s.max_score > 0 ? (s.total_score / s.max_score) * 100 : 0), 0) / total) : 0;
    const expiring = submissions.filter(s => {
      const docsExpiring = s.documents.some(d => d.expires_at && daysUntil(d.expires_at) <= 30 && daysUntil(d.expires_at) >= 0);
      return docsExpiring;
    }).length;
    return { total, pending, review, approved, rejected, avgScore, expiring };
  }, [submissions]);

  /* ─── Pipeline intelligence (invite funnel, docs compliance, expiry buckets,
     score distribution) — derived entirely from already-fetched data ─── */
  const inviteFunnel = useMemo(() => {
    const sent = invites.length;
    const completed = invites.filter(i => i.status === 'completed').length;
    const opened = invites.filter(i => i.status === 'opened').length;
    return { sent, completed, opened, rate: sent > 0 ? Math.round((completed / sent) * 100) : 0 };
  }, [invites]);

  const docStats = useMemo(() => {
    let up = 0, tot = 0, expired = 0, exp30 = 0, exp60 = 0, exp90 = 0;
    submissions.forEach(s => s.documents.forEach(d => {
      tot++;
      if (d.uploaded) up++;
      if (d.expires_at) {
        const dl = daysUntil(d.expires_at);
        if (dl <= 0) expired++;
        else if (dl <= 30) exp30++;
        else if (dl <= 60) exp60++;
        else if (dl <= 90) exp90++;
      }
    }));
    return { up, tot, pct: tot > 0 ? Math.round((up / tot) * 100) : 0, expired, exp30, exp60, exp90 };
  }, [submissions]);

  const decidedRate = stats.approved + stats.rejected > 0
    ? Math.round((stats.approved / (stats.approved + stats.rejected)) * 100) : 0;
  const approvedTrades = useMemo(
    () => new Set(submissions.filter(s => s.status === 'approved').map(s => s.sub_trade).filter(Boolean)).size,
    [submissions]);
  const avgThreshold = templates.length > 0
    ? Math.round(templates.reduce((a, t) => a + (Number(t.threshold) || 0), 0) / templates.length) : 0;

  /* 20-point score histogram buckets: 0-19, 20-39, 40-59, 60-79, 80-100 */
  const scoreBuckets = useMemo(() => {
    const b = [0, 0, 0, 0, 0];
    submissions.forEach(s => {
      if (s.max_score > 0) {
        const p = (s.total_score / s.max_score) * 100;
        b[Math.min(4, Math.floor(p / 20))]++;
      }
    });
    return b;
  }, [submissions]);
  const scoredCount = scoreBuckets.reduce((a, n) => a + n, 0);

  /* ─── Status change ─── */
  // Real persistence: PATCH the tenant-scoped route and only reflect the change
  // locally when the server actually accepted it. No fake "updated" on failure.
  const updateStatus = async (id: string, newStatus: SubStatus) => {
    try {
      const res = await fetch(`/api/prequalification/submissions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('prequal status update failed', res.status, d.error); showToast(humanError(d.error, 'Could not update status. Please try again.'));
        return;
      }
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
      showToast(`Submission status updated to ${STATUS_LABELS[newStatus]}.`);
    } catch { showToast('Network error — status not updated.'); }
  };

  /* ─── Save reviewer notes ─── */
  // Persists to the live `notes` column via the tenant-scoped PATCH route.
  const saveReviewerNotes = async (id: string, notes: string) => {
    try {
      const res = await fetch(`/api/prequalification/submissions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('prequal notes save failed', res.status, d.error); showToast(humanError(d.error, 'Could not save reviewer notes. Please try again.'));
        return;
      }
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, reviewer_notes: notes } : s));
      showToast('Reviewer notes saved.');
    } catch { showToast('Network error — reviewer notes not saved.'); }
  };

  /* ─── Send invite ─── */
  // Real end-to-end: the route mints a secure token, sends the invitation email
  // via Resend, and returns an HONEST result. We refetch so the list reflects the
  // real persisted row (token + status) and surface the true email outcome.
  const sendInvite = async (email: string, subName: string, templateId: string) => {
    try {
      const res = await fetch('/api/prequalification/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_email: email, sub_name: subName, template_id: templateId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error || 'Couldn’t create the invite.'); return; }
      await fetchData();
      if (d.emailSent) showToast(`Prequal invitation emailed to ${email}.`);
      else showToast(d.emailError || 'Invite created, but email is not configured — copy the link to share it.');
    } catch {
      showToast('Network error — invite not created.');
    }
    setShowInviteModal(false);
  };

  /* ─── Copy a subcontractor's portal link ─── */
  const copyInviteLink = async (inv: Invite) => {
    if (!inv.token) { showToast('No portal link is available for this invite.'); return; }
    const url = `${window.location.origin}/prequal/${inv.token}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Portal link copied to clipboard.');
    } catch {
      showToast(url);
    }
  };

  /* ─── Save template ─── */
  // Persist first, then refetch so the list reflects the real tenant-scoped row
  // (with its DB id). Only close + confirm when the server actually accepted it.
  const saveTemplate = async (tpl: Template) => {
    try {
      const res = await fetch('/api/prequalification/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tpl),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('prequal template save failed', res.status, d.error); showToast(humanError(d.error, 'Could not save the template. Please try again.'));
        return;
      }
      await fetchData();
      showToast(`Template "${tpl.name}" saved.`);
      setShowTemplateBuilder(false);
      setEditTemplate(null);
    } catch { showToast('Network error — template not saved.'); }
  };

  /* ─── Export ─── */
  const handleExport = (format: 'csv' | 'pdf') => {
    if (format === 'pdf') {
      // No dedicated PDF route exists; print the current view (browser "Save as PDF").
      window.print();
      return;
    }
    if (filtered.length === 0) {
      showToast('No submissions to export.');
      return;
    }
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Subcontractor', 'Email', 'Trade', 'Status', 'Score %', 'Score', 'Max Score', 'Submitted', 'Expires', 'Docs Uploaded', 'Docs Total', 'Reviewer Notes'];
    const rows = filtered.map(s => {
      const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0;
      const docsOk = s.documents.filter(d => d.uploaded).length;
      return [
        s.sub_name, s.sub_email, s.sub_trade, STATUS_LABELS[s.status] || s.status,
        pct, s.total_score, s.max_score, fmtDate(s.submitted_at), fmtDate(s.expires_at),
        docsOk, s.documents.length, s.reviewer_notes,
      ];
    });
    const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prequalification_submissions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} submission${filtered.length !== 1 ? 's' : ''} as CSV.`);
  };

  /* ─── Detail sub ─── */
  const detailSub = submissions.find(s => s.id === showDetail);
  const detailTemplate = detailSub ? templates.find(t => t.id === detailSub.template_id) : null;

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  useEscapeToClose(() => setShowDetail(null), !!showDetail);
  return (
    <>
    <PremiumSurface maxWidth={2200}>
      {/* Toast */}
      {toast && <div role="status" style={{ position: 'fixed', top: 20, right: 20, background: `color-mix(in srgb, ${GREEN} 13%, transparent)`, border: `1px solid ${GREEN}`, color: GREEN, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 10010 }}>{toast}</div>}

      {/* Header */}
      <ModuleHero
        eyebrow="Prequalification"
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color={GOLD} />}
        title="Subcontractor"
        accent="Prequalification"
        subtitle="Forms, submissions, and sub qualifications."
        actions={<>
          <button style={goldOutlineButtonStyle} className="pmBtn" onClick={() => setShowInviteModal(true)}><Envelope size={15} weight="fill" /> Send Prequal Form</button>
          <button style={goldButtonStyle} className="pmBtn" onClick={() => { setEditTemplate(null); setShowTemplateBuilder(true); }}><Plus size={15} weight="bold" /> New Template</button>
        </>}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `2px solid ${BORDER}` }}>
        {(['dashboard', 'submissions', 'templates', 'invites'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 24px', background: 'none', border: 'none', color: tab === t ? GOLD : DIM, fontWeight: 700, fontSize: 14, cursor: 'pointer', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', marginBottom: -2, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {loading ? <Spinner /> : error && submissions.length === 0 ? (
        <SectionCard>
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Error Loading Data"
            description={error}
            action={<button style={goldOutlineButtonStyle} className="pmBtn" onClick={fetchData}>Retry</button>}
          />
        </SectionCard>
      ) : (
        <>
          {/* ════════ DASHBOARD TAB ════════ */}
          {tab === 'dashboard' && (
            <div>
              {/* Pipeline intelligence strip — funnel, decisions, compliance, expiry */}
              {(submissions.length > 0 || invites.length > 0 || templates.length > 0) && (
                <StatStrip items={[
                  {
                    label: 'Invite Funnel', value: `${inviteFunnel.completed}/${inviteFunnel.sent}`,
                    sub: inviteFunnel.sent > 0 ? `${inviteFunnel.rate}% submitted${inviteFunnel.opened ? ` · ${inviteFunnel.opened} opened` : ''}` : 'No invites sent yet',
                    accent: inviteFunnel.sent > 0 && inviteFunnel.rate < 50 ? AMBER : undefined,
                  },
                  {
                    label: 'Approval Rate', value: `${decidedRate}%`,
                    accent: stats.approved + stats.rejected === 0 ? undefined : decidedRate >= 70 ? GREEN : AMBER,
                    sub: stats.approved + stats.rejected > 0 ? `${stats.approved} approved · ${stats.rejected} rejected` : 'No decisions yet',
                  },
                  {
                    label: 'Docs on File', value: docStats.tot > 0 ? `${docStats.pct}%` : '—',
                    accent: docStats.tot === 0 ? undefined : docStats.pct >= 80 ? GREEN : AMBER,
                    sub: docStats.tot > 0 ? `${docStats.up} of ${docStats.tot} required documents` : 'No document requests yet',
                  },
                  {
                    label: 'Expiry Pressure', value: String(docStats.expired + docStats.exp30),
                    accent: docStats.expired + docStats.exp30 > 0 ? RED : GREEN,
                    sub: `${docStats.expired} expired · ${docStats.exp30} in 30d · ${docStats.exp60} in 60d`,
                  },
                  {
                    label: 'Templates', value: String(templates.length),
                    sub: templates.length > 0 ? `Avg pass threshold ${avgThreshold}%` : 'Create your first form',
                  },
                  {
                    label: 'Approved Bench', value: String(stats.approved),
                    accent: stats.approved > 0 ? GREEN : undefined,
                    sub: approvedTrades > 0 ? `Covering ${approvedTrades} trade${approvedTrades === 1 ? '' : 's'}` : 'No approved subs yet',
                  },
                ]} />
              )}

              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
                {[
                  { label: 'Total Submissions', value: String(stats.total), icon: <Clipboard size={19} weight="duotone" color={GOLD} />, accent: undefined as string | undefined },
                  { label: 'Pending', value: String(stats.pending), icon: <Clock size={19} weight="duotone" color={AMBER} />, accent: AMBER },
                  { label: 'Under Review', value: String(stats.review), icon: <NotePencil size={19} weight="duotone" color={BLUE} />, accent: BLUE },
                  { label: 'Approved', value: String(stats.approved), icon: <CheckCircle size={19} weight="duotone" color={GREEN} />, accent: GREEN },
                  { label: 'Rejected', value: String(stats.rejected), icon: <XCircle size={19} weight="duotone" color={RED} />, accent: RED },
                  { label: 'Avg Score', value: `${stats.avgScore}%`, icon: <ChartBar size={19} weight="duotone" color={pctColor(stats.avgScore)} />, accent: pctColor(stats.avgScore) },
                  { label: 'Expiring Soon', value: String(stats.expiring), icon: <WarningCircle size={19} weight="duotone" color={stats.expiring > 0 ? RED : GREEN} />, accent: stats.expiring > 0 ? RED : GREEN },
                ].map((s, i) => (
                  <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} accent={s.accent} delay={i * 0.04} />
                ))}
              </div>

              {/* Recent submissions and Expirations side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Recent activity */}
                <SectionCard title="Recent Submissions" icon={<Clipboard size={17} weight="duotone" color={GOLD} />}>
                  {submissions.slice(0, 5).map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)`, cursor: 'pointer' }} onClick={() => { setShowDetail(s.id); }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.sub_name}</div>
                        <div style={{ fontSize: 11, color: DIM }}>{s.sub_trade} — {fmtDate(s.submitted_at)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ScoreBar score={s.total_score} max={s.max_score} />
                        <StatusBadge status={s.status} />
                      </div>
                    </div>
                  ))}
                </SectionCard>

                {/* Expiring certs/insurance */}
                <SectionCard flat title="Expiring Documents" icon={<Clock size={17} weight="duotone" color={GOLD} />}>
                  {/* Expiry outlook buckets — the 90-day insurance/cert horizon at a glance */}
                  {docStats.tot > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {[
                        { l: 'Expired', n: docStats.expired, c: RED },
                        { l: 'Within 30d', n: docStats.exp30, c: AMBER },
                        { l: '31–60d', n: docStats.exp60, c: BLUE },
                        { l: '61–90d', n: docStats.exp90, c: DIM },
                      ].map(b => (
                        <div key={b.l} style={{ flex: '1 1 100px', minWidth: 96, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${b.n > 0 ? `color-mix(in srgb, ${b.c} 33%, transparent)` : BORDER}` }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: b.n > 0 ? b.c : DIM, lineHeight: 1.1 }}>{b.n}</div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM, marginTop: 2 }}>{b.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const expDocs: { subName: string; docName: string; expiresAt: string; daysLeft: number }[] = [];
                    submissions.forEach(s => {
                      s.documents.forEach(d => {
                        if (d.expires_at) {
                          const dl = daysUntil(d.expires_at);
                          if (dl <= 90) expDocs.push({ subName: s.sub_name, docName: d.name, expiresAt: d.expires_at, daysLeft: dl });
                        }
                      });
                    });
                    expDocs.sort((a, b) => a.daysLeft - b.daysLeft);
                    if (expDocs.length === 0) return <div style={{ color: DIM, fontSize: 13, padding: 20, textAlign: 'center' }}>No documents expiring within 90 days</div>;
                    return expDocs.slice(0, 6).map((ed, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{ed.subName}</div>
                          <div style={{ fontSize: 11, color: DIM }}>{ed.docName}</div>
                        </div>
                        <span style={chipS(ed.daysLeft <= 0 ? RED : ed.daysLeft <= 30 ? AMBER : BLUE, ed.daysLeft <= 0 ? RED : ed.daysLeft <= 30 ? AMBER : BLUE)}>
                          {ed.daysLeft <= 0 ? 'Expired' : `${ed.daysLeft}d left`}
                        </span>
                      </div>
                    ));
                  })()}
                </SectionCard>
              </div>

              {/* Score visualization — distribution histogram + per-trade averages */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
              <SectionCard flat title="Score Distribution" subtitle={scoredCount > 0 ? `${scoredCount} scored submission${scoredCount === 1 ? '' : 's'}` : undefined} icon={<ChartBar size={17} weight="duotone" color={GOLD} />}>
                {scoredCount === 0 ? (
                  <div style={{ color: DIM, fontSize: 13, padding: 20, textAlign: 'center' }}>Scores appear here as submissions arrive.</div>
                ) : (
                  <div>
                    {['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'].map((lbl, i) => {
                      const n = scoreBuckets[i];
                      const maxN = Math.max(...scoreBuckets, 1);
                      const c = pctColor(i * 20 + 10);
                      return (
                        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ width: 64, fontSize: 11.5, color: DIM, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{lbl}</span>
                          <div style={{ flex: 1, height: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ width: `${(n / maxN) * 100}%`, height: '100%', background: `linear-gradient(90deg, color-mix(in srgb, ${c} 67%, transparent), ${c})`, borderRadius: 5, transition: 'width .3s' }} />
                          </div>
                          <span style={{ minWidth: 52, fontSize: 12, color: n > 0 ? c : DIM, fontWeight: 700 }}>{n} sub{n === 1 ? '' : 's'}</span>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontSize: 12, color: DIM, lineHeight: 1.5 }}>
                      Average score <b style={{ color: pctColor(stats.avgScore) }}>{stats.avgScore}%</b>
                      {templates.length > 0 && <> against an average pass threshold of <b style={{ color: TEXT }}>{avgThreshold}%</b></>}.
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard flat title="Score by Trade" icon={<ChartBar size={17} weight="duotone" color={GOLD} />}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {Array.from(new Set(submissions.map(s => s.sub_trade))).map(trade => {
                    const tradeSubs = submissions.filter(s => s.sub_trade === trade);
                    const avg = Math.round(tradeSubs.reduce((a, s) => a + (s.max_score > 0 ? (s.total_score / s.max_score) * 100 : 0), 0) / tradeSubs.length);
                    return (
                      <div key={trade} style={{ padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{trade}</span>
                          <span style={{ fontSize: 12, color: DIM }}>{tradeSubs.length} sub{tradeSubs.length !== 1 ? 's' : ''}</span>
                        </div>
                        <ScoreBar score={avg} max={100} />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
              </div>
            </div>
          )}

          {/* ════════ SUBMISSIONS TAB ════════ */}
          {tab === 'submissions' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="Search by name, email, trade…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputS, width: 280 }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...selectS, width: 160 }}>
                  <option value="all">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={{ ...selectS, width: 160 }}>
                  <option value="all">All Trades</option>
                  {Array.from(new Set([...TRADES, ...submissions.map(s => s.sub_trade).filter(Boolean)])).sort((a, b) => a.localeCompare(b)).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Min Score %" type="number" value={scoreMin} onChange={e => setScoreMin(e.target.value)} style={{ ...inputS, width: 120 }} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button style={ghostButtonStyle} className="pmBtn" onClick={() => handleExport('csv')}>Export CSV</button>
                  <button style={ghostButtonStyle} className="pmBtn" onClick={() => handleExport('pdf')}>Print</button>
                </div>
              </div>

              {/* Filtered-set intelligence — the list on screen, quantified: status mix,
                  scoring vs threshold, docs compliance, and prequal-expiry pressure */}
              {filtered.length > 0 && (() => {
                const fApproved = filtered.filter(s => s.status === 'approved').length;
                const fPending = filtered.filter(s => s.status === 'pending').length;
                const fReview = filtered.filter(s => s.status === 'under_review').length;
                const fScored = filtered.filter(s => s.max_score > 0);
                const fAvg = fScored.length > 0 ? Math.round(fScored.reduce((a, s) => a + (s.total_score / s.max_score) * 100, 0) / fScored.length) : 0;
                const fPass = avgThreshold > 0 ? fScored.filter(s => (s.total_score / s.max_score) * 100 >= avgThreshold).length : 0;
                let fDocsUp = 0, fDocsTot = 0;
                filtered.forEach(s => { fDocsTot += s.documents.length; fDocsUp += s.documents.filter(d => d.uploaded).length; });
                const fExpiring = filtered.filter(s => s.expires_at && daysUntil(s.expires_at) <= 30).length;
                return (
                  <StatStrip items={[
                    { label: 'Showing', value: `${filtered.length} of ${submissions.length}`, sub: `${fPending} pending · ${fReview} in review · ${fApproved} approved` },
                    { label: 'Avg Score (shown)', value: fScored.length > 0 ? `${fAvg}%` : '—', accent: fScored.length > 0 ? pctColor(fAvg) : undefined, sub: avgThreshold > 0 && fScored.length > 0 ? `${fPass} of ${fScored.length} clear the ${avgThreshold}% threshold` : 'No scored submissions in view' },
                    { label: 'Docs Complete', value: fDocsTot > 0 ? `${Math.round((fDocsUp / fDocsTot) * 100)}%` : '—', accent: fDocsTot === 0 ? undefined : fDocsUp === fDocsTot ? GREEN : AMBER, sub: fDocsTot > 0 ? `${fDocsUp} of ${fDocsTot} required documents uploaded` : 'No documents requested' },
                    { label: 'Prequals Expiring', value: String(fExpiring), accent: fExpiring > 0 ? RED : GREEN, sub: fExpiring > 0 ? 'Within 30 days — request a renewal' : 'None within 30 days' },
                  ]} />
                );
              })()}

              {filtered.length === 0 ? (
                <SectionCard>
                  <PremiumEmpty icon={<Clipboard size={30} weight="duotone" color={GOLD} />} title="No Submissions Found" description={search || statusFilter !== 'all' || tradeFilter !== 'all' ? 'Try adjusting your filters.' : 'Invite subcontractors to complete a scored questionnaire — answers grade automatically against your pass threshold, required documents are tracked with expiry dates, and every submission lands here for review.'} action={search || statusFilter !== 'all' || tradeFilter !== 'all' ? undefined : <button style={goldOutlineButtonStyle} className="pmBtn" onClick={() => setShowInviteModal(true)}><Envelope size={15} weight="fill" /> Send Prequal Form</button>} />
                </SectionCard>
              ) : (
                <SectionCard flush>
                <DataTable<Submission>
                  columns={columns}
                  rows={filtered}
                  rowKey={s => s.id}
                  defaultSort={{ key: 'submitted_at', dir: 'desc' }}
                  onRowClick={s => setShowDetail(s.id)}
                  isSelected={s => showDetail === s.id}
                  empty="No submissions match."
                />
                </SectionCard>
              )}
            </div>
          )}

          {/* ════════ TEMPLATES TAB ════════ */}
          {tab === 'templates' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ color: DIM, fontSize: 13 }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
                <button style={goldButtonStyle} className="pmBtn" onClick={() => { setEditTemplate(null); setShowTemplateBuilder(true); }}><Plus size={15} weight="bold" /> New Template</button>
              </div>
              {templates.length === 0 ? (
                <SectionCard>
                  <PremiumEmpty
                    icon={<NotePencil size={30} weight="duotone" color={GOLD} />}
                    title="No Templates Yet"
                    description="Create a prequalification questionnaire template to get started."
                    action={<button style={goldButtonStyle} className="pmBtn" onClick={() => { setEditTemplate(null); setShowTemplateBuilder(true); }}><Plus size={15} weight="bold" /> New Template</button>}
                  />
                </SectionCard>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  {templates.map(t => (
                    <div key={t.id} className="lift" style={{ ...cardS, cursor: 'pointer' }} onClick={() => { setEditTemplate(t); setShowTemplateBuilder(true); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{t.name}</div>
                          <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{t.description}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM, marginBottom: 10 }}>
                        <span>{t.questions.length} questions</span>
                        <span>Threshold: {t.threshold}%</span>
                        <span>{t.requiredDocs.length} required docs</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {CATEGORIES.map(c => {
                          const cnt = t.questions.filter(q => q.category === c).length;
                          if (!cnt) return null;
                          return <span key={c} style={chipS(CATEGORY_COLORS[c], CATEGORY_COLORS[c])}>{c}: {cnt}</span>;
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: DIM, marginTop: 10 }}>Created {fmtDate(t.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════ INVITES TAB ════════ */}
          {tab === 'invites' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ color: DIM, fontSize: 13 }}>{invites.length} invite{invites.length !== 1 ? 's' : ''} sent</span>
                <button style={goldOutlineButtonStyle} className="pmBtn" onClick={() => setShowInviteModal(true)}><Envelope size={15} weight="fill" /> Send Prequal Form</button>
              </div>
              {/* Invite funnel — where every sent prequal form stands right now */}
              {invites.length > 0 && (() => {
                const iOpened = invites.filter(i => i.status === 'opened').length;
                const iDone = invites.filter(i => i.status === 'completed').length;
                const iWaiting = invites.length - iDone;
                const tplUsed = new Set(invites.map(i => i.template_id).filter(Boolean)).size;
                const oldest = invites.filter(i => i.status !== 'completed' && i.sent_at)
                  .reduce((m, i) => { const t = new Date(i.sent_at).getTime(); return isNaN(t) ? m : (m === 0 ? t : Math.min(m, t)); }, 0);
                const oldestDays = oldest > 0 ? Math.floor((Date.now() - oldest) / 86400000) : 0;
                return (
                  <StatStrip items={[
                    { label: 'Forms Sent', value: String(invites.length), sub: tplUsed > 0 ? `${tplUsed} template${tplUsed === 1 ? '' : 's'} in use` : 'Awaiting template link' },
                    { label: 'Opened', value: String(iOpened), sub: 'Clicked the secure link, not yet submitted' },
                    { label: 'Submitted', value: String(iDone), accent: iDone > 0 ? GREEN : undefined, sub: `${Math.round((iDone / invites.length) * 100)}% completion rate` },
                    { label: 'Still Waiting', value: String(iWaiting), accent: iWaiting > 0 ? AMBER : GREEN, sub: iWaiting === 0 ? 'Every invite came back' : oldestDays > 0 ? `Oldest outstanding ${oldestDays}d — resend below` : 'Resend from the table below' },
                  ]} />
                );
              })()}

              {invites.length === 0 ? (
                <SectionCard>
                  <PremiumEmpty
                    icon={<Envelope size={30} weight="duotone" color={GOLD} />}
                    title="No Invites Sent"
                    description="Send prequalification forms to subcontractors."
                    action={<button style={goldOutlineButtonStyle} className="pmBtn" onClick={() => setShowInviteModal(true)}><Envelope size={15} weight="fill" /> Send Prequal Form</button>}
                  />
                </SectionCard>
              ) : (
                <SectionCard flush>
                <div style={{ overflowX: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: RAISED }}>
                      <th style={tableHeaderS}>Subcontractor</th>
                      <th style={tableHeaderS}>Email</th>
                      <th style={tableHeaderS}>Template</th>
                      <th style={tableHeaderS}>Sent</th>
                      <th style={tableHeaderS}>Status</th>
                      <th style={tableHeaderS}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map(inv => {
                      const tpl = templates.find(t => t.id === inv.template_id);
                      const statusColor = inv.status === 'completed' ? GREEN : inv.status === 'opened' ? BLUE : inv.status === 'sent' ? DIM : AMBER;
                      const statusLabel = inv.status === 'completed' ? 'Submitted' : inv.status === 'pending' ? 'Not Sent' : inv.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                      return (
                        <tr key={inv.id}>
                          <td style={tableCellS}>{inv.sub_name}</td>
                          <td style={tableCellS}>{inv.email}</td>
                          <td style={tableCellS}>{tpl?.name || inv.template_id}</td>
                          <td style={tableCellS}>{fmtDate(inv.sent_at)}</td>
                          <td style={tableCellS}><span style={chipS(statusColor, statusColor)}>{statusLabel}</span></td>
                          <td style={tableCellS}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {inv.token && (
                                <button style={{ ...btnS(BORDER, TEXT), padding: '4px 12px', fontSize: 11 }} onClick={() => copyInviteLink(inv)}>Copy Link</button>
                              )}
                              {inv.status !== 'completed' && (
                                <button style={{ ...btnS(BORDER, TEXT), padding: '4px 12px', fontSize: 11 }} onClick={() => sendInvite(inv.email, inv.sub_name, inv.template_id)}>Resend</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                </SectionCard>
              )}
            </div>
          )}
        </>
      )}
    </PremiumSurface>

      {/* ════════ DETAIL MODAL ════════ */}
      {showDetail && detailSub && (
        <div style={modalOverlay} onClick={() => setShowDetail(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Prequalification — ${detailSub.sub_name}`} style={{ ...modalBox, maxWidth: 880 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>{detailSub.sub_name}</h2>
                <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>{detailSub.sub_email} — {detailSub.sub_trade}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge status={detailSub.status} />
                <button type="button" aria-label="Close" style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDetail(null)}><X size={20} weight="regular" color={DIM} /></button>
              </div>
            </div>

            {/* Score overview + Radar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: DIM, marginBottom: 8 }}>Overall Score</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 42, fontWeight: 800, color: pctColor(detailSub.max_score > 0 ? (detailSub.total_score / detailSub.max_score) * 100 : 0) }}>
                    {detailSub.max_score > 0 ? Math.round((detailSub.total_score / detailSub.max_score) * 100) : 0}%
                  </span>
                  <span style={{ fontSize: 14, color: DIM }}>{detailSub.total_score} / {detailSub.max_score} pts</span>
                </div>
                {/* Category breakdown */}
                {CATEGORIES.map(cat => {
                  const sc = detailSub.scores[cat] || 0;
                  const maxCatScores: Record<string, number> = {};
                  if (detailTemplate) {
                    detailTemplate.questions.forEach(q => { maxCatScores[q.category] = (maxCatScores[q.category] || 0) + q.points; });
                  }
                  const mx = maxCatScores[cat] || 0;
                  if (mx === 0 && sc === 0) return null;
                  return (
                    <div key={cat} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: CATEGORY_COLORS[cat] || DIM, fontWeight: 600 }}>{cat}</span>
                        <span style={{ color: DIM }}>{sc}/{mx}</span>
                      </div>
                      <div style={{ height: 6, background: BG, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: mx > 0 ? `${(sc / mx) * 100}%` : '0%', height: '100%', background: CATEGORY_COLORS[cat] || DIM, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: DIM, marginBottom: 8 }}>Category Radar</div>
                {(() => {
                  const maxCatScores: Record<string, number> = {};
                  if (detailTemplate) {
                    detailTemplate.questions.forEach(q => { maxCatScores[q.category] = (maxCatScores[q.category] || 0) + q.points; });
                  }
                  return <RadarChart scores={detailSub.scores} maxScores={maxCatScores} />;
                })()}
              </div>
            </div>

            {/* Documents */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: DIM, marginBottom: 8 }}>Documents</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {detailSub.documents.map((d, i) => {
                  const dl = d.expires_at ? daysUntil(d.expires_at) : null;
                  return (
                    <div key={i} style={{ padding: '8px 12px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: d.uploaded ? TEXT : RED }}>{d.name}</div>
                        {d.expires_at && <div style={{ fontSize: 10, color: dl !== null && dl <= 30 ? RED : DIM }}>{dl !== null && dl <= 0 ? 'Expired' : `Expires ${fmtDate(d.expires_at)}`}</div>}
                      </div>
                      <span style={{ fontSize: 14, display: 'inline-flex', verticalAlign: 'middle' }}>{d.uploaded ? <CheckCircle size={16} weight="fill" color={GREEN} /> : <XCircle size={16} weight="fill" color={RED} />}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Answers */}
            {detailTemplate && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: DIM, marginBottom: 8 }}>Questionnaire Answers</div>
                <div style={{ background: BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  {detailTemplate.questions.map((q, i) => {
                    const ans = detailSub.answers[q.id];
                    const display = Array.isArray(ans) ? ans.join(', ') : String(ans ?? '—');
                    return (
                      <div key={q.id} style={{ padding: '10px 14px', borderBottom: i < detailTemplate.questions.length - 1 ? `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: TEXT, fontWeight: 600 }}>{q.label}</div>
                          <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                            <span style={chipS(CATEGORY_COLORS[q.category] || DIM, CATEGORY_COLORS[q.category] || DIM)}>{q.category}</span>
                            <span style={{ marginLeft: 8 }}>{q.points} pts</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, maxWidth: 250, textAlign: 'right' }}>{display}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reviewer notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelS}>Reviewer Notes</label>
              <textarea value={detailSub.reviewer_notes} onChange={e => { const v = e.target.value; setSubmissions(prev => prev.map(s => s.id === detailSub.id ? { ...s, reviewer_notes: v } : s)); }} style={{ ...inputS, height: 80, resize: 'vertical' }} placeholder="Add review notes…" />
              <button style={{ ...btnS(BORDER, TEXT), marginTop: 6, fontSize: 12 }} onClick={() => saveReviewerNotes(detailSub.id, detailSub.reviewer_notes)}>Save Notes</button>
            </div>

            {/* Status actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
              {detailSub.status === 'pending' && <button style={btnS(BLUE, TEXT)} onClick={() => { updateStatus(detailSub.id, 'under_review'); }}>Start Review</button>}
              {detailSub.status === 'under_review' && <>
                <button style={btnS(RED, TEXT)} onClick={() => { updateStatus(detailSub.id, 'rejected'); }}>Reject</button>
                <button style={btnS(GREEN, 'var(--bg-base)')} onClick={() => { updateStatus(detailSub.id, 'approved'); }}>Approve</button>
              </>}
              {(detailSub.status === 'approved' || detailSub.status === 'rejected') && (
                <button style={btnS(AMBER, 'var(--bg-base)')} onClick={() => { updateStatus(detailSub.id, 'under_review'); }}>Reopen Review</button>
              )}
              <button style={btnS(BORDER, TEXT)} onClick={() => handleExport('pdf')}>Print / Export</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ TEMPLATE BUILDER MODAL ════════ */}
      {showTemplateBuilder && <TemplateBuilderModal initial={editTemplate} onSave={saveTemplate} onClose={() => { setShowTemplateBuilder(false); setEditTemplate(null); }} />}

      {/* ════════ INVITE MODAL ════════ */}
      {showInviteModal && (
        <InviteModal templates={templates} onSend={sendInvite} onClose={() => setShowInviteModal(false)} />
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TEMPLATE BUILDER MODAL
   ════════════════════════════════════════════════════════════════════ */
function TemplateBuilderModal({ initial, onSave, onClose }: { initial: Template | null; onSave: (t: Template) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [threshold, setThreshold] = useState(initial?.threshold || 70);
  const [questions, setQuestions] = useState<Question[]>(initial?.questions || []);
  const [requiredDocs, setRequiredDocs] = useState<string[]>(initial?.requiredDocs || []);
  const [showAddQ, setShowAddQ] = useState(false);
  const [editQIdx, setEditQIdx] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const builderTitleId = React.useId();
  useEscapeToClose(onClose);

  const addOrUpdateQuestion = (q: Question) => {
    if (editQIdx !== null) {
      setQuestions(prev => prev.map((p, i) => i === editQIdx ? q : p));
      setEditQIdx(null);
    } else {
      setQuestions(prev => [...prev, q]);
    }
    setShowAddQ(false);
  };

  const removeQuestion = (idx: number) => { setQuestions(prev => prev.filter((_, i) => i !== idx)); };
  const moveQ = (idx: number, dir: -1 | 1) => {
    const ni = idx + dir; if (ni < 0 || ni >= questions.length) return;
    const arr = [...questions]; [arr[idx], arr[ni]] = [arr[ni], arr[idx]]; setQuestions(arr);
  };

  const toggleDoc = (doc: string) => {
    setRequiredDocs(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
  };

  /* The reason a save is refused used to print at the TOP of the dialog — on a
     phone, a screen above the Save button the user just tapped, so the tap
     looked dead. It now sits beside the buttons and the cursor goes to the
     thing to fix. */
  const handleSave = () => {
    if (!name.trim()) { setErr('Give the template a name.'); document.getElementById('pq-tpl-name')?.focus(); return; }
    if (questions.length === 0) { setErr('Add at least one question — the form is scored on its questions.'); document.getElementById('pq-add-question')?.focus(); return; }
    setErr('');
    const tpl: Template = {
      id: initial?.id || `tpl-${uid()}`, name: name.trim(), description: description.trim(),
      questions, threshold, requiredDocs, created_at: initial?.created_at || new Date().toISOString(),
    };
    onSave(tpl);
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      {/* A dialog to keyboards, screen readers and the phone: it was a bare
          overlay, so nothing knew it was open over the page. */}
      <div role="dialog" aria-modal="true" aria-labelledby={builderTitleId} style={{ ...modalBox, maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 id={builderTitleId} style={{ margin: 0, fontSize: 20, fontWeight: 800, color: GOLD }}>{initial ? 'Edit Template' : 'New Prequal Template'}</h2>
          <button aria-label="Close" style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', minWidth: 44, minHeight: 44 }} onClick={onClose}><X size={20} weight="regular" color={DIM} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
          <div><label htmlFor="pq-tpl-name" style={labelS}>Template Name *</label><input id="pq-tpl-name" value={name} onChange={e => { setName(e.target.value); if (err) setErr(''); }} style={inputS} placeholder="e.g., Standard Subcontractor Prequal" aria-required="true" aria-invalid={err && !name.trim() ? true : undefined} /></div>
          <div><label htmlFor="pq-tpl-threshold" style={labelS}>Pass Threshold (%)</label><input id="pq-tpl-threshold" type="number" inputMode="numeric" value={threshold} onChange={e => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} style={inputS} min={0} max={100} /></div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputS, height: 50, resize: 'vertical' }} placeholder="Brief description of this form…" />
        </div>

        {/* Required docs */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Required Documents</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEFAULT_DOCS.map(doc => (
              <button key={doc} onClick={() => toggleDoc(doc)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${requiredDocs.includes(doc) ? GOLD : BORDER}`, background: requiredDocs.includes(doc) ? `color-mix(in srgb, ${GOLD} 13%, transparent)` : 'transparent', color: requiredDocs.includes(doc) ? GOLD : DIM, cursor: 'pointer' }}>{doc}</button>
            ))}
          </div>
        </div>

        {/* Questions */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={labelS}>Questions ({questions.length}) *</label>
            <button id="pq-add-question" style={{ ...btnS(BLUE, TEXT), padding: '5px 14px', fontSize: 12, minHeight: 44 }} onClick={() => { setEditQIdx(null); setShowAddQ(true); if (err) setErr(''); }}>+ Add Question</button>
          </div>
          {questions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: DIM, fontSize: 13, background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>No questions yet — a template needs at least one. Tap &ldquo;+ Add Question&rdquo; to start.</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {questions.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0 }} onClick={() => moveQ(i, -1)}><CaretUp size={12} weight="fill" color={DIM} /></button>
                    <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0 }} onClick={() => moveQ(i, 1)}><CaretDown size={12} weight="fill" color={DIM} /></button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{q.label}</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                      <span style={chipS(CATEGORY_COLORS[q.category] || DIM, CATEGORY_COLORS[q.category] || DIM)}>{q.category}</span>
                      <span style={{ marginLeft: 8 }}>{q.type}</span>
                      <span style={{ marginLeft: 8 }}>{q.points} pts</span>
                      {q.required && <span style={{ marginLeft: 8, color: RED }}>Required</span>}
                    </div>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 12 }} onClick={() => { setEditQIdx(i); setShowAddQ(true); }}>Edit</button>
                  <button style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 12 }} onClick={() => removeQuestion(i)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <div role="alert" style={{ background: `color-mix(in srgb, ${RED} 13%, transparent)`, border: `1px solid ${RED}`, color: RED, padding: '8px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
          <button style={{ ...btnS(BORDER, TEXT), minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button style={{ ...btnS(GOLD), minHeight: 44 }} onClick={handleSave}>Save Template</button>
        </div>

        {/* Add/Edit Question sub-modal */}
        {showAddQ && <QuestionEditor initial={editQIdx !== null ? questions[editQIdx] : null} onSave={addOrUpdateQuestion} onClose={() => { setShowAddQ(false); setEditQIdx(null); }} />}
      </div>
    </div>
  );
}

/* ─── Question Editor ─── */
function QuestionEditor({ initial, onSave, onClose }: { initial: Question | null; onSave: (q: Question) => void; onClose: () => void }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [type, setType] = useState<QType>(initial?.type || 'text');
  const [category, setCategory] = useState(initial?.category || CATEGORIES[0]);
  const [required, setRequired] = useState(initial?.required ?? true);
  const [points, setPoints] = useState(initial?.points || 10);
  const [options, setOptions] = useState(initial?.options?.join(', ') || '');
  const [err, setErr] = useState('');
  const qTitleId = React.useId();
  useEscapeToClose(onClose);

  const handleSave = () => {
    if (!label.trim()) { setErr('Question text is required.'); return; }
    if (type === 'multi_choice' && !options.trim()) { setErr('Options are required for multiple choice.'); return; }
    const q: Question = {
      id: initial?.id || `q-${uid()}`, label: label.trim(), type, category, required, points,
      options: type === 'multi_choice' ? options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
      scoringKey: type === 'yes_no' ? { Yes: points, No: 0 } : undefined,
    };
    onSave(q);
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={qTitleId} style={{ ...modalBox, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <h3 id={qTitleId} style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: GOLD }}>{initial ? 'Edit Question' : 'Add Question'}</h3>
        {err && <div role="alert" style={{ background: `color-mix(in srgb, ${RED} 13%, transparent)`, color: RED, padding: '6px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>Question Text</label>
          <textarea value={label} onChange={e => setLabel(e.target.value)} style={{ ...inputS, height: 60, resize: 'vertical' }} placeholder="Enter question…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelS}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as QType)} style={selectS}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="yes_no">Yes / No</option>
              <option value="rating">Rating (1–5)</option>
              <option value="file_upload">File Upload</option>
              <option value="multi_choice">Multiple Choice</option>
            </select>
          </div>
          <div>
            <label style={labelS}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={selectS}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelS}>Points</label>
            <input type="number" value={points} onChange={e => setPoints(Number(e.target.value))} style={inputS} min={0} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} id="reqCheck" />
            <label htmlFor="reqCheck" style={{ fontSize: 13, color: TEXT, cursor: 'pointer' }}>Required</label>
          </div>
        </div>
        {type === 'multi_choice' && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelS}>Options (comma-separated)</label>
            <input value={options} onChange={e => setOptions(e.target.value)} style={inputS} placeholder="Option 1, Option 2, Option 3" />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          <button style={btnS(BORDER, TEXT)} onClick={onClose}>Cancel</button>
          <button style={btnS(GOLD)} onClick={handleSave}>{initial ? 'Update' : 'Add'} Question</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   INVITE MODAL
   ════════════════════════════════════════════════════════════════════ */
function InviteModal({ templates, onSend, onClose }: { templates: Template[]; onSend: (email: string, subName: string, templateId: string) => Promise<void> | void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [subName, setSubName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const titleId = React.useId();

  // Announced as a dialog and closable with Escape (it was an unlabelled
  // overlay with a ~22px close glyph).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  // "Sending…" now covers the real request, not a fixed 600ms pause before it.
  const handleSend = async () => {
    if (!EMAIL_RE.test(email.trim())) { setErr('Enter a valid email address — the secure invite link is delivered there.'); return; }
    if (!subName.trim()) { setErr('Subcontractor name is required.'); return; }
    if (!templateId) { setErr('Select a template.'); return; }
    setErr('');
    setSending(true);
    try { await onSend(email.trim(), subName.trim(), templateId); }
    finally { setSending(false); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ ...modalBox, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 800, color: GOLD }}>Send Prequal Form</h2>
          <button type="button" aria-label="Close" style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '-10px -10px -10px 0' }} onClick={onClose}><X size={20} weight="regular" color={DIM} /></button>
        </div>
        {err && <div role="alert" style={{ background: `color-mix(in srgb, ${RED} 13%, transparent)`, color: RED, padding: '6px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <div style={{ marginBottom: 14 }}>
          <label style={labelS}>Subcontractor Name</label>
          <input value={subName} onChange={e => setSubName(e.target.value)} style={inputS} placeholder="e.g., ABC Plumbing" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelS}>Email Address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputS} placeholder="sub@example.com" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Prequal Template</label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={selectS}>
            {templates.length === 0 && <option value="">No templates available</option>}
            {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.questions.length} questions)</option>)}
          </select>
          {templates.length === 0 ? (
            <p style={{ color: AMBER, fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5 }}>No templates yet — create one first (New Template). The form needs scored questions before it can be sent.</p>
          ) : (
            (() => { const t = templates.find(x => x.id === templateId); return t ? (
              <p style={{ color: DIM, fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5 }}>Pass threshold {t.threshold}% · {t.requiredDocs.length} required document{t.requiredDocs.length === 1 ? '' : 's'}. Their answers score automatically on submit.</p>
            ) : null; })()
          )}
        </div>

        <div style={{ background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 6 }}>Email Preview</div>
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 6px' }}>Dear <strong>{subName || '[Sub Name]'}</strong>,</p>
            <p style={{ margin: '0 0 6px' }}>You have been invited to complete a prequalification questionnaire. Please click the secure link in the email to submit your information, certifications, and insurance documentation.</p>
            <p style={{ margin: '0 0 6px', color: BLUE, textDecoration: 'underline' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/prequal/&lt;secure-link&gt;</p>
            <p style={{ margin: 0, color: DIM, fontSize: 12 }}>A unique, secure link is generated for each subcontractor when you send.</p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" style={{ ...btnS(BORDER, TEXT), minHeight: 44 }} onClick={onClose} disabled={sending}>Cancel</button>
          <button type="button" style={{ ...btnS(BLUE, TEXT), minHeight: 44 }} onClick={() => void handleSend()} disabled={sending}>{sending ? 'Sending…' : 'Send Invitation'}</button>
        </div>
      </div>
    </div>
  );
}