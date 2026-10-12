'use client';

/**
 * BidJacketAssembly — the GC's controls, sitting on the front of the jacket.
 *
 * Three things a jacket needs that a read-only list of documents does not:
 *
 *   ISSUE. The act that says "this is the jacket, it is complete, it goes to
 *   these bidders, as of now". It is the same send the package page's invite
 *   uses (lib/bid-issue): an incomplete jacket is stopped with the empty
 *   sections named and a "Send anyway" choice, and afterwards the GC sees
 *   exactly who was emailed and who was not.
 *
 *   DRIFT. Once issued, the GC's view stays live while the bidders hold a
 *   snapshot. A drawing revised afterwards changes what everyone is pricing
 *   with nobody told. This says so, in the one place the GC is already looking,
 *   and offers the addendum that fixes it.
 *
 *   ADDENDA. Numbered, issued to every invitee at once — including the ones who
 *   declined, since a change of scope is often what changes their mind — with
 *   the revised sheet attached, so it lands in the jacket's Addenda divider.
 *
 * Kept out of BidJacketView so that component stays presentational and can be
 * rendered for a logged-out bidder without carrying GC-only actions.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PaperPlaneTilt, WarningCircle, CheckCircle, Plus, X, ArrowsClockwise, Paperclip, Scales, FileText,
} from '@phosphor-icons/react';
import { SectionCard, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { JacketGatePrompt, JacketSendResult, type SendPayload } from '@/components/JacketSendPanels';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = 'var(--success)';
const AMBER = 'var(--warning)';

/* 44px: every control here is used from a phone on site as often as a desk. */
const TAP: React.CSSProperties = { minHeight: 44 };

export type Drift = {
  hasDrift: boolean;
  added: Array<{ section: string; name: string }>;
  removed: Array<{ section: string; name: string }>;
  revised: Array<{ section: string; name: string; from: string | null; to: string | null }>;
  /** Written parts edited since issue — instructions, scope, line items, insurance, dates. */
  changed?: Array<{ section: string; name: string }>;
  issuedVersion: number | null;
  issuedAt: string | null;
};

export type Issued = { at: string; version: number; invited: number; addenda: number } | null;

