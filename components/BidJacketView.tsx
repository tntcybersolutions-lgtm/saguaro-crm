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
 *
 * The part no competitor does: a jacket you send incomplete generates a phone
 * call. So the cover states plainly which required sections are empty, by name,
 * before the invitations go out. "Drawings, Specifications" is actionable;
 * "82% complete" is not.
 *
 * Every document opens in the in-app reader, never a browser tab.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText, Stack, ClipboardText, Ruler, ShieldCheck, Note,
  Paperclip, WarningCircle, CheckCircle, CaretLeft, ArrowSquareOut,
} from '@phosphor-icons/react';
import { SectionCard, PremiumEmpty, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { openPdf } from '@/components/PdfViewer';

const GOLD = 'var(--brand-primary)';
const TEXT = '#F0F4FF';
const DIM = '#A1A1AA';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = '#2CFF7A';
const AMBER = 'var(--warning)';

export type Doc = { id: string; name: string; url: string | null; meta?: string; sub?: string; kind: string };
export type Page = { id: string; title: string; body: string };
export type Section = { key: string; label: string; required: boolean; count: number; pages: Page[]; docs: Doc[] };

export type Jacket = {
  package: {
    id: string; name: string; number: string | null; trade: string | null; status: string | null;
    dueDate: string | null; validityDays: number | null; preBidDate: string | null;
    preBidLocation: string | null; preBidRequired: boolean; csiDivision: string | null;
    estimatedValue: number | null; jacketPdfUrl: string | null; jacketGeneratedAt: string | null;
  };
  project: { id: string; name: string | null; address: string | null; city: string | null; state: string | null };
  sections: Section[];
  lineItems: Array<{ id: string; code: string; description: string; quantity: number | null; unit: string }>;
  requirements: {
    bond: boolean; prevailingWage: boolean; insuranceAmount: number | null;
    generalLiability: number | null; autoLiability: number | null;
    workersComp: number | null; insuranceText: string | null;
    /* Requirements recorded in bid_package_requirements that are not one of the
       six the bid_packages columns model — a bonding capacity floor, a safety
       EMR ceiling, a specific certification. Rendered as their own lines so a
       requirement a GC took the trouble to write down is not silently dropped. */
    additional?: Array<{
      id: string; type: string; description: string | null;
      coverage: number | null; required: boolean; notes: string | null;
    }>;
  };
  bidders: { invited: number; responded: number };
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
};

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

const dateStr = (iso: string | null) => {
  const d = parseStamp(iso);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
};

export default function BidJacketView({
  jacket, projectId, packageId, backHref, slot,
}: {
  jacket: Jacket;
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
  const active = useMemo(() => jacket.sections.find((s) => s.key === tab) ?? null, [jacket, tab]);

  const { package: pkg, project, completeness, requirements, lineItems, bidders } = jacket;
  const days = daysUntil(pkg.dueDate);
  const ready = completeness.missing.length === 0;
  const id = packageId;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 4px 48px' }}>

        {backHref !== null && (
        <Link
          href={backHref ?? `/app/projects/${projectId}/bid-packages/${id}`}
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
            <div style={{ minWidth: 260, flex: '1 1 380px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, marginBottom: 8 }}>
                Bid Jacket{pkg.number ? ` · ${pkg.number}` : ''}{pkg.csiDivision ? ` · Div ${pkg.csiDivision}` : ''}
              </div>
              <h1 style={{ fontSize: 'clamp(23px, 3.2vw, 31px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px', lineHeight: 1.2 }}>
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
              <Stat label="Invited" value={String(bidders.invited)} note={`${bidders.responded} responded`} tone="dim" />
              {pkg.estimatedValue != null && (
                <Stat label="Estimated" value={money(pkg.estimatedValue) || '—'} tone="dim" />
              )}
            </div>
          </div>

          {/* ── Thickness ────────────────────────────────────────────────────
              A jacket you can see through is one you should not send yet. The
              missing sections are named, because that is what the GC has to go
              and fix. */}
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
            <div style={{ flex: '1 1 320px', minWidth: 240 }}>
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
        </div>

        {/* Caller-supplied controls sit directly under the cover, where the
            actions on a physical jacket live: on the front, not buried inside. */}
        {slot ? <div style={{ marginBottom: 18 }}>{slot}</div> : null}

        {/* ── Dividers + shelf ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>

          {/* Tabs. Count and an empty-marker on each, so the shape of the whole
              jacket is visible without opening every divider. */}
          <nav
            style={{
              border: `1px solid ${HAIR}`, borderRadius: 14, overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
              position: 'sticky', top: 96,
            }}
          >
            {jacket.sections.map((s) => {
              const on = s.key === tab;
              const empty = s.count === 0;
              return (
                <button
                  key={s.key}
                  onClick={() => setTab(s.key)}
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
                      color: empty && s.required ? AMBER : DIM,
                    }}
                  >
                    {empty && s.required ? '—' : s.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Shelf */}
          <div style={{ minWidth: 0, display: 'grid', gap: 14 }}>
            {active && active.key === 'bidform' && (
              <SectionCard flat title="Bid Form" icon={<FileText size={17} weight="duotone" color={GOLD} />} flush>
                {lineItems.length === 0 ? (
                  <Empty what="line items" hint="Add items to the package so bidders have something to price." />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['Code', 'Description', 'Qty', 'Unit'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10.5, color: DIM, borderBottom: `1px solid ${HAIR}`, fontWeight: 700 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li) => (
                          <tr key={li.id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                            <td style={{ padding: '10px 14px', color: DIM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{li.code || '—'}</td>
                            <td style={{ padding: '10px 14px', color: TEXT }}>{li.description || '—'}</td>
                            <td style={{ padding: '10px 14px', color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{li.quantity ?? '—'}</td>
                            <td style={{ padding: '10px 14px', color: DIM }}>{li.unit || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}

            {active && active.key === 'requirements' && (
              <SectionCard flat title="Insurance & Bonding" icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: active.pages.length ? 16 : 0 }}>
                  <Req label="General Liability" value={money(requirements.generalLiability)} />
                  <Req label="Auto Liability" value={money(requirements.autoLiability)} />
                  <Req label="Workers' Comp" value={money(requirements.workersComp)} />
                  <Req label="Minimum Coverage" value={money(requirements.insuranceAmount)} />
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
            {active && active.pages.length > 0 && active.key !== 'requirements' && (
              <SectionCard flat title={active.label} icon={<span style={{ color: GOLD, display: 'flex' }}>{ICON[active.key]}</span>}>
                {active.pages.map((pg) => <Written key={pg.id} page={pg} />)}
              </SectionCard>
            )}

            {/* Documents — the actual contents of the divider. */}
            {active && active.docs.length > 0 && (
              <SectionCard flat title={`${active.label} · ${active.docs.length}`} icon={<span style={{ color: GOLD, display: 'flex' }}>{ICON[active.key]}</span>} flush>
                <div style={{ display: 'grid', gap: 1, background: HAIR }}>
                  {active.docs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => d.url && openPdf({ url: d.url, title: d.name })}
                      disabled={!d.url}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                        padding: '12px 16px', border: 'none', background: 'var(--bg-surface)',
                        cursor: d.url ? 'pointer' : 'not-allowed', color: TEXT,
                      }}
                    >
                      <FileText size={18} weight="duotone" color={d.url ? GOLD : DIM} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.name}
                        </span>
                        {(d.sub || d.meta) && (
                          <span style={{ display: 'block', fontSize: 11.5, color: DIM, marginTop: 2 }}>
                            {[d.sub, d.meta].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: d.url ? GOLD : DIM }}>
                        {d.url ? 'Open' : 'No file'}
                      </span>
                    </button>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* An empty divider says what belongs in it and where to go. */}
            {active && active.count === 0 && (
              <SectionCard>
                <Empty
                  what={active.label.toLowerCase()}
                  hint={
                    active.key === 'drawings' ? 'Upload drawings to the project and they appear here automatically.'
                    : active.key === 'specs' ? 'Add spec sections to the project and they appear here automatically.'
                    : active.key === 'scope' ? 'Write the scope on the package — it becomes the first pages of the jacket.'
                    : active.key === 'requirements' ? 'Set the insurance limits and bonding on the package.'
                    : active.key === 'invitation' ? 'Add instructions to bidders on the package.'
                    : 'Attach files to this package and they land in the jacket.'
                  }
                  required={active.required}
                />
              </SectionCard>
            )}
          </div>
        </div>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone: 'dim' | 'green' | 'amber' | 'red' }) {
  const c = tone === 'green' ? GREEN : tone === 'amber' ? AMBER : tone === 'red' ? '#FF3B30' : DIM;
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
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: DIM, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: missing ? AMBER : TEXT, fontVariantNumeric: 'tabular-nums' }}>
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
      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(240,244,255,0.88)', whiteSpace: 'pre-wrap', maxWidth: '68ch' }}>
        {page.body}
      </div>
    </div>
  );
}

function Empty({ what, hint, required }: { what: string; hint: string; required?: boolean }) {
  return (
    <PremiumEmpty
      icon={<WarningCircle size={28} weight="duotone" color={required ? AMBER : DIM} />}
      title={required ? `No ${what} in this jacket yet` : `No ${what}`}
      description={hint}
    />
  );
}
