'use client';
/**
 * One My Work row: dot · what to do · the record it's about · ONE action.
 *
 * The action is a write that really does the thing (Turn on, Remind,
 * Request) or a button to the screen where it's done (Invite, File); with no
 * action the row ends in a chevron. The whole row opens the record (a
 * stretched title link), so the buttons stay separate tap targets — no button
 * inside a link.
 *
 * On a phone, Remind / Done / Snooze are a swipe away (SwipeRow). With a mouse
 * the same Done / Snooze sit inline as small buttons, so nothing is
 * swipe-only; on touch they stay in the accessibility tree, just not drawn.
 */
import React from 'react';
import Link from 'next/link';
import { Row, RowAction, SwipeRow, type SwipeAction } from '@/components/ui/flat';
import type { MyWorkItem } from '@/lib/my-work';

export interface RowControl {
  busy: Record<string, string | undefined>;
  notes: Record<string, string | undefined>;
  /** Packages whose bid link is on (from the server, or switched on here). */
  portalOn: (packageId: string | null | undefined, fromServer: boolean | undefined) => boolean;
  snoozeReady: boolean;
  turnOn: (it: MyWorkItem) => void;
  remind: (it: MyWorkItem) => void;
  askCoi: (it: MyWorkItem) => void;
  done: (it: MyWorkItem) => void;
  snooze: (it: MyWorkItem) => void;
}

export function MyWorkRow({ it, ctl }: { it: MyWorkItem; ctl: RowControl }) {
  const busy = ctl.busy[it.key];
  const note = ctl.notes[it.key];
  const meta = note ? `${note} · ${it.meta}` : it.meta;
  const a = it.action;
  const canRemind = a?.kind === 'remind' && ctl.portalOn(it.packageId, it.portalOn);

  let primary: React.ReactNode = null;
  if (a?.kind === 'portal') primary = <RowAction busy={!!busy} onClick={() => ctl.turnOn(it)} label={`Turn on the bid link for ${it.meta.split(' · ')[0]}`}>{busy || a.label}</RowAction>;
  else if (a?.kind === 'remind' && canRemind) primary = <RowAction busy={!!busy} onClick={() => ctl.remind(it)}>{busy || a.label}</RowAction>;
  else if (a?.kind === 'ask_coi') primary = <RowAction busy={!!busy} onClick={() => ctl.askCoi(it)}>{busy || a.label}</RowAction>;
  else if (a?.kind === 'link') primary = <RowAction href={a.href}>{a.label}</RowAction>;

  const swipe: SwipeAction[] = [];
  if (canRemind) swipe.push({ label: 'Remind', kind: 'primary', onAct: () => ctl.remind(it) });
  if (it.done) swipe.push({ label: 'Done', kind: 'good', onAct: () => ctl.done(it) });
  if (ctl.snoozeReady) swipe.push({ label: 'Snooze', kind: 'plain', onAct: () => ctl.snooze(it) });

  const secondary = (it.done || ctl.snoozeReady) ? (
    <span className="mw-more">
      {it.done && <button type="button" className="mw-sec" disabled={!!busy} onClick={() => ctl.done(it)}>Done</button>}
      {ctl.snoozeReady && <button type="button" className="mw-sec" disabled={!!busy} onClick={() => ctl.snooze(it)}>Snooze</button>}
    </span>
  ) : null;

  const body = (
    <Row
      dot={it.tone}
      title={<Link className="mw-tl" href={it.href}>{it.title}</Link>}
      meta={meta}
      action={<>{secondary}{primary ?? <span className="fl-chev" aria-hidden="true">›</span>}</>}
    />
  );

  return (
    <li data-key={it.key} data-tone={it.tone}>
      {swipe.length ? <SwipeRow actions={swipe}>{body}</SwipeRow> : body}
    </li>
  );
}
