'use client';
/**
 * Saguaro Field — Subcontractor Prequalification
 * View prequal submissions, insurance status, safety records, bonding,
 * licenses, field ratings, and compliance flags. Offline-capable.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { CONTRACTOR_TRADES as TRADES } from '@/lib/contractor-trades';

/* ── colour tokens ─────────────────────────────────────────────── */
const GOLD   = '#D4A017';
const BG     = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ── inline types ──────────────────────────────────────────────── */
interface License {
  name: string;
  number: string;
  status: 'current' | 'expiring' | 'expired';
  expiration_date: string;
}

interface InsurancePolicy {
  type: string;
  carrier: string;
  policy_number: string;
  status: 'current' | 'expiring' | 'expired';
  expiration_date: string;
  certificate_url?: string;
}

interface SafetyRecord {
  emr_rate: number;
  osha_citations: number;
  incident_rate: number;
  last_updated?: string;
}

interface FieldNote {
  id: string;
  author: string;
  text: string;
  created_at: string;
}

interface Subcontractor {
  id: string;
  company_name: string;
  trade: string;
  contact_name: string;
  phone: string;
  email: string;
  insurance_policies: InsurancePolicy[];
  safety_record: SafetyRecord;
  bonding_capacity: number;
  licenses: License[];
  field_rating: number;
  field_notes: FieldNote[];
  compliance_flagged: boolean;
  compliance_flag_reason?: string;
  status: 'approved' | 'pending' | 'rejected' | 'under_review';
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

type View = 'list' | 'detail' | 'add_note' | 'add_flag';

/* ── helpers ───────────────────────────────────────────────────── */
// TRADES imported from @/lib/contractor-trades

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved', pending: 'Pending', rejected: 'Rejected', under_review: 'Under Review',
};
const STATUS_COLORS: Record<string, string> = {
  approved: GREEN, pending: AMBER, rejected: RED, under_review: BLUE,
};

const INS_STATUS_COLORS: Record<string, string> = {
  current: GREEN, expiring: AMBER, expired: RED,
};

function fmtDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function overallInsuranceStatus(policies: InsurancePolicy[]): 'current' | 'expiring' | 'expired' {
  if (policies.some(p => p.status === 'expired')) return 'expired';
  if (policies.some(p => p.status === 'expiring')) return 'expiring';
  return 'current';
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/* ── star rating component ─────────────────────────────────────── */
function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 2, cursor: readonly ? 'default' : 'pointer' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          onClick={() => !readonly && onChange?.(star)}
          style={{
            fontSize: 22,
            color: star <= value ? GOLD : BORDER,
            transition: 'color 0.15s',
          }}
        >
          {'\u2605'}
        </span>
      ))}
    </div>
  );
}

