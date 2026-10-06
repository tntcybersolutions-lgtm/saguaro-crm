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
import Link from 'next/link';
import {
  PaperPlaneTilt, WarningCircle, CheckCircle, Plus, X, ArrowsClockwise, Paperclip, Scales,
} from '@phosphor-icons/react';
import { SectionCard, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = 'var(--success)';
const AMBER = 'var(--warning)';

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
  packageId, projectId, issued, drift, missing, invited, responded, onChanged,
}: {
  packageId: string;
  projectId: string;
  /** Bids received. Levelling only becomes a real action once one has landed. */
  responded?: number;
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
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState('attachment');

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

  /* Two calls on purpose. Storage goes through /api/files/upload — service
     role, tenant-prefixed path, already proven — and this only files a
     REFERENCE into the jacket. Re-implementing upload here would be a second
     storage path for one concept, which is exactly how the portal_sub_bid_*
     fork happened. */
  async function attach(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy('attach');
    setNote(null);
    try {
      let placed = 0;
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('projectId', projectId);
        fd.append('entityType', 'bid_package');
        fd.append('entityId', packageId);
        fd.append('category', category);

        const up = await fetch('/api/files/upload', { method: 'POST', body: fd });
        const ud = await up.json().catch(() => ({}));
        if (!up.ok || !ud.file?.id) throw new Error(ud.error || `Could not upload ${file.name}.`);

        const at = await fetch(`/api/bid-packages/${packageId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectFileId: ud.file.id, category, label: file.name }),
        });
        const ad = await at.json().catch(() => ({}));
        if (!at.ok) throw new Error(ad.error || `Could not file ${file.name} in the jacket.`);
        placed++;
      }
      setNote({ tone: 'ok', text: `${placed} document${placed === 1 ? '' : 's'} added to the jacket.` });
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not add the document.' });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
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
      title={issued ? 'Issued' : 'Ready to Issue'}
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
            border: `1px solid var(--brand-primary-35)`, borderRadius: 12,
            background: 'var(--brand-primary-08)', padding: '13px 15px', marginBottom: 16,
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
            border: `1px solid var(--brand-primary-35)`, borderRadius: 12,
            background: 'var(--brand-primary-08)', padding: '13px 15px', marginBottom: 16,
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
            color: note.tone === 'ok' ? GREEN : note.tone === 'warn' ? AMBER : 'var(--danger)',
          }}
        >
          {note.text}
        </div>
      )}

      {/* ── Addendum composer ─────────────────────────────────────────────── */}
      {addendumOpen && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: DIM, marginBottom: 6 }}>
            What Changed
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
                ? 'Issue Anyway'
                : `Issue to ${invited} Bidder${invited === 1 ? '' : 's'}`}
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
            <Plus size={15} weight="bold" /> Issue Addendum
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
              {busy === 'addendum' ? 'Sending…' : 'Send to All Bidders'}
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
            <ArrowsClockwise size={15} weight="bold" /> Re-Check for Changes
          </button>
        )}

        {/* Put a document in the jacket. The picker is driven from a hidden
            input because a bare file input cannot be styled to match anything. */}
        {!addendumOpen && (
          <>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Which divider"
              style={{
                background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIR}`, borderRadius: 10,
                padding: '9px 11px', color: TEXT, fontSize: 13, outline: 'none',
              }}
            >
              <option value="attachment">Attachments</option>
              <option value="addendum">Addenda</option>
              <option value="drawing">Drawings</option>
              <option value="specification">Specifications</option>
              <option value="permit">Permits</option>
              <option value="form">Forms</option>
            </select>
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={(e) => attach(e.target.files)}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Paperclip size={15} weight="bold" />
              {busy === 'attach' ? 'Adding…' : 'Add Document'}
            </button>
          </>
        )}

        {/* Levelling is only a real action once a bid has landed. */}
        {(responded ?? 0) > 0 && !addendumOpen && (
          <Link
            href={`/app/projects/${projectId}/bid-packages/${packageId}/leveling`}
            style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
          >
            <Scales size={15} weight="bold" /> Level {responded} bid{responded === 1 ? '' : 's'}
          </Link>
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
      <div style={{ fontSize: 10, fontWeight: 800, color: DIM, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
