'use client';

/**
 * CostCodeDrill — everything behind one row of the variance table.
 *
 * "Concrete is $20k over" is where every other tool stops, and it is exactly
 * the point where a PM has to leave the dashboard and reconstruct why across
 * three other screens. This answers the follow-up question in place: how the
 * budget got to its current number, what has been booked against it week by
 * week, and which tasks are still open on it.
 */

import React from 'react';
import useSWR from 'swr';
import { X, Clock, ListChecks, Receipt, WarningCircle } from '@phosphor-icons/react';

const GOLD = '#F59E0B', DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';
const NEST_BORDER = 'rgba(255,255,255,0.08)';
const HAIR = 'rgba(255,255,255,0.06)';

interface Payload {
  line: {
    division: string; description: string | null; costCode: string | null;
    originalBudget: number; approvedChanges: number; currentBudget: number;
    committed: number; uncommitted: number; spent: number; forecast: number;
    variance: number; variancePct: number;
    percentSpent: number | null; percentComplete: number; ev: number; cpi: number | null;
  };
  labour: {
    weeks: { week: string; cost: number; hours: number; overtimeHours: number; entries: number }[];
    total: number; hours: number; overtimeHours: number; shareOfSpend: number | null;
  };
  tasks: { id: string; name: string; trade: string | null; startDate: string | null; endDate: string | null; pctComplete: number; totalFloat: number; isCritical: boolean; status: string | null }[];
  changeOrders: { id: string; number: string | null; title: string | null; amount: number; createdAt: string | null }[];
}

