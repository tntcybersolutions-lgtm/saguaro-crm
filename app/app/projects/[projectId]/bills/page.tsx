'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { toCents, toDollars, sumCents, scaleCents } from '@/lib/calc';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { Receipt, Plus, FilePlus, CurrencyDollar, Wallet } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';

const GOLD='#F59E0B', DARK='#0a0a0a', RAISED='#141416', BORDER='rgba(255,255,255,0.12)', DIM='#CBD5E1', TEXT='#FFFFFF', GREEN='#3dd68c', RED='#ef4444';

interface Bill {
  id: string;
  bill_number: string;
  vendor_name: string;
  description: string;
  amount: number;
  total?: number;
  due_date: string;
  status: string;
  category: string;
  project_id: string;
}

const EMPTY_FORM = { invoice_num: '', vendor: '', description: '', amount: 0, tax: 0, due_date: '', category: '03 - Concrete', cost_code: '' };

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Pending: { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
    Approved: { bg: 'rgba(245,158,11,.2)', color: '#FBBF24' },
    Paid: { bg: 'rgba(61,214,140,.2)', color: GREEN },
    Overdue: { bg: 'rgba(239,68,68,.2)', color: RED },
  };
  const s = map[status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'Paid') return false;
  return new Date(dueDate) < new Date();
}

