'use client';
import React, { useState, useEffect } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

const ACTION_COLORS: Record<string, string> = {
  create: '#2ea043',
  created: '#2ea043',
  insert: '#2ea043',
  update: '#388bfd',
  updated: '#388bfd',
  edit: '#388bfd',
  status_change: '#d29922',
  status_updated: '#d29922',
  approved: '#d29922',
  rejected: '#d29922',
  submitted: '#d29922',
  delete: '#c03030',
  deleted: '#c03030',
  removed: '#c03030',
  archive: '#c03030',
};

function getActionColor(action: string): string {
  const lower = action.toLowerCase();
  return ACTION_COLORS[lower] || GOLD;
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number') {
    if (val >= 100 || val <= -100) {
      return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  }
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  action: string;
  changes?: Record<string, unknown>;
  previous_values?: Record<string, unknown>;
  user_name: string;
  user_email: string;
  project_id?: string;
  created_at: string;
}

interface AuditTimelineProps {
  entityType: string;
  entityId: string;
}

export default function AuditTimeline({ entityType, entityId }: AuditTimelineProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const COLLAPSED_COUNT = 5;

  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/audit-trail?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&limit=100`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setEntries(data.entries || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load audit trail');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [entityType, entityId]);

  const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hasMore = entries.length > COLLAPSED_COUNT;

  if (loading) {
    return (
      <div style={{ padding: 16, color: DIM, fontSize: 13 }}>
        Loading audit trail...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: '#c03030', fontSize: 13 }}>
        Error: {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: 16, color: DIM, fontSize: 13 }}>
        No audit history found.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Vertical timeline line */}
      <div
        style={{
          position: 'absolute',
          left: 19,
          top: 20,
          bottom: expanded || entries.length <= COLLAPSED_COUNT ? 20 : 0,
          width: 2,
          background: BORDER,
        }}
      />

      {visible.map((entry, idx) => {
        const color = getActionColor(entry.action);
        const changes = entry.changes || {};
        const prev = entry.previous_values || {};
        const changedKeys = Object.keys(changes);

        return (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              position: 'relative',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: color + '22',
                border: `2px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: color,
                flexShrink: 0,
                zIndex: 1,
              }}
              title={entry.user_name || entry.user_email}
            >
              {getInitials(entry.user_name || entry.user_email)}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Header line */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>
                  {entry.user_name || entry.user_email}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: color,
                    background: color + '18',
                    padding: '1px 8px',
                    borderRadius: 10,
                    textTransform: 'capitalize',
                  }}
                >
                  {entry.action.replace(/_/g, ' ')}
                </span>
                {entry.entity_name && (
                  <span style={{ color: DIM, fontSize: 12 }}>
                    on {entry.entity_name}
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <div
                style={{ color: DIM, fontSize: 11, marginTop: 2 }}
                title={formatFullDate(entry.created_at)}
              >
                {formatTimestamp(entry.created_at)}
              </div>

              {/* Changed fields diff */}
              {changedKeys.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    padding: '6px 10px',
                    background: DARK,
                    borderRadius: 6,
                    border: `1px solid ${BORDER}`,
                    fontSize: 12,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                  }}
                >
                  {changedKeys.map((key) => {
                    const prevVal = prev[key];
                    const newVal = changes[key];
                    const fieldLabel = key.replace(/_/g, ' ');

                    return (
                      <div key={key} style={{ padding: '2px 0', color: TEXT }}>
                        <span style={{ color: DIM }}>{fieldLabel}: </span>
                        {prevVal !== undefined ? (
                          <>
                            <span style={{ color: '#c03030', textDecoration: 'line-through' }}>
                              {formatValue(prevVal)}
                            </span>
                            <span style={{ color: DIM, margin: '0 4px' }}>&rarr;</span>
                            <span style={{ color: '#2ea043' }}>
                              {formatValue(newVal)}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: '#2ea043' }}>
                            {formatValue(newVal)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Show all / collapse toggle */}
      {hasMore && (
        <div style={{ textAlign: 'center', paddingTop: 8 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              color: GOLD,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 12px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none';
            }}
          >
            {expanded
              ? 'Show less'
              : `Show all ${entries.length} entries`}
          </button>
        </div>
      )}
    </div>
  );
}
