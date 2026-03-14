'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

/* ── Theme ── */
const GOLD = '#D4A017', BG = '#07101C', RAISED = '#0D1D2E', BORDER = '#1E3A5F',
  TEXT = '#F0F4FF', DIM = '#8BAAC8', GREEN = '#22C55E', RED = '#EF4444',
  AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#8B5CF6';

/* ── Types ── */
interface Session { id: string; tenant_id: string; project_id: string; sub_company: string; sub_contact_name: string; sub_email: string; trade: string; nda_signed: boolean; permissions: Record<string, boolean>; }
interface BidInvite { id: string; title: string; project_name: string; trade: string; due_date: string; estimated_value: number; description: string; scope_items: any[]; status: string; bonding_required: boolean; }
interface Task { id: string; phase: string; task_name: string; start_date: string; end_date: string; percent_complete: number; status: string; checklist: { text: string; done: boolean }[]; conflict_alert?: string; }
interface DailyLog { id: string; log_date: string; crew_count: number; hours_worked: number; work_completed: string; work_planned_tomorrow: string; safety_incidents: string; material_deliveries: string; photos: string[]; status: string; gc_comments: string; clock_in_at: string; clock_out_at: string; }
interface ComplianceDoc { id: string; doc_type: string; file_name: string; expiration_date: string; status: string; days_until_expiry: number; rejection_reason: string; }
interface PayApp { id: string; app_number: number; period_from: string; period_to: string; total_this_period: number; amount_due: number; status: string; line_items: any[]; gc_line_notes: Record<string, string>; payment_date: string; lien_waiver_type: string; lien_waiver_signed: boolean; }
interface Scorecard { quality_rating: number; schedule_rating: number; communication_rating: number; safety_rating: number; overall_rating: number; comments: string; project_name: string; rated_by_name: string; created_at: string; }
interface RFI { id: string; rfi_number: string; subject: string; question: string; response: string; status: string; created_at: string; responded_at: string; }
interface Message { id: string; sender_type: string; sender_name: string; message: string; message_type: string; file_url: string; created_at: string; read_by: string[]; }

