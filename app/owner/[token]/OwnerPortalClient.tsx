'use client';
import { useState, useEffect } from 'react';

const PRIMARY = '#1a1a2e';
const ACCENT = '#C8960F';
const LIGHT_BG = '#f8f9fa';
const CARD_BG = '#ffffff';
const BORDER = '#e2e5ea';
const TEXT_PRIMARY = '#1a1a2e';
const TEXT_SECONDARY = '#666';
const GREEN = '#16a34a';
const RED = '#dc2626';
const BLUE = '#2563eb';

interface PortalData {
  project: {
    name: string;
    address: string;
    status: string;
    start_date: string;
    end_date: string;
  };
  owner: { name: string; company: string };
  healthScore: number;
  schedule: { progress: number; total: number; completed: number };
  budget: { contractValue: number; billedPct: number; paidPct: number; totalBilled: number; totalPaid: number };
  photos: { id: string; photo_url: string; caption: string; created_at: string }[];
  payApps: { id: string; number: string; period: string; amount: number; status: string }[];
  recentActivity: { date: string; summary: string; weather: string }[];
  punchSummary: { total: number; closed: number; open: number };
}

/* Animated health circle */
function HealthCircle({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 200);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = score >= 80 ? GREEN : score >= 60 ? '#f59e0b' : RED;

  return (
    <div style={{ position: 'relative', width: 150, height: 150 }}>
      <svg width={150} height={150} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={75} cy={75} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <circle cx={75} cy={75} r={radius} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1.2s ease-out' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: TEXT_PRIMARY }}>{animated}</span>
        <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>Health Score</span>
      </div>
    </div>
  );
}

/* Progress bar */
function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 200); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4 }}>
        <div style={{ height: '100%', borderRadius: 4, background: color, width: `${w}%`, transition: 'width 1s ease-out' }} />
      </div>
    </div>
  );
}

