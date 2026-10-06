'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)', DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)';

const HEARTBEAT_MS = 30_000;
const POLL_MS = 15_000;

const AVATAR_COLORS = [
  'var(--warning)', 'var(--warning)', 'var(--warning)', 'var(--warning)', 'var(--success)', 'var(--danger)', 'var(--warning)', 'var(--success)',
];

interface ActiveUser {
  user_id: string;
  user_name: string;
  page_path: string;
  last_seen_at: string;
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function PresenceIndicator({ projectId }: { projectId?: string }) {
  const pathname = usePathname();
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [tooltipUser, setTooltipUser] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_path: pathname,
          ...(projectId ? { project_id: projectId } : {}),
        }),
      });
    } catch { /* silent */ }
  }, [pathname, projectId]);

  const fetchActive = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: pathname || '/' });
      if (projectId) params.set('project_id', projectId);
      const res = await fetch(`/api/presence/active?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch { /* silent */ }
  }, [pathname, projectId]);

  const sendLeave = useCallback(async () => {
    try {
      await fetch('/api/presence/leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_path: pathname }),
      });
    } catch { /* silent */ }
  }, [pathname]);

  useEffect(() => {
    sendHeartbeat();
    fetchActive();

    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
    pollRef.current = setInterval(fetchActive, POLL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      sendLeave();
    };
  }, [sendHeartbeat, fetchActive, sendLeave]);

  if (users.length === 0) return null;

  const maxVisible = 5;
  const visible = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {visible.map((u, i) => (
          <div
            key={u.user_id}
            style={{ position: 'relative', marginLeft: i === 0 ? 0 : -8, zIndex: maxVisible - i }}
            onMouseEnter={() => setTooltipUser(u.user_id)}
            onMouseLeave={() => setTooltipUser(null)}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                backgroundColor: colorForUser(u.user_id),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-primary)',
                border: `2px solid ${DARK}`,
                cursor: 'default',
                userSelect: 'none',
              }}
            >
              {getInitials(u.user_name)}
            </div>
            {/* Green online dot */}
            <div
              style={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: 'var(--success)',
                border: `2px solid ${DARK}`,
              }}
            />
            {/* Tooltip */}
            {tooltipUser === u.user_id && (
              <div
                ref={tooltipRef}
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 6,
                  padding: '4px 10px',
                  backgroundColor: 'var(--bg-solid-2)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: TEXT,
                  whiteSpace: 'nowrap',
                  zIndex: 100,
                  pointerEvents: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {u.user_name}
              </div>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: BORDER,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: DIM,
              border: `2px solid ${DARK}`,
              marginLeft: -8,
            }}
          >
            +{overflow}
          </div>
        )}
      </div>
      <span style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>
        {users.length} user{users.length !== 1 ? 's' : ''} viewing
      </span>
    </div>
  );
}
