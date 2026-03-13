'use client';
/**
 * Saguaro Field — Contract Management
 * Full contract lifecycle: create, track financials, compliance, status workflow.
 * Offline queue support via enqueue(). PDF export via window.print().
 */
import React, { useState, useEffect, useMemo, Suspense } from 'react';
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

/* ── Types ─────────────────────────────────────────────── */

type ContractType = 'prime' | 'subcontract' | 'purchase_order' | 'service_agreement';
type ContractStatus = 'draft' | 'pending' | 'executed' | 'complete' | 'terminated' | 'void';
type View = 'list' | 'detail' | 'create';
type SortKey = 'amount' | 'date' | 'status';
type TypeTab = 'all' | ContractType;

interface Contract {
  id: string;
  contract_number: string;
  title: string;
  contract_type: ContractType;
  vendor_name: string;
  vendor_email: string;
  description: string;
  original_amount: number;
  approved_changes: number;
  revised_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  retainage_pct: number;
  start_date: string;
  end_date: string;
  signed_date: string;
  status: ContractStatus;
  scope_of_work: string;
  insurance_required: boolean;
  insurance_verified: boolean;
  bonding_required: boolean;
  bonding_verified: boolean;
  notes: string;
  created_at?: string;
}

/* ── Constants ─────────────────────────────────────────── */

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: DIM, pending: AMBER, executed: GREEN, complete: BLUE, terminated: RED, void: '#6B7280',
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft', pending: 'Pending', executed: 'Executed', complete: 'Complete', terminated: 'Terminated', void: 'Void',
};

const TYPE_LABELS: Record<ContractType, string> = {
  prime: 'Prime', subcontract: 'Subcontract', purchase_order: 'Purchase Order', service_agreement: 'Service Agreement',
};

const TYPE_SHORT: Record<ContractType, string> = {
  prime: 'Prime', subcontract: 'Sub', purchase_order: 'PO', service_agreement: 'Service',
};

const WORKFLOW_ORDER: ContractStatus[] = ['draft', 'pending', 'executed', 'complete'];

/* ── Helpers ───────────────────────────────────────────── */

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

function formatUSDShort(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return formatUSD(val);
}

function formatDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

