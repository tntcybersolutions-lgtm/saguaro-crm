'use client';
/**
 * ActivityFeed — what happened, newest first.
 *
 * The one question this product could not answer. It could show the current
 * state of every job in detail and had no way to say what CHANGED, or who did
 * it, which is what a GC opens the app to find out. Three tables existed for
 * it and all three were empty; lib/activity now writes to activity_log and
 * this reads it.
 *
 * Deliberately not a table. A feed is read top-down in one pass — who, what,
 * which job, how long ago — and columns make you read across for a sentence
 * you should be able to take in at a glance.
 */
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ClockCounterClockwise, Buildings, Package, CurrencyDollar, FileText,
  UserPlus, Gavel, WarningCircle,
} from '@phosphor-icons/react';
import { SectionCard, PremiumEmpty } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)', DIM = 'rgba(255,255,255,0.62)', TEXT = '#FFFFFF';
const BORDER = 'rgba(255,255,255,0.10)', RED = '#FF3B30', GREEN = '#34C759';

interface Activity {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  user_name: string | null;
  project_id: string | null;
  project_name: string | null;
  created_at: string | null;
}

/** An icon per kind of event, so the shape of the day is readable before the words. */
function iconFor(entityType: string | null, action: string) {
  const a = (action || '').toLowerCase();
  if (a === 'awarded') return <Gavel size={15} weight="duotone" color={GREEN} />;
  if (a === 'bid_received') return <CurrencyDollar size={15} weight="duotone" color={GOLD} />;
  if (a === 'invited') return <UserPlus size={15} weight="duotone" color={GOLD} />;
  switch ((entityType || '').toLowerCase()) {
    case 'project':     return <Buildings size={15} weight="duotone" color={GOLD} />;
    case 'bid_package': return <Package size={15} weight="duotone" color={GOLD} />;
    case 'document':    return <FileText size={15} weight="duotone" color={GOLD} />;
    default:            return <ClockCounterClockwise size={15} weight="duotone" color={GOLD} />;
  }
}

/**
 * "3 min ago", not a timestamp.
 *
 * Built from the difference, never from formatting the stored string — a
 * date-only value formatted through Date() lands a day early west of
 * Greenwich, which is how the bid jacket came to show a deadline the GC's own
 * screen disagreed with.
 */
function ago(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ActivityFeed({
  projectId,
  limit = 12,
  style,
}: {
  projectId?: string;
  limit?: number;
  style?: React.CSSProperties;
}) {
  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (projectId) qs.set('project', projectId);
      const r = await fetch(`/api/activity?${qs}`);
      if (!r.ok) throw new Error('Could not load recent activity.');
      const d = await r.json();
      setRows(Array.isArray(d.activities) ? d.activities : []);
    } catch (e) {
      /* An error is not an empty day. Saying "nothing has happened" when the
         read failed is the lie that makes people distrust a feed. */
      setError(e instanceof Error ? e.message : 'Could not load recent activity.');
    } finally {
      setLoading(false);
    }
  }, [projectId, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <SectionCard
      title="Activity"
      subtitle={projectId ? 'Everything that happened on this job' : 'Everything that happened, newest first'}
      icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />}
      action={rows.length ? <span style={{ fontSize: 12, color: DIM }}>{rows.length} recent</span> : undefined}
      style={style}
      flush
    >
      {loading ? (
        <div style={{ padding: '18px 20px', color: DIM, fontSize: 13 }}>Loading activity…</div>
      ) : error ? (
        <PremiumEmpty
          icon={<WarningCircle size={28} weight="duotone" color={RED} />}
          title="Could not load activity"
          description={error}
          tone="error"
          compact
        />
      ) : rows.length === 0 ? (
        <PremiumEmpty
          icon={<ClockCounterClockwise size={28} weight="duotone" color={GOLD} />}
          title="Nothing yet"
          description="As you create projects, send bid packages, take bids and award work, each one lands here with who did it and when."
          compact
        />
      ) : (
        <div>
          {rows.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: 'flex', gap: 11, alignItems: 'flex-start',
                padding: '11px 20px',
                borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
              }}
            >
              <span style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 8, marginTop: 1,
                display: 'grid', placeItems: 'center',
                background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-25)',
              }}>
                {iconFor(a.entity_type, a.action)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: TEXT, fontSize: 13.2, lineHeight: 1.45 }}>
                  {a.description || a.action}
                </div>
                <div style={{ color: DIM, fontSize: 11.5, marginTop: 2, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {a.user_name && <span>{a.user_name}</span>}
                  {!projectId && a.project_name && a.project_id && (
                    <>
                      <span aria-hidden>·</span>
                      <Link href={`/app/projects/${a.project_id}`} style={{ color: GOLD, textDecoration: 'none' }}>
                        {a.project_name}
                      </Link>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span>{ago(a.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