const money = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(0)}K`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
};
const shortWeek = (w: string) => {
  const [, m, d] = w.split('-');
  return `${d} ${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]}`;
};

const fetcher = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('Failed to load cost code detail');
  return r.json();
});

/** How the budget got from its original number to its forecast, in order. */
function Waterfall({ l }: { l: Payload['line'] }) {
  const max = Math.max(l.currentBudget, l.forecast, l.committed, l.spent, 1);
  const bar = (label: string, value: number, colour: string, note?: string) => (
    <div key={label} style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
        <span style={{ color: DIM, fontWeight: 700 }}>{label}</span>
        <span style={{ color: colour, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {money(value)}{note ? <span style={{ color: DIM, fontWeight: 600 }}> · {note}</span> : null}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: colour, borderRadius: 4 }} />
      </div>
    </div>
  );

  return (
    <div>
      {bar('Original budget', l.originalBudget, 'rgba(255,255,255,0.55)')}
      {l.approvedChanges !== 0 && bar('Approved changes', l.approvedChanges, GOLD, 'change orders')}
      {bar('Current budget (BAC)', l.currentBudget, '#fff')}
      {bar('Committed', l.committed, '#8FB8E8', 'POs + subcontracts')}
      {bar('Spent to date', l.spent, l.spent > l.currentBudget ? RED : GREEN)}
      {bar('Forecast at completion', l.forecast, l.forecast > l.currentBudget ? RED : GREEN,
        l.variance < 0 ? `${money(Math.abs(l.variance))} over` : `${money(l.variance)} under`)}
    </div>
  );
}

export default function CostCodeDrill({
  projectId, division, onClose,
}: { projectId: string; division: string; onClose: () => void }) {
  const { data, error, isLoading } = useSWR<Payload>(
    `/api/intelligence/cost-code?projectId=${encodeURIComponent(projectId)}&division=${encodeURIComponent(division)}`,
    fetcher, { revalidateOnFocus: false },
  );

  const shell: React.CSSProperties = {
    marginTop: 10, background: 'rgba(0,0,0,0.28)', border: `1px solid ${NEST_BORDER}`,
    borderRadius: 10, padding: 13,
  };

  if (isLoading) return <div style={{ ...shell, color: DIM, fontSize: 12, textAlign: 'center', padding: 22 }}>Opening division {division}…</div>;

  if (error || !data) {
    return (
      <div style={{ ...shell, textAlign: 'center', padding: 20 }}>
        <WarningCircle size={16} weight="fill" color={RED} />
        <div style={{ color: RED, fontSize: 12, fontWeight: 700, marginTop: 6 }}>Couldn&apos;t open this cost code.</div>
      </div>
    );
  }

  const { line: l, labour, tasks, changeOrders } = data;
  const maxWeek = Math.max(1, ...labour.weeks.map((w) => w.cost));

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>
            {l.division} · {l.description || 'Division'}
          </div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
            {l.percentComplete.toFixed(0)}% built · {l.percentSpent == null ? '—' : `${l.percentSpent.toFixed(0)}% spent`}
            {l.cpi != null && <> · CPI <span style={{ color: l.cpi >= 0.98 ? GREEN : l.cpi >= 0.9 ? AMBER : RED, fontWeight: 800 }}>{l.cpi.toFixed(2)}</span></>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close cost code detail"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: DIM, padding: 2, display: 'flex' }}>
          <X size={14} weight="bold" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', minWidth: 250 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            How this number was built
          </div>
          <Waterfall l={l} />
        </div>

        <div style={{ flex: '1 1 280px', minWidth: 250 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={11} weight="bold" /> Labour booked, by week
          </div>

          {labour.weeks.length === 0 ? (
            <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.6 }}>
              No time booked against division {l.division}. The spend on this line came from
              material, subcontract or other undated cost.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 54, marginBottom: 6 }}>
                {labour.weeks.map((w) => (
                  <div key={w.week} title={`${shortWeek(w.week)} — ${money(w.cost)}, ${w.hours}h${w.overtimeHours ? ` (${w.overtimeHours}h OT)` : ''}`}
                    style={{
                      flex: 1, minWidth: 2, borderRadius: 2,
                      height: Math.max(3, (w.cost / maxWeek) * 54),
                      background: w.overtimeHours > 0 ? AMBER : GOLD,
                    }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: DIM, lineHeight: 1.6 }}>
                {money(labour.total)} of labour · {labour.hours}h
                {labour.overtimeHours > 0 && <span style={{ color: AMBER, fontWeight: 700 }}> · {labour.overtimeHours}h overtime</span>}
                {labour.shareOfSpend != null && <> · {labour.shareOfSpend.toFixed(0)}% of what this line has spent</>}
              </div>
              <div style={{ fontSize: 10, color: DIM, marginTop: 3 }}>
                {shortWeek(labour.weeks[0].week)} – {shortWeek(labour.weeks[labour.weeks.length - 1].week)} · amber weeks carried overtime
              </div>
            </>
          )}
        </div>
      </div>

      {tasks.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ListChecks size={11} weight="bold" /> Work still open on this division
          </div>
          {tasks.filter((t) => t.pctComplete < 100).slice(0, 6).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, borderTop: `1px solid ${HAIR}`, padding: '5px 0' }}>
              <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 11.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
                {t.isCritical && <span style={{ color: RED, fontSize: 9, fontWeight: 800, marginLeft: 6 }}>CRITICAL</span>}
              </span>
              <span style={{ flex: '1 1 90px', minWidth: 60, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${t.pctComplete}%`, background: t.isCritical ? RED : GOLD, borderRadius: 3 }} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: DIM, minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {t.pctComplete.toFixed(0)}%
              </span>
              <span style={{ fontSize: 10.5, color: t.totalFloat < 0 ? RED : DIM, minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {t.totalFloat < 0 ? `${t.totalFloat}d float` : `+${t.totalFloat}d`}
              </span>
            </div>
          ))}
        </div>
      )}

      {changeOrders.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Receipt size={11} weight="bold" /> Approved change orders on this project
          </div>
          {changeOrders.slice(0, 5).map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'baseline', borderTop: `1px solid ${HAIR}`, padding: '5px 0' }}>
              <span style={{ fontSize: 10.5, color: DIM, fontWeight: 700, minWidth: 48 }}>{c.number || 'CO'}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Untitled'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: c.amount >= 0 ? GOLD : GREEN, fontVariantNumeric: 'tabular-nums' }}>{money(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
