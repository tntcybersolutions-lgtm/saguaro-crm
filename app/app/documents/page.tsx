'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#3dd68c';

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Badge({ label, color = '#94a3b8', bg = 'rgba(148,163,184,.12)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 4, background: bg, color,
      textTransform: 'uppercase', letterSpacing: 0.3,
    }}>{label}</span>
  );
}

const TABS = ['Pay Applications', 'Lien Waivers', 'Bonds & Forms', 'Payroll', 'Closeout'] as const;
type Tab = typeof TABS[number];

const DEMO_PAY_APPS = [
  { id: 'pa-001', appNo: 1, period: 'Jan 1 – Jan 31, 2026', amount: 192000, status: 'paid' },
  { id: 'pa-002', appNo: 2, period: 'Feb 1 – Feb 28, 2026', amount: 208500, status: 'approved' },
  { id: 'pa-003', appNo: 3, period: 'Mar 1 – Mar 31, 2026', amount: 176250, status: 'draft' },
];

const DEMO_LIEN_WAIVERS = [
  { id: 'lw-001', subName: 'Desert Electrical Contractors', type: 'Conditional Partial', amount: 96000, throughDate: '2026-01-31', status: 'executed' },
  { id: 'lw-002', subName: 'AZ Concrete Solutions', type: 'Unconditional Partial', amount: 72500, throughDate: '2026-01-31', status: 'executed' },
  { id: 'lw-003', subName: 'Southwest Roofing & Sheet Metal', type: 'Conditional Partial', amount: 48750, throughDate: '2026-02-28', status: 'pending' },
  { id: 'lw-004', subName: 'Desert Electrical Contractors', type: 'Conditional Partial', amount: 96000, throughDate: '2026-02-28', status: 'executed' },
];

const DEMO_PAYROLL = [
  { id: 'pr-001', weekEnding: '2026-03-07', employees: 14, totalGross: 28450, status: 'submitted' },
  { id: 'pr-002', weekEnding: '2026-02-28', employees: 12, totalGross: 24800, status: 'submitted' },
  { id: 'pr-003', weekEnding: '2026-02-21', employees: 11, totalGross: 22100, status: 'submitted' },
];

const BOND_CARDS = [
  { code: 'A310', name: 'Bid Bond', desc: 'AIA A310 – Bid bond for proposal phase', icon: '📋' },
  { code: 'A312-P', name: 'Performance Bond', desc: 'AIA A312 – Performance bond for contract execution', icon: '🛡️' },
  { code: 'A312-L', name: 'Labor & Material Bond', desc: 'AIA A312 – Payment bond for labor and materials', icon: '⚒️' },
  { code: 'G704', name: 'Certificate of Substantial Completion', desc: 'AIA G704 – Substantial completion certification', icon: '🏗️' },
  { code: 'G706', name: "Contractor's Affidavit of Payment", desc: "AIA G706 – Contractor's affidavit of release of liens", icon: '📝' },
  { code: 'G707', name: "Consent of Surety", desc: 'AIA G707 – Consent of surety to final payment', icon: '✅' },
];

const CLOSEOUT_CHECKLIST = [
  { label: 'Substantial Completion Inspection', done: true },
  { label: 'Punch List Completed (100%)', done: false },
  { label: 'Certificate of Occupancy', done: false },
  { label: 'As-Built Drawings Submitted', done: true },
  { label: "Owner's Manuals & Warranties", done: false },
  { label: 'Final Lien Waivers (All Subs)', done: false },
  { label: "Contractor's Affidavit (G706)", done: false },
  { label: 'Consent of Surety (G707)', done: false },
  { label: 'Final Pay Application Certified', done: false },
  { label: 'Retainage Released', done: false },
];

