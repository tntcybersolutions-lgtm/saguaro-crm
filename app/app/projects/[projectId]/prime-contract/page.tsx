'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#C8960F', DARK = '#0d1117', RAISED = '#161b22', BORDER = '#30363d';
const DIM = '#8B9DB8', TEXT = '#F0F4FF', GREEN = '#2ea043', RED = '#f85149', AMBER = '#e3b341';
const BLUE = '#3B82F6';

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('en-US');
const pct = (n: number) => `${Math.round(n || 0)}%`;

interface PrimeContract {
  id: string;
  contract_number: string | null;
  contract_type: string;
  owner_name: string;
  owner_company: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  owner_rep_name: string | null;
  original_contract_value: number;
  approved_change_orders: number;
  current_contract_value: number;
  retainage_pct: number;
  retainage_released: number;
  total_billed: number;
  total_paid: number;
  total_retainage_held: number;
  net_due: number;
  status: string;
  notice_to_proceed_date: string | null;
  substantial_completion_date: string | null;
  contract_date: string | null;
  billing_period: string;
  payment_terms_days: number;
  gc_company_name: string | null;
  gc_address: string | null;
  owner_address: string | null;
  owner_city: string | null;
  owner_state: string | null;
  owner_zip: string | null;
}

interface SovLine {
  id: string;
  item_number: number;
  description: string;
  csi_division: string | null;
  scheduled_value: number;
  billed_to_date: number;
  pct_complete: number;
  balance_to_finish: number;
  retainage_held: number;
}

interface OwnerPayApp {
  id: string;
  application_number: number;
  period_from: string;
  period_to: string;
  current_payment_due: number;
  total_retainage: number;
  status: string;
  certified_amount: number | null;
  paid_amount: number | null;
  paid_date: string | null;
  completed_stored_to_date: number;
}

interface Summary {
  contract_value: number;
  total_billed: number;
  total_paid: number;
  total_retainage_held: number;
  balance_remaining: number;
  pct_billed: number;
  pct_paid: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: DIM, submitted: AMBER, under_review: AMBER,
  certified: BLUE, paid: GREEN, disputed: RED, voided: '#555',
};

const CONTRACT_TYPES: Record<string, string> = {
  lump_sum: 'Lump Sum', cost_plus: 'Cost Plus', gmp: 'GMP',
  unit_price: 'Unit Price', time_and_materials: 'T&M',
};