/* ── Shared Styles ─────────────────────────────────────── */

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 12 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#0A1628', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as const, WebkitAppearance: 'none' as const };
const labelStyle: React.CSSProperties = { display: 'block', color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
const btnPrimary: React.CSSProperties = { background: GOLD, color: '#000', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%' };
const btnSecondary: React.CSSProperties = { background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 };
const badge = (bg: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${bg}22`, color: bg });
const rowFlex: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

/* ── Inner Component ───────────────────────────────────── */

function ContractsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Contract | null>(null);
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Filters & Sort */
  const [typeTab, setTypeTab] = useState<TypeTab>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  /* Create Form State */
  const [fContractNumber, setFContractNumber] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fType, setFType] = useState<ContractType>('subcontract');
  const [fVendorName, setFVendorName] = useState('');
  const [fVendorEmail, setFVendorEmail] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fOriginalAmount, setFOriginalAmount] = useState('');
  const [fRetainagePct, setFRetainagePct] = useState('10');
  const [fStartDate, setFStartDate] = useState('');
  const [fEndDate, setFEndDate] = useState('');
  const [fScopeOfWork, setFScopeOfWork] = useState('');
  const [fInsuranceReq, setFInsuranceReq] = useState(false);
  const [fBondingReq, setFBondingReq] = useState(false);
  const [fNotes, setFNotes] = useState('');

  /* ── Data Fetch ──────────────────────────────────────── */

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/contracts`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: Contract[]) => { setContracts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  /* ── Filtering & Sorting ─────────────────────────────── */

  const vendors = useMemo(() => {
    const set = new Set(contracts.map(c => c.vendor_name).filter(Boolean));
    return Array.from(set).sort();
  }, [contracts]);

  const filtered = useMemo(() => {
    let list = [...contracts];
    if (typeTab !== 'all') list = list.filter(c => c.contract_type === typeTab);
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (vendorFilter) list = list.filter(c => c.vendor_name === vendorFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c => c.title.toLowerCase().includes(q) || c.contract_number.toLowerCase().includes(q) || c.vendor_name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'amount') cmp = a.revised_amount - b.revised_amount;
      else if (sortKey === 'date') cmp = new Date(a.start_date || '').getTime() - new Date(b.start_date || '').getTime();
      else if (sortKey === 'status') cmp = WORKFLOW_ORDER.indexOf(a.status as ContractStatus) - WORKFLOW_ORDER.indexOf(b.status as ContractStatus);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [contracts, typeTab, statusFilter, vendorFilter, searchTerm, sortKey, sortAsc]);

  /* ── Summary Dashboard ───────────────────────────────── */

  const summary = useMemo(() => {
    const active = contracts.filter(c => c.status !== 'void' && c.status !== 'terminated');
    const totalCommitted = active.reduce((s, c) => s + c.revised_amount, 0);
    const totalInvoiced = active.reduce((s, c) => s + c.invoiced_amount, 0);
    const totalPaid = active.reduce((s, c) => s + c.paid_amount, 0);
    const retainageHeld = active.reduce((s, c) => s + (c.invoiced_amount * c.retainage_pct / 100), 0);
    return { totalCommitted, totalInvoiced, totalPaid, retainageHeld, count: active.length };
  }, [contracts]);

  /* ── Actions ─────────────────────────────────────────── */

  function resetForm() {
    setFContractNumber(''); setFTitle(''); setFType('subcontract'); setFVendorName('');
    setFVendorEmail(''); setFDescription(''); setFOriginalAmount(''); setFRetainagePct('10');
    setFStartDate(''); setFEndDate(''); setFScopeOfWork(''); setFInsuranceReq(false);
    setFBondingReq(false); setFNotes('');
  }

  async function handleCreate() {
    if (!fTitle.trim() || !fContractNumber.trim() || !fVendorName.trim()) return;
    setSaving(true);
    const amount = parseFloat(fOriginalAmount) || 0;
    const body = {
      contract_number: fContractNumber.trim(),
      title: fTitle.trim(),
      contract_type: fType,
      vendor_name: fVendorName.trim(),
      vendor_email: fVendorEmail.trim(),
      description: fDescription.trim(),
      original_amount: amount,
      approved_changes: 0,
      retainage_pct: parseFloat(fRetainagePct) || 0,
      start_date: fStartDate || null,
      end_date: fEndDate || null,
      scope_of_work: fScopeOfWork.trim(),
      insurance_required: fInsuranceReq,
      insurance_verified: false,
      bonding_required: fBondingReq,
      bonding_verified: false,
      notes: fNotes.trim(),
      status: 'draft',
    };

    if (online) {
      try {
        const res = await fetch(`/api/projects/${projectId}/contracts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
          const created = await res.json();
          setContracts(prev => [created, ...prev]);
          resetForm();
          setView('list');
        }
      } catch { /* fall through to offline */ }
    }

    if (!online) {
      await enqueue({ url: `/api/projects/${projectId}/contracts`, method: 'POST', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
      const optimistic: Contract = {
        id: `local-${Date.now()}`, ...body,
        revised_amount: amount, invoiced_amount: 0, paid_amount: 0,
        signed_date: '', start_date: body.start_date || '', end_date: body.end_date || '',
        retainage_pct: body.retainage_pct, status: 'draft',
      } as Contract;
      setContracts(prev => [optimistic, ...prev]);
      resetForm();
      setView('list');
    }
    setSaving(false);
  }

  async function handleStatusAdvance(contract: Contract) {
    const idx = WORKFLOW_ORDER.indexOf(contract.status);
    if (idx < 0 || idx >= WORKFLOW_ORDER.length - 1) return;
    const nextStatus = WORKFLOW_ORDER[idx + 1];
    const patch = { status: nextStatus, ...(nextStatus === 'executed' ? { signed_date: new Date().toISOString().split('T')[0] } : {}) };

    if (online) {
      try {
        const res = await fetch(`/api/projects/${projectId}/contracts/${contract.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
        if (res.ok) {
          const updated = await res.json();
          setContracts(prev => prev.map(c => c.id === contract.id ? updated : c));
          setSelected(updated);
          return;
        }
      } catch { /* offline fallback */ }
    }

    await enqueue({ url: `/api/projects/${projectId}/contracts/${contract.id}`, method: 'PATCH', body: JSON.stringify(patch), contentType: 'application/json', isFormData: false });
    const updated = { ...contract, ...patch } as Contract;
    setContracts(prev => prev.map(c => c.id === contract.id ? updated : c));
    setSelected(updated);
  }

  async function handleComplianceToggle(contract: Contract, field: 'insurance_verified' | 'bonding_verified') {
    const patch = { [field]: !contract[field] };

    if (online) {
      try {
        const res = await fetch(`/api/projects/${projectId}/contracts/${contract.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
        if (res.ok) {
          const updated = await res.json();
          setContracts(prev => prev.map(c => c.id === contract.id ? updated : c));
          setSelected(updated);
          return;
        }
      } catch { /* offline */ }
    }

    await enqueue({ url: `/api/projects/${projectId}/contracts/${contract.id}`, method: 'PATCH', body: JSON.stringify(patch), contentType: 'application/json', isFormData: false });
    const updated = { ...contract, ...patch } as Contract;
    setContracts(prev => prev.map(c => c.id === contract.id ? updated : c));
    setSelected(updated);
  }

  function handlePrint() {
    window.print();
  }

  /* ── Render: Summary Dashboard ───────────────────────── */

  function renderDashboard() {
    const cards = [
      { label: 'Total Committed', value: summary.totalCommitted, color: GOLD },
      { label: 'Total Invoiced', value: summary.totalInvoiced, color: BLUE },
      { label: 'Total Paid', value: summary.totalPaid, color: GREEN },
      { label: 'Retainage Held', value: summary.retainageHeld, color: AMBER },
    ];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {cards.map(c => (
          <div key={c.label} style={{ ...card, padding: 14, textAlign: 'center' }}>
            <div style={{ color: DIM, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 18, fontWeight: 800 }}>{formatUSDShort(c.value)}</div>
          </div>
        ))}
      </div>
    );
  }

  /* ── Render: Type Tabs ───────────────────────────────── */

  function renderTypeTabs() {
    const tabs: { key: TypeTab; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'prime', label: 'Prime' },
      { key: 'subcontract', label: 'Sub' },
      { key: 'purchase_order', label: 'PO' },
      { key: 'service_agreement', label: 'Service' },
    ];
    return (
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {tabs.map(t => {
          const active = typeTab === t.key;
          const count = t.key === 'all' ? contracts.length : contracts.filter(c => c.contract_type === t.key).length;
          return (
            <button key={t.key} onClick={() => setTypeTab(t.key)} style={{
              padding: '8px 16px', borderRadius: 20, border: active ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
              background: active ? `${GOLD}22` : 'transparent', color: active ? GOLD : DIM,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {t.label} ({count})
            </button>
          );
        })}
      </div>
    );
  }

  /* ── Render: Filters & Sort ──────────────────────────── */

  function renderFilters() {
    return (
      <div style={{ marginBottom: 12 }}>
        <input
          type="text" placeholder="Search contracts..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} style={selectStyle}>
            <option value="">All Vendors</option>
            {vendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={sortKey} onChange={e => { setSortKey(e.target.value as SortKey); setSortAsc(false); }} style={selectStyle}>
            <option value="date">Sort: Date</option>
            <option value="amount">Sort: Amount</option>
            <option value="status">Sort: Status</option>
          </select>
        </div>
        <button onClick={() => setSortAsc(!sortAsc)} style={{
          background: 'none', border: 'none', color: DIM, fontSize: 12, cursor: 'pointer',
          marginTop: 4, padding: 0,
        }}>
          {sortAsc ? '\u25B2 Ascending' : '\u25BC Descending'}
        </button>
      </div>
    );
  }

  /* ── Render: Financial Progress Bar ──────────────────── */

  function renderProgressBar(invoiced: number, revised: number) {
    const pct = revised > 0 ? Math.min(invoiced / revised, 1) : 0;
    const color = pct > 0.9 ? RED : pct > 0.7 ? AMBER : GREEN;
    return (
      <div style={{ width: '100%', height: 8, background: `${BORDER}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    );
  }

  /* ── Render: Contract List ───────────────────────────── */

  function renderList() {
    return (
      <div style={{ minHeight: '100vh', background: '#0A1628', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ padding: '16px 16px 120px' }}>
          {/* Header */}
          <div style={{ ...rowFlex, marginBottom: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Contracts</h1>
              <div style={{ color: DIM, fontSize: 13, marginTop: 2 }}>{summary.count} active contract{summary.count !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!online && <span style={{ ...badge(RED), fontSize: 10 }}>Offline</span>}
              <button onClick={() => { resetForm(); setView('create'); }} style={{
                background: GOLD, color: '#000', border: 'none', borderRadius: 20,
                width: 40, height: 40, fontSize: 24, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>+</button>
            </div>
          </div>

          {/* Dashboard */}
          {renderDashboard()}

          {/* Type Tabs */}
          {renderTypeTabs()}

          {/* Filters */}
          {renderFilters()}

          {/* List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading contracts...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: DIM }}>No contracts found</div>
          ) : (
            filtered.map(c => {
              const pct = c.revised_amount > 0 ? c.invoiced_amount / c.revised_amount : 0;
              return (
                <div key={c.id} onClick={() => { setSelected(c); setView('detail'); }} style={{ ...card, cursor: 'pointer' }}>
                  <div style={rowFlex}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ ...badge(STATUS_COLORS[c.status]), }}>{STATUS_LABELS[c.status]}</span>
                        <span style={{ ...badge(BLUE) }}>{TYPE_SHORT[c.contract_type]}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.contract_number} &mdash; {c.title}
                      </div>
                      <div style={{ color: DIM, fontSize: 13 }}>{c.vendor_name}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: GOLD }}>{formatUSDShort(c.revised_amount)}</div>
                      <div style={{ color: DIM, fontSize: 11 }}>{formatPct(pct)} invoiced</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>{renderProgressBar(c.invoiced_amount, c.revised_amount)}</div>
                  {/* Compliance flags */}
                  {(c.insurance_required || c.bonding_required) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      {c.insurance_required && (
                        <span style={{ fontSize: 11, color: c.insurance_verified ? GREEN : RED, fontWeight: 600 }}>
                          {c.insurance_verified ? '\u2713' : '\u2717'} Insurance
                        </span>
                      )}
                      {c.bonding_required && (
                        <span style={{ fontSize: 11, color: c.bonding_verified ? GREEN : RED, fontWeight: 600 }}>
                          {c.bonding_verified ? '\u2713' : '\u2717'} Bonding
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  /* ── Render: Contract Detail ─────────────────────────── */

  function renderDetail() {
    if (!selected) return null;
    const c = selected;
    const balance = c.revised_amount - c.invoiced_amount;
    const retainageHeld = c.invoiced_amount * c.retainage_pct / 100;
    const pctInvoiced = c.revised_amount > 0 ? c.invoiced_amount / c.revised_amount : 0;
    const canAdvance = WORKFLOW_ORDER.indexOf(c.status) >= 0 && WORKFLOW_ORDER.indexOf(c.status) < WORKFLOW_ORDER.length - 1;
    const nextStatus = canAdvance ? STATUS_LABELS[WORKFLOW_ORDER[WORKFLOW_ORDER.indexOf(c.status) + 1]] : null;

    return (
      <div style={{ minHeight: '100vh', background: '#0A1628', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ padding: '16px 16px 120px' }}>
          {/* Back */}
          <button onClick={() => setView('list')} style={backBtn}>&larr; Back to Contracts</button>

          {/* Header */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={badge(STATUS_COLORS[c.status])}>{STATUS_LABELS[c.status]}</span>
              <span style={badge(BLUE)}>{TYPE_LABELS[c.contract_type]}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>{c.contract_number}</h2>
            <div style={{ fontSize: 16, color: TEXT, marginTop: 4 }}>{c.title}</div>
            <div style={{ color: DIM, fontSize: 13, marginTop: 4 }}>{c.vendor_name} {c.vendor_email ? `\u2022 ${c.vendor_email}` : ''}</div>
            {c.description && <div style={{ color: DIM, fontSize: 13, marginTop: 6 }}>{c.description}</div>}
          </div>

          {/* Financial Summary */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Financial Summary</div>
            {[
              { label: 'Original Amount', value: c.original_amount, color: TEXT },
              { label: 'Approved Changes', value: c.approved_changes, color: c.approved_changes >= 0 ? GREEN : RED },
              { label: 'Revised Amount', value: c.revised_amount, color: GOLD },
              { label: 'Invoiced Amount', value: c.invoiced_amount, color: BLUE },
              { label: 'Paid Amount', value: c.paid_amount, color: GREEN },
              { label: 'Balance Remaining', value: balance, color: balance >= 0 ? TEXT : RED },
              { label: `Retainage Held (${c.retainage_pct}%)`, value: retainageHeld, color: AMBER },
            ].map(row => (
              <div key={row.label} style={{ ...rowFlex, padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ color: DIM, fontSize: 13 }}>{row.label}</span>
                <span style={{ color: row.color, fontWeight: 700, fontSize: 14 }}>{formatUSD(row.value)}</span>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <div style={{ ...rowFlex, marginBottom: 4 }}>
                <span style={{ color: DIM, fontSize: 12 }}>Invoiced Progress</span>
                <span style={{ color: DIM, fontSize: 12 }}>{formatPct(pctInvoiced)}</span>
              </div>
              {renderProgressBar(c.invoiced_amount, c.revised_amount)}
            </div>
          </div>

          {/* Dates */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Dates</div>
            <div style={gridTwo}>
              <div>
                <div style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>Start Date</div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatDate(c.start_date)}</div>
              </div>
              <div>
                <div style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>End Date</div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatDate(c.end_date)}</div>
              </div>
              <div>
                <div style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>Signed Date</div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatDate(c.signed_date)}</div>
              </div>
            </div>
          </div>

          {/* Compliance Checklist */}
          {(c.insurance_required || c.bonding_required) && (
            <div style={{ ...card }}>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Compliance Checklist</div>
              {c.insurance_required && (
                <div style={{ ...rowFlex, padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                  <div>
                    <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>Insurance Verification</div>
                    <div style={{ color: DIM, fontSize: 12 }}>Certificate of insurance on file</div>
                  </div>
                  <button
                    onClick={() => handleComplianceToggle(c, 'insurance_verified')}
                    style={{
                      width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: c.insurance_verified ? GREEN : '#374151',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 11, background: '#fff',
                      position: 'absolute', top: 3,
                      left: c.insurance_verified ? 23 : 3, transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              )}
              {c.bonding_required && (
                <div style={{ ...rowFlex, padding: '10px 0' }}>
                  <div>
                    <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>Bonding Verification</div>
                    <div style={{ color: DIM, fontSize: 12 }}>Performance and payment bond on file</div>
                  </div>
                  <button
                    onClick={() => handleComplianceToggle(c, 'bonding_verified')}
                    style={{
                      width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: c.bonding_verified ? GREEN : '#374151',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 11, background: '#fff',
                      position: 'absolute', top: 3,
                      left: c.bonding_verified ? 23 : 3, transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Scope of Work */}
          {c.scope_of_work && (
            <div style={{ ...card }}>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Scope of Work</div>
              <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.scope_of_work}</div>
            </div>
          )}

          {/* Notes */}
          {c.notes && (
            <div style={{ ...card }}>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</div>
              <div style={{ color: DIM, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.notes}</div>
            </div>
          )}

          {/* Status Workflow */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status Workflow</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
              {WORKFLOW_ORDER.map((s, i) => {
                const reached = WORKFLOW_ORDER.indexOf(c.status) >= i;
                return (
                  <React.Fragment key={s}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 16,
                      background: reached ? STATUS_COLORS[s] : `${BORDER}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: reached ? '#000' : DIM, flexShrink: 0,
                    }}>
                      {reached ? '\u2713' : i + 1}
                    </div>
                    {i < WORKFLOW_ORDER.length - 1 && (
                      <div style={{ flex: 1, height: 3, background: reached ? STATUS_COLORS[s] : BORDER }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              {WORKFLOW_ORDER.map(s => (
                <div key={s} style={{ fontSize: 10, color: DIM, textAlign: 'center', width: 60 }}>{STATUS_LABELS[s]}</div>
              ))}
            </div>
            {canAdvance && (
              <button onClick={() => handleStatusAdvance(c)} style={{ ...btnPrimary, background: STATUS_COLORS[WORKFLOW_ORDER[WORKFLOW_ORDER.indexOf(c.status) + 1]] }}>
                Advance to {nextStatus}
              </button>
            )}
            {(c.status !== 'void' && c.status !== 'terminated') && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={async () => {
                  const patch = { status: 'terminated' as ContractStatus };
                  if (online) {
                    try {
                      const res = await fetch(`/api/projects/${projectId}/contracts/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
                      if (res.ok) { const updated = await res.json(); setContracts(prev => prev.map(x => x.id === c.id ? updated : x)); setSelected(updated); return; }
                    } catch { /* offline */ }
                  }
                  await enqueue({ url: `/api/projects/${projectId}/contracts/${c.id}`, method: 'PATCH', body: JSON.stringify(patch), contentType: 'application/json', isFormData: false });
                  const updated = { ...c, ...patch }; setContracts(prev => prev.map(x => x.id === c.id ? updated : x)); setSelected(updated);
                }} style={{ ...btnSecondary, color: RED, borderColor: RED, flex: 1 }}>
                  Terminate
                </button>
                <button onClick={async () => {
                  const patch = { status: 'void' as ContractStatus };
                  if (online) {
                    try {
                      const res = await fetch(`/api/projects/${projectId}/contracts/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
                      if (res.ok) { const updated = await res.json(); setContracts(prev => prev.map(x => x.id === c.id ? updated : x)); setSelected(updated); return; }
                    } catch { /* offline */ }
                  }
                  await enqueue({ url: `/api/projects/${projectId}/contracts/${c.id}`, method: 'PATCH', body: JSON.stringify(patch), contentType: 'application/json', isFormData: false });
                  const updated = { ...c, ...patch }; setContracts(prev => prev.map(x => x.id === c.id ? updated : x)); setSelected(updated);
                }} style={{ ...btnSecondary, color: DIM, borderColor: DIM, flex: 1 }}>
                  Void
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handlePrint} style={{ ...btnSecondary, flex: 1 }}>
              Export PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: Create Form ─────────────────────────────── */

  function renderCreate() {
    return (
      <div style={{ minHeight: '100vh', background: '#0A1628', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ padding: '16px 16px 120px' }}>
          <button onClick={() => setView('list')} style={backBtn}>&larr; Cancel</button>
          <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: TEXT }}>New Contract</h2>

          {/* Contract Info */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contract Information</div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Contract Number *</label>
              <input value={fContractNumber} onChange={e => setFContractNumber(e.target.value)} placeholder="e.g., SC-001" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Title *</label>
              <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Contract title" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Type</label>
              <select value={fType} onChange={e => setFType(e.target.value as ContractType)} style={selectStyle}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Description</label>
              <textarea value={fDescription} onChange={e => setFDescription(e.target.value)} placeholder="Brief description" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          {/* Vendor */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendor Details</div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Vendor Name *</label>
              <input value={fVendorName} onChange={e => setFVendorName(e.target.value)} placeholder="Company name" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Vendor Email</label>
              <input value={fVendorEmail} onChange={e => setFVendorEmail(e.target.value)} placeholder="vendor@example.com" type="email" style={inputStyle} />
            </div>
          </div>

          {/* Financial */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Financial Details</div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Original Amount ($)</label>
              <input value={fOriginalAmount} onChange={e => setFOriginalAmount(e.target.value)} placeholder="0.00" type="number" step="0.01" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Retainage %</label>
              <input value={fRetainagePct} onChange={e => setFRetainagePct(e.target.value)} placeholder="10" type="number" step="0.5" min="0" max="100" style={inputStyle} />
            </div>
          </div>

          {/* Schedule */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Schedule</div>
            <div style={gridTwo}>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input value={fStartDate} onChange={e => setFStartDate(e.target.value)} type="date" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End Date</label>
                <input value={fEndDate} onChange={e => setFEndDate(e.target.value)} type="date" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Scope of Work */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Scope of Work</div>
            <textarea value={fScopeOfWork} onChange={e => setFScopeOfWork(e.target.value)} placeholder="Describe the scope of work..." rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Compliance Requirements */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Compliance Requirements</div>

            <div style={{ ...rowFlex, padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
              <div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>Insurance Required</div>
                <div style={{ color: DIM, fontSize: 12 }}>Require certificate of insurance</div>
              </div>
              <button onClick={() => setFInsuranceReq(!fInsuranceReq)} style={{
                width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: fInsuranceReq ? GREEN : '#374151', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: '#fff',
                  position: 'absolute', top: 3, left: fInsuranceReq ? 23 : 3, transition: 'left 0.2s',
                }} />
              </button>
            </div>

            <div style={{ ...rowFlex, padding: '10px 0' }}>
              <div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>Bonding Required</div>
                <div style={{ color: DIM, fontSize: 12 }}>Require performance/payment bond</div>
              </div>
              <button onClick={() => setFBondingReq(!fBondingReq)} style={{
                width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: fBondingReq ? GREEN : '#374151', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: '#fff',
                  position: 'absolute', top: 3, left: fBondingReq ? 23 : 3, transition: 'left 0.2s',
                }} />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div style={{ ...card }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</div>
            <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Additional notes..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={saving || !fTitle.trim() || !fContractNumber.trim() || !fVendorName.trim()}
            style={{
              ...btnPrimary,
              opacity: (saving || !fTitle.trim() || !fContractNumber.trim() || !fVendorName.trim()) ? 0.5 : 1,
              cursor: (saving || !fTitle.trim() || !fContractNumber.trim() || !fVendorName.trim()) ? 'not-allowed' : 'pointer',
              marginTop: 8,
            }}
          >
            {saving ? 'Creating...' : online ? 'Create Contract' : 'Create Contract (Offline)'}
          </button>
        </div>
      </div>
    );
  }

  /* ── Main Render ─────────────────────────────────────── */

  if (view === 'create') return renderCreate();
  if (view === 'detail') return renderDetail();
  return renderList();
}

/* ── Default Export with Suspense ───────────────────────── */

export default function ContractsPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0A1628', color: '#8BAAC8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>Loading...</div>}>
      <ContractsPage />
    </Suspense>
  );
}
