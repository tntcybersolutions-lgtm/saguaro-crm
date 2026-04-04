'use client';
/**
 * Saguaro Field — Gamification Leaderboard
 * Tabs for Safety Streak, Punch Closure, Photo Score, On-Time.
 * Ranked lists, medals, trend arrows, user highlight, badges with confetti.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const BASE   = '#F8F9FB';
const CARD   = '#F8F9FB';
const GOLD   = '#C8960F';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BORDER = '#2A3144';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';

interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  rank: number;
  trend: 'up' | 'down' | 'same';
  avatar_url?: string;
  is_current_user?: boolean;
}

interface Badge {
  id: string;
  icon: string;
  name: string;
  description: string;
  earned_date: string;
}

type TabKey = 'safety_streak' | 'punch_closure' | 'photo_score' | 'on_time';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'safety_streak', label: 'Safety', icon: '\uD83D\uDEE1\uFE0F' },
  { key: 'punch_closure', label: 'Punch', icon: '\u2705' },
  { key: 'photo_score', label: 'Photos', icon: '\uD83D\uDCF7' },
  { key: 'on_time', label: 'On-Time', icon: '\u23F0' },
];

function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: `${CARD}cc`,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 16,
    ...extra,
  };
}

function getMedalColor(rank: number): string | null {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
}

function getMedalEmoji(rank: number): string {
  if (rank === 1) return '\uD83E\uDD47';
  if (rank === 2) return '\uD83E\uDD48';
  if (rank === 3) return '\uD83E\uDD49';
  return '';
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'same' }) {
  if (trend === 'up') return <span style={{ color: GREEN, fontSize: 14, fontWeight: 800 }}>{'\u2191'}</span>;
  if (trend === 'down') return <span style={{ color: RED, fontSize: 14, fontWeight: 800 }}>{'\u2193'}</span>;
  return <span style={{ color: DIM, fontSize: 12 }}>{'\u2014'}</span>;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Confetti Animation (CSS-only) ─────────────────────────────── */
function ConfettiOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const colors = [GOLD, GREEN, '#3B82F6', RED, '#8B5CF6', '#F97316'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    dur: 1.5 + Math.random() * 1.5,
    size: 4 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    drift: -30 + Math.random() * 60,
  }));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-20px) translateX(0px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: -10,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.5,
            background: p.color,
            borderRadius: p.size > 7 ? 2 : '50%',
            animation: `confettiFall ${p.dur}s ease-in ${p.delay}s forwards`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────── */
export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('safety_streak');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiShownRef = useRef(false);

  const userId = typeof window !== 'undefined' ? localStorage.getItem('saguaro_user_id') || '' : '';
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('saguaro_tenant_id') || '' : '';

  const fetchLeaderboard = useCallback(async (category: TabKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gamification/leaderboard?category=${category}&tenantId=${tenantId}&userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : data.entries || []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [tenantId, userId]);

  const fetchBadges = useCallback(async () => {
    setLoadingBadges(true);
    try {
      const res = await fetch(`/api/gamification/badges?userId=${userId}&tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        const badgeList = Array.isArray(data) ? data : data.badges || [];
        setBadges(badgeList);
        // Confetti on first badge view
        if (badgeList.length > 0 && !confettiShownRef.current) {
          confettiShownRef.current = true;
          setShowConfetti(true);
        }
      }
    } catch { /* ignore */ } finally { setLoadingBadges(false); }
  }, [userId, tenantId]);

  useEffect(() => { fetchLeaderboard(activeTab); }, [activeTab, fetchLeaderboard]);
  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  return (
    <div style={{ minHeight: '100vh', background: BASE, padding: '16px 16px 100px' }}>
      {showConfetti && <ConfettiOverlay onDone={() => setShowConfetti(false)} />}

      {/* Header */}
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT }}>Leaderboard</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Team rankings & achievements</p>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 20,
        background: `${CARD}88`,
        borderRadius: 12,
        padding: 4,
        border: `1px solid ${BORDER}`,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === tab.key ? `${GOLD}22` : 'transparent',
              color: activeTab === tab.key ? GOLD : DIM,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Top 3 Podium */}
      {!loading && entries.length >= 3 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 20, padding: '0 8px' }}>
          {/* 2nd place */}
          <PodiumSpot entry={entries.find((e) => e.rank === 2) || entries[1]} height={70} />
          {/* 1st place */}
          <PodiumSpot entry={entries.find((e) => e.rank === 1) || entries[0]} height={90} />
          {/* 3rd place */}
          <PodiumSpot entry={entries.find((e) => e.rank === 3) || entries[2]} height={55} />
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ ...glassCard({ padding: '12px 14px' }), opacity: 0.5, height: 48 }}>
              <div style={{ width: `${30 + Math.random() * 30}%`, height: 12, background: `${DIM}22`, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {/* Ranked List */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.length === 0 && (
            <div style={{ ...glassCard(), textAlign: 'center', padding: 30 }}>
              <p style={{ color: DIM, fontSize: 13, margin: 0 }}>No rankings available yet.</p>
            </div>
          )}
          {entries.map((entry) => {
            const medal = getMedalColor(entry.rank);
            return (
              <div
                key={entry.id}
                style={{
                  ...glassCard({
                    padding: '10px 14px',
                    borderColor: entry.is_current_user ? `${GOLD}55` : BORDER,
                    background: entry.is_current_user ? `${GOLD}10` : `${CARD}cc`,
                  }),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {/* Rank */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: medal ? `${medal}22` : `${DIM}15`,
                  border: `1px solid ${medal || DIM}33`,
                  flexShrink: 0,
                }}>
                  {medal ? (
                    <span style={{ fontSize: 14 }}>{getMedalEmoji(entry.rank)}</span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: DIM }}>{entry.rank}</span>
                  )}
                </div>

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: entry.is_current_user ? 800 : 600,
                    color: entry.is_current_user ? GOLD : TEXT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {entry.name}
                    {entry.is_current_user && <span style={{ fontSize: 10, marginLeft: 6, color: `${GOLD}88` }}>(You)</span>}
                  </div>
                </div>

                {/* Score */}
                <span style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: medal || TEXT,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {entry.score}
                </span>

                {/* Trend */}
                <TrendArrow trend={entry.trend} />
              </div>
            );
          })}
        </div>
      )}

      {/* My Badges Section */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 12 }}>My Badges</h2>

        {loadingBadges && (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glassCard({ width: 120, flexShrink: 0, height: 100 }), opacity: 0.5 }} />
            ))}
          </div>
        )}

        {!loadingBadges && badges.length === 0 && (
          <div style={{ ...glassCard(), textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="7" />
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
            </div>
            <p style={{ color: DIM, fontSize: 13, margin: 0 }}>Complete tasks to earn badges!</p>
          </div>
        )}

        {!loadingBadges && badges.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}>
            {badges.map((badge) => (
              <div
                key={badge.id}
                style={{
                  ...glassCard({ textAlign: 'center', padding: '14px 10px' }),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 28 }}>{badge.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{badge.name}</span>
                <span style={{ fontSize: 10, color: DIM, lineHeight: 1.3 }}>{badge.description}</span>
                <span style={{ fontSize: 10, color: `${GOLD}88`, fontWeight: 600 }}>{formatDate(badge.earned_date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Podium Spot ───────────────────────────────────────────────── */
function PodiumSpot({ entry, height }: { entry: LeaderboardEntry; height: number }) {
  const medal = getMedalColor(entry.rank);
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center' }}>
        {entry.name}
      </span>
      <div style={{
        width: '100%',
        height,
        borderRadius: '10px 10px 0 0',
        background: `linear-gradient(180deg, ${medal || DIM}33, ${medal || DIM}11)`,
        border: `1px solid ${medal || DIM}33`,
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}>
        <span style={{ fontSize: 22 }}>{getMedalEmoji(entry.rank)}</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: medal || TEXT, fontVariantNumeric: 'tabular-nums' }}>
          {entry.score}
        </span>
      </div>
    </div>
  );
}