export default function PrimeContractPage() {
  const { projectId } = useParams() as { projectId: string };
  const [contract, setContract] = useState<PrimeContract | null>(null);
  const [sov, setSov] = useState<SovLine[]>([]);
  const [payApps, setPayApps] = useState<OwnerPayApp[]>([]);
  const [summary, setSummary] = useState<Summary>({
    contract_value: 0, total_billed: 0, total_paid: 0,
    total_retainage_held: 0, balance_remaining: 0, pct_billed: 0, pct_paid: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sov' | 'pay_apps'>('overview');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingPayApp, setCreatingPayApp] = useState(false);
  const [showPayAppModal, setShowPayAppModal] = useState(false);
  const [payAppPeriod, setPayAppPeriod] = useState({ from: '', to: '' });

  // Setup form
  const [form, setForm] = useState({
    owner_name: '', owner_company: '', owner_email: '', owner_phone: '',
    original_contract_value: '', retainage_pct: '10', contract_type: 'lump_sum',
    notice_to_proceed_date: '', substantial_completion_date: '',
    seed_from_budget: true, gc_company_name: '', contract_number: '',
  });

  const fetchContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/prime-contract/${projectId}`);
      const data = await res.json();
      setContract(data.contract);
      setSov(data.sov || []);
      setPayApps(data.pay_apps || []);
      setSummary(data.summary);
      if (!data.contract) setShowSetupModal(true);
    } catch { /* handled by empty state */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchContract(); }, [fetchContract]);

  const handleCreateContract = async () => {
    if (!form.owner_name || !form.original_contract_value) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/prime-contract/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          original_contract_value: Number(form.original_contract_value),
          retainage_pct: Number(form.retainage_pct),
        }),
      });
      if (res.ok) {
        setShowSetupModal(false);
        await fetchContract();
      }
    } finally { setSaving(false); }
  };

  const handleCreatePayApp = async () => {
    if (!payAppPeriod.from || !payAppPeriod.to) return;
    setCreatingPayApp(true);
    try {
      const res = await fetch(`/api/prime-contract/${projectId}/pay-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_from: payAppPeriod.from, period_to: payAppPeriod.to }),
      });
      if (res.ok) {
        setShowPayAppModal(false);
        setPayAppPeriod({ from: '', to: '' });
        await fetchContract();
        setActiveTab('pay_apps');
      }
    } finally { setCreatingPayApp(false); }
  };

  const handleMarkPaid = async (appId: string, amount: number) => {
    const res = await fetch(`/api/prime-contract/${projectId}/pay-app/${appId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_paid', paid_amount: amount }),
    });
    if (res.ok) await fetchContract();
  };

  const handleSeedSOV = async () => {
    if (!contract) return;
    setSaving(true);
    try {
      await fetch(`/api/prime-contract/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contract, seed_from_budget: true,
          original_contract_value: contract.original_contract_value,
        }),
      });
      await fetchContract();
    } finally { setSaving(false); }
  };

  const handleViewPDF = (appId: string) => {
    window.open(`/api/prime-contract/${projectId}/pay-app/${appId}/generate-pdf`, '_blank');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`,
    borderRadius: 6, color: TEXT, fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = { color: DIM, fontSize: 12, marginBottom: 4, display: 'block' };

  if (loading) {
    return (
      <div style={{ padding: 32, color: TEXT, textAlign: 'center' }}>
        <div style={{ color: GOLD, fontSize: 18 }}>Loading prime contract...</div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // KPI CARDS
  // ═══════════════════════════════════════════════════════
  const kpiCards = [
    { label: 'Contract Value', value: fmt(summary.contract_value), color: TEXT },
    { label: 'Total Billed', value: fmt(summary.total_billed), color: GOLD },
    { label: '% Billed', value: pct(summary.pct_billed), color: BLUE },
    { label: 'Total Paid', value: fmt(summary.total_paid), color: GREEN },
    { label: 'Retainage Held', value: fmt(summary.total_retainage_held), color: AMBER },
  ];

  const cv = summary.contract_value || 1;
  const paidPct = (summary.total_paid / cv) * 100;
  const billedNotPaidPct = ((summary.total_billed - summary.total_paid) / cv) * 100;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: TEXT, fontSize: 24, margin: 0 }}>Prime Contract</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {contract && (
            <button onClick={() => setShowPayAppModal(true)}
              style={{ padding: '8px 16px', background: GOLD, color: '#000', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              + Create Pay App
            </button>
          )}
          {!contract && (
            <button onClick={() => setShowSetupModal(true)}
              style={{ padding: '8px 16px', background: GOLD, color: '#000', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              + Set Up Prime Contract
            </button>
          )}
        </div>
      </div>

      {/* NO CONTRACT STATE */}
      {!contract && !showSetupModal && (
        <div style={{ textAlign: 'center', padding: 64, color: DIM }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 18, marginBottom: 8, color: TEXT }}>No Prime Contract Set Up</div>
          <div style={{ marginBottom: 24 }}>Create the GC-to-Owner contract to start billing.</div>
          <button onClick={() => setShowSetupModal(true)}
            style={{ padding: '12px 24px', background: GOLD, color: '#000', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Set Up Prime Contract
          </button>
        </div>
      )}

      {/* ACTIVE CONTRACT */}
      {contract && (
        <>
          {/* KPI CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            {kpiCards.map((k) => (
              <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ color: DIM, fontSize: 11, marginBottom: 6, textTransform: 'uppercase' }}>{k.label}</div>
                <div style={{ color: k.color, fontSize: 22, fontWeight: 700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* BILLING PROGRESS BAR */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ color: DIM, fontSize: 11, marginBottom: 6, textTransform: 'uppercase' }}>Billing Progress</div>
            <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', background: '#1c2128' }}>
              <div style={{ width: `${Math.min(paidPct, 100)}%`, background: BLUE, transition: 'width 0.6s' }} />
              <div style={{ width: `${Math.max(billedNotPaidPct, 0)}%`, background: GOLD, transition: 'width 0.6s' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: DIM }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: BLUE, marginRight: 4 }} />Paid</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: GOLD, marginRight: 4 }} />Billed (Unpaid)</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#1c2128', marginRight: 4 }} />Remaining</span>
            </div>
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
            {(['overview', 'sov', 'pay_apps'] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
                  color: activeTab === t ? GOLD : DIM, fontWeight: activeTab === t ? 700 : 400,
                  fontSize: 14, borderBottom: activeTab === t ? `2px solid ${GOLD}` : '2px solid transparent' }}>
                {t === 'overview' ? 'Overview' : t === 'sov' ? 'Schedule of Values' : 'Pay Applications'}
              </button>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 20 }}>
                <h3 style={{ color: GOLD, margin: '0 0 16px', fontSize: 14 }}>Contract Details</h3>
                <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                  <div><span style={{ color: DIM }}>Type:</span> <span style={{ color: TEXT }}>{CONTRACT_TYPES[contract.contract_type] || contract.contract_type}</span></div>
                  <div><span style={{ color: DIM }}>Contract #:</span> <span style={{ color: TEXT }}>{contract.contract_number || 'N/A'}</span></div>
                  <div><span style={{ color: DIM }}>Contract Date:</span> <span style={{ color: TEXT }}>{contract.contract_date || 'N/A'}</span></div>
                  <div><span style={{ color: DIM }}>NTP Date:</span> <span style={{ color: TEXT }}>{contract.notice_to_proceed_date || 'N/A'}</span></div>
                  <div><span style={{ color: DIM }}>Substantial Completion:</span> <span style={{ color: TEXT }}>{contract.substantial_completion_date || 'N/A'}</span></div>
                  <div><span style={{ color: DIM }}>Original Value:</span> <span style={{ color: TEXT }}>{fmt(contract.original_contract_value)}</span></div>
                  <div><span style={{ color: DIM }}>Approved COs:</span> <span style={{ color: contract.approved_change_orders > 0 ? AMBER : TEXT }}>{fmt(contract.approved_change_orders)}</span></div>
                  <div><span style={{ color: DIM }}>Current Value:</span> <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(contract.current_contract_value)}</span></div>
                  <div><span style={{ color: DIM }}>Retainage:</span> <span style={{ color: TEXT }}>{contract.retainage_pct}%</span></div>
                  <div><span style={{ color: DIM }}>Payment Terms:</span> <span style={{ color: TEXT }}>Net {contract.payment_terms_days}</span></div>
                  <div><span style={{ color: DIM }}>Billing Period:</span> <span style={{ color: TEXT }}>{contract.billing_period}</span></div>
                  <div><span style={{ color: DIM }}>Status:</span> <span style={{ color: GREEN, fontWeight: 600, textTransform: 'uppercase' }}>{contract.status}</span></div>
                </div>
              </div>
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 20 }}>
                <h3 style={{ color: GOLD, margin: '0 0 16px', fontSize: 14 }}>Owner Information</h3>
                <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                  <div><span style={{ color: DIM }}>Name:</span> <span style={{ color: TEXT }}>{contract.owner_name}</span></div>
                  {contract.owner_company && <div><span style={{ color: DIM }}>Company:</span> <span style={{ color: TEXT }}>{contract.owner_company}</span></div>}
                  {contract.owner_rep_name && <div><span style={{ color: DIM }}>Owner Rep:</span> <span style={{ color: TEXT }}>{contract.owner_rep_name}</span></div>}
                  {contract.owner_email && (
                    <div><span style={{ color: DIM }}>Email:</span> <a href={`mailto:${contract.owner_email}`} style={{ color: BLUE }}>{contract.owner_email}</a></div>
                  )}
                  {contract.owner_phone && (
                    <div><span style={{ color: DIM }}>Phone:</span> <a href={`tel:${contract.owner_phone}`} style={{ color: BLUE }}>{contract.owner_phone}</a></div>
                  )}
                  {contract.owner_address && <div><span style={{ color: DIM }}>Address:</span> <span style={{ color: TEXT }}>{contract.owner_address}</span></div>}
                  {contract.gc_company_name && (
                    <>
                      <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 8, paddingTop: 8 }} />
                      <div><span style={{ color: DIM }}>GC Company:</span> <span style={{ color: TEXT }}>{contract.gc_company_name}</span></div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SOV TAB */}
          {activeTab === 'sov' && (
            <div>
              {sov.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: DIM }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                  <div style={{ marginBottom: 16 }}>No Schedule of Values set up yet.</div>
                  <button onClick={handleSeedSOV} disabled={saving}
                    style={{ padding: '10px 20px', background: GOLD, color: '#000', border: 'none',
                      borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                    {saving ? 'Seeding...' : 'Seed from Budget'}
                  </button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                        {['#', 'Description', 'CSI', 'Scheduled Value', 'Billed to Date', '% Complete', 'Balance', 'Retainage'].map((h) => (
                          <th key={h} style={{ padding: '10px 8px', color: DIM, textAlign: h === '#' || h === 'CSI' ? 'center' : 'right',
                            fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                            {h === 'Description' ? <span style={{ textAlign: 'left', display: 'block' }}>{h}</span> : h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sov.map((line) => (
                        <tr key={line.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '8px', textAlign: 'center', color: DIM }}>{line.item_number}</td>
                          <td style={{ padding: '8px', color: TEXT }}>{line.description}</td>
                          <td style={{ padding: '8px', textAlign: 'center', color: DIM }}>{line.csi_division || '-'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: TEXT }}>{fmt(line.scheduled_value)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: GOLD }}>{fmt(line.billed_to_date)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: line.pct_complete >= 100 ? GREEN : TEXT }}>{pct(line.pct_complete)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: TEXT }}>{fmt(line.balance_to_finish)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: AMBER }}>{fmt(line.retainage_held)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: `2px solid ${GOLD}`, fontWeight: 700 }}>
                        <td colSpan={3} style={{ padding: '10px 8px', color: GOLD, textAlign: 'right' }}>TOTALS</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: TEXT }}>{fmt(sov.reduce((s, l) => s + Number(l.scheduled_value), 0))}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: GOLD }}>{fmt(sov.reduce((s, l) => s + Number(l.billed_to_date), 0))}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: TEXT }}>
                          {pct(sov.reduce((s, l) => s + Number(l.scheduled_value), 0) > 0
                            ? (sov.reduce((s, l) => s + Number(l.billed_to_date), 0) / sov.reduce((s, l) => s + Number(l.scheduled_value), 0)) * 100 : 0)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: TEXT }}>{fmt(sov.reduce((s, l) => s + Number(l.balance_to_finish), 0))}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: AMBER }}>{fmt(sov.reduce((s, l) => s + Number(l.retainage_held), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PAY APPS TAB */}
          {activeTab === 'pay_apps' && (
            <div>
              {payApps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: DIM }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                  <div style={{ marginBottom: 16 }}>No pay applications yet.</div>
                  <button onClick={() => setShowPayAppModal(true)}
                    style={{ padding: '10px 20px', background: GOLD, color: '#000', border: 'none',
                      borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                    Create First Pay App
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payApps.map((app) => (
                    <div key={app.id} style={{ background: RAISED, border: `1px solid ${BORDER}`,
                      borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, minWidth: 60 }}>#{app.application_number}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: TEXT, fontSize: 13 }}>{app.period_from} — {app.period_to}</div>
                        <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>
                          Completed: {fmt(app.completed_stored_to_date)} | Retainage: {fmt(app.total_retainage)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 120 }}>
                        <div style={{ color: TEXT, fontSize: 16, fontWeight: 700 }}>{fmt(app.current_payment_due)}</div>
                        <div style={{ fontSize: 11, color: DIM }}>Payment Due</div>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        color: '#fff', background: STATUS_COLORS[app.status] || DIM, textTransform: 'uppercase' }}>
                        {app.status}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleViewPDF(app.id)}
                          style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${BORDER}`,
                            borderRadius: 4, color: BLUE, cursor: 'pointer', fontSize: 12 }}>
                          View PDF
                        </button>
                        {app.status === 'certified' && (
                          <button onClick={() => handleMarkPaid(app.id, Number(app.certified_amount || app.current_payment_due))}
                            style={{ padding: '6px 10px', background: GREEN, border: 'none',
                              borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* SETUP MODAL */}
      {showSetupModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: 28, width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: GOLD, margin: '0 0 20px', fontSize: 18 }}>Set Up Prime Contract</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/3' }}>
                <label style={labelStyle}>Owner Name *</label>
                <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  style={inputStyle} placeholder="Property owner name" />
              </div>
              <div>
                <label style={labelStyle}>Owner Company</label>
                <input value={form.owner_company} onChange={(e) => setForm({ ...form, owner_company: e.target.value })}
                  style={inputStyle} placeholder="Company name" />
              </div>
              <div>
                <label style={labelStyle}>Owner Email</label>
                <input value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                  style={inputStyle} type="email" placeholder="owner@company.com" />
              </div>
              <div>
                <label style={labelStyle}>Owner Phone</label>
                <input value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })}
                  style={inputStyle} type="tel" placeholder="(555) 123-4567" />
              </div>
              <div>
                <label style={labelStyle}>Contract Number</label>
                <input value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })}
                  style={inputStyle} placeholder="e.g. PC-001" />
              </div>
              <div>
                <label style={labelStyle}>Original Contract Value *</label>
                <input value={form.original_contract_value}
                  onChange={(e) => setForm({ ...form, original_contract_value: e.target.value })}
                  style={inputStyle} type="number" placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>Retainage %</label>
                <input value={form.retainage_pct} onChange={(e) => setForm({ ...form, retainage_pct: e.target.value })}
                  style={inputStyle} type="number" placeholder="10" />
              </div>
              <div>
                <label style={labelStyle}>Contract Type</label>
                <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
                  style={inputStyle}>
                  <option value="lump_sum">Lump Sum</option>
                  <option value="cost_plus">Cost Plus</option>
                  <option value="gmp">GMP</option>
                  <option value="unit_price">Unit Price</option>
                  <option value="time_and_materials">T&M</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>NTP Date</label>
                <input value={form.notice_to_proceed_date}
                  onChange={(e) => setForm({ ...form, notice_to_proceed_date: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
              <div>
                <label style={labelStyle}>Substantial Completion</label>
                <input value={form.substantial_completion_date}
                  onChange={(e) => setForm({ ...form, substantial_completion_date: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
              <div>
                <label style={labelStyle}>GC Company Name</label>
                <input value={form.gc_company_name} onChange={(e) => setForm({ ...form, gc_company_name: e.target.value })}
                  style={inputStyle} placeholder="Your company" />
              </div>
              <div style={{ gridColumn: '1/3', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input type="checkbox" checked={form.seed_from_budget}
                  onChange={(e) => setForm({ ...form, seed_from_budget: e.target.checked })}
                  style={{ width: 16, height: 16 }} />
                <div>
                  <div style={{ color: TEXT, fontSize: 13 }}>Seed SOV from Budget</div>
                  <div style={{ color: DIM, fontSize: 11 }}>Creates SOV line items from your existing budget breakdown.</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSetupModal(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: DIM, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreateContract} disabled={saving || !form.owner_name || !form.original_contract_value}
                style={{ padding: '10px 24px', background: GOLD, color: '#000', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creating...' : 'Create Prime Contract'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAY APP MODAL */}
      {showPayAppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: 400 }}>
            <h2 style={{ color: GOLD, margin: '0 0 20px', fontSize: 18 }}>Create Owner Pay Application</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={labelStyle}>Period From</label>
                <input value={payAppPeriod.from} onChange={(e) => setPayAppPeriod({ ...payAppPeriod, from: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
              <div>
                <label style={labelStyle}>Period To</label>
                <input value={payAppPeriod.to} onChange={(e) => setPayAppPeriod({ ...payAppPeriod, to: e.target.value })}
                  style={inputStyle} type="date" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPayAppModal(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: DIM, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreatePayApp} disabled={creatingPayApp || !payAppPeriod.from || !payAppPeriod.to}
                style={{ padding: '10px 24px', background: GOLD, color: '#000', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: creatingPayApp ? 0.6 : 1 }}>
                {creatingPayApp ? 'Creating...' : 'Create Pay App'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
