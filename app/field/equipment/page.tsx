'use client';
/**
 * Saguaro Field — Equipment & Tool Tracking
 * Log daily equipment on site with hours, operator, condition. Offline-first.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD = '#D4A017', RAISED = '#0D1D2E', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';
const GREEN = '#22C55E', RED = '#EF4444', AMBER = '#F59E0B', BLUE = '#3B82F6';

function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };
const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };

const EQUIPMENT_SUGGESTIONS = [
  'Excavator', 'Boom Lift', 'Scissor Lift', 'Crane', 'Forklift',
  'Compactor', 'Concrete Pump', 'Skid Steer', 'Generator', 'Air Compressor',
  'Welding Machine', 'Other',
];

const CONDITIONS = ['Good', 'Fair', 'Needs Service', 'Down'] as const;
type Condition = typeof CONDITIONS[number];

const CONDITION_COLORS: Record<Condition, string> = {
  Good: GREEN,
  Fair: AMBER,
  'Needs Service': '#F59E0B',
  Down: RED,
};

interface EquipmentEntry {
  id: string;
  equipment_name: string;
  operator: string;
  hours_used: number;
  work_date: string;
  condition: string;
  notes: string;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function todayDisplay(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

type View = 'list' | 'form';

function EquipmentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [view, setView] = useState<View>('list');
  const [entries, setEntries] = useState<EquipmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [projectName, setProjectName] = useState('');

  // Form state
  const [equipName, setEquipName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [operator, setOperator] = useState('');
  const [hoursUsed, setHoursUsed] = useState('');
  const [condition, setCondition] = useState<Condition>('Good');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then(r => r.ok ? r.json() : null)
      .then(d => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/equipment?projectId=${projectId}&date=${todayISO()}`);
      const d = await r.json();
      setEntries(d.entries || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const resetForm = () => {
    setEquipName('');
    setOperator('');
    setHoursUsed('');
    setCondition('Good');
    setNotes('');
    setShowSuggestions(false);
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipName.trim()) return;
    setSaving(true);

    const payload = {
      project_id: projectId,
      equipment_name: equipName.trim(),
      operator: operator.trim(),
      hours_used: parseFloat(hoursUsed) || 0,
      condition,
      notes: notes.trim(),
      work_date: todayISO(),
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/equipment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      const newEntry: EquipmentEntry = d.entry || { id: `local-${Date.now()}`, ...payload };
      setEntries(prev => [newEntry, ...prev]);
    } catch {
      await enqueue({ url: '/api/equipment/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setEntries(prev => [{
        id: `local-${Date.now()}`,
        equipment_name: equipName.trim(),
        operator: operator.trim(),
        hours_used: parseFloat(hoursUsed) || 0,
        work_date: todayISO(),
        condition,
        notes: notes.trim(),
      }, ...prev]);
    }

    resetForm();
    setView('list');
    setSaving(false);
  };

  const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours_used) || 0), 0);
  const filteredSuggestions = EQUIPMENT_SUGGESTIONS.filter(s => s.toLowerCase().includes(equipName.toLowerCase()) && s.toLowerCase() !== equipName.toLowerCase());

  return (
    <div style={{ padding: '18px 16px', paddingBottom: 40 }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><rect x={1} y={3} width={15} height={13}/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx={5.5} cy={18.5} r={2.5}/><circle cx={18.5} cy={18.5} r={2.5}/></svg>Equipment Log</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{projectName}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>{todayDisplay()}</p>
        </div>
        {view === 'list' && (
          <button
            onClick={() => { setView('form'); resetForm(); }}
            style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
          >
            + Log Equipment
          </button>
        )}
      </div>

      {/* Summary chips */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ background: `rgba(${hr(BLUE)}, .12)`, border: `1px solid rgba(${hr(BLUE)}, .3)`, borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 700, color: BLUE }}>
            {entries.length} Equipment
          </div>
          <div style={{ background: `rgba(${hr(GOLD)}, .12)`, border: `1px solid rgba(${hr(GOLD)}, .3)`, borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 700, color: GOLD }}>
            {totalHours.toFixed(1)} Machine-hrs
          </div>
          {entries.filter(e => e.condition === 'Down').length > 0 && (
            <div style={{ background: `rgba(${hr(RED)}, .12)`, border: `1px solid rgba(${hr(RED)}, .3)`, borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 700, color: RED }}>
              {entries.filter(e => e.condition === 'Down').length} Down
            </div>
          )}
        </div>
      )}

      {!online && view === 'form' && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>
          Offline — will sync when reconnected
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading today's equipment...</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: DIM }}>
            <div style={{ marginBottom: 12, color: DIM, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48}><rect x={1} y={3} width={15} height={13}/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx={5.5} cy={18.5} r={2.5}/><circle cx={18.5} cy={18.5} r={2.5}/></svg></div>
            <p style={{ margin: 0, fontSize: 15 }}>No equipment logged today.</p>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>Tap "+ Log Equipment" to add a machine or tool.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(entry => {
              const cond = entry.condition as Condition;
              const condColor = CONDITION_COLORS[cond] || DIM;
              return (
                <div key={entry.id} style={{ background: RAISED, border: `1px solid ${cond === 'Down' ? 'rgba(239,68,68,.3)' : BORDER}`, borderRadius: 12, padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{entry.equipment_name}</p>
                      {entry.operator && <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM, display: 'flex', alignItems: 'center', gap: 4 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx={12} cy={7} r={4}/></svg>{entry.operator}</p>}
                      {entry.notes && <p style={{ margin: '4px 0 0', fontSize: 12, color: DIM, lineHeight: 1.4 }}>{entry.notes}</p>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <div style={{ background: `rgba(${hr(condColor)}, .15)`, border: `1px solid rgba(${hr(condColor)}, .3)`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, color: condColor }}>
                        {entry.condition}
                      </div>
                      {entry.hours_used > 0 && (
                        <div style={{ background: `rgba(${hr(GOLD)}, .1)`, border: `1px solid rgba(${hr(GOLD)}, .25)`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, color: GOLD }}>
                          {Number(entry.hours_used).toFixed(1)}h
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Log form */}
      {view === 'form' && (
        <form onSubmit={submitEntry}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: TEXT }}>Log Equipment</h2>

          <div style={card}>
            <p style={secLbl}>Equipment</p>
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Equipment Name *</label>
              <input
                value={equipName}
                onChange={e => { setEquipName(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. Excavator, Boom Lift..."
                style={inp}
                required
                autoComplete="off"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 10, zIndex: 20, overflow: 'hidden', marginTop: 2 }}>
                  {filteredSuggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={() => { setEquipName(s); setShowSuggestions(false); }}
                      style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '10px 14px', color: TEXT, fontSize: 14, textAlign: 'left', cursor: 'pointer', borderBottom: `1px solid ${BORDER}` }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Operator Name</label>
              <input value={operator} onChange={e => setOperator(e.target.value)} placeholder="Who operated this equipment?" style={inp} />
            </div>
          </div>

          <div style={card}>
            <p style={secLbl}>Usage & Condition</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Hours Used</label>
                <input
                  type="number"
                  value={hoursUsed}
                  onChange={e => setHoursUsed(e.target.value)}
                  placeholder="0.0"
                  min="0"
                  step="0.5"
                  style={inp}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Work Date</label>
                <input type="date" value={todayISO()} readOnly style={{ ...inp, color: DIM }} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 6 }}>Condition</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CONDITIONS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    style={{
                      background: condition === c ? `rgba(${hr(CONDITION_COLORS[c])}, .2)` : 'transparent',
                      border: `1px solid ${condition === c ? CONDITION_COLORS[c] : BORDER}`,
                      borderRadius: 8,
                      padding: '10px 8px',
                      color: condition === c ? CONDITION_COLORS[c] : DIM,
                      fontSize: 13,
                      fontWeight: condition === c ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any issues, maintenance needed, usage notes..."
                rows={3}
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => { setView('list'); resetForm(); }}
              style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '15px', color: DIM, fontSize: 15, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 2, background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 12, padding: '15px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? 'Saving...' : '+ Log Equipment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function FieldEquipmentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <EquipmentPage />
    </Suspense>
  );
}
