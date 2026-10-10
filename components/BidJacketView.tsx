'use client';

/**
 * BidJacketView — the contents of a bid jacket, rendered.
 *
 * Split from the route so the presentation takes its data as a prop instead of
 * fetching it. The page owns loading and failure; this owns what a jacket looks
 * like. That separation is also what makes the populated view reviewable
 * without a live session behind it.
 *
 * A physical jacket is a container, and three of its properties are what make
 * it usable across a desk: a LABEL you read at a glance, TABBED DIVIDERS you
 * thumb through, and a THICKNESS that tells you whether it is complete before
 * you hand it over. Those are what this keeps. It does not imitate kraft paper
 * or paperclips — skeuomorphism ages badly and gets in the way of scanning.
 * The cover also carries a CONTENTS list, the transmittal that goes on the
 * front of every real bid set: which sheets and sections are inside.
 *
 * The part no competitor does: a jacket you send incomplete generates a phone
 * call. So the GC's cover states plainly which required sections are empty, by
 * name, before the invitations go out. "Drawings, Specifications" is
 * actionable; "82% complete" is not.
 *
 * Two audiences, one view. The bidder's copy arrives without the GC's figures
 * (who else was invited, the budget, the completeness checklist — see
 * forBidder in lib/bid-jacket), and the view reads their absence as bidder
 * mode: no checklist, no "go and fix this" hints that point into the GC's app.
 *
 * Every document opens in the in-app reader, never a browser tab.
 */

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FileText, Stack, ClipboardText, Ruler, ShieldCheck, Note,
  Paperclip, WarningCircle, CheckCircle, CaretLeft, ArrowSquareOut, ChatsCircle, CaretRight,
} from '@phosphor-icons/react';
import { SectionCard, PremiumEmpty, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { openPdf } from '@/components/PdfViewer';
import JacketCorrespondence from '@/components/JacketCorrespondence';
import type { CommItem } from '@/lib/jacket-correspondence';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = 'var(--success)';
const AMBER = 'var(--warning)';

export type Doc = { id: string; name: string; url: string | null; meta?: string; sub?: string; kind: string; fp?: string | null };
/** `bullets` is set for list columns (work included / excluded). */
export type Page = { id: string; title: string; body: string; bullets?: string[] };
export type Section = { key: string; label: string; required: boolean; count: number; pages: Page[]; docs: Doc[] };

type Coverage = number | string | null;

/** What a bidder is sent: the jacket without the GC's own figures. */
export type BidderJacket = {
  package: {
    id: string; name: string; number: string | null; trade: string | null; status: string | null;
    dueDate: string | null; validityDays: number | null; preBidDate: string | null;
    preBidLocation: string | null; preBidRequired: boolean; csiDivision: string | null;
    jacketPdfUrl: string | null; jacketGeneratedAt: string | null;
  };
  project: { id: string; name: string | null; address: string | null; city: string | null; state: string | null };
  sections: Section[];
  lineItems: Array<{ id: string; code: string; description: string; quantity: number | null; unit: string }>;
  requirements: {
    bond: boolean; prevailingWage: boolean;
    /** Null unless the GC set it (the column default alone is not a requirement). */
    insuranceAmount: number | null;
    /** A figure, or a term such as "Statutory". */
    generalLiability: Coverage; autoLiability: Coverage; workersComp: Coverage;
    insuranceText: string | null;
    /* Requirements recorded in bid_package_requirements that are not one of the
       six the bid_packages columns model — a bonding capacity floor, a safety
       EMR ceiling, a specific certification. Rendered as their own lines so a
       requirement a GC took the trouble to write down is not silently dropped. */
    additional?: Array<{
      id: string; type: string; description: string | null;
      coverage: number | null; required: boolean; notes: string | null;
    }>;
  };
};

/** The GC's jacket: everything the bidder gets, plus who was invited, the
 *  budget, the correspondence and the completeness checklist. */
export type Jacket = Omit<BidderJacket, 'package'> & {
  package: BidderJacket['package'] & { estimatedValue: number | null };
  bidders: { invited: number; responded: number };
  /** GC view only: every email, chat, ask and bid on the package, newest first. */
  correspondence?: CommItem[] | null;
  completeness: { complete: number; total: number; missing: string[] };
};

const ICON: Record<string, React.ReactNode> = {
  invitation: <Note size={16} weight="duotone" />,
  scope: <ClipboardText size={16} weight="duotone" />,
  drawings: <Ruler size={16} weight="duotone" />,
  specs: <Stack size={16} weight="duotone" />,
  bidform: <FileText size={16} weight="duotone" />,
  requirements: <ShieldCheck size={16} weight="duotone" />,
  addenda: <WarningCircle size={16} weight="duotone" />,
  attachments: <Paperclip size={16} weight="duotone" />,
  correspondence: <ChatsCircle size={16} weight="duotone" />,
};

/** Dividers that hold documents — the ones the cover's contents list names. */
const DOC_DIVIDERS = ['drawings', 'specs', 'addenda', 'attachments'];

/**
 * Parse a stored date the way a bid deadline is meant.
 *
 * bid_packages stores the due date as a plain calendar day, "2026-10-14".
 * `new Date("2026-10-14")` is defined to read that as midnight UTC, so once it
 * is formatted in any timezone west of Greenwich it moves back a day: in
 * Arizona, UTC-7, this jacket printed "Oct 13, 2026" for a package the GC's own
 * screen called Oct 14. The general contractor and the subcontractor were
 * reading different deadlines off the same record, on the one document whose
 * job is to say when the bid is due.
 *
 * A calendar day has no timezone, so it must not be given one. A YYYY-MM-DD
 * value is built as local midnight; anything else — a real timestamp — is left
 * for Date to parse as it always did.
 */
function parseStamp(iso: string | null): Date | null {
  if (!iso) return null;
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const d = dayOnly
    ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
    : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Days until the bid is due — the number a GC actually tracks. */
function daysUntil(iso: string | null): number | null {
  const d = parseStamp(iso);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

const money = (n: number | null) =>
  n == null ? null : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** A coverage figure as money, a term ("Statutory") as written. */
const coverage = (v: Coverage) => (v == null ? null : typeof v === 'number' ? money(v) : v);

const dateStr = (iso: string | null) => {
  const d = parseStamp(iso);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
};

export default function BidJacketView({
  jacket, projectId, packageId, backHref, slot,
}: {
  jacket: Jacket | BidderJacket;
  projectId: string;
  packageId: string;
  /** Where "back" goes. Pass null for the bidder's portal view — the default
   *  points at an authed route a logged-out subcontractor cannot open. */
  backHref?: string | null;
  /** Rendered under the cover: assembly controls for the GC, the bid form for
   *  a bidder. Keeps this component presentational for both audiences. */
  slot?: React.ReactNode;
}) {
  const firstFilled = jacket.sections.find((s) => s.count > 0)?.key ?? 'invitation';
  const [tab, setTab] = useState(firstFilled);
  const shelf = useRef<HTMLDivElement>(null);
  /* On a phone the dividers sit above the shelf, so opening one scrolls to
     what it holds instead of leaving it below the fold. */
  const open = (key: string) => {
    setTab(key);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches) {
      requestAnimationFrame(() => shelf.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };
  const active = useMemo(() => jacket.sections.find((s) => s.key === tab) ?? null, [jacket, tab]);

  const { package: pkg, project, requirements, lineItems } = jacket;
  /* The GC's copy carries its checklist; the bidder's never does. */
  const gc = 'completeness' in jacket && !!jacket.completeness;
  const completeness = gc ? (jacket as Jacket).completeness : null;
  const bidders = gc ? (jacket as Jacket).bidders : null;
  const estimatedValue = 'estimatedValue' in pkg ? pkg.estimatedValue : null;
  const days = daysUntil(pkg.dueDate);
  const ready = !!completeness && completeness.missing.length === 0;
  const id = packageId;
  const packageHref = `/app/projects/${projectId}/bid-packages/${id}`;
  const contents = jacket.sections.filter((s) => DOC_DIVIDERS.includes(s.key) && s.docs.length > 0);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 4px 48px' }}>

        {backHref !== null && (
        <Link
          href={backHref ?? packageHref}
          style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, textDecoration: 'none' }}
        >
          <CaretLeft size={14} weight="bold" /> Back to Package
        </Link>
        )}

        {/* ── The label ─────────────────────────────────────────────────────
            What is printed on the outside of a physical jacket: which job,
            which trade, when it is due. Read at arm's length, in that order. */}
        <div
          style={{
            border: `1px solid ${HAIR}`,
            borderLeft: `3px solid ${GOLD}`,
            borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 40px rgba(0,0,0,0.34)',
            padding: 'clamp(20px, 3vw, 30px)',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0, flex: '1 1 300px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, marginBottom: 8 }}>
                Bid Jacket{pkg.number ? ` · ${pkg.number}` : ''}{pkg.csiDivision ? ` · Div ${pkg.csiDivision}` : ''}
              </div>
              <h1 style={{ fontSize: 'clamp(23px, 3.2vw, 31px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px', lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                {pkg.trade || pkg.name}
              </h1>
              <div style={{ color: DIM, fontSize: 14, lineHeight: 1.55 }}>
                {project.name}
                {project.address ? ` · ${project.address}` : ''}
                {project.city ? `, ${project.city}` : ''}{project.state ? ` ${project.state}` : ''}
              </div>
            </div>

            {/* The two dates that decide whether a sub can bid at all. */}
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              <Stat
                label="Bids Due"
                value={dateStr(pkg.dueDate) || 'Not set'}
                note={days == null ? undefined : days < 0 ? 'Closed' : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} left`}
                tone={days == null ? 'dim' : days < 0 ? 'red' : days <= 3 ? 'amber' : 'green'}
              />
              {pkg.preBidDate && (
                <Stat
                  label={pkg.preBidRequired ? 'Pre-bid (required)' : 'Pre-bid'}
                  value={dateStr(pkg.preBidDate) || '—'}
                  note={pkg.preBidLocation || undefined}
                  tone="dim"
                />
              )}
              {bidders && (
                <Stat label="Invited" value={String(bidders.invited)} note={`${bidders.responded} responded`} tone="dim" />
              )}
              {estimatedValue != null && (
                <Stat label="Estimated" value={money(estimatedValue) || '—'} tone="dim" />
              )}
            </div>
          </div>

          {/* ── Contents ─────────────────────────────────────────────────────
              The transmittal on the front of a bid set: which sheets and
              sections are inside, before anyone opens a divider. Each line
              opens its divider. */}
          {contents.length > 0 && (
            <div className="bjv-contents" style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${HAIR}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: DIM, marginBottom: 6 }}>In This Jacket</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
                {contents.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className="bjv-toc"
                    onClick={() => open(s.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0, minHeight: 40,
                      padding: '6px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
                      textAlign: 'left', color: TEXT,
                    }}
                  >
                    <span style={{ color: GOLD, display: 'flex', flexShrink: 0 }}>{ICON[s.key]}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {s.label} <span style={{ color: DIM, fontVariantNumeric: 'tabular-nums' }}>{s.docs.length}</span>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.docs.map((d) => d.name).join(' · ')}
                    </span>
                    <CaretRight size={13} weight="bold" color={DIM} style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Thickness (GC only) ──────────────────────────────────────────
              A jacket you can see through is one you should not send yet. The
              missing sections are named, because that is what the GC has to go
              and fix. A bidder is never shown the GC's checklist. */}
          {completeness && (
          <div
            style={{
              marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIR}`,
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
            }}
          >
            {ready ? (
              <CheckCircle size={20} weight="fill" color={GREEN} />
            ) : (
              <WarningCircle size={20} weight="fill" color={AMBER} />
            )}
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: ready ? GREEN : AMBER, marginBottom: 4 }}>
                {ready
                  ? 'Complete — ready to send'
                  : `Incomplete — ${completeness.missing.join(', ')} ${completeness.missing.length === 1 ? 'is' : 'are'} empty`}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: completeness.total }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 5, flex: 1, borderRadius: 3,
                      background: i < completeness.complete ? (ready ? GREEN : GOLD) : 'rgba(255,255,255,0.12)',
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: DIM, fontVariantNumeric: 'tabular-nums' }}>
              {completeness.complete} of {completeness.total} required sections
            </div>
            {pkg.jacketPdfUrl && (
              <button
                onClick={() => openPdf({ url: pkg.jacketPdfUrl!, title: `${pkg.trade || pkg.name} — Bid Jacket` })}
                style={{ ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <ArrowSquareOut size={15} weight="bold" /> Printed Jacket
              </button>
            )}
          </div>
          )}
          {!completeness && pkg.jacketPdfUrl && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => openPdf({ url: pkg.jacketPdfUrl!, title: `${pkg.trade || pkg.name} — Bid Jacket` })}
                style={{ ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <ArrowSquareOut size={15} weight="bold" /> Printed Jacket
              </button>
            </div>
          )}
        </div>

        {/* Caller-supplied controls sit directly under the cover, where the
            actions on a physical jacket live: on the front, not buried inside. */}
        {slot ? <div style={{ marginBottom: 18 }}>{slot}</div> : null}

        {/* ── Dividers + shelf ─────────────────────────────────────────────── */}
        {/* Narrow screens: the dividers stack above the shelf, every one in
            view at 44px — side by side left the shelf a sliver that wrapped
            one word per line. Two-up on a small tablet, one column on a phone
            so no divider name is cut off. */}
        <style>{`
          @media (max-width: 760px) {
            .bjv-grid { grid-template-columns: minmax(0, 1fr) !important; }
            .bjv-nav { position: static !important; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .bjv-tab, .bjv-toc { min-height: 44px !important; }
            .bjv-shelf { scroll-margin-top: 72px; }
          }
          @media (max-width: 520px) {
            .bjv-nav { grid-template-columns: minmax(0, 1fr); }
            .bjv-tab { font-size: 14px !important; }
            .bjv-bf th, .bjv-bf td { padding-left: 7px !important; padding-right: 7px !important; }
          }
        `}</style>
        <div className="bjv-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>

          {/* Tabs. Count and an empty-marker on each, so the shape of the whole
              jacket is visible without opening every divider. */}
          <nav
            className="bjv-nav"
            style={{
              border: `1px solid ${HAIR}`, borderRadius: 14, overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
              position: 'sticky', top: 96,
            }}
          >
            {jacket.sections.map((s) => {
              const on = s.key === tab;
              const empty = s.count === 0;
              /* The amber "—" is the GC's to-do marker; a bidder just sees 0. */
              const flag = gc && empty && s.required;
              return (
                <button
                  key={s.key}
                  className="bjv-tab"
                  aria-pressed={on}
                  onClick={() => open(s.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: on ? 'var(--brand-primary-12)' : 'transparent',
                    borderLeft: `3px solid ${on ? GOLD : 'transparent'}`,
                    color: on ? TEXT : empty ? DIM : 'rgba(240,244,255,0.86)',
                    fontSize: 13, fontWeight: on ? 700 : 500,
                  }}
                >
                  <span style={{ color: on ? GOLD : DIM, display: 'flex' }}>{ICON[s.key]}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: flag ? AMBER : DIM,
                    }}
                  >
                    {flag ? '—' : s.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Shelf */}
          <div ref={shelf} className="bjv-shelf" style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
            {/* An empty divider says what belongs in it and — for the GC — where
                that is done. Every link here goes to a screen that does it. */}
            {active && active.count === 0 && (
              <SectionCard>
                <EmptyDivider section={active} gc={gc} projectId={projectId} packageHref={packageHref} />
              </SectionCard>
            )}

            {active && active.count > 0 && active.key === 'bidform' && (
              <SectionCard flat title={`Bid Form · ${lineItems.length} line${lineItems.length === 1 ? '' : 's'}`} icon={<FileText size={17} weight="duotone" color={GOLD} />} flush>
                <div style={{ overflowX: 'auto' }}>
                  <table className="bjv-bf" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['#', 'Code', 'Description', 'Qty', 'Unit'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10.5, color: DIM, borderBottom: `1px solid ${HAIR}`, fontWeight: 700 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={li.id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                          <td style={{ padding: '10px 14px', color: DIM, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                          <td style={{ padding: '10px 14px', color: DIM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{li.code || '—'}</td>
                          <td style={{ padding: '10px 14px', color: TEXT, overflowWrap: 'anywhere' }}>{li.description || '—'}</td>
                          <td style={{ padding: '10px 14px', color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{li.quantity ?? '—'}</td>
                          <td style={{ padding: '10px 14px', color: DIM }}>{li.unit || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {active && active.count > 0 && active.key === 'requirements' && (
              <SectionCard flat title="Insurance & Bonding" icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, marginBottom: active.pages.length ? 16 : 0 }}>
                  {/* Only the limits the GC actually set. A wall of "Not set"
                      tiles under a written requirement reads as a contradiction. */}
                  {requirements.generalLiability != null && <Req label="General Liability" value={coverage(requirements.generalLiability)} />}
                  {requirements.autoLiability != null && <Req label="Auto Liability" value={coverage(requirements.autoLiability)} />}
                  {requirements.workersComp != null && <Req label="Workers' Comp" value={coverage(requirements.workersComp)} />}
                  {requirements.insuranceAmount != null && <Req label="Minimum Coverage" value={money(requirements.insuranceAmount)} />}
                  <Req label="Payment & Performance Bond" value={requirements.bond ? 'Required' : 'Not required'} />
                  <Req label="Prevailing Wage" value={requirements.prevailingWage ? 'Required' : 'Not required'} />
                  {(requirements.additional ?? []).map((r) => (
                    <Req
                      key={r.id}
                      label={r.type + (r.required ? '' : ' (optional)')}
                      value={r.coverage != null ? money(r.coverage) : (r.description || (r.required ? 'Required' : 'Optional'))}
                    />
                  ))}
                </div>
                {active.pages.map((pg) => <Written key={pg.id} page={pg} />)}
              </SectionCard>
            )}

            {/* Written pages — scope, instructions. Read, not downloaded. */}
            {active && active.count > 0 && active.pages.length > 0 && active.key !== 'requirements' && (
              <SectionCard flat title={active.label} icon={<span style={{ color: GOLD, display: 'flex' }}>{ICON[active.key]}</span>}>
                {active.pages.map((pg) => <Written key={pg.id} page={pg} />)}
              </SectionCard>
            )}

            {/* Documents — the actual contents of the divider. */}
            {active && active.docs.length > 0 && (
              <SectionCard flat title={`${active.label} · ${active.docs.length}`} icon={<span style={{ color: GOLD, display: 'flex' }}>{ICON[active.key]}</span>} flush>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, background: HAIR }}>
                  {active.docs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => d.url && openPdf({ url: d.url, title: d.name })}
                      disabled={!d.url}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                        padding: '12px 16px', minHeight: 52, border: 'none', background: 'var(--bg-surface)',
                        cursor: d.url ? 'pointer' : 'not-allowed', color: TEXT,
                      }}
                    >
                      <FileText size={18} weight="duotone" color={d.url ? GOLD : DIM} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.name}
                        </span>
                        {(d.sub || d.meta) && (
                          <span style={{ display: 'block', fontSize: 11.5, color: DIM, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[d.sub, d.meta].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: d.url ? GOLD : DIM, flexShrink: 0 }}>
                        {d.url ? 'Open' : 'No file'}
                      </span>
                    </button>
                  ))}
                </div>
              </SectionCard>
            )}

            {active && active.key === 'correspondence' && active.count > 0 && 'correspondence' in jacket && (
              <SectionCard flat title="Correspondence" icon={<ChatsCircle size={17} weight="duotone" color={GOLD} />}>
                <JacketCorrespondence items={jacket.correspondence || []} />
              </SectionCard>
            )}
          </div>
        </div>
    </div>
  );
}

/**
 * What an empty divider says.
 *
 * For the GC: what belongs in it and a link to the screen where it is added —
 * never a hint that leads nowhere. For a bidder: that the GC did not include
 * it, and to ask; never instructions for an app they are not in.
 */
function EmptyDivider({ section, gc, projectId, packageHref }: {
  section: Section; gc: boolean; projectId: string; packageHref: string;
}) {
  const label = section.label.toLowerCase();
  if (!gc) {
    return (
      <PremiumEmpty
        icon={<WarningCircle size={28} weight="duotone" color={DIM} />}
        title={`No ${label} in this jacket`}
        description={
          section.key === 'addenda' ? 'No addenda have been issued. If one is, it appears here and you are emailed.'
          : `The general contractor has not included ${label} in this package. If you need them to price the work, ask before the bid date.`
        }
      />
    );
  }

  const edit = `${packageHref}?edit=details#package-details`;
  const HINT: Record<string, { text: string; href?: string; cta?: string }> = {
    drawings: {
      text: 'Upload sheets on the Drawings page, upload the plan set for a takeoff, or add a file named by its sheet number (A-101, E-401) on the Files page — every one lands here, in every package on the job. Add Document above puts one in this jacket only.',
      href: `/app/projects/${projectId}/drawings`, cta: 'Open Drawings',
    },
    specs: {
      text: 'Add sections on the Specifications page and they land here, in every package on the job. Add Document above, filed under Specifications, puts one in this jacket only.',
      href: `/app/projects/${projectId}/specs`, cta: 'Open Specifications',
    },
    scope: { text: 'Write the scope in the package details — it becomes the first pages of the jacket.', href: edit, cta: 'Edit Package Details' },
    invitation: { text: 'Add instructions to bidders in the package details: how to bid, what to include, where questions go.', href: edit, cta: 'Edit Package Details' },
    requirements: { text: 'Set the insurance limits, bond and prevailing wage in the package details.', href: edit, cta: 'Edit Package Details' },
    bidform: { text: 'Add the line items bidders price on the package page.', href: `${packageHref}#bid-form`, cta: 'Add Line Items' },
    addenda: { text: 'Once the jacket is issued, Issue Addendum above sends one to every bidder. A file added above under Addenda lands here too.' },
    attachments: { text: 'Add Document above puts a file in this jacket — a logistics plan, a geotech report, a form bidders must return.' },
    correspondence: { text: 'Invitations, reminders, addenda, award notices, bids and messages with invited subs land here as they happen.' },
  };
  const hint = HINT[section.key] ?? HINT.attachments;
  return (
    <PremiumEmpty
      icon={<WarningCircle size={28} weight="duotone" color={section.required ? AMBER : DIM} />}
      title={section.required ? `No ${label} in this jacket yet` : `No ${label}`}
      description={hint.text}
      action={hint.href ? (
        <Link href={hint.href} style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          {hint.cta} <CaretRight size={13} weight="bold" />
        </Link>
      ) : undefined}
    />
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone: 'dim' | 'green' | 'amber' | 'red' }) {
  const c = tone === 'green' ? GREEN : tone === 'amber' ? AMBER : tone === 'red' ? 'var(--danger)' : DIM;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: DIM, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ fontSize: 11.5, color: c, marginTop: 3, fontWeight: 600 }}>{note}</div>}
    </div>
  );
}

function Req({ label, value }: { label: string; value: string | null }) {
  const missing = !value;
  return (
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 10, padding: '11px 13px', minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: DIM, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: missing ? AMBER : TEXT, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
        {value || 'Not set'}
      </div>
    </div>
  );
}

function Written({ page }: { page: Page }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 7 }}>
        {page.title}
      </div>
      {page.bullets && page.bullets.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: 'rgba(240,244,255,0.88)', maxWidth: '68ch' }}>
          {page.bullets.map((b, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{b}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(240,244,255,0.88)', whiteSpace: 'pre-wrap', maxWidth: '68ch', overflowWrap: 'anywhere' }}>
          {page.body}
        </div>
      )}
    </div>
  );
}