const statusConfig: Record<string, { color: string; bg: string }> = {
  paid:      { color: GREEN,   bg: 'rgba(61,214,140,.12)' },
  approved:  { color: '#4a9de8', bg: 'rgba(26,95,168,.12)' },
  draft:     { color: GOLD,    bg: 'rgba(212,160,23,.12)' },
  executed:  { color: GREEN,   bg: 'rgba(61,214,140,.12)' },
  pending:   { color: GOLD,    bg: 'rgba(212,160,23,.12)' },
  submitted: { color: '#4a9de8', bg: 'rgba(26,95,168,.12)' },
};

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Pay Applications');

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Page Header */}
      <div style={{
        padding: '18px 28px', borderBottom: `1px solid ${BORDER}`,
        background: DARK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Documents</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Generated contracts, forms, and compliance documents across all projects</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: `1px solid ${BORDER}`,
        background: '#0a1117', paddingLeft: 24,
        overflowX: 'auto',
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${active ? GOLD : 'transparent'}`,
                color: active ? GOLD : DIM,
                fontSize: 13, fontWeight: active ? 700 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
            >{tab}</button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ padding: 24 }}>

        {/* ── Pay Applications ──────────────────────────────────────── */}
        {activeTab === 'Pay Applications' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Pay Applications (AIA G702 / G703)</div>
              <Link href="/app/projects" style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                borderRadius: 7, color: '#0d1117', fontSize: 13, fontWeight: 800,
                textDecoration: 'none',
              }}>+ Generate New</Link>
            </div>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0a1117' }}>
                    {['Application #', 'Period', 'Amount Due', 'Status', 'Download'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        color: DIM, borderBottom: `1px solid ${BORDER}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_PAY_APPS.map(pa => {
                    const sc = statusConfig[pa.status] || statusConfig.draft;
                    return (
                      <tr key={pa.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                        <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 700 }}>#{pa.appNo.toString().padStart(3, '0')}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{pa.period}</td>
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{fmt(pa.amount)}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={pa.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button style={{
                            background: 'none', border: `1px solid ${BORDER}`,
                            borderRadius: 5, color: GOLD, fontSize: 11,
                            padding: '3px 10px', cursor: 'pointer',
                          }}>📄 G702 PDF</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Lien Waivers ──────────────────────────────────────────── */}
        {activeTab === 'Lien Waivers' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Lien Waivers</div>
              <Link href="/app/projects" style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                borderRadius: 7, color: '#0d1117', fontSize: 13, fontWeight: 800,
                textDecoration: 'none',
              }}>+ Generate New</Link>
            </div>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0a1117' }}>
                    {['Sub Name', 'Type', 'Amount', 'Through Date', 'Status', 'Download'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        color: DIM, borderBottom: `1px solid ${BORDER}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_LIEN_WAIVERS.map(lw => {
                    const sc = statusConfig[lw.status] || statusConfig.pending;
                    return (
                      <tr key={lw.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{lw.subName}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{lw.type}</td>
                        <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(lw.amount)}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{lw.throughDate}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={lw.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button style={{
                            background: 'none', border: `1px solid ${BORDER}`,
                            borderRadius: 5, color: GOLD, fontSize: 11,
                            padding: '3px 10px', cursor: 'pointer',
                          }}>📄 Download</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Bonds & Forms ─────────────────────────────────────────── */}
        {activeTab === 'Bonds & Forms' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>AIA Bonds & Standard Forms</div>
              <button style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                border: 'none', borderRadius: 7,
                color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>+ Generate New</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {BOND_CARDS.map(card => (
                <div key={card.code} style={{
                  background: RAISED, border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: 20,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28 }}>{card.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: TEXT }}>{card.name}</div>
                      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>{card.code}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{card.desc}</div>
                  <button style={{
                    marginTop: 4, padding: '8px 0', width: '100%',
                    background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                    border: 'none', borderRadius: 7,
                    color: '#0d1117', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}>Generate {card.code}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payroll ───────────────────────────────────────────────── */}
        {activeTab === 'Payroll' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Certified Payroll (WH-347)</div>
              <Link href="/app/projects" style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                borderRadius: 7, color: '#0d1117', fontSize: 13, fontWeight: 800,
                textDecoration: 'none',
              }}>+ Generate WH-347</Link>
            </div>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0a1117' }}>
                    {['Week Ending', '# Employees', 'Total Gross', 'Status', 'Download'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        color: DIM, borderBottom: `1px solid ${BORDER}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_PAYROLL.map(pr => {
                    const sc = statusConfig[pr.status] || statusConfig.draft;
                    return (
                      <tr key={pr.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{pr.weekEnding}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{pr.employees}</td>
                        <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(pr.totalGross)}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={pr.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button style={{
                            background: 'none', border: `1px solid ${BORDER}`,
                            borderRadius: 5, color: GOLD, fontSize: 11,
                            padding: '3px 10px', cursor: 'pointer',
                          }}>📄 WH-347</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Closeout ──────────────────────────────────────────────── */}
        {activeTab === 'Closeout' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Closeout Checklist</div>
              <button style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg,${GOLD},#F0C040)`,
                border: 'none', borderRadius: 7,
                color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>+ Export Closeout Package</button>
            </div>

            {/* Progress bar */}
            {(() => {
              const done = CLOSEOUT_CHECKLIST.filter(i => i.done).length;
              const pct = Math.round((done / CLOSEOUT_CHECKLIST.length) * 100);
              return (
                <div style={{
                  background: RAISED, border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: 20, marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Closeout Progress</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{done} / {CLOSEOUT_CHECKLIST.length} items ({pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,.06)', borderRadius: 4 }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg,${GOLD},#F0C040)`,
                      borderRadius: 4, transition: 'width .3s',
                    }} />
                  </div>
                </div>
              );
            })()}

            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              {CLOSEOUT_CHECKLIST.map((item, idx) => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px',
                    borderBottom: idx < CLOSEOUT_CHECKLIST.length - 1 ? `1px solid rgba(38,51,71,.5)` : 'none',
                    background: item.done ? 'rgba(61,214,140,.03)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{item.done ? '✅' : '⬜'}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 500,
                    color: item.done ? TEXT : DIM,
                    textDecoration: item.done ? 'none' : 'none',
                  }}>{item.label}</span>
                  <div style={{ marginLeft: 'auto' }}>
                    <Badge
                      label={item.done ? 'Complete' : 'Pending'}
                      color={item.done ? GREEN : GOLD}
                      bg={item.done ? 'rgba(61,214,140,.12)' : 'rgba(212,160,23,.1)'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
