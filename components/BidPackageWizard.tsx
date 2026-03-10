'use client';
import React, { useState, useEffect, useCallback } from 'react';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const RAISED2 = '#253549';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#3dd68c';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  description: string;
  qty: number | string;
  unit: string;
  unitCost: number | string;
  selected?: boolean;
}

interface Sub {
  id: string;
  name: string;
  trade: string;
  email: string;
  winRate: number;
  lastProject: string;
  lastProjectDate: string;
  rating: number;
}

interface WizardProps {
  projectId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

// ─── CSI Divisions ───────────────────────────────────────────────────────────

const CSI_DIVISIONS = [
  { value: 'Division 01 — General Requirements', label: 'Division 01 — General Requirements' },
  { value: 'Division 02 — Existing Conditions', label: 'Division 02 — Existing Conditions' },
  { value: 'Division 03 — Concrete', label: 'Division 03 — Concrete' },
  { value: 'Division 04 — Masonry', label: 'Division 04 — Masonry' },
  { value: 'Division 05 — Metals', label: 'Division 05 — Metals' },
  { value: 'Division 06 — Wood, Plastics & Composites', label: 'Division 06 — Wood, Plastics & Composites' },
  { value: 'Division 07 — Thermal & Moisture Protection', label: 'Division 07 — Thermal & Moisture Protection' },
  { value: 'Division 08 — Openings', label: 'Division 08 — Openings' },
  { value: 'Division 09 — Finishes', label: 'Division 09 — Finishes' },
  { value: 'Division 10 — Specialties', label: 'Division 10 — Specialties' },
  { value: 'Division 11 — Equipment', label: 'Division 11 — Equipment' },
  { value: 'Division 12 — Furnishings', label: 'Division 12 — Furnishings' },
  { value: 'Division 14 — Conveying Equipment', label: 'Division 14 — Conveying Equipment' },
  { value: 'Division 22 — Plumbing', label: 'Division 22 — Plumbing' },
  { value: 'Division 26 — Electrical', label: 'Division 26 — Electrical' },
];

// ─── Helper Components ───────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
      {children}
    </label>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px',
    background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7,
    color: TEXT, fontSize: 13, outline: 'none', ...extra,
  };
}

function PrimaryBtn({ onClick, disabled, loading, children }: {
  onClick?: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '10px 24px',
        background: disabled || loading ? '#3a4a5a' : `linear-gradient(135deg,${GOLD},#F0C040)`,
        border: 'none', borderRadius: 7, color: disabled || loading ? DIM : '#0d1117',
        fontSize: 13, fontWeight: 800, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s',
      }}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

function SecondaryBtn({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 20px', background: 'transparent',
        border: `1px solid ${BORDER}`, borderRadius: 7,
        color: DIM, fontSize: 13, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: TEXT, fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: GOLD, width: 15, height: 15 }} />
      {label}
    </label>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

