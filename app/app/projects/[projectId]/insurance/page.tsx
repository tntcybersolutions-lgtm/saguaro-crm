'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#3dd68c';
const RED_COLOR = '#ef4444';
const YELLOW = '#f59e0b';

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const inp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#0d1117',
  border: '1px solid ' + BORDER,
  borderRadius: 7,
  color: TEXT,
  fontSize: 13,
  outline: 'none',
};

interface InsuranceCert {
  id: string;
  subName: string;
  policyType: string;
  carrier: string;
  policyNo: string;
  effectiveDate: string;
  expiryDate: string;
  coverageAmount: number;
  status: 'active' | 'expiring' | 'expired';
  daysUntilExpiry: number;
}

const DEMO_CERTS: InsuranceCert[] = [
  {
    id: 'cert-001',
    subName: 'Desert Electrical Contractors',
    policyType: 'GL',
    carrier: 'Travelers Insurance',
    policyNo: 'GL-2026-84721',
    effectiveDate: '2026-01-01',
    expiryDate: '2027-01-01',
    coverageAmount: 2_000_000,
    status: 'active',
    daysUntilExpiry: 297,
  },
  {
    id: 'cert-002',
    subName: 'Desert Electrical Contractors',
    policyType: 'WC',
    carrier: 'Hartford Financial',
    policyNo: 'WC-2026-33902',
    effectiveDate: '2026-01-01',
    expiryDate: '2027-01-01',
    coverageAmount: 1_000_000,
    status: 'active',
    daysUntilExpiry: 297,
  },
  {
    id: 'cert-003',
    subName: 'AZ Concrete Solutions',
    policyType: 'GL',
    carrier: 'Liberty Mutual',
    policyNo: 'GL-2026-55123',
    effectiveDate: '2025-12-01',
    expiryDate: '2026-03-22',
    coverageAmount: 2_000_000,
    status: 'expiring',
    daysUntilExpiry: 12,
  },
  {
    id: 'cert-004',
    subName: 'Southwest Roofing & Sheet Metal',
    policyType: 'Umbrella',
    carrier: 'Zurich Insurance',
    policyNo: 'UMB-2025-90011',
    effectiveDate: '2025-06-01',
    expiryDate: '2026-02-28',
    coverageAmount: 5_000_000,
    status: 'expired',
    daysUntilExpiry: -10,
  },
];

const POLICY_TYPES = ['GL', 'WC', 'Auto', 'Umbrella', 'E&O', 'Other'];

function statusBadge(status: InsuranceCert['status'], days: number) {
  if (status === 'expired') return { label: 'Expired', color: RED_COLOR, bg: 'rgba(239,68,68,.12)' };
  if (status === 'expiring') return { label: `Expiring in ${days}d`, color: YELLOW, bg: 'rgba(245,158,11,.12)' };
  return { label: 'Active', color: GREEN, bg: 'rgba(61,214,140,.12)' };
}

