'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEMO_PROJECT, DEMO_PAY_APPS, DEMO_RFIS, DEMO_AUTOPILOT_ALERTS, DEMO_SUBS } from '../../demo-data';

const GOLD = '#D4A017'; const DARK = '#0d1117'; const RAISED = '#1f2c3e';
const BORDER = '#263347'; const DIM = '#8fa3c0'; const TEXT = '#e8edf8';
const GREEN = '#1a8a4a'; const RED = '#c03030'; const BLUE = '#1a5fa8';

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: DIM, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? TEXT, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const proj = DEMO_PROJECT;
  const alerts = DEMO_AUTOPILOT_ALERTS;

  const formatCurrency = (n: number) => '$' + n.toLocaleString();

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Portfolio Overview</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '4px 0', color: TEXT }}>Good morning, Chad 👋</h1>
          <div style={{ fontSize: 14, color: DIM }}>Here's what needs your attention today.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/app/projects/new" style={{ padding: '10px 18px', background: GOLD, color: '#0d1117', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            + New Project
          </Link>
          <Link href="/app/bids/score" style={{ padding: '10px 18px', background: 'rgba(212,160,23,.12)', color: GOLD, border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            🎯 Score a Bid
          </Link>
        </div>
      </div>

      {/* Autopilot Alerts */}
      {alerts.length > 0 && (
        <div style={{ background: 'rgba(192,48,48,.08)', border: '1px solid rgba(192,48,48,.25)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>🤖</span>
            <span style={{ fontWeight: 800, color: TEXT, fontSize: 14 }}>Autopilot — {alerts.length} Alert{alerts.length > 1 ? 's' : ''} Need Attention</span>
            <Link href="/app/autopilot" style={{ marginLeft: 'auto', fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 700 }}>View All →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.slice(0, 3).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(0,0,0,.2)', borderRadius: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: a.severity === 'critical' ? '#c03030' : a.severity === 'high' ? '#B85C2A' : '#856d00', color: '#fff', textTransform: 'uppercase' }}>
                  {a.severity}
                </span>
                <span style={{ fontSize: 13, color: TEXT, flex: 1 }}>{a.title}</span>
                <span style={{ fontSize: 12, color: DIM, maxWidth: 300 }}>{a.summary.slice(0, 60)}…</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        <KPI label="Active Projects"    value="1"                          sub="1 in progress"     color={GOLD} />
        <KPI label="Total Contract Value" value={formatCurrency(2_850_000)} sub="+$45K change orders" />
        <KPI label="Billed to Date"     value={formatCurrency(428_500)}    sub="14.8% complete" />
        <KPI label="Open RFIs"          value="2"                          sub="1 urgent — blocking" color={RED} />
        <KPI label="Win Rate (30 days)" value="67%"                        sub="5 of 7 bids"     color={GREEN} />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Active Projects */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Active Projects</span>
            <Link href="/app/projects" style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>All Projects →</Link>
          </div>
          <div style={{ padding: 16 }}>
            <Link href={`/app/projects/${DEMO_PROJECT.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div style={{ padding: '14px 16px', background: '#0d1117', borderRadius: 8, border: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'border-color .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 2 }}>{proj.name}</div>
                    <div style={{ fontSize: 12, color: DIM }}>{proj.address}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: 'rgba(26,138,74,.15)', color: '#3dd68c', border: '1px solid rgba(26,138,74,.3)', height: 'fit-content' }}>ACTIVE</span>
                </div>
                {/* Progress bar */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DIM, marginBottom: 4 }}>
                    <span>Progress</span><span>14.8% — {formatCurrency(428_500)} billed</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: '14.8%', background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 3 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span style={{ color: DIM }}>Contract: <strong style={{ color: TEXT }}>{formatCurrency(proj.contract_amount)}</strong></span>
                  <span style={{ color: DIM }}>Start: <strong style={{ color: TEXT }}>Jan 15, 2026</strong></span>
                  <span style={{ color: DIM }}>Sub: <strong style={{ color: TEXT }}>Sep 30, 2026</strong></span>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent RFIs */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Open RFIs</span>
            <Link href={`/app/projects/${DEMO_PROJECT.id}/rfis`} style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>View All →</Link>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0d1117' }}>
                {['RFI #','Title','Status','Due'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: DIM, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_RFIS.filter(r => r.status !== 'closed').map(rfi => (
                <tr key={rfi.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                  <td style={{ padding: '10px 12px', color: GOLD, fontWeight: 700 }}>{rfi.number}</td>
                  <td style={{ padding: '10px 12px', color: TEXT, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rfi.title}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: rfi.status === 'open' ? 'rgba(212,160,23,.15)' : 'rgba(26,95,168,.15)', color: rfi.status === 'open' ? GOLD : '#4a9de8' }}>
                      {rfi.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: rfi.response_due_date && new Date(rfi.response_due_date) < new Date() ? RED : DIM }}>
                    {rfi.response_due_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subcontractor Compliance */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Subcontractor Compliance</span>
          <span style={{ fontSize: 12, color: DIM }}>6 subs on active project</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0d1117' }}>
              {['Subcontractor','Trade','Contract Value','COI','W-9','Status'].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: DIM, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_SUBS.map(sub => (
              <tr key={sub.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: TEXT }}>{sub.name}</td>
                <td style={{ padding: '10px 14px', color: DIM }}>{sub.trade}</td>
                <td style={{ padding: '10px 14px', color: TEXT }}>${sub.contract_amount.toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}><span style={{ color: '#3dd68c' }}>✓ Active</span></td>
                <td style={{ padding: '10px 14px' }}><span style={{ color: '#3dd68c' }}>✓ On file</span></td>
                <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(26,138,74,.15)', color: '#3dd68c', fontWeight: 700 }}>COMPLIANT</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
