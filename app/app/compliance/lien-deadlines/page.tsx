'use client';
/**
 * Saguaro — Lien Deadline Tracker
 * Calendar-style view of upcoming lien deadlines with AZ auto-calculation.
 */
import React, { useState, useEffect, useCallback } from 'react';

const BASE = '#F8F9FB';
const CARD = 'rgba(26,31,46,0.7)';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#EEF0F3';
const GRAY = '#6B7280';

const STATES = ['AZ', 'CA', 'TX', 'NV', 'CO', 'FL'];
const DEADLINE_TYPES = [
  { value: 'preliminary_notice', label: 'Preliminary Notice' },
  { value: 'mechanics_lien', label: "Mechanic's Lien" },
  { value: 'stop_notice', label: 'Stop Notice' },
  { value: 'bond_claim', label: 'Bond Claim' },
];

interface LienDeadline {
  id: string;
  project_id: string;
  state: string;
  deadline_type: string;
  due_date: string;
  description: string;
  status: string;
  first_work_date?: string;
  completion_date?: string;
  last_work_date?: string;
  calculated_deadlines?: Record<string, string>;
  reminder_30: boolean;
  reminder_14: boolean;
  reminder_7: boolean;
  created_at?: string;
}

function deadlineTypeLabel(type: string): string {
  return DEADLINE_TYPES.find(t => t.value === type)?.label || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function urgencyColor(days: number): string {
  if (days < 0) return RED;
  if (days <= 7) return GOLD;
  if (days <= 30) return BLUE;
  return GRAY;
}

function urgencyLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d remaining`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function LienDeadlinePage() {
  const [deadlines, setDeadlines] = useState<LienDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [formProject, setFormProject] = useState('');
  const [formState, setFormState] = useState('AZ');
  const [formType, setFormType] = useState('preliminary_notice');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFirstWork, setFormFirstWork] = useState('');
  const [formCompletion, setFormCompletion] = useState('');
  const [formLastWork, setFormLastWork] = useState('');

  // AZ auto-calculation
  const azCalc = {
    preliminary: formFirstWork ? addDays(formFirstWork, 20) : '',
    mechLien: formCompletion ? addDays(formCompletion, 120) : '',
    bondClaim: formLastWork ? addDays(formLastWork, 90) : '',
  };

  const fetchDeadlines = useCallback(async () => {
    try {
      const res = await fetch('/api/compliance/lien-deadlines');
      if (res.ok) {
        const data = await res.json();
        setDeadlines(data.deadlines || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeadlines(); }, [fetchDeadlines]);

  const createDeadline = async () => {
    if (!formProject.trim() || !formDueDate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/compliance/lien-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: formProject.trim(),
          state: formState,
          deadline_type: formType,
          due_date: formDueDate,
          description: formDesc.trim(),
          first_work_date: formFirstWork || undefined,
          completion_date: formCompletion || undefined,
          last_work_date: formLastWork || undefined,
        }),
      });
      if (res.ok) {
        await fetchDeadlines();
        setShowAdd(false);
        setFormProject('');
        setFormDueDate('');
        setFormDesc('');
        setFormFirstWork('');
        setFormCompletion('');
        setFormLastWork('');
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  // Sort by date
  const sorted = [...deadlines].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const inputStyle: React.CSSProperties = {
    background: 'rgba(15,20,25,0.6)',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    color: TEXT,
    width: '100%',
    outline: 'none',
  };

  return (
    <div style={{ background: BASE, minHeight: '100vh', color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Lien Deadline Tracker</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>Track preliminary notices, mechanic&apos;s liens, stop notices, and bond claims</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            background: showAdd ? 'rgba(239,68,68,0.15)' : GOLD,
            color: showAdd ? RED : '#000',
            border: 'none',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showAdd ? 'Cancel' : '+ Add Deadline'}
        </button>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Summary row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Overdue', count: sorted.filter(d => daysUntil(d.due_date) < 0).length, color: RED },
            { label: 'Due in 7 Days', count: sorted.filter(d => { const dy = daysUntil(d.due_date); return dy >= 0 && dy <= 7; }).length, color: GOLD },
            { label: 'Due in 30 Days', count: sorted.filter(d => { const dy = daysUntil(d.due_date); return dy > 7 && dy <= 30; }).length, color: BLUE },
            { label: 'Future', count: sorted.filter(d => daysUntil(d.due_date) > 30).length, color: GRAY },
          ].map(s => (
            <div key={s.label} style={{
              background: CARD,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: '16px 20px',
              flex: '1 1 0',
              minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.count}</div>
            </div>
          ))}
        </div>

        {/* Add Deadline Form */}
        {showAdd && (
          <div style={{
            background: CARD,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: GOLD }}>Add Deadline</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Project ID *</label>
                <input value={formProject} onChange={e => setFormProject(e.target.value)} placeholder="Project ID" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>State *</label>
                <select value={formState} onChange={e => setFormState(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Deadline Type *</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {DEADLINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Due Date *</label>
                <input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '2 / -1' }}>
                <label style={{ fontSize: 12, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Description</label>
                <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description" style={inputStyle} />
              </div>
            </div>

            {/* AZ-specific auto-calculation inputs */}
            {formState === 'AZ' && (
              <div style={{ marginTop: 20, padding: 16, background: 'rgba(212,160,23,0.06)', borderRadius: 12, border: `1px solid rgba(212,160,23,0.15)` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>AZ Auto-Calculated Deadlines</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>First Work Date</label>
                    <input type="date" value={formFirstWork} onChange={e => setFormFirstWork(e.target.value)} style={inputStyle} />
                    {azCalc.preliminary && (
                      <div style={{ fontSize: 11, color: GOLD, marginTop: 4 }}>
                        Preliminary 20-Day Notice: <strong>{azCalc.preliminary}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Completion Date</label>
                    <input type="date" value={formCompletion} onChange={e => setFormCompletion(e.target.value)} style={inputStyle} />
                    {azCalc.mechLien && (
                      <div style={{ fontSize: 11, color: GOLD, marginTop: 4 }}>
                        Mechanic&apos;s Lien (120d): <strong>{azCalc.mechLien}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 6 }}>Last Work Date</label>
                    <input type="date" value={formLastWork} onChange={e => setFormLastWork(e.target.value)} style={inputStyle} />
                    {azCalc.bondClaim && (
                      <div style={{ fontSize: 11, color: GOLD, marginTop: 4 }}>
                        Bond Claim (90d): <strong>{azCalc.bondClaim}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={createDeadline}
                disabled={!formProject.trim() || !formDueDate || saving}
                style={{
                  background: (!formProject.trim() || !formDueDate) ? 'rgba(212,160,23,0.3)' : GOLD,
                  color: (!formProject.trim() || !formDueDate) ? DIM : '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 28px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: (!formProject.trim() || !formDueDate) ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Add Deadline'}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            <div style={{ width: 32, height: 32, border: '3px solid #E5E7EB', borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            Loading deadlines...
          </div>
        ) : sorted.length === 0 ? (
          <div style={{
            background: CARD,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" style={{ marginBottom: 12 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round"/>
              <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>No Deadlines</div>
            <div style={{ fontSize: 13, color: DIM }}>Add your first lien deadline to start tracking.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map(dl => {
              const days = daysUntil(dl.due_date);
              const color = urgencyColor(days);
              return (
                <div
                  key={dl.id}
                  style={{
                    background: CARD,
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 16,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    borderLeft: `4px solid ${color}`,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Date block */}
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: color + '15',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase' }}>
                      {new Date(dl.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>
                      {new Date(dl.due_date + 'T00:00:00').getDate()}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: color + '18',
                        color,
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                      }}>
                        {deadlineTypeLabel(dl.deadline_type)}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(59,130,246,0.12)',
                        color: BLUE,
                      }}>
                        {dl.state}
                      </span>
                      {/* Reminder badges */}
                      {dl.reminder_30 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(107,114,128,0.12)', color: GRAY }}>30d sent</span>}
                      {dl.reminder_14 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(212,160,23,0.12)', color: GOLD }}>14d sent</span>}
                      {dl.reminder_7 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: RED }}>7d sent</span>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{dl.description || deadlineTypeLabel(dl.deadline_type)}</div>
                    <div style={{ fontSize: 12, color: DIM }}>
                      Due: {new Date(dl.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>

                  {/* Urgency badge */}
                  <div style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    background: color + '15',
                    color,
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                    textAlign: 'center',
                    minWidth: 100,
                  }}>
                    {urgencyLabel(days)}
                  </div>

                  {/* Calculated AZ deadlines */}
                  {dl.calculated_deadlines && Object.keys(dl.calculated_deadlines).length > 0 && (
                    <div style={{ width: '100%', marginTop: 4, paddingLeft: 72 }}>
                      <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginBottom: 4 }}>AZ Calculated:</div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {Object.entries(dl.calculated_deadlines).map(([key, val]) => (
                          <div key={key} style={{ fontSize: 11, color: DIM }}>
                            {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: <span style={{ color: GOLD, fontWeight: 600 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
