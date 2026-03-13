'use client';
/**
 * Saguaro Field — Construction Permit Tracking
 * Track permits, expirations, renewals, fees, and authority contacts from the field. Offline queue.
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

const PERMIT_TYPES = [
  'Building', 'Electrical', 'Plumbing', 'Mechanical', 'Fire',
  'Grading', 'Demolition', 'ROW', 'Environmental', 'Encroachment', 'Other',
] as const;

const PERMIT_STATUSES = ['Applied', 'Issued', 'Expired', 'Pending Inspection', 'Closed'] as const;

const STATUS_COLORS: Record<string, string> = {
  Applied: BLUE,
  Issued: GREEN,
  Expired: RED,
  'Pending Inspection': AMBER,
  Closed: DIM,
};

type SortField = 'applied_date' | 'expires_date' | 'permit_type' | 'status';
type View = 'list' | 'detail' | 'calendar' | 'create';

interface Permit {
  id: string;
  permit_type: string;
  permit_number: string;
  status: string;
  applied_date: string | null;
  issued_date: string | null;
  expires_date: string | null;
  issuing_authority: string | null;
  authority_phone?: string | null;
  authority_email?: string | null;
  inspector_name?: string | null;
  inspector_phone?: string | null;
  fee_amount: number | null;
  notes: string | null;
  file_url: string | null;
  renewal_of?: string | null;
  created_at?: string;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expirationColor(days: number | null): string {
  if (days === null) return DIM;
  if (days < 0) return RED;
  if (days < 7) return RED;
  if (days < 30) return AMBER;
  return GREEN;
}

function expirationLabel(days: number | null): string {
  if (days === null) return 'No expiry';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d remaining`;
}

const exportPDF = (title: string, content: string) => {
  const pw = window.open('', '_blank');
  if (!pw) return;
  pw.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px;color:#1a1a1a;max-width:900px;margin:0 auto;}
      h1{font-size:24px;border-bottom:2px solid #D4A017;padding-bottom:8px;}
      h2{font-size:18px;color:#333;margin-top:24px;}
      table{width:100%;border-collapse:collapse;margin:12px 0;}
      th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px;}
      th{background:#f5f5f5;font-weight:600;}
      .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;}
      .meta{color:#666;font-size:13px;}
      .footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999;}
    </style></head><body>${content}
    <div class="footer">Saguaro Field &mdash; Permit Report &mdash; Generated ${new Date().toLocaleString()}</div>
    </body></html>`);
  pw.document.close();
  pw.focus();
  pw.print();
};

/* ─── Inner Component ─── */
function PermitsPageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';

  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* filters */
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterExpRange, setFilterExpRange] = useState<'all' | '7' | '30' | '90' | 'expired'>('all');
  const [sortField, setSortField] = useState<SortField>('expires_date');
  const [sortAsc, setSortAsc] = useState(true);
  const [searchText, setSearchText] = useState('');

  /* create form */
  const [formType, setFormType] = useState('Building');
  const [formNumber, setFormNumber] = useState('');
  const [formStatus, setFormStatus] = useState('Applied');
  const [formApplied, setFormApplied] = useState('');
  const [formIssued, setFormIssued] = useState('');
  const [formExpires, setFormExpires] = useState('');
  const [formAuthority, setFormAuthority] = useState('');
  const [formAuthorityPhone, setFormAuthorityPhone] = useState('');
  const [formAuthorityEmail, setFormAuthorityEmail] = useState('');
  const [formInspector, setFormInspector] = useState('');
  const [formInspectorPhone, setFormInspectorPhone] = useState('');
  const [formFee, setFormFee] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formRenewalOf, setFormRenewalOf] = useState('');
  const [saving, setSaving] = useState(false);

  /* calendar */
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  /* ─── Fetch ─── */
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/permits`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setPermits(data.permits || []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load permits');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* ─── Derived ─── */
  const expiringPermits = useMemo(() =>
    permits.filter(p => {
      const d = daysUntil(p.expires_date);
      return d !== null && d >= 0 && d <= 30 && p.status !== 'Closed' && p.status !== 'Expired';
    }).sort((a, b) => (daysUntil(a.expires_date) ?? 999) - (daysUntil(b.expires_date) ?? 999)),
  [permits]);

  const totalFees = useMemo(() =>
    permits.reduce((s, p) => s + (p.fee_amount || 0), 0),
  [permits]);

  const filteredPermits = useMemo(() => {
    let list = [...permits];
    if (filterType) list = list.filter(p => p.permit_type === filterType);
    if (filterStatus) list = list.filter(p => p.status === filterStatus);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(p =>
        p.permit_number.toLowerCase().includes(q) ||
        p.permit_type.toLowerCase().includes(q) ||
        (p.issuing_authority || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      );
    }
    if (filterExpRange !== 'all') {
      list = list.filter(p => {
        const d = daysUntil(p.expires_date);
        if (filterExpRange === 'expired') return d !== null && d < 0;
        if (d === null) return false;
        return d >= 0 && d <= Number(filterExpRange);
      });
    }
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'applied_date' || sortField === 'expires_date') {
        va = a[sortField] || '';
        vb = b[sortField] || '';
      } else {
        va = a[sortField] || '';
        vb = b[sortField] || '';
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [permits, filterType, filterStatus, filterExpRange, sortField, sortAsc, searchText]);

  const selected = useMemo(() => permits.find(p => p.id === selectedId) || null, [permits, selectedId]);

  /* ─── Calendar helpers ─── */
  const calendarDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth, calYear]);

  const calendarEvents = useMemo(() => {
    const map: Record<string, { permit: Permit; type: string }[]> = {};
    const pad = (n: number) => String(n).padStart(2, '0');
    permits.forEach(p => {
      const key = (d: string | null, t: string) => {
        if (!d) return;
        const dt = new Date(d);
        if (dt.getMonth() === calMonth && dt.getFullYear() === calYear) {
          const k = `${dt.getDate()}`;
          if (!map[k]) map[k] = [];
          map[k].push({ permit: p, type: t });
        }
      };
      key(p.applied_date, 'Applied');
      key(p.issued_date, 'Issued');
      key(p.expires_date, 'Expires');
    });
    return map;
  }, [permits, calMonth, calYear]);

  /* ─── Save / Renew ─── */
  const handleSave = async () => {
    if (!formNumber.trim()) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      permit_type: formType,
      permit_number: formNumber.trim(),
      status: formStatus,
      applied_date: formApplied || null,
      issued_date: formIssued || null,
      expires_date: formExpires || null,
      issuing_authority: formAuthority || null,
      authority_phone: formAuthorityPhone || null,
      authority_email: formAuthorityEmail || null,
      inspector_name: formInspector || null,
      inspector_phone: formInspectorPhone || null,
      fee_amount: formFee ? parseFloat(formFee) : null,
      notes: formNotes || null,
      renewal_of: formRenewalOf || null,
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/permits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPermits(prev => [data.permit || { ...body, id: crypto.randomUUID() }, ...prev]);
      resetForm();
      setView('list');
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/permits`,
        method: 'POST',
        body: JSON.stringify(body),
        contentType: 'application/json',
        isFormData: false,
      });
      setPermits(prev => [{ ...body, id: `offline-${Date.now()}`, file_url: null } as Permit, ...prev]);
      resetForm();
      setView('list');
    } finally {
      setSaving(false);
    }
  };

  const handleRenew = async (permit: Permit) => {
    const body: Record<string, unknown> = {
      permit_type: permit.permit_type,
      permit_number: `${permit.permit_number}-R`,
      status: 'Applied',
      applied_date: new Date().toISOString().slice(0, 10),
      issued_date: null,
      expires_date: null,
      issuing_authority: permit.issuing_authority,
      authority_phone: permit.authority_phone || null,
      authority_email: permit.authority_email || null,
      inspector_name: permit.inspector_name || null,
      inspector_phone: permit.inspector_phone || null,
      fee_amount: permit.fee_amount,
      notes: `Renewal of ${permit.permit_number}`,
      renewal_of: permit.id,
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/permits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPermits(prev => [data.permit || { ...body, id: crypto.randomUUID(), file_url: null } as Permit, ...prev]);
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/permits`, method: 'POST', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
      setPermits(prev => [{ ...body, id: `offline-${Date.now()}`, file_url: null } as Permit, ...prev]);
    }
  };

  const resetForm = () => {
    setFormType('Building'); setFormNumber(''); setFormStatus('Applied');
    setFormApplied(''); setFormIssued(''); setFormExpires('');
    setFormAuthority(''); setFormAuthorityPhone(''); setFormAuthorityEmail('');
    setFormInspector(''); setFormInspectorPhone('');
    setFormFee(''); setFormNotes(''); setFormRenewalOf('');
  };

  /* ─── PDF Export ─── */
  const handleExportList = () => {
    const rows = filteredPermits.map(p =>
      `<tr>
        <td>${p.permit_number}</td>
        <td>${p.permit_type}</td>
        <td><span class="badge" style="background:${STATUS_COLORS[p.status] || DIM};color:#fff">${p.status}</span></td>
        <td>${formatDate(p.applied_date)}</td>
        <td>${formatDate(p.issued_date)}</td>
        <td>${formatDate(p.expires_date)}</td>
        <td>${formatCurrency(p.fee_amount)}</td>
        <td>${p.issuing_authority || '\u2014'}</td>
      </tr>`
    ).join('');
    exportPDF('Permit Report', `
      <h1>Permit Report</h1>
      <p class="meta">${filteredPermits.length} permits &bull; Total fees: ${formatCurrency(totalFees)}</p>
      <table><thead><tr><th>Number</th><th>Type</th><th>Status</th><th>Applied</th><th>Issued</th><th>Expires</th><th>Fee</th><th>Authority</th></tr></thead>
      <tbody>${rows}</tbody></table>
    `);
  };

  const handleExportDetail = (p: Permit) => {
    exportPDF(`Permit ${p.permit_number}`, `
      <h1>Permit: ${p.permit_number}</h1>
      <table>
        <tr><th>Type</th><td>${p.permit_type}</td></tr>
        <tr><th>Status</th><td>${p.status}</td></tr>
        <tr><th>Applied</th><td>${formatDate(p.applied_date)}</td></tr>
        <tr><th>Issued</th><td>${formatDate(p.issued_date)}</td></tr>
        <tr><th>Expires</th><td>${formatDate(p.expires_date)}</td></tr>
        <tr><th>Authority</th><td>${p.issuing_authority || '\u2014'}</td></tr>
        <tr><th>Authority Phone</th><td>${p.authority_phone || '\u2014'}</td></tr>
        <tr><th>Authority Email</th><td>${p.authority_email || '\u2014'}</td></tr>
        <tr><th>Inspector</th><td>${p.inspector_name || '\u2014'}</td></tr>
        <tr><th>Inspector Phone</th><td>${p.inspector_phone || '\u2014'}</td></tr>
        <tr><th>Fee</th><td>${formatCurrency(p.fee_amount)}</td></tr>
        <tr><th>Notes</th><td>${p.notes || '\u2014'}</td></tr>
        ${p.renewal_of ? `<tr><th>Renewal Of</th><td>${p.renewal_of}</td></tr>` : ''}
      </table>
    `);
  };

  /* ─── Styles ─── */
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', background: '#0A1628', color: TEXT,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    paddingBottom: 80,
  };
  const headerStyle: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 50, background: RAISED,
    borderBottom: `1px solid ${BORDER}`, padding: '12px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const cardStyle: React.CSSProperties = {
    background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
    padding: 16, marginBottom: 12,
  };
  const btnStyle = (bg: string, small = false): React.CSSProperties => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: small ? '6px 12px' : '10px 16px', fontWeight: 600,
    fontSize: small ? 12 : 14, cursor: 'pointer',
  });
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0A1628', border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '10px 12px', color: TEXT, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 4, display: 'block',
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none' as const, cursor: 'pointer',
  };
  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block', background: `${color}22`, color,
    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
    letterSpacing: 0.5,
  });
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: 'none',
    background: active ? GOLD : 'transparent',
    color: active ? '#000' : DIM,
  });

  /* ─── No project ─── */
  if (!projectId) {
    return (
      <div style={pageStyle}>
        <div style={{ ...headerStyle, justifyContent: 'center' }}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>Permits</span>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: DIM }}>
          No project selected. Add <code style={{ color: GOLD }}>?projectId=</code> to the URL.
        </div>
      </div>
    );
  }

  /* ─── Loading / Error ─── */
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...headerStyle, justifyContent: 'center' }}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>Permits</span>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading permits...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...headerStyle, justifyContent: 'center' }}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>Permits</span>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: RED }}>{error}</div>
      </div>
    );
  }

  /* ═══════════════════ DETAIL VIEW ═══════════════════ */
  if (view === 'detail' && selected) {
    const days = daysUntil(selected.expires_date);
    const expColor = expirationColor(days);
    const renewals = permits.filter(p => p.renewal_of === selected.id);
    const isRenewalOf = selected.renewal_of
      ? permits.find(p => p.id === selected.renewal_of) : null;

    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <button onClick={() => { setView('list'); setSelectedId(null); }} style={{ ...btnStyle('transparent', true), color: GOLD }}>
            &larr; Back
          </button>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 16 }}>Permit Detail</span>
          <button onClick={() => handleExportDetail(selected)} style={btnStyle(BORDER, true)}>PDF</button>
        </div>
        <div style={{ padding: 16 }}>
          {/* Header card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{selected.permit_number}</div>
                <div style={{ fontSize: 14, color: DIM, marginTop: 2 }}>{selected.permit_type}</div>
              </div>
              <span style={badgeStyle(STATUS_COLORS[selected.status] || DIM)}>{selected.status}</span>
            </div>
            {days !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: expColor }} />
                <span style={{ fontSize: 13, color: expColor, fontWeight: 600 }}>{expirationLabel(days)}</span>
              </div>
            )}
          </div>

          {/* Dates */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>DATES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: DIM }}>Applied</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{formatDate(selected.applied_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: DIM }}>Issued</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{formatDate(selected.issued_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: DIM }}>Expires</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: expColor }}>{formatDate(selected.expires_date)}</div>
              </div>
            </div>
          </div>

          {/* Authority & Inspector */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>AUTHORITY / INSPECTOR</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: DIM }}>Issuing Authority</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.issuing_authority || '\u2014'}</div>
                {selected.authority_phone && (
                  <a href={`tel:${selected.authority_phone}`} style={{ fontSize: 12, color: BLUE, textDecoration: 'none' }}>
                    {selected.authority_phone}
                  </a>
                )}
                {selected.authority_email && (
                  <div>
                    <a href={`mailto:${selected.authority_email}`} style={{ fontSize: 12, color: BLUE, textDecoration: 'none' }}>
                      {selected.authority_email}
                    </a>
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: DIM }}>Inspector</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.inspector_name || '\u2014'}</div>
                {selected.inspector_phone && (
                  <a href={`tel:${selected.inspector_phone}`} style={{ fontSize: 12, color: BLUE, textDecoration: 'none' }}>
                    {selected.inspector_phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Fee */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 8 }}>FEE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>{formatCurrency(selected.fee_amount)}</div>
          </div>

          {/* Notes */}
          {selected.notes && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 8 }}>NOTES</div>
              <div style={{ fontSize: 14, color: DIM, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
            </div>
          )}

          {/* File */}
          {selected.file_url && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 8 }}>DOCUMENT</div>
              <a href={selected.file_url} target="_blank" rel="noopener noreferrer"
                style={{ color: BLUE, fontSize: 14, textDecoration: 'underline' }}>
                View Permit Document
              </a>
            </div>
          )}

          {/* Renewal chain */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>RENEWAL TRACKING</div>
            {isRenewalOf && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: DIM }}>Renewal of: </span>
                <button onClick={() => { setSelectedId(isRenewalOf.id); }}
                  style={{ background: 'transparent', border: 'none', color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                  {isRenewalOf.permit_number}
                </button>
              </div>
            )}
            {renewals.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>Renewed by:</div>
                {renewals.map(r => (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    style={{ display: 'block', background: 'transparent', border: 'none', color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', marginBottom: 2 }}>
                    {r.permit_number} ({r.status})
                  </button>
                ))}
              </div>
            )}
            {selected.status !== 'Closed' && (
              <button onClick={() => handleRenew(selected)} style={btnStyle(AMBER, true)}>
                Initiate Renewal
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════ CREATE VIEW ═══════════════════ */
  if (view === 'create') {
    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <button onClick={() => { setView('list'); resetForm(); }} style={{ ...btnStyle('transparent', true), color: GOLD }}>
            &larr; Back
          </button>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 16 }}>New Permit</span>
          <div style={{ width: 48 }} />
        </div>
        <div style={{ padding: 16 }}>
          <div style={cardStyle}>
            <label style={labelStyle}>Permit Type</label>
            <select value={formType} onChange={e => setFormType(e.target.value)} style={selectStyle}>
              {PERMIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Permit Number *</label>
              <input value={formNumber} onChange={e => setFormNumber(e.target.value)} placeholder="e.g. BLD-2026-0042" style={inputStyle} />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Status</label>
              <select value={formStatus} onChange={e => setFormStatus(e.target.value)} style={selectStyle}>
                {PERMIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Applied Date</label>
                <input type="date" value={formApplied} onChange={e => setFormApplied(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Issued Date</label>
                <input type="date" value={formIssued} onChange={e => setFormIssued(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Expires Date</label>
                <input type="date" value={formExpires} onChange={e => setFormExpires(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12 }}>AUTHORITY / INSPECTOR</div>
            <label style={labelStyle}>Issuing Authority</label>
            <input value={formAuthority} onChange={e => setFormAuthority(e.target.value)} placeholder="e.g. City of Phoenix" style={inputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Authority Phone</label>
                <input value={formAuthorityPhone} onChange={e => setFormAuthorityPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Authority Email</label>
                <input value={formAuthorityEmail} onChange={e => setFormAuthorityEmail(e.target.value)} placeholder="permits@city.gov" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Inspector Name</label>
                <input value={formInspector} onChange={e => setFormInspector(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Inspector Phone</label>
                <input value={formInspectorPhone} onChange={e => setFormInspectorPhone(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <label style={labelStyle}>Fee Amount</label>
            <input type="number" value={formFee} onChange={e => setFormFee(e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Renewal Of (Permit ID)</label>
              <select value={formRenewalOf} onChange={e => setFormRenewalOf(e.target.value)} style={selectStyle}>
                <option value="">None</option>
                {permits.map(p => <option key={p.id} value={p.id}>{p.permit_number} ({p.permit_type})</option>)}
              </select>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={4}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !formNumber.trim()}
            style={{ ...btnStyle(GOLD), width: '100%', color: '#000', opacity: saving || !formNumber.trim() ? 0.5 : 1, marginTop: 4 }}>
            {saving ? 'Saving...' : 'Save Permit'}
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════ CALENDAR VIEW ═══════════════════ */
  if (view === 'calendar') {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const eventTypeColor: Record<string, string> = { Applied: BLUE, Issued: GREEN, Expires: RED };

    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>Permits</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('list')} style={tabStyle(false)}>List</button>
            <button onClick={() => setView('calendar')} style={tabStyle(true)}>Calendar</button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
              style={{ ...btnStyle(BORDER, true) }}>&larr;</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{monthNames[calMonth]} {calYear}</span>
            <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
              style={{ ...btnStyle(BORDER, true) }}>&rarr;</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: DIM, padding: 4 }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calendarDays.map((day, i) => {
              const events = day ? calendarEvents[String(day)] || [] : [];
              const isToday = day && calMonth === new Date().getMonth() && calYear === new Date().getFullYear() && day === new Date().getDate();
              return (
                <div key={i} style={{
                  background: day ? RAISED : 'transparent',
                  border: isToday ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
                  borderRadius: 8, minHeight: 64, padding: 4,
                }}>
                  {day && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? GOLD : DIM, marginBottom: 2 }}>{day}</div>
                      {events.map((ev, j) => (
                        <div key={j}
                          onClick={() => { setSelectedId(ev.permit.id); setView('detail'); }}
                          style={{
                            fontSize: 9, padding: '1px 3px', borderRadius: 3, marginBottom: 1,
                            background: `${eventTypeColor[ev.type] || DIM}33`,
                            color: eventTypeColor[ev.type] || DIM,
                            cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            fontWeight: 600,
                          }}>
                          {ev.type[0]}: {ev.permit.permit_number}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
            {Object.entries(eventTypeColor).map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                <span style={{ fontSize: 11, color: DIM }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════ LIST VIEW (default) ═══════════════════ */
  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>Permits</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('list')} style={tabStyle(true)}>List</button>
          <button onClick={() => setView('calendar')} style={tabStyle(false)}>Calendar</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* ─── Expiration Alerts Banner ─── */}
        {expiringPermits.length > 0 && (
          <div style={{
            background: `${AMBER}15`, border: `1px solid ${AMBER}40`, borderRadius: 12,
            padding: 14, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: AMBER, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: AMBER }}>
                {expiringPermits.length} Permit{expiringPermits.length > 1 ? 's' : ''} Expiring Within 30 Days
              </span>
            </div>
            {expiringPermits.map(p => {
              const d = daysUntil(p.expires_date);
              const c = expirationColor(d);
              return (
                <div key={p.id}
                  onClick={() => { setSelectedId(p.id); setView('detail'); }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                    background: `${c}10`, marginBottom: 4,
                  }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{p.permit_number}</span>
                    <span style={{ fontSize: 11, color: DIM, marginLeft: 8 }}>{p.permit_type}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{expirationLabel(d)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Stats Strip ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Total', value: permits.length, color: TEXT },
            { label: 'Active', value: permits.filter(p => p.status === 'Issued').length, color: GREEN },
            { label: 'Pending', value: permits.filter(p => p.status === 'Applied' || p.status === 'Pending Inspection').length, color: AMBER },
            { label: 'Total Fees', value: formatCurrency(totalFees), color: GOLD },
          ].map((s, i) => (
            <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: 10, marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: DIM }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ─── Search ─── */}
        <input
          value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="Search permits..."
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        {/* ─── Filters ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
            <option value="">All Types</option>
            {PERMIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
            <option value="">All Statuses</option>
            {PERMIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterExpRange} onChange={e => setFilterExpRange(e.target.value as typeof filterExpRange)} style={{ ...selectStyle, fontSize: 12 }}>
            <option value="all">All Dates</option>
            <option value="7">&lt; 7 Days</option>
            <option value="30">&lt; 30 Days</option>
            <option value="90">&lt; 90 Days</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* ─── Sort ─── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: DIM, lineHeight: '28px' }}>Sort:</span>
          {([
            ['expires_date', 'Expiry'],
            ['applied_date', 'Applied'],
            ['permit_type', 'Type'],
            ['status', 'Status'],
          ] as [SortField, string][]).map(([field, label]) => (
            <button key={field}
              onClick={() => { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(true); } }}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${sortField === field ? GOLD : BORDER}`,
                background: sortField === field ? `${GOLD}22` : 'transparent',
                color: sortField === field ? GOLD : DIM,
              }}>
              {label} {sortField === field ? (sortAsc ? '\u2191' : '\u2193') : ''}
            </button>
          ))}
        </div>

        {/* ─── Action Buttons ─── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setView('create')} style={{ ...btnStyle(GOLD), flex: 1, color: '#000' }}>
            + New Permit
          </button>
          <button onClick={handleExportList} style={{ ...btnStyle(BORDER) }}>
            Export PDF
          </button>
        </div>

        {/* ─── Permit List ─── */}
        {filteredPermits.length === 0 ? (
          <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
            {permits.length === 0 ? 'No permits found. Add your first permit.' : 'No permits match current filters.'}
          </div>
        ) : (
          filteredPermits.map(p => {
            const days = daysUntil(p.expires_date);
            const expColor = expirationColor(days);
            const isRenewal = !!p.renewal_of;
            return (
              <div key={p.id}
                onClick={() => { setSelectedId(p.id); setView('detail'); }}
                style={{ ...cardStyle, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{p.permit_number}</span>
                      {isRenewal && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${BLUE}22`, color: BLUE, fontWeight: 600 }}>
                          RENEWAL
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{p.permit_type}</div>
                    {p.issuing_authority && (
                      <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{p.issuing_authority}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span style={badgeStyle(STATUS_COLORS[p.status] || DIM)}>{p.status}</span>
                    {p.fee_amount != null && p.fee_amount > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: GOLD }}>{formatCurrency(p.fee_amount)}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, color: DIM }}>Applied</div>
                      <div style={{ fontSize: 12, color: TEXT }}>{formatDate(p.applied_date)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: DIM }}>Issued</div>
                      <div style={{ fontSize: 12, color: TEXT }}>{formatDate(p.issued_date)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: DIM }}>Expires</div>
                      <div style={{ fontSize: 12, color: expColor, fontWeight: 600 }}>{formatDate(p.expires_date)}</div>
                    </div>
                  </div>
                  {days !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: expColor }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: expColor }}>{expirationLabel(days)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── Default Export with Suspense Wrapper ─── */
export default function PermitsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#8BAAC8', fontSize: 16 }}>Loading...</span>
      </div>
    }>
      <PermitsPageInner />
    </Suspense>
  );
}