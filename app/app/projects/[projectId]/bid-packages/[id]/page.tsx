'use client';
import { Skeleton, SkeletonKPI, SkeletonRow } from '@/components/ui/Skeleton';
import { StatusPill } from '@/components/ui/Status';
import { confirmDialog } from '@/lib/ui/async-dialog';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toCents, toDollars, sumCents } from '@/lib/calc';
import { FolderOpen, Envelope, ArrowLeft, FileText, Lock, Trophy, Star, Plus, CheckCircle, XCircle, CurrencyDollar, UsersThree, Receipt, Scales } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, FlowStrip, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import BidPackageDetails from '@/components/BidPackageDetails';
import BidFormEditor, { toBidFormLines, type BidFormLine } from '@/components/BidFormEditor';
import JacketPdfButton from '@/components/JacketPdfButton';
import { JacketGatePrompt, JacketSendResult, type SendPayload } from '@/components/JacketSendPanels';
import { inviteState, jacketDelivery, type InviteState, type JacketDelivery } from '@/lib/bid-invite-state';
import { bidAmount } from '@/lib/bid-amount';
import { isBiddingStatus } from '@/lib/bid-deadline';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)',GREEN='var(--success)',RED='var(--danger)';
const MUTED='rgba(255,255,255,0.62)';        // section-header meta text
const HAIR='rgba(255,255,255,0.06)';         // table row hairlines on the dark surface
const TH_BG='rgba(255,255,255,0.03)';        // table header band
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

// ─── Types ───────────────────────────────────────────────────────────────────

/* response_status first, then status — the portal writes response_status
   ('viewed'), and reading status alone meant a GC never saw "Viewed". */
type SubStatus = InviteState;

/** A bid-form line (components/BidFormEditor owns the shape and the mapping). */
type SovItem = BidFormLine;

interface InvitedSub {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  status: SubStatus;
  bid_amount: number | null;
  invited_at: string;
  responded_at: string | null;
  /** Whether the jacket email reached them — and why not, when it did not. */
  delivery: JacketDelivery;
}

interface BidSubmission {
  id: string;
  sub_name: string;
  sub_email: string;
  amount: number;
  submitted_at: string;
  notes: string | null;
  awarded: boolean;
}

interface BidPackage {
  id: string;
  code: string;
  name: string;
  trade: string;
  scope_of_work: string | null;
  scope_narrative: string | null;
  scope_summary: string | null;
  description: string | null;
  status: string;
  /* bid_packages carries TWO due-date columns. Everything that creates a
     package writes due_date — sage-auto-docs and /api/bid-packages/create
     both — while most readers ask for bid_due_date and fall back. The sub
     portal, the leveling view, the bid-reminder cron and the package list all
     do `bid_due_date || due_date`. This screen was the one that did not, so a
     package whose card in the list read "Oct 14, 2026 · 14d left" opened with
     "Due: TBD" in its own header. Same package, two answers, and the wrong one
     was on the page you go to in order to check. */
  bid_due_date: string | null;
  due_date: string | null;
  project_id: string;
  awarded_to: string | null;
  awarded_to_id: string | null;
  awarded_amount: number | null;
  jacket_pdf_url: string | null;
  /** When the jacket was issued, and at what version — null until it is. */
  jacket_generated_at: string | null;
  jacket_version: number | null;
  created_at: string;
  sov_items: SovItem[];
  invited_subs: InvitedSub[];
  bid_submissions: BidSubmission[];
}

/* The invite list: a row per bidder, columns at desktop, stacked on a phone —
   a seven-column table scrolled sideways at 390px with the actions off screen. */
const INVITE_CSS = `
.bpInvHead, .bpInvRow { display: grid; grid-template-columns: minmax(180px, 1.6fr) minmax(100px, .7fr) minmax(150px, 1.1fr) minmax(90px, .6fr) 236px; gap: 12px; align-items: center; padding: 10px 20px; }
.bpInvHead > :last-child { text-align: right; }
.bpInvHead { font-size: 12px; font-weight: 700; color: var(--text-secondary); background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.06); }
.bpInvRow { border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
.bpInvWho { min-width: 0; }
.bpInvAct { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
@media (max-width: 720px) {
  .bpInvHead { display: none; }
  .bpInvRow { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; padding: 14px 16px; }
  .bpInvWho { grid-column: 1 / -1; }
  .bpInvAct { grid-column: 1 / -1; justify-content: flex-start; }
}
`;

// ─── Badge ───────────────────────────────────────────────────────────────────

function Badge({ label, color = DIM, bg = 'rgba(148,163,192,.1)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color, letterSpacing: 0.3 }}>
      {label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

/** The jacket email, as one short line for the invite table. */
function DeliveryCell({ d }: { d: JacketDelivery }) {
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
  if (d.state === 'emailed') {
    return <span style={{ color: 'var(--success)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} weight="fill" color="var(--success)" /> Emailed {date(d.at)}</span>;
  }
  if (d.state === 'failed') {
    return (
      <span title={d.error || undefined} style={{ color: 'var(--danger)', fontSize: 12, display: 'inline-flex', alignItems: 'flex-start', gap: 4, maxWidth: 240 }}>
        <XCircle size={12} weight="fill" color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Not delivered{d.error ? ` — ${d.error}` : ''}</span>
      </span>
    );
  }
  return <span style={{ color: DIM, fontSize: 12 }}>Not emailed yet</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BidPackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;
  const id = params['id'] as string;

  const [pkg, setPkg] = useState<BidPackage | null>(null);
  const [loading, setLoading] = useState(true);
  /* A failed load is not "not found". The page used to swallow the error and
     show nothing — now it says what happened and offers Retry. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reminding, setReminding] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  /* The send gate and its outcome stay on the page until the GC deals with
     them — a toast that expires is not a decision. */
  const [gate, setGate] = useState<{ missing: string[]; subs: Array<Record<string, string | undefined>> } | null>(null);
  const [sendResult, setSendResult] = useState<SendPayload | null>(null);
  const [awardNote, setAwardNote] = useState<{ tone: 'ok' | 'warn'; lines: string[] } | null>(null);
  const [awarding, setAwarding] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);

  // Invite more subs
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  /* THE DIRECTORY THE REST OF THE PRODUCT ALREADY KEEPS.
     This form was two free-text boxes, so inviting a sub you had already
     entered meant typing their company and email again from memory — with the
     typo risk on the address the whole bid depends on, and no link back to the
     record holding their license, insurance and W-9 status. The subs page even
     advertises "picking a directory company pre-fills contacts, license, and
     compliance"; this screen was the one place that ignored it.
     /api/bid-packages/[id]/invite-subs has accepted a `subId` on each sub the
     whole time — nothing needed building on the server, only offering. */
  const [directory, setDirectory] = useState<Array<{ id: string; company_name: string; email: string | null; trade: string | null }>>([]);
  const [pickedSubId, setPickedSubId] = useState('');
  /* A compliance hold the GC still has to resolve — not a toast that expires
     before they have decided. */
  const [complianceHold, setComplianceHold] = useState<{ submissionId: string; subName: string; message: string } | null>(null);
  const [requestingDocs, setRequestingDocs] = useState(false);

  useEffect(() => { loadPackage(); }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/subcontractors')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled || !j) return;
        // /api/subcontractors answers { subs: [...] } — the other shapes are
        // tolerated so this keeps working if that envelope is ever renamed.
        const rows = Array.isArray(j) ? j : (j.subs ?? j.data ?? j.subcontractors ?? []);
        setDirectory(Array.isArray(rows) ? rows : []);
      })
      .catch(() => { /* the form still works by hand if the directory is unavailable */ });
    return () => { cancelled = true; };
  }, []);

  // Dead-space kill (spec 4.1): a package with no invites opens straight into
  // the invite composer — no hunting for "Invite More". One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && pkg && pkg.invited_subs.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowInviteForm(true);
    }
  }, [loading, pkg]);

  function showToast(msg: string, color: string = 'var(--success)') {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadPackage() {
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    try {
      const r = await fetch(`/api/bid-packages/${id}`);
      const d = await r.json().catch(() => ({})) as any;
      if (r.status === 404) { setPkg(null); setNotFound(true); return; }
      if (!r.ok) throw new Error(d.error || 'This bid package could not be loaded.');
      if (d.bidPackage) {
        // GET route returns items / invites / submissions at the TOP LEVEL (not nested on
        // bidPackage) and with DB column names. Map them onto the page's interfaces so SOV,
        // invited subs and submissions render — and the Award button appears when bids exist.
        const sov_items: SovItem[] = toBidFormLines(d.items || []);
        const bid_submissions: BidSubmission[] = (d.submissions || []).map((sb: any) => ({
          id: String(sb.id),
          sub_name: sb.company_name || sb.sub_name || sb.contact_name || '—',
          sub_email: String(sb.contact_email || sb.sub_email || '').toLowerCase(),
          /* First positive of base_amount / amount / base_bid — amount defaults
             to 0, so `base_amount ?? amount` showed $0 for some bids. */
          amount: bidAmount(sb),
          submitted_at: sb.submitted_at || sb.created_at || '',
          notes: sb.notes ?? null,
          awarded: sb.is_awarded === true || String(sb.status || '').toLowerCase() === 'awarded',
        }));
        /* bid_package_invites has no bid_amount column — the figure lives on
           the bid. Matched by address, the key both bid portals write. */
        const bidByEmail = new Map(bid_submissions.map((b) => [b.sub_email, b.amount]));
        const issuedAt: string | null = d.bidPackage.jacket_generated_at || null;
        const invited_subs: InvitedSub[] = (d.invites || []).map((iv: any) => {
          const email = String(iv.sub_email || '').toLowerCase();
          return {
            id: String(iv.id),
            company_name: iv.company_name || iv.sub_name || '—',
            contact_name: iv.contact_name || '',
            email,
            status: inviteState(iv),
            bid_amount: bidByEmail.get(email) ?? null,
            invited_at: iv.invited_at || iv.invitation_sent_at || iv.created_at || '',
            responded_at: iv.responded_at || null,
            delivery: jacketDelivery(iv, issuedAt, iv.last_email),
          };
        });
        setPkg({ ...d.bidPackage, sov_items, invited_subs, bid_submissions });
      } else {
        throw new Error('This bid package could not be loaded.');
      }
    } catch (e) {
      console.error('[bid package] load failed', e);
      setLoadError(e instanceof Error ? e.message : 'This bid package could not be loaded.');
    } finally { setLoading(false); }
  }

  async function sendReminder(inviteId: string, companyName: string) {
    setReminding(inviteId);
    try {
      const r = await fetch(`/api/bid-packages/${id}/remind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, packageId: id }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) throw new Error(d.error || 'Reminder failed.');
      showToast(`Reminder sent to ${companyName}.`);
    } catch (e: any) {
      showToast(e?.message || `Could not send reminder to ${companyName}. Please try again.`, 'var(--danger)');
    } finally { setReminding(null); }
  }

  /**
   * Award a bid, and when compliance holds it, keep the two ways forward on
   * screen.
   *
   * The API's hold reads: "Compliance hold — W-9 not on file. Award anyway with
   * override, or request the documents first." Both of those are real —
   * /award takes overrideCompliance, /api/documents/w9-request files the
   * request — and the page offered neither. The sentence arrived as a toast,
   * the toast expired, and the GC was left facing the same Award button that
   * had just refused, with no way to do either thing it had told them to do.
   *
   * The hold is now state rather than a message: it names what is missing and
   * carries the override and the request beside it until it is dealt with.
   */
  async function awardBid(submissionId: string, subName: string, opts?: { override?: boolean }) {
    if (!opts?.override && !(await confirmDialog({ title: 'Please confirm', message: `Award bid to ${subName}?`, danger: false }))) return;
    setAwarding(submissionId);
    setComplianceHold(null);
    try {
      const r = await fetch(`/api/bid-packages/${id}/award`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, packageId: id, overrideCompliance: !!opts?.override }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) {
        const msg = String(d.error || 'Award failed.');
        /* A compliance hold is not a failure to report and forget — it is a
           decision the GC now has to make, so it stays on the page. */
        if (/compliance hold/i.test(msg)) {
          setComplianceHold({ submissionId, subName, message: msg });
          return;
        }
        throw new Error(msg);
      }
      /* Say what the award actually did: who was told, who was not, and any
         part of the chain (the draft PO) that did not happen. */
      const lines: string[] = [];
      const n = d.notices || {};
      if (n.winner) lines.push(n.winner.sent ? `Award notice emailed to ${n.winner.email}.` : `${subName} was not emailed — ${n.winner.error || 'not delivered'}.`);
      const losers: any[] = Array.isArray(n.losers) ? n.losers : [];
      if (losers.length) {
        const told = losers.filter((l) => l.sent).length;
        lines.push(`${told} of ${losers.length} other bidder${losers.length === 1 ? '' : 's'} told they were not selected.`);
        for (const l of losers.filter((x) => !x.sent)) lines.push(`${l.name || l.email || 'A bidder'} was not emailed — ${l.error || 'not delivered'}.`);
      }
      for (const w of (Array.isArray(d.warnings) ? d.warnings : [])) lines.push(String(w));
      const clean = (!n.winner || n.winner.sent) && losers.every((l) => l.sent) && !(d.warnings || []).length;
      setAwardNote({ tone: clean ? 'ok' : 'warn', lines: [`Awarded to ${subName}.`, ...lines] });
      await loadPackage();
    } catch (e: any) {
      showToast(e?.message || `Could not award bid to ${subName}. Please try again.`, 'var(--danger)');
    } finally { setAwarding(null); }
  }

  /** File the W-9 request the hold told them to send. */
  async function requestW9(subName: string, subEmail: string | null) {
    setRequestingDocs(true);
    try {
      const r = await fetch('/api/documents/w9-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, vendorName: subName, vendorEmail: subEmail || '' }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) throw new Error(d.error || 'Could not file the W-9 request.');
      showToast(`W-9 requested from ${subName}.`);
    } catch (e: any) {
      showToast(e?.message || `Could not request the W-9 from ${subName}.`, 'var(--danger)');
    } finally { setRequestingDocs(false); }
  }

  async function closeBids() {
    if (!(await confirmDialog({ title: 'Please confirm', message: 'Close this bid package? No more bids will be accepted.', danger: true }))) return;
    setClosing(true);
    try {
      const r = await fetch(`/api/bid-packages/${id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: id }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) throw new Error(d.error || 'Close failed.');
      if (pkg) setPkg({ ...pkg, status: 'closed' });
      showToast('Bidding closed.');
    } catch (e: any) {
      showToast(e?.message || 'Could not close bidding. Please try again.', 'var(--danger)');
    } finally { setClosing(false); }
  }

  /**
   * Invite subs — which, on a package not issued yet, issues it. The server
   * checks the jacket first: an incomplete one comes back 409 naming the empty
   * sections, nothing is sent, and the GC chooses to fix it or send anyway.
   * Whatever is sent, the page then lists exactly who was emailed and who was
   * not.
   */
  async function sendInvites(subs: Array<Record<string, string | undefined>>, force: boolean) {
    setInviting(true);
    setSendResult(null);
    try {
      const r = await fetch(`/api/bid-packages/${id}/invite-subs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subs, force }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (r.status === 409 && Array.isArray(d.missing) && d.missing.length) {
        setGate({ missing: d.missing, subs });
        return;
      }
      if (!r.ok) throw new Error(d.error || 'The invitation could not be sent.');
      setGate(null);
      setSendResult(d as SendPayload);
      setInviteName('');
      setInviteEmail('');
      setPickedSubId('');
      setShowInviteForm(false);
      await loadPackage();
    } catch (e: any) {
      showToast(e?.message || `Could not send the invite. Please try again.`, 'var(--danger)');
    } finally { setInviting(false); }
  }

  async function handleInviteMore() {
    if (!inviteEmail.trim()) return;
    /* subId ties the invite to the directory record, which is what lets the
       award gate read their W-9 and insurance later. Omitted when the GC
       typed a company that is not on file yet. */
    await sendInvites([{ name: inviteName.trim() || undefined, email: inviteEmail.trim(), subId: pickedSubId || undefined }], false);
  }

  /** Cut one bidder's link off. Their bid, if any, stays on the sheet. */
  async function revokeLink(sub: InvitedSub) {
    const ok = await confirmDialog({
      title: `Revoke ${sub.company_name}'s link?`,
      message: `${sub.email} will no longer be able to open this bid jacket or submit a bid.${sub.status === 'submitted' ? ' The bid they already sent stays on the sheet.' : ''} Inviting them again restores it.`,
      confirmLabel: 'Revoke Link',
      danger: true,
    });
    if (!ok) return;
    setRevoking(sub.id);
    try {
      const r = await fetch(`/api/bid-packages/${id}/invites/${sub.id}/revoke`, { method: 'POST' });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok) throw new Error(d.error || 'The link could not be revoked.');
      showToast(d.message || `${sub.company_name}'s link is revoked.`);
      await loadPackage();
    } catch (e: any) {
      showToast(e?.message || 'The link could not be revoked.', 'var(--danger)');
    } finally { setRevoking(null); }
  }

  // ── Loading / Not Found ──────────────────────────────────────────────────

  if (loading) return (
    <PremiumSurface maxWidth={2200}>
      {/* Layout-true shell — back stays live; hero, stats and the invite list
          paint as skeletons shaped like the real content (house pattern: rfis). */}
      <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} className="pmBtn" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <ArrowLeft size={14} weight="bold" />
        Bid Packages
      </button>
      <div style={{ marginBottom: 24 }}>
        <Skeleton width={110} height={11} style={{ marginBottom: 12 }} />
        <Skeleton width={300} height={32} style={{ marginBottom: 10, maxWidth: '70%' }} />
        <Skeleton width={220} height={13} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI />
      </div>
      <SectionCard flat title="Invited Subcontractors" icon={<UsersThree size={17} weight="duotone" color="var(--text-secondary)" />} flush>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </SectionCard>
    </PremiumSurface>
  );

  if (!pkg) return (
    <PremiumSurface maxWidth={2200}>
      <SectionCard>
        {notFound || !loadError ? (
          <PremiumEmpty
            tone="error"
            icon={<Envelope size={30} weight="duotone" color="var(--text-secondary)" />}
            title="Bid Package Not Found"
            description="This bid package is not on your account. It may have been removed, or the link is out of date."
            action={
              <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={{ ...ghostButtonStyle, minHeight: 44 }} className="pmBtn">
                <ArrowLeft size={15} weight="bold" /> Go Back
              </button>
            }
          />
        ) : (
          <PremiumEmpty
            tone="error"
            icon={<Envelope size={30} weight="duotone" color="var(--text-secondary)" />}
            title="Couldn't Load This Bid Package"
            description={`${loadError} Nothing on it has been lost.`}
            action={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={loadPackage} style={{ ...goldButtonStyle, minHeight: 44 }} className="pmBtn">
                  Retry
                </button>
                <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={{ ...ghostButtonStyle, minHeight: 44 }} className="pmBtn">
                  <ArrowLeft size={15} weight="bold" /> Bid Packages
                </button>
              </div>
            }
          />
        )}
      </SectionCard>
    </PremiumSurface>
  );

  const issuedOn = pkg.jacket_generated_at
    ? new Date(pkg.jacket_generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  /* 'sent' is what issuing writes — it is open for bids, same as 'open'. */
  const statusWord = isBiddingStatus(pkg.status) ? 'open' : (pkg.status || 'draft');
  const liveInvites = pkg.invited_subs.filter((s) => s.status !== 'revoked');

  const totalSov = toDollars(sumCents(pkg.sov_items.map(i => toCents(i.total))));
  const submittedSubs = liveInvites.filter(s => s.status === 'submitted');
  const submissions = pkg.bid_submissions || [];

  /* 16px and 44px: smaller text makes iOS zoom the page on focus. */
  const inp: React.CSSProperties = { padding: '8px 12px', minHeight: 44, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 16, outline: 'none' };

  // Header action buttons (Download PDF + optional Close Bidding)
  const headerActions = (
    <>
      {/* The jacket is the deliverable — drawings, specs, bid form and
          requirements assembled into something a sub can actually work from.
          The flat PDF stays available beside it, but it is the printed copy of
          one section, not the package. */}
      <Link
        href={`/app/projects/${projectId}/bid-packages/${id}/jacket`}
        style={{ ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
        className="pmBtn"
      >
        <FolderOpen size={16} weight="duotone" /> Open Bid Jacket
      </Link>
      {/* Download PDF builds the printed jacket from the jacket as it is now.
          It used to open whatever PDF was stored (most were the snapshot Sage
          took at creation), and with none stored it posted to a generator
          that answered 400 every time. */}
      <JacketPdfButton
        packageId={id}
        title={`${pkg.name || pkg.trade || 'Bid package'} — Bid Jacket`}
        onBuilt={(pdf) => setPkg((cur) => (cur ? { ...cur, jacket_pdf_url: pdf.storedUrl } : cur))}
        onError={(msg) => showToast(msg, 'var(--danger)')}
      />
      {/* LEVELLING BELONGS WHERE THE BIDS ARE.
          This page lists every bid received and an Award button beside each
          one, and had no route to the screen that compares them — spread, low
          bid, gaps, who has not answered. The only link to levelling in the
          product was on the company bid board, and it pointed at
          /app/bids/levelling with no ?package=, which is the one argument that
          page reads; it opens empty without it. So the GC's choice was award
          from a list of numbers, or find the tool by hand and then pick the
          package again.
          Linked through the project-scoped route, which redirects carrying the
          id, and shown only once a bid exists — there is nothing to level
          against an empty package. */}
      {submissions.length > 0 && (
        <Link
          href={`/app/projects/${projectId}/bid-packages/${id}/leveling`}
          style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
          className="pmBtn"
        >
          <Scales size={16} weight="duotone" /> Level {submissions.length} Bid{submissions.length === 1 ? '' : 's'}
        </Link>
      )}
      {pkg.status !== 'closed' && pkg.status !== 'awarded' && (
        <button onClick={closeBids} disabled={closing} className="pmBtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, background: 'rgba(192,48,48,.12)', border: '1px solid rgba(192,48,48,.3)', color: 'var(--danger)', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: closing ? 0.6 : 1 }}>
          {closing ? 'Closing…' : <><Lock size={15} weight="bold" /> Close Bidding</>}
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Toast */}
      {toast && (
        /* maxWidth: pinned to the right with no limit, a long message on a
           phone ran off the left edge of the screen. */
        <div role="status" style={{ position: 'fixed', top: 20, right: 24, maxWidth: 'calc(100vw - 48px)', zIndex: 9999, background: 'var(--bg-solid-2)', border: `1px solid ${toast.color}`, borderRadius: 10, padding: '12px 20px', color: toast.color, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={2200}>

        {/* Back to list */}
        <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} className="pmBtn" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ArrowLeft size={14} weight="bold" />
          Bid Packages
        </button>

        {/* Header */}
        <ModuleHero
          eyebrow={pkg.code || 'Bid Package'}
          eyebrowIcon={<Envelope size={13} weight="fill" color="var(--text-secondary)" />}
          aux={
            <Badge
              label={statusWord}
              color={statusWord === 'awarded' ? 'var(--success)' : statusWord === 'open' ? GOLD : statusWord === 'closed' ? 'var(--danger)' : DIM}
              bg={statusWord === 'awarded' ? 'rgba(26,138,74,.12)' : statusWord === 'open' ? 'var(--brand-primary-12)' : statusWord === 'closed' ? 'rgba(192,48,48,.12)' : 'rgba(148,163,192,.1)'}
            />
          }
          title={pkg.name}
          subtitle={`${pkg.trade ? pkg.trade + ' · ' : ''}Due: ${(pkg.bid_due_date || pkg.due_date)?.slice(0, 10) || 'TBD'}${issuedOn ? ` · Jacket issued v${pkg.jacket_version ?? 1} on ${issuedOn}` : ' · Jacket not issued yet'}`}
          actions={headerActions}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard
            icon={<CurrencyDollar size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Scope Value" value={fmt(totalSov)}
           href={`/app/projects/${projectId}/bid-packages`}/>
          <StatCard
            icon={<Trophy size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Awarded Amount"
            value={pkg.awarded_amount ? fmt(pkg.awarded_amount) : 'TBD'}
            accent={pkg.awarded_amount ? 'var(--success)' : undefined}
           href={`/app/projects/${projectId}/bid-packages`}/>
          <StatCard
            icon={<UsersThree size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Subs Invited" value={String(liveInvites.length)}
           href={`/app/projects/${projectId}/bid-packages`}/>
          <StatCard
            icon={<Receipt size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Bids Received"
            value={String(submissions.length || submittedSubs.length)}
            accent={(submissions.length || submittedSubs.length) > 0 ? 'var(--success)' : undefined}
           href={`/app/projects/${projectId}/bid-packages`}/>
        </div>

        {/* A reload that failed after the page had loaded: say so, keep what is on screen. */}
        {loadError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(192,48,48,.35)', background: 'rgba(192,48,48,.08)', color: TEXT, fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 200 }}>{loadError} What is shown may be out of date.</span>
            <button onClick={loadPackage} className="pmBtn" style={{ ...ghostButtonStyle, minHeight: 44 }}>Retry</button>
          </div>
        )}

        {/* What the award did — who was told, who was not. */}
        {awardNote && (
          <div role="status" data-testid="award-note" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, border: `1px solid ${awardNote.tone === 'ok' ? 'rgba(26,138,74,.35)' : 'var(--brand-primary-35)'}`, background: awardNote.tone === 'ok' ? 'rgba(26,138,74,.08)' : 'var(--brand-primary-08)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, color: TEXT }}>
              {awardNote.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 800, color: awardNote.tone === 'ok' ? 'var(--success)' : 'var(--warning)' } : undefined}>{l}</div>)}
            </div>
            <button onClick={() => setAwardNote(null)} aria-label="Dismiss" style={{ minHeight: 44, minWidth: 44, background: 'transparent', border: 'none', color: DIM, cursor: 'pointer', marginTop: -10, marginRight: -8 }}><XCircle size={16} weight="bold" /></button>
          </div>
        )}

        {/* Awarded banner */}
        {pkg.awarded_to && (
          <div style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.25)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, display: 'inline-flex' }}><Trophy size={20} color="var(--success)" weight="fill" /></span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 3 }}>Awarded To</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{pkg.awarded_to}{pkg.awarded_amount && <span style={{ color: 'var(--success)', marginLeft: 12 }}>{fmt(pkg.awarded_amount)}</span>}</div>
            </div>

            {/* The award already knows the sub, the scope and the amount, and the
                contract form takes all three. Awarding used to end at a toast
                and papering the subcontract was a screen you had to know
                existed — this is the next step, offered where the award lands. */}
            <Link
              href={`/app/projects/${pkg.project_id}/contracts/new/subcontract?bidPackageId=${pkg.id}${pkg.awarded_to_id ? `&subId=${pkg.awarded_to_id}` : ''}`}
              style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8,
                minHeight: 44, padding: '0 20px', borderRadius: 9,
                background: GOLD, color: 'var(--on-brand)', fontSize: 14, fontWeight: 800,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              <FileText size={16} weight="bold" color="var(--on-brand)" /> Paper the Subcontract
            </Link>
          </div>
        )}

        {/* Package details — instructions, scope, due date, insurance and
            bonding. The jacket's written dividers are made of these, and its
            empty-divider links land here (?edit=details#package-details). */}
        <BidPackageDetails
          pkg={pkg}
          packageId={id}
          onSaved={(row) => setPkg((prev) => (prev ? { ...prev, ...row } : prev))}
          onToast={showToast}
        />

        {/* The bid form — add, edit, reorder and remove the lines bidders price. */}
        <BidFormEditor
          packageId={id}
          lines={pkg.sov_items}
          onLinesChanged={(lines) => setPkg((prev) => (prev ? { ...prev, sov_items: lines } : prev))}
          onToast={showToast}
        />

        {/* Bid Submissions */}
        {submissions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <SectionCard
              title="Bid Submissions"
              icon={<Receipt size={17} weight="duotone" color="var(--text-secondary)" />}
              action={<span style={{ fontSize: 12, color: MUTED }}>{submissions.length} received</span>}
              flush
            >
              {/* The hold sits with the bids it is holding, and carries both of
                  the ways out that its own wording promises. */}
              {complianceHold && (
                <div style={{ margin: '14px 20px', padding: '14px 16px', borderRadius: 12, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <Lock size={16} weight="duotone" color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: TEXT, fontWeight: 800, fontSize: 14 }}>
                        Award to {complianceHold.subName} is on hold
                      </div>
                      <div style={{ color: DIM, fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>
                        {complianceHold.message.replace(/^Compliance hold\s*[—-]\s*/i, '')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      onClick={() => {
                        const s = submissions.find(x => x.id === complianceHold.submissionId);
                        requestW9(complianceHold.subName, s?.sub_email ?? null);
                      }}
                      disabled={requestingDocs}
                      className="pmBtn"
                      style={{ ...goldButtonStyle, opacity: requestingDocs ? 0.6 : 1 }}
                    >
                      {requestingDocs ? 'Requesting…' : 'Request the Documents'}
                    </button>
                    <button
                      onClick={() => awardBid(complianceHold.submissionId, complianceHold.subName, { override: true })}
                      disabled={!!awarding}
                      className="pmBtn"
                      style={{ ...ghostButtonStyle, opacity: awarding ? 0.6 : 1 }}
                    >
                      Award Anyway (Override)
                    </button>
                    <button
                      onClick={() => setComplianceHold(null)}
                      style={{ minHeight: 44, padding: '0 14px', background: 'transparent', border: 'none', color: MUTED, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: TH_BG }}>
                      {['Sub Name', 'Email', 'Bid Amount', 'Submitted', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid ${HAIR}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(sub => {
                      /* The bid row says whether it won — matching on name or amount marked two equal bids both 'Awarded'. */
                      const isAwarded = sub.awarded;
                      return (
                        <tr key={sub.id} style={{ borderBottom: `1px solid ${HAIR}`, background: isAwarded ? 'rgba(26,138,74,.06)' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>
                            {sub.sub_name}
                            {isAwarded && <span style={{ fontSize: 12, color: 'var(--success)', marginLeft: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} color="var(--success)" weight="fill" /> Awarded</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.sub_email || '—'}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 800, fontSize: 14 }}>{fmt(sub.amount)}</td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.submitted_at?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {!isAwarded && pkg.status !== 'awarded' && (
                              <button
                                onClick={() => awardBid(sub.id, sub.sub_name)}
                                disabled={awarding === sub.id}
                                style={{ minHeight: 44, padding: '0 14px', background: 'rgba(26,138,74,.1)', border: '1px solid rgba(26,138,74,.3)', borderRadius: 10, color: 'var(--success)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: awarding === sub.id ? 0.5 : 1 }}>
                                {awarding === sub.id ? 'Awarding…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trophy size={12} color="var(--success)" weight="fill" /> Award</span>}
                              </button>
                            )}
                            {isAwarded && <StatusPill module="generic" status="awarded" size="sm" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {/* Invited Subs */}
        <div style={{ marginBottom: 20 }}>
          <style dangerouslySetInnerHTML={{ __html: INVITE_CSS }} />
          <SectionCard
            title="Invited Subcontractors"
            /* The counts sit under the title, not beside the button: the action
               slot does not shrink, and on a phone the two overran the title
               and pushed Invite More off the card. */
            subtitle={<span data-testid="invite-counts">{liveInvites.length} invited · {liveInvites.filter((s) => s.status === 'viewed').length} viewed · {submittedSubs.length} bid in</span>}
            icon={<UsersThree size={17} weight="duotone" color="var(--text-secondary)" />}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => { setShowInviteForm(!showInviteForm); setGate(null); }}
                  className="pmBtn"
                  style={{ minHeight: 44, padding: '0 14px', background: showInviteForm ? 'rgba(255,255,255,.05)' : 'var(--brand-primary-08)', border: `1px solid ${showInviteForm ? BORDER : 'color-mix(in srgb, var(--brand-primary) 30%, transparent)'}`, borderRadius: 10, color: showInviteForm ? DIM : GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {showInviteForm ? 'Cancel' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={12} color="var(--text-secondary)" weight="bold" /> Invite More</span>}
                </button>
              </div>
            }
            flush
          >
            {/* What inviting does, before the GC does it. */}
            {showInviteForm && !gate && (
              <div style={{ padding: '12px 20px 0', color: DIM, fontSize: 13, lineHeight: 1.5 }}>
                {pkg.jacket_generated_at
                  ? `The jacket went out as v${pkg.jacket_version ?? 1} on ${issuedOn}. A new sub is emailed that same jacket; anyone who already has it is not emailed again.`
                  : 'Inviting issues the jacket: it is checked for empty sections first, recorded as v1, and only then emailed.'}
              </div>
            )}

            {/* Invite More Form */}
            {showInviteForm && !gate && (
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${HAIR}`, background: 'var(--bg-surface-2)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {directory.length > 0 && (
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4 }}>From Your Directory</div>
                    <select
                      value={pickedSubId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPickedSubId(v);
                        const s = directory.find(d => d.id === v);
                        if (s) { setInviteName(s.company_name || ''); setInviteEmail(s.email || ''); }
                      }}
                      style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                    >
                      {/* GROUPED, AND THIS PACKAGE'S TRADE FIRST.
                          A flat alphabetical list of every sub in the directory
                          is fine at three and unusable at three hundred — and
                          the one you want on an Electrical package is almost
                          always an electrician. The subs whose trade matches
                          the package are lifted into their own group at the
                          top, the rest stay grouped by trade beneath, and subs
                          with no trade recorded land in "Other" rather than
                          vanishing. */}
                      <option value="">Type a new company below…</option>
                      {(() => {
                        const norm = (t?: string | null) => (t || '').trim().toLowerCase();
                        const pkgTrade = norm(pkg.trade);
                        const byTrade = new Map<string, typeof directory>();
                        for (const s of directory) {
                          const key = (s.trade || '').trim() || 'Other';
                          if (!byTrade.has(key)) byTrade.set(key, []);
                          byTrade.get(key)!.push(s);
                        }
                        const label = (s: (typeof directory)[number]) =>
                          `${s.company_name}${s.email ? '' : ' (no email on file)'}`;
                        const groups = [...byTrade.entries()].sort((a, b) => {
                          const am = pkgTrade && norm(a[0]) === pkgTrade ? 0 : 1;
                          const bm = pkgTrade && norm(b[0]) === pkgTrade ? 0 : 1;
                          if (am !== bm) return am - bm;              // this package's trade first
                          if ((a[0] === 'Other') !== (b[0] === 'Other')) return a[0] === 'Other' ? 1 : -1;
                          return a[0].localeCompare(b[0]);
                        });
                        return groups.map(([trade, subs]) => (
                          <optgroup
                            key={trade}
                            label={pkgTrade && norm(trade) === pkgTrade ? `${trade} — matches this package` : trade}
                          >
                            {subs
                              .slice()
                              .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
                              .map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4 }}>Name</div>
                  <input
                    value={inviteName}
                    onChange={e => { setInviteName(e.target.value); if (pickedSubId) setPickedSubId(''); }}
                    placeholder="Company name"
                    style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 220 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 4 }}>Email *</div>
                  <input type="email" inputMode="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="contractor@company.com" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <button
                  onClick={handleInviteMore}
                  disabled={!inviteEmail.trim() || inviting}
                  className="pmBtn"
                  style={{ ...goldButtonStyle, minHeight: 44, opacity: (!inviteEmail.trim() || inviting) ? 0.6 : 1 }}>
                  {inviting ? 'Sending…' : pkg.jacket_generated_at ? 'Send Invite' : 'Issue & Send Invite'}
                </button>
              </div>
            )}

            {/* The jacket is incomplete — nothing went out. Fix it, or send anyway. */}
            {gate && (
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${HAIR}` }}>
                <JacketGatePrompt
                  missing={gate.missing}
                  busy={inviting}
                  onSendAnyway={() => sendInvites(gate.subs, true)}
                  onCancel={() => setGate(null)}
                  jacketHref={`/app/projects/${projectId}/bid-packages/${id}/jacket`}
                />
              </div>
            )}

            {/* Exactly who was emailed and who was not. */}
            {sendResult && (
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${HAIR}` }}>
                <JacketSendResult result={sendResult} onDismiss={() => setSendResult(null)} />
              </div>
            )}

            {pkg.invited_subs.length === 0 ? (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>
                    <UsersThree size={16} weight="duotone" color="var(--text-secondary)" style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                    No Subs Invited Yet
                    <span style={{ fontWeight: 400, color: DIM }}>{showInviteForm ? ' — send the first invite with the form above; the jacket is checked and issued as it goes.' : ' — invite the first subcontractor to start collecting bids.'}</span>
                  </div>
                  {!showInviteForm && (
                    <button onClick={() => setShowInviteForm(true)} style={{ ...goldButtonStyle, minHeight: 44 }} className="pmBtn">
                      <Plus size={15} weight="bold" /> Invite Subcontractors
                    </button>
                  )}
                </div>
                <FlowStrip steps={[
                  { title: 'Invite Subs', desc: 'The jacket is checked, issued and emailed' },
                  { title: 'They Bid Online', desc: 'Through their own bid link' },
                  { title: 'Compare and Award', desc: 'Right from this page' },
                  { title: 'Award Flows On', desc: 'To contracts and budget' },
                ]} />
              </div>
            ) : (
              <div className="bpInv" data-testid="invite-list">
                <div className="bpInvHead" aria-hidden>
                  <span>Company</span><span>Status</span><span>Jacket Email</span><span>Bid</span><span>Actions</span>
                </div>
                {pkg.invited_subs.map(sub => {
                  const isAwarded = sub.bid_amount != null && pkg.bid_submissions.some((b) => b.awarded && b.sub_email === sub.email);
                  const pending = sub.status === 'invited' || sub.status === 'viewed';
                  return (
                    <div key={sub.id} className="bpInvRow" data-invite={sub.email} data-status={sub.status} style={{ opacity: sub.status === 'revoked' ? 0.6 : 1 }}>
                      <div className="bpInvWho">
                        <div style={{ color: TEXT, fontWeight: 700 }}>{sub.company_name}</div>
                        <div style={{ color: DIM, fontSize: 12, overflowWrap: 'anywhere' }}>{sub.contact_name ? `${sub.contact_name} · ` : ''}{sub.email || '—'}</div>
                      </div>
                      <div><StatusPill module="bid_package_invites" status={sub.status} size="sm" /></div>
                      <div><DeliveryCell d={sub.delivery} /></div>
                      <div style={{ color: sub.bid_amount ? TEXT : DIM, fontWeight: sub.bid_amount ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                        {sub.bid_amount ? fmt(sub.bid_amount) : '—'}
                        {isAwarded && <span style={{ fontSize: 12, color: 'var(--success)', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} color="var(--success)" weight="fill" /> Awarded</span>}
                      </div>
                      <div className="bpInvAct">
                        {pending && (
                          <button
                            onClick={() => sendReminder(sub.id, sub.company_name)}
                            disabled={reminding === sub.id}
                            className="pmBtn"
                            style={{ minHeight: 44, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, padding: '0 12px', cursor: 'pointer', opacity: reminding === sub.id ? 0.5 : 1 }}>
                            {reminding === sub.id ? 'Sending…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Envelope size={12} color="var(--text-secondary)" weight="regular" /> Remind</span>}
                          </button>
                        )}
                        {sub.status !== 'revoked' && (
                          <button
                            onClick={() => revokeLink(sub)}
                            disabled={revoking === sub.id}
                            className="pmBtn"
                            aria-label={`Revoke ${sub.company_name}'s link`}
                            style={{ minHeight: 44, background: 'none', border: '1px solid rgba(192,48,48,.3)', borderRadius: 10, color: 'var(--danger)', fontSize: 13, fontWeight: 700, padding: '0 12px', cursor: 'pointer', opacity: revoking === sub.id ? 0.5 : 1 }}>
                            {revoking === sub.id ? 'Revoking…' : 'Revoke Link'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </PremiumSurface>
    </>
  );
}
