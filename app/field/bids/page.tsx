'use client';
/**
 * Saguaro Field — Bid Management
 * Bid packages, comparison tables, leveling, award recommendations, bidder invitations.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SwipeActionItem } from '@/components/field/SwipeAction';

const GOLD = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';

/* ── Types ─────────────────────────────────────────────── */

interface BidPackage {
  id: string;
  title: string;
  scope_description?: string;
  due_date?: string;
  status: 'Open' | 'Closed' | 'Awarded' | 'Cancelled';
  trade?: string;
  invited_bidders?: InvitedBidder[];
  created_at?: string;
}

interface InvitedBidder {
  id: string;
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  status: 'Invited' | 'Accepted' | 'Declined' | 'Submitted';
}

interface BidLineItem {
  id: string;
  description: string;
  unit?: string;
  quantity?: number;
}

interface BidderSubmission {
  bidder_id: string;
  company_name: string;
  line_items: { line_item_id: string; amount: number }[];
  total: number;
  notes?: string;
  submitted_at?: string;
  qualifications?: string[];
  exclusions?: string[];
}

interface BidComparison {
  line_items: BidLineItem[];
  bidders: BidderSubmission[];
  recommended_bidder_id?: string;
}

interface DirectoryPerson {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
}

type ViewMode = 'list' | 'detail' | 'comparison' | 'leveling' | 'invite';
type StatusFilter = 'all' | 'Open' | 'Closed' | 'Awarded' | 'Cancelled';

const STATUS_COLORS: Record<string, string> = {
  Open: GREEN,
  Closed: AMBER,
  Awarded: BLUE,
  Cancelled: RED,
  Invited: DIM,
  Accepted: GREEN,
  Declined: RED,
  Submitted: BLUE,
};

