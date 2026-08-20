'use client';
/**
 * Saguaro Field — Live Crew GPS Dashboard
 * List crew locations, share your own GPS, trade summary. Offline queue.
 */
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { F } from '@/lib/field-tokens';
import { fieldFetch } from '@/lib/field-fetch';
import ErrorBanner from '@/components/field/ErrorBanner';
import EmptyState from '@/components/field/EmptyState';


function hr(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}

interface CrewMember {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  trade: string;
  lat: number;
  lng: number;
  accuracy?: number;
  status: string;
  updated_at: string;
}

type ActivityStatus = 'active' | 'stale' | 'inactive';

function getActivityStatus(updatedAt: string): ActivityStatus {
  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  const diffMin = (now - updated) / 60000;
  if (diffMin < 15) return 'active';
  if (diffMin < 60) return 'stale';
  return 'inactive';
}

const ACTIVITY_CONFIG: Record<ActivityStatus, { color: string; label: string }> = {
  active: { color: F.green, label: 'Active' },
  stale: { color: F.amber, label: 'Stale' },
  inactive: { color: '#8B9DB8', label: 'Inactive' },
};

const glass: React.CSSProperties = {
  background: 'rgba(26,31,46,0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid #30363d',
  borderRadius: 16,
};

function CrewMapPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramProjectId = searchParams.get('projectId') || '';
  const [projectId, setProjectId] = useState(paramProjectId);

  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareInterval, setShareIntervalRef] = useState<ReturnType<typeof setInterval> | null>(null);
  const [lastShared, setLastShared] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState('');

  // Pull to refresh
  const [touchStart, setTouchStart] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('sag_active_project') : null;
    if (!projectId && stored) setProjectId(stored);
  }, [projectId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const fetchCrew = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data, error: fetchErr } = await fieldFetch<{ crew?: CrewMember[]; data?: CrewMember[] }>(
      `/api/field/crew-locations?projectId=${projectId}`
    );
    if (fetchErr) { setError(fetchErr); }
    else if (data) { setCrew(data.crew || data.data || []); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchCrew(); }, [fetchCrew]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => { if (projectId) fetchCrew(); }, 30000);
    return () => clearInterval(id);
  }, [projectId, fetchCrew]);

  const shareLocation = useCallback(async () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return; }
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const payload = {
          projectId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };

        try {
          if (!online) throw new Error('offline');
          await fetch('/api/field/crew-locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch {
          await enqueue({
            url: '/api/field/crew-locations',
            method: 'POST',
            body: JSON.stringify(payload),
            contentType: 'application/json',
            isFormData: false,
          });
        }
        setLastShared(new Date().toLocaleTimeString());
      },
      (err) => { setGpsError(err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [projectId, online]);

  const toggleSharing = () => {
    if (sharing) {
      // Stop sharing
      if (shareInterval) clearInterval(shareInterval);
      setShareIntervalRef(null);
      setSharing(false);
    } else {
      // Start sharing
      setSharing(true);
      shareLocation();
      const id = setInterval(shareLocation, 60000); // every 60s
      setShareIntervalRef(id);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (shareInterval) clearInterval(shareInterval); };
  }, [shareInterval]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCrew();
    setRefreshing(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientY);
  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - touchStart;
    if (diff > 0 && diff < 120) setPullDistance(diff);
  };
  const handleTouchEnd = () => {
    if (pullDistance > 60) handleRefresh();
    setPullDistance(0);
    setTouchStart(0);
  };

  // Trade summary
  const tradeCounts: Record<string, number> = {};
  crew.forEach(c => {
    const trade = c.trade || 'Unassigned';
    tradeCounts[trade] = (tradeCounts[trade] || 0) + 1;
  });

  const activeCrew = crew.filter(c => getActivityStatus(c.updated_at) === 'active');
  const staleCrew = crew.filter(c => getActivityStatus(c.updated_at) === 'stale');
  const inactiveCrew = crew.filter(c => getActivityStatus(c.updated_at) === 'inactive');

  function timeAgo(dt: string): string {
    const diff = (Date.now() - new Date(dt).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div
      style={{ padding: '18px 16px', minHeight: '100%' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullDistance > 10 && (
        <div style={{ textAlign: 'center', padding: '8px 0', color: F.dim, fontSize: 12, opacity: pullDistance > 30 ? 1 : 0.5 }}>
          {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {refreshing && <div style={{ textAlign: 'center', padding: '8px 0', color: F.gold, fontSize: 12 }}>Refreshing...</div>}

      <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: F.dim, fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        Back
      </button>

      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: F.text }}>Crew Locations</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: F.dim }}>
        {crew.length} crew member{crew.length !== 1 ? 's' : ''} &middot; {activeCrew.length} active
      </p>

      {/* Share my location toggle */}
      <div style={{ ...glass, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: F.text }}>{'\u{1F4E1}'} Share My Location</p>
          {sharing && lastShared && (
            <p style={{ margin: '3px 0 0', fontSize: 11, color: F.green }}>Sharing &middot; Last sent: {lastShared}</p>
          )}
          {!sharing && <p style={{ margin: '3px 0 0', fontSize: 11, color: F.dim }}>Updates every 60 seconds when enabled</p>}
        </div>
        <button
          onClick={toggleSharing}
          style={{
            width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: sharing ? F.green : '#E5E7EB',
            position: 'relative', transition: 'background 0.3s',
          }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3,
            left: sharing ? 27 : 3,
            transition: 'left 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }} />
        </button>
      </div>

      {gpsError && (
        <div style={{ ...glass, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: F.red }}>
          GPS Error: {gpsError}
        </div>
      )}

      {/* Trade summary */}
      {Object.keys(tradeCounts).length > 0 && (
        <div style={{ ...glass, padding: '12px 14px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: F.dim, textTransform: 'uppercase', letterSpacing: 0.8 }}>Crew by Trade</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(tradeCounts).sort((a, b) => b[1] - a[1]).map(([trade, count]) => (
              <span key={trade} style={{
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
                borderRadius: 8, padding: '4px 10px', fontSize: 12, color: F.blue, fontWeight: 600,
              }}>
                {trade}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={() => { setError(''); fetchCrew(); }} />}

      {/* Crew list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ ...glass, padding: 16, height: 64, animation: 'pulse 1.5s ease-in-out infinite' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e2a3a' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ background: '#1e2a3a', borderRadius: 6, height: 14, width: '50%', marginBottom: 6 }} />
                  <div style={{ background: '#0d1117', borderRadius: 6, height: 10, width: '30%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : crew.length === 0 ? (
        <EmptyState
          icon="contacts"
          title="No Crew Locations"
          description='Enable "Share My Location" above to start. Other crew members will appear here once they share theirs.'
        />
      ) : (
        <div>
          {/* Active */}
          {activeCrew.length > 0 && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: F.green, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {'\u{1F7E2}'} Active ({activeCrew.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {activeCrew.map(c => (
                  <CrewCard key={c.id} member={c} activity="active" timeAgo={timeAgo} />
                ))}
              </div>
            </>
          )}

          {/* Stale */}
          {staleCrew.length > 0 && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: F.amber, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {'\u{1F7E1}'} Stale ({staleCrew.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {staleCrew.map(c => (
                  <CrewCard key={c.id} member={c} activity="stale" timeAgo={timeAgo} />
                ))}
              </div>
            </>
          )}

          {/* Inactive */}
          {inactiveCrew.length > 0 && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#8B9DB8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {'\u26AA'} Inactive ({inactiveCrew.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {inactiveCrew.map(c => (
                  <CrewCard key={c.id} member={c} activity="inactive" timeAgo={timeAgo} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function CrewCard({ member, activity, timeAgo }: { member: CrewMember; activity: ActivityStatus; timeAgo: (dt: string) => string }) {
  const cfg = ACTIVITY_CONFIG[activity];
  const initials = member.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{
      background: 'rgba(26,31,46,0.7)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid #30363d',
      borderRadius: 16,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: `rgba(${hr(cfg.color)}, 0.15)`,
          border: `2px solid ${cfg.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: cfg.color,
        }}>
          {initials}
        </div>
        <div style={{
          position: 'absolute', bottom: -1, right: -1,
          width: 12, height: 12, borderRadius: '50%',
          background: cfg.color, border: '2px solid rgba(26,31,46,1)',
          boxShadow: `0 0 4px ${cfg.color}`,
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#F0F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8BAAC8' }}>{member.trade || 'Unassigned'}</p>
      </div>

      {/* Time */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#8BAAC8' }}>{timeAgo(member.updated_at)}</p>
      </div>
    </div>
  );
}

export default function FieldCrewMapPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#8BAAC8' }}><div style={{ width: 24, height: 24, border: '3px solid rgba(200,150,15,.2)', borderTopColor: '#C8960F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} /><span>Loading...</span></div>}>
      <CrewMapPage />
    </Suspense>
  );
}
