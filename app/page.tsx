'use client';
import React, { useState, useEffect, useRef } from 'react';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#22c55e';

const NAV_LINKS = [
  { label: 'Features',  href: '/#features' },
  { label: 'How It Works', href: '/#demo' },
  { label: 'Pricing',   href: '/pricing' },
  { label: 'Compare',   href: '/compare/procore' },
];

const FEATURES = [
  { icon: '📐', title: 'AI Blueprint Takeoff', desc: 'Upload any PDF blueprint. Claude reads every dimension, calculates all materials, and generates a full bid estimate in under 60 seconds.', pill: 'AI-powered' },
  { icon: '💰', title: 'AIA Pay Applications', desc: 'Generate G702/G703 Continuation Sheets automatically. Submit to owners digitally with one click — no PDFs to fill by hand.', pill: 'G702 / G703' },
  { icon: '🔒', title: 'Lien Waivers — All 50 States', desc: 'Conditional & unconditional, partial & final. AZ, CA, TX statutory language. Send, sign, and track — no paper, no fax.', pill: 'All 50 states' },
  { icon: '🤖', title: 'Autopilot', desc: "Automated RFI routing, change order alerts, insurance expiry reminders, and pay app follow-ups — while you're in the field.", pill: 'Fully automated' },
  { icon: '📋', title: 'Certified Payroll WH-347', desc: 'DOL-compliant weekly reports for prevailing wage projects. Pulls live Davis-Bacon wage rates. Submits directly to agencies.', pill: 'Davis-Bacon' },
  { icon: '🧠', title: 'Bid Intelligence', desc: 'AI scores every bid opportunity 0–100 based on your win history, market conditions, and margin targets. Stop chasing bad bids.', pill: 'Win rate AI' },
  { icon: '📦', title: 'Bid Package Manager', desc: 'Auto-create bid packages from takeoff data. Invite subs by CSI trade division. Track responses in one dashboard.', pill: 'CSI MasterFormat' },
  { icon: '🛡️', title: 'Insurance & Compliance', desc: 'ACORD 25 COI parser, expiry alerts, OSHA 300 log, and sub compliance dashboard. Never let a lapsed COI delay a project.', pill: 'OSHA + COI' },
];

const STATS = [
  { value: '4 hrs', label: 'saved per takeoff vs. manual' },
  { value: '$0', label: 'per seat — flat license' },
  { value: '50', label: 'states covered for lien waivers' },
  { value: '60s', label: 'to generate a pay application' },
];

const TESTIMONIALS = [
  { quote: "We used to spend half a day doing material takeoffs by hand. Now our estimator uploads the PDF and has numbers in a minute. It changed how we bid.", name: "Marcus T.", title: "Project Manager — General Contractor, Phoenix AZ" },
  { quote: "The lien waiver module alone is worth it. We do 30–40 waivers a month across multiple projects. This cut our admin time by 80%.", name: "Jennifer R.", title: "Operations Director — Specialty Subcontractor, Las Vegas NV" },
  { quote: "We compared this to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost, and the AI features are actually useful.", name: "David K.", title: "Owner — Mid-Size GC, Denver CO" },
];

// ── Interactive Product Tour Steps ────────────────────────────────────────────
const DEMO_STEPS = [
  {
    step: 1,
    label: 'Upload Blueprint',
    icon: '📐',
    tagline: 'Drop any PDF — floor plan, structural, MEP',
    screen: 'upload',
  },
  {
    step: 2,
    label: 'AI Reads Everything',
    icon: '🤖',
    tagline: 'Claude analyzes every dimension & spec in real time',
    screen: 'processing',
  },
  {
    step: 3,
    label: 'Instant Material Takeoff',
    icon: '📊',
    tagline: 'Full CSI-organized material list with quantities & costs',
    screen: 'takeoff',
  },
  {
    step: 4,
    label: 'Bid Package + Sub Invites',
    icon: '📦',
    tagline: 'Auto-create packages by trade, invite subs instantly',
    screen: 'bidpackage',
  },
  {
    step: 5,
    label: 'Generate G702 Pay App',
    icon: '💰',
    tagline: 'AIA G702/G703 filled and ready to submit to owner',
    screen: 'payapp',
  },
];

