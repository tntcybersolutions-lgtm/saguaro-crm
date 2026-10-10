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
import { openPdf } from '@/components/PdfViewer';
import BidPackageDetails from '@/components/BidPackageDetails';
import BidFormEditor, { toBidFormLines, type BidFormLine } from '@/components/BidFormEditor';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)',GREEN='var(--success)',RED='var(--danger)';
const MUTED='rgba(255,255,255,0.62)';        // section-header meta text
const HAIR='rgba(255,255,255,0.06)';         // table row hairlines on the dark surface
const TH_BG='rgba(255,255,255,0.03)';        // table header band
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

// ─── Types ───────────────────────────────────────────────────────────────────

type SubStatus = 'invited' | 'viewed' | 'submitted' | 'declined';

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
}

interface BidSubmission {
  id: string;
  sub_name: string;
  sub_email: string;
  amount: number;
  submitted_at: string;
  notes: string | null;
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
  created_at: string;
  sov_items: SovItem[];
  invited_subs: InvitedSub[];
  bid_submissions: BidSubmission[];
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function Badge({ label, color = DIM, bg = 'rgba(148,163,192,.1)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color, letterSpacing: 0.3 }}>
      {label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function subStatusColor(s: SubStatus): { c: string; bg: string } {
  switch (s) {
    case 'submitted': return { c: 'var(--success)', bg: 'rgba(26,138,74,.12)' };
    case 'viewed':    return { c: GOLD, bg: 'var(--brand-primary-12)' };
    case 'declined':  return { c: 'var(--danger)', bg: 'rgba(192,48,48,.12)' };
    default:          return { c: DIM, bg: 'rgba(163,172,187,.1)' };
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BidPackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;
  const id = params['id'] as string;

  const [pkg, setPkg] = useState<BidPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState<string | null>(null);
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
    try {
      const r = await fetch(`/api/bid-packages/${id}`);
      const d = await r.json() as any;
      if (d.bidPackage) {
        // GET route returns items / invites / submissions at the TOP LEVEL (not nested on
        // bidPackage) and with DB column names. Map them onto the page's interfaces so SOV,
        // invited subs and submissions render — and the Award button appears when bids exist.
        const sov_items: SovItem[] = toBidFormLines(d.items || []);
        const invited_subs: InvitedSub[] = (d.invites || []).map((iv: any) => ({
          id: String(iv.id),
          company_name: iv.sub_name || iv.company_name || '—',
          contact_name: iv.contact_name || '',
          email: iv.sub_email || iv.email || '',
          status: (iv.status || 'invited') as SubStatus,
          bid_amount: iv.bid_amount != null ? Number(iv.bid_amount) : null,
          invited_at: iv.created_at || iv.invited_at || '',
          responded_at: iv.responded_at || null,
        }));
        const bid_submissions: BidSubmission[] = (d.submissions || []).map((sb: any) => ({
          id: String(sb.id),
          sub_name: sb.company_name || sb.sub_name || sb.contact_name || '—',
          sub_email: sb.contact_email || sb.sub_email || '',
          amount: Number(sb.base_amount ?? sb.amount) || 0,
          submitted_at: sb.submitted_at || sb.created_at || '',
          notes: sb.notes ?? null,
        }));
        setPkg({ ...d.bidPackage, sov_items, invited_subs, bid_submissions });
      }
    } catch { /* leave null */ } finally { setLoading(false); }
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
      showToast(d.message || `Awarded to ${subName}!`);
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

  async function handleInviteMore() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const r = await fetch(`/api/bid-packages/${id}/invite-subs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        /* subId ties the invite to the directory record, which is what lets the
           award gate read their W-9 and insurance later. Omitted when the GC
           typed a company that is not on file yet. */
        body: JSON.stringify({ subs: [{ name: inviteName, email: inviteEmail, subId: pickedSubId || undefined }] }),
      });
      if (!r.ok) throw new Error('invite failed');
      showToast(`Invite sent to ${inviteEmail}.`);
      setInviteName('');
      setInviteEmail('');
      setPickedSubId('');
      setShowInviteForm(false);
      await loadPackage();
    } catch {
      showToast(`Could not send the invite to ${inviteEmail}. Please try again.`, 'var(--danger)');
    } finally { setInviting(false); }
  }

  async function downloadPDF() {
    if (pkg?.jacket_pdf_url) {
      openPdf({ url: `/api/files/open?u=${encodeURIComponent(pkg.jacket_pdf_url)}` });
      return;
    }
    try {
      const r = await fetch('/api/documents/bid-package', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: id, projectId }),
      });
      const d = await r.json().catch(() => ({})) as any;
      const url = d.url || d.pdfUrl;
      if (!r.ok || !url) throw new Error(d.error || 'generation failed');
      openPdf({ url });
    } catch { showToast('Could not generate the bid package PDF. Please try again.', 'var(--danger)'); }
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
      <SectionCard flat title="Invited Subcontractors" icon={<UsersThree size={17} weight="duotone" color={GOLD} />} flush>
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
        <PremiumEmpty
          tone="error"
          icon={<Envelope size={30} weight="duotone" color={GOLD} />}
          title="Bid Package Not Found"
          description="We couldn't load this bid package. It may have been removed, or the link is out of date."
          action={
            <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={ghostButtonStyle} className="pmBtn">
              <ArrowLeft size={15} weight="bold" /> Go Back
            </button>
          }
        />
      </SectionCard>
    </PremiumSurface>
  );

  const totalSov = toDollars(sumCents(pkg.sov_items.map(i => toCents(i.total))));
  const submittedSubs = pkg.invited_subs.filter(s => s.status === 'submitted');
  const submissions = pkg.bid_submissions || [];

  const inp: React.CSSProperties = { padding: '8px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' };

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
      <button onClick={downloadPDF} style={ghostButtonStyle} className="pmBtn">
        <FileText size={16} weight="regular" /> Printed Jacket PDF
      </button>
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
        <button onClick={closeBids} disabled={closing} className="pmBtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, background: 'rgba(192,48,48,.12)', border: '1px solid rgba(192,48,48,.3)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', opacity: closing ? 0.6 : 1 }}>
          {closing ? 'Closing…' : <><Lock size={15} weight="bold" /> Close Bidding</>}
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: 'var(--bg-solid-2)', border: `1px solid ${toast.color}`, borderRadius: 10, padding: '12px 20px', color: toast.color, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
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
          eyebrowIcon={<Envelope size={13} weight="fill" color={GOLD} />}
          aux={
            <Badge
              label={pkg.status}
              color={pkg.status === 'awarded' ? 'var(--success)' : pkg.status === 'open' ? GOLD : pkg.status === 'closed' ? 'var(--danger)' : DIM}
              bg={pkg.status === 'awarded' ? 'rgba(26,138,74,.12)' : pkg.status === 'open' ? 'var(--brand-primary-12)' : pkg.status === 'closed' ? 'rgba(192,48,48,.12)' : 'rgba(148,163,192,.1)'}
            />
          }
          title={pkg.name}
          subtitle={`${pkg.trade ? pkg.trade + ' · ' : ''}Due: ${(pkg.bid_due_date || pkg.due_date)?.slice(0, 10) || 'TBD'}`}
          actions={headerActions}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard
            icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
            label="Scope Value" value={fmt(totalSov)}
           href={`/app/projects/${projectId}/bid-packages`}/>
          <StatCard
            icon={<Trophy size={19} weight="duotone" color={GOLD} />}
            label="Awarded Amount"
            value={pkg.awarded_amount ? fmt(pkg.awarded_amount) : 'TBD'}
            accent={pkg.awarded_amount ? 'var(--success)' : undefined}
           href={`/app/projects/${projectId}/bid-packages`}/>
          <StatCard
            icon={<UsersThree size={19} weight="duotone" color={GOLD} />}
            label="Subs Invited" value={String(pkg.invited_subs.length)}
           href={`/app/projects/${projectId}/bid-packages`}/>
          <StatCard
            icon={<Receipt size={19} weight="duotone" color={GOLD} />}
            label="Bids Received"
            value={String(submissions.length || submittedSubs.length)}
            accent={(submissions.length || submittedSubs.length) > 0 ? 'var(--success)' : undefined}
           href={`/app/projects/${projectId}/bid-packages`}/>
        </div>

        {/* Awarded banner */}
        {pkg.awarded_to && (
          <div style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.25)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, display: 'inline-flex' }}><Trophy size={20} color="var(--success)" weight="fill" /></span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 3 }}>Awarded To</div>
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
                background: GOLD, color: 'var(--on-brand)', fontSize: 13.5, fontWeight: 800,
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
              icon={<Receipt size={17} weight="duotone" color={GOLD} />}
              action={<span style={{ fontSize: 12, color: MUTED }}>{submissions.length} received</span>}
              flush
            >
              {/* The hold sits with the bids it is holding, and carries both of
                  the ways out that its own wording promises. */}
              {complianceHold && (
                <div style={{ margin: '14px 20px', padding: '14px 16px', borderRadius: 12, background: 'var(--brand-primary-08)', border: '1px solid color-mix(in srgb, var(--brand-primary) 32%, transparent)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <Lock size={16} weight="duotone" color={GOLD} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: TEXT, fontWeight: 800, fontSize: 13.5 }}>
                        Award to {complianceHold.subName} is on hold
                      </div>
                      <div style={{ color: DIM, fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>
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
                      style={{ padding: '9px 14px', background: 'transparent', border: 'none', color: MUTED, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
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
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: `1px solid ${HAIR}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(sub => {
                      const isAwarded = pkg.awarded_to === sub.sub_name || (pkg.awarded_amount !== null && pkg.awarded_amount === sub.amount);
                      return (
                        <tr key={sub.id} style={{ borderBottom: `1px solid ${HAIR}`, background: isAwarded ? 'rgba(26,138,74,.06)' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>
                            {sub.sub_name}
                            {isAwarded && <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} color="var(--success)" weight="fill" /> Awarded</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.sub_email || '—'}</td>
                          <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 800, fontSize: 14 }}>{fmt(sub.amount)}</td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.submitted_at?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {!isAwarded && pkg.status !== 'awarded' && (
                              <button
                                onClick={() => awardBid(sub.id, sub.sub_name)}
                                disabled={awarding === sub.id}
                                style={{ padding: '5px 14px', background: 'rgba(26,138,74,.1)', border: '1px solid rgba(26,138,74,.3)', borderRadius: 6, color: 'var(--success)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: awarding === sub.id ? 0.5 : 1 }}>
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
          <SectionCard
            title="Invited Subcontractors"
            icon={<UsersThree size={17} weight="duotone" color={GOLD} />}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: MUTED }}>{pkg.invited_subs.length} invited · {submittedSubs.length} submitted</span>
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  style={{ padding: '5px 12px', background: showInviteForm ? 'rgba(255,255,255,.05)' : 'var(--brand-primary-08)', border: `1px solid ${showInviteForm ? BORDER : 'color-mix(in srgb, var(--brand-primary) 30%, transparent)'}`, borderRadius: 6, color: showInviteForm ? DIM : GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {showInviteForm ? 'Cancel' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={12} color={GOLD} weight="bold" /> Invite More</span>}
                </button>
              </div>
            }
            flush
          >
            {/* Invite More Form */}
            {showInviteForm && (
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${HAIR}`, background: 'color-mix(in srgb, var(--brand-primary) 3%, transparent)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {directory.length > 0 && (
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 4 }}>From Your Directory</div>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 4 }}>Name</div>
                  <input
                    value={inviteName}
                    onChange={e => { setInviteName(e.target.value); if (pickedSubId) setPickedSubId(''); }}
                    placeholder="Company name"
                    style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 220 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 4 }}>Email *</div>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="contractor@company.com" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <button
                  onClick={handleInviteMore}
                  disabled={!inviteEmail || inviting}
                  className="pmBtn"
                  style={{ ...goldButtonStyle, opacity: (!inviteEmail || inviting) ? 0.6 : 1 }}>
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            )}

            {pkg.invited_subs.length === 0 ? (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                    <UsersThree size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                    No Subs Invited Yet
                    <span style={{ fontWeight: 400, color: DIM }}>{showInviteForm ? ' — send the first invite with the form above; bidding starts the moment it lands.' : ' — invite the first subcontractor to start collecting bids.'}</span>
                  </div>
                  {!showInviteForm && (
                    <button onClick={() => setShowInviteForm(true)} style={goldButtonStyle} className="pmBtn">
                      <Plus size={15} weight="bold" /> Invite Subcontractors
                    </button>
                  )}
                </div>
                <FlowStrip steps={[
                  { title: 'Invite Subs', desc: 'Email goes out with the package' },
                  { title: 'They Bid Online', desc: 'Through the sub portal' },
                  { title: 'Compare and Award', desc: 'Right from this page' },
                  { title: 'Award Flows On', desc: 'To contracts and budget' },
                ]} />
              </div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: TH_BG }}>
                      {['Company', 'Contact', 'Email', 'Status', 'Bid Amount', 'Invited', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: `1px solid ${HAIR}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.invited_subs.map(sub => {
                      const sc = subStatusColor(sub.status);
                      const isAwarded = pkg.awarded_amount !== null && sub.bid_amount === pkg.awarded_amount;
                      return (
                        <tr key={sub.id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                          <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{sub.company_name}</td>
                          <td style={{ padding: '12px 16px', color: DIM }}>{sub.contact_name || '—'}</td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.email || '—'}</td>
                          <td style={{ padding: '12px 16px' }}><Badge label={sub.status} color={sc.c} bg={sc.bg} /></td>
                          <td style={{ padding: '12px 16px', color: sub.bid_amount ? TEXT : DIM, fontWeight: sub.bid_amount ? 600 : 400 }}>
                            {sub.bid_amount ? fmt(sub.bid_amount) : '—'}
                            {isAwarded && <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} color="var(--success)" weight="fill" /> Awarded</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.invited_at?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {(sub.status === 'invited' || sub.status === 'viewed') && (
                              <button
                                onClick={() => sendReminder(sub.id, sub.company_name)}
                                disabled={reminding === sub.id}
                                style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 10px', cursor: 'pointer', opacity: reminding === sub.id ? 0.5 : 1 }}>
                                {reminding === sub.id ? 'Sending…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Envelope size={11} color={GOLD} weight="regular" /> Remind</span>}
                              </button>
                            )}
                            {sub.status === 'submitted' && <span style={{ fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} color="var(--success)" weight="fill" /> Bid Received</span>}
                            {sub.status === 'declined' && <span style={{ fontSize: 11, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={12} color="var(--danger)" weight="fill" /> Declined</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </PremiumSurface>
    </>
  );
}