/* ── main inner component ──────────────────────────────────────── */
function PrequalInner() {
  const sp = useSearchParams();
  const projectId = sp.get('projectId') || '';

  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selectedSub, setSelectedSub] = useState<Subcontractor | null>(null);

  /* filters */
  const [search, setSearch] = useState('');
  const [filterTrade, setFilterTrade] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRating, setFilterRating] = useState(0);
  const [filterInsurance, setFilterInsurance] = useState('all');

  /* add note */
  const [noteText, setNoteText] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  /* flag */
  const [flagReason, setFlagReason] = useState('');
  const [flagSaving, setFlagSaving] = useState(false);

  /* photo viewer */
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  /* ── fetch ─────────────────────────────────────────────────── */
  const fetchSubs = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/prequalification`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setSubs(Array.isArray(data) ? data : data.subs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load subcontractors');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  /* ── filtered subs ─────────────────────────────────────────── */
  const filtered = subs.filter(s => {
    if (filterTrade !== 'all' && s.trade !== filterTrade) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterRating > 0 && s.field_rating < filterRating) return false;
    if (filterInsurance !== 'all') {
      const ins = overallInsuranceStatus(s.insurance_policies);
      if (ins !== filterInsurance) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        s.company_name.toLowerCase().includes(q) ||
        s.contact_name.toLowerCase().includes(q) ||
        s.trade.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ── actions ───────────────────────────────────────────────── */
  const updateRating = async (sub: Subcontractor, rating: number) => {
    await enqueue({
      url: `/api/projects/${projectId}/prequalification/${sub.id}/rating`,
      method: 'PATCH',
      body: JSON.stringify({ field_rating: rating }),
      contentType: 'application/json',
      isFormData: false,
    });
    setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, field_rating: rating } : s));
    if (selectedSub?.id === sub.id) setSelectedSub({ ...selectedSub, field_rating: rating });
  };

  const addNote = async () => {
    if (!selectedSub || !noteText.trim()) return;
    setNoteSaving(true);
    const note: FieldNote = {
      id: `temp-${Date.now()}`,
      author: noteAuthor || 'Field Super',
      text: noteText.trim(),
      created_at: new Date().toISOString(),
    };
    await enqueue({
      url: `/api/projects/${projectId}/prequalification/${selectedSub.id}/notes`,
      method: 'POST',
      body: JSON.stringify(note),
      contentType: 'application/json',
      isFormData: false,
    });
    const updated = { ...selectedSub, field_notes: [...selectedSub.field_notes, note] };
    setSelectedSub(updated);
    setSubs(prev => prev.map(s => s.id === selectedSub.id ? updated : s));
    setNoteText('');
    setNoteSaving(false);
    setView('detail');
  };

  const toggleFlag = async (sub: Subcontractor, flag: boolean, reason?: string) => {
    setFlagSaving(true);
    await enqueue({
      url: `/api/projects/${projectId}/prequalification/${sub.id}/flag`,
      method: 'PATCH',
      body: JSON.stringify({ compliance_flagged: flag, compliance_flag_reason: reason || '' }),
      contentType: 'application/json',
      isFormData: false,
    });
    const updated = { ...sub, compliance_flagged: flag, compliance_flag_reason: reason || '' };
    setSubs(prev => prev.map(s => s.id === sub.id ? updated : s));
    if (selectedSub?.id === sub.id) setSelectedSub(updated);
    setFlagSaving(false);
    setFlagReason('');
    setView('detail');
  };

  /* ── styles ────────────────────────────────────────────────── */
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: BG,
    color: TEXT,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    paddingBottom: 80,
  };

  const headerStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: RAISED,
    borderBottom: `1px solid ${BORDER}`,
    padding: '12px 16px',
  };

  const cardStyle: React.CSSProperties = {
    background: RAISED,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  };

  const btnStyle = (bg: string, full = false): React.CSSProperties => ({
    background: bg,
    color: bg === GOLD ? '#000' : '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: full ? '100%' : undefined,
    textAlign: 'center',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: TEXT,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238BAAC8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  });

  const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: DIM,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
  };

  /* ── no project ────────────────────────────────────────────── */
  if (!projectId) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128196;</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Project Selected</div>
          <div style={{ color: DIM, fontSize: 14 }}>Select a project to view subcontractor prequalification data.</div>
        </div>
      </div>
    );
  }

  /* ── photo lightbox ────────────────────────────────────────── */
  const renderPhotoLightbox = () => {
    if (!viewingPhoto) return null;
    return (
      <div
        onClick={() => setViewingPhoto(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <img
          src={viewingPhoto}
          alt="Certificate"
          style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, border: `2px solid ${BORDER}` }}
        />
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* ── ADD NOTE VIEW ──────────────────────────────────────── */
  /* ═══════════════════════════════════════════════════════════ */
  if (view === 'add_note' && selectedSub) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setView('detail')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
              &#8592; Back
            </button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Add Field Note</span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 8, fontSize: 13, color: DIM }}>For: {selectedSub.company_name}</div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: DIM }}>Your Name</label>
          <input
            style={inputStyle}
            placeholder="Field Superintendent"
            value={noteAuthor}
            onChange={e => setNoteAuthor(e.target.value)}
          />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, marginTop: 16, color: DIM }}>Note</label>
          <textarea
            style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
            placeholder="Enter field observations, performance notes, concerns..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
          />

          <button
            onClick={addNote}
            disabled={noteSaving || !noteText.trim()}
            style={{
              ...btnStyle(GOLD, true),
              marginTop: 20,
              opacity: noteSaving || !noteText.trim() ? 0.5 : 1,
            }}
          >
            {noteSaving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════ */
  /* ── ADD FLAG VIEW ──────────────────────────────────────── */
  /* ═══════════════════════════════════════════════════════════ */
  if (view === 'add_flag' && selectedSub) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setView('detail')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
              &#8592; Back
            </button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Flag Compliance Issue</span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 12, fontSize: 13, color: DIM }}>
            Flag <strong style={{ color: TEXT }}>{selectedSub.company_name}</strong> for a compliance concern.
          </div>

          <div style={{ ...cardStyle, background: `${RED}11`, borderColor: `${RED}44` }}>
            <div style={{ fontSize: 13, color: RED, fontWeight: 600, marginBottom: 6 }}>&#9888; Warning</div>
            <div style={{ fontSize: 13, color: DIM }}>
              Flagging this subcontractor will alert the project team and may prevent further work assignments until resolved.
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, marginTop: 16, color: DIM }}>
            Reason for Flag
          </label>
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
            placeholder="Describe the compliance issue (e.g., expired insurance, safety violation, unlicensed workers...)"
            value={flagReason}
            onChange={e => setFlagReason(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              onClick={() => setView('detail')}
              style={{ ...btnStyle(BORDER), flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={() => toggleFlag(selectedSub, true, flagReason)}
              disabled={flagSaving || !flagReason.trim()}
              style={{
                ...btnStyle(RED),
                flex: 1,
                opacity: flagSaving || !flagReason.trim() ? 0.5 : 1,
              }}
            >
              {flagSaving ? 'Flagging...' : 'Flag Sub'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════ */
  /* ── DETAIL VIEW ────────────────────────────────────────── */
  /* ═══════════════════════════════════════════════════════════ */
  if (view === 'detail' && selectedSub) {
    const sub = selectedSub;
    const insStatus = overallInsuranceStatus(sub.insurance_policies);

    return (
      <div style={containerStyle}>
        {renderPhotoLightbox()}
        {/* header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => { setView('list'); setSelectedSub(null); }} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                &#8592; List
              </button>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{sub.company_name}</span>
            </div>
            <span style={badgeStyle(STATUS_COLORS[sub.status] || DIM)}>{STATUS_LABELS[sub.status]}</span>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {/* compliance flag banner */}
          {sub.compliance_flagged && (
            <div style={{
              ...cardStyle,
              background: `${RED}15`,
              borderColor: RED,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 20 }}>&#9888;</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginBottom: 4 }}>Compliance Flagged</div>
                <div style={{ fontSize: 13, color: DIM }}>{sub.compliance_flag_reason || 'No details provided'}</div>
                <button
                  onClick={() => toggleFlag(sub, false)}
                  style={{ ...btnStyle(BORDER), marginTop: 8, fontSize: 12, padding: '6px 12px' }}
                >
                  Resolve Flag
                </button>
              </div>
            </div>
          )}

          {/* ── contact card ─────────────────────────────────── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{sub.contact_name}</div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 2 }}>{sub.trade}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <a href={`tel:${sub.phone}`} style={{ ...btnStyle(BLUE), textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                &#128222; Call
              </a>
              <a href={`sms:${sub.phone}`} style={{ ...btnStyle(GREEN), textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                &#128172; Text
              </a>
              <a href={`mailto:${sub.email}`} style={{ ...btnStyle(PURPLE), textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                &#9993; Email
              </a>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: DIM }}>{sub.phone} &middot; {sub.email}</div>
          </div>

          {/* ── field rating ─────────────────────────────────── */}
          <div style={sectionTitle}>Field Performance Rating</div>
          <div style={cardStyle}>
            <StarRating
              value={sub.field_rating}
              onChange={(v) => updateRating(sub, v)}
            />
            <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>Tap to update rating</div>
          </div>

          {/* ── insurance status ─────────────────────────────── */}
          <div style={sectionTitle}>Insurance Status</div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>{insStatus === 'current' ? '\u2705' : insStatus === 'expiring' ? '\u26A0\uFE0F' : '\u274C'}</span>
              <span style={badgeStyle(INS_STATUS_COLORS[insStatus])}>
                {insStatus === 'current' ? 'All Current' : insStatus === 'expiring' ? 'Expiring Soon' : 'Expired Policy'}
              </span>
            </div>
            {sub.insurance_policies.map((p, i) => (
              <div key={i} style={{
                padding: 10,
                borderTop: i > 0 ? `1px solid ${BORDER}` : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.type}</span>
                  <span style={badgeStyle(INS_STATUS_COLORS[p.status])}>{p.status}</span>
                </div>
                <div style={{ fontSize: 12, color: DIM }}>
                  {p.carrier} &middot; #{p.policy_number}
                </div>
                <div style={{ fontSize: 12, color: DIM }}>
                  Expires: {fmtDate(p.expiration_date)}
                  {p.status !== 'expired' && (
                    <span style={{ color: daysUntil(p.expiration_date) < 30 ? AMBER : DIM, marginLeft: 6 }}>
                      ({daysUntil(p.expiration_date)} days)
                    </span>
                  )}
                </div>
                {p.certificate_url && (
                  <button
                    onClick={() => setViewingPhoto(p.certificate_url!)}
                    style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 4, fontWeight: 600 }}
                  >
                    View Certificate &#8599;
                  </button>
                )}
              </div>
            ))}
            {sub.insurance_policies.length === 0 && (
              <div style={{ fontSize: 13, color: DIM, fontStyle: 'italic' }}>No insurance policies on file.</div>
            )}
          </div>

          {/* ── safety record ────────────────────────────────── */}
          <div style={sectionTitle}>Safety Record</div>
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 24, fontWeight: 700,
                  color: sub.safety_record.emr_rate <= 1.0 ? GREEN : sub.safety_record.emr_rate <= 1.5 ? AMBER : RED,
                }}>
                  {sub.safety_record.emr_rate.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>EMR Rate</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 24, fontWeight: 700,
                  color: sub.safety_record.osha_citations === 0 ? GREEN : sub.safety_record.osha_citations <= 2 ? AMBER : RED,
                }}>
                  {sub.safety_record.osha_citations}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>OSHA Citations</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 24, fontWeight: 700,
                  color: sub.safety_record.incident_rate <= 3.0 ? GREEN : sub.safety_record.incident_rate <= 5.0 ? AMBER : RED,
                }}>
                  {sub.safety_record.incident_rate.toFixed(1)}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>Incident Rate</div>
              </div>
            </div>
            {sub.safety_record.last_updated && (
              <div style={{ fontSize: 11, color: DIM, textAlign: 'center', marginTop: 8 }}>
                Last updated: {fmtDate(sub.safety_record.last_updated)}
              </div>
            )}
          </div>

          {/* ── bonding capacity ─────────────────────────────── */}
          <div style={sectionTitle}>Bonding Capacity</div>
          <div style={cardStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>
              {fmtCurrency(sub.bonding_capacity)}
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Maximum single project bond</div>
          </div>

          {/* ── licenses & certs ─────────────────────────────── */}
          <div style={sectionTitle}>Licenses &amp; Certifications</div>
          <div style={cardStyle}>
            {sub.licenses.map((lic, i) => (
              <div key={i} style={{
                padding: '8px 0',
                borderTop: i > 0 ? `1px solid ${BORDER}` : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{lic.name}</span>
                  <span style={badgeStyle(INS_STATUS_COLORS[lic.status])}>{lic.status}</span>
                </div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                  #{lic.number} &middot; Exp: {fmtDate(lic.expiration_date)}
                </div>
              </div>
            ))}
            {sub.licenses.length === 0 && (
              <div style={{ fontSize: 13, color: DIM, fontStyle: 'italic' }}>No licenses on file.</div>
            )}
          </div>

          {/* ── certificate photos ───────────────────────────── */}
          <div style={sectionTitle}>Insurance Certificates</div>
          <div style={cardStyle}>
            {sub.photo_urls.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {sub.photo_urls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Certificate ${i + 1}`}
                    onClick={() => setViewingPhoto(url)}
                    style={{
                      width: 100, height: 100, objectFit: 'cover',
                      borderRadius: 8, border: `1px solid ${BORDER}`,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: DIM, fontStyle: 'italic' }}>No certificate photos uploaded.</div>
            )}
          </div>

          {/* ── field notes ──────────────────────────────────── */}
          <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Field Notes ({sub.field_notes.length})</span>
            <button
              onClick={() => { setView('add_note'); setNoteText(''); setNoteAuthor(''); }}
              style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', fontWeight: 600, padding: 0 }}
            >
              + Add Note
            </button>
          </div>
          <div style={cardStyle}>
            {sub.field_notes.length > 0 ? (
              sub.field_notes.slice().reverse().map((n, i) => (
                <div key={n.id} style={{
                  padding: '10px 0',
                  borderTop: i > 0 ? `1px solid ${BORDER}` : undefined,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{n.author}</span>
                    <span style={{ fontSize: 11, color: DIM }}>{fmtDate(n.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>{n.text}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, color: DIM, fontStyle: 'italic' }}>No field notes yet. Add the first one.</div>
            )}
          </div>

          {/* ── action buttons ───────────────────────────────── */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => { setView('add_note'); setNoteText(''); setNoteAuthor(''); }}
              style={btnStyle(GOLD, true)}
            >
              Add Field Note
            </button>
            {!sub.compliance_flagged ? (
              <button
                onClick={() => { setView('add_flag'); setFlagReason(''); }}
                style={btnStyle(RED, true)}
              >
                Flag for Compliance Issue
              </button>
            ) : (
              <button
                onClick={() => toggleFlag(sub, false)}
                style={btnStyle(GREEN, true)}
              >
                Resolve Compliance Flag
              </button>
            )}
          </div>

          {/* ── meta ─────────────────────────────────────────── */}
          <div style={{ marginTop: 24, fontSize: 11, color: DIM, textAlign: 'center' }}>
            Last updated: {fmtDate(sub.updated_at)} &middot; Created: {fmtDate(sub.created_at)}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════ */
  /* ── LIST VIEW ──────────────────────────────────────────── */
  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div style={containerStyle}>
      {/* header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Prequalification</div>
            <div style={{ fontSize: 12, color: DIM }}>
              {loading ? 'Loading...' : `${filtered.length} subcontractor${filtered.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <button onClick={fetchSubs} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, color: GOLD, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            &#8635; Refresh
          </button>
        </div>

        {/* search */}
        <input
          style={{ ...inputStyle, marginBottom: 10 }}
          placeholder="Search subs by name, trade, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* filters row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={selectStyle} value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
            <option value="all">All Trades</option>
            {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="under_review">Under Review</option>
          </select>
          <select style={selectStyle} value={filterInsurance} onChange={e => setFilterInsurance(e.target.value)}>
            <option value="all">Insurance: All</option>
            <option value="current">Current</option>
            <option value="expiring">Expiring</option>
            <option value="expired">Expired</option>
          </select>
          <select style={selectStyle} value={String(filterRating)} onChange={e => setFilterRating(Number(e.target.value))}>
            <option value="0">Any Rating</option>
            <option value="1">1+ Stars</option>
            <option value="2">2+ Stars</option>
            <option value="3">3+ Stars</option>
            <option value="4">4+ Stars</option>
            <option value="5">5 Stars</option>
          </select>
        </div>
      </div>

      {/* content area */}
      <div style={{ padding: 16 }}>
        {/* loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite' }}>&#8635;</div>
            <div style={{ color: DIM, fontSize: 14 }}>Loading subcontractors...</div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* error state */}
        {!loading && error && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#9888;</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: RED, marginBottom: 8 }}>Error Loading Data</div>
            <div style={{ color: DIM, fontSize: 13, marginBottom: 16 }}>{error}</div>
            <button onClick={fetchSubs} style={btnStyle(GOLD)}>Retry</button>
          </div>
        )}

        {/* empty state */}
        {!loading && !error && subs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#128220;</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Prequalification Data</div>
            <div style={{ color: DIM, fontSize: 13 }}>No subcontractor submissions found for this project.</div>
          </div>
        )}

        {/* no results after filter */}
        {!loading && !error && subs.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#128269;</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Matches</div>
            <div style={{ color: DIM, fontSize: 13, marginBottom: 16 }}>
              No subcontractors match your current filters.
            </div>
            <button
              onClick={() => { setSearch(''); setFilterTrade('all'); setFilterStatus('all'); setFilterRating(0); setFilterInsurance('all'); }}
              style={btnStyle(BORDER)}
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* summary stats */}
        {!loading && !error && subs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Approved', count: subs.filter(s => s.status === 'approved').length, color: GREEN },
              { label: 'Pending', count: subs.filter(s => s.status === 'pending').length, color: AMBER },
              { label: 'Flagged', count: subs.filter(s => s.compliance_flagged).length, color: RED },
              { label: 'Expired Ins.', count: subs.filter(s => overallInsuranceStatus(s.insurance_policies) === 'expired').length, color: RED },
            ].map((stat, i) => (
              <div key={i} style={{
                background: RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: '8px 6px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.count}</div>
                <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* sub cards */}
        {!loading && !error && filtered.map(sub => {
          const insStatus = overallInsuranceStatus(sub.insurance_policies);
          return (
            <div
              key={sub.id}
              onClick={() => { setSelectedSub(sub); setView('detail'); }}
              style={{
                ...cardStyle,
                cursor: 'pointer',
                borderColor: sub.compliance_flagged ? RED : BORDER,
                position: 'relative',
              }}
            >
              {/* flag indicator */}
              {sub.compliance_flagged && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: `${RED}22`, color: RED,
                  fontSize: 10, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4,
                  border: `1px solid ${RED}44`,
                }}>
                  FLAGGED
                </div>
              )}

              {/* company info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{sub.company_name}</div>
                  <div style={{ fontSize: 12, color: DIM }}>{sub.trade} &middot; {sub.contact_name}</div>
                </div>
              </div>

              {/* badges row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <span style={badgeStyle(STATUS_COLORS[sub.status] || DIM)}>{STATUS_LABELS[sub.status]}</span>
                <span style={badgeStyle(INS_STATUS_COLORS[insStatus])}>
                  Ins: {insStatus}
                </span>
                {sub.safety_record.emr_rate > 1.5 && (
                  <span style={badgeStyle(RED)}>High EMR</span>
                )}
              </div>

              {/* quick stats */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <StarRating value={sub.field_rating} readonly />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: DIM }}>EMR {sub.safety_record.emr_rate.toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: DIM }}>&middot;</span>
                  <span style={{ fontSize: 11, color: DIM }}>Bond {fmtCurrency(sub.bonding_capacity)}</span>
                </div>
              </div>

              {/* contact links */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                <a
                  href={`tel:${sub.phone}`}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 12, color: BLUE, textDecoration: 'none', fontWeight: 600 }}
                >
                  &#128222; {sub.phone}
                </a>
                <span style={{ color: BORDER }}>|</span>
                <a
                  href={`mailto:${sub.email}`}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 12, color: PURPLE, textDecoration: 'none', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  &#9993; {sub.email}
                </a>
              </div>

              {/* notes indicator */}
              {sub.field_notes.length > 0 && (
                <div style={{ fontSize: 11, color: DIM, marginTop: 6 }}>
                  &#128221; {sub.field_notes.length} field note{sub.field_notes.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── default export with Suspense wrapper ──────────────────────── */
export default function Page() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#07101C',
        color: '#F0F4FF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#8635;</div>
          <div style={{ fontSize: 14, color: '#8BAAC8' }}>Loading Prequalification...</div>
        </div>
      </div>
    }>
      <PrequalInner />
    </Suspense>
  );
}
