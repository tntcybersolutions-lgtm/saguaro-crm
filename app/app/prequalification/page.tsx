'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CONTRACTOR_TRADES as TRADES } from '@/lib/contractor-trades';

/* ─── Palette ─── */
const GOLD = '#D4A017', BG = '#07101C', RAISED = '#0D1D2E', BORDER = '#1E3A5F',
  TEXT = '#F0F4FF', DIM = '#8BAAC8', GREEN = '#22C55E', RED = '#EF4444',
  AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#8B5CF6';

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
interface Invite { id: string; email: string; sub_name: string; template_id: string; sent_at: string; status: 'sent' | 'opened' | 'completed' }

/* ─── Constants ─── */
const CATEGORIES = ['Insurance', 'Bonding', 'Safety', 'References', 'Certifications'] as const;
// TRADES imported from @/lib/contractor-trades
const DEFAULT_DOCS = ['Certificate of Insurance (COI)', 'Performance Bond Letter', 'Safety Record / OSHA Logs', 'References (3+)', 'W-9 Form', 'Business License', 'EMR Letter', 'OSHA 300 Log'];
const CATEGORY_COLORS: Record<string, string> = { Insurance: BLUE, Bonding: PURPLE, Safety: GREEN, References: GOLD, Certifications: AMBER };
const STATUS_COLORS: Record<string, string> = { pending: AMBER, under_review: BLUE, approved: GREEN, rejected: RED };
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected' };

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
function daysUntil(d: string) { if (!d) return 999; return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); }
function pctColor(pct: number) { return pct >= 80 ? GREEN : pct >= 60 ? AMBER : RED; }

/* ─── Shared Styles ─── */
const inputS: React.CSSProperties = { padding: '9px 13px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const btnS = (bg: string, c: string = '#000'): React.CSSProperties => ({ padding: '8px 18px', background: bg, color: c, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' });
const cardS: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 10 };
const chipS = (bg: string, c: string): React.CSSProperties => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: bg + '22', color: c });
const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, width: '90%', maxWidth: 700, maxHeight: '85vh', overflowY: 'auto', color: TEXT };
const selectS: React.CSSProperties = { ...inputS, appearance: 'auto' as any };
const labelS: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block', fontWeight: 600 };
const tableHeaderS: React.CSSProperties = { padding: '10px 14px', fontSize: 12, fontWeight: 700, color: DIM, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const tableCellS: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: TEXT, borderBottom: `1px solid ${BORDER}15`, whiteSpace: 'nowrap' };

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

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14 }}>{sub}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: 60, color: GOLD, fontSize: 16, fontWeight: 600 }}>Loading...</div>;
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
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={GOLD + '33'} stroke={GOLD} strokeWidth={2} />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={GOLD} />)}
    </svg>
  );
}

/* ─── Mock Data Generators ─── */
function makeMockTemplates(): Template[] {
  return [
    {
      id: 'tpl-001', name: 'Standard Subcontractor Prequal', description: 'Full prequalification questionnaire for general subcontractors',
      questions: [
        { id: 'q1', label: 'Do you carry General Liability Insurance ($1M+ per occurrence)?', type: 'yes_no', required: true, category: 'Insurance', points: 15, scoringKey: { Yes: 15, No: 0 } },
        { id: 'q2', label: 'What is your current bonding capacity?', type: 'number', required: true, category: 'Bonding', points: 10 },
        { id: 'q3', label: 'What is your Experience Modification Rate (EMR)?', type: 'number', required: true, category: 'Safety', points: 20 },
        { id: 'q4', label: 'How many years in business?', type: 'number', required: true, category: 'References', points: 10 },
        { id: 'q5', label: 'List 3 recent project references with contact info', type: 'text', required: true, category: 'References', points: 15 },
        { id: 'q6', label: 'Do you hold OSHA 30 certification?', type: 'yes_no', required: true, category: 'Certifications', points: 10, scoringKey: { Yes: 10, No: 0 } },
        { id: 'q7', label: 'Safety program rating', type: 'rating', required: true, category: 'Safety', points: 10 },
        { id: 'q8', label: 'Workers\' Compensation coverage?', type: 'yes_no', required: true, category: 'Insurance', points: 10, scoringKey: { Yes: 10, No: 0 } },
      ],
      threshold: 70, requiredDocs: DEFAULT_DOCS.slice(0, 5), created_at: '2025-11-01T10:00:00Z',
    },
    {
      id: 'tpl-002', name: 'Specialty Trade Prequal', description: 'Abbreviated form for specialty trade subcontractors',
      questions: [
        { id: 'sq1', label: 'Do you carry trade-specific liability coverage?', type: 'yes_no', required: true, category: 'Insurance', points: 20, scoringKey: { Yes: 20, No: 0 } },
        { id: 'sq2', label: 'Years of experience in your specialty', type: 'number', required: true, category: 'References', points: 15 },
        { id: 'sq3', label: 'Current certifications (select all)', type: 'multi_choice', required: true, category: 'Certifications', points: 15, options: ['OSHA 10', 'OSHA 30', 'First Aid/CPR', 'Trade License', 'Journeyman Card'] },
        { id: 'sq4', label: 'Upload safety manual', type: 'file_upload', required: false, category: 'Safety', points: 10 },
        { id: 'sq5', label: 'EMR rate', type: 'number', required: true, category: 'Safety', points: 20 },
        { id: 'sq6', label: 'Bonding capacity', type: 'number', required: false, category: 'Bonding', points: 10 },
      ],
      threshold: 65, requiredDocs: DEFAULT_DOCS.slice(0, 3), created_at: '2025-12-10T08:00:00Z',
    },
  ];
}

