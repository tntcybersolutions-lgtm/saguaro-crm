'use client';
/**
 * Saguaro Field — Waste & Recycling Tracking
 * Track construction waste, diversion rates, hauler manifests, LEED credits. Offline queue.
 */
import React, { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ── Types ───────────────────────────────────────────────────────── */

const WASTE_TYPES = [
  'concrete','wood','metal','drywall','roofing','masonry','plastic',
  'cardboard','mixed_c_d','hazardous','soil','asphalt','glass','insulation','other',
] as const;
type WasteType = typeof WASTE_TYPES[number];

const DISPOSAL_METHODS = [
  'landfill','recycling','reuse','donation','hazardous_facility','composting','other',
] as const;
type DisposalMethod = typeof DISPOSAL_METHODS[number];

const UNITS = ['tons','cubic_yards','pounds','loads','dumpsters','gallons'] as const;
type Unit = typeof UNITS[number];

interface WasteRecord {
  id: string;
  ticket_number: string;
  waste_date: string;
  waste_type: WasteType;
  disposal_method: DisposalMethod;
  quantity: number;
  unit: Unit;
  hauler_name: string;
  hauler_ticket: string;
  destination_facility: string;
  cost: number;
  recycled: boolean;
  diverted: boolean;
  manifest_number: string;
  notes: string;
  photos: string[];
  created_at: string;
}

type View = 'list' | 'new' | 'quick' | 'dashboard' | 'hazmat' | 'costs' | 'leed';

const WASTE_ICONS: Record<WasteType, string> = {
  concrete: '\u2B1B', wood: '\uD83E\uDEB5', metal: '\u2699\uFE0F', drywall: '\uD83E\uDDF1',
  roofing: '\uD83C\uDFE0', masonry: '\uD83E\uDDF1', plastic: '\u267B\uFE0F', cardboard: '\uD83D\uDCE6',
  mixed_c_d: '\uD83D\uDDC4\uFE0F', hazardous: '\u2622\uFE0F', soil: '\uD83E\uDEA8', asphalt: '\uD83D\uDEE3\uFE0F',
  glass: '\uD83E\uDEDF', insulation: '\uD83E\uDDF6', other: '\uD83D\uDCCB',
};

const METHOD_COLORS: Record<DisposalMethod, string> = {
  landfill: RED, recycling: GREEN, reuse: BLUE, donation: AMBER,
  hazardous_facility: '#A855F7', composting: '#84CC16', other: DIM,
};

function fmt(s: string): string { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function fmtCurrency(n: number): string { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function today(): string { return new Date().toISOString().slice(0, 10); }

/* ── Shared Styles ───────────────────────────────────────────────── */

const btnStyle = (bg: string, small = false): React.CSSProperties => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 8,
  padding: small ? '6px 12px' : '10px 18px', fontWeight: 600,
  fontSize: small ? 12 : 14, cursor: 'pointer', whiteSpace: 'nowrap',
});

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#0A1628', border: `1px solid ${BORDER}`,
  borderRadius: 8, color: TEXT, fontSize: 14, boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', color: DIM, fontSize: 12, fontWeight: 600,
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};

const cardStyle: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: 14, marginBottom: 10,
};

/* ── Progress Ring SVG ───────────────────────────────────────────── */

function ProgressRing({ pct, size = 120, stroke = 10, color = GREEN }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={TEXT} fontSize={size * 0.22} fontWeight={700}>{Math.round(pct)}%</text>
    </svg>
  );
}

/* ── Text-based bar chart ────────────────────────────────────────── */