export default function OwnerPortalClient({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/owner-portal/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load portal'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: LIGHT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: TEXT_SECONDARY, fontSize: 14 }}>Loading your project portal...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: LIGHT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h1 style={{ fontSize: 24, color: RED, marginBottom: 8 }}>Error</h1>
          <p style={{ color: TEXT_SECONDARY }}>{error || 'Unable to load portal data'}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: LIGHT_BG }}>
      {/* Header */}
      <header style={{ background: PRIMARY, padding: '20px 0', borderBottom: `3px solid ${ACCENT}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, background: `linear-gradient(135deg,${ACCENT},#F0C040)`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff' }}>S</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{data.project.name}</span>
            </div>
            <p style={{ fontSize: 13, color: '#aab' }}>{data.project.address || 'Project Portal'}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{data.owner.name}</p>
            <p style={{ fontSize: 12, color: '#aab' }}>{data.owner.company}</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        {/* Health Score + Schedule */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, marginBottom: 24 }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <HealthCircle score={data.healthScore} />
            <div style={{ marginTop: 12, fontSize: 11, color: TEXT_SECONDARY, textAlign: 'center' }}>
              Overall project health based on schedule, budget, and quality metrics
            </div>
          </div>

          {/* Schedule Progress */}
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Schedule Progress</h2>
            <ProgressBar value={data.schedule.progress} color={BLUE} label="Overall Progress" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
              <div style={{ textAlign: 'center', padding: 12, background: LIGHT_BG, borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: TEXT_PRIMARY }}>{data.schedule.total}</div>
                <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>Total Tasks</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, background: LIGHT_BG, borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: GREEN }}>{data.schedule.completed}</div>
                <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>Completed</div>
              </div>
              <div style={{ textAlign: 'center', padding: 12, background: LIGHT_BG, borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: BLUE }}>{data.schedule.total - data.schedule.completed}</div>
                <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>Remaining</div>
              </div>
            </div>
          </div>
        </div>

        {/* Budget Section */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Budget Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Contract Value</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRIMARY }}>${data.budget.contractValue.toLocaleString()}</div>
            </div>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Billed to Date</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>${data.budget.totalBilled.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{data.budget.billedPct}% of contract</div>
            </div>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Paid to Date</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>${data.budget.totalPaid.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{data.budget.paidPct}% of contract</div>
            </div>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Remaining</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: BLUE }}>
                ${(data.budget.contractValue - data.budget.totalBilled).toLocaleString()}
              </div>
            </div>
          </div>
          {/* Billing progress bar */}
          <div style={{ marginTop: 16 }}>
            <div style={{ height: 12, background: '#e5e7eb', borderRadius: 6, display: 'flex', overflow: 'hidden' }}>
              <div style={{ width: `${data.budget.paidPct}%`, background: GREEN, transition: 'width 1s' }} />
              <div style={{ width: `${Math.max(0, data.budget.billedPct - data.budget.paidPct)}%`, background: ACCENT, transition: 'width 1s' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: GREEN }}>Paid</span>
              <span style={{ fontSize: 11, color: ACCENT }}>Billed (unpaid)</span>
              <span style={{ fontSize: 11, color: '#ccc' }}>Remaining</span>
            </div>
          </div>
        </div>

        {/* Recent Activity + Pay Apps side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          {/* Recent Activity */}
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Recent Activity</h2>
            {data.recentActivity.length === 0 ? (
              <p style={{ color: TEXT_SECONDARY, fontSize: 13 }}>No recent activity</p>
            ) : (
              data.recentActivity.map((a, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < data.recentActivity.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>{a.summary}</span>
                    <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>{a.date ? new Date(a.date).toLocaleDateString() : ''}</span>
                  </div>
                  {a.weather && <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>Weather: {a.weather}</span>}
                </div>
              ))
            )}
          </div>

          {/* Pay App Status */}
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Pay Applications</h2>
            {data.payApps.length === 0 ? (
              <p style={{ color: TEXT_SECONDARY, fontSize: 13 }}>No pay applications yet</p>
            ) : (
              data.payApps.map((pa, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < data.payApps.length - 1 ? `1px solid ${BORDER}` : 'none', gap: 12 }}>
                  <div style={{ width: 36, height: 36, background: LIGHT_BG, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: TEXT_PRIMARY }}>
                    #{pa.number}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>${(pa.amount || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>{pa.period ? new Date(pa.period).toLocaleDateString() : ''}</div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: '3px 10px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase',
                    background: pa.status === 'paid' ? `${GREEN}15` : pa.status === 'submitted' ? `${ACCENT}15` : '#f3f4f6',
                    color: pa.status === 'paid' ? GREEN : pa.status === 'submitted' ? ACCENT : TEXT_SECONDARY,
                  }}>
                    {pa.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Photo Gallery */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Project Photos</h2>
          {data.photos.length === 0 ? (
            <p style={{ color: TEXT_SECONDARY, fontSize: 13 }}>No photos yet</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {data.photos.map(photo => (
                <div key={photo.id} style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', background: '#eee' }}>
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || 'Project photo'}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {photo.caption && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 8px' }}>
                      <span style={{ fontSize: 10, color: '#fff' }}>{photo.caption}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Punch List Summary */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Punch List Status</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: TEXT_PRIMARY }}>{data.punchSummary.total}</div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>Total Items</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: GREEN }}>{data.punchSummary.closed}</div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>Closed</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: data.punchSummary.open > 0 ? RED : GREEN }}>{data.punchSummary.open}</div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>Open</div>
            </div>
          </div>
          {data.punchSummary.total > 0 && (
            <div style={{ marginTop: 16 }}>
              <ProgressBar
                value={data.punchSummary.total > 0 ? Math.round((data.punchSummary.closed / data.punchSummary.total) * 100) : 0}
                color={GREEN}
                label="Punch Completion"
              />
            </div>
          )}
        </div>

        {/* Project Dates */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 16px' }}>Project Timeline</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Start Date</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>
                {data.project.start_date ? new Date(data.project.start_date).toLocaleDateString() : 'TBD'}
              </div>
            </div>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Target Completion</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>
                {data.project.end_date ? new Date(data.project.end_date).toLocaleDateString() : 'TBD'}
              </div>
            </div>
            <div style={{ padding: 16, background: LIGHT_BG, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>Status</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: data.project.status === 'active' ? GREEN : ACCENT }}>
                {(data.project.status || 'Active').charAt(0).toUpperCase() + (data.project.status || 'active').slice(1)}
              </div>
            </div>
          </div>
          {data.project.start_date && data.project.end_date && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, position: 'relative' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: BLUE,
                  width: `${Math.min(100, Math.max(0, (Date.now() - new Date(data.project.start_date).getTime()) / (new Date(data.project.end_date).getTime() - new Date(data.project.start_date).getTime()) * 100))}%`,
                  transition: 'width 1s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: TEXT_SECONDARY }}>Start</span>
                <span style={{ fontSize: 10, color: TEXT_SECONDARY }}>Complete</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{ textAlign: 'center', padding: '20px 0', borderTop: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 12, color: TEXT_SECONDARY }}>
            Powered by <strong style={{ color: ACCENT }}>Saguaro CRM</strong> — Construction Management Platform
          </p>
        </footer>
      </main>
    </div>
  );
}