const TAKEOFF_MATERIALS = [
  { csi: '03 30 00', desc: 'Cast-in-Place Concrete', qty: '14,200', unit: 'CY', unit_cost: '$142', total: '$2,016,400' },
  { csi: '03 20 00', desc: 'Concrete Reinforcing', qty: '48,600', unit: 'LB', unit_cost: '$0.82', total: '$39,852' },
  { csi: '04 20 00', desc: 'Concrete Masonry — CMU', qty: '8,400', unit: 'SF', unit_cost: '$18', total: '$151,200' },
  { csi: '05 12 00', desc: 'Structural Steel Framing', qty: '112,000', unit: 'LB', unit_cost: '$1.65', total: '$184,800' },
  { csi: '07 50 00', desc: 'Membrane Roofing — TPO', qty: '24,000', unit: 'SF', unit_cost: '$8.50', total: '$204,000' },
];

const BID_PACKAGES_DEMO = [
  { code: 'BP-01', name: 'Concrete & Foundation', trade: 'Concrete', subs: 3, status: 'invited' },
  { code: 'BP-02', name: 'Structural Steel', trade: 'Steel', subs: 4, status: 'invited' },
  { code: 'BP-03', name: 'Mechanical HVAC', trade: 'HVAC', subs: 3, status: 'invited' },
  { code: 'BP-04', name: 'Electrical', trade: 'Electrical', subs: 5, status: 'invited' },
  { code: 'BP-05', name: 'Roofing — TPO System', trade: 'Roofing', subs: 3, status: 'invited' },
  { code: 'BP-06', name: 'Plumbing Rough-In', trade: 'Plumbing', subs: 2, status: 'invited' },
];

// ── Demo Screen Components ────────────────────────────────────────────────────