function BarChart({ data, maxWidth = 200 }: { data: { label: string; value: number; color: string }[]; maxWidth?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ color: DIM, fontSize: 11, width: 70, textAlign: 'right', flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, maxWidth }}>
            <div style={{ background: d.color, height: 16, borderRadius: 4, width: `${(d.value / max) * 100}%`, minWidth: d.value > 0 ? 4 : 0, transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ color: TEXT, fontSize: 12, fontWeight: 600, width: 60 }}>{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */

function WasteTrackingPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>('list');
  const [records, setRecords] = useState<WasteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);

  // Filters & sorting
  const [filterType, setFilterType] = useState<WasteType | ''>('');
  const [filterMethod, setFilterMethod] = useState<DisposalMethod | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'quantity' | 'cost'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Form state
  const [fTicket, setFTicket] = useState('');
  const [fDate, setFDate] = useState(today());
  const [fType, setFType] = useState<WasteType>('concrete');
  const [fMethod, setFMethod] = useState<DisposalMethod>('landfill');
  const [fQty, setFQty] = useState('');
  const [fUnit, setFUnit] = useState<Unit>('tons');
  const [fHauler, setFHauler] = useState('');
  const [fHaulerTicket, setFHaulerTicket] = useState('');
  const [fDest, setFDest] = useState('');
  const [fCost, setFCost] = useState('');
  const [fRecycled, setFRecycled] = useState(false);
  const [fDiverted, setFDiverted] = useState(false);
  const [fManifest, setFManifest] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fPhotos, setFPhotos] = useState<string[]>([]);

  /* ── Online/offline ─────────────────────────────────── */
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ── Fetch records ──────────────────────────────────── */
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch(`/api/projects/${projectId}/waste-tracking`)
      .then(r => r.ok ? r.json() : { records: [] })
      .then(d => setRecords(d.records || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  /* ── Filtering & sorting ────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...records];
    if (filterType) list = list.filter(r => r.waste_type === filterType);
    if (filterMethod) list = list.filter(r => r.disposal_method === filterMethod);
    if (filterDateFrom) list = list.filter(r => r.waste_date >= filterDateFrom);
    if (filterDateTo) list = list.filter(r => r.waste_date <= filterDateTo);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = a.waste_date.localeCompare(b.waste_date);
      else if (sortBy === 'quantity') cmp = a.quantity - b.quantity;
      else cmp = a.cost - b.cost;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [records, filterType, filterMethod, filterDateFrom, filterDateTo, sortBy, sortDir]);

  /* ── Computed totals ────────────────────────────────── */
  const totals = useMemo(() => {
    const totalWaste = records.reduce((s, r) => s + r.quantity, 0);
    const totalDiverted = records.filter(r => r.diverted || r.recycled).reduce((s, r) => s + r.quantity, 0);
    const totalLandfill = records.filter(r => r.disposal_method === 'landfill').reduce((s, r) => s + r.quantity, 0);
    const totalCost = records.reduce((s, r) => s + (r.cost || 0), 0);
    const diversionRate = totalWaste > 0 ? (totalDiverted / totalWaste) * 100 : 0;
    return { totalWaste, totalDiverted, totalLandfill, totalCost, diversionRate };
  }, [records]);

  /* ── Monthly summary data ───────────────────────────── */
  const monthlySummary = useMemo(() => {
    const months: Record<string, { waste: number; diverted: number; cost: number }> = {};
    records.forEach(r => {
      const m = r.waste_date.slice(0, 7);
      if (!months[m]) months[m] = { waste: 0, diverted: 0, cost: 0 };
      months[m].waste += r.quantity;
      if (r.diverted || r.recycled) months[m].diverted += r.quantity;
      months[m].cost += r.cost || 0;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
  }, [records]);

  /* ── Cost by waste type ─────────────────────────────── */
  const costByType = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach(r => { map[r.waste_type] = (map[r.waste_type] || 0) + (r.cost || 0); });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [records]);

  /* ── Hazardous records ──────────────────────────────── */
  const hazRecords = useMemo(() => records.filter(r => r.waste_type === 'hazardous' || r.manifest_number), [records]);

  /* ── Reset form ─────────────────────────────────────── */
  function resetForm() {
    setFTicket(''); setFDate(today()); setFType('concrete'); setFMethod('landfill');
    setFQty(''); setFUnit('tons'); setFHauler(''); setFHaulerTicket('');
    setFDest(''); setFCost(''); setFRecycled(false); setFDiverted(false);
    setFManifest(''); setFNotes(''); setFPhotos([]); setEditId(null);
  }

  /* ── Save record ────────────────────────────────────── */
  async function handleSave() {
    if (!fQty || !projectId) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      ticket_number: fTicket, waste_date: fDate, waste_type: fType,
      disposal_method: fMethod, quantity: parseFloat(fQty), unit: fUnit,
      hauler_name: fHauler, hauler_ticket: fHaulerTicket, destination_facility: fDest,
      cost: parseFloat(fCost) || 0, recycled: fRecycled, diverted: fDiverted,
      manifest_number: fManifest, notes: fNotes, photos: fPhotos,
    };
    const url = editId
      ? `/api/projects/${projectId}/waste-tracking/${editId}`
      : `/api/projects/${projectId}/waste-tracking`;
    const method = editId ? 'PATCH' : 'POST';
    try {
      if (online) {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
          const d = await res.json();
          if (editId) {
            setRecords(prev => prev.map(r => r.id === editId ? { ...r, ...d.record } : r));
          } else {
            setRecords(prev => [d.record, ...prev]);
          }
        }
      } else {
        await enqueue({ url, method, body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
        const tempRecord: WasteRecord = {
          id: `temp-${Date.now()}`, ...body as unknown as Omit<WasteRecord, 'id' | 'created_at'>,
          created_at: new Date().toISOString(),
        } as WasteRecord;
        if (!editId) setRecords(prev => [tempRecord, ...prev]);
      }
      resetForm();
      setView('list');
    } catch {
      await enqueue({ url, method, body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
    } finally {
      setSaving(false);
    }
  }

  /* ── Quick-log save ─────────────────────────────────── */
  async function handleQuickSave() {
    if (!fQty || !projectId) return;
    setSaving(true);
    const body = {
      ticket_number: '', waste_date: today(), waste_type: fType,
      disposal_method: fMethod, quantity: parseFloat(fQty), unit: fUnit,
      hauler_name: '', hauler_ticket: '', destination_facility: '',
      cost: 0, recycled: fMethod === 'recycling', diverted: fMethod !== 'landfill',
      manifest_number: '', notes: 'Quick log entry', photos: [],
    };
    const url = `/api/projects/${projectId}/waste-tracking`;
    try {
      if (online) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
          const d = await res.json();
          setRecords(prev => [d.record, ...prev]);
        }
      } else {
        await enqueue({ url, method: 'POST', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
        setRecords(prev => [{ id: `temp-${Date.now()}`, ...body, created_at: new Date().toISOString() } as WasteRecord, ...prev]);
      }
      resetForm();
      setView('list');
    } catch {
      await enqueue({ url, method: 'POST', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
    } finally {
      setSaving(false);
    }
  }

  /* ── Photo capture ──────────────────────────────────── */
  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') setFPhotos(prev => [...prev, reader.result as string]); };
    reader.readAsDataURL(file);
  }

  /* ── Edit record ────────────────────────────────────── */
  function startEdit(r: WasteRecord) {
    setEditId(r.id);
    setFTicket(r.ticket_number || '');
    setFDate(r.waste_date || today());
    setFType(r.waste_type);
    setFMethod(r.disposal_method);
    setFQty(String(r.quantity));
    setFUnit(r.unit);
    setFHauler(r.hauler_name || '');
    setFHaulerTicket(r.hauler_ticket || '');
    setFDest(r.destination_facility || '');
    setFCost(String(r.cost || ''));
    setFRecycled(r.recycled);
    setFDiverted(r.diverted);
    setFManifest(r.manifest_number || '');
    setFNotes(r.notes || '');
    setFPhotos(r.photos || []);
    setView('new');
  }

  /* ── PDF export ─────────────────────────────────────── */
  function handlePrint() { window.print(); }

  /* ── Navigation tabs ────────────────────────────────── */
  const tabs: { key: View; label: string }[] = [
    { key: 'list', label: 'Records' }, { key: 'dashboard', label: 'Dashboard' },
    { key: 'costs', label: 'Costs' }, { key: 'hazmat', label: 'HazMat' },
    { key: 'leed', label: 'LEED' },
  ];

  /* ── Compliance summary ─────────────────────────────── */
  const compliance = useMemo(() => {
    const hazWithoutManifest = records.filter(r => r.waste_type === 'hazardous' && !r.manifest_number).length;
    const missingTickets = records.filter(r => !r.hauler_ticket && r.hauler_name).length;
    const missingFacility = records.filter(r => !r.destination_facility).length;
    const issues = hazWithoutManifest + missingTickets + missingFacility;
    return { hazWithoutManifest, missingTickets, missingFacility, issues, status: issues === 0 ? 'Compliant' : 'Action Required' };
  }, [records]);

  /* ── LEED targets ───────────────────────────────────── */
  const leedTargets = [
    { label: 'MR Credit 2.1 — 50% Diversion', target: 50 },
    { label: 'MR Credit 2.2 — 75% Diversion', target: 75 },
  ];

  /* ────────────────── RENDER ─────────────────────────── */

  if (!projectId) {
    return (
      <div style={{ padding: 24, color: RED, textAlign: 'center', fontWeight: 600 }}>
        No project selected. Please select a project first.
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1222', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: GOLD }}>Waste Tracking</h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, background: online ? GREEN : RED, color: '#fff', fontWeight: 600 }}>
              {online ? 'Online' : 'Offline'}
            </span>
            <button style={btnStyle(BORDER, true)} onClick={handlePrint}>PDF</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              style={{ ...btnStyle(view === t.key ? GOLD : 'transparent', true), color: view === t.key ? '#000' : DIM, border: view === t.key ? 'none' : `1px solid ${BORDER}` }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px' }}>
        {[
          { label: 'Total Waste', value: totals.totalWaste.toLocaleString(), sub: 'qty', color: TEXT },
          { label: 'Diverted', value: totals.totalDiverted.toLocaleString(), sub: 'qty', color: GREEN },
          { label: 'Cost', value: fmtCurrency(totals.totalCost), sub: 'total', color: AMBER },
          { label: 'Diversion', value: `${Math.round(totals.diversionRate)}%`, sub: 'rate', color: totals.diversionRate >= 75 ? GREEN : totals.diversionRate >= 50 ? AMBER : RED },
        ].map((s, i) => (
          <div key={i} style={{ ...cardStyle, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 16px 100px' }}>

        {/* ════════════ LIST VIEW ════════════ */}
        {view === 'list' && (
          <>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={btnStyle(GOLD)} onClick={() => { resetForm(); setView('new'); }}>+ New Record</button>
              <button style={btnStyle(BLUE)} onClick={() => { resetForm(); setView('quick'); }}>Quick Log</button>
            </div>

            {/* Filters */}
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 8 }}>FILTERS & SORT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Waste Type</label>
                  <select style={inputStyle} value={filterType} onChange={e => setFilterType(e.target.value as WasteType | '')}>
                    <option value="">All Types</option>
                    {WASTE_TYPES.map(t => <option key={t} value={t}>{fmt(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Disposal</label>
                  <select style={inputStyle} value={filterMethod} onChange={e => setFilterMethod(e.target.value as DisposalMethod | '')}>
                    <option value="">All Methods</option>
                    {DISPOSAL_METHODS.map(m => <option key={m} value={m}>{fmt(m)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>From</label>
                  <input type="date" style={inputStyle} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>To</label>
                  <input type="date" style={inputStyle} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0, lineHeight: '32px' }}>Sort:</label>
                {(['date', 'quantity', 'cost'] as const).map(s => (
                  <button key={s} onClick={() => { if (sortBy === s) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(s); setSortDir('desc'); } }}
                    style={{ ...btnStyle(sortBy === s ? GOLD : 'transparent', true), color: sortBy === s ? '#000' : DIM, border: `1px solid ${BORDER}` }}>
                    {fmt(s)} {sortBy === s ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Records list */}
            {loading ? (
              <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading records...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>No waste records found. Tap "+ New Record" to begin tracking.</div>
            ) : (
              filtered.map(r => (
                <div key={r.id} style={{ ...cardStyle, cursor: 'pointer' }} onClick={() => startEdit(r)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 24 }}>{WASTE_ICONS[r.waste_type] || '\uD83D\uDCCB'}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(r.waste_type)}</div>
                        <div style={{ color: DIM, fontSize: 12 }}>
                          {r.quantity} {fmt(r.unit)} {r.ticket_number ? `\u2022 #${r.ticket_number}` : ''}
                        </div>
                        {r.hauler_name && <div style={{ color: DIM, fontSize: 11 }}>Hauler: {r.hauler_name}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: METHOD_COLORS[r.disposal_method] || DIM, color: '#fff', fontWeight: 600 }}>
                        {fmt(r.disposal_method)}
                      </span>
                      <div style={{ color: DIM, fontSize: 11, marginTop: 4 }}>{r.waste_date}</div>
                      {r.cost > 0 && <div style={{ color: AMBER, fontSize: 12, fontWeight: 600 }}>{fmtCurrency(r.cost)}</div>}
                    </div>
                  </div>
                  {r.waste_type === 'hazardous' && (
                    <div style={{ marginTop: 6, padding: '4px 8px', background: '#3B0764', borderRadius: 6, fontSize: 11, color: '#D8B4FE' }}>
                      Manifest: {r.manifest_number || 'MISSING'}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* ════════════ NEW RECORD FORM ════════════ */}
        {view === 'new' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>{editId ? 'Edit Record' : 'New Waste Record'}</h2>
              <button style={btnStyle(BORDER, true)} onClick={() => { resetForm(); setView('list'); }}>Cancel</button>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Ticket Number</label>
                  <input style={inputStyle} value={fTicket} onChange={e => setFTicket(e.target.value)} placeholder="WT-001" />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" style={inputStyle} value={fDate} onChange={e => setFDate(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Waste Type</label>
                  <select style={inputStyle} value={fType} onChange={e => setFType(e.target.value as WasteType)}>
                    {WASTE_TYPES.map(t => <option key={t} value={t}>{fmt(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Disposal Method</label>
                  <select style={inputStyle} value={fMethod} onChange={e => setFMethod(e.target.value as DisposalMethod)}>
                    {DISPOSAL_METHODS.map(m => <option key={m} value={m}>{fmt(m)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Quantity</label>
                  <input type="number" style={inputStyle} value={fQty} onChange={e => setFQty(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label style={labelStyle}>Unit</label>
                  <select style={inputStyle} value={fUnit} onChange={e => setFUnit(e.target.value as Unit)}>
                    {UNITS.map(u => <option key={u} value={u}>{fmt(u)}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 8 }}>HAULER INFORMATION</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Hauler Name</label>
                    <input style={inputStyle} value={fHauler} onChange={e => setFHauler(e.target.value)} placeholder="Company name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Hauler Ticket #</label>
                    <input style={inputStyle} value={fHaulerTicket} onChange={e => setFHaulerTicket(e.target.value)} placeholder="Ticket number" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Destination Facility</label>
                    <input style={inputStyle} value={fDest} onChange={e => setFDest(e.target.value)} placeholder="Facility name" />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 8 }}>COST & DIVERSION</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Cost ($)</label>
                    <input type="number" style={inputStyle} value={fCost} onChange={e => setFCost(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Manifest #</label>
                    <input style={inputStyle} value={fManifest} onChange={e => setFManifest(e.target.value)} placeholder="HAZ-001" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={fRecycled} onChange={e => setFRecycled(e.target.checked)} style={{ accentColor: GREEN }} />
                    Recycled
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={fDiverted} onChange={e => setFDiverted(e.target.checked)} style={{ accentColor: BLUE }} />
                    Diverted from Landfill
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Additional details..." />
              </div>

              {/* Photo capture */}
              <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 8 }}>PHOTO DOCUMENTATION</div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoCapture} />
                <button style={btnStyle(BORDER)} onClick={() => fileRef.current?.click()}>Capture Photo</button>
                {fPhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {fPhotos.map((p, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={p} alt={`Load photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                        <button onClick={() => setFPhotos(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, background: RED, color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', lineHeight: '20px', textAlign: 'center' }}>
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button style={{ ...btnStyle(GOLD), width: '100%', marginTop: 16, fontSize: 16, padding: 14, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave} disabled={saving || !fQty}>
                {saving ? 'Saving...' : editId ? 'Update Record' : 'Save Record'}
              </button>
            </div>
          </>
        )}

        {/* ════════════ QUICK LOG ════════════ */}
        {view === 'quick' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>Quick Log</h2>
              <button style={btnStyle(BORDER, true)} onClick={() => { resetForm(); setView('list'); }}>Cancel</button>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>Fast entry mode: select type, enter quantity, pick method.</div>

              <label style={labelStyle}>Waste Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                {WASTE_TYPES.map(t => (
                  <button key={t} onClick={() => setFType(t)}
                    style={{ ...btnStyle(fType === t ? GOLD : 'transparent', true), border: `1px solid ${fType === t ? GOLD : BORDER}`, color: fType === t ? '#000' : TEXT, textAlign: 'center', padding: '8px 4px', fontSize: 11 }}>
                    {WASTE_ICONS[t]} {fmt(t)}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Quantity</label>
                  <input type="number" style={{ ...inputStyle, fontSize: 20, textAlign: 'center' }} value={fQty} onChange={e => setFQty(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label style={labelStyle}>Unit</label>
                  <select style={inputStyle} value={fUnit} onChange={e => setFUnit(e.target.value as Unit)}>
                    {UNITS.map(u => <option key={u} value={u}>{fmt(u)}</option>)}
                  </select>
                </div>
              </div>

              <label style={labelStyle}>Disposal Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 16 }}>
                {DISPOSAL_METHODS.map(m => (
                  <button key={m} onClick={() => setFMethod(m)}
                    style={{ ...btnStyle(fMethod === m ? METHOD_COLORS[m] : 'transparent', true), border: `1px solid ${fMethod === m ? METHOD_COLORS[m] : BORDER}`, color: fMethod === m ? '#fff' : TEXT, padding: 10 }}>
                    {fmt(m)}
                  </button>
                ))}
              </div>

              <button style={{ ...btnStyle(GREEN), width: '100%', fontSize: 16, padding: 14, opacity: saving ? 0.6 : 1 }}
                onClick={handleQuickSave} disabled={saving || !fQty}>
                {saving ? 'Logging...' : 'Log Waste'}
              </button>
            </div>
          </>
        )}

        {/* ════════════ DASHBOARD ════════════ */}
        {view === 'dashboard' && (
          <>
            <h2 style={{ fontSize: 18, color: GOLD, margin: '0 0 12px' }}>Diversion Rate Dashboard</h2>

            {/* Progress ring */}
            <div style={cardStyle}>
              <ProgressRing pct={totals.diversionRate} size={140} color={totals.diversionRate >= 75 ? GREEN : totals.diversionRate >= 50 ? AMBER : RED} />
              <div style={{ textAlign: 'center', marginTop: 8, color: DIM, fontSize: 13 }}>
                {totals.totalDiverted.toLocaleString()} diverted of {totals.totalWaste.toLocaleString()} total
              </div>
            </div>

            {/* Breakdown by disposal method */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>BY DISPOSAL METHOD</div>
              <BarChart data={DISPOSAL_METHODS.map(m => ({
                label: fmt(m), color: METHOD_COLORS[m],
                value: records.filter(r => r.disposal_method === m).reduce((s, r) => s + r.quantity, 0),
              })).filter(d => d.value > 0)} />
            </div>

            {/* Breakdown by waste type */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>BY WASTE TYPE</div>
              <BarChart data={WASTE_TYPES.map(t => ({
                label: fmt(t), color: GOLD,
                value: records.filter(r => r.waste_type === t).reduce((s, r) => s + r.quantity, 0),
              })).filter(d => d.value > 0)} />
            </div>

            {/* Environmental compliance summary */}
            <div style={{ ...cardStyle, borderColor: compliance.issues > 0 ? RED : GREEN }}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 8 }}>ENVIRONMENTAL COMPLIANCE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>{compliance.issues === 0 ? '\u2705' : '\u26A0\uFE0F'}</span>
                <span style={{ fontWeight: 700, color: compliance.issues === 0 ? GREEN : AMBER }}>{compliance.status}</span>
              </div>
              {compliance.hazWithoutManifest > 0 && (
                <div style={{ color: RED, fontSize: 12, marginBottom: 4 }}>
                  {compliance.hazWithoutManifest} hazardous record(s) missing manifest numbers
                </div>
              )}
              {compliance.missingTickets > 0 && (
                <div style={{ color: AMBER, fontSize: 12, marginBottom: 4 }}>
                  {compliance.missingTickets} record(s) with hauler but no ticket number
                </div>
              )}
              {compliance.missingFacility > 0 && (
                <div style={{ color: AMBER, fontSize: 12, marginBottom: 4 }}>
                  {compliance.missingFacility} record(s) missing destination facility
                </div>
              )}
              {compliance.issues === 0 && (
                <div style={{ color: GREEN, fontSize: 12 }}>All records have required documentation.</div>
              )}
            </div>

            {/* Monthly summary */}
            {monthlySummary.length > 0 && (
              <div style={cardStyle}>
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>MONTHLY SUMMARY</div>
                <BarChart data={monthlySummary.map(([month, d]) => ({
                  label: month, color: BLUE, value: d.waste,
                }))} />
                <div style={{ marginTop: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Monthly Diversion</div>
                  <BarChart data={monthlySummary.map(([month, d]) => ({
                    label: month, color: GREEN, value: d.diverted,
                  }))} />
                </div>
                <div style={{ marginTop: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Monthly Cost</div>
                  <BarChart data={monthlySummary.map(([month, d]) => ({
                    label: month, color: AMBER, value: d.cost,
                  }))} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════ COSTS VIEW ════════════ */}
        {view === 'costs' && (
          <>
            <h2 style={{ fontSize: 18, color: GOLD, margin: '0 0 12px' }}>Cost Tracking</h2>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: DIM, fontSize: 13 }}>Total Waste Cost</span>
                <span style={{ color: AMBER, fontSize: 20, fontWeight: 700 }}>{fmtCurrency(totals.totalCost)}</span>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>COST BY WASTE TYPE</div>
              {costByType.length === 0 ? (
                <div style={{ color: DIM, fontSize: 13 }}>No cost data recorded yet.</div>
              ) : (
                <>
                  <BarChart data={costByType.map(([type, cost]) => ({
                    label: fmt(type), color: AMBER, value: cost,
                  }))} />
                  <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                    {costByType.map(([type, cost]) => (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ color: TEXT, fontSize: 13 }}>{WASTE_ICONS[type as WasteType]} {fmt(type)}</span>
                        <span style={{ color: AMBER, fontSize: 13, fontWeight: 600 }}>{fmtCurrency(cost)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Hauler tracking */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>HAULER SUMMARY</div>
              {(() => {
                const haulers: Record<string, { loads: number; cost: number; tickets: string[] }> = {};
                records.forEach(r => {
                  if (!r.hauler_name) return;
                  if (!haulers[r.hauler_name]) haulers[r.hauler_name] = { loads: 0, cost: 0, tickets: [] };
                  haulers[r.hauler_name].loads++;
                  haulers[r.hauler_name].cost += r.cost || 0;
                  if (r.hauler_ticket) haulers[r.hauler_name].tickets.push(r.hauler_ticket);
                });
                const entries = Object.entries(haulers).sort(([, a], [, b]) => b.cost - a.cost);
                if (entries.length === 0) return <div style={{ color: DIM, fontSize: 13 }}>No hauler data recorded yet.</div>;
                return entries.map(([name, data]) => (
                  <div key={name} style={{ padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{name}</span>
                      <span style={{ color: AMBER, fontWeight: 600 }}>{fmtCurrency(data.cost)}</span>
                    </div>
                    <div style={{ color: DIM, fontSize: 11 }}>
                      {data.loads} load(s) {data.tickets.length > 0 && `| Tickets: ${data.tickets.join(', ')}`}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </>
        )}

        {/* ════════════ HAZMAT VIEW ════════════ */}
        {view === 'hazmat' && (
          <>
            <h2 style={{ fontSize: 18, color: GOLD, margin: '0 0 12px' }}>Hazardous Waste Manifests</h2>

            <div style={{ ...cardStyle, borderColor: '#A855F7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#D8B4FE', fontWeight: 700 }}>HAZARDOUS RECORDS</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#A855F7' }}>{hazRecords.length}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: DIM }}>Missing Manifests</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: compliance.hazWithoutManifest > 0 ? RED : GREEN }}>
                    {compliance.hazWithoutManifest}
                  </div>
                </div>
              </div>
            </div>

            {hazRecords.length === 0 ? (
              <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>No hazardous waste records found.</div>
            ) : (
              hazRecords.map(r => (
                <div key={r.id} style={{ ...cardStyle, borderColor: r.manifest_number ? '#A855F7' : RED, cursor: 'pointer' }} onClick={() => startEdit(r)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: TEXT }}>{'\u2622\uFE0F'} {fmt(r.waste_type)}</div>
                      <div style={{ color: DIM, fontSize: 12 }}>{r.quantity} {fmt(r.unit)} | {r.waste_date}</div>
                      {r.hauler_name && <div style={{ color: DIM, fontSize: 11 }}>Hauler: {r.hauler_name}</div>}
                      {r.destination_facility && <div style={{ color: DIM, fontSize: 11 }}>Facility: {r.destination_facility}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: METHOD_COLORS[r.disposal_method], color: '#fff', fontWeight: 600 }}>
                        {fmt(r.disposal_method)}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, padding: '6px 10px', background: r.manifest_number ? '#1E1045' : '#450A0A', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: r.manifest_number ? '#D8B4FE' : '#FCA5A5', fontWeight: 600 }}>
                      Manifest: {r.manifest_number || 'NOT ASSIGNED'}
                    </span>
                    {!r.manifest_number && <span style={{ fontSize: 10, color: RED, fontWeight: 700 }}>ACTION REQUIRED</span>}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ════════════ LEED VIEW ════════════ */}
        {view === 'leed' && (
          <>
            <h2 style={{ fontSize: 18, color: GOLD, margin: '0 0 12px' }}>LEED Waste Management Credits</h2>

            {/* Overall diversion ring */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>OVERALL DIVERSION RATE</div>
              <ProgressRing pct={totals.diversionRate} size={160} stroke={14}
                color={totals.diversionRate >= 75 ? GREEN : totals.diversionRate >= 50 ? AMBER : RED} />
            </div>

            {/* Credit targets */}
            {leedTargets.map((target, i) => {
              const met = totals.diversionRate >= target.target;
              return (
                <div key={i} style={{ ...cardStyle, borderColor: met ? GREEN : BORDER }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{target.label}</div>
                      <div style={{ color: DIM, fontSize: 12 }}>Target: {target.target}% diversion rate</div>
                    </div>
                    <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 10, background: met ? GREEN : RED, color: '#fff', fontWeight: 700 }}>
                      {met ? 'EARNED' : 'NOT MET'}
                    </span>
                  </div>
                  <div style={{ background: '#0A1628', borderRadius: 6, height: 20, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ background: met ? GREEN : AMBER, height: '100%', width: `${Math.min(totals.diversionRate, 100)}%`, borderRadius: 6, transition: 'width 0.5s ease' }} />
                    <div style={{ position: 'absolute', left: `${target.target}%`, top: 0, height: '100%', width: 2, background: TEXT, opacity: 0.6 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: DIM }}>
                    <span>Current: {Math.round(totals.diversionRate)}%</span>
                    <span>Target: {target.target}%</span>
                  </div>
                  {!met && totals.totalWaste > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: AMBER }}>
                      Need to divert {Math.ceil((target.target / 100) * totals.totalWaste - totals.totalDiverted)} more units to reach target.
                    </div>
                  )}
                </div>
              );
            })}

            {/* Diversion detail by type */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>DIVERSION BY MATERIAL</div>
              {WASTE_TYPES.map(t => {
                const typeRecords = records.filter(r => r.waste_type === t);
                if (typeRecords.length === 0) return null;
                const typeTotal = typeRecords.reduce((s, r) => s + r.quantity, 0);
                const typeDiverted = typeRecords.filter(r => r.diverted || r.recycled).reduce((s, r) => s + r.quantity, 0);
                const typePct = typeTotal > 0 ? (typeDiverted / typeTotal) * 100 : 0;
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{WASTE_ICONS[t]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, color: TEXT }}>{fmt(t)}</span>
                        <span style={{ fontSize: 11, color: typePct >= 75 ? GREEN : typePct >= 50 ? AMBER : RED, fontWeight: 600 }}>
                          {Math.round(typePct)}% ({typeDiverted}/{typeTotal})
                        </span>
                      </div>
                      <div style={{ background: '#0A1628', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{ background: typePct >= 75 ? GREEN : typePct >= 50 ? AMBER : RED, height: '100%', width: `${typePct}%`, borderRadius: 4, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary stats */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 10 }}>WASTE SUMMARY FOR LEED</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ color: DIM, fontSize: 11 }}>Total Generated</div>
                  <div style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>{totals.totalWaste.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: DIM, fontSize: 11 }}>Total Diverted</div>
                  <div style={{ color: GREEN, fontSize: 18, fontWeight: 700 }}>{totals.totalDiverted.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: DIM, fontSize: 11 }}>Sent to Landfill</div>
                  <div style={{ color: RED, fontSize: 18, fontWeight: 700 }}>{totals.totalLandfill.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: DIM, fontSize: 11 }}>Diversion Rate</div>
                  <div style={{ color: totals.diversionRate >= 75 ? GREEN : totals.diversionRate >= 50 ? AMBER : RED, fontSize: 18, fontWeight: 700 }}>
                    {Math.round(totals.diversionRate)}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Suspense Wrapper ────────────────────────────────────────────── */

export default function WasteTrackingPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0A1222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8BAAC8' }}>Loading...</div>}>
      <WasteTrackingPage />
    </Suspense>
  );
}
