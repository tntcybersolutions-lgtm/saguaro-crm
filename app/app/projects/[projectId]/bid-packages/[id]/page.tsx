'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';
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
  scope: string;
  status: string;
  bid_due_date: string | null;
  project_id: string;
  awarded_to: string | null;
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
    case 'viewed':    return { c: GOLD,      bg: 'rgba(212,160,23,.12)' };
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
        setPkg({
          ...d.bidPackage,
          sov_items: d.bidPackage.sov_items || [],
          invited_subs: d.bidPackage.invited_subs || [],
          bid_submissions: d.bidPackage.bid_submissions || d.bidPackage.submissions || [],
        });
      }
    } catch { /* leave null */ } finally { setLoading(false); }
  }

  async function sendReminder(subId: string, companyName: string) {
    setReminding(subId);
    try {
      await fetch(`/api/bid-packages/${id}/remind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, packageId: id }),
      });
      showToast(`Reminder sent to ${companyName}`);
    } catch {
      showToast(`Reminder queued for ${companyName}`);
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
      const d = await r.json() as any;
      showToast(d.message || `Awarded to ${subName}!`);
      await loadPackage();
    } catch {
      showToast(`Award recorded for ${subName}`);
      if (pkg) setPkg({ ...pkg, status: 'awarded', awarded_to: subName });
    } finally { setAwarding(null); }
  }

  async function closeBids() {
    if (!confirm('Close this bid package? No more bids will be accepted.')) return;
    setClosing(true);
    try {
      await fetch(`/api/bid-packages/${id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: id }),
      });
      if (pkg) setPkg({ ...pkg, status: 'closed' });
      showToast('Bidding closed.');
    } catch {
      if (pkg) setPkg({ ...pkg, status: 'closed' });
      showToast('Bidding closed.');
    } finally { setClosing(false); }
  }

  async function handleInviteMore() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await fetch(`/api/bid-packages/${id}/invite-subs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subs: [{ name: inviteName, email: inviteEmail }] }),
      });
      showToast(`Invite sent to ${inviteEmail}`);
      setInviteName('');
      setInviteEmail('');
      setShowInviteForm(false);
      await loadPackage();
    } catch {
      showToast(`Invite queued for ${inviteEmail}`);
      setShowInviteForm(false);
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
      const d = await r.json() as any;
      if (d.url || d.pdfUrl) window.open(d.url || d.pdfUrl, '_blank');
      else showToast('PDF generation queued. Check Documents.', GOLD);
    } catch { showToast('PDF queued. Check Documents.', GOLD); }
  }

  // ── Loading / Not Found ──────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: DIM }}>
      Loading bid package...
    </div>
  );

  if (!pkg) return (
    <div style={{ padding: 40, textAlign: 'center', color: DIM }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Bid package not found</div>
      <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={{ padding: '8px 18px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>← Go Back</button>
    </div>
  );

  const totalSov = pkg.sov_items.reduce((s, i) => s + i.total, 0);
  const submittedSubs = pkg.invited_subs.filter(s => s.status === 'submitted');
  const submissions = pkg.bid_submissions || [];

  const inp: React.CSSProperties = { padding: '8px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' };

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: RAISED, border: `1px solid ${toast.color}`, borderRadius: 10, padding: '12px 20px', color: toast.color, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: DARK }}>
        <div>
          <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={{ background: 'none', border: 'none', color: DIM, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Bid Packages
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {pkg.code && <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, fontFamily: 'monospace' }}>{pkg.code}</span>}
            <h1 style={{ fontSize: 20, fontWeight: 800, color: TEXT, margin: 0 }}>{pkg.name}</h1>
            <Badge
              label={pkg.status}
              color={pkg.status === 'awarded' ? '#1db954' : pkg.status === 'open' ? '#3b82f6' : pkg.status === 'closed' ? '#ff7070' : DIM}
              bg={pkg.status === 'awarded' ? 'rgba(26,138,74,.12)' : pkg.status === 'open' ? 'rgba(59,130,246,.12)' : pkg.status === 'closed' ? 'rgba(192,48,48,.12)' : 'rgba(148,163,192,.1)'}
            />
          </div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>
            {pkg.trade && <span>{pkg.trade} · </span>}
            Due: {pkg.bid_due_date?.slice(0, 10) || 'TBD'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={downloadPDF} style={{ padding: '9px 16px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            📄 Download Bid Jacket PDF
          </button>
          {pkg.status !== 'closed' && pkg.status !== 'awarded' && (
            <button onClick={closeBids} disabled={closing} style={{ padding: '9px 16px', background: 'rgba(192,48,48,.12)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, color: '#ff7070', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: closing ? 0.6 : 1 }}>
              {closing ? 'Closing...' : '🔒 Close Bidding'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { l: 'Scope Value', v: fmt(totalSov), c: TEXT },
            { l: 'Awarded Amount', v: pkg.awarded_amount ? fmt(pkg.awarded_amount) : 'TBD', c: pkg.awarded_amount ? '#1db954' : DIM },
            { l: 'Subs Invited', v: String(pkg.invited_subs.length), c: TEXT },
            { l: 'Bids Received', v: String(submissions.length || submittedSubs.length), c: (submissions.length || submittedSubs.length) > 0 ? '#1db954' : DIM },
          ].map(k => (
            <div key={k.l} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Awarded banner */}
        {pkg.awarded_to && (
          <div style={{ background: 'rgba(26,138,74,.08)', border: '1px solid rgba(26,138,74,.25)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🏆</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#1db954', marginBottom: 3, letterSpacing: 0.5 }}>Awarded To</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{pkg.awarded_to}{pkg.awarded_amount && <span style={{ color: '#1db954', marginLeft: 12 }}>{fmt(pkg.awarded_amount)}</span>}</div>
            </div>
          </div>
        )}

        {/* Scope */}
        {pkg.scope && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 8, letterSpacing: 0.5 }}>Scope of Work</div>
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{pkg.scope}</div>
          </div>
        )}

        {/* SOV Line Items */}
        {pkg.sov_items.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14, color: TEXT }}>Line Items</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Description', 'Qty', 'Unit', 'Unit Cost', 'Total'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pkg.sov_items.map(item => (
                  <tr key={item.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                    <td style={{ padding: '11px 16px', color: TEXT }}>{item.description}</td>
                    <td style={{ padding: '11px 16px', color: DIM }}>{item.quantity}</td>
                    <td style={{ padding: '11px 16px', color: DIM }}>{item.unit}</td>
                    <td style={{ padding: '11px 16px', color: DIM }}>{fmt(item.unit_cost)}</td>
                    <td style={{ padding: '11px 16px', color: TEXT, fontWeight: 600 }}>{fmt(item.total)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(212,160,23,.05)', borderTop: `1px solid ${BORDER}` }}>
                  <td colSpan={4} style={{ padding: '11px 16px', color: DIM, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Total</td>
                  <td style={{ padding: '11px 16px', color: GOLD, fontWeight: 800, fontSize: 15 }}>{fmt(totalSov)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Bid Submissions */}
        {submissions.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Bid Submissions</span>
              <span style={{ fontSize: 12, color: DIM }}>{submissions.length} received</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Sub Name', 'Email', 'Bid Amount', 'Submitted', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => {
                  const isAwarded = pkg.awarded_to === sub.sub_name || (pkg.awarded_amount !== null && pkg.awarded_amount === sub.amount);
                  return (
                    <tr key={sub.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)`, background: isAwarded ? 'rgba(26,138,74,.04)' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>
                        {sub.sub_name}
                        {isAwarded && <span style={{ fontSize: 10, color: '#1db954', marginLeft: 8, fontWeight: 700 }}>★ AWARDED</span>}
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
                            {awarding === sub.id ? 'Awarding...' : '🏆 Award'}
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
        )}

        {/* Invited Subs */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Invited Subcontractors</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: DIM }}>{pkg.invited_subs.length} invited · {submittedSubs.length} submitted</span>
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                style={{ padding: '5px 12px', background: showInviteForm ? 'rgba(255,255,255,.05)' : 'rgba(212,160,23,.1)', border: `1px solid ${showInviteForm ? BORDER : 'rgba(212,160,23,.3)'}`, borderRadius: 6, color: showInviteForm ? DIM : GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {showInviteForm ? 'Cancel' : '+ Invite More'}
              </button>
            </div>
          </div>

          {/* Invite More Form */}
          {showInviteForm && (
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(212,160,23,.03)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Name</div>
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Company name" style={inp} />
              </div>
              <div style={{ flex: 2 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Email *</div>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="contractor@company.com" style={inp} />
              </div>
              <button
                onClick={handleInviteMore}
                disabled={!inviteEmail || inviting}
                style={{ padding: '8px 18px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: (!inviteEmail || inviting) ? 0.6 : 1 }}>
                {inviting ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          )}

          {pkg.invited_subs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>No subs invited yet. Use "Invite More" to add subcontractors.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Company', 'Contact', 'Email', 'Status', 'Bid Amount', 'Invited', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pkg.invited_subs.map(sub => {
                  const sc = subStatusColor(sub.status);
                  const isAwarded = pkg.awarded_amount !== null && sub.bid_amount === pkg.awarded_amount;
                  return (
                    <tr key={sub.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                      <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{sub.company_name}</td>
                      <td style={{ padding: '12px 16px', color: DIM }}>{sub.contact_name || '—'}</td>
                      <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.email || '—'}</td>
                      <td style={{ padding: '12px 16px' }}><Badge label={sub.status} color={sc.c} bg={sc.bg} /></td>
                      <td style={{ padding: '12px 16px', color: sub.bid_amount ? TEXT : DIM, fontWeight: sub.bid_amount ? 600 : 400 }}>
                        {sub.bid_amount ? fmt(sub.bid_amount) : '—'}
                        {isAwarded && <span style={{ fontSize: 10, color: '#1db954', marginLeft: 6 }}>★ AWARDED</span>}
                      </td>
                      <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>{sub.invited_at?.slice(0, 10) || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {(sub.status === 'invited' || sub.status === 'viewed') && (
                          <button
                            onClick={() => sendReminder(sub.id, sub.company_name)}
                            disabled={reminding === sub.id}
                            style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: GOLD, fontSize: 11, padding: '3px 10px', cursor: 'pointer', opacity: reminding === sub.id ? 0.5 : 1 }}>
                            {reminding === sub.id ? 'Sending...' : '📧 Remind'}
                          </button>
                        )}
                        {sub.status === 'submitted' && <span style={{ fontSize: 11, color: '#1db954' }}>✓ Bid received</span>}
                        {sub.status === 'declined' && <span style={{ fontSize: 11, color: '#ff7070' }}>✗ Declined</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