export default function InsurancePage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [certs, setCerts] = useState<InsuranceCert[]>(DEMO_CERTS);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    subName: '',
    policyType: 'GL',
    carrier: '',
    policyNo: '',
    effectiveDate: '',
    expiryDate: '',
    coverageAmount: '',
  });

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const totalCerts = certs.length;
  const activeCerts = certs.filter(c => c.status === 'active').length;
  const expiringCerts = certs.filter(c => c.status === 'expiring').length;
  const expiredCerts = certs.filter(c => c.status === 'expired').length;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subName || !form.carrier || !form.policyNo || !form.effectiveDate || !form.expiryDate) {
      setError('All fields except coverage amount are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('projectId', pid);
      await fetch('/api/insurance/upload', { method: 'POST', body: fd });

      // Compute days until expiry for optimistic update
      const expiry = new Date(form.expiryDate);
      const today = new Date();
      const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
      const certStatus: InsuranceCert['status'] = days < 0 ? 'expired' : days < 30 ? 'expiring' : 'active';

      const newCert: InsuranceCert = {
        id: 'cert-new-' + Date.now(),
        subName: form.subName,
        policyType: form.policyType,
        carrier: form.carrier,
        policyNo: form.policyNo,
        effectiveDate: form.effectiveDate,
        expiryDate: form.expiryDate,
        coverageAmount: form.coverageAmount ? Number(form.coverageAmount) : 0,
        status: certStatus,
        daysUntilExpiry: days,
      };
      setCerts(prev => [newCert, ...prev]);
      setForm({ subName: '', policyType: 'GL', carrier: '', policyNo: '', effectiveDate: '', expiryDate: '', coverageAmount: '' });
      setShowUploadForm(false);
    } catch {
      setError('Upload failed. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: DARK,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Insurance Certificates</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Track COIs for all subcontractors — expiration alerts included</div>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          style={{
            padding: '8px 18px',
            background: `linear-gradient(135deg,${GOLD},#F0C040)`,
            border: 'none', borderRadius: 7,
            color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}
        >+ Upload Certificate</button>
      </div>

      <div style={{ padding: 24 }}>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Certificates', value: totalCerts, color: TEXT },
            { label: 'Active', value: activeCerts, color: GREEN },
            { label: 'Expiring Soon', value: expiringCerts, color: YELLOW },
            { label: 'Expired', value: expiredCerts, color: RED_COLOR },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '16px 18px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6, letterSpacing: 0.5 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Upload form */}
        {showUploadForm && (
          <div style={{
            background: RAISED, border: '1px solid rgba(212,160,23,.3)',
            borderRadius: 12, padding: 24, marginBottom: 24,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>Upload Insurance Certificate</div>
            {error && (
              <div style={{
                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: RED_COLOR,
              }}>{error}</div>
            )}
            <form onSubmit={handleUpload}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                {[
                  { label: 'Subcontractor Name *', key: 'subName' as const, placeholder: 'Desert Electrical Contractors' },
                  { label: 'Carrier *', key: 'carrier' as const, placeholder: 'Travelers Insurance' },
                  { label: 'Policy Number *', key: 'policyNo' as const, placeholder: 'GL-2026-84721' },
                  { label: 'Effective Date *', key: 'effectiveDate' as const, type: 'date' },
                  { label: 'Expiry Date *', key: 'expiryDate' as const, type: 'date' },
                  { label: 'Coverage Amount ($)', key: 'coverageAmount' as const, placeholder: '2000000', type: 'number' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                      {field.label}
                    </label>
                    <input
                      type={field.type || 'text'}
                      value={form[field.key]}
                      onChange={setF(field.key)}
                      placeholder={field.placeholder}
                      style={inp}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                  Policy Type *
                </label>
                <select value={form.policyType} onChange={setF('policyType')} style={inp}>
                  {POLICY_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                  Certificate PDF / Image
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  style={{ ...inp, cursor: 'pointer' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 24px',
                    background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                    border: 'none', borderRadius: 8,
                    color: '#0d1117', fontSize: 13, fontWeight: 800,
                    cursor: loading ? 'wait' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >{loading ? 'Uploading...' : 'Upload Certificate'}</button>
                <button
                  type="button"
                  onClick={() => { setShowUploadForm(false); setError(''); }}
                  style={{
                    padding: '10px 18px', background: RAISED,
                    border: `1px solid ${BORDER}`, borderRadius: 8,
                    color: DIM, fontSize: 13, cursor: 'pointer',
                  }}
                >Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Certificate table */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Sub Name', 'Policy Type', 'Carrier', 'Policy #', 'Coverage', 'Effective', 'Expiry', 'Days Until Expiry', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    color: DIM, borderBottom: `1px solid ${BORDER}`,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {certs.map(cert => {
                const badge = statusBadge(cert.status, cert.daysUntilExpiry);
                const isExpired = cert.status === 'expired';
                const rowBg = isExpired
                  ? 'rgba(239,68,68,.05)'
                  : cert.status === 'expiring'
                    ? 'rgba(245,158,11,.04)'
                    : 'transparent';
                return (
                  <tr key={cert.id} style={{ background: rowBg, borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                    <td style={{ padding: '11px 14px', color: TEXT, fontWeight: 600 }}>{cert.subName}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px',
                        borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: 'rgba(212,160,23,.1)', color: GOLD,
                        textTransform: 'uppercase',
                      }}>{cert.policyType}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: DIM }}>{cert.carrier}</td>
                    <td style={{ padding: '11px 14px', color: DIM, fontFamily: 'monospace', fontSize: 12 }}>{cert.policyNo}</td>
                    <td style={{ padding: '11px 14px', color: TEXT }}>
                      {cert.coverageAmount > 0 ? fmt(cert.coverageAmount) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', color: DIM }}>{cert.effectiveDate}</td>
                    <td style={{ padding: '11px 14px', color: isExpired ? RED_COLOR : DIM, fontWeight: isExpired ? 700 : 400 }}>
                      {cert.expiryDate}
                    </td>
                    <td style={{ padding: '11px 14px', color: badge.color, fontWeight: 700 }}>
                      {cert.daysUntilExpiry < 0
                        ? `${Math.abs(cert.daysUntilExpiry)}d ago`
                        : `${cert.daysUntilExpiry}d`}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 4, background: badge.bg, color: badge.color,
                        textTransform: 'uppercase', letterSpacing: 0.3,
                        whiteSpace: 'nowrap',
                      }}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {certs.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 8 }}>No certificates uploaded yet</div>
              <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>Upload COIs for all subcontractors to track expiration dates and maintain compliance.</div>
              <button
                onClick={() => setShowUploadForm(true)}
                style={{
                  padding: '10px 22px',
                  background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                  border: 'none', borderRadius: 8,
                  color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                }}
              >Upload First Certificate</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