type AddendumResult = {
  addendumNumber: number;
  notified: number;
  recipients: number;
  delivery: Array<{ email: string; sent: boolean; error?: string }>;
  attached: { name: string | null } | null;
};

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
  /** The empty sections the server named when it stopped an issue. */
  const [gate, setGate] = useState<string[] | null>(null);
  const [sendResult, setSendResult] = useState<SendPayload | null>(null);
  const [addendumOpen, setAddendumOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [addendumFile, setAddendumFile] = useState<File | null>(null);
  const [addendumResult, setAddendumResult] = useState<AddendumResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const addendumFileRef = React.useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState('attachment');

  async function issue(force: boolean) {
    setBusy('issue');
    setNote(null);
    setSendResult(null);
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && Array.isArray(d.missing) && d.missing.length) {
        setGate(d.missing);
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Could not issue this jacket.');
      setGate(null);
      /* Reports what was actually delivered, person by person — "sent to 12"
         when the mail never left is worse than an error. */
      setSendResult(d as SendPayload);
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not issue this jacket.' });
    } finally {
      setBusy(null);
    }
  }

  /** Upload through the one storage path, then hand back the project_files id. */
  async function upload(file: File, cat: string): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', projectId);
    fd.append('entityType', 'bid_package');
    fd.append('entityId', packageId);
    fd.append('category', cat);
    const up = await fetch('/api/files/upload', { method: 'POST', body: fd });
    const ud = await up.json().catch(() => ({}));
    if (!up.ok || !ud.file?.id) throw new Error(ud.error || `Could not upload ${file.name}.`);
    return ud.file.id as string;
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
        const projectFileId = await upload(file, category);
        const at = await fetch(`/api/bid-packages/${packageId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectFileId, category, label: file.name }),
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
    setAddendumResult(null);
    try {
      /* The revised sheet goes up first. If the upload fails nothing is sent —
         an addendum announced without its drawing is worse than a late one. */
      const projectFileId = addendumFile ? await upload(addendumFile, 'addendum') : undefined;
      const r = await fetch(`/api/bid-packages/${packageId}/addendum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, ...(projectFileId ? { projectFileId } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not issue the addendum.');
      setAddendumResult(d as AddendumResult);
      setSummary('');
      setAddendumFile(null);
      if (addendumFileRef.current) addendumFileRef.current.value = '';
      setAddendumOpen(false);
      onChanged();
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not issue the addendum.' });
    } finally {
      setBusy(null);
    }
  }

  const driftCount = drift ? drift.added.length + drift.removed.length + drift.revised.length + (drift.changed?.length ?? 0) : 0;
  const failedSends = (sendResult?.delivery || []).filter((d) => !d.sent && d.outcome === 'failed').length;

  return (
    <SectionCard
      flat
      title={issued ? 'Issued' : 'Ready to Issue'}
      icon={
        issued
          ? <CheckCircle size={17} weight="duotone" color={GREEN} />
          : <PaperPlaneTilt size={17} weight="duotone" color="var(--text-secondary)" />
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
            Issuing checks the jacket for empty sections, records what it contains as v1, sends every
            invited bidder their own link, and starts tracking who opened it. Nothing goes out until you do.
          </div>
        )}
      </div>

      {/* ── Drift: the reason this screen exists after issue ───────────────── */}
      {issued && drift?.hasDrift && (
        <div
          style={{
            border: `1px solid var(--brand-primary-35)`, borderRadius: 12,
            background: 'var(--bg-surface-2)', padding: '13px 15px', marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <WarningCircle size={19} weight="fill" color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: AMBER, fontSize: 14, marginBottom: 5 }}>
                {driftCount} change{driftCount === 1 ? '' : 's'} since you issued v{drift.issuedVersion}
              </div>
              <div style={{ color: DIM, fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                Your bidders are pricing what was in the jacket when it went out. Issue an addendum
                so everyone is working from the same documents.
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, color: TEXT, fontSize: 13, lineHeight: 1.7 }}>
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
                {(drift.changed ?? []).map((d, i) => (
                  <li key={`c${i}`}>Edited <strong>{d.name}</strong><span style={{ color: DIM }}> · {d.section}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Incomplete: stopped, nothing sent. Fix it or send anyway. ─────── */}
      {gate && gate.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <JacketGatePrompt
            missing={gate}
            busy={busy === 'issue'}
            onSendAnyway={() => issue(true)}
            onCancel={() => setGate(null)}
          />
        </div>
      )}

      {/* ── Who was emailed, who was not ──────────────────────────────────── */}
      {sendResult && (
        <div style={{ marginBottom: 16 }}>
          <JacketSendResult result={sendResult} onDismiss={() => setSendResult(null)} />
          {failedSends > 0 && (
            <button
              onClick={() => issue(false)}
              disabled={busy !== null}
              className="pmBtn"
              style={{ ...ghostButtonStyle, ...TAP, marginTop: 10 }}
            >
              <ArrowsClockwise size={15} weight="bold" />
              {busy === 'issue' ? 'Sending…' : `Retry the ${failedSends} Not Delivered`}
            </button>
          )}
        </div>
      )}

      {/* ── Addendum outcome ──────────────────────────────────────────────── */}
      {addendumResult && (
        <div role="status" data-testid="addendum-result" style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: addendumResult.notified === addendumResult.recipients ? GREEN : AMBER }}>
            Addendum {addendumResult.addendumNumber} issued to {addendumResult.notified} of {addendumResult.recipients} bidder{addendumResult.recipients === 1 ? '' : 's'}
            {addendumResult.attached ? ` — ${addendumResult.attached.name || 'the file'} is in the Addenda divider.` : '.'}
          </div>
          {addendumResult.delivery.filter((d) => !d.sent).map((d, i) => (
            <div key={i} style={{ color: 'var(--danger)', fontSize: 13 }}>{d.email} — not delivered{d.error ? `: ${d.error}` : ''}</div>
          ))}
        </div>
      )}

      {note && (
        <div
          role={note.tone === 'bad' ? 'alert' : 'status'}
          style={{
            fontSize: 14, fontWeight: 600, marginBottom: 14,
            color: note.tone === 'ok' ? GREEN : note.tone === 'warn' ? AMBER : 'var(--danger)',
          }}
        >
          {note.text}
        </div>
      )}

      {/* ── Addendum composer ─────────────────────────────────────────────── */}
      {addendumOpen && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: DIM, marginBottom: 6 }}>
            What Changed
          </div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="Fixture schedule revised on sheet P-201; medical gas rough-in moved to the mechanical package."
            style={{
              width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIR}`,
              borderRadius: 10, padding: '11px 13px', color: TEXT, fontSize: 16,
              outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <input
              ref={addendumFileRef}
              type="file"
              data-testid="addendum-file"
              onChange={(e) => setAddendumFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
            {addendumFile ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 6px 0 12px', borderRadius: 10, border: `1px solid ${HAIR}`, color: TEXT, fontSize: 13, maxWidth: '100%' }}>
                <FileText size={15} weight="duotone" color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addendumFile.name}</span>
                <button
                  type="button"
                  aria-label="Remove the attached file"
                  onClick={() => { setAddendumFile(null); if (addendumFileRef.current) addendumFileRef.current.value = ''; }}
                  style={{ ...TAP, minWidth: 44, background: 'transparent', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={14} weight="bold" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => addendumFileRef.current?.click()}
                className="pmBtn"
                style={{ ...ghostButtonStyle, ...TAP }}
              >
                <Paperclip size={15} weight="bold" /> Attach the Revised Sheet
              </button>
            )}
          </div>
          <div style={{ color: DIM, fontSize: 12, marginTop: 6 }}>
            Every invited bidder is sent this text verbatim, including anyone who already declined.
            An attached file goes into the jacket&apos;s Addenda divider.
          </div>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {!issued && !gate && (
          <button
            onClick={() => issue(false)}
            disabled={busy !== null || invited === 0}
            title={invited === 0 ? 'Invite subcontractors first' : undefined}
            className="pmBtn"
            style={{
              ...goldButtonStyle, ...TAP, display: 'inline-flex', alignItems: 'center', gap: 7,
              opacity: invited === 0 ? 0.5 : 1, cursor: invited === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <PaperPlaneTilt size={15} weight="bold" />
            {busy === 'issue' ? 'Issuing…' : `Issue to ${invited} Bidder${invited === 1 ? '' : 's'}`}
          </button>
        )}

        {issued && !addendumOpen && (
          <button
            onClick={() => { setAddendumOpen(true); setAddendumResult(null); }}
            className="pmBtn"
            style={{
              ...(drift?.hasDrift ? goldButtonStyle : ghostButtonStyle), ...TAP,
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
              className="pmBtn"
              style={{ ...goldButtonStyle, ...TAP, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: summary.trim() ? 1 : 0.5 }}
            >
              <PaperPlaneTilt size={15} weight="bold" />
              {busy === 'addendum' ? 'Sending…' : 'Send to All Bidders'}
            </button>
            <button
              onClick={() => { setAddendumOpen(false); setSummary(''); setAddendumFile(null); }}
              className="pmBtn"
              style={{ ...ghostButtonStyle, ...TAP, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <X size={15} weight="bold" /> Cancel
            </button>
          </>
        )}

        {issued && !addendumOpen && (
          <button onClick={onChanged} className="pmBtn" style={{ ...ghostButtonStyle, ...TAP, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
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
                ...TAP, background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIR}`, borderRadius: 10,
                padding: '9px 11px', color: TEXT, fontSize: 16, outline: 'none',
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
              className="pmBtn"
              style={{ ...ghostButtonStyle, ...TAP, display: 'inline-flex', alignItems: 'center', gap: 7 }}
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
            className="pmBtn"
            style={{ ...ghostButtonStyle, ...TAP, display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
          >
            <Scales size={15} weight="bold" /> Level {responded} bid{responded === 1 ? '' : 's'}
          </Link>
        )}
      </div>

      {invited === 0 && !issued && (
        <div style={{ color: DIM, fontSize: 13, marginTop: 10 }}>
          No bidders invited yet — add them on the package page; inviting issues the jacket.
        </div>
      )}
    </SectionCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: DIM, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