function makeMockSubmissions(): Submission[] {
  return [
    { id: 's-001', sub_name: 'Apex Electrical LLC', sub_email: 'bids@apexelectric.com', sub_trade: 'Electrical', status: 'approved', submitted_at: '2026-01-15T10:00:00Z', expires_at: '2027-01-15T10:00:00Z', total_score: 88, max_score: 100, scores: { Insurance: 25, Bonding: 10, Safety: 25, References: 18, Certifications: 10 }, answers: { q1: 'Yes', q2: 2000000, q3: 0.82, q4: 18, q5: 'ABC Corp (555-1234), DEF Inc (555-5678), GHI LLC (555-9012)', q6: 'Yes', q7: 4, q8: 'Yes' }, documents: [{ name: 'COI', uploaded: true, expires_at: '2026-12-01' }, { name: 'Bond Letter', uploaded: true }, { name: 'OSHA Logs', uploaded: true }, { name: 'W-9', uploaded: true }], notes: 'Strong safety record', template_id: 'tpl-001', reviewer_notes: 'Excellent electrical contractor. Approved for all project types.' },
    { id: 's-002', sub_name: 'Ironclad Concrete', sub_email: 'info@ironcladconcrete.com', sub_trade: 'Concrete', status: 'under_review', submitted_at: '2026-02-20T14:00:00Z', expires_at: '2027-02-20T14:00:00Z', total_score: 72, max_score: 100, scores: { Insurance: 20, Bonding: 5, Safety: 22, References: 15, Certifications: 10 }, answers: { q1: 'Yes', q2: 500000, q3: 1.05, q4: 8, q5: 'Project Alpha (ref available), Beta Towers (ref available), Gamma Plaza (ref available)', q6: 'Yes', q7: 3, q8: 'Yes' }, documents: [{ name: 'COI', uploaded: true, expires_at: '2026-06-15' }, { name: 'Bond Letter', uploaded: false }, { name: 'OSHA Logs', uploaded: true }], notes: 'EMR slightly high', template_id: 'tpl-001', reviewer_notes: '' },
    { id: 's-003', sub_name: 'Summit HVAC Services', sub_email: 'prequal@summithvac.com', sub_trade: 'HVAC', status: 'pending', submitted_at: '2026-03-05T09:30:00Z', expires_at: '2027-03-05T09:30:00Z', total_score: 58, max_score: 90, scores: { Insurance: 20, Bonding: 0, Safety: 18, References: 10, Certifications: 10 }, answers: { sq1: 'Yes', sq2: 12, sq3: ['OSHA 30', 'Trade License'], sq4: 'safety_manual.pdf', sq5: 0.95, sq6: 0 }, documents: [{ name: 'COI', uploaded: true, expires_at: '2026-04-01' }, { name: 'Bond Letter', uploaded: false }], notes: '', template_id: 'tpl-002', reviewer_notes: '' },
    { id: 's-004', sub_name: 'Precision Plumbing Co', sub_email: 'admin@precisionplumbing.com', sub_trade: 'Plumbing', status: 'rejected', submitted_at: '2026-01-10T11:00:00Z', expires_at: '2027-01-10T11:00:00Z', total_score: 35, max_score: 100, scores: { Insurance: 0, Bonding: 5, Safety: 10, References: 10, Certifications: 10 }, answers: { q1: 'No', q2: 100000, q3: 1.45, q4: 3, q5: 'One reference only', q6: 'No', q7: 2, q8: 'No' }, documents: [{ name: 'COI', uploaded: false }, { name: 'Bond Letter', uploaded: false }], notes: 'Missing insurance', template_id: 'tpl-001', reviewer_notes: 'Insufficient insurance coverage and high EMR. Does not meet minimum requirements.' },
    { id: 's-005', sub_name: 'TopCoat Painting Inc', sub_email: 'bids@topcoatpainting.com', sub_trade: 'Painting', status: 'pending', submitted_at: '2026-03-10T16:00:00Z', expires_at: '2027-03-10T16:00:00Z', total_score: 62, max_score: 90, scores: { Insurance: 20, Bonding: 10, Safety: 12, References: 10, Certifications: 10 }, answers: { sq1: 'Yes', sq2: 5, sq3: ['OSHA 10', 'First Aid/CPR'], sq4: '', sq5: 1.1, sq6: 250000 }, documents: [{ name: 'COI', uploaded: true, expires_at: '2026-09-30' }], notes: '', template_id: 'tpl-002', reviewer_notes: '' },
    { id: 's-006', sub_name: 'SteelPro Fabricators', sub_email: 'ops@steelpro.com', sub_trade: 'Steel', status: 'approved', submitted_at: '2025-12-01T08:00:00Z', expires_at: '2026-12-01T08:00:00Z', total_score: 95, max_score: 100, scores: { Insurance: 25, Bonding: 10, Safety: 30, References: 20, Certifications: 10 }, answers: { q1: 'Yes', q2: 5000000, q3: 0.72, q4: 25, q5: 'Major refs across 20 projects', q6: 'Yes', q7: 5, q8: 'Yes' }, documents: [{ name: 'COI', uploaded: true, expires_at: '2026-05-15' }, { name: 'Bond Letter', uploaded: true }, { name: 'OSHA Logs', uploaded: true }, { name: 'W-9', uploaded: true }, { name: 'Business License', uploaded: true }], notes: 'Premium sub', template_id: 'tpl-001', reviewer_notes: 'Top-tier subcontractor. Excellent on every metric.' },
  ];
}

