'use client';
import React, { useEffect, useState } from 'react';

const GOLD = '#C8960F';
const BASE = '#0d1117';
const CARD = '#161b22';
const BORDER = '#30363d';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  expires_at: string | null;
  owner_email: string | null;
  created_at: string;
}

interface Sub {
  tenant_id: string;
  plan_id: string;
  status: string;
  billing_interval: string;
  created_at: string;
}

interface Stats {
  total_tenants: number;
  trial_count: number;
  expired_trials: number;
  active_subscriptions: number;
  canceled_count: number;
  past_due_count: number;
  mrr: number;
}

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    trial: { bg: 'rgba(245,158,11,.12)', fg: AMBER },
    silver: { bg: 'rgba(148,163,184,.12)', fg: '#94A3B8' },
    gold: { bg: 'rgba(200,150,15,.12)', fg: GOLD },
    platinum: { bg: 'rgba(226,232,240,.12)', fg: '#E2E8F0' },
    canceled: { bg: 'rgba(239,68,68,.12)', fg: RED },
    enterprise: { bg: 'rgba(59,130,246,.12)', fg: '#3B82F6' },
  };
  const c = colors[plan] || colors.trial;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 5, background: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {plan}
    </span>
  );
}

export default function AdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [extending, setExtending] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('30');
  const [extendResult, setExtendResult] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => {
        if (r.status === 403) throw new Error('Access denied. Admin only.');
        if (!r.ok) throw new Error('Failed to load admin data');
        return r.json();
      })
      .then(d => {
        setTenants(d.tenants || []);
        setSubs(d.subscriptions || []);
        setStats(d.stats || null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleExtend(tenantId: string) {
    setExtendResult('');
    const days = parseInt(extendDays);
    if (!days || days < 1) { setExtendResult('Invalid days'); return; }
    try {
      const res = await fetch('/api/admin/extend-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, days }),
      });
      const data = await res.json();
      if (!res.ok) { setExtendResult(data.error || 'Failed'); return; }
      setExtendResult(`Extended ${days} days. New expiry: ${fmt(data.new_trial_ends_at)}`);
      setExtending(null);
      // Refresh data
      const refresh = await fetch('/api/admin/stats').then(r => r.json());
      setTenants(refresh.tenants || []);
      setStats(refresh.stats || null);
    } catch (e: unknown) {
      setExtendResult(e instanceof Error ? e.message : 'Failed');
    }
  }

  const subMap = new Map(subs.map(s => [s.tenant_id, s]));

  if (loading) return (
    <div style={{ padding: 40, color: DIM, textAlign: 'center' }}>Loading admin data...</div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <div style={{ color: RED, fontSize: 16, fontWeight: 700 }}>{error}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: TEXT, margin: '0 0 4px' }}>Admin Dashboard</h1>
        <p style={{ color: DIM, fontSize: 14, margin: 0 }}>Super-admin overview — tenant management, revenue, and trials.</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Tenants', value: stats.total_tenants, color: TEXT },
            { label: 'Active Trials', value: stats.trial_count, color: AMBER },
            { label: 'Expired Trials', value: stats.expired_trials, color: RED },
            { label: 'Active Subs', value: stats.active_subscriptions, color: GREEN },
            { label: 'Past Due', value: stats.past_due_count, color: RED },
            { label: 'MRR', value: `$${stats.mrr.toLocaleString()}`, color: GREEN },
          ].map(s => (
            <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 20px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Extend result */}
      {extendResult && (
        <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: GREEN, fontSize: 13 }}>
          {extendResult}
        </div>
      )}

      {/* Tenant table */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: TEXT, margin: 0 }}>All Tenants ({tenants.length})</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.02)' }}>
                {['Company', 'Email', 'Plan', 'Trial Expires', 'Subscription', 'Signed Up', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: DIM, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => {
                const sub = subMap.get(t.id);
                const expired = t.plan === 'trial' && isExpired(t.trial_ends_at || t.expires_at);
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{t.name}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{t.owner_email || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><PlanBadge plan={t.plan || 'trial'} /></td>
                    <td style={{ padding: '10px 14px', color: expired ? RED : DIM, fontWeight: expired ? 700 : 400 }}>
                      {t.plan === 'trial' ? fmt(t.trial_ends_at || t.expires_at) : '—'}
                      {expired && <span style={{ marginLeft: 6, fontSize: 10, color: RED }}>EXPIRED</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: DIM }}>
                      {sub ? (
                        <span style={{ color: sub.status === 'active' ? GREEN : sub.status === 'past_due' ? RED : DIM }}>
                          {sub.status} ({sub.plan_id}, {sub.billing_interval})
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{fmt(t.created_at)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {t.plan === 'trial' && (
                        extending === t.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="number"
                              value={extendDays}
                              onChange={e => setExtendDays(e.target.value)}
                              style={{ width: 60, padding: '4px 8px', background: BASE, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12 }}
                              min={1}
                              max={365}
                            />
                            <button onClick={() => handleExtend(t.id)} style={{ padding: '4px 10px', background: GREEN, border: 'none', borderRadius: 4, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              +{extendDays}d
                            </button>
                            <button onClick={() => setExtending(null)} style={{ padding: '4px 8px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: DIM, fontSize: 11, cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setExtending(t.id); setExtendDays('30'); setExtendResult(''); }} style={{ padding: '4px 12px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 4, color: AMBER, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Extend Trial
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
