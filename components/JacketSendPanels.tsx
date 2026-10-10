'use client';

/**
 * What a GC sees when a bid jacket goes out — shared by the package page, the
 * jacket's assembly controls and the create-package wizard, because all three
 * send through the same route logic (lib/bid-issue) and must say the same
 * thing about it.
 *
 *   JacketGatePrompt   the jacket is incomplete: which sections are empty, and
 *                      the two honest ways forward — fix it, or send anyway.
 *   JacketSendResult   who was emailed, who was not (and why), and who already
 *                      had the issued jacket so was not emailed again.
 */

import React from 'react';
import Link from 'next/link';
import { CheckCircle, WarningCircle, XCircle, MinusCircle, PaperPlaneTilt, FolderOpen, X } from '@phosphor-icons/react';
import { ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';

const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const GREEN = 'var(--success)';
const AMBER = 'var(--warning)';
const RED = 'var(--danger)';

export type SendDelivery = {
  inviteId: string | null;
  email: string;
  name: string | null;
  sent: boolean;
  outcome: 'emailed' | 'failed' | 'already_sent' | 'not_saved';
  error?: string;
  at?: string | null;
};

/** The JSON /issue and /invite-subs answer with on success (lib/bid-issue jacketSendResponse). */
export type SendPayload = {
  issuedNow?: boolean;
  version?: number;
  delivered?: number;
  delivery?: SendDelivery[];
  skipped?: SendDelivery[];
  invalid?: Array<{ email: string; error: string }>;
  forced?: boolean;
  missing?: string[];
};

const tap: React.CSSProperties = { minHeight: 44 };

/** 'A', 'A and B', 'A, B and C'. */
const listJoin = (items: string[]) =>
  items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const shortDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function JacketGatePrompt({
  missing, busy, onSendAnyway, onCancel, jacketHref, sendLabel = 'Send Anyway',
}: {
  missing: string[];
  busy?: boolean;
  onSendAnyway: () => void;
  onCancel?: () => void;
  /** Where the GC goes to fill the empty sections. */
  jacketHref?: string;
  sendLabel?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="jacket-gate"
      style={{
        border: '1px solid var(--brand-primary-35)', borderRadius: 12, background: 'var(--brand-primary-08)',
        padding: '13px 15px', color: TEXT, fontSize: 13.5, lineHeight: 1.6,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <WarningCircle size={19} weight="fill" color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>
            <span style={{ color: AMBER }}>{listJoin(missing)}</span> {missing.length === 1 ? 'is' : 'are'} empty.
          </div>
          <div style={{ color: DIM, fontSize: 13, marginTop: 3 }}>
            Nothing has been sent. A bidder who opens this jacket cannot price the work from it. Add{' '}
            {missing.length === 1 ? 'it' : 'them'} first, or send anyway if scope-only pricing is what you intend.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onSendAnyway}
          disabled={busy}
          className="pmBtn"
          style={{ ...goldButtonStyle, ...tap, opacity: busy ? 0.6 : 1 }}
        >
          <PaperPlaneTilt size={15} weight="bold" /> {busy ? 'Sending…' : sendLabel}
        </button>
        {jacketHref && (
          <Link href={jacketHref} className="pmBtn" style={{ ...ghostButtonStyle, ...tap }}>
            <FolderOpen size={15} weight="bold" /> Open the Jacket to Fill It
          </Link>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="pmBtn" style={{ ...ghostButtonStyle, ...tap }}>
            <X size={15} weight="bold" /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ d }: { d: SendDelivery }) {
  const icon =
    d.outcome === 'emailed' ? <CheckCircle size={17} weight="fill" color={GREEN} />
      : d.outcome === 'already_sent' ? <MinusCircle size={17} weight="fill" color={DIM} />
        : <XCircle size={17} weight="fill" color={RED} />;
  const what =
    d.outcome === 'emailed' ? 'Emailed'
      : d.outcome === 'already_sent' ? `Already had it${d.at ? ` — sent ${shortDate(d.at)}` : ''}, not emailed again`
        : d.outcome === 'not_saved' ? `Not invited — ${d.error || 'could not be saved'}`
          : `Not delivered — ${d.error || 'the email did not go'}`;
  return (
    <li data-outcome={d.outcome} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>{icon}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <span style={{ color: TEXT, fontWeight: 700 }}>{d.name || d.email}</span>
        {d.name && <span style={{ color: DIM }}> · {d.email}</span>}
        <span style={{ display: 'block', color: d.outcome === 'emailed' ? GREEN : d.outcome === 'already_sent' ? DIM : RED, fontSize: 12.5 }}>
          {what}
        </span>
      </span>
    </li>
  );
}

export function JacketSendResult({ result, onDismiss }: { result: SendPayload; onDismiss?: () => void }) {
  const delivery = result.delivery || [];
  const skipped = result.skipped || [];
  const delivered = delivery.filter((d) => d.sent).length;
  const notDelivered = delivery.length - delivered;
  const headline = delivery.length === 0
    ? skipped.length
      ? 'Nobody new to email — everyone named already has the issued jacket.'
      : 'Nothing was sent.'
    : `${result.issuedNow ? `Issued v${result.version ?? 1} — ` : ''}emailed ${delivered} of ${delivery.length}${notDelivered ? `; ${notDelivered} not delivered` : ''}.`;
  const tone = notDelivered > 0 ? AMBER : GREEN;
  return (
    <div
      role="status"
      data-testid="jacket-send-result"
      style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '12px 14px', background: 'rgba(0,0,0,0.25)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, color: tone, fontWeight: 800, fontSize: 13.5, lineHeight: 1.5 }}>{headline}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{ ...tap, minWidth: 44, background: 'transparent', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -8 }}
          >
            <X size={16} weight="bold" />
          </button>
        )}
      </div>
      {result.forced && (result.missing?.length ?? 0) > 0 && (
        <div style={{ color: DIM, fontSize: 12.5, marginTop: 2 }}>
          Sent with {listJoin(result.missing!)} empty — you chose to send anyway.
        </div>
      )}
      {(delivery.length > 0 || skipped.length > 0) && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, fontSize: 13 }}>
          {delivery.map((d, i) => <Row key={`d${i}`} d={d} />)}
          {skipped.map((d, i) => <Row key={`s${i}`} d={d} />)}
        </ul>
      )}
      {(result.invalid?.length ?? 0) > 0 && (
        <div style={{ color: RED, fontSize: 12.5, marginTop: 6 }}>
          Not used: {result.invalid!.map((v) => `${v.email || '(blank)'} — ${v.error}`).join('; ')}
        </div>
      )}
    </div>
  );
}
