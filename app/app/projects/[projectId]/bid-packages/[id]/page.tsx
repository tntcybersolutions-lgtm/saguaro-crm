'use client';
import { Skeleton, SkeletonKPI, SkeletonRow } from '@/components/ui/Skeleton';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toCents, toDollars, sumCents } from '@/lib/calc';
import { Envelope, ArrowLeft, FileText, Lock, Trophy, Star, Plus, CheckCircle, XCircle, CurrencyDollar, UsersThree, Receipt, ClipboardText } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, FlowStrip, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#1a8a4a',RED='#c03030';
const MUTED='rgba(255,255,255,0.62)';        // section-header meta text
const HAIR='rgba(255,255,255,0.06)';         // table row hairlines on the dark surface
const TH_BG='rgba(255,255,255,0.03)';        // table header band
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

// ─── Types ───────────────────────────────────────────────────────────────────

type SubStatus = 'invited' | 'viewed' | 'submitted' | 'declined';

interface SovItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total: number;
}

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
  bid_due_date: string | null;
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
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {label}
    </span>
  );
}

function subStatusColor(s: SubStatus): { c: string; bg: string } {
  switch (s) {
    case 'submitted': return { c: '#1db954', bg: 'rgba(26,138,74,.12)' };
    case 'viewed':    return { c: GOLD,      bg: 'rgba(245, 158, 11,.12)' };
    case 'declined':  return { c: '#ff7070', bg: 'rgba(192,48,48,.12)' };
    default:          return { c: DIM,       bg: 'rgba(143,163,192,.1)' };
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

  useEffect(() => { loadPackage(); }, [id]);

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

  function showToast(msg: string, color: string = '#1db954') {
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
        const sov_items: SovItem[] = (d.items || []).map((it: any) => ({
          id: String(it.id),
          description: it.description || '',
          quantity: Number(it.quantity) || 0,
          unit: it.unit || '',
          unit_cost: Number(it.unit_price ?? it.unit_cost) || 0,
          total: Number(it.total_amount ?? it.total) || 0,
        }));
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

  async function sendReminder(subId: string, companyName: string) {
    setReminding(subId);
    try {
      const r = await fetch(`/api/bid-packages/${id}/remind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, packageId: id }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) throw new Error(d.error || 'Reminder failed');
      showToast(`Reminder sent to ${companyName}`);
    } catch (e: any) {
      showToast(e?.message || `Could not send reminder to ${companyName}. Please try again.`, '#ff7070');
    } finally { setReminding(null); }
  }

  async function awardBid(submissionId: string, subName: string) {
    if (!confirm(`Award bid to ${subName}?`)) return;
    setAwarding(submissionId);
    try {
      const r = await fetch(`/api/bid-packages/${id}/award`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, packageId: id }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) throw new Error(d.error || 'Award failed');
      showToast(d.message || `Awarded to ${subName}!`);
      await loadPackage();
    } catch (e: any) {
      showToast(e?.message || `Could not award bid to ${subName}. Please try again.`, '#ff7070');
    } finally { setAwarding(null); }
  }

  async function closeBids() {
    if (!confirm('Close this bid package? No more bids will be accepted.')) return;
    setClosing(true);
    try {
      const r = await fetch(`/api/bid-packages/${id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: id }),
      });
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok || d.error) throw new Error(d.error || 'Close failed');
      if (pkg) setPkg({ ...pkg, status: 'closed' });
      showToast('Bidding closed.');
    } catch (e: any) {
      showToast(e?.message || 'Could not close bidding. Please try again.', '#ff7070');
    } finally { setClosing(false); }
  }

  async function handleInviteMore() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const r = await fetch(`/api/bid-packages/${id}/invite-subs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subs: [{ name: inviteName, email: inviteEmail }] }),
      });
      if (!r.ok) throw new Error('invite failed');
      showToast(`Invite sent to ${inviteEmail}`);
      setInviteName('');
      setInviteEmail('');
      setShowInviteForm(false);
      await loadPackage();
    } catch {
      showToast(`Could not send the invite to ${inviteEmail}. Please try again.`, '#ff7070');
    } finally { setInviting(false); }
  }

  async function downloadPDF() {
    if (pkg?.jacket_pdf_url) {
      window.open(pkg.jacket_pdf_url, '_blank');
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
      window.open(url, '_blank');
    } catch { showToast('Could not generate the bid package PDF. Please try again.', '#ff7070'); }
  }

  // ── Loading / Not Found ──────────────────────────────────────────────────

  if (loading) return (
    <PremiumSurface maxWidth={1200}>
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
      <SectionCard title="Invited Subcontractors" icon={<UsersThree size={17} weight="duotone" color={GOLD} />} flush>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </SectionCard>
    </PremiumSurface>
  );

  if (!pkg) return (
    <PremiumSurface maxWidth={1200}>
      <SectionCard>
        <PremiumEmpty
          tone="error"
          icon={<Envelope size={30} weight="duotone" color={GOLD} />}
          title="Bid package not found"
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

  /* Which column the scope landed in depends on how the package was made —
     the AI builder, the manual form, and the import each pick a different one.
     Same order the contract prefill uses, so the card and the subcontract agree
     about what the sub is being asked to do. */
  const scopeText = pkg.scope_of_work || pkg.scope_narrative || pkg.scope_summary || pkg.description || '';

  const totalSov = toDollars(sumCents(pkg.sov_items.map(i => toCents(i.total))));
  const submittedSubs = pkg.invited_subs.filter(s => s.status === 'submitted');
  const submissions = pkg.bid_submissions || [];

  const inp: React.CSSProperties = { padding: '8px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' };

  // Header action buttons (Download PDF + optional Close Bidding)
  const headerActions = (
    <>
      <button onClick={downloadPDF} style={ghostButtonStyle} className="pmBtn">
        <FileText size={16} weight="regular" /> Download Bid Jacket PDF
      </button>
      {pkg.status !== 'closed' && pkg.status !== 'awarded' && (
        <button onClick={closeBids} disabled={closing} className="pmBtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, background: 'rgba(192,48,48,.12)', border: '1px solid rgba(192,48,48,.3)', color: '#ff7070', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', opacity: closing ? 0.6 : 1 }}>
          {closing ? 'Closing...' : <><Lock size={15} weight="bold" /> Close Bidding</>}
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: RAISED, border: `1px solid ${toast.color}`, borderRadius: 10, padding: '12px 20px', color: toast.color, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={1200}>

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
              color={pkg.status === 'awarded' ? '#1db954' : pkg.status === 'open' ? '#F59E0B' : pkg.status === 'closed' ? '#ff7070' : DIM}
              bg={pkg.status === 'awarded' ? 'rgba(26,138,74,.12)' : pkg.status === 'open' ? 'rgba(245,158,11,.12)' : pkg.status === 'closed' ? 'rgba(192,48,48,.12)' : 'rgba(148,163,192,.1)'}
            />
          }
          title={pkg.name}
          subtitle={`${pkg.trade ? pkg.trade + ' · ' : ''}Due: ${pkg.bid_due_date?.slice(0, 10) || 'TBD'}`}
          actions={headerActions}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard
            icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
            label="Scope Value" value={fmt(totalSov)}
          />
          <StatCard
            icon={<Trophy size={19} weight="duotone" color={GOLD} />}
            label="Awarded Amount"
            value={pkg.awarded_amount ? fmt(pkg.awarded_amount) : 'TBD'}
            accent={pkg.awarded_amount ? '#1db954' : undefined}
          />
          <StatCard
            icon={<UsersThree size={19} weight="duotone" color={GOLD} />}
            label="Subs Invited" value={String(pkg.invited_subs.length)}
          />
          <StatCard
            icon={<Receipt size={19} weight="duotone" color={GOLD} />}
            label="Bids Received"
            value={String(submissions.length || submittedSubs.length)}
            accent={(submissions.length || submittedSubs.length) > 0 ? '#1db954' : undefined}
          />
        </div>

        {/* Awarded banner */}
        {pkg.awarded_to && (
          <div style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.25)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, display: 'inline-flex' }}><Trophy size={20} color="#1db954" weight="fill" /></span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#1db954', marginBottom: 3, letterSpacing: 0.5 }}>Awarded To</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{pkg.awarded_to}{pkg.awarded_amount && <span style={{ color: '#1db954', marginLeft: 12 }}>{fmt(pkg.awarded_amount)}</span>}</div>
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
                background: GOLD, color: '#241500', fontSize: 13.5, fontWeight: 800,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              <FileText size={16} weight="bold" color="#241500" /> Paper the subcontract
            </Link>
          </div>
        )}

        {/* Scope */}
        {scopeText && (
          <div style={{ marginBottom: 20 }}>
            <SectionCard title="Scope of Work" icon={<ClipboardText size={17} weight="duotone" color={GOLD} />}>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{scopeText}</div>
            </SectionCard>
          </div>
        )}

        {/* SOV Line Items */}
        {pkg.sov_items.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <SectionCard title="Line Items" icon={<FileText size={17} weight="duotone" color={GOLD} />} flush>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: TH_BG }}>
                      {['Description', 'Qty', 'Unit', 'Unit Cost', 'Total'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${HAIR}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.sov_items.map(item => (
                      <tr key={item.id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                        <td style={{ padding: '11px 16px', color: TEXT }}>{item.description}</td>
                        <td style={{ padding: '11px 16px', color: DIM }}>{item.quantity}</td>
                        <td style={{ padding: '11px 16px', color: DIM }}>{item.unit}</td>
                        <td style={{ padding: '11px 16px', color: DIM }}>{fmt(item.unit_cost)}</td>
                        <td style={{ padding: '11px 16px', color: TEXT, fontWeight: 600 }}>{fmt(item.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(245, 158, 11,.05)', borderTop: `1px solid ${HAIR}` }}>
                      <td colSpan={4} style={{ padding: '11px 16px', color: DIM, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Total</td>
                      <td style={{ padding: '11px 16px', color: GOLD, fontWeight: 800, fontSize: 15 }}>{fmt(totalSov)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {/* Bid Submissions */}
        {submissions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <SectionCard
              title="Bid Submissions"
              icon={<Receipt size={17} weight="duotone" color={GOLD} />}
              action={<span style={{ fontSize: 12, color: MUTED }}>{submissions.length} received</span>}
              flush
            >
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: TH_BG }}>
                      {['Sub Name', 'Email', 'Bid Amount', 'Submitted', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${HAIR}` }}>{h}</th>
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
                            {isAwarded && <span style={{ fontSize: 10, color: '#1db954', marginLeft: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} color="#1db954" weight="fill" /> AWARDED</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.sub_email || '—'}</td>
                          <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 800, fontSize: 14 }}>{fmt(sub.amount)}</td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.submitted_at?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {!isAwarded && pkg.status !== 'awarded' && (
                              <button
                                onClick={() => awardBid(sub.id, sub.sub_name)}
                                disabled={awarding === sub.id}
                                style={{ padding: '5px 14px', background: 'rgba(26,138,74,.1)', border: '1px solid rgba(26,138,74,.3)', borderRadius: 6, color: '#1db954', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: awarding === sub.id ? 0.5 : 1 }}>
                                {awarding === sub.id ? 'Awarding...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trophy size={12} color="#1db954" weight="fill" /> Award</span>}
                              </button>
                            )}
                            {isAwarded && <span style={{ fontSize: 11, color: '#1db954' }}>Awarded</span>}
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
                  style={{ padding: '5px 12px', background: showInviteForm ? 'rgba(255,255,255,.05)' : 'rgba(245, 158, 11,.1)', border: `1px solid ${showInviteForm ? BORDER : 'rgba(245, 158, 11,.3)'}`, borderRadius: 6, color: showInviteForm ? DIM : GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {showInviteForm ? 'Cancel' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={12} color={GOLD} weight="bold" /> Invite More</span>}
                </button>
              </div>
            }
            flush
          >
            {/* Invite More Form */}
            {showInviteForm && (
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${HAIR}`, background: 'rgba(245, 158, 11,.03)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Name</div>
                  <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Company name" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 2, minWidth: 220 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Email *</div>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="contractor@company.com" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <button
                  onClick={handleInviteMore}
                  disabled={!inviteEmail || inviting}
                  className="pmBtn"
                  style={{ ...goldButtonStyle, opacity: (!inviteEmail || inviting) ? 0.6 : 1 }}>
                  {inviting ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            )}

            {pkg.invited_subs.length === 0 ? (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                    <UsersThree size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                    No subs invited yet
                    <span style={{ fontWeight: 400, color: DIM }}>{showInviteForm ? ' — send the first invite with the form above; bidding starts the moment it lands.' : ' — invite the first subcontractor to start collecting bids.'}</span>
                  </div>
                  {!showInviteForm && (
                    <button onClick={() => setShowInviteForm(true)} style={goldButtonStyle} className="pmBtn">
                      <Plus size={15} weight="bold" /> Invite Subcontractors
                    </button>
                  )}
                </div>
                <FlowStrip steps={[
                  { title: 'Invite subs', desc: 'email goes out with the package' },
                  { title: 'They bid online', desc: 'through the sub portal' },
                  { title: 'Compare and award', desc: 'right from this page' },
                  { title: 'Award flows on', desc: 'to contracts and budget' },
                ]} />
              </div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: TH_BG }}>
                      {['Company', 'Contact', 'Email', 'Status', 'Bid Amount', 'Invited', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${HAIR}` }}>{h}</th>
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
                            {isAwarded && <span style={{ fontSize: 10, color: '#1db954', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} color="#1db954" weight="fill" /> AWARDED</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.invited_at?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {(sub.status === 'invited' || sub.status === 'viewed') && (
                              <button
                                onClick={() => sendReminder(sub.id, sub.company_name)}
                                disabled={reminding === sub.id}
                                style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 10px', cursor: 'pointer', opacity: reminding === sub.id ? 0.5 : 1 }}>
                                {reminding === sub.id ? 'Sending...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Envelope size={11} color={GOLD} weight="regular" /> Remind</span>}
                              </button>
                            )}
                            {sub.status === 'submitted' && <span style={{ fontSize: 11, color: '#1db954', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} color="#1db954" weight="fill" /> Bid received</span>}
                            {sub.status === 'declined' && <span style={{ fontSize: 11, color: '#ff7070', display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={12} color="#ff7070" weight="fill" /> Declined</span>}
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
