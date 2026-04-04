'use client';
import React, { useEffect, useState, useCallback } from 'react';

const GOLD = '#C8960F';
const DIM = '#8BAAC8';
const TEXT = '#F0F4FF';
const BLUE = '#3B82F6';

interface BriefingItem {
  id: string;
  text: string;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
}

interface BriefingData {
  greeting: string;
  userName: string;
  items: BriefingItem[];
  generatedAt: string;
}

interface AIBriefingProps {
  projectId: string | null;
  onViewAll?: () => void;
  onAskSage?: () => void;
}

const shimmerKeyframes = `
@keyframes aib-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

const ShimmerBar = ({ w = '100%', h = 12, mb = 8 }: { w?: string | number; h?: number; mb?: number }) => (
  <div style={{
    width: typeof w === 'number' ? `${w}%` : w,
    height: h,
    borderRadius: 6,
    background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
    backgroundSize: '800px 100%',
    animation: 'aib-shimmer 1.5s infinite linear',
    marginBottom: mb,
  }} />
);

function LoadingState() {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={{ padding: '20px' }}>
        <ShimmerBar w={60} h={18} mb={16} />
        <ShimmerBar w={85} h={12} mb={10} />
        <ShimmerBar w={70} h={12} mb={10} />
        <ShimmerBar w={90} h={12} mb={10} />
        <ShimmerBar w={55} h={12} mb={10} />
        <ShimmerBar w={75} h={12} mb={16} />
        <div style={{ display: 'flex', gap: 10 }}>
          <ShimmerBar w="50%" h={36} mb={0} />
          <ShimmerBar w="50%" h={36} mb={0} />
        </div>
      </div>
    </>
  );
}

function getGreetingEmoji(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '☀️';
  if (hour < 17) return '🌤';
  return '🌙';
}

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'high': return '#EF4444';
    case 'medium': return GOLD;
    case 'low': return '#22C55E';
    default: return DIM;
  }
}

export default function AIBriefing({ projectId, onViewAll, onAskSage }: AIBriefingProps) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/field/briefing?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch briefing (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load briefing';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const cardStyle: React.CSSProperties = {
    background: 'rgba(26,31,46,0.7)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid #EEF0F3',
    borderRadius: 16,
    overflow: 'hidden',
  };

  if (!projectId) {
    return (
      <div style={cardStyle}>
        <div style={{
          padding: '32px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌵</div>
          <p style={{ margin: 0, fontSize: 14, color: DIM, lineHeight: 1.5 }}>
            Select a project to see your daily briefing
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <div style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#EF4444', lineHeight: 1.4 }}>{error}</p>
          <button
            onClick={fetchBriefing}
            style={{
              padding: '8px 20px',
              background: '#EEF0F3',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: TEXT,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>{getGreetingEmoji()}</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>
            {data.greeting || 'Good morning'}, {data.userName || 'there'}
          </h3>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: DIM }}>
          AI Briefing &middot; {new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      {/* Briefing Items */}
      <div style={{ padding: '14px 20px 16px' }}>
        {data.items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>
            No action items for today. You're all clear!
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {data.items.map((item, idx) => (
              <li
                key={item.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: idx < data.items.length - 1
                    ? '1px solid #F3F4F6'
                    : 'none',
                }}
              >
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: getPriorityColor(item.priority),
                  marginTop: 6,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
                    {item.text}
                  </p>
                  {item.category && (
                    <span style={{
                      display: 'inline-block',
                      marginTop: 4,
                      padding: '2px 8px',
                      background: '#F3F4F6',
                      borderRadius: 4,
                      fontSize: 10,
                      color: DIM,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {item.category}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '0 20px 20px',
      }}>
        <button
          onClick={onViewAll}
          style={{
            flex: 1,
            padding: '10px 0',
            background: '#E2E5EA',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            color: TEXT,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          View All Items
        </button>
        <button
          onClick={onAskSage}
          style={{
            flex: 1,
            padding: '10px 0',
            background: `linear-gradient(135deg, ${GOLD}, #C8960F)`,
            border: 'none',
            borderRadius: 10,
            color: '#000',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            <line x1="10" y1="22" x2="14" y2="22" />
          </svg>
          Ask Sage
        </button>
      </div>
    </div>
  );
}