function UploadScreen({ active }: { active: boolean }) {
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => {
    if (!active) { setDragging(false); setUploaded(false); return; }
    const t1 = setTimeout(() => setDragging(true), 600);
    const t2 = setTimeout(() => { setDragging(false); setUploaded(true); }, 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>AI Blueprint Takeoff — New Project</div>
      <div style={{ flex: 1, border: `2px dashed ${dragging ? GOLD : uploaded ? '#3dd68c' : BORDER}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: dragging ? 'rgba(212,160,23,.06)' : uploaded ? 'rgba(34,197,94,.06)' : 'rgba(255,255,255,.02)', transition: 'all .4s' }}>
        {!uploaded ? (
          <>
            <div style={{ fontSize: 40, transition: 'transform .3s', transform: dragging ? 'scale(1.2)' : 'scale(1)' }}>{dragging ? '📂' : '📄'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: dragging ? GOLD : TEXT }}>{dragging ? 'Drop to upload…' : 'Drop blueprint PDF here'}</div>
            <div style={{ fontSize: 12, color: DIM }}>or click to browse — PDF, DWG, TIF supported</div>
            <div style={{ padding: '8px 20px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 7, color: '#0d1117', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Choose File</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#3dd68c' }}>Blueprint uploaded!</div>
            <div style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>📄</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Riverdale_Medical_Pavilion_FloorPlan.pdf</div>
                <div style={{ fontSize: 11, color: DIM }}>24,200 SF · 48 pages · 8.4 MB</div>
              </div>
            </div>
          </>
        )}
      </div>
      {uploaded && (
        <div style={{ padding: '10px 16px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 8, textAlign: 'center', color: '#0d1117', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          Run AI Takeoff →
        </div>
      )}
    </div>
  );
}

function ProcessingScreen({ active }: { active: boolean }) {
  const LINES = [
    'Parsing PDF structure… 48 pages detected',
    'Identifying drawing types: Architectural, Structural, MEP',
    'Extracting dimensions from floor plan A1.01…',
    'Found scale: 1/8" = 1\'-0"',
    'Calculating room areas: 847 dimensions processed',
    'Reading structural drawings S1.01–S3.04…',
    'Concrete schedule: 14,200 CY total volume',
    'Rebar schedule: #5 @ 12" OC — 48,600 LB',
    'Detecting roof area from A3.01: 24,000 SF TPO',
    'CMU exterior walls: 8,400 SF @ 8" block',
    'Steel tonnage: W-shapes — 112,000 LB total',
    'Cross-referencing spec sections 03300, 04200, 05120…',
    'Generating CSI MasterFormat cost codes…',
    '✅ Takeoff complete — 5 major divisions, 47 line items',
  ];
  const [visibleLines, setVisibleLines] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) { setVisibleLines(0); setPct(0); return; }
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleLines(i);
      setPct(Math.round((i / LINES.length) * 100));
      if (i >= LINES.length) clearInterval(interval);
    }, 180);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>AI Analyzing Blueprint…</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 3, transition: 'width .15s' }} />
      </div>
      <div style={{ flex: 1, background: '#070d14', borderRadius: 8, border: `1px solid ${BORDER}`, padding: '12px 14px', overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8 }}>
        {LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} style={{ color: line.startsWith('✅') ? '#3dd68c' : line.startsWith('Found') || line.startsWith('Concrete') || line.startsWith('Rebar') || line.startsWith('Steel') ? GOLD : '#6b8aad' }}>
            {line.startsWith('✅') ? line : `> ${line}`}
          </div>
        ))}
        {visibleLines < LINES.length && <div style={{ color: GOLD, animation: 'none' }}>_</div>}
      </div>
    </div>
  );
}

function TakeoffScreen({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(0);
  const total = TAKEOFF_MATERIALS.reduce((s, m) => s + parseInt(m.total.replace(/\D/g, '')), 0);

  useEffect(() => {
    if (!active) { setVisible(0); return; }
    let i = 0;
    const t = setInterval(() => { i++; setVisible(i); if (i >= TAKEOFF_MATERIALS.length) clearInterval(t); }, 250);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Material Takeoff — Riverdale Medical Pavilion</div>
        <span style={{ fontSize: 10, background: 'rgba(212,160,23,.12)', color: GOLD, border: `1px solid rgba(212,160,23,.3)`, borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>47 LINE ITEMS</span>
      </div>
      <div style={{ flex: 1, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#0a1117' }}>
              {['CSI Code', 'Description', 'Qty', 'Unit', '$/Unit', 'Total'].map(h => (
                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TAKEOFF_MATERIALS.slice(0, visible).map((m, i) => (
              <tr key={i} style={{ borderBottom: `1px solid rgba(38,51,71,.4)`, opacity: 1, animation: 'none' }}>
                <td style={{ padding: '8px 10px', color: GOLD, fontFamily: 'monospace', fontWeight: 700 }}>{m.csi}</td>
                <td style={{ padding: '8px 10px', color: TEXT, fontWeight: 600 }}>{m.desc}</td>
                <td style={{ padding: '8px 10px', color: TEXT, textAlign: 'right' }}>{m.qty}</td>
                <td style={{ padding: '8px 10px', color: DIM }}>{m.unit}</td>
                <td style={{ padding: '8px 10px', color: DIM }}>{m.unit_cost}</td>
                <td style={{ padding: '8px 10px', color: '#3dd68c', fontWeight: 700, textAlign: 'right' }}>{m.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible >= TAKEOFF_MATERIALS.length && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: 'rgba(212,160,23,.06)', border: `1px solid rgba(212,160,23,.2)`, borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Showing 5 of 47 items</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>$2,596,252</div>
            <div style={{ fontSize: 10, color: DIM }}>Total estimated material cost</div>
          </div>
          <div style={{ flex: 1, padding: '10px 14px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0d1117' }}>Create Bid Packages</div>
              <div style={{ fontSize: 10, color: 'rgba(0,0,0,.6)' }}>Auto-split by CSI trade →</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BidPackageScreen({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(0);
  const [inviteSent, setInviteSent] = useState(false);

  useEffect(() => {
    if (!active) { setVisible(0); setInviteSent(false); return; }
    let i = 0;
    const t = setInterval(() => { i++; setVisible(i); if (i >= BID_PACKAGES_DEMO.length) { clearInterval(t); setTimeout(() => setInviteSent(true), 600); } }, 200);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Bid Packages — Auto-Created from Takeoff</div>
        {inviteSent && (
          <span style={{ fontSize: 10, background: 'rgba(34,197,94,.12)', color: '#3dd68c', border: '1px solid rgba(34,197,94,.3)', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>✓ 20 SUBS INVITED</span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {BID_PACKAGES_DEMO.slice(0, visible).map((bp, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: GOLD, fontWeight: 700, minWidth: 40 }}>{bp.code}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{bp.name}</div>
              <div style={{ fontSize: 10, color: DIM }}>{bp.trade} · {bp.subs} subs invited</div>
            </div>
            <span style={{ fontSize: 9, background: 'rgba(212,160,23,.12)', color: GOLD, border: `1px solid rgba(212,160,23,.25)`, borderRadius: 4, padding: '2px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {inviteSent ? '📧 INVITED' : 'DRAFT'}
            </span>
          </div>
        ))}
      </div>
      {inviteSent && (
        <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>📧</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3dd68c' }}>Bid invites sent to 20 subcontractors</div>
            <div style={{ fontSize: 11, color: DIM }}>Responses due by Dec 15 · Tracking in real time</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayAppScreen({ active }: { active: boolean }) {
  const [animPct, setAnimPct] = useState(0);
  const target = 428500;

  useEffect(() => {
    if (!active) { setAnimPct(0); return; }
    const start = Date.now();
    const dur = 1400;
    const raf = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      setAnimPct(Math.round(t * target));
      if (t < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [active]);

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>AIA G702 — Pay Application #2</div>
        <span style={{ fontSize: 10, background: 'rgba(74,157,232,.12)', color: '#4a9de8', border: '1px solid rgba(74,157,232,.3)', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>DRAFT</span>
      </div>

      <div style={{ background: '#0a1117', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {[['Project', 'Riverdale Medical Pavilion'],['Owner','Desert Health Partners LLC'],['Contractor','Copper State Developments'],['Period','Feb 1 – Feb 28, 2026']].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontSize: 9, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 11, color: TEXT, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['Contract Sum','$2,850,000'],['Net COs','+$45,000'],['Contract to Date','$2,895,000']].map(([l,v])=>(
            <div key={l}>
              <div style={{ fontSize: 9, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 12, color: TEXT, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Total Completed</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: GOLD }}>{fmt(animPct)}</div>
          <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, marginTop: 6 }}>
            <div style={{ height: '100%', width: `${(animPct / 2895000) * 100}%`, background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 2, transition: 'width .05s' }} />
          </div>
        </div>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Current Payment Due</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#3dd68c' }}>{fmt(Math.max(0, animPct * 0.9 - 128250))}</div>
          <div style={{ fontSize: 9, color: DIM, marginTop: 6 }}>After 10% retainage · Less prior payments</div>
        </div>
      </div>

      {animPct >= target - 100 && (
        <div style={{ padding: '10px 14px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 8, textAlign: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0d1117' }}>📧 Submit to Owner for Approval</div>
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,.6)', marginTop: 2 }}>Approval link emailed · PDF attached · One click</div>
        </div>
      )}
    </div>
  );
}

function DemoScreen({ step }: { step: typeof DEMO_STEPS[0]; active: boolean }) {
  const active = true; // always rendered when shown
  if (step.screen === 'upload') return <UploadScreen active={active} />;
  if (step.screen === 'processing') return <ProcessingScreen active={active} />;
  if (step.screen === 'takeoff') return <TakeoffScreen active={active} />;
  if (step.screen === 'bidpackage') return <BidPackageScreen active={active} />;
  if (step.screen === 'payapp') return <PayAppScreen active={active} />;
  return null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance demo steps every 4.5 seconds
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setActiveStep(s => (s + 1) % DEMO_STEPS.length);
    }, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, activeStep]);

  function goToStep(i: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setActiveStep(i);
    setPaused(false);
  }

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    setContactLoading(true);
    try {
      await fetch('/api/leads/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contactForm) });
      setContactSent(true);
    } catch { /* non-fatal */ }
    setContactLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 58, background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 48px', gap: 24, backdropFilter: 'blur(12px)' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.1em', background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
          </span>
        </a>
        <div style={{ display: 'flex', gap: 28 }} className="desktop-nav">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href} style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.65)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,1)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}>
              {l.label}
            </a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/login" className="desktop-nav" style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 400, textDecoration: 'none' }}>Log In</a>
          <a href="/signup" style={{ padding: '7px 18px', background: GOLD, border: 'none', borderRadius: 6, color: '#000', fontSize: 13, fontWeight: 600, letterSpacing: '0.03em', textDecoration: 'none', flexShrink: 0 }}>Free Trial</a>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="mobile-only"
            style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: 22, cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu">
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', top: 58, left: 0, right: 0, zIndex: 99, background: 'rgba(13,17,23,.99)', borderBottom: `1px solid ${BORDER}`, padding: '8px 0', backdropFilter: 'blur(12px)' }}>
          {[...NAV_LINKS, { label: 'Log In', href: '/login' }].map(l => (
            <a key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'block', padding: '14px 24px', fontSize: 15, fontWeight: 600, color: TEXT, textDecoration: 'none', borderBottom: `1px solid rgba(38,51,71,.5)` }}>
              {l.label}
            </a>
          ))}
          <div style={{ padding: 16 }}>
            <a href="/signup" style={{ display: 'block', textAlign: 'center', padding: '13px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 9, color: '#0d1117', fontWeight: 800, textDecoration: 'none' }}>
              Start Free Trial →
            </a>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-only { display: flex !important; }
          .hero-flex { flex-direction: column !important; }
          .hero-left { flex: 0 0 100% !important; max-width: 100% !important; text-align: center !important; }
          .hero-left h1 { text-align: center !important; font-size: clamp(28px, 8vw, 40px) !important; }
          .hero-left p { text-align: center !important; max-width: 100% !important; }
          .hero-left div[style*="flex-start"] { justify-content: center !important; }
          .hero-left p[style*="text-align: left"] { text-align: center !important; }
          .hero-right { flex: 0 0 100% !important; max-width: 100% !important; display: none !important; }
          .hero-section { padding: 48px 24px 40px !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .demo-layout { flex-direction: column !important; }
          .demo-steps-col { flex-direction: row !important; overflow-x: auto; min-width: unset !important; }
          .demo-screen { min-height: 320px !important; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .demo-screen-inner { animation: fadeInUp .35s ease; }
      `}</style>

      <div style={{ paddingTop: 58 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 48px 64px' }} className="hero-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 48 }} className="hero-flex">
            {/* Left column */}
            <div style={{ flex: '0 0 55%', maxWidth: '55%' }} className="hero-left">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.4)', borderRadius: 20, padding: '5px 12px', marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.12em', textTransform: 'uppercase' }}>AI-Powered Construction Management</span>
              </div>
              <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, margin: '0 0 16px', lineHeight: 1.1, letterSpacing: '-0.02em', textAlign: 'left' }}>
                The CRM Built<br />
                <span style={{ color: GOLD }}>for Construction</span>
              </h1>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', maxWidth: 480, margin: '0 0 28px', lineHeight: 1.6, textAlign: 'left' }}>
                AI Blueprint Takeoff, AIA Pay Applications, Lien Waivers, Certified Payroll, Bid Intelligence — everything a General Contractor needs to run profitable projects.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <a href="/signup" style={{ padding: '10px 24px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none', cursor: 'pointer' }}>
                  Start Free Trial — No Card Required
                </a>
                <a href="#demo" style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecoration: 'none' }}>
                  ▶ Watch How It Works
                </a>
              </div>
              <p style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', textAlign: 'left' }}>30-day free trial · No credit card · Cancel anytime</p>
            </div>

            {/* Right column — mock CRM UI */}
            <div style={{ flex: '0 0 45%', maxWidth: '45%' }} className="hero-right">
              <div style={{ background: '#111b27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                {/* Browser chrome */}
                <div style={{ background: '#0a1117', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />)}
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
                    saguarocontrol.net/app/projects/riverside-medical
                  </div>
                </div>
                {/* App content */}
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Project header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Riverside Medical Pavilion</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Active · Phoenix, AZ · $2.85M contract</div>
                    </div>
                    <span style={{ fontSize: 9, background: 'rgba(34,197,94,0.12)', color: '#3dd68c', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>ON TRACK</span>
                  </div>
                  {/* Progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                      <span>Contract completion</span><span style={{ color: GOLD }}>62%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: '62%', background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 2 }} />
                    </div>
                  </div>
                  {/* Mini stat row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {[['Pay App #4','$428,500','submitted'],['Lien Waivers','12 / 14','current'],['Open RFIs','3','pending']].map(([label, val, sub]) => (
                      <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{val}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                  {/* AI alert */}
                  <div style={{ background: 'rgba(212,160,23,0.07)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 6, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12 }}>🤖</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>Autopilot Alert</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>Southwest Electric COI expires in 8 days — renewal requested automatically.</div>
                    </div>
                  </div>
                  {/* Sub list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[['Southwest Electric','Electrical','$340K','✓ W9'],['Mesa Concrete Co.','Concrete','$620K','✓ COI'],['AZ Steel Erectors','Steel','$185K','⚠ COI']].map(([name, trade, amt, status]) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: TEXT }}>{name}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{trade} · {amt}</div>
                        </div>
                        <span style={{ fontSize: 9, color: status.startsWith('⚠') ? '#f59e0b' : '#3dd68c', fontWeight: 700 }}>{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats bar ─────────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 1100, margin: '0 auto', padding: '28px 48px', textAlign: 'center' }}>
            {STATS.map((s, i) => (
              <div key={s.label} style={{ borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', padding: '0 24px' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Interactive Product Demo ───────────────────────────────────── */}
        <section id="demo" style={{ padding: '56px 48px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Live Product Tour</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>From Blueprint to Paid — in One Platform</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 560, margin: '0 auto' }}>See the exact steps a GC takes from winning a bid to collecting final payment.</p>
          </div>

          <div className="demo-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

            {/* Step list (left) */}
            <div className="demo-steps-col" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220, flexShrink: 0 }}>
              {DEMO_STEPS.map((s, i) => {
                const isActive = i === activeStep;
                const isDone = i < activeStep;
                return (
                  <button key={i} onClick={() => goToStep(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${isActive ? GOLD : isDone ? 'rgba(34,197,94,.3)' : BORDER}`, background: isActive ? 'rgba(212,160,23,.08)' : isDone ? 'rgba(34,197,94,.04)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all .2s', flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: isActive ? GOLD : isDone ? '#3dd68c' : 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, fontWeight: 800, color: isActive || isDone ? '#0d1117' : DIM }}>
                      {isDone ? '✓' : s.step}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? TEXT : isDone ? '#3dd68c' : DIM, lineHeight: 1.3 }}>{s.icon} {s.label}</div>
                      {isActive && <div style={{ fontSize: 10, color: DIM, marginTop: 2, lineHeight: 1.4 }}>{s.tagline}</div>}
                    </div>
                  </button>
                );
              })}

              {/* Progress bar */}
              <div style={{ marginTop: 8, padding: '0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DIM, marginBottom: 5 }}>
                  <span>Step {activeStep + 1} of {DEMO_STEPS.length}</span>
                  <button onClick={() => setPaused(p => !p)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0 }}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${((activeStep + 1) / DEMO_STEPS.length) * 100}%`, background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 2, transition: 'width .4s' }} />
                </div>
              </div>

              <a href="/signup" style={{ marginTop: 12, padding: '11px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 9, color: '#0d1117', fontWeight: 800, fontSize: 13, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                Try It Free →
              </a>
            </div>

            {/* App screen (right) */}
            <div style={{ flex: 1, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.4)', minHeight: 400 }}>
              {/* Browser chrome */}
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,.2)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,.05)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: DIM, marginLeft: 4 }}>
                  saguarocontrol.net/app/projects/…/{DEMO_STEPS[activeStep].screen}
                </div>
                <span style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>🌵 SAGUARO</span>
              </div>
              {/* Screen content */}
              <div key={activeStep} className="demo-screen demo-screen-inner" style={{ minHeight: 380 }}>
                <DemoScreen step={DEMO_STEPS[activeStep]} active={true} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="features" style={{ padding: '56px 48px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Everything You Need</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>One platform. Every project document.</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 540, margin: '0 auto' }}>No more switching between 6 different tools. Saguaro handles the full construction document lifecycle.</p>
          </div>
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 22px', transition: 'border-color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,160,23,.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>{f.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 10, padding: '2px 8px', letterSpacing: '0.1em', marginBottom: 8 }}>{f.pill}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.01em', color: TEXT, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(31,44,62,.3)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 48px' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>Built by GCs, for GCs</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Real feedback from contractors who switched from legacy software</p>
            </div>
            <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 28, color: 'rgba(212,160,23,0.4)', marginBottom: 10 }}>❝</div>
                  <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 14 }}>{t.quote}</p>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{t.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ───────────────────────────────────────────────── */}
        <section style={{ padding: '56px 48px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px', lineHeight: 1.1 }}>
            Ready to run smarter projects?
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Start your 30-day free trial. No credit card required. Full access to every feature from day one.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" style={{ padding: '10px 24px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none' }}>
              Start Free Trial →
            </a>
            <button onClick={() => setContactModal(true)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer' }}>
              Talk to Sales
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            {['✅ 30 days free', '✅ Cancel anytime', '✅ No per-seat fees', '✅ Unlimited users'].map(t => (
              <span key={t} style={{ fontSize: 12, color: DIM }}>{t}</span>
            ))}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '40px 24px', background: 'rgba(13,17,23,.8)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32 }}>
            <div>
              <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 12 }}>
                <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4 }} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 1, background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
                  <span style={{ fontSize: 10, color: DIM, letterSpacing: .5, fontWeight: 600 }}>Control Systems</span>
                </span>
              </a>
              <p style={{ fontSize: 12, color: DIM, lineHeight: 1.6, margin: 0 }}>AI-powered construction management for general contractors.</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Product</div>
              {[['Features', '/#features'], ['How It Works', '/#demo'], ['Pricing', '/pricing'], ['Security', '/security'], ['Compare Procore', '/compare/procore']].map(([l, h]) => (
                <a key={h} href={h} style={{ display: 'block', fontSize: 13, color: DIM, textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>{l}</a>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Account</div>
              {[['Sign Up', '/signup'], ['Log In', '/login'], ['Forgot Password', '/forgot-password']].map(([l, h]) => (
                <a key={h} href={h} style={{ display: 'block', fontSize: 13, color: DIM, textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>{l}</a>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Legal</div>
              {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms'], ['Security', '/security']].map(([l, h]) => (
                <a key={h} href={h} style={{ display: 'block', fontSize: 13, color: DIM, textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>{l}</a>
              ))}
              <button onClick={() => setContactModal(true)} style={{ display: 'block', background: 'none', border: 'none', fontSize: 13, color: DIM, cursor: 'pointer', padding: 0, marginTop: 8, textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                onMouseLeave={e => (e.currentTarget.style.color = DIM)}>Contact Us</button>
            </div>
          </div>
          <div style={{ maxWidth: 1100, margin: '32px auto 0', paddingTop: 24, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#4a5f7a' }}>© {new Date().getFullYear()} Saguaro CRM. All rights reserved.</span>
            <span style={{ fontSize: 12, color: '#4a5f7a' }}>Built for General Contractors by construction professionals.</span>
          </div>
        </footer>
      </div>

      {/* ── Contact Modal ─────────────────────────────────────────────── */}
      {contactModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setContactModal(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>Talk to Sales</div>
              <button onClick={() => setContactModal(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }} aria-label="Close">×</button>
            </div>
            <div style={{ padding: 24 }}>
              {contactSent ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8 }}>Message sent!</div>
                  <div style={{ fontSize: 13, color: DIM }}>We'll be in touch within 1 business day.</div>
                  <button onClick={() => { setContactModal(false); setContactSent(false); }} style={{ marginTop: 20, padding: '10px 24px', background: GOLD, border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Done</button>
                </div>
              ) : (
                <form onSubmit={submitContact} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[['Name', 'name', 'text', 'Your name'], ['Work Email', 'email', 'email', 'you@company.com'], ['Company', 'company', 'text', 'Acme Construction LLC']].map(([label, key, type, placeholder]) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 6 }}>{label}</label>
                      <input type={type} placeholder={placeholder} value={(contactForm as Record<string, string>)[key]} required
                        onChange={e => setContactForm(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 6 }}>Message</label>
                    <textarea placeholder="Tell us about your team size and what you're looking to solve..." value={contactForm.message}
                      onChange={e => setContactForm(p => ({ ...p, message: e.target.value }))} rows={3} required
                      style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                  </div>
                  <button type="submit" disabled={contactLoading} style={{ padding: '12px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 9, color: '#0d1117', fontWeight: 800, fontSize: 14, cursor: contactLoading ? 'not-allowed' : 'pointer' }}>
                    {contactLoading ? 'Sending…' : 'Send Message →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
