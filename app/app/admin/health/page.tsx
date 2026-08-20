'use client';
import React, { useEffect, useState, useCallback } from 'react';

interface Check {
  key: string;
  group: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}
interface Summary { total: number; pass: number; warn: number; fail: number; }
interface Report { runId: string; runAt: string; summary: Summary; checks: Check[]; }

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const RAISED = '#0D1D2E';
const DARK = '#0d1117';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';

function statusColor(s: Check['status']): string {
  return s === 'pass' ? GREEN : s === 'fail' ? RED : AMBER;
}
function statusIcon(s: Check['status']): string {
  return s === 'pass' ? '✓' : s === 'fail' ? '✗' : '!';
}

export default function SystemHealthPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/health');
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error || `HTTP ${r.status}`);
        setReport(null);
        return;
      }
      setReport(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const grouped: Record<string, Check[]> = {};
  for (const c of report?.checks || []) {
    (grouped[c.group] ||= []).push(c);
  }

  const allPass = report && report.summary.fail === 0 && report.summary.warn === 0;
  const overallStatus: Check['status'] =
    !report ? 'warn' : report.summary.fail > 0 ? 'fail' : report.summary.warn > 0 ? 'warn' : 'pass';

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, background: DARK, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🩺</span> System Health
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>
            Live diagnostics for infrastructure, feature routes, and data readiness.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: loading ? 'rgba(200,150,15,0.3)' : GOLD,
            color: '#0d1117',
            fontWeight: 800,
            fontSize: 13,
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Running…' : '⟳ Run Again'}
        </button>
      </div>

      {/* Overall banner */}
      {report && (
        <div
          style={{
            background: `${statusColor(overallStatus)}18`,
            border: `1px solid ${statusColor(overallStatus)}66`,
            borderLeft: `4px solid ${statusColor(overallStatus)}`,
            borderRadius: 10,
            padding: '14px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 32 }}>
            {overallStatus === 'pass' ? '🟢' : overallStatus === 'warn' ? '🟡' : '🔴'}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>
              {allPass
                ? 'All systems operational'
                : overallStatus === 'fail'
                ? `${report.summary.fail} failure${report.summary.fail !== 1 ? 's' : ''} detected`
                : `${report.summary.warn} warning${report.summary.warn !== 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              Last run: {new Date(report.runAt).toLocaleString()} · Run ID: {report.runId.slice(0, 8)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <SummaryChip label="Pass" count={report.summary.pass} color={GREEN} />
            <SummaryChip label="Warn" count={report.summary.warn} color={AMBER} />
            <SummaryChip label="Fail" count={report.summary.fail} color={RED} />
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,.1)',
            border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 8,
            padding: '12px 16px',
            color: RED,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          Error: {error}
        </div>
      )}

      {loading && !report && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: DIM }}>Running health checks…</div>
      )}

      {/* Grouped check tables */}
      {Object.keys(grouped).map(group => (
        <div key={group} style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: GOLD,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              marginBottom: 8,
              padding: '0 4px',
            }}
          >
            {group}
          </div>
          <div
            style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {grouped[group].map((c, i) => (
              <div
                key={c.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 140px 80px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
                }}
              >
                <div
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: `${statusColor(c.status)}22`,
                    color: statusColor(c.status),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 12,
                  }}
                >
                  {statusIcon(c.status)}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{c.detail}</div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: statusColor(c.status),
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {c.status}
                </div>
                <div style={{ fontSize: 11, color: DIM, textAlign: 'right' }}>
                  {c.latencyMs != null ? `${c.latencyMs}ms` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      style={{
        background: `${color}18`,
        border: `1px solid ${color}55`,
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        color,
        minWidth: 60,
        textAlign: 'center',
      }}
    >
      {label} {count}
    </div>
  );
}