const STEPS = ['Trade & Scope', 'AI Pre-fill', 'Select Subs', 'Review & Create'];

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ padding: '20px 32px 0', background: RAISED }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((label, i) => {
          const active = i === step;
          const done = i < step;
          const color = done || active ? GOLD : DIM;
          const lineColor = done ? GOLD : BORDER;
          return (
            <React.Fragment key={label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: done ? GOLD : active ? 'rgba(212,160,23,0.15)' : 'rgba(38,51,71,0.6)',
                  border: `2px solid ${color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: done ? DARK : color, fontWeight: 800, fontSize: 13,
                  transition: 'all 0.3s',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 10, fontWeight: active ? 700 : 500, color, marginTop: 5, whiteSpace: 'nowrap' }}>
                  {label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, background: lineColor,
                  margin: '0 6px', marginBottom: 18, transition: 'background 0.3s',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Trade & Scope ────────────────────────────────────────────────────

interface Step1Data {
  trade: string;
  scope: string;
  prevailingWage: boolean;
  bonding: boolean;
  insurance: boolean;
}

function Step1({ data, onChange, onNext }: {
  data: Step1Data;
  onChange: (d: Partial<Step1Data>) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h3 style={{ margin: '0 0 4px', color: GOLD, fontSize: 17, fontWeight: 800 }}>Trade & Scope</h3>
      <p style={{ margin: '0 0 22px', color: DIM, fontSize: 13 }}>Select the CSI division and describe the scope of work.</p>

      <div style={{ marginBottom: 18 }}>
        <Label>CSI Trade Division</Label>
        <select
          value={data.trade}
          onChange={e => onChange({ trade: e.target.value })}
          style={inputStyle({ height: 38 })}
        >
          <option value="">— Select Division —</option>
          {CSI_DIVISIONS.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Label>Scope Description</Label>
        <textarea
          value={data.scope}
          onChange={e => onChange({ scope: e.target.value })}
          rows={4}
          placeholder="Describe the scope of work. AI will expand this into a full bid jacket…"
          style={inputStyle({ resize: 'vertical' })}
        />
      </div>

      <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Label>Requirements</Label>
        <CheckRow checked={data.prevailingWage} onChange={v => onChange({ prevailingWage: v })} label="Prevailing wage required" />
        <CheckRow checked={data.bonding} onChange={v => onChange({ bonding: v })} label="Bonding required" />
        <CheckRow checked={data.insurance} onChange={v => onChange({ insurance: v })} label="Insurance required" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PrimaryBtn onClick={onNext} disabled={!data.trade.trim()}>
          Next: AI Pre-fill →
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Step 2: AI Pre-fill from Takeoff ────────────────────────────────────────

function newRow(): LineItem {
  return { id: `row-${Date.now()}-${Math.random()}`, description: '', qty: '', unit: 'EA', unitCost: '', selected: true };
}

function Step2({ projectId, lineItems, onLineItemsChange, onNext, onBack }: {
  projectId: string;
  lineItems: LineItem[];
  onLineItemsChange: (items: LineItem[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchTakeoff = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    setFetched(true);
    try {
      const r = await fetch(`/api/takeoffs/latest?projectId=${projectId}`);
      const d = await r.json();
      if (d.takeoff && d.takeoff.materials && d.takeoff.materials.length > 0) {
        setHasData(true);
        onLineItemsChange(d.takeoff.materials.map((m: { id?: string; description?: string; qty?: number | string; unit?: string; unit_cost?: number | string; unitCost?: number | string }) => ({
          id: m.id || `m-${Math.random()}`,
          description: m.description || '',
          qty: m.qty || '',
          unit: m.unit || 'EA',
          unitCost: m.unit_cost ?? m.unitCost ?? '',
          selected: true,
        })));
      } else {
        setHasData(false);
        if (lineItems.length === 0) {
          onLineItemsChange([newRow()]);
        }
      }
    } catch {
      setHasData(false);
      if (lineItems.length === 0) {
        onLineItemsChange([newRow()]);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, fetched, lineItems.length, onLineItemsChange]);

  useEffect(() => { fetchTakeoff(); }, [fetchTakeoff]);

  const total = lineItems
    .filter(r => r.selected)
    .reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0);

  function toggleAll(val: boolean) {
    onLineItemsChange(lineItems.map(r => ({ ...r, selected: val })));
  }

  function updateRow(id: string, field: keyof LineItem, value: string | boolean) {
    onLineItemsChange(lineItems.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function addRow() {
    onLineItemsChange([...lineItems, newRow()]);
  }

  function removeRow(id: string) {
    onLineItemsChange(lineItems.filter(r => r.id !== id));
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5, color: DIM,
    borderBottom: `1px solid ${BORDER}`,
  };
  const tdStyle: React.CSSProperties = { padding: '6px 6px' };
  const cellInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '5px 8px',
    background: DARK, border: `1px solid ${BORDER}`, borderRadius: 5,
    color: TEXT, fontSize: 12, outline: 'none',
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', color: GOLD, fontSize: 17, fontWeight: 800 }}>AI Pre-fill from Takeoff</h3>
      <p style={{ margin: '0 0 16px', color: DIM, fontSize: 13 }}>
        {loading ? 'Loading takeoff data…' : hasData
          ? 'Takeoff found — select which line items to include in this bid package.'
          : 'No takeoff found — enter line items manually below.'}
      </p>

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          Fetching takeoff data…
        </div>
      )}

      {!loading && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => toggleAll(true)} style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, cursor: 'pointer' }}>Select All</button>
            <button onClick={() => toggleAll(false)} style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, cursor: 'pointer' }}>Deselect All</button>
          </div>

          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  <th style={{ ...thStyle, width: 30 }}></th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, width: 70 }}>Qty</th>
                  <th style={{ ...thStyle, width: 60 }}>Unit</th>
                  <th style={{ ...thStyle, width: 90 }}>Unit Cost</th>
                  <th style={{ ...thStyle, width: 90 }}>Subtotal</th>
                  <th style={{ ...thStyle, width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row) => (
                  <tr key={row.id} style={{ borderBottom: `1px solid rgba(38,51,71,.4)`, background: row.selected ? 'transparent' : 'rgba(0,0,0,0.15)' }}>
                    <td style={tdStyle}>
                      <input type="checkbox" checked={!!row.selected} onChange={e => updateRow(row.id, 'selected', e.target.checked)}
                        style={{ accentColor: GOLD, marginLeft: 6 }} />
                    </td>
                    <td style={tdStyle}>
                      <input value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)}
                        placeholder="Description" style={cellInput} />
                    </td>
                    <td style={tdStyle}>
                      <input value={String(row.qty)} onChange={e => updateRow(row.id, 'qty', e.target.value)}
                        type="number" min="0" style={cellInput} />
                    </td>
                    <td style={tdStyle}>
                      <input value={row.unit} onChange={e => updateRow(row.id, 'unit', e.target.value)}
                        style={cellInput} />
                    </td>
                    <td style={tdStyle}>
                      <input value={String(row.unitCost)} onChange={e => updateRow(row.id, 'unitCost', e.target.value)}
                        type="number" min="0" style={cellInput} />
                    </td>
                    <td style={{ ...tdStyle, color: TEXT, fontWeight: 600, paddingLeft: 10 }}>
                      ${((Number(row.qty) || 0) * (Number(row.unitCost) || 0)).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => removeRow(row.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button onClick={addRow} style={{ fontSize: 12, padding: '6px 14px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, cursor: 'pointer' }}>
              + Add Row
            </button>
            <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>
              Total (selected): <span style={{ color: GOLD }}>${total.toLocaleString()}</span>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <PrimaryBtn onClick={onNext}>Next: Select Subs →</PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Step 3: Select Subs ──────────────────────────────────────────────────────

function Step3({ trade, projectId, selectedSubs, onSelectedSubsChange, manualEmail, onManualEmailChange,
  autoInvite, onAutoInviteChange, onNext, onBack }: {
  trade: string;
  projectId: string;
  selectedSubs: Record<string, boolean>;
  onSelectedSubsChange: (s: Record<string, boolean>) => void;
  manualEmail: string;
  onManualEmailChange: (v: string) => void;
  autoInvite: boolean;
  onAutoInviteChange: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setLoading(true);
    fetch('/api/bid-packages/suggest-subs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade, projectId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.subs) setSubs(d.subs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [trade, projectId, fetched]);

  function toggleSub(id: string) {
    onSelectedSubsChange({ ...selectedSubs, [id]: !selectedSubs[id] });
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', color: GOLD, fontSize: 17, fontWeight: 800 }}>Select Subs</h3>
      <p style={{ margin: '0 0 16px', color: DIM, fontSize: 13 }}>Choose subs to invite based on trade history and performance.</p>

      {loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: DIM }}>Loading suggested subs…</div>
      )}

      {!loading && subs.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: DIM, border: `1px dashed ${BORDER}`, borderRadius: 8, marginBottom: 16 }}>
          No suggested subs found for this trade.
        </div>
      )}

      {!loading && subs.map(sub => (
        <div key={sub.id} onClick={() => toggleSub(sub.id)} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 14px', borderRadius: 8, marginBottom: 8,
          background: selectedSubs[sub.id] ? 'rgba(212,160,23,0.06)' : DARK,
          border: `1px solid ${selectedSubs[sub.id] ? 'rgba(212,160,23,0.3)' : BORDER}`,
          cursor: 'pointer', transition: 'all 0.15s',
        }}>
          <input type="checkbox" checked={!!selectedSubs[sub.id]} onChange={() => toggleSub(sub.id)}
            style={{ accentColor: GOLD, width: 16, height: 16 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{sub.name}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{sub.email} · Last: {sub.lastProject}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: sub.winRate >= 75 ? 'rgba(61,214,140,0.12)' : 'rgba(212,160,23,0.12)',
              color: sub.winRate >= 75 ? GREEN : GOLD,
            }}>
              {sub.winRate}% Win
            </span>
            <span style={{ fontSize: 11, color: DIM }}>★ {sub.rating}</span>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 18, marginBottom: 18 }}>
        <Label>Add by email (manual)</Label>
        <input
          value={manualEmail}
          onChange={e => onManualEmailChange(e.target.value)}
          placeholder="email@subcontractor.com, another@sub.com"
          style={inputStyle()}
        />
        <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Separate multiple addresses with commas.</div>
      </div>

      <div style={{ padding: '12px 16px', background: RAISED2, borderRadius: 8, marginBottom: 20 }}>
        <CheckRow
          checked={autoInvite}
          onChange={onAutoInviteChange}
          label="Send invites automatically when package is created"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <PrimaryBtn onClick={onNext}>Next: Review & Create →</PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Step 4: Review & Create ──────────────────────────────────────────────────

function Step4({ trade, scope, lineItems, selectedSubCount, packageName, onPackageNameChange,
  dueDate, onDueDateChange, instructions, onInstructionsChange, onSubmit, onBack, submitting }: {
  trade: string;
  scope: string;
  lineItems: LineItem[];
  selectedSubCount: number;
  packageName: string;
  onPackageNameChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
  instructions: string;
  onInstructionsChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const selectedItems = lineItems.filter(r => r.selected);
  const total = selectedItems.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0);

  const summaryItems = [
    { label: 'Trade / Division', value: trade || '—' },
    { label: 'Scope', value: scope || '—' },
    { label: 'Line Items', value: String(selectedItems.length) },
    { label: 'Estimated Value', value: `$${total.toLocaleString()}` },
    { label: 'Subs to Invite', value: String(selectedSubCount) },
  ];

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', color: GOLD, fontSize: 17, fontWeight: 800 }}>Review & Create</h3>
      <p style={{ margin: '0 0 16px', color: DIM, fontSize: 13 }}>Confirm the details and create your bid package.</p>

      {/* Summary card */}
      <div style={{ background: DARK, border: `1px solid rgba(212,160,23,0.25)`, borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Package Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
          {summaryItems.map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, color: DIM, fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: TEXT, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <Label>Package Name</Label>
          <input value={packageName} onChange={e => onPackageNameChange(e.target.value)}
            style={inputStyle()} />
        </div>
        <div>
          <Label>Bid Due Date</Label>
          <input type="date" value={dueDate} onChange={e => onDueDateChange(e.target.value)}
            style={inputStyle()} />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Label>Bid Instructions</Label>
        <textarea
          value={instructions}
          onChange={e => onInstructionsChange(e.target.value)}
          rows={4}
          placeholder="Special instructions for bidders (submission format, site walk requirements, etc.)…"
          style={inputStyle({ resize: 'vertical' })}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <button
          onClick={onSubmit}
          disabled={submitting}
          style={{
            padding: '12px 32px',
            background: submitting ? '#3a4a5a' : `linear-gradient(135deg,${GOLD},#F0C040)`,
            border: 'none', borderRadius: 8,
            color: submitting ? DIM : '#0d1117',
            fontSize: 15, fontWeight: 800,
            cursor: submitting ? 'not-allowed' : 'pointer',
            boxShadow: submitting ? 'none' : `0 4px 16px rgba(212,160,23,0.3)`,
          }}
        >
          {submitting ? '⏳ Creating…' : '🤖 Create Bid Package'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────

export default function BidPackageWizard({ projectId, onClose, onCreated }: WizardProps) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [step1, setStep1] = useState<Step1Data>({
    trade: '', scope: '', prevailingWage: false, bonding: false, insurance: false,
  });

  // Step 2
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Step 3
  const [selectedSubs, setSelectedSubs] = useState<Record<string, boolean>>({});
  const [manualEmail, setManualEmail] = useState('');
  const [autoInvite, setAutoInvite] = useState(true);

  // Step 4
  const tradeName = step1.trade.replace(/^Division \d+ — /, '');
  const [packageName, setPackageName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');

  // Auto-fill package name when trade is selected
  useEffect(() => {
    if (step1.trade) {
      setPackageName(`${tradeName} Package — ${new Date().toLocaleDateString()}`);
    }
  }, [step1.trade, tradeName]);

  const selectedSubCount = Object.values(selectedSubs).filter(Boolean).length +
    (manualEmail.trim() ? manualEmail.split(',').filter(e => e.trim()).length : 0);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const token = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('sb-access-token='))?.split('=')[1] || '';
      const body = {
        projectId,
        name: packageName,
        bidDue: dueDate,
        scope: step1.scope,
        trade: step1.trade,
        prevailingWage: step1.prevailingWage,
        bonding: step1.bonding,
        insurance: step1.insurance,
        lineItems: lineItems.filter(r => r.selected),
        subs: Object.entries(selectedSubs).filter(([, v]) => v).map(([id]) => id),
        manualEmails: manualEmail.split(',').map(e => e.trim()).filter(Boolean),
        autoInvite,
        instructions,
      };
      const r = await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.bidPackage?.id) {
        onCreated(d.bidPackage.id);
      }
    } catch {
      // ignore — demo fallback handled by API
    } finally {
      setSubmitting(false);
    }
  }

  // Prevent body scroll when modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      />

      {/* Modal card */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 900, maxWidth: '95vw',
        maxHeight: '85vh', overflow: 'hidden',
        background: RAISED, borderRadius: 14,
        border: `1px solid ${BORDER}`,
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 28px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: DARK, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>New Bid Package</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>AI-powered bid jacket generation</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: DIM,
              fontSize: 22, cursor: 'pointer', lineHeight: 1,
              padding: '4px 8px', borderRadius: 6,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
            onMouseLeave={e => (e.currentTarget.style.color = DIM)}
          >
            ×
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ flexShrink: 0 }}>
          <ProgressBar step={step} />
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {step === 0 && (
            <Step1
              data={step1}
              onChange={d => setStep1(prev => ({ ...prev, ...d }))}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <Step2
              projectId={projectId}
              lineItems={lineItems}
              onLineItemsChange={setLineItems}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <Step3
              trade={step1.trade}
              projectId={projectId}
              selectedSubs={selectedSubs}
              onSelectedSubsChange={setSelectedSubs}
              manualEmail={manualEmail}
              onManualEmailChange={setManualEmail}
              autoInvite={autoInvite}
              onAutoInviteChange={setAutoInvite}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step4
              trade={step1.trade}
              scope={step1.scope}
              lineItems={lineItems}
              selectedSubCount={selectedSubCount}
              packageName={packageName}
              onPackageNameChange={setPackageName}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              instructions={instructions}
              onInstructionsChange={setInstructions}
              onSubmit={handleSubmit}
              onBack={() => setStep(2)}
              submitting={submitting}
            />
          )}
        </div>
      </div>
    </>
  );
}