function makeMockInvites(): Invite[] {
  return [
    { id: 'inv-1', email: 'bids@deltamech.com', sub_name: 'Delta Mechanical', template_id: 'tpl-001', sent_at: '2026-03-10T12:00:00Z', status: 'sent' },
    { id: 'inv-2', email: 'info@blueridgeroofing.com', sub_name: 'Blue Ridge Roofing', template_id: 'tpl-002', sent_at: '2026-03-08T09:00:00Z', status: 'opened' },
    { id: 'inv-3', email: 'prequal@summithvac.com', sub_name: 'Summit HVAC Services', template_id: 'tpl-002', sent_at: '2026-02-28T14:00:00Z', status: 'completed' },
  ];
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
      const [tRes, sRes] = await Promise.allSettled([
        fetch('/api/prequalification/templates'),
        fetch('/api/prequalification/submissions'),
      ]);
      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        const d = await tRes.value.json(); setTemplates(d.templates ?? d ?? []);
      } else { setTemplates(makeMockTemplates()); }
      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        const d = await sRes.value.json(); setSubmissions(d.submissions ?? d ?? []);
      } else { setSubmissions(makeMockSubmissions()); }
      setInvites(makeMockInvites());
    } catch (e: any) {
      setError(e.message);
      setTemplates(makeMockTemplates());
      setSubmissions(makeMockSubmissions());
      setInvites(makeMockInvites());
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

  /* ─── Status change ─── */
  const updateStatus = async (id: string, newStatus: SubStatus) => {
    try {
      await fetch(`/api/prequalification/submissions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      }).catch(() => {});
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
      showToast(`Submission status updated to ${STATUS_LABELS[newStatus]}`);
    } catch { showToast('Status updated locally'); }
  };

  /* ─── Save reviewer notes ─── */
  const saveReviewerNotes = (id: string, notes: string) => {
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, reviewer_notes: notes } : s));
    showToast('Reviewer notes saved');
  };

  /* ─── Send invite ─── */
  const sendInvite = (email: string, subName: string, templateId: string) => {
    const inv: Invite = { id: `inv-${uid()}`, email, sub_name: subName, template_id: templateId, sent_at: new Date().toISOString(), status: 'sent' };
    setInvites(prev => [inv, ...prev]);
    fetch('/api/prequalification/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inv),
    }).catch(() => {});
    showToast(`Prequal form sent to ${email}`);
    setShowInviteModal(false);
  };

  /* ─── Save template ─── */
  const saveTemplate = (tpl: Template) => {
    if (templates.find(t => t.id === tpl.id)) {
      setTemplates(prev => prev.map(t => t.id === tpl.id ? tpl : t));
    } else {
      setTemplates(prev => [...prev, tpl]);
    }
    fetch('/api/prequalification/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tpl),
    }).catch(() => {});
    showToast(`Template "${tpl.name}" saved`);
    setShowTemplateBuilder(false);
    setEditTemplate(null);
  };

  /* ─── Export simulation ─── */
  const handleExport = (format: 'csv' | 'pdf') => {
    showToast(`Exporting ${filtered.length} submissions as ${format.toUpperCase()}...`);
  };

  /* ─── Detail sub ─── */
  const detailSub = submissions.find(s => s.id === showDetail);
  const detailTemplate = detailSub ? templates.find(t => t.id === detailSub.template_id) : null;

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '24px 32px', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' }}>
      {/* Toast */}
      {toast && <div style={{ position: 'fixed', top: 20, right: 20, background: GREEN + '22', border: `1px solid ${GREEN}`, color: GREEN, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 2000 }}>{toast}</div>}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: GOLD, margin: 0 }}>Subcontractor Prequalification</h1>
          <p style={{ color: DIM, fontSize: 14, margin: '4px 0 0' }}>Manage prequal forms, review submissions, and track subcontractor qualifications</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btnS(BLUE, TEXT)} onClick={() => setShowInviteModal(true)}>Send Prequal Form</button>
          <button style={btnS(GOLD)} onClick={() => { setEditTemplate(null); setShowTemplateBuilder(true); }}>+ New Template</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `2px solid ${BORDER}` }}>
        {(['dashboard', 'submissions', 'templates', 'invites'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 24px', background: 'none', border: 'none', color: tab === t ? GOLD : DIM, fontWeight: 700, fontSize: 14, cursor: 'pointer', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', marginBottom: -2, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {loading ? <Spinner /> : error && submissions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: RED }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error Loading Data</div>
          <div style={{ fontSize: 14, color: DIM }}>{error}</div>
          <button style={{ ...btnS(GOLD), marginTop: 16 }} onClick={fetchData}>Retry</button>
        </div>
      ) : (
        <>
          {/* ════════ DASHBOARD TAB ════════ */}
          {tab === 'dashboard' && (
            <div>
              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
                {[
                  { label: 'Total Submissions', value: stats.total, color: TEXT },
                  { label: 'Pending', value: stats.pending, color: AMBER },
                  { label: 'Under Review', value: stats.review, color: BLUE },
                  { label: 'Approved', value: stats.approved, color: GREEN },
                  { label: 'Rejected', value: stats.rejected, color: RED },
                  { label: 'Avg Score', value: `${stats.avgScore}%`, color: pctColor(stats.avgScore) },
                  { label: 'Expiring Soon', value: stats.expiring, color: stats.expiring > 0 ? RED : GREEN },
                ].map(s => (
                  <div key={s.label} style={{ ...cardS, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Recent submissions and Expirations side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Recent activity */}
                <div style={cardS}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>Recent Submissions</h3>
                  {submissions.slice(0, 5).map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}22`, cursor: 'pointer' }} onClick={() => { setShowDetail(s.id); }}>
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
                </div>

                {/* Expiring certs/insurance */}
                <div style={cardS}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>Expiring Documents</h3>
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
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}22` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{ed.subName}</div>
                          <div style={{ fontSize: 11, color: DIM }}>{ed.docName}</div>
                        </div>
                        <span style={chipS(ed.daysLeft <= 0 ? RED : ed.daysLeft <= 30 ? AMBER : BLUE, ed.daysLeft <= 0 ? RED : ed.daysLeft <= 30 ? AMBER : BLUE)}>
                          {ed.daysLeft <= 0 ? 'EXPIRED' : `${ed.daysLeft}d left`}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Score distribution by trade */}
              <div style={{ ...cardS, marginTop: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>Score by Trade</h3>
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
              </div>
            </div>
          )}

          {/* ════════ SUBMISSIONS TAB ════════ */}
          {tab === 'submissions' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="Search by name, email, trade..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputS, width: 280 }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...selectS, width: 160 }}>
                  <option value="all">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={{ ...selectS, width: 160 }}>
                  <option value="all">All Trades</option>
                  {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Min Score %" type="number" value={scoreMin} onChange={e => setScoreMin(e.target.value)} style={{ ...inputS, width: 120 }} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button style={btnS(BORDER, TEXT)} onClick={() => handleExport('csv')}>Export CSV</button>
                  <button style={btnS(BORDER, TEXT)} onClick={() => handleExport('pdf')}>Export PDF</button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState icon="📋" title="No Submissions Found" sub={search || statusFilter !== 'all' || tradeFilter !== 'all' ? 'Try adjusting your filters' : 'Send prequal forms to subcontractors to get started'} />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: RAISED }}>
                        <th style={tableHeaderS}>Subcontractor</th>
                        <th style={tableHeaderS}>Trade</th>
                        <th style={tableHeaderS}>Score</th>
                        <th style={tableHeaderS}>Status</th>
                        <th style={tableHeaderS}>Submitted</th>
                        <th style={tableHeaderS}>Docs</th>
                        <th style={tableHeaderS}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(s => {
                        const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0;
                        const docsOk = s.documents.filter(d => d.uploaded).length;
                        const docsTotal = s.documents.length;
                        return (
                          <tr key={s.id} style={{ cursor: 'pointer', transition: 'background .1s' }} onClick={() => setShowDetail(s.id)} onMouseEnter={e => (e.currentTarget.style.background = BG)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={tableCellS}>
                              <div style={{ fontWeight: 600 }}>{s.sub_name}</div>
                              <div style={{ fontSize: 11, color: DIM }}>{s.sub_email}</div>
                            </td>
                            <td style={tableCellS}><span style={chipS(PURPLE, PURPLE)}>{s.sub_trade}</span></td>
                            <td style={tableCellS}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, color: pctColor(pct) }}>{pct}%</span>
                                <span style={{ fontSize: 11, color: DIM }}>({s.total_score}/{s.max_score})</span>
                              </div>
                            </td>
                            <td style={tableCellS}><StatusBadge status={s.status} /></td>
                            <td style={tableCellS}>{fmtDate(s.submitted_at)}</td>
                            <td style={tableCellS}>
                              <span style={{ color: docsOk === docsTotal ? GREEN : AMBER, fontWeight: 600, fontSize: 12 }}>{docsOk}/{docsTotal}</span>
                            </td>
                            <td style={tableCellS} onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {s.status === 'pending' && <button style={{ ...btnS(BLUE + '33', BLUE), padding: '4px 10px', fontSize: 11 }} onClick={() => updateStatus(s.id, 'under_review')}>Review</button>}
                                {s.status === 'under_review' && <>
                                  <button style={{ ...btnS(GREEN + '33', GREEN), padding: '4px 10px', fontSize: 11 }} onClick={() => updateStatus(s.id, 'approved')}>Approve</button>
                                  <button style={{ ...btnS(RED + '33', RED), padding: '4px 10px', fontSize: 11 }} onClick={() => updateStatus(s.id, 'rejected')}>Reject</button>
                                </>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════ TEMPLATES TAB ════════ */}
          {tab === 'templates' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ color: DIM, fontSize: 13 }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
                <button style={btnS(GOLD)} onClick={() => { setEditTemplate(null); setShowTemplateBuilder(true); }}>+ New Template</button>
              </div>
              {templates.length === 0 ? (
                <EmptyState icon="📝" title="No Templates Yet" sub="Create a prequalification questionnaire template to get started" />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  {templates.map(t => (
                    <div key={t.id} style={{ ...cardS, cursor: 'pointer' }} onClick={() => { setEditTemplate(t); setShowTemplateBuilder(true); }}>
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
                <button style={btnS(BLUE, TEXT)} onClick={() => setShowInviteModal(true)}>Send Prequal Form</button>
              </div>
              {invites.length === 0 ? (
                <EmptyState icon="✉️" title="No Invites Sent" sub="Send prequalification forms to subcontractors" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                      const statusColor = inv.status === 'completed' ? GREEN : inv.status === 'opened' ? BLUE : DIM;
                      return (
                        <tr key={inv.id}>
                          <td style={tableCellS}>{inv.sub_name}</td>
                          <td style={tableCellS}>{inv.email}</td>
                          <td style={tableCellS}>{tpl?.name || inv.template_id}</td>
                          <td style={tableCellS}>{fmtDate(inv.sent_at)}</td>
                          <td style={tableCellS}><span style={chipS(statusColor, statusColor)}>{inv.status.toUpperCase()}</span></td>
                          <td style={tableCellS}>
                            {inv.status !== 'completed' && (
                              <button style={{ ...btnS(BORDER, TEXT), padding: '4px 12px', fontSize: 11 }} onClick={() => showToast(`Reminder sent to ${inv.email}`)}>Resend</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ════════ DETAIL MODAL ════════ */}
      {showDetail && detailSub && (
        <div style={modalOverlay} onClick={() => setShowDetail(null)}>
          <div style={{ ...modalBox, maxWidth: 880 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>{detailSub.sub_name}</h2>
                <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>{detailSub.sub_email} — {detailSub.sub_trade}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge status={detailSub.status} />
                <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' }} onClick={() => setShowDetail(null)}>x</button>
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
                        {d.expires_at && <div style={{ fontSize: 10, color: dl !== null && dl <= 30 ? RED : DIM }}>{dl !== null && dl <= 0 ? 'EXPIRED' : `Expires ${fmtDate(d.expires_at)}`}</div>}
                      </div>
                      <span style={{ fontSize: 14 }}>{d.uploaded ? '✓' : '✗'}</span>
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
                      <div key={q.id} style={{ padding: '10px 14px', borderBottom: i < detailTemplate.questions.length - 1 ? `1px solid ${BORDER}22` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              <textarea value={detailSub.reviewer_notes} onChange={e => { const v = e.target.value; setSubmissions(prev => prev.map(s => s.id === detailSub.id ? { ...s, reviewer_notes: v } : s)); }} style={{ ...inputS, height: 80, resize: 'vertical' }} placeholder="Add review notes..." />
              <button style={{ ...btnS(BORDER, TEXT), marginTop: 6, fontSize: 12 }} onClick={() => saveReviewerNotes(detailSub.id, detailSub.reviewer_notes)}>Save Notes</button>
            </div>

            {/* Status actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
              {detailSub.status === 'pending' && <button style={btnS(BLUE, TEXT)} onClick={() => { updateStatus(detailSub.id, 'under_review'); }}>Start Review</button>}
              {detailSub.status === 'under_review' && <>
                <button style={btnS(RED, TEXT)} onClick={() => { updateStatus(detailSub.id, 'rejected'); }}>Reject</button>
                <button style={btnS(GREEN, '#000')} onClick={() => { updateStatus(detailSub.id, 'approved'); }}>Approve</button>
              </>}
              {(detailSub.status === 'approved' || detailSub.status === 'rejected') && (
                <button style={btnS(AMBER, '#000')} onClick={() => { updateStatus(detailSub.id, 'under_review'); }}>Reopen Review</button>
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
    </div>
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

  const handleSave = () => {
    if (!name.trim()) { setErr('Template name is required'); return; }
    if (questions.length === 0) { setErr('Add at least one question'); return; }
    const tpl: Template = {
      id: initial?.id || `tpl-${uid()}`, name: name.trim(), description: description.trim(),
      questions, threshold, requiredDocs, created_at: initial?.created_at || new Date().toISOString(),
    };
    onSave(tpl);
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: GOLD }}>{initial ? 'Edit Template' : 'New Prequal Template'}</h2>
          <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' }} onClick={onClose}>x</button>
        </div>
        {err && <div style={{ background: RED + '22', border: `1px solid ${RED}`, color: RED, padding: '8px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div><label style={labelS}>Template Name</label><input value={name} onChange={e => setName(e.target.value)} style={inputS} placeholder="e.g., Standard Subcontractor Prequal" /></div>
          <div><label style={labelS}>Pass Threshold (%)</label><input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={inputS} min={0} max={100} /></div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputS, height: 50, resize: 'vertical' }} placeholder="Brief description of this form..." />
        </div>

        {/* Required docs */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Required Documents</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEFAULT_DOCS.map(doc => (
              <button key={doc} onClick={() => toggleDoc(doc)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${requiredDocs.includes(doc) ? GOLD : BORDER}`, background: requiredDocs.includes(doc) ? GOLD + '22' : 'transparent', color: requiredDocs.includes(doc) ? GOLD : DIM, cursor: 'pointer' }}>{doc}</button>
            ))}
          </div>
        </div>

        {/* Questions */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={labelS}>Questions ({questions.length})</label>
            <button style={{ ...btnS(BLUE, TEXT), padding: '5px 14px', fontSize: 12 }} onClick={() => { setEditQIdx(null); setShowAddQ(true); }}>+ Add Question</button>
          </div>
          {questions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: DIM, fontSize: 13, background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>No questions yet. Click "+ Add Question" to get started.</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {questions.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0 }} onClick={() => moveQ(i, -1)}>▲</button>
                    <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0 }} onClick={() => moveQ(i, 1)}>▼</button>
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
          <button style={btnS(BORDER, TEXT)} onClick={onClose}>Cancel</button>
          <button style={btnS(GOLD)} onClick={handleSave}>Save Template</button>
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

  const handleSave = () => {
    if (!label.trim()) { setErr('Question text is required'); return; }
    if (type === 'multi_choice' && !options.trim()) { setErr('Options are required for multiple choice'); return; }
    const q: Question = {
      id: initial?.id || `q-${uid()}`, label: label.trim(), type, category, required, points,
      options: type === 'multi_choice' ? options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
      scoringKey: type === 'yes_no' ? { Yes: points, No: 0 } : undefined,
    };
    onSave(q);
  };

  return (
    <div style={{ ...modalOverlay, background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: GOLD }}>{initial ? 'Edit Question' : 'Add Question'}</h3>
        {err && <div style={{ background: RED + '22', color: RED, padding: '6px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={labelS}>Question Text</label>
          <textarea value={label} onChange={e => setLabel(e.target.value)} style={{ ...inputS, height: 60, resize: 'vertical' }} placeholder="Enter question..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelS}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as QType)} style={selectS}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="yes_no">Yes / No</option>
              <option value="rating">Rating (1-5)</option>
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
function InviteModal({ templates, onSend, onClose }: { templates: Template[]; onSend: (email: string, subName: string, templateId: string) => void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [subName, setSubName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    if (!email.trim() || !email.includes('@')) { setErr('Valid email is required'); return; }
    if (!subName.trim()) { setErr('Subcontractor name is required'); return; }
    if (!templateId) { setErr('Select a template'); return; }
    setSending(true);
    setTimeout(() => {
      onSend(email.trim(), subName.trim(), templateId);
      setSending(false);
    }, 600);
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: GOLD }}>Send Prequal Form</h2>
          <button style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' }} onClick={onClose}>x</button>
        </div>
        {err && <div style={{ background: RED + '22', color: RED, padding: '6px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{err}</div>}

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
        </div>

        <div style={{ background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 6 }}>Email Preview</div>
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 6px' }}>Dear <strong>{subName || '[Sub Name]'}</strong>,</p>
            <p style={{ margin: '0 0 6px' }}>You have been invited to complete a prequalification questionnaire. Please click the link below to submit your information, certifications, and insurance documentation.</p>
            <p style={{ margin: '0 0 6px', color: BLUE, textDecoration: 'underline' }}>https://app.saguaro.build/prequal/submit/{templateId || 'template-id'}</p>
            <p style={{ margin: 0, color: DIM, fontSize: 12 }}>This link expires in 30 days.</p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnS(BORDER, TEXT)} onClick={onClose}>Cancel</button>
          <button style={btnS(BLUE, TEXT)} onClick={handleSend} disabled={sending}>{sending ? 'Sending...' : 'Send Invitation'}</button>
        </div>
      </div>
    </div>
  );
}