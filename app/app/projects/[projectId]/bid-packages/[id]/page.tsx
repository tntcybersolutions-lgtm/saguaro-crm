'use client';
/**
 * Bid package — one trade's package: its details and bid form, the bids that
 * came back (side by side, low bid marked), and every invited sub with the
 * jacket email's delivery. On the kit.
 *
 *   load      GET  /api/bid-packages/[id]
 *   directory GET  /api/subcontractors
 *   invite    POST /api/bid-packages/[id]/invite-subs   (409 = jacket gate)
 *   remind    POST /api/bid-packages/[id]/remind
 *   revoke    POST /api/bid-packages/[id]/invites/[inviteId]/revoke
 *   award     POST /api/bid-packages/[id]/award        (compliance hold → override)
 *   W-9       POST /api/documents/w9-request
 *   close     POST /api/bid-packages/[id]/close
 */
import { confirmDialog } from '@/lib/ui/async-dialog';
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { toCents, toDollars, sumCents } from '@/lib/calc';
import {
  FolderOpen, Envelope, ArrowLeft, FileText, Lock, Trophy, Plus, CheckCircle, XCircle,
  CurrencyDollar, UsersThree, Receipt, Scales, WarningCircle, ArrowClockwise, Prohibit,
  CalendarBlank, Hash, Tag,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState, Callout, Field, Input,
  MetaItem, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import BidPackageDetails from '@/components/BidPackageDetails';
import BidFormEditor, { toBidFormLines, type BidFormLine } from '@/components/BidFormEditor';
import JacketPdfButton from '@/components/JacketPdfButton';
import { JacketGatePrompt, JacketSendResult, type SendPayload } from '@/components/JacketSendPanels';
import { inviteState, jacketDelivery, type InviteState, type JacketDelivery } from '@/lib/bid-invite-state';
import { bidAmount } from '@/lib/bid-amount';
import { isBiddingStatus } from '@/lib/bid-deadline';

const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
const fmtDay = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Package status → one badge (same words as the package register). */
function packageBadge(s: string): { label: string; tone: BadgeTone } {
  if (isBiddingStatus(s)) return { label: 'Open', tone: 'lead' };
  if (s === 'closed') return { label: 'Award pending', tone: 'lead' };
  if (s === 'awarded') return { label: 'Awarded', tone: 'ongoing' };
  return { label: 'Draft', tone: 'neutral' };
}

/** Invite state → one badge. */
const INVITE_BADGE: Record<InviteState, { label: string; tone: BadgeTone }> = {
  suggested: { label: 'Suggested', tone: 'neutral' },
  invited: { label: 'Invited', tone: 'neutral' },
  viewed: { label: 'Viewed', tone: 'lead' },
  submitted: { label: 'Bid In', tone: 'ongoing' },
  declined: { label: 'Declined', tone: 'overdue' },
  revoked: { label: 'Revoked', tone: 'closed' },
};

const CSS = `
.bdWs > .k-page { max-width: none; }
.bdWho { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bdWho > span:first-child { color: var(--text-primary); font-weight: 700; }
.bdWho > span + span { color: var(--text-secondary); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.bdMoney { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; color: var(--text-primary); }
.bdMoney[data-low="true"] { color: var(--success); }
.bdMuted { color: var(--text-tertiary); }
.bdBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bdInvite { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 12px; align-items: end; padding: 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-2); }
.bdHint { grid-column: 1 / -1; font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.5; }
.bdPanel { padding: 16px; border-bottom: 1px solid var(--border-subtle); }
.bdGap { margin-bottom: 16px; }
@media (max-width: 720px) {
  .bdInvite { grid-template-columns: minmax(0, 1fr); }
  .bdWs .k-btn, .bdWs .k-input, .bdWs select.k-select { min-height: 44px; }
  .bdWs .k-input, .bdWs select.k-select { font-size: 16px; }
}
`;

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
  return <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Not emailed yet</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BidPackageDetailPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const id = params['id'] as string;
  const { ctx } = useProjectContext(projectId);

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
  const { toast, show } = useToast(4000);

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

  /* Children (details, bid form, PDF) report with a colour; danger = a failure. */
  function showToast(msg: string, color: string = 'var(--success)') {
    show(msg, color === 'var(--danger)' ? 'bad' : 'good');
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

  const base = `/app/projects/${projectId}`;
  const crumbsBase = [
    { label: 'Projects', href: '/app/projects' },
    { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
    { label: 'Bid Packages', href: `${base}/bid-packages` },
  ];

  if (loading && !pkg) return (
    <div className="bdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell crumbs={[...crumbsBase, { label: 'Loading…' }]} title="Bid Package">
        <StatRow items={['Scope value', 'Invited', 'Bids in'].map(label => ({ label, value: <span className="k-skel" style={{ width: 80, height: 22 }} /> }))} />
        <Card title="Invited Subcontractors" icon={<UsersThree size={17} />} flush>
          <DataTable<InvitedSub>
            columns={[{ key: 'company_name', header: 'Company', primary: true }, { key: 'status', header: 'Status' }, { key: 'email', header: 'Jacket Email' }, { key: 'bid_amount', header: 'Bid', align: 'right' }]}
            rows={[]}
            rowKey={r => r.id}
            loading
            toolbar={false}
          />
        </Card>
      </PageShell>
    </div>
  );

  if (!pkg) return (
    <div className="bdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell crumbs={[...crumbsBase, { label: notFound || !loadError ? 'Not Found' : 'Error' }]} title="Bid Package">
        <Card flush>
          {notFound || !loadError ? (
            <EmptyState
              icon={<Envelope size={22} />}
              title="Bid package not found"
              text="It may have been removed, or the link is out of date."
              action={<Button icon={<ArrowLeft size={15} />} href={`${base}/bid-packages`}>Back to Bid Packages</Button>}
            />
          ) : (
            <EmptyState
              icon={<WarningCircle size={22} />}
              title="Couldn't load this bid package"
              text={`${loadError} Nothing on it has been lost.`}
              action={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button icon={<ArrowClockwise size={15} />} onClick={loadPackage}>Try again</Button>
                  <Button variant="ghost" icon={<ArrowLeft size={15} />} href={`${base}/bid-packages`}>Bid Packages</Button>
                </div>
              }
            />
          )}
        </Card>
      </PageShell>
    </div>
  );

  const issuedOn = pkg.jacket_generated_at
    ? new Date(pkg.jacket_generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const pb = packageBadge(pkg.status || 'draft');
  const liveInvites = pkg.invited_subs.filter((s) => s.status !== 'revoked');

  const totalSov = toDollars(sumCents(pkg.sov_items.map(i => toCents(i.total))));
  const submittedSubs = liveInvites.filter(s => s.status === 'submitted');
  const submissions = pkg.bid_submissions || [];
  const bidsIn = submissions.length || submittedSubs.length;
  const dueRaw = pkg.bid_due_date || pkg.due_date;
  const canClose = pkg.status !== 'closed' && pkg.status !== 'awarded';

  /* The low bid: the smallest positive amount on the sheet. Marked in green on
     the comparison and measured against by every other bid. */
  const priced = submissions.filter(b => (Number(b.amount) || 0) > 0);
  const lowAmount = priced.length ? Math.min(...priced.map(b => Number(b.amount) || 0)) : null;
  const isLow = (b: BidSubmission) => lowAmount != null && priced.length > 0 && (Number(b.amount) || 0) === lowAmount;

  const stats: StatItem[] = [
    { label: 'Scope value', value: fmt(totalSov), sub: `${pkg.sov_items.length} bid-form line${pkg.sov_items.length === 1 ? '' : 's'}`, icon: <CurrencyDollar size={15} /> },
    ...(lowAmount != null ? [{ label: 'Low bid', value: fmt(lowAmount), tone: 'good' as const, sub: totalSov > 0 ? (lowAmount === totalSov ? 'Matches scope value' : `${fmt(Math.abs(lowAmount - totalSov))} ${lowAmount < totalSov ? 'under' : 'over'} scope value`) : undefined, icon: <Scales size={15} /> }] : []),
    ...(pkg.awarded_amount ? [{ label: 'Awarded', value: fmt(pkg.awarded_amount), tone: 'good' as const, sub: pkg.awarded_to || undefined, icon: <Trophy size={15} /> }] : []),
    { label: 'Invited', value: String(liveInvites.length), sub: `${liveInvites.filter((s) => s.status === 'viewed').length} viewed`, icon: <UsersThree size={15} /> },
    { label: 'Bids in', value: String(bidsIn), tone: bidsIn > 0 ? 'good' : 'default', sub: liveInvites.length > 0 ? `of ${liveInvites.length} invited` : undefined, icon: <Receipt size={15} /> },
  ];

  // ── Bid comparison: every bid side by side, low bid marked ──
  const bidColumns: Column<BidSubmission>[] = [
    {
      key: 'sub_name', header: 'Bidder', primary: true, phone: 'show',
      render: b => <span className="bdWho"><span>{b.sub_name}</span>{b.sub_email && <span>{b.sub_email}</span>}</span>,
    },
    {
      key: 'amount', header: 'Bid Amount', align: 'right', phone: 'show', accessor: b => Number(b.amount) || 0,
      render: b => <span className="bdMoney" data-low={isLow(b) ? 'true' : undefined}>{fmt(b.amount)}</span>,
    },
    {
      key: 'vs_low', header: 'vs Low', align: 'right', accessor: b => (lowAmount != null ? (Number(b.amount) || 0) - lowAmount : 0),
      render: b => {
        if (lowAmount == null || !(Number(b.amount) > 0)) return <span className="bdMuted">—</span>;
        if (isLow(b)) return <span className="bdMuted">Low</span>;
        const d = (Number(b.amount) || 0) - lowAmount;
        return <span className="bdMoney">+{fmt(d)}<span className="bdMuted"> · {lowAmount > 0 ? Math.round((d / lowAmount) * 100) : 0}%</span></span>;
      },
    },
    {
      key: 'vs_scope', header: 'vs Scope', align: 'right', accessor: b => (totalSov > 0 ? (Number(b.amount) || 0) - totalSov : 0),
      render: b => totalSov > 0 ? <span className="bdMoney" style={{ color: (Number(b.amount) || 0) > totalSov ? 'var(--danger)' : 'var(--success)' }}>{(Number(b.amount) || 0) > totalSov ? '+' : ''}{fmt((Number(b.amount) || 0) - totalSov)}</span> : <span className="bdMuted">—</span>,
    },
    { key: 'submitted_at', header: 'Submitted', accessor: b => b.submitted_at || '', render: b => fmtDay(b.submitted_at?.slice(0, 10)) },
    {
      key: 'result', header: 'Result', phone: 'show', accessor: b => (b.awarded ? 0 : isLow(b) ? 1 : 2),
      render: b => (
        <span className="bdBadges">
          {/* The bid row says whether it won — matching on name or amount marked two equal bids both 'Awarded'. */}
          {b.awarded && <Badge tone="completed"><Trophy size={11} weight="fill" /> Awarded</Badge>}
          {isLow(b) && <Badge tone="ongoing" dot>Low bid</Badge>}
          {!b.awarded && !isLow(b) && <span className="bdMuted">—</span>}
        </span>
      ),
    },
  ];

  // ── Invited subs ──
  const inviteColumns: Column<InvitedSub>[] = [
    {
      key: 'company_name', header: 'Company', primary: true, phone: 'show',
      render: sub => (
        <span className="bdWho" data-invite={sub.email} data-status={sub.status} style={{ opacity: sub.status === 'revoked' ? 0.6 : 1 }}>
          <span>{sub.company_name}</span>
          <span>{[sub.contact_name, sub.email].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', phone: 'show', accessor: sub => INVITE_BADGE[sub.status]?.label || sub.status, render: sub => { const b = INVITE_BADGE[sub.status] || { label: sub.status, tone: 'neutral' as BadgeTone }; return <Badge tone={b.tone} dot>{b.label}</Badge>; } },
    { key: 'delivery', header: 'Jacket Email', accessor: sub => sub.delivery.state, render: sub => <DeliveryCell d={sub.delivery} /> },
    {
      key: 'bid_amount', header: 'Bid', align: 'right', phone: 'show', accessor: sub => Number(sub.bid_amount) || 0,
      render: sub => {
        const isAwarded = sub.bid_amount != null && pkg.bid_submissions.some((b) => b.awarded && b.sub_email === sub.email);
        return (
          <span className="bdBadges" style={{ justifyContent: 'flex-end' }}>
            <span className={sub.bid_amount ? 'bdMoney' : 'bdMuted'} data-low={sub.bid_amount != null && lowAmount != null && sub.bid_amount === lowAmount ? 'true' : undefined}>{sub.bid_amount ? fmt(sub.bid_amount) : ''}</span>
            {isAwarded && <Badge tone="completed"><Trophy size={11} weight="fill" /> Awarded</Badge>}
          </span>
        );
      },
    },
  ];

  const toggleInviteForm = () => { setShowInviteForm(!showInviteForm); setGate(null); };

  return (
    <div className="bdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[...crumbsBase, { label: pkg.name || pkg.trade || 'Bid Package' }]}
        title={pkg.name || 'Bid Package'}
        badge={<Badge tone={pb.tone} dot>{pb.label}</Badge>}
        meta={
          <>
            {pkg.code && <MetaItem icon={<Hash size={14} />}>{pkg.code}</MetaItem>}
            {pkg.trade && <MetaItem icon={<Tag size={14} />}>{pkg.trade}</MetaItem>}
            <MetaItem icon={<CalendarBlank size={14} />}>Due {dueRaw ? fmtDay(dueRaw.slice(0, 10)) : 'TBD'}</MetaItem>
            <MetaItem icon={<FolderOpen size={14} />}>{issuedOn ? `Jacket issued v${pkg.jacket_version ?? 1} on ${issuedOn}` : 'Jacket not issued yet'}</MetaItem>
          </>
        }
        actions={
          <>
            {/* The jacket is the deliverable — drawings, specs, bid form and
                requirements assembled into something a sub can work from. Once
                awarded, the page's one primary step is papering the subcontract. */}
            <Button variant={pkg.awarded_to ? 'secondary' : 'primary'} icon={<FolderOpen size={15} />} href={`${base}/bid-packages/${id}/jacket`}>Open Bid Jacket</Button>
            {/* Download PDF builds the printed jacket from the jacket as it is now. */}
            <JacketPdfButton
              packageId={id}
              title={`${pkg.name || pkg.trade || 'Bid package'} — Bid Jacket`}
              onBuilt={(pdf) => setPkg((cur) => (cur ? { ...cur, jacket_pdf_url: pdf.storedUrl } : cur))}
              onError={(msg) => showToast(msg, 'var(--danger)')}
            />
            {/* Levelling belongs where the bids are — shown once a bid exists. */}
            {submissions.length > 0 && (
              <Button icon={<Scales size={15} />} href={`${base}/bid-packages/${id}/leveling`}>
                Level {submissions.length} Bid{submissions.length === 1 ? '' : 's'}
              </Button>
            )}
            {canClose && (
              <Button variant="danger" icon={<Lock size={15} />} onClick={closeBids} disabled={closing}>
                {closing ? 'Closing…' : 'Close Bidding'}
              </Button>
            )}
          </>
        }
      >
        <StatRow items={stats} />

        {/* A reload that failed after the page had loaded: say so, keep what is on screen. */}
        {loadError && (
          <div className="bdGap">
            <Callout tone="danger" icon={<WarningCircle size={18} />} title="Couldn't refresh this package" text={`${loadError} What is shown may be out of date.`} actions={<Button size="sm" icon={<ArrowClockwise size={14} />} onClick={loadPackage}>Retry</Button>} />
          </div>
        )}

        {/* What the award did — who was told, who was not. */}
        {awardNote && (
          <div className="bdGap" role="status" data-testid="award-note">
            <Callout
              tone={awardNote.tone === 'ok' ? 'success' : 'warning'}
              icon={awardNote.tone === 'ok' ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}
              title={awardNote.lines[0]}
              text={awardNote.lines.length > 1 ? awardNote.lines.slice(1).map((l, i) => <div key={i}>{l}</div>) : undefined}
              actions={<Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => setAwardNote(null)}>Dismiss</Button>}
            />
          </div>
        )}

        {/* Awarded — the award knows the sub, the scope and the amount, and the
            contract form takes all three: papering it is the next step. */}
        {pkg.awarded_to && (
          <div className="bdGap">
            <Callout
              tone="success"
              icon={<Trophy size={18} weight="fill" />}
              title={<>Awarded to {pkg.awarded_to}{pkg.awarded_amount ? ` · ${fmt(pkg.awarded_amount)}` : ''}</>}
              actions={
                <Button variant="primary" icon={<FileText size={15} />} href={`/app/projects/${pkg.project_id}/contracts/new/subcontract?bidPackageId=${pkg.id}${pkg.awarded_to_id ? `&subId=${pkg.awarded_to_id}` : ''}`}>
                  Paper the Subcontract
                </Button>
              }
            />
          </div>
        )}

        {/* Package details — instructions, scope, due date, insurance and
            bonding. The jacket's empty-divider links land here (?edit=details#package-details). */}
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

        {/* Bid comparison — side by side, low bid marked */}
        {submissions.length > 0 && (
          <div className="bdGap">
            <Card title="Bid Submissions" icon={<Receipt size={17} />} subtitle={`${submissions.length} received${lowAmount != null ? ` · low ${fmt(lowAmount)}` : ''}`} flush>
              {/* The hold sits with the bids it is holding, and carries both of
                  the ways out that its own wording promises. */}
              {complianceHold && (
                <div className="bdPanel">
                  <Callout
                    tone="warning"
                    icon={<Lock size={18} />}
                    title={`Award to ${complianceHold.subName} is on hold`}
                    text={complianceHold.message.replace(/^Compliance hold\s*[—-]\s*/i, '')}
                    actions={
                      <>
                        <Button
                          size="sm"
                          icon={<Envelope size={14} />}
                          disabled={requestingDocs}
                          onClick={() => {
                            const s = submissions.find(x => x.id === complianceHold.submissionId);
                            requestW9(complianceHold.subName, s?.sub_email ?? null);
                          }}
                        >
                          {requestingDocs ? 'Requesting…' : 'Request the Documents'}
                        </Button>
                        <Button size="sm" icon={<Trophy size={14} />} disabled={!!awarding} onClick={() => awardBid(complianceHold.submissionId, complianceHold.subName, { override: true })}>
                          Award Anyway (Override)
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setComplianceHold(null)}>Dismiss</Button>
                      </>
                    }
                  />
                </div>
              )}
              <DataTable<BidSubmission>
                tableId="project-bid-package-bids"
                exportName={`bids-${(pkg.trade || pkg.name || 'package').toLowerCase()}`}
                columns={bidColumns}
                rows={submissions}
                rowKey={b => b.id}
                defaultSort={{ key: 'amount', dir: 'asc' }}
                rowStyle={b => (b.awarded ? { background: 'color-mix(in srgb, var(--success) 6%, transparent)' } : undefined)}
                rowActions={b => [
                  {
                    label: awarding === b.id ? 'Awarding…' : 'Award',
                    icon: <Trophy size={14} />,
                    inline: true,
                    hidden: b.awarded || pkg.status === 'awarded',
                    disabled: awarding === b.id,
                    onClick: () => awardBid(b.id, b.sub_name),
                  },
                ]}
              />
            </Card>
          </div>
        )}

        {/* Invited subs */}
        <Card
          title="Invited Subcontractors"
          icon={<UsersThree size={17} />}
          /* The counts sit under the title, not beside the button. */
          subtitle={<span data-testid="invite-counts">{liveInvites.length} invited · {liveInvites.filter((s) => s.status === 'viewed').length} viewed · {submittedSubs.length} bid in</span>}
          actions={
            <Button size="sm" variant={showInviteForm ? 'ghost' : 'secondary'} icon={showInviteForm ? undefined : <Plus size={13} weight="bold" />} onClick={toggleInviteForm}>
              {showInviteForm ? 'Cancel' : 'Invite More'}
            </Button>
          }
          flush
        >
          {/* Invite composer — a package with no invites opens straight into it. */}
          {showInviteForm && !gate && (
            <form method="post" className="bdInvite" onSubmit={(e) => { e.preventDefault(); void handleInviteMore(); }}>
              {/* What inviting does, before the GC does it. */}
              <div className="bdHint">
                {pkg.jacket_generated_at
                  ? `The jacket went out as v${pkg.jacket_version ?? 1} on ${issuedOn}. A new sub gets that same jacket; anyone who already has it is not emailed again.`
                  : 'Inviting issues the jacket: it is checked for empty sections first, recorded as v1, then emailed.'}
              </div>
              {directory.length > 0 && (
                <Field label="From Your Directory">
                  {/* Native select — grouped by trade with this package's trade first, which the kit Select does not render. */}
                  <select
                    className="k-select"
                    value={pickedSubId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPickedSubId(v);
                      const s = directory.find(d => d.id === v);
                      if (s) { setInviteName(s.company_name || ''); setInviteEmail(s.email || ''); }
                    }}
                  >
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
                        <optgroup key={trade} label={pkgTrade && norm(trade) === pkgTrade ? `${trade} — matches this package` : trade}>
                          {subs
                            .slice()
                            .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
                            .map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
                        </optgroup>
                      ));
                    })()}
                  </select>
                </Field>
              )}
              <Field label="Name">
                <Input value={inviteName} onChange={e => { setInviteName(e.target.value); if (pickedSubId) setPickedSubId(''); }} placeholder="Company name" />
              </Field>
              <Field label="Email" required>
                <Input type="email" inputMode="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="contractor@company.com" />
              </Field>
              <Button type="submit" icon={<Envelope size={15} />} disabled={!inviteEmail.trim() || inviting}>
                {inviting ? 'Sending…' : pkg.jacket_generated_at ? 'Send Invite' : 'Issue & Send Invite'}
              </Button>
            </form>
          )}

          {/* The jacket is incomplete — nothing went out. Fix it, or send anyway. */}
          {gate && (
            <div className="bdPanel">
              <JacketGatePrompt
                missing={gate.missing}
                busy={inviting}
                onSendAnyway={() => sendInvites(gate.subs, true)}
                onCancel={() => setGate(null)}
                jacketHref={`${base}/bid-packages/${id}/jacket`}
              />
            </div>
          )}

          {/* Exactly who was emailed and who was not. */}
          {sendResult && (
            <div className="bdPanel">
              <JacketSendResult result={sendResult} onDismiss={() => setSendResult(null)} />
            </div>
          )}

          {pkg.invited_subs.length === 0 ? (
            <EmptyState
              icon={<UsersThree size={22} />}
              title="No subs invited yet"
              text={showInviteForm ? 'Send the first invite with the form above.' : 'Invite the first subcontractor to start collecting bids.'}
              action={!showInviteForm ? <Button icon={<Plus size={15} weight="bold" />} onClick={() => setShowInviteForm(true)}>Invite Subcontractors</Button> : undefined}
            />
          ) : (
            <div data-testid="invite-list">
              <DataTable<InvitedSub>
                tableId="project-bid-package-invites"
                exportName={`invites-${(pkg.trade || pkg.name || 'package').toLowerCase()}`}
                columns={inviteColumns}
                rows={pkg.invited_subs}
                rowKey={sub => sub.id}
                rowActions={sub => {
                  const pending = sub.status === 'invited' || sub.status === 'viewed';
                  return [
                    { label: reminding === sub.id ? 'Sending…' : 'Remind', icon: <Envelope size={14} />, inline: true, hidden: !pending, disabled: reminding === sub.id, onClick: () => sendReminder(sub.id, sub.company_name) },
                    { label: revoking === sub.id ? 'Revoking…' : 'Revoke Link', icon: <Prohibit size={14} />, tone: 'danger', hidden: sub.status === 'revoked', disabled: revoking === sub.id, onClick: () => revokeLink(sub) },
                  ];
                }}
              />
            </div>
          )}
        </Card>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