/* ── Helpers ───────────────────────────────────────────── */

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatUSDFull(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(d: string | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/* ── Styles ────────────────────────────────────────────── */

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 12 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#0A1628', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { padding: '10px 22px', background: GOLD, color: '#000', fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: '10px 22px', background: 'transparent', color: DIM, fontWeight: 600, border: `1px solid ${BORDER}`, borderRadius: 10, cursor: 'pointer', fontSize: 14 };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 };
const badge = (bg: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${bg}22`, color: bg });
const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '8px 18px', background: active ? GOLD : 'transparent', color: active ? '#000' : DIM, fontWeight: 700, border: `1px solid ${active ? GOLD : BORDER}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, transition: 'all .2s' });
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', position: 'sticky' as const, top: 0, background: '#0A1628', zIndex: 1 };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: TEXT, borderBottom: `1px solid ${BORDER}08` };

/* ── Main Component ────────────────────────────────────── */

function BidsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [packages, setPackages] = useState<BidPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedPkg, setSelectedPkg] = useState<BidPackage | null>(null);
  const [comparison, setComparison] = useState<BidComparison | null>(null);
  const [compLoading, setCompLoading] = useState(false);

  // Invite form
  const [directoryPeople, setDirectoryPeople] = useState<DirectoryPerson[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');

  // Money action BottomSheet state
  const [actionSheet, setActionSheet] = useState<{ bidderId: string; companyName: string; amount: number } | null>(null);
  const [sheetMode, setSheetMode] = useState<'menu' | 'edit' | 'adjust' | 'note'>('menu');
  const [editVal, setEditVal] = useState('');
  const [noteVal, setNoteVal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [fieldToast, setFieldToast] = useState<string | null>(null);
  const [copiedBidder, setCopiedBidder] = useState<string | null>(null);

  function showFieldToast(msg: string) { setFieldToast(msg); setTimeout(() => setFieldToast(null), 2500); }

  function openActionSheet(bidderId: string, companyName: string, amount: number) {
    setActionSheet({ bidderId, companyName, amount });
    setSheetMode('menu');
    setEditVal(String(amount));
    setNoteVal('');
  }

  function closeActionSheet() { setActionSheet(null); setSheetMode('menu'); }

  async function handleFieldSaveEdit() {
    if (!actionSheet) return;
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    const url = `/api/bids/${actionSheet.bidderId}`;
    const body = JSON.stringify({ bid_amount: amount });
    try {
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
    } catch {
      // Offline — queue for later sync
      if (typeof window !== 'undefined') {
        try {
          const { enqueue } = await import('@/lib/field-db');
          await enqueue({ url, method: 'PATCH', body, contentType: 'application/json', isFormData: false });
        } catch { /* field-db may not be available */ }
      }
    }
    // Optimistic update
    if (comparison) {
      setComparison({
        ...comparison,
        bidders: comparison.bidders.map(b => b.bidder_id === actionSheet.bidderId ? { ...b, total: amount } : b),
      });
    }
    showFieldToast('Amount updated');
    closeActionSheet();
  }

  async function handleFieldAdjust(pct: number) {
    if (!actionSheet) return;
    const newAmt = Math.round(actionSheet.amount * (1 + pct / 100));
    const url = `/api/bids/${actionSheet.bidderId}`;
    const body = JSON.stringify({ bid_amount: newAmt });
    try {
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
    } catch {
      if (typeof window !== 'undefined') {
        try {
          const { enqueue } = await import('@/lib/field-db');
          await enqueue({ url, method: 'PATCH', body, contentType: 'application/json', isFormData: false });
        } catch { /* */ }
      }
    }
    if (comparison) {
      setComparison({
        ...comparison,
        bidders: comparison.bidders.map(b => b.bidder_id === actionSheet.bidderId ? { ...b, total: newAmt } : b),
      });
    }
    showFieldToast(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`);
    closeActionSheet();
  }

  function handleFieldCopy(amount: number, bidderId: string) {
    navigator.clipboard.writeText(formatUSD(amount)).catch(() => {});
    setCopiedBidder(bidderId);
    setTimeout(() => setCopiedBidder(null), 2000);
    closeActionSheet();
  }

  async function handleFieldSaveNote() {
    if (!actionSheet || !noteVal.trim()) return;
    const url = `/api/bids/${actionSheet.bidderId}`;
    const body = JSON.stringify({ notes: noteVal.trim() });
    try {
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error();
    } catch {
      if (typeof window !== 'undefined') {
        try {
          const { enqueue } = await import('@/lib/field-db');
          await enqueue({ url, method: 'PATCH', body, contentType: 'application/json', isFormData: false });
        } catch { /* */ }
      }
    }
    showFieldToast('Note saved');
    closeActionSheet();
  }

  async function handleFieldDelete(bidderId: string) {
    const url = `/api/bids/${bidderId}`;
    try {
      const r = await fetch(url, { method: 'DELETE' });
      if (!r.ok) throw new Error();
    } catch {
      if (typeof window !== 'undefined') {
        try {
          const { enqueue } = await import('@/lib/field-db');
          await enqueue({ url, method: 'DELETE', body: '', contentType: 'application/json', isFormData: false });
        } catch { /* */ }
      }
    }
    if (comparison) {
      setComparison({
        ...comparison,
        bidders: comparison.bidders.filter(b => b.bidder_id !== bidderId),
      });
    }
    showFieldToast('Bid deleted');
    setDeleteConfirm(null);
  }

  const fetchPackages = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bid-packages`);
      if (!res.ok) throw new Error('Failed to load bid packages');
      const d = await res.json();
      setPackages(d.bid_packages || d.packages || []);
    } catch {
      setError('Unable to load bid packages');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const fetchComparison = useCallback(async (pkgId: string) => {
    setCompLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${pkgId}/bids`);
      if (!res.ok) throw new Error('Failed to load bids');
      const d = await res.json();
      setComparison(d);
    } catch {
      setError('Unable to load bid comparison');
    } finally {
      setCompLoading(false);
    }
  }, [projectId]);

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`);
      if (!res.ok) return;
      const d = await res.json();
      const people: DirectoryPerson[] = (d.people || []).map((p: Record<string, string>) => ({
        id: p.id,
        name: p.name,
        company_name: p.company_name,
        email: p.email,
        phone: p.phone,
      }));
      setDirectoryPeople(people);
    } catch { /* ignore */ }
  }, [projectId]);

  /* ── Open package detail ──────────────────────────────── */

  const openPackage = (pkg: BidPackage) => {
    setSelectedPkg(pkg);
    setView('detail');
    fetchComparison(pkg.id);
  };

  /* ── Invite bidders ───────────────────────────────────── */

  const openInvite = () => {
    setView('invite');
    fetchDirectory();
    setSelectedInvitees([]);
    setInviteSearch('');
  };

  const handleSendInvites = async () => {
    if (!selectedPkg || selectedInvitees.length === 0) return;
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${selectedPkg.id}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', contact_ids: selectedInvitees }),
      });
      if (!res.ok) throw new Error('Invite failed');
      await fetchPackages();
      const updated = packages.find((p) => p.id === selectedPkg.id);
      if (updated) setSelectedPkg(updated);
      setView('detail');
    } catch {
      setError('Failed to send invitations');
    } finally {
      setInviteLoading(false);
    }
  };

  if (!projectId) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: RED, fontWeight: 600 }}>No project selected.</p>
        <button onClick={() => router.push('/field')} style={btnPrimary}>Back to Projects</button>
      </div>
    );
  }

  /* ── Render: Invite Bidders ───────────────────────────── */

  if (view === 'invite' && selectedPkg) {
    const alreadyInvited = new Set((selectedPkg.invited_bidders || []).map((b) => b.id));
    const available = directoryPeople.filter((p) => {
      if (alreadyInvited.has(p.id)) return false;
      if (inviteSearch && !p.name.toLowerCase().includes(inviteSearch.toLowerCase()) && !(p.company_name || '').toLowerCase().includes(inviteSearch.toLowerCase())) return false;
      return true;
    });

    return (
      <div style={{ padding: '18px 16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => setView('detail')} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Package
        </button>

        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT }}>Invite Bidders</h1>
        <p style={{ margin: '0 0 16px', color: DIM, fontSize: 14 }}>{selectedPkg.title}</p>

        <input style={{ ...inputStyle, marginBottom: 12 }} placeholder="Search directory..." value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} />

        <div style={{ ...card, maxHeight: 400, overflowY: 'auto' }}>
          {available.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: DIM }}>No contacts available to invite</div>}
          {available.map((p) => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${BORDER}08`, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedInvitees.includes(p.id)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedInvitees([...selectedInvitees, p.id]);
                  else setSelectedInvitees(selectedInvitees.filter((id) => id !== p.id));
                }}
                style={{ accentColor: GOLD, width: 18, height: 18 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: DIM, fontSize: 12 }}>{p.company_name || ''}{p.email ? ` \u00B7 ${p.email}` : ''}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={handleSendInvites} disabled={inviteLoading || selectedInvitees.length === 0} style={{ ...btnPrimary, opacity: inviteLoading || selectedInvitees.length === 0 ? 0.5 : 1 }}>
            {inviteLoading ? 'Sending...' : `Invite ${selectedInvitees.length} Bidder${selectedInvitees.length !== 1 ? 's' : ''}`}
          </button>
          <button onClick={() => setView('detail')} style={btnSecondary}>Cancel</button>
        </div>
      </div>
    );
  }

  /* ── Render: Bid Comparison / Leveling ────────────────── */

  if ((view === 'comparison' || view === 'leveling') && selectedPkg && comparison) {
    const bidders = comparison.bidders || [];
    const lineItems = comparison.line_items || [];
    const recommendedId = comparison.recommended_bidder_id;

    // Find lowest bid per line item
    const lowestPerLine: Record<string, number> = {};
    lineItems.forEach((li) => {
      let min = Infinity;
      bidders.forEach((b) => {
        const entry = b.line_items.find((bl) => bl.line_item_id === li.id);
        if (entry && entry.amount < min) min = entry.amount;
      });
      if (min !== Infinity) lowestPerLine[li.id] = min;
    });

    // Rankings
    const ranked = [...bidders].sort((a, b) => a.total - b.total);
    const lowestTotal = ranked.length > 0 ? ranked[0].total : 0;

    return (
      <div style={{ padding: '18px 16px', maxWidth: 1100, margin: '0 auto' }}>
        <button onClick={() => setView('detail')} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Package
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>
            {view === 'leveling' ? 'Bid Leveling' : 'Bid Comparison'}
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setView('comparison')} style={tabStyle(view === 'comparison')}>Comparison</button>
            <button onClick={() => setView('leveling')} style={tabStyle(view === 'leveling')}>Leveling</button>
          </div>
        </div>

        <p style={{ margin: '0 0 12px', color: DIM, fontSize: 14 }}>{selectedPkg.title}</p>

        {/* Award recommendation */}
        {recommendedId && (
          <div style={{ ...card, borderColor: GREEN, borderLeft: `3px solid ${GREEN}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg viewBox="0 0 24 24" fill={GREEN} width={24} height={24}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <div>
              <div style={{ fontSize: 12, color: DIM }}>Award Recommendation</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{bidders.find((b) => b.bidder_id === recommendedId)?.company_name || 'Unknown'}</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <span style={badge(GREEN)}>Recommended</span>
            </div>
          </div>
        )}

        {bidders.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: DIM }}>No bids submitted yet</div>
        ) : view === 'comparison' ? (
          /* ── Comparison Table ──────────────────────────── */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: RAISED, borderRadius: 14, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#0A1628' }}>
                  <th style={thStyle}>Line Item</th>
                  {bidders.map((b, i) => (
                    <th key={b.bidder_id} style={{ ...thStyle, textAlign: 'right', minWidth: 120 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ color: TEXT, fontSize: 13 }}>{b.company_name}</span>
                        {b.bidder_id === recommendedId && <span style={badge(GREEN)}>Rec.</span>}
                        <span style={{ fontSize: 10, color: DIM }}>#{i + 1}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {li.description}
                      {li.quantity && li.unit && <span style={{ color: DIM, fontSize: 11, marginLeft: 6 }}>({li.quantity} {li.unit})</span>}
                    </td>
                    {bidders.map((b) => {
                      const entry = b.line_items.find((bl) => bl.line_item_id === li.id);
                      const amount = entry?.amount ?? 0;
                      const isLowest = lowestPerLine[li.id] === amount && amount > 0;
                      return (
                        <td key={b.bidder_id} style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: isLowest ? 700 : 400, color: isLowest ? GREEN : TEXT, background: isLowest ? `${GREEN}08` : 'transparent' }}>
                          {entry ? formatUSDFull(amount) : '\u2014'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0A1628' }}>
                  <td style={{ ...tdStyle, fontWeight: 800, color: TEXT }}>TOTAL</td>
                  {ranked.map((b, i) => {
                    const isLowest = i === 0;
                    return (
                      <td key={b.bidder_id} style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: isLowest ? GREEN : TEXT }}>
                        {formatUSD(b.total)}
                        <div style={{ fontSize: 10, color: isLowest ? GREEN : DIM, marginTop: 2 }}>Rank #{i + 1}</div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ── Bid Leveling View ─────────────────────────── */
          <div>
            {/* Normalized bar chart comparison */}
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: TEXT }}>Normalized Total Comparison</h3>
              {ranked.map((b, i) => {
                const pct = lowestTotal > 0 ? (b.total / lowestTotal) * 100 : 100;
                const diff = b.total - lowestTotal;
                const isRec = b.bidder_id === recommendedId;
                return (
                  <div key={b.bidder_id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>
                        {b.company_name}
                        {isRec && <span style={{ ...badge(GREEN), marginLeft: 8 }}>Recommended</span>}
                      </span>
                      <span style={{ color: i === 0 ? GREEN : diff > lowestTotal * 0.1 ? RED : AMBER, fontSize: 13, fontWeight: 700 }}>
                        {formatUSD(b.total)}{diff > 0 ? ` (+${formatUSD(diff)})` : ''}
                      </span>
                    </div>
                    <div style={{ height: 24, background: '#0A1628', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, pct)}%`,
                        background: i === 0 ? GREEN : pct > 110 ? RED : AMBER,
                        borderRadius: 8,
                        transition: 'width .5s',
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 8,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-line-item leveling */}
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>Line Item Analysis</h3>
            {lineItems.map((li) => {
              const bids = bidders
                .map((b) => ({ name: b.company_name, amount: b.line_items.find((bl) => bl.line_item_id === li.id)?.amount ?? 0 }))
                .filter((b) => b.amount > 0)
                .sort((a, b) => a.amount - b.amount);
              if (bids.length === 0) return null;
              const maxAmt = bids[bids.length - 1].amount;
              const avg = bids.reduce((s, b) => s + b.amount, 0) / bids.length;
              return (
                <div key={li.id} style={{ ...card, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{li.description}</span>
                    <span style={{ color: DIM, fontSize: 12 }}>Avg: {formatUSD(avg)}</span>
                  </div>
                  {bids.map((b, i) => {
                    const pct = maxAmt > 0 ? (b.amount / maxAmt) * 100 : 0;
                    const isLowest = i === 0;
                    const deviation = avg > 0 ? ((b.amount - avg) / avg) * 100 : 0;
                    return (
                      <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ width: 100, fontSize: 11, color: DIM, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0 }}>{b.name}</span>
                        <div style={{ flex: 1, height: 14, background: '#0A1628', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: isLowest ? GREEN : Math.abs(deviation) > 20 ? RED : BLUE, borderRadius: 4, transition: 'width .4s' }} />
                        </div>
                        <span style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: 600, color: isLowest ? GREEN : TEXT, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {formatUSD(b.amount)}
                        </span>
                        <span style={{ width: 50, textAlign: 'right', fontSize: 10, color: deviation > 10 ? RED : deviation < -10 ? GREEN : DIM, flexShrink: 0 }}>
                          {deviation >= 0 ? '+' : ''}{deviation.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Qualifications & Exclusions */}
            {bidders.some((b) => (b.qualifications && b.qualifications.length > 0) || (b.exclusions && b.exclusions.length > 0)) && (
              <>
                <h3 style={{ margin: '16px 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>Qualifications &amp; Exclusions</h3>
                {bidders.map((b) => {
                  if ((!b.qualifications || b.qualifications.length === 0) && (!b.exclusions || b.exclusions.length === 0)) return null;
                  return (
                    <div key={b.bidder_id} style={card}>
                      <h4 style={{ margin: '0 0 8px', color: TEXT, fontSize: 14 }}>{b.company_name}</h4>
                      {b.qualifications && b.qualifications.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: AMBER, fontWeight: 700, marginBottom: 4 }}>Qualifications</div>
                          {b.qualifications.map((q, i) => (
                            <div key={i} style={{ color: DIM, fontSize: 13, paddingLeft: 10, borderLeft: `2px solid ${AMBER}22`, marginBottom: 2 }}>{q}</div>
                          ))}
                        </div>
                      )}
                      {b.exclusions && b.exclusions.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: RED, fontWeight: 700, marginBottom: 4 }}>Exclusions</div>
                          {b.exclusions.map((ex, i) => (
                            <div key={i} style={{ color: DIM, fontSize: 13, paddingLeft: 10, borderLeft: `2px solid ${RED}22`, marginBottom: 2 }}>{ex}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── Render: Package Detail ───────────────────────────── */

  if (view === 'detail' && selectedPkg) {
    const days = daysUntil(selectedPkg.due_date);
    const invitedBidders = selectedPkg.invited_bidders || [];
    const submittedCount = invitedBidders.filter((b) => b.status === 'Submitted').length;

    return (
      <div style={{ padding: '18px 16px', maxWidth: 700, margin: '0 auto' }}>
        <button onClick={() => { setView('list'); setSelectedPkg(null); setComparison(null); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Packages
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT }}>{selectedPkg.title}</h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={badge(STATUS_COLORS[selectedPkg.status] || DIM)}>{selectedPkg.status}</span>
              {selectedPkg.trade && <span style={badge(BLUE)}>{selectedPkg.trade}</span>}
            </div>
          </div>
        </div>

        {/* Package info */}
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, color: DIM }}>Due Date</span>
              <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>
                {formatDate(selectedPkg.due_date)}
                {days !== null && (
                  <span style={{ color: days < 0 ? RED : days <= 3 ? AMBER : GREEN, fontSize: 12, marginLeft: 6 }}>
                    ({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`})
                  </span>
                )}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: DIM }}>Bidders</span>
              <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{submittedCount} / {invitedBidders.length} submitted</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: DIM }}>Created</span>
              <div style={{ color: TEXT, fontSize: 14 }}>{formatDate(selectedPkg.created_at)}</div>
            </div>
          </div>

          {selectedPkg.scope_description && (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 11, color: DIM }}>Scope Description</span>
              <div style={{ color: TEXT, fontSize: 14, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selectedPkg.scope_description}</div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(selectedPkg.status === 'Open' || selectedPkg.status === 'Closed') && (
            <button onClick={openInvite} style={{ ...btnPrimary, padding: '8px 16px', fontSize: 13 }}>+ Invite Bidders</button>
          )}
          {comparison && comparison.bidders && comparison.bidders.length >= 2 && (
            <>
              <button onClick={() => setView('comparison')} style={{ ...btnSecondary, padding: '8px 16px', fontSize: 13, color: BLUE }}>Compare Bids</button>
              <button onClick={() => setView('leveling')} style={{ ...btnSecondary, padding: '8px 16px', fontSize: 13, color: AMBER }}>Bid Leveling</button>
            </>
          )}
        </div>

        {/* Invited bidders list */}
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: TEXT }}>Invited Bidders ({invitedBidders.length})</h3>
        {invitedBidders.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: DIM }}>No bidders invited yet</div>
        ) : (
          invitedBidders.map((b) => (
            <div key={b.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${STATUS_COLORS[b.status] || DIM}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={STATUS_COLORS[b.status] || DIM} strokeWidth={2} width={20} height={20}>
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx={12} cy={7} r={4}/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{b.company_name}</div>
                {b.contact_name && <div style={{ color: DIM, fontSize: 12 }}>{b.contact_name}{b.email ? ` \u00B7 ${b.email}` : ''}</div>}
              </div>
              <span style={badge(STATUS_COLORS[b.status] || DIM)}>{b.status}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {b.phone && (
                  <a href={`tel:${b.phone}`} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11, textDecoration: 'none' }} title="Call">
                    <svg viewBox="0 0 24 24" fill={GREEN} width={14} height={14}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                  </a>
                )}
                {b.email && (
                  <a href={`mailto:${b.email}`} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11, textDecoration: 'none' }} title="Email">
                    <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={14} height={14}><rect x={2} y={4} width={20} height={16} rx={2}/><path d="M22 7l-10 7L2 7"/></svg>
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        {/* Quick comparison summary if bids loaded */}
        {compLoading && <div style={{ textAlign: 'center', padding: 20, color: DIM }}>Loading bids...</div>}
        {!compLoading && comparison && comparison.bidders && comparison.bidders.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: TEXT }}>Bid Summary</h3>
            <div style={card}>
              {[...comparison.bidders].sort((a, b) => a.total - b.total).map((b, i) => {
                const isRec = b.bidder_id === comparison.recommended_bidder_id;
                return (
                  <SwipeActionItem
                    key={b.bidder_id}
                    leftAction={{ label: 'Edit', color: GOLD, icon: '✏️', onAction: () => openActionSheet(b.bidder_id, b.company_name, b.total) }}
                    rightAction={{ label: 'Delete', color: RED, icon: '🗑️', onAction: () => setDeleteConfirm(b.bidder_id) }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < comparison.bidders.length - 1 ? `1px solid ${BORDER}08` : 'none', background: RAISED }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? `${GREEN}22` : '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: i === 0 ? GREEN : DIM, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                        #{i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{b.company_name}</span>
                        {isRec && <span style={{ ...badge(GREEN), marginLeft: 8 }}>Recommended</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: i === 0 ? GREEN : TEXT, fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{formatUSD(b.total)}</span>
                        {copiedBidder === b.bidder_id && <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>Copied!</span>}
                        <button onClick={(e) => { e.stopPropagation(); openActionSheet(b.bidder_id, b.company_name, b.total); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '4px 6px', fontSize: 16, lineHeight: 1 }}>⋯</button>
                      </div>
                    </div>
                  </SwipeActionItem>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Render: Package List ─────────────────────────────── */

  const filteredPackages = packages.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !(p.trade || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statusCounts = { all: packages.length, Open: 0, Closed: 0, Awarded: 0, Cancelled: 0 };
  packages.forEach((p) => { if (p.status in statusCounts) statusCounts[p.status as keyof typeof statusCounts]++; });

  return (
    <div style={{ padding: '18px 16px', maxWidth: 700, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        Back
      </button>

      <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: TEXT }}>Bid Management</h1>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={18} height={18} style={{ position: 'absolute', left: 12, top: 11 }}>
          <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
        </svg>
        <input style={{ ...inputStyle, paddingLeft: 38 }} placeholder="Search bid packages..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'Open', 'Closed', 'Awarded', 'Cancelled'] as StatusFilter[]).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} style={tabStyle(statusFilter === s)}>
            {s === 'all' ? 'All' : s} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading bid packages...</div>}
      {error && <div style={{ ...card, borderColor: RED, color: RED, padding: 12 }}>{error}</div>}

      {!loading && filteredPackages.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: DIM }}>No bid packages found</div>
      )}

      {/* ── Money Action BottomSheet ─────────────────────── */}
      <MoneyActionSheet
        actionSheet={actionSheet} sheetMode={sheetMode} setSheetMode={setSheetMode}
        editVal={editVal} setEditVal={setEditVal} noteVal={noteVal} setNoteVal={setNoteVal}
        onClose={closeActionSheet} onSaveEdit={handleFieldSaveEdit}
        onAdjust={(pct) => handleFieldAdjust(pct)}
        onCopy={() => actionSheet && handleFieldCopy(actionSheet.amount, actionSheet.bidderId)}
        onSaveNote={handleFieldSaveNote}
      />

      {/* ── Delete Confirmation Overlay ────────────────── */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: 24 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Delete this bid?</div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>This action cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleFieldDelete(deleteConfirm)} style={{ flex: 1, padding: '12px', background: 'rgba(239,68,68,.15)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 10, color: RED, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Yes, Delete</button>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: DIM, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────── */}
      {fieldToast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 20px', color: GREEN, fontSize: 13, fontWeight: 600, zIndex: 800, boxShadow: '0 8px 24px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>✓</span>{fieldToast}
        </div>
      )}

      {!loading && filteredPackages.map((pkg) => {
        const days = daysUntil(pkg.due_date);
        const invCount = pkg.invited_bidders?.length || 0;
        const submittedCount = pkg.invited_bidders?.filter((b) => b.status === 'Submitted').length || 0;

        return (
          <div key={pkg.id} style={{ ...card, cursor: 'pointer' }} onClick={() => openPackage(pkg)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: TEXT }}>{pkg.title}</h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={badge(STATUS_COLORS[pkg.status] || DIM)}>{pkg.status}</span>
                  {pkg.trade && <span style={badge(BLUE)}>{pkg.trade}</span>}
                </div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={20} height={20} style={{ flexShrink: 0, marginTop: 2 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: DIM }}>
              <span>Due: {formatDate(pkg.due_date)}
                {days !== null && (
                  <span style={{ color: days < 0 ? RED : days <= 3 ? AMBER : GREEN, marginLeft: 4 }}>
                    ({days < 0 ? 'overdue' : `${days}d`})
                  </span>
                )}
              </span>
              <span>Bidders: {submittedCount}/{invCount}</span>
            </div>

            {/* Mini progress bar for bid submissions */}
            {invCount > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: '#0A1628', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(submittedCount / invCount) * 100}%`, background: submittedCount === invCount ? GREEN : AMBER, borderRadius: 3, transition: 'width .4s' }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Money Action BottomSheet ────────────────────────── */

function MoneyActionSheet({
  actionSheet, sheetMode, setSheetMode, editVal, setEditVal, noteVal, setNoteVal,
  onClose, onSaveEdit, onAdjust, onCopy, onSaveNote,
}: {
  actionSheet: { bidderId: string; companyName: string; amount: number } | null;
  sheetMode: 'menu' | 'edit' | 'adjust' | 'note';
  setSheetMode: (m: 'menu' | 'edit' | 'adjust' | 'note') => void;
  editVal: string; setEditVal: (v: string) => void;
  noteVal: string; setNoteVal: (v: string) => void;
  onClose: () => void; onSaveEdit: () => void;
  onAdjust: (pct: number) => void; onCopy: () => void; onSaveNote: () => void;
}) {
  if (!actionSheet) return null;
  const menuItems = [
    { label: 'Edit Amount', icon: '✏️', action: () => { setSheetMode('edit'); setEditVal(String(actionSheet.amount)); } },
    { label: 'Adjust %', icon: '📊', action: () => setSheetMode('adjust') },
    { label: 'Copy Amount', icon: '📋', action: () => onCopy() },
    { label: 'Add Note', icon: '💬', action: () => setSheetMode('note') },
  ];

  return (
    <BottomSheet open={!!actionSheet} onClose={onClose} title={actionSheet.companyName}>
      <div style={{ padding: '8px 20px 24px' }}>
        {/* Current amount display */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#8BAAC8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Amount</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F0F4FF', fontVariantNumeric: 'tabular-nums' }}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(actionSheet.amount)}
          </div>
        </div>

        {sheetMode === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {menuItems.map(item => (
              <button key={item.label} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'transparent', border: `1px solid #1E3A5F`, borderRadius: 10, color: '#F0F4FF', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        )}

        {sheetMode === 'edit' && (
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8BAAC8', fontWeight: 700, marginBottom: 6 }}>New Amount ($)</label>
            <input
              value={editVal} onChange={e => setEditVal(e.target.value)}
              type="number" inputMode="decimal" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); }}
              style={{ width: '100%', padding: '14px 16px', background: '#0A1628', border: '1px solid #D4A017', borderRadius: 10, color: '#F0F4FF', fontSize: 20, fontWeight: 700, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={onSaveEdit} style={{ flex: 1, padding: '14px', background: '#D4A017', color: '#000', fontWeight: 700, border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setSheetMode('menu')} style={{ flex: 1, padding: '14px', background: 'transparent', color: '#8BAAC8', fontWeight: 600, border: '1px solid #1E3A5F', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
        )}

        {sheetMode === 'adjust' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[-10, -5, 5, 10].map(pct => (
                <button key={pct} onClick={() => onAdjust(pct)} style={{
                  padding: '16px', borderRadius: 10, fontSize: 18, fontWeight: 800, cursor: 'pointer', border: 'none',
                  background: pct > 0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                  color: pct > 0 ? '#22C55E' : '#EF4444',
                }}>
                  {pct > 0 ? '+' : ''}{pct}%
                </button>
              ))}
            </div>
            <button onClick={() => setSheetMode('menu')} style={{ width: '100%', padding: '12px', background: 'transparent', color: '#8BAAC8', fontWeight: 600, border: '1px solid #1E3A5F', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>Back</button>
          </div>
        )}

        {sheetMode === 'note' && (
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8BAAC8', fontWeight: 700, marginBottom: 6 }}>Note</label>
            <textarea
              value={noteVal} onChange={e => setNoteVal(e.target.value)}
              rows={3} autoFocus placeholder="e.g. Updated per sub quote 3/25"
              style={{ width: '100%', padding: '12px 14px', background: '#0A1628', border: '1px solid #D4A017', borderRadius: 10, color: '#F0F4FF', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={onSaveNote} disabled={!noteVal.trim()} style={{ flex: 1, padding: '14px', background: '#D4A017', color: '#000', fontWeight: 700, border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer', opacity: noteVal.trim() ? 1 : 0.5 }}>Save Note</button>
              <button onClick={() => setSheetMode('menu')} style={{ flex: 1, padding: '14px', background: 'transparent', color: '#8BAAC8', fontWeight: 600, border: '1px solid #1E3A5F', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

export default function BidsPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8BAAC8' }}>Loading bid management...</div>}>
      <BidsPage />
    </Suspense>
  );
}