export default function BillsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `bills:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // SmartCreate: the project-context snapshot — vendors, cost codes, budget rollups.
  const { ctx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ due?: boolean }>({});
  // ListToolbar state — filters + sort persist per module via sag_flt_bills.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('due');

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bills`);
      const json = await res.json();
      setBills(json.bills || []);
    } catch {
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // Dead-space kill (spec 4.1): an empty module opens straight into the
  // composer — the create form IS the zero state. One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && bills.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      openForm(true);
    }
  }, [loading, bills.length]);

  async function handleSave(): Promise<boolean> {
    if (!form.vendor || !form.invoice_num || !form.amount) {
      setErrorMsg('Vendor, invoice number, and amount are required.');
      return false;
    }
    setSaving(true);
    setErrorMsg('');
    // MONEY: coerce before math — form/DB numerics can round-trip as strings.
    const billSubtotal = Number(form.amount) || 0;
    const billTax = Number(form.tax) || 0;
    const billTotal = billSubtotal + billTax;
    try {
      const res = await fetch('/api/bills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          vendor_name: form.vendor,
          bill_number: form.invoice_num,
          description: form.description,
          category: form.category,
          cost_code: form.cost_code || null,
          amount: billTotal,
          tax: billTax,
          total: billTotal,
          due_date: form.due_date || null,
          status: 'Pending',
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      if (!json.bill) throw new Error('save failed');
      setBills(prev => [json.bill as Bill, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Bill added successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not save the bill. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id + '-approve');
    try {
      const res = await fetch(`/api/bills/${id}/approve`, { method: 'PATCH' });
      if (!res.ok) throw new Error('approve failed');
      setBills(prev => prev.map(b => b.id === id ? { ...b, status: 'Approved' } : b));
      setSuccessMsg('Bill approved.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not approve the bill. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePay(id: string) {
    setActionLoading(id + '-pay');
    try {
      const res = await fetch(`/api/bills/${id}/pay`, { method: 'PATCH' });
      if (!res.ok) throw new Error('pay failed');
      setBills(prev => prev.map(b => b.id === id ? { ...b, status: 'Paid' } : b));
      setSuccessMsg('Bill marked as paid.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not mark the bill as paid. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoading(null);
    }
  }

  const fmt = (n: number) => '$' + ((n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

  function openBillMenu(id: string) { setMenuId(id); setEditId(null); setAdjustId(null); setDeleteId(null); }

  async function handleEditBill(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    setBills(prev => prev.map(b => b.id === id ? { ...b, amount } : b));
    setEditId(null);
    try {
      const res = await fetch(`/api/bills/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
      if (!res.ok) throw new Error('update failed');
      setSuccessMsg('Amount updated.'); setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not update the amount. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
      fetchBills();
    }
  }

  async function handleAdjustBill(id: string, pct: number) {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const newAmt = toDollars(scaleCents(toCents(bill.amount), 1 + pct / 100));
    setBills(prev => prev.map(b => b.id === id ? { ...b, amount: newAmt } : b));
    setAdjustId(null);
    try {
      const res = await fetch(`/api/bills/${id}/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmt }) });
      if (!res.ok) throw new Error('update failed');
      setSuccessMsg(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`); setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not adjust the amount. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
      fetchBills();
    }
  }

  function handleCopyBill(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleDeleteBill(id: string) {
    setBills(prev => prev.filter(b => b.id !== id));
    setDeleteId(null);
    try {
      const res = await fetch(`/api/bills/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setSuccessMsg('Bill deleted.'); setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Could not delete the bill. Please try again.'); setTimeout(() => setErrorMsg(''), 4000);
      fetchBills();
    }
  }

  // Toolbar-driven view of the list. Status matches the effective (overdue-aware) status.
  const q = search.trim().toLowerCase();
  const filteredBills = bills
    .filter(b => {
      const effStatus = isOverdue(b.due_date, b.status) && b.status !== 'Paid' ? 'Overdue' : b.status;
      if (statusFilter !== 'all' && effStatus !== statusFilter) return false;
      if (!q) return true;
      return [b.bill_number, b.vendor_name, b.description, b.category].some(v => String(v || '').toLowerCase().includes(q));
    })
    .sort((a, b2) => {
      if (sortBy === 'amount') return (Number(b2.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === 'vendor') return String(a.vendor_name || '').localeCompare(String(b2.vendor_name || ''));
      return String(a.due_date || '9999').localeCompare(String(b2.due_date || '9999'));
    });

  // Column-header sorting (R11 sweep) — when active it overrides the toolbar's
  // sortBy ordering; cycling back to "none" restores it. Amount sorts numeric,
  // due date as ISO, status on the effective (overdue-aware) label.
  const { sort: colSort, cycleSort } = usePersistedSort('project-bills');
  const sortedBills = useSortedRows(filteredBills, colSort, (b, key) => {
    switch (key) {
      case 'invoice': return b.bill_number || null;
      case 'vendor':  return b.vendor_name || null;
      case 'desc':    return b.description || null;
      case 'amount':  return Number(b.amount) || 0;
      case 'due':     return b.due_date || null;
      case 'status':  return isOverdue(b.due_date, b.status) && b.status !== 'Paid' ? 'Overdue' : b.status;
      default:        return (b as unknown as Record<string, unknown>)[key];
    }
  });
  const pendingTotal = toDollars(sumCents(bills.filter(b => b.status === 'Pending' || b.status === 'Approved').map(b => toCents(b.amount || 0))));
  const paidCount = bills.filter(b => b.status === 'Paid').length;
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#1c1c1e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };
  const hint: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };

  // ── SmartCreate intelligence (all Number-coerced: DB numerics round-trip as strings) ──
  const budget = ctx?.budget;
  const bOriginal = Number(budget?.original) || 0;
  const bCommitted = Number(budget?.committed) || 0;
  const bActual = Number(budget?.actual) || 0;
  const bRemaining = bOriginal - bActual;
  const vendors: string[] = (ctx?.vendors || []).filter(Boolean);
  const budgetLines: any[] = budget?.lines || [];
  const costCodeOptions: any[] = (ctx?.costCodes || []).filter((c: any) => c.costCode);
  const subtotalNum = Number(form.amount) || 0;
  const taxNum = Number(form.tax) || 0;
  const grandTotal = subtotalNum + taxNum;
  // Same line-matching the server rollup uses: exact cost code, else its division.
  const selLine = form.cost_code
    ? (budgetLines.find((l: any) => String(l.costCode) === String(form.cost_code))
      || budgetLines.find((l: any) => String(l.division) === String(form.cost_code).slice(0, 2)))
    : null;
  const lineBudget = Number(selLine?.original) || 0;
  const lineActual = Number(selLine?.actual) || 0;
  const lineRemaining = lineBudget - lineActual - grandTotal;

  function plus30() {
    const d = new Date(Date.now() + 30 * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function openForm(open: boolean) {
    setErrorMsg('');
    setShowForm(open);
    if (open) {
      setForm(f => f.due_date ? f : { ...f, due_date: plus30() });
      setAuto(a => ({ ...a, due: true }));
    }
  }

  function pickCostCode(code: string) {
    const line = costCodeOptions.find((c: any) => String(c.costCode) === code);
    const div = String(line?.division ?? code).slice(0, 2);
    const divName = CSI_DIVISIONS[div]?.name;
    setForm(p => ({ ...p, cost_code: code, category: code && divName ? `${div} - ${divName}` : p.category }));
  }

  function pickDivision(div: string) {
    const divName = CSI_DIVISIONS[div]?.name;
    setForm(p => ({ ...p, cost_code: div, category: div && divName ? `${div} - ${divName}` : p.category }));
  }

  return (
    <PremiumSurface maxWidth={1600}>
      {/* Header */}
      <ModuleHero
        eyebrow="Financials"
        eyebrowIcon={<Receipt size={13} weight="fill" color={GOLD} />}
        title="Bills"
        subtitle="Vendor bills and supplier invoices"
        actions={
          <button onClick={() => openForm(!showForm)} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> New Bill
          </button>
        }
      />

      {/* What the system already knows: the budget every bill posts against */}
      {ctx && (
        <StatStrip items={[
          { label: 'Budget', value: fmt(bOriginal), sub: `${Number(budget?.lineCount) || budgetLines.length} cost-coded lines` },
          { label: 'Committed', value: fmt(bCommitted), sub: 'POs + subcontracts' },
          { label: 'Actual to Date', value: fmt(bActual), sub: 'bills + invoices posted' },
          { label: 'Remaining', value: fmt(bRemaining), accent: bRemaining < 0 ? RED : GREEN, sub: 'original less actual' },
          { label: 'Known Vendors', value: String(vendors.length), sub: 'autocomplete in the form' },
        ]} />
      )}

      {successMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
          <SectionCard title="New Bill" icon={<FilePlus size={17} weight="duotone" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={label}>Invoice # *</label>
                <input type="text" value={form.invoice_num} onChange={e => setForm(p => ({ ...p, invoice_num: e.target.value }))} style={inp} />
                <div style={hint}>{"The vendor's invoice number, exactly as printed."}</div>
              </div>
              <div>
                <label style={label}>Vendor *</label>
                <Suggest type="text" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={inp} options={['v']} />
                <div style={hint}>{vendors.length > 0 ? `${vendors.length} known vendor${vendors.length === 1 ? '' : 's'} on this project — start typing.` : 'New vendors are remembered for next time.'}</div>
              </div>
              <div>
                <label style={label}>Cost Code</label>
                {costCodeOptions.length > 0 ? (
                  <select value={form.cost_code} onChange={e => pickCostCode(e.target.value)} style={inp}>
                    <option value="">— Select cost code —</option>
                    {costCodeOptions.map((c: any) => (
                      <option key={c.costCode} value={c.costCode}>{c.costCode + ' — ' + (c.description || CSI_DIVISIONS[String(c.division)]?.name || '')}</option>
                    ))}
                  </select>
                ) : (
                  <select value={form.cost_code} onChange={e => pickDivision(e.target.value)} style={inp}>
                    <option value="">— CSI division —</option>
                    {Object.entries(CSI_DIVISIONS).map(([dv, d]) => (
                      <option key={dv} value={dv}>{dv + ' — ' + d.name}</option>
                    ))}
                  </select>
                )}
                <div style={hint}>{costCodeOptions.length > 0 ? "From this project's budget — the total posts to that line's actual." : 'No cost-coded budget yet — file under a CSI division.'}</div>
              </div>
              <div>
                <label style={label}>Amount ($) *</label>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} />
                <div style={hint}>Pre-tax amount from the invoice.</div>
              </div>
              <div>
                <label style={label}>Tax ($)</label>
                <input type="number" value={form.tax} onChange={e => setForm(p => ({ ...p, tax: Number(e.target.value) }))} style={inp} />
                <div style={hint}>Sales tax as billed — leave 0 if exempt.</div>
              </div>
              <div>
                <label style={label}>Due Date{auto.due && <AutoChip />}</label>
                <SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} />
                <div style={hint}>{"Net 30 from today — adjust to the vendor's terms."}</div>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={label}>Description</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} />
              </div>
              {selLine && (
                <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12.5, color: DIM, lineHeight: 1.55 }}>
                  <Wallet size={16} weight="duotone" color={GOLD} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Posts <b style={{ color: TEXT }}>{fmt(grandTotal)}</b> actual against <b style={{ color: GOLD }}>{selLine.costCode || selLine.division}</b>{selLine.description ? ` (${selLine.description})` : ''} — budget <b style={{ color: TEXT }}>{fmt(lineBudget)}</b>, actual to date <b style={{ color: TEXT }}>{fmt(lineActual)}</b>, remaining <b style={{ color: lineRemaining < 0 ? RED : GREEN }}>{fmt(lineRemaining)}</b> after this bill.
                  </span>
                </div>
              )}
              <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', gap: 24, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                <span style={{ fontSize: 12, color: DIM }}>Subtotal <b style={{ color: TEXT }}>{fmt(subtotalNum)}</b></span>
                <span style={{ fontSize: 12, color: DIM }}>Tax <b style={{ color: TEXT }}>{fmt(taxNum)}</b></span>
                <span style={{ fontSize: 12, color: DIM }}>Bill Total <b style={{ color: GOLD, fontSize: 14 }}>{fmt(grandTotal)}</b></span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.7 : 1 }} className="pmBtn">
                {saving ? 'Saving...' : 'Save Bill'}
              </button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>

          {/* Context rail — what the system does with this bill */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selLine && (
              <SectionCard flat title={`Cost Code ${selLine.costCode || selLine.division}`} icon={<Wallet size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Line budget" value={fmt(lineBudget)} />
                <InsightRow label="Actual to date" value={fmt(lineActual)} />
                <InsightRow label="This bill" value={fmt(grandTotal)} accent={GOLD} />
                <InsightRow label="Remaining after" value={fmt(lineRemaining)} accent={lineRemaining < 0 ? RED : GREEN} strong />
              </SectionCard>
            )}
            <SectionCard flat title="After You Save" icon={<CurrencyDollar size={17} weight="duotone" color={GOLD} />}>
              <FlowSteps title="" steps={[
                { title: 'Bill lands as Pending', desc: 'Queued in payables with overdue tracking off the due date — no follow-up spreadsheet.' },
                { title: 'Budget actual rolls up server-side', desc: form.cost_code ? `${fmt(grandTotal)} posts to ${form.cost_code} actual the moment you save.` : 'Pick a cost code and the total posts to that budget line automatically.' },
                { title: 'Approve to clear for payment', desc: 'Approval moves the bill into the payment queue and pending-payables totals.' },
                { title: 'Mark Paid closes the loop', desc: 'Paid bills drop out of pending totals; the project cost ledger stays current.' },
              ]} />
            </SectionCard>
          </div>
        </div>
      )}

      <ListToolbar
        module="bills"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search bills..."
        filters={[{
          key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter,
          allLabel: 'All Statuses',
          options: ['Pending', 'Approved', 'Paid', 'Overdue'],
        }]}
        sort={sortBy}
        onSort={setSortBy}
        sortOptions={[
          { value: 'due', label: 'Due date' },
          { value: 'amount', label: 'Amount (high first)' },
          { value: 'vendor', label: 'Vendor A-Z' },
        ]}
        count={{ shown: filteredBills.length, total: bills.length }}
        style={{ marginBottom: 16 }}
      />

      <SectionCard title="All Bills" icon={<Receipt size={17} weight="duotone" color={GOLD} />} flush>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : bills.length === 0 ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                <Receipt size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                No bills yet
                <span style={{ fontWeight: 400, color: DIM }}>{showForm ? ' — log the first one in the form above; it lands here as Pending.' : ' — log the first vendor invoice to start the payables ledger.'}</span>
              </div>
              {!showForm && (
                <button onClick={() => openForm(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> New Bill</button>
              )}
            </div>
            <FlowStrip steps={[
              { title: 'Log the bill', desc: 'vendor, amount, cost code' },
              { title: 'Budget actual posts', desc: 'to that line automatically' },
              { title: 'Approve', desc: 'clears it for payment' },
              { title: 'Mark Paid', desc: 'closes the loop' },
            ]} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {([
                    ['Invoice #','invoice'],['Vendor','vendor'],['Description','desc'],
                    ['Amount','amount'],['Due Date','due'],['Status','status'],['Actions',undefined],
                  ] as [string, string|undefined][]).map(([h,k]) => (
                    <SortableTh key={h} label={h} sortKey={k} sort={colSort} onSort={cycleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedBills.map(b => {
                  const overdue = isOverdue(b.due_date, b.status);
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,.06)', background: overdue ? 'rgba(239,68,68,.05)' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 600 }}>{b.bill_number}</td>
                      <td style={{ padding: '10px 14px', color: TEXT }}>{b.vendor_name}</td>
                      <td style={{ padding: '10px 14px', color: DIM, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.description}</td>
                      <td style={{ padding: '10px 14px', position: 'relative' as const }}>
                        {deleteId === b.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>Delete bill?</span>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteBill(b.id); }} style={{ padding: '3px 8px', background: 'rgba(239,68,68,.15)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 5, color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteId(null); }} style={{ padding: '3px 8px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : editId === b.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input value={editVal} onChange={e => setEditVal(e.target.value)} type="number" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleEditBill(b.id); if (e.key === 'Escape') setEditId(null); }} style={{ width: 100, padding: '4px 8px', background: DARK, border: `1px solid ${GOLD}`, borderRadius: 5, color: TEXT, fontSize: 12, outline: 'none', textAlign: 'right' }} />
                            <button onClick={() => handleEditBill(b.id)} style={{ padding: '3px 8px', background: `linear-gradient(135deg,${GOLD},#FBBF24)`, border: 'none', borderRadius: 5, color: '#1C1C1E', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditId(null)} style={{ padding: '3px 8px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 5, color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : adjustId === b.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {[-10, -5, 5, 10].map(p => (
                              <button key={p} onClick={(e) => { e.stopPropagation(); handleAdjustBill(b.id, p); }} style={{ padding: '3px 7px', background: p > 0 ? 'rgba(61,214,140,.1)' : 'rgba(239,68,68,.1)', border: `1px solid ${p > 0 ? 'rgba(61,214,140,.25)' : 'rgba(239,68,68,.25)'}`, borderRadius: 5, color: p > 0 ? GREEN : RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p > 0 ? '+' : ''}{p}%</button>
                            ))}
                            <button onClick={(e) => { e.stopPropagation(); setAdjustId(null); }} style={{ padding: '3px 6px', background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: TEXT, fontWeight: 700 }}>{fmt(b.amount)}</span>
                            {copiedId === b.id && <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>Copied!</span>}
                            <button onClick={(e) => { e.stopPropagation(); openBillMenu(b.id); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: '2px 4px', lineHeight: 1, opacity: 0.6 }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}>&#9662;</button>
                            {menuId === b.id && (
                              <div style={{ position: 'absolute', top: 36, right: 14, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 'var(--radius-md)', padding: 6, zIndex: 100, minWidth: 150, boxShadow: 'var(--shadow-lg)' }}>
                                {[
                                  { label: 'Edit Amount', icon: '✏️', action: () => { setMenuId(null); setEditId(b.id); setEditVal(String(b.amount)); } },
                                  { label: 'Adjust %', icon: '📊', action: () => { setMenuId(null); setAdjustId(b.id); } },
                                  { label: 'Copy Amount', icon: '📋', action: () => handleCopyBill(b.id, b.amount) },
                                ].map(item => (
                                  <div key={item.label} onClick={(e) => { e.stopPropagation(); item.action(); }} style={{ padding: '7px 12px', fontSize: 12, color: TEXT, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
                                  </div>
                                ))}
                                <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />
                                <div onClick={(e) => { e.stopPropagation(); setMenuId(null); setDeleteId(b.id); }} style={{ padding: '7px 12px', fontSize: 12, color: RED, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <span style={{ fontSize: 14 }}>{'🗑️'}</span>Delete Bill
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: overdue ? RED : DIM, whiteSpace: 'nowrap' }}>{b.due_date || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{statusBadge(overdue && b.status !== 'Paid' ? 'Overdue' : b.status)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {b.status === 'Pending' && (
                          <button onClick={() => handleApprove(b.id)} disabled={actionLoading === b.id + '-approve'} style={{ padding: '4px 10px', background: 'rgba(245,158,11,.2)', border: '1px solid rgba(245,158,11,.4)', borderRadius: 5, color: '#FBBF24', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                            {actionLoading === b.id + '-approve' ? '...' : 'Approve'}
                          </button>
                        )}
                        {(b.status === 'Pending' || b.status === 'Approved') && (
                          <button onClick={() => handlePay(b.id)} disabled={actionLoading === b.id + '-pay'} style={{ padding: '4px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 5, color: GREEN, fontSize: 12, cursor: 'pointer' }}>
                            {actionLoading === b.id + '-pay' ? '...' : 'Mark Paid'}
                          </button>
                        )}
                        {b.status === 'Paid' && <span style={{ color: GREEN, fontSize: 12 }}>Paid</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {!loading && bills.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 20 }}>
          <StatCard
            icon={<Receipt size={19} weight="duotone" color={GOLD} />}
            label="Total Bills"
            value={String(bills.length)}
            sub={`${paidCount} paid`}
          />
          <StatCard
            icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
            label="Pending + Approved"
            value={'$' + pendingTotal.toLocaleString()}
            accent={GOLD}
            sub="awaiting payment"
          />
        </div>
      )}

      {menuId && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuId(null)} />}
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
