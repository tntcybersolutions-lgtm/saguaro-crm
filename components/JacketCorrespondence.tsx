'use client';
/**
 * A bid jacket's Correspondence divider: every email Saguaro sent about the
 * package, the portal chats and Ask-for-it requests with its invited subs,
 * bids as they arrived and when each invitation was opened — newest first.
 * GC-only; the bidder's jacket never carries it.
 */
import React, { useMemo, useState } from 'react';
import { EnvelopeSimple, ChatCircleText, ShieldCheck, CurrencyDollar, Eye, PaperPlaneTilt, CaretDown, CaretUp } from '@phosphor-icons/react';
import { StatusPill } from '@/components/ui/Status';
import type { CommItem, CommKind } from '@/lib/jacket-correspondence';

const CSS = `
.jcx { display: grid; gap: 12px; min-width: 0; }
.jcx-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.jcx-chip { min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-secondary); font-weight: 700; font-size: 14px; cursor: pointer; }
.jcx-chip[aria-pressed="true"] { background: var(--brand-primary); color: var(--on-brand); border-color: transparent; }
.jcx-list { display: grid; gap: 0; border: 1px solid var(--border-default); border-radius: 14px; overflow: hidden; }
.jcx-item { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 12px 14px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface); }
.jcx-item:first-child { border-top: 0; }
.jcx-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--bg-surface-2); color: var(--text-secondary); }
.jcx-item[data-dir="in"] .jcx-ic { color: var(--success); }
.jcx-item[data-kind="ask"] .jcx-ic { color: var(--warning); }
.jcx-top { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: space-between; }
.jcx-title { font-weight: 800; font-size: 14.5px; color: var(--text-primary); overflow-wrap: anywhere; }
.jcx-meta { font-size: 13px; color: var(--text-tertiary); overflow-wrap: anywhere; }
.jcx-subject { font-size: 14px; color: var(--text-primary); font-weight: 600; margin-top: 2px; overflow-wrap: anywhere; }
.jcx-body { font-size: 14px; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 6px; line-height: 1.5; }
.jcx-more { min-height: 44px; margin-top: 4px; padding: 0 10px; border: 0; background: transparent; color: var(--link); font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.jcx-err { font-size: 13px; color: var(--c-red); margin-top: 4px; }
`;

type Filter = 'all' | 'email' | 'messages' | 'bids';
const KIND_IN: Record<Filter, CommKind[]> = {
  all: ['email', 'chat', 'ask', 'bid', 'viewed', 'invited'],
  email: ['email', 'invited'],
  messages: ['chat', 'ask'],
  bids: ['bid', 'viewed'],
};
const ICONS: Record<CommKind, React.ReactNode> = {
  email: <EnvelopeSimple size={17} weight="duotone" />,
  invited: <PaperPlaneTilt size={17} weight="duotone" />,
  chat: <ChatCircleText size={17} weight="duotone" />,
  ask: <ShieldCheck size={17} weight="duotone" />,
  bid: <CurrencyDollar size={17} weight="duotone" />,
  viewed: <Eye size={17} weight="duotone" />,
};
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function Item({ c }: { c: CommItem }) {
  const [open, setOpen] = useState(false);
  const long = !!c.body && c.body.length > 220;
  return (
    <article className="jcx-item" data-dir={c.direction} data-kind={c.kind}>
      <span className="jcx-ic" aria-hidden>{ICONS[c.kind]}</span>
      <div style={{ minWidth: 0 }}>
        <div className="jcx-top">
          <span className="jcx-title">{c.title}</span>
          {c.kind === 'email' && c.status && <StatusPill module="emails" status={c.status} size="sm" />}
        </div>
        <div className="jcx-meta">{when(c.at)}{c.to ? ` · to ${c.to}` : ''}{c.kind !== 'bid' && c.kind !== 'viewed' && c.party && !c.title.includes(c.party) ? ` · ${c.party}` : ''}</div>
        {c.subject && <div className="jcx-subject">{c.subject}</div>}
        {c.body && <div className="jcx-body">{long && !open ? `${c.body.slice(0, 220)}…` : c.body}</div>}
        {long && (
          <button type="button" className="jcx-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <CaretUp size={13} /> : <CaretDown size={13} />} {open ? 'Show less' : 'Show all'}
          </button>
        )}
        {c.error && <div className="jcx-err">{c.error}</div>}
      </div>
    </article>
  );
}

export default function JacketCorrespondence({ items }: { items: CommItem[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => Object.fromEntries((Object.keys(KIND_IN) as Filter[]).map((f) => [f, items.filter((i) => KIND_IN[f].includes(i.kind)).length])) as Record<Filter, number>, [items]);
  const shown = items.filter((i) => KIND_IN[filter].includes(i.kind));
  const label: Record<Filter, string> = { all: 'All', email: 'Emails', messages: 'Messages & asks', bids: 'Bids & opens' };
  return (
    <div className="jcx">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="jcx-filters" role="group" aria-label="Show">
        {(Object.keys(KIND_IN) as Filter[]).map((f) => (
          <button key={f} type="button" className="jcx-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label[f]} · {counts[f]}</button>
        ))}
      </div>
      {shown.length === 0
        ? <div className="jcx-meta" style={{ padding: 12 }}>Nothing of this kind yet.</div>
        : <div className="jcx-list">{shown.map((c) => <Item key={c.id} c={c} />)}</div>}
    </div>
  );
}
