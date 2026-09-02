'use client';

/**
 * BidJacketAssembly — the GC's controls, sitting on the front of the jacket.
 *
 * Three things a jacket needs that a read-only list of documents does not:
 *
 *   ISSUE. The act that says "this is the jacket, it is complete, it goes to
 *   these bidders, as of now". The module had no such verb, which is why 70
 *   packages existed against zero invitations.
 *
 *   DRIFT. Once issued, the GC's view stays live while the bidders hold a
 *   snapshot. A drawing revised afterwards changes what everyone is pricing
 *   with nobody told. This says so, in the one place the GC is already looking,
 *   and offers the addendum that fixes it.
 *
 *   ADDENDA. Numbered, issued to every invitee at once — including the ones who
 *   declined, since a change of scope is often what changes their mind.
 *
 * Kept out of BidJacketView so that component stays presentational and can be
 * rendered for a logged-out bidder without carrying GC-only actions.
 */

import React, { useState } from 'react';
import {
  PaperPlaneTilt, WarningCircle, CheckCircle, Plus, X, ArrowsClockwise,
} from '@phosphor-icons/react';
import { SectionCard, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = '#22C55E';
const AMBER = '#F59E0B';

export type Drift = {
  hasDrift: boolean;
  added: Array<{ section: string; name: string }>;
  removed: Array<{ section: string; name: string }>;
  revised: Array<{ section: string; name: string; from: string | null; to: string | null }>;
  issuedVersion: number | null;
  issuedAt: string | null;
};

export type Issued = { at: string; version: number; invited: number; addenda: number } | null;

export default function BidJacketAssembly({
  packageId, issued, drift, missing, invited, onChanged,
}: {
  packageId: string;
  issued: Issued;
  drift: Drift | null;
  missing: string[];
  invited: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const [addendumOpen, setAddendumOpen] = useState(false);
  const [summary, setSummary] = useState('');

  async function issue(force: boolean) {
    setBusy('issue');
    setNote(null);
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) {
        setConfirmIncomplete(true);
        setNote({ tone: 'warn', text: d.message || 'This jacket is not complete yet.' });
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Could not issue this jacket.');
      setConfirmIncomplete(false);
      setNote({
        tone: d.delivered === d.invited ? 'ok' : 'warn',
        /* Reports what was actually delivered, not what was attempted — "sent
           to 12" when the mail never left is worse than an error. */
        text: `Issued to ${d.delivered} of ${d.invited} bidder${d.invited === 1 ? '' : 's'}${
          d.delivered < d.invited ? '. Some invitations could not be delivered — check the addresses.' : '.'
        }`,
      });
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not issue this jacket.' });
    } finally {
      setBusy(null);
    }
  }

  async function sendAddendum() {
    if (!summary.trim()) return;
    setBusy('addendum');
    setNote(null);
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/addendum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not issue the addendum.');
      setNote({
        tone: d.notified === d.recipients ? 'ok' : 'warn',
        text: `Addendum ${d.addendumNumber} issued to ${d.notified} of ${d.recipients} bidder${d.recipients === 1 ? '' : 's'}.`,
      });
      setSummary('');
      setAddendumOpen(false);
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not issue the addendum.' });
    } finally {
      setBusy(null);
    }
  }

  const driftCount = drift ? drift.added.length + drift.removed.length + drift.revised.length : 0;

  return (
    <SectionCard
      flat
      title={issued ? 'Issued' : 'Ready to issue'}
      icon={
        issued
          ? <CheckCircle size={17} weight="duotone" color={GREEN} />
          : <PaperPlaneTilt size={17} weight="duotone" color={GOLD} />
      }
    >
      {/* ── State of play ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginBottom: issued || missing.length ? 16 : 0 }}>
        {issued ? (
          <>
            <Fact label="Issued" value={new Date(issued.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
            <Fact label="Version" value={`v${issued.version}`} />
            <Fact label="Bidders" value={String(issued.invited)} />
            <Fact label="Addenda" value={String(issued.addenda)} />
          </>
        ) : (
          <div style={{ color: DIM, fontSize: 14, lineHeight: 1.6, maxWidth: '62ch' }}>
            Issuing records what this jacket contained, sends every invited bidder their own link,
            and starts tracking who opened it. Nothing goes out until you do.
          </div>
        )}
      </div>

      {/* ── Drift: the reason this screen exists after issue ───────────────── */}
      {issued && drift?.hasDrift && (
        <div
          style={{
            border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 12,
            background: 'rgba(245,158,11,0.07)', padding: '13px 15px', marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <WarningCircle size={19} weight="fill" color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: AMBER, fontSize: 13.5, marginBottom: 5 }}>
                {driftCount} change{driftCount === 1 ? '' : 's'} since you issued v{drift.issuedVersion}
              </div>
              <div style={{ color: DIM, fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                Your bidders are pricing what was in the jacket when it went out. Issue an addendum
                so everyone is working from the same documents.
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, color: TEXT, fontSize: 12.5, lineHeight: 1.7 }}>
                {drift.revised.slice(0, 6).map((d, i) => (
                  <li key={`r${i}`}>
                    <strong>{d.name}</strong> — revised {d.from ? `${d.from} → ` : ''}{d.to || 'new revision'}
                    <span style={{ color: DIM }}> · {d.section}</span>
                  </li>
                ))}
                {drift.added.slice(0, 4).map((d, i) => (
                  <li key={`a${i}`}>Added <strong>{d.name}</strong><span style={{ color: DIM }}> · {d.section}</span></li>
                ))}
                {drift.removed.slice(0, 4).map((d, i) => (
                  <li key={`x${i}`}>Removed <strong>{d.name}</strong><span style={{ color: DIM }}> · {d.section}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Incomplete warning, only when they tried ───────────────────────── */}
      {confirmIncomplete && missing.length > 0 && (
        <div
          style={{
            border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 12,
            background: 'rgba(245,158,11,0.07)', padding: '13px 15px', marginBottom: 16,
            color: TEXT, fontSize: 13.5, lineHeight: 1.6,
          }}
        >
          <strong style={{ color: AMBER }}>{missing.join(' and ')}</strong>{' '}
          {missing.length === 1 ? 'is' : 'are'} empty. A bidder who opens this cannot price the work
          from it. Add them, or issue anyway if scope-only pricing is what you intend.
        </div>
      )}

      {note && (
        <div
          style={{
            fontSize: 13.5, fontWeight: 600, marginBottom: 14,
            color: note.tone === 'ok' ? GREEN : note.tone === 'warn' ? AMBER : '#EF4444',
          }}
        >
          {note.text}
        </div>
      )}

      {/* ── Addendum composer ─────────────────────────────────────────────── */}
      {addendumOpen && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>
            What changed
          </div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="Fixture schedule revised on sheet P-201; medical gas rough-in moved to the mechanical package."
            style={{
              width: '100%', background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIR}`,
              borderRadius: 10, padding: '11px 13px', color: TEXT, fontSize: 14,
              outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ color: DIM, fontSize: 12, marginTop: 6 }}>
            Every invited bidder is sent this text verbatim, including anyone who already declined.
          </div>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {!issued && (
          <button
            onClick={() => issue(confirmIncomplete)}
            disabled={busy !== null || invited === 0}
            title={invited === 0 ? 'Invite subcontractors first' : undefined}
            style={{
              ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7,
              opacity: invited === 0 ? 0.5 : 1, cursor: invited === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <PaperPlaneTilt size={15} weight="bold" />
            {busy === 'issue'
              ? 'Issuing…'
              : confirmIncomplete
                ? 'Issue anyway'
                : `Issue to ${invited} bidder${invited === 1 ? '' : 's'}`}
          </button>
        )}

        {issued && !addendumOpen && (
          <button
            onClick={() => setAddendumOpen(true)}
            style={{
              ...(drift?.hasDrift ? goldButtonStyle : ghostButtonStyle),
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}
          >
            <Plus size={15} weight="bold" /> Issue addendum
          </button>
        )}

        {addendumOpen && (
          <>
            <button
              onClick={sendAddendum}
              disabled={busy !== null || !summary.trim()}
              style={{ ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: summary.trim() ? 1 : 0.5 }}
            >
              <PaperPlaneTilt size={15} weight="bold" />
              {busy === 'addendum' ? 'Sending…' : 'Send to all bidders'}
            </button>
            <button
              onClick={() => { setAddendumOpen(false); setSummary(''); }}
              style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <X size={15} weight="bold" /> Cancel
            </button>
          </>
        )}

        {issued && !addendumOpen && (
          <button onClick={onChanged} style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowsClockwise size={15} weight="bold" /> Re-check for changes
          </button>
        )}
      </div>

      {invited === 0 && !issued && (
        <div style={{ color: DIM, fontSize: 12.5, marginTop: 10 }}>
          No bidders invited yet — add them on the package page first.
        </div>
      )}
    </SectionCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
