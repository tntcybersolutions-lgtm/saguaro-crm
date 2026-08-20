'use client';
/**
 * Saguaro Field — Smart Escalation Dashboard
 * Fetches and displays overdue RFIs, COs, submittals with severity tracking.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { F } from '@/lib/field-tokens';
import { fieldFetch } from '@/lib/field-fetch';
import ErrorBanner from '@/components/field/ErrorBanner';


interface Escalation {
  id: string;
  item_type: string;
  item_id: string;
  item_title: string;
  days_overdue: number;
  severity: 'high' | 'medium' | 'low';
  escalated_to: string;
  created_at: string;
  resolved: boolean;
  resolved_at?: string;
}

interface EscalationSummary {
  total_open: number;
  high_severity: number;
  avg_days_overdue: number;
}

function severityColor(severity: string): string {
  if (severity === 'high') return F.red;
  if (severity === 'medium') return F.gold;
  return F.blue;
}

function severityBg(severity: string): string {
  if (severity === 'high') return 'rgba(239,68,68,0.12)';
  if (severity === 'medium') return 'rgba(212,160,23,0.12)';
  return 'rgba(59,130,246,0.12)';
}

function itemTypeLabel(type: string): string {
  const map: Record<string, string> = {
    rfi: 'RFI',
    change_order: 'Change Order',
    submittal: 'Submittal',
    punch: 'Punch Item',
    inspection: 'Inspection',
  };
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function itemTypeRoute(type: string): string {
  const map: Record<string, string> = {
    rfi: '/field/rfis',
    change_order: '/field/change-orders',
    submittal: '/field/submittals',
    punch: '/field/punch',
    inspection: '/field/inspect',
  };
  return map[type] || '/field';
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="field-page-enter" style={{
      background: F.raised,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${F.border}`,
      borderRadius: 16,
      padding: '20px 24px',
      flex: '1 1 0',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: F.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

export default function EscalationDashboard() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [summary, setSummary] = useState<EscalationSummary>({ total_open: 0, high_severity: 0, avg_days_overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showResolved, setShowResolved] = useState(false);

  const fetchEscalations = useCallback(async () => {
    const { data, error: err } = await fieldFetch<{ escalations: Escalation[]; summary: EscalationSummary }>('/api/ai/escalation-check');
    if (err) { setError(err); }
    else if (data) {
      setEscalations(data.escalations || []);
      setSummary(data.summary || { total_open: 0, high_severity: 0, avg_days_overdue: 0 });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEscalations(); }, [fetchEscalations]);

  const runCheck = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/ai/escalation-check', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setEscalations(data.escalations || []);
        setSummary(data.summary || { total_open: 0, high_severity: 0, avg_days_overdue: 0 });
      }
    } catch {
      // silent
    } finally {
      setRunning(false);
    }
  };

  const resolveEscalation = async (id: string) => {
    try {
      const res = await fetch('/api/ai/escalation-check', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved: true }),
      });
      if (res.ok) {
        setEscalations(prev =>
          prev.map(e => e.id === id ? { ...e, resolved: true, resolved_at: new Date().toISOString() } : e)
        );
        setSummary(prev => ({
          ...prev,
          total_open: Math.max(0, prev.total_open - 1),
        }));
      }
    } catch {
      // silent
    }
  };

  const filtered = escalations.filter(e => {
    if (!showResolved && e.resolved) return false;
    if (filter !== 'all' && e.severity !== filter) return false;
    return true;
  });

  return (
    <div style={{ background: F.dark, minHeight: '100dvh', color: F.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${F.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: F.text }}>Smart Escalation Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: F.dim }}>Overdue RFIs, change orders, and submittals auto-detected</p>
        </div>
        <button
          onClick={runCheck}
          disabled={running}
          style={{
            background: running ? 'rgba(212,160,23,0.3)' : F.gold,
            color: running ? F.dim : '#000',
            border: 'none',
            borderRadius: 10,
            padding: '10px 22px',
            fontSize: 14,
            fontWeight: 700,
            cursor: running ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {running ? (
            <>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Running Check...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Run Escalation Check
            </>
          )}
        </button>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {error && <div style={{ marginBottom: 16 }}><ErrorBanner message={error} onRetry={() => { setError(''); setLoading(true); fetchEscalations(); }} /></div>}

        {/* Summary Stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard label="Total Open" value={summary.total_open} color={F.text} />
          <StatCard label="High Severity" value={summary.high_severity} color={F.red} />
          <StatCard label="Avg Days Overdue" value={summary.avg_days_overdue > 0 ? summary.avg_days_overdue.toFixed(1) : '0'} color={F.gold} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['all', 'high', 'medium', 'low'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? (f === 'all' ? '#E5E7EB' : severityBg(f)) : 'transparent',
                color: filter === f ? (f === 'all' ? F.text : severityColor(f)) : F.dim,
                border: `1px solid ${filter === f ? (f === 'all' ? '#D1D5DB' : severityColor(f) + '40') : '#30363d'}`,
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: F.dim, marginLeft: 'auto', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={e => setShowResolved(e.target.checked)}
              style={{ accentColor: F.gold }}
            />
            Show Resolved
          </label>
        </div>

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: F.dim }}>
            <div style={{ width: 32, height: 32, border: '3px solid #E5E7EB', borderTopColor: F.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            Loading escalations...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            background: F.raised,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${F.border}`,
            borderRadius: 16,
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={F.green} strokeWidth="1.5" style={{ marginBottom: 12 }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ fontSize: 16, fontWeight: 700, color: F.green, marginBottom: 4 }}>All Clear</div>
            <div style={{ fontSize: 13, color: F.dim }}>No escalations found. Run a check to scan for overdue items.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(esc => (
              <div
                key={esc.id}
                style={{
                  background: F.raised,
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: `1px solid ${F.border}`,
                  borderRadius: 16,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  opacity: esc.resolved ? 0.5 : 1,
                  flexWrap: 'wrap',
                }}
              >
                {/* Severity indicator */}
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: severityBg(esc.severity),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={severityColor(esc.severity)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {esc.severity === 'high' ? (
                      <>
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </>
                    ) : esc.severity === 'medium' ? (
                      <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                    ) : (
                      <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>
                    )}
                  </svg>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(59,130,246,0.12)',
                      color: F.blue,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                    }}>
                      {itemTypeLabel(esc.item_type)}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: severityBg(esc.severity),
                      color: severityColor(esc.severity),
                      textTransform: 'uppercase',
                    }}>
                      {esc.severity}
                    </span>
                    {esc.resolved && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(34,197,94,0.12)',
                        color: F.green,
                        textTransform: 'uppercase',
                      }}>
                        Resolved
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: F.text, marginBottom: 2 }}>{esc.item_title}</div>
                  <div style={{ fontSize: 12, color: F.dim }}>
                    <span style={{ color: F.red, fontWeight: 600 }}>{esc.days_overdue} days overdue</span>
                    {esc.escalated_to && <> &middot; Escalated to <span style={{ color: F.gold }}>{esc.escalated_to}</span></>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a
                    href={`${itemTypeRoute(esc.item_type)}?id=${esc.item_id}`}
                    style={{
                      background: 'rgba(59,130,246,0.12)',
                      color: F.blue,
                      border: `1px solid rgba(59,130,246,0.25)`,
                      borderRadius: 8,
                      padding: '7px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    View Item
                  </a>
                  {!esc.resolved && (
                    <button
                      onClick={() => resolveEscalation(esc.id)}
                      style={{
                        background: 'rgba(34,197,94,0.12)',
                        color: F.green,
                        border: `1px solid rgba(34,197,94,0.25)`,
                        borderRadius: 8,
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