/* ── Helpers ── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmt$(n: number) { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function daysBetween(a: string, b: string) { return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
function stars(n: number) { return Array.from({ length: 5 }, (_, i) => i < Math.round(n) ? '★' : '☆').join(''); }

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ background: color + '22', color, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const }}>{label}</span>;
}

/* ── Tab definitions ── */
const TABS = ['Dashboard', 'Bids & Scope', 'Schedule', 'Daily Logs', 'Pay Apps', 'Docs & Compliance', 'Scorecard'] as const;
type Tab = typeof TABS[number];

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */
export default function SubPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [toast, setToast] = useState('');

  const api = useCallback(async (path: string, opts?: RequestInit) => {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`/api/portal/sub/${path}${sep}token=${token}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-portal-token': token || '', ...(opts?.headers || {}) },
    });
    return res.json();
  }, [token]);

  useEffect(() => {
    api('auth', { method: 'POST' })
      .then(d => { if (d.session) setSession(d.session); else setError('Invalid or expired portal link'); })
      .catch(() => setError('Unable to connect'))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); } return undefined; }, [toast]);

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ width: 48, height: 48, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: DIM, fontSize: 14 }}>Loading your portal...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (error || !session) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, color: RED }}>&#9888;</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{error || 'Portal unavailable'}</div>
        <div style={{ color: DIM, marginTop: 8, fontSize: 14 }}>Please contact your general contractor for a valid link.</div>
      </div>
    </div>
  );

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: 'system-ui,sans-serif', color: TEXT }}>
      {toast && <div style={{ position: 'fixed', top: 20, right: 20, background: GREEN + '22', color: GREEN, padding: '10px 20px', borderRadius: 8, border: `1px solid ${GREEN}`, zIndex: 9999, fontSize: 14, fontWeight: 600 }}>{toast}</div>}

      {/* Header */}
      <header style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>&#127797;</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: GOLD, letterSpacing: 1 }}>SAGUARO</div>
            <div style={{ fontSize: 10, color: DIM, letterSpacing: 0.5 }}>SUBCONTRACTOR PORTAL</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{session.sub_company}</div>
          <div style={{ fontSize: 11, color: DIM }}>{session.sub_contact_name} &middot; {session.trade}</div>
        </div>
      </header>

      {/* Tab bar */}
      <nav style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, display: 'flex', overflowX: 'auto', padding: '0 16px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'transparent', color: tab === t ? GOLD : DIM, border: 'none', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', padding: '12px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{t}</button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {tab === 'Dashboard' && <DashboardTab api={api} session={session} setTab={setTab} />}
        {tab === 'Bids & Scope' && <BidsTab api={api} session={session} setToast={setToast} />}
        {tab === 'Schedule' && <ScheduleTab api={api} setToast={setToast} />}
        {tab === 'Daily Logs' && <DailyLogsTab api={api} setToast={setToast} />}
        {tab === 'Pay Apps' && <PayAppsTab api={api} setToast={setToast} />}
        {tab === 'Docs & Compliance' && <DocsTab api={api} setToast={setToast} />}
        {tab === 'Scorecard' && <ScorecardTab api={api} session={session} />}
      </main>

      <footer style={{ textAlign: 'center', padding: '20px 0', borderTop: `1px solid ${BORDER}`, color: DIM, fontSize: 11 }}>
        Powered by <span style={{ color: GOLD, fontWeight: 700 }}>Saguaro CRM</span> &middot; saguarocontrol.net
      </footer>
    </div>
  );
}

/* ═══ TAB 1: DASHBOARD ═══ */
function DashboardTab({ api, session, setTab }: { api: any; session: Session; setTab: (t: Tab) => void }) {
  const [data, setData] = useState<any>(null);
  const [scores, setScores] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api('schedule').catch(() => ({ tasks: [] })),
      api('scorecard').catch(() => ({ averages: {}, is_preferred: false })),
      api('compliance').catch(() => ({ documents: [] })),
    ]).then(([sched, sc, comp]) => {
      setData({ tasks: sched.tasks || [], compliance: comp.documents || [] });
      setScores(sc);
    }).finally(() => setLoading(false));
  }, [api]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading dashboard...</div>;

  const tasks = data?.tasks || [];
  const upcoming = tasks.filter((t: Task) => t.status !== 'completed').slice(0, 5);
  const compliance = data?.compliance || [];
  const expiring = compliance.filter((d: ComplianceDoc) => d.days_until_expiry !== undefined && d.days_until_expiry <= 30 && d.days_until_expiry > 0);
  const expired = compliance.filter((d: ComplianceDoc) => d.status === 'expired');
  const avg = scores?.averages || {};
  const preferred = scores?.is_preferred || false;

  const card = (label: string, val: string, color: string, onClick?: () => void) => (
    <div onClick={onClick} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', cursor: onClick ? 'pointer' : 'default', flex: 1, minWidth: 140 }}>
      <div style={{ color: DIM, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700 }}>{val}</div>
    </div>
  );

  return (
    <div>
      {/* Welcome */}
      <div style={{ background: `linear-gradient(135deg, ${RAISED}, ${BG})`, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: GOLD }}>Welcome, {session.sub_contact_name}</h1>
          <p style={{ margin: '4px 0 0', color: DIM, fontSize: 14 }}>{session.sub_company} &middot; {session.trade}</p>
        </div>
        {preferred && <div style={{ background: GOLD + '22', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '8px 16px', color: GOLD, fontWeight: 700, fontSize: 13 }}>&#9733; Preferred Subcontractor</div>}
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {card('Active Tasks', upcoming.length.toString(), BLUE, () => setTab('Schedule'))}
        {card('Compliance Docs', compliance.length.toString(), compliance.length > 0 && expired.length === 0 ? GREEN : RED)}
        {card('Overall Rating', avg.overall ? (avg.overall as number).toFixed(1) + '/5' : 'N/A', GOLD)}
        {card('Expiring Soon', expiring.length.toString(), expiring.length > 0 ? AMBER : GREEN)}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Submit Daily Log', tab: 'Daily Logs' as Tab, color: BLUE },
          { label: 'Submit Pay App', tab: 'Pay Apps' as Tab, color: GREEN },
          { label: 'File RFI', tab: 'Docs & Compliance' as Tab, color: PURPLE },
          { label: 'View Schedule', tab: 'Schedule' as Tab, color: AMBER },
        ].map(a => (
          <button key={a.label} onClick={() => setTab(a.tab)} style={{ background: a.color + '15', color: a.color, border: `1px solid ${a.color}40`, borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{a.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Upcoming tasks */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: TEXT }}>Upcoming Tasks</h3>
          {upcoming.length === 0 ? <div style={{ color: DIM, fontSize: 13 }}>No upcoming tasks</div> : upcoming.map((t: Task) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}20` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.task_name}</div>
                <div style={{ fontSize: 11, color: DIM }}>{t.phase} &middot; Due {fmtDate(t.end_date)}</div>
              </div>
              <div style={{ fontSize: 12, color: t.percent_complete >= 75 ? GREEN : t.percent_complete >= 25 ? AMBER : DIM }}>{t.percent_complete}%</div>
            </div>
          ))}
        </div>

        {/* Compliance summary */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: TEXT }}>Compliance Status</h3>
          {['insurance_cert', 'w9', 'business_license', 'bond', 'safety_cert'].map(type => {
            const doc = compliance.find((d: ComplianceDoc) => d.doc_type === type);
            const label = type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            return (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}20` }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                {doc ? <Badge label={doc.status} color={doc.status === 'approved' ? GREEN : doc.status === 'expired' ? RED : AMBER} /> : <Badge label="Missing" color={RED} />}
              </div>
            );
          })}
        </div>

        {/* Scorecard preview */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: TEXT }}>Performance Scorecard</h3>
          {['quality', 'schedule', 'communication', 'safety'].map(cat => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{cat}</span>
              <span style={{ color: GOLD, fontSize: 14, letterSpacing: 2 }}>{stars(avg[cat + '_rating'] || 0)}</span>
            </div>
          ))}
        </div>

        {/* Alerts */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: TEXT }}>Alerts</h3>
          {expired.length > 0 && expired.map((d: ComplianceDoc) => (
            <div key={d.id} style={{ background: RED + '15', border: `1px solid ${RED}30`, borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: RED }}>
              &#9888; {d.doc_type.replace(/_/g, ' ')} has expired
            </div>
          ))}
          {expiring.map((d: ComplianceDoc) => (
            <div key={d.id} style={{ background: AMBER + '15', border: `1px solid ${AMBER}30`, borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: AMBER }}>
              &#9888; {d.doc_type.replace(/_/g, ' ')} expires in {d.days_until_expiry} days
            </div>
          ))}
          {expired.length === 0 && expiring.length === 0 && <div style={{ color: GREEN, fontSize: 13 }}>&#10003; All documents current</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══ TAB 2: BIDS & SCOPE ═══ */
function BidsTab({ api, session, setToast }: { api: any; session: Session; setToast: (m: string) => void }) {
  const [bids, setBids] = useState<BidInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BidInvite | null>(null);
  const [showBidForm, setShowBidForm] = useState(false);
  const [ndaSigning, setNdaSigning] = useState(false);
  const [bidForm, setBidForm] = useState({ base_amount: '', inclusions: '', exclusions: '', schedule: '', notes: '', bond_available: true });
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    api('bids').then((d: any) => setBids(d.bids || d.invitations || [])).catch(() => {}).finally(() => setLoading(false));
  }, [api]);

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) { setDrawing(true); const ctx = canvasRef.current?.getContext('2d'); if (ctx) { ctx.beginPath(); ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY); } }
  function draw(e: React.MouseEvent<HTMLCanvasElement>) { if (!drawing) return; const ctx = canvasRef.current?.getContext('2d'); if (ctx) { ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke(); } }
  function endDraw() { setDrawing(false); }
  function clearSig() { const ctx = canvasRef.current?.getContext('2d'); if (ctx) ctx.clearRect(0, 0, 400, 100); }

  async function signNda() {
    setSaving(true);
    await api('bids', { method: 'POST', body: JSON.stringify({ action: 'sign_nda', signature: canvasRef.current?.toDataURL() }) });
    setNdaSigning(false); setSaving(false); setToast('NDA signed successfully');
  }

  async function submitBid() {
    if (!bidForm.base_amount) return;
    setSaving(true);
    await api('bids', { method: 'POST', body: JSON.stringify({ bid_invite_id: selected?.id, ...bidForm }) });
    setSaving(false); setShowBidForm(false); setToast('Bid submitted successfully');
    api('bids').then((d: any) => setBids(d.bids || d.invitations || []));
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading bids...</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: GOLD, marginBottom: 16 }}>Bids & Scope</h2>

      {!session.nda_signed && (
        <div style={{ background: AMBER + '15', border: `1px solid ${AMBER}40`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: AMBER, marginBottom: 8 }}>&#9888; NDA Required</div>
          <p style={{ color: DIM, fontSize: 13, margin: '0 0 12px' }}>You must sign a Non-Disclosure Agreement before viewing private bid documents.</p>
          <button onClick={() => setNdaSigning(true)} style={{ background: AMBER, color: BG, border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>Sign NDA</button>
        </div>
      )}

      {bids.length === 0 ? (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ color: DIM, fontSize: 16, marginBottom: 8 }}>No active bid invitations</div>
          <div style={{ color: DIM, fontSize: 13 }}>You will be notified when new bid invitations arrive.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {bids.map(b => (
            <div key={b.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, cursor: 'pointer' }} onClick={() => setSelected(b)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{b.title}</div>
                <Badge label={b.status} color={b.status === 'submitted' ? GREEN : b.status === 'awarded' ? GOLD : BLUE} />
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13, color: DIM }}>
                <span>Project: <span style={{ color: TEXT }}>{b.project_name}</span></span>
                <span>Due: <span style={{ color: new Date(b.due_date) < new Date() ? RED : TEXT }}>{fmtDate(b.due_date)}</span></span>
                <span>Est: <span style={{ color: GOLD }}>{fmt$(b.estimated_value)}</span></span>
                {b.bonding_required && <span style={{ color: AMBER }}>Bond Required</span>}
              </div>
              {b.description && <div style={{ marginTop: 8, fontSize: 13, color: DIM, lineHeight: 1.5 }}>{b.description.slice(0, 200)}...</div>}
            </div>
          ))}
        </div>
      )}

      {/* Bid detail / submit */}
      {selected && !showBidForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, width: 600, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', color: GOLD, fontSize: 18 }}>{selected.title}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[['Project', selected.project_name], ['Trade', selected.trade], ['Due Date', fmtDate(selected.due_date)], ['Est. Value', fmt$(selected.estimated_value)]].map(([l, v]) => (
                <div key={l}><div style={{ color: DIM, fontSize: 11, textTransform: 'uppercase' }}>{l}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
              ))}
            </div>
            {selected.description && <div style={{ background: BG, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: DIM, lineHeight: 1.6 }}>{selected.description}</div>}
            {selected.scope_items?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Scope Items</div>
                {selected.scope_items.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, borderBottom: `1px solid ${BORDER}20` }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>{i + 1}.</span>
                    <span>{item.description || item}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {selected.status !== 'submitted' && <button onClick={() => setShowBidForm(true)} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', flex: 1 }}>Submit Bid</button>}
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Bid submission form */}
      {showBidForm && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => setShowBidForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, width: 500, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', color: GOLD }}>Submit Bid — {selected.title}</h3>
            {[
              ['Base Bid Amount ($)', 'base_amount', 'number'],
              ['Proposed Schedule', 'schedule', 'text'],
            ].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>{label}</label>
                <input type={type} value={(bidForm as any)[key]} onChange={e => setBidForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
              </div>
            ))}
            {['Inclusions', 'Exclusions', 'Notes'].map(field => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>{field}</label>
                <textarea value={(bidForm as any)[field.toLowerCase()]} onChange={e => setBidForm(f => ({ ...f, [field.toLowerCase()]: e.target.value }))} rows={3} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={submitBid} disabled={saving} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', flex: 1 }}>{saving ? 'Submitting...' : 'Submit Bid'}</button>
              <button onClick={() => setShowBidForm(false)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* NDA signing modal */}
      {ndaSigning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, width: 480 }}>
            <h3 style={{ margin: '0 0 12px', color: GOLD }}>Non-Disclosure Agreement</h3>
            <div style={{ background: BG, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: DIM, lineHeight: 1.6, maxHeight: 200, overflowY: 'auto' }}>
              By signing below, you agree to keep all bid documents, pricing information, project details, and proprietary information shared through this portal strictly confidential. You may not disclose, share, or distribute any information to third parties without prior written consent from the general contractor. This agreement remains in effect for 2 years from the date of signing.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: DIM, marginBottom: 4, display: 'block' }}>Signature</label>
              <canvas ref={canvasRef} width={400} height={100} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'crosshair', width: '100%' }} />
              <button onClick={clearSig} style={{ background: 'transparent', color: DIM, border: 'none', cursor: 'pointer', fontSize: 11, marginTop: 4 }}>Clear signature</button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={signNda} disabled={saving} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', flex: 1 }}>{saving ? 'Signing...' : 'Sign NDA'}</button>
              <button onClick={() => setNdaSigning(false)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ TAB 3: SCHEDULE & TASKS ═══ */
function ScheduleTab({ api, setToast }: { api: any; setToast: (m: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api('schedule').then((d: any) => setTasks(d.tasks || [])).catch(() => {}).finally(() => setLoading(false)); }, [api]);

  async function updateTask(id: string, updates: Partial<Task>) {
    await api('schedule', { method: 'PATCH', body: JSON.stringify({ id, ...updates }) });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setToast('Task updated');
  }

  async function toggleChecklist(taskId: string, idx: number) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newChecklist = task.checklist.map((c, i) => i === idx ? { ...c, done: !c.done } : c);
    const pct = Math.round(newChecklist.filter(c => c.done).length / newChecklist.length * 100);
    await updateTask(taskId, { checklist: newChecklist, percent_complete: pct });
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading schedule...</div>;

  const today = new Date().toISOString().slice(0, 10);
  const minDate = tasks.reduce((min, t) => t.start_date < min ? t.start_date : min, today);
  const maxDate = tasks.reduce((max, t) => t.end_date > max ? t.end_date : max, today);
  const totalDays = Math.max(daysBetween(minDate, maxDate), 1);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: GOLD, marginBottom: 16 }}>Schedule & Tasks</h2>

      {/* Gantt chart */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 20, overflowX: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Project Timeline</h3>
        {tasks.length === 0 ? <div style={{ color: DIM, fontSize: 13 }}>No tasks assigned</div> : tasks.map(t => {
          const left = Math.max(0, daysBetween(minDate, t.start_date) / totalDays * 100);
          const width = Math.max(3, daysBetween(t.start_date, t.end_date) / totalDays * 100);
          const isPast = t.end_date < today;
          const color = t.status === 'completed' ? GREEN : t.conflict_alert ? RED : isPast ? AMBER : BLUE;
          return (
            <div key={t.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{t.task_name} <span style={{ color: DIM }}>({t.phase})</span></span>
                <span style={{ color }}>{t.percent_complete}%</span>
              </div>
              <div style={{ background: BG, borderRadius: 4, height: 20, position: 'relative' }}>
                <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%', background: color + '40', borderRadius: 4, border: `1px solid ${color}` }}>
                  <div style={{ height: '100%', width: `${t.percent_complete}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
              {t.conflict_alert && <div style={{ color: RED, fontSize: 11, marginTop: 2 }}>&#9888; {t.conflict_alert}</div>}
            </div>
          );
        })}
      </div>

      {/* Task checklist */}
      <div style={{ display: 'grid', gap: 12 }}>
        {tasks.map(t => (
          <div key={t.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{t.task_name}</span>
                <span style={{ color: DIM, marginLeft: 8, fontSize: 12 }}>{fmtDate(t.start_date)} — {fmtDate(t.end_date)}</span>
              </div>
              <Badge label={t.status} color={t.status === 'completed' ? GREEN : t.status === 'blocked' ? RED : t.status === 'in_progress' ? BLUE : DIM} />
            </div>
            <div style={{ background: BG, borderRadius: 6, height: 6, marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${t.percent_complete}%`, background: GOLD, borderRadius: 6 }} />
            </div>
            {t.checklist.length > 0 && t.checklist.map((c, i) => (
              <div key={i} onClick={() => toggleChecklist(t.id, i)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
                <span style={{ color: c.done ? GREEN : DIM }}>{c.done ? '&#9745;' : '&#9744;'}</span>
                <span style={{ color: c.done ? DIM : TEXT, textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span>
              </div>
            ))}
            {t.status !== 'completed' && (
              <button onClick={() => updateTask(t.id, { status: 'completed', percent_complete: 100 })} style={{ marginTop: 8, background: GREEN + '15', color: GREEN, border: `1px solid ${GREEN}40`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Mark Complete</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ TAB 4: DAILY LOGS ═══ */
function DailyLogsTab({ api, setToast }: { api: any; setToast: (m: string) => void }) {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [form, setForm] = useState({ crew_count: 0, hours_worked: 8, work_completed: '', work_planned_tomorrow: '', safety_incidents: '', material_deliveries: '' });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    api('daily-logs').then((d: any) => setLogs(d.logs || d.daily_logs || [])).catch(() => {}).finally(() => setLoading(false));
    const onOff = () => setOnline(navigator.onLine);
    window.addEventListener('online', onOff); window.addEventListener('offline', onOff);
    return () => { window.removeEventListener('online', onOff); window.removeEventListener('offline', onOff); };
  }, [api]);

  function getGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setToast('GPS access denied')
    );
  }

  async function submitLog() {
    setSaving(true);
    try {
      await api('daily-logs', {
        method: 'POST',
        body: JSON.stringify({ ...form, log_date: new Date().toISOString().slice(0, 10), gps_clock_in: gps }),
      });
      setToast('Daily log submitted'); setShowForm(false);
      api('daily-logs').then((d: any) => setLogs(d.logs || d.daily_logs || []));
    } catch { setToast('Failed to submit log'); }
    setSaving(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading logs...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: GOLD, margin: 0 }}>Daily Reporting</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!online && <span style={{ color: RED, fontSize: 12, fontWeight: 600 }}>&#9679; Offline</span>}
          <button onClick={() => { setShowForm(true); getGPS(); }} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>+ New Log</button>
        </div>
      </div>

      {/* New log form */}
      {showForm && (
        <div style={{ background: RAISED, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', color: GOLD, fontSize: 16 }}>Daily Log — {new Date().toLocaleDateString()}</h3>
          {gps && <div style={{ background: GREEN + '15', color: GREEN, padding: '6px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>&#10003; GPS Location: {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Crew Count</label>
              <input type="number" value={form.crew_count} onChange={e => setForm(f => ({ ...f, crew_count: +e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Hours Worked</label>
              <input type="number" step="0.5" value={form.hours_worked} onChange={e => setForm(f => ({ ...f, hours_worked: +e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
            </div>
          </div>
          {[
            ['Work Completed', 'work_completed'],
            ['Work Planned Tomorrow', 'work_planned_tomorrow'],
            ['Safety Incidents', 'safety_incidents'],
            ['Material Deliveries', 'material_deliveries'],
          ].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>{label}</label>
              <textarea value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} rows={2} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submitLog} disabled={saving} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Submitting...' : 'Submit Log'}</button>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Log history */}
      {logs.length === 0 ? (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 40, textAlign: 'center', color: DIM }}>No daily logs submitted yet</div>
      ) : logs.map(l => (
        <div key={l.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtDate(l.log_date)}</div>
            <Badge label={l.status} color={l.status === 'reviewed' ? GREEN : l.status === 'correction_requested' ? RED : BLUE} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: DIM }}>Crew: <span style={{ color: TEXT, fontWeight: 600 }}>{l.crew_count}</span></span>
            <span style={{ color: DIM }}>Hours: <span style={{ color: TEXT, fontWeight: 600 }}>{l.hours_worked}</span></span>
            {l.clock_in_at && <span style={{ color: DIM }}>In: {new Date(l.clock_in_at).toLocaleTimeString()}</span>}
          </div>
          {l.work_completed && <div style={{ fontSize: 13, color: TEXT, marginBottom: 4 }}><span style={{ color: DIM }}>Completed:</span> {l.work_completed}</div>}
          {l.safety_incidents && <div style={{ fontSize: 13, color: RED, marginBottom: 4 }}>&#9888; Safety: {l.safety_incidents}</div>}
          {l.gc_comments && (
            <div style={{ background: BG, borderRadius: 6, padding: '8px 12px', marginTop: 8, borderLeft: `3px solid ${AMBER}` }}>
              <div style={{ color: AMBER, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>GC Comment</div>
              <div style={{ fontSize: 13, color: TEXT }}>{l.gc_comments}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══ TAB 5: PAY APPLICATIONS ═══ */
function PayAppsTab({ api, setToast }: { api: any; setToast: (m: string) => void }) {
  const [apps, setApps] = useState<PayApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<PayApp | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ period_from: '', period_to: '', line_items: [{ description: '', scheduled_value: 0, this_period: 0 }] });

  useEffect(() => { api('pay-apps').then((d: any) => setApps(d.pay_apps || d.payApps || [])).catch(() => {}).finally(() => setLoading(false)); }, [api]);

  function addLine() { setForm(f => ({ ...f, line_items: [...f.line_items, { description: '', scheduled_value: 0, this_period: 0 }] })); }
  function updateLine(i: number, field: string, val: any) { setForm(f => ({ ...f, line_items: f.line_items.map((l, idx) => idx === i ? { ...l, [field]: val } : l) })); }

  async function submitPayApp() {
    setSaving(true);
    const total = form.line_items.reduce((s, l) => s + (l.this_period || 0), 0);
    await api('pay-apps', { method: 'POST', body: JSON.stringify({ ...form, total_this_period: total }) });
    setToast('Pay application submitted'); setShowForm(false); setSaving(false);
    api('pay-apps').then((d: any) => setApps(d.pay_apps || d.payApps || []));
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading pay applications...</div>;

  const statusColor = (s: string) => s === 'paid' ? GREEN : s === 'approved' ? BLUE : s === 'disputed' ? RED : s === 'under_review' ? AMBER : DIM;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: GOLD, margin: 0 }}>Pay Applications</h2>
        <button onClick={() => setShowForm(true)} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>+ New Pay App</button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div style={{ background: RAISED, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', color: GOLD }}>New Pay Application</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Period From</label>
              <input type="date" value={form.period_from} onChange={e => setForm(f => ({ ...f, period_from: e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Period To</label>
              <input type="date" value={form.period_to} onChange={e => setForm(f => ({ ...f, period_to: e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Schedule of Values</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: BG }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: DIM }}>Description</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: DIM }}>Scheduled Value</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: DIM }}>This Period</th>
              </tr>
            </thead>
            <tbody>
              {form.line_items.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 6px' }}><input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', boxSizing: 'border-box' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input type="number" value={l.scheduled_value} onChange={e => updateLine(i, 'scheduled_value', +e.target.value)} style={{ width: 120, background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input type="number" value={l.this_period} onChange={e => updateLine(i, 'this_period', +e.target.value)} style={{ width: 120, background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', textAlign: 'right' }} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: '8px 10px' }}>Total</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt$(form.line_items.reduce((s, l) => s + l.scheduled_value, 0))}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: GOLD }}>{fmt$(form.line_items.reduce((s, l) => s + l.this_period, 0))}</td>
              </tr>
            </tfoot>
          </table>
          <button onClick={addLine} style={{ background: 'transparent', color: GOLD, border: `1px dashed ${GOLD}40`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, marginBottom: 16 }}>+ Add Line Item</button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submitPayApp} disabled={saving} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Submitting...' : 'Submit Pay App'}</button>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Pay app history */}
      {apps.length === 0 ? (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 40, textAlign: 'center', color: DIM }}>No pay applications yet</div>
      ) : apps.map(a => (
        <div key={a.id} onClick={() => setSelected(selected?.id === a.id ? null : a)} style={{ background: RAISED, border: `1px solid ${selected?.id === a.id ? GOLD : BORDER}`, borderRadius: 10, padding: 16, marginBottom: 12, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Pay App #{a.app_number}</div>
            <Badge label={a.status} color={statusColor(a.status)} />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <span style={{ color: DIM }}>Period: {fmtDate(a.period_from)} — {fmtDate(a.period_to)}</span>
            <span style={{ color: GOLD, fontWeight: 700 }}>Amount: {fmt$(a.amount_due)}</span>
            {a.payment_date && <span style={{ color: GREEN }}>Paid: {fmtDate(a.payment_date)}</span>}
          </div>
          {a.lien_waiver_type && (
            <div style={{ marginTop: 8, fontSize: 12, color: a.lien_waiver_signed ? GREEN : AMBER }}>
              Lien Waiver ({a.lien_waiver_type}): {a.lien_waiver_signed ? '&#10003; Signed' : 'Pending signature'}
            </div>
          )}

          {/* Expanded detail */}
          {selected?.id === a.id && a.line_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: DIM }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Item</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Scheduled</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>This Period</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>GC Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {a.line_items.map((l: any, i: number) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}20` }}>
                      <td style={{ padding: '6px 8px' }}>{l.description}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt$(l.scheduled_value)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: GOLD }}>{fmt$(l.this_period)}</td>
                      <td style={{ padding: '6px 8px', color: AMBER }}>{a.gc_line_notes?.[i] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══ TAB 6: DOCS & COMPLIANCE ═══ */
function DocsTab({ api, setToast }: { api: any; setToast: (m: string) => void }) {
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [portalDocs, setPortalDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'compliance' | 'documents' | 'rfis'>('compliance');
  const [showUpload, setShowUpload] = useState(false);
  const [showRFI, setShowRFI] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type: 'insurance_cert', file_name: '', expiration_date: '' });
  const [rfiForm, setRfiForm] = useState({ subject: '', question: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api('compliance').then((d: any) => setDocs(d.documents || [])),
      api('rfis').then((d: any) => setRfis(d.rfis || [])),
      api('documents').then((d: any) => setPortalDocs(d.documents || [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [api]);

  async function uploadDoc() {
    setSaving(true);
    await api('compliance', { method: 'POST', body: JSON.stringify(uploadForm) });
    setToast('Document uploaded'); setShowUpload(false); setSaving(false);
    api('compliance').then((d: any) => setDocs(d.documents || []));
  }

  async function submitRFI() {
    if (!rfiForm.subject || !rfiForm.question) return;
    setSaving(true);
    await api('rfis', { method: 'POST', body: JSON.stringify(rfiForm) });
    setToast('RFI submitted'); setShowRFI(false); setSaving(false);
    api('rfis').then((d: any) => setRfis(d.rfis || []));
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading documents...</div>;

  const DOC_TYPES = ['insurance_cert', 'w9', 'business_license', 'bond', 'safety_cert', 'osha_card'];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: GOLD, marginBottom: 16 }}>Documents & Compliance</h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['compliance', 'documents', 'rfis'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{ background: subTab === t ? GOLD + '22' : 'transparent', color: subTab === t ? GOLD : DIM, border: 'none', borderBottom: subTab === t ? `2px solid ${GOLD}` : '2px solid transparent', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>{t === 'rfis' ? 'RFIs' : t}</button>
        ))}
      </div>

      {subTab === 'compliance' && (
        <>
          <button onClick={() => setShowUpload(true)} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}>+ Upload Document</button>

          {showUpload && (
            <div style={{ background: RAISED, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Document Type</label>
                <select value={uploadForm.doc_type} onChange={e => setUploadForm(f => ({ ...f, doc_type: e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px' }}>
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>File Name</label>
                <input value={uploadForm.file_name} onChange={e => setUploadForm(f => ({ ...f, file_name: e.target.value }))} placeholder="certificate_of_insurance.pdf" style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Expiration Date</label>
                <input type="date" value={uploadForm.expiration_date} onChange={e => setUploadForm(f => ({ ...f, expiration_date: e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={uploadDoc} disabled={saving} style={{ background: GOLD, color: BG, border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Uploading...' : 'Upload'}</button>
                <button onClick={() => setShowUpload(false)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {DOC_TYPES.map(type => {
              const doc = docs.find(d => d.doc_type === type);
              const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div key={type} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                    {doc ? (
                      <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
                        {doc.file_name} &middot; Expires: {fmtDate(doc.expiration_date)}
                        {doc.days_until_expiry !== undefined && doc.days_until_expiry <= 30 && doc.days_until_expiry > 0 && <span style={{ color: AMBER, marginLeft: 8 }}>({doc.days_until_expiry} days left)</span>}
                      </div>
                    ) : <div style={{ fontSize: 12, color: RED }}>Not uploaded</div>}
                    {doc?.rejection_reason && <div style={{ fontSize: 12, color: RED, marginTop: 2 }}>Rejected: {doc.rejection_reason}</div>}
                  </div>
                  {doc ? <Badge label={doc.status} color={doc.status === 'approved' ? GREEN : doc.status === 'expired' ? RED : doc.status === 'rejected' ? RED : AMBER} /> : <Badge label="Required" color={RED} />}
                </div>
              );
            })}
          </div>
        </>
      )}

      {subTab === 'documents' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {portalDocs.length === 0 ? <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 40, textAlign: 'center', color: DIM }}>No shared documents</div> : portalDocs.map((d: any) => (
            <div key={d.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                <div style={{ fontSize: 12, color: DIM }}>{d.category} &middot; v{d.version} &middot; {fmtDate(d.created_at)}</div>
              </div>
              <button style={{ background: BLUE + '22', color: BLUE, border: `1px solid ${BLUE}40`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Download</button>
            </div>
          ))}
        </div>
      )}

      {subTab === 'rfis' && (
        <>
          <button onClick={() => setShowRFI(true)} style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}>+ New RFI</button>

          {showRFI && (
            <div style={{ background: RAISED, border: `1px solid ${PURPLE}40`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Subject</label>
                <input value={rfiForm.subject} onChange={e => setRfiForm(f => ({ ...f, subject: e.target.value }))} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Question</label>
                <textarea value={rfiForm.question} onChange={e => setRfiForm(f => ({ ...f, question: e.target.value }))} rows={4} style={{ width: '100%', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submitRFI} disabled={saving} style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Submitting...' : 'Submit RFI'}</button>
                <button onClick={() => setShowRFI(false)} style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {rfis.length === 0 ? <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 40, textAlign: 'center', color: DIM }}>No RFIs submitted</div> : rfis.map(r => (
              <div key={r.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.rfi_number}: {r.subject}</div>
                  <Badge label={r.status} color={r.status === 'answered' ? GREEN : r.status === 'closed' ? DIM : AMBER} />
                </div>
                <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}>{r.question}</div>
                {r.response && (
                  <div style={{ background: BG, borderRadius: 6, padding: '8px 12px', marginTop: 8, borderLeft: `3px solid ${GREEN}` }}>
                    <div style={{ color: GREEN, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Response — {fmtDate(r.responded_at)}</div>
                    <div style={{ fontSize: 13, color: TEXT }}>{r.response}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══ TAB 7: PERFORMANCE SCORECARD ═══ */
function ScorecardTab({ api, session }: { api: any; session: Session }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api('scorecard').then(setData).catch(() => {}).finally(() => setLoading(false)); }, [api]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading scorecard...</div>;

  const avg = data?.averages || {};
  const scorecards: Scorecard[] = data?.scorecards || [];
  const preferred = data?.is_preferred || false;
  const totalReviews = data?.total_reviews || 0;
  const categories = [
    { key: 'quality_rating', label: 'Quality', color: GREEN },
    { key: 'schedule_rating', label: 'Schedule', color: BLUE },
    { key: 'communication_rating', label: 'Communication', color: PURPLE },
    { key: 'safety_rating', label: 'Safety', color: AMBER },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: GOLD, marginBottom: 16 }}>Performance Scorecard</h2>

      {/* Overall rating */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20, textAlign: 'center' }}>
        {preferred && <div style={{ background: GOLD + '22', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '8px 20px', display: 'inline-block', marginBottom: 16, color: GOLD, fontWeight: 700, fontSize: 14 }}>&#9733; Preferred Subcontractor</div>}
        <div style={{ fontSize: 48, fontWeight: 800, color: GOLD, letterSpacing: 6 }}>{stars(avg.overall || 0)}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, marginTop: 8 }}>{avg.overall ? (avg.overall as number).toFixed(1) : 'N/A'}<span style={{ fontSize: 16, color: DIM }}>/5.0</span></div>
        <div style={{ color: DIM, fontSize: 14, marginTop: 4 }}>Based on {totalReviews} project review{totalReviews !== 1 ? 's' : ''}</div>
      </div>

      {/* Category breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {categories.map(cat => {
          const val = avg[cat.key] || 0;
          return (
            <div key={cat.key} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ color: DIM, fontSize: 12, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>{cat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: cat.color }}>{val ? (val as number).toFixed(1) : 'N/A'}</div>
              <div style={{ color: GOLD, letterSpacing: 3, marginTop: 4 }}>{stars(val)}</div>
              {/* Bar */}
              <div style={{ background: BG, borderRadius: 4, height: 6, marginTop: 8 }}>
                <div style={{ height: '100%', width: `${(val / 5) * 100}%`, background: cat.color, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Score trend */}
      {scorecards.length > 1 && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Score Trend</h3>
          <svg viewBox={`0 0 ${scorecards.length * 80} 120`} style={{ width: '100%', height: 120 }}>
            {/* Grid lines */}
            {[1, 2, 3, 4, 5].map(v => (
              <line key={v} x1={0} y1={120 - v * 20} x2={scorecards.length * 80} y2={120 - v * 20} stroke={BORDER} strokeWidth={0.5} />
            ))}
            {/* Line */}
            <polyline fill="none" stroke={GOLD} strokeWidth={2}
              points={scorecards.map((s, i) => `${i * 80 + 40},${120 - (s.overall_rating || 0) * 20}`).join(' ')} />
            {/* Dots */}
            {scorecards.map((s, i) => (
              <circle key={i} cx={i * 80 + 40} cy={120 - (s.overall_rating || 0) * 20} r={4} fill={GOLD} />
            ))}
          </svg>
        </div>
      )}

      {/* Per-project reviews */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Project Reviews</h3>
        {scorecards.length === 0 ? <div style={{ color: DIM, fontSize: 13 }}>No reviews yet</div> : scorecards.map((s, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${BORDER}20`, padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.project_name || 'Project'}</div>
              <div style={{ color: DIM, fontSize: 12 }}>{fmtDate(s.created_at)}</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 4 }}>
              {categories.map(cat => (
                <span key={cat.key} style={{ color: DIM }}>{cat.label}: <span style={{ color: cat.color, fontWeight: 700 }}>{(s as any)[cat.key]}/5</span></span>
              ))}
            </div>
            {s.comments && <div style={{ fontSize: 13, color: TEXT, marginTop: 4, fontStyle: 'italic' }}>"{s.comments}"</div>}
            <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Reviewed by {s.rated_by_name}</div>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Tips to Improve Your Score</h3>
        {[
          { cat: 'Quality', tip: 'Complete punch list items within 48 hours. Submit photos of completed work.', color: GREEN },
          { cat: 'Schedule', tip: 'Update daily logs consistently. Communicate delays early.', color: BLUE },
          { cat: 'Communication', tip: 'Respond to RFIs within 24 hours. Submit daily logs every day.', color: PURPLE },
          { cat: 'Safety', tip: 'Zero incidents = 5 stars. Complete all toolbox talks. Keep safety certs current.', color: AMBER },
        ].map(t => (
          <div key={t.cat} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${BORDER}20` }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 13, minWidth: 120 }}>{t.cat}</div>
            <div style={{ fontSize: 13, color: DIM }}>{t.tip}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
