'use client';
import React, { useState, useRef, useEffect } from 'react';

const GOLD='#F59E0B', DARK='#0d1117', RAISED='#0F172A', BORDER='#1E3A5F', DIM='#CBD5E1', TEXT='#F8FAFC', GREEN='#22c55e';

const NAV_LINKS = [
  { label: 'Features',  href: '/#features' },
  { label: 'Field App', href: '/field-app' },
  { label: 'Get the App', href: '/get-the-app' },
  { label: 'How It Works', href: '/#demo' },
  { label: 'Pricing',   href: '/pricing' },
  { label: 'Compare',   href: '/compare/procore' },
  { label: 'ROI Calculator', href: '/roi-calculator' },
  { label: 'Switch from Procore', href: '/switch-from-procore' },
];

const FEATURES: { icon: React.ReactNode; title: string; desc: string; pill: string }[] = [
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>, title: 'AI Blueprint Takeoff', desc: 'Upload any PDF blueprint. Sage reads every dimension, calculates all materials, and generates a full bid estimate in under 60 seconds.', pill: 'AI-powered' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, title: 'AIA Pay Applications', desc: 'Generate G702/G703 Continuation Sheets automatically. Submit to owners digitally with one click — no PDFs to fill by hand.', pill: 'G702 / G703' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={3} y={11} width={18} height={11} rx={2} ry={2}/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, title: 'Lien Waivers — All 50 States', desc: 'Conditional & unconditional, partial & final. AZ, CA, TX statutory language. Send, sign, and track — no paper, no fax.', pill: 'All 50 states' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, title: 'Autopilot', desc: "Automated RFI routing, change order alerts, insurance expiry reminders, and pay app follow-ups — while you're in the field.", pill: 'Fully automated' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/><polyline points="10 9 9 9 8 9"/></svg>, title: 'Certified Payroll WH-347', desc: 'DOL-compliant weekly reports for prevailing wage projects. Pulls live Davis-Bacon wage rates. Submits directly to agencies.', pill: 'Davis-Bacon' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={18} y1={20} x2={18} y2={10}/><line x1={12} y1={20} x2={12} y2={4}/><line x1={6} y1={20} x2={6} y2={14}/></svg>, title: 'Bid Intelligence', desc: 'AI scores every bid opportunity 0–100 based on your win history, market conditions, and margin targets. Stop chasing bad bids.', pill: 'Win rate AI' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>, title: 'Bid Package Manager', desc: 'Auto-create bid packages from takeoff data. Invite subs by CSI trade division. Track responses in one dashboard.', pill: 'CSI MasterFormat' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, title: 'Insurance & Compliance', desc: 'ACORD 25 COI parser, expiry alerts, OSHA 300 log, and sub compliance dashboard. Never let a lapsed COI delay a project.', pill: 'OSHA + COI' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>, title: 'Mobile Field App', desc: 'Give your crew a native-speed PWA — daily logs, photos, GPS clock-in, punch lists, RFIs, and inspections. Works offline. No App Store required.', pill: 'iOS · Android · No App Store' },
];

const STATS = [
  { value: '4 hrs', label: 'saved per takeoff vs. manual' },
  { value: '4.9★', label: 'average customer rating' },
  { value: '50', label: 'states covered for lien waivers' },
  { value: '60s', label: 'to generate a pay application' },
];

const TESTIMONIALS = [
  { quote: "We used to spend half a day doing material takeoffs by hand. Now our estimator uploads the PDF and has numbers in a minute. It completely changed how we bid.", name: "Marcus T.", title: "Project Manager — General Contractor, Phoenix AZ" },
  { quote: "The lien waiver module alone is worth the subscription. We do 30–40 waivers a month across multiple projects. This cut our admin time by 80%.", name: "Jennifer R.", title: "Operations Director — Specialty Subcontractor, Las Vegas NV" },
  { quote: "We compared this to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost, and the AI features are actually useful — not just a gimmick.", name: "David K.", title: "Owner — Mid-Size GC, Denver CO" },
  { quote: "The field app is a game changer. My crew clocks in with GPS, submits daily logs, and I can see everything in real time. And it works offline — that's huge on our job sites.", name: "Carlos M.", title: "Superintendent — Commercial GC, San Antonio TX" },
];

const SOCIAL_PROOF_TOASTS = [
  { name: "Marcus T.", city: "Phoenix, AZ", action: "just ran an AI takeoff", detail: "24,200 SF commercial — 47 items in 38s" },
  { name: "Jennifer R.", city: "Las Vegas, NV", action: "saved 3 hours", detail: "Generated 12 lien waivers automatically" },
  { name: "David K.", city: "Denver, CO", action: "switched from Procore", detail: "Saved $1,451/mo on day one" },
  { name: "Carlos M.", city: "San Antonio, TX", action: "clocked in his crew", detail: "18 workers — GPS verified in 30 seconds" },
  { name: "Rachel B.", city: "Austin, TX", action: "submitted a G702", detail: "Pay app generated + sent in 2 minutes" },
  { name: "Tom H.", city: "Scottsdale, AZ", action: "won a $2.8M bid", detail: "AI scoring flagged a 34% win probability boost" },
  { name: "Luis V.", city: "San Diego, CA", action: "started a free trial", detail: "Comparing vs. Procore + Buildertrend" },
  { name: "Sarah M.", city: "Dallas, TX", action: "ran certified payroll", detail: "WH-347 generated for 23 workers" },
];

// ── Workflow steps (for display only — real system at /sandbox) ───────────────
const WORKFLOW_STEPS: { step: number; icon: React.ReactNode; label: string; desc: string }[] = [
  { step: 1, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>, label: 'Upload Blueprint', desc: 'Drop any PDF — floor plan, structural, MEP. Sage reads every dimension automatically.' },
  { step: 2, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: 'AI Reads Everything', desc: 'Sage analyzes every dimension, spec, and schedule. Scale detected automatically.' },
  { step: 3, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1={18} y1={20} x2={18} y2={10}/><line x1={12} y1={20} x2={12} y2={4}/><line x1={6} y1={20} x2={6} y2={14}/></svg>, label: 'Instant Material Takeoff', desc: 'Full CSI-organized material list — 50–200 line items with quantities, waste factors & costs.' },
  { step: 4, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>, label: 'Bid Package + Sub Invites', desc: 'Auto-create packages by CSI trade division. Subs invited by email in one click.' },
  { step: 5, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, label: 'Generate G702 Pay App', desc: 'AIA G702/G703 filled from your SOV and ready to submit to owner digitally.' },
];

const TAKEOFF_MATERIALS = [
  { csi: '03 30 00', desc: 'Cast-in-Place Concrete', qty: '14,200', unit: 'CY', unit_cost: '$142', total: '$2,016,400' },
  { csi: '03 20 00', desc: 'Concrete Reinforcing', qty: '48,600', unit: 'LB', unit_cost: '$0.82', total: '$39,852' },
  { csi: '04 20 00', desc: 'Concrete Masonry — CMU', qty: '8,400', unit: 'SF', unit_cost: '$18', total: '$151,200' },
  { csi: '05 12 00', desc: 'Structural Steel Framing', qty: '112,000', unit: 'LB', unit_cost: '$1.65', total: '$184,800' },
  { csi: '07 50 00', desc: 'Membrane Roofing — TPO', qty: '24,000', unit: 'SF', unit_cost: '$8.50', total: '$204,000' },
];


// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portalsOpen, setPortalsOpen] = useState(false);
  const portalsRef = useRef<HTMLDivElement>(null);

  // Close portals dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (portalsRef.current && !portalsRef.current.contains(e.target as Node)) {
        setPortalsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  // Takeoff animation state
  const [visibleRows, setVisibleRows] = useState(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [animMsg, setAnimMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    function runAnim() {
      if (cancelled) return;
      setVisibleRows(0);
      setAnimProgress(0);
      setAnimDone(false);
      setAnimMsg('');
      const t = (ms: number, fn: () => void) => setTimeout(() => { if (!cancelled) fn(); }, ms);
      t(800,  () => { setAnimProgress(15); setAnimMsg('Reading dimensions...'); });
      t(1600, () => { setAnimProgress(35); setAnimMsg('Analyzing CSI divisions...'); });
      t(2400, () => { setAnimProgress(55); setAnimMsg('Calculating quantities...'); });
      t(3000, () => { setAnimProgress(70); setAnimMsg('Applying material costs...'); });
      t(3400, () => setVisibleRows(1));
      t(4000, () => setVisibleRows(2));
      t(4600, () => setVisibleRows(3));
      t(5200, () => setVisibleRows(4));
      t(5800, () => setVisibleRows(5));
      t(6400, () => { setAnimDone(true); setAnimProgress(100); setAnimMsg('Completed in 41s'); });
    }
    runAnim();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!animDone) return;
    const timer = setTimeout(() => {
      setVisibleRows(0);
      setAnimProgress(0);
      setAnimDone(false);
      setAnimMsg('');
      let cancelled = false;
      const t = (ms: number, fn: () => void) => setTimeout(() => { if (!cancelled) fn(); }, ms);
      t(800,  () => { setAnimProgress(15); setAnimMsg('Reading dimensions...'); });
      t(1600, () => { setAnimProgress(35); setAnimMsg('Analyzing CSI divisions...'); });
      t(2400, () => { setAnimProgress(55); setAnimMsg('Calculating quantities...'); });
      t(3000, () => { setAnimProgress(70); setAnimMsg('Applying material costs...'); });
      t(3400, () => setVisibleRows(1));
      t(4000, () => setVisibleRows(2));
      t(4600, () => setVisibleRows(3));
      t(5200, () => setVisibleRows(4));
      t(5800, () => setVisibleRows(5));
      t(6400, () => { setAnimDone(true); setAnimProgress(100); setAnimMsg('Completed in 41s'); });
    }, 5000);
    return () => clearTimeout(timer);
  }, [animDone]);

  // Social proof toast state
  const [toastIdx, setToastIdx] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastDismissed, setToastDismissed] = useState(false);

  useEffect(() => {
    if (toastDismissed) return;
    let cancelled = false;
    const initialTimer = setTimeout(() => {
      if (cancelled) return;
      setToastVisible(true);
      function cycle(idx: number) {
        const showTimer = setTimeout(() => {
          if (cancelled) return;
          setToastVisible(false);
          const nextTimer = setTimeout(() => {
            if (cancelled) return;
            const next = (idx + 1) % SOCIAL_PROOF_TOASTS.length;
            setToastIdx(next);
            setToastVisible(true);
            cycle(next);
          }, 1000);
          return nextTimer;
        }, 5000);
        return showTimer;
      }
      cycle(0);
    }, 8000);
    return () => { cancelled = true; clearTimeout(initialTimer); };
  }, [toastDismissed]);

  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
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

      {/* ── Announcement Bar ─────────────────────────────────────────────── */}
      {!announcementDismissed && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 101, height: 36, background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 48px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, textAlign: 'center' }}>
            🔥 Procore users: Switch in 1 day — Free migration included.{' '}
            <a href="/roi-calculator" style={{ color: '#F59E0B', fontWeight: 700, textDecoration: 'underline' }}>Calculate your savings →</a>
          </span>
          <button onClick={() => setAnnouncementDismissed(true)} style={{ position: 'absolute', right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 8px' }} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: announcementDismissed ? 0 : 36, left: 0, right: 0, zIndex: 100, height: 64, background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 48px', gap: 24, backdropFilter: 'blur(12px)' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 48, width: 'auto', objectFit: 'contain', flexShrink: 0, mixBlendMode: 'screen' as const }} />
        </a>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }} className="desktop-nav">
          {NAV_LINKS.map(l => l.label === 'Field App' ? (
            /* Field App — green learn pill */
            <a key={l.href} href={l.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, letterSpacing: '0.03em', color: GREEN, textDecoration: 'none', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.35)', borderRadius: 20, padding: '3px 11px 3px 8px', transition: 'background 0.2s, border-color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,.2)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,197,94,.6)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,197,94,.35)'; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>
              {l.label}
            </a>
          ) : l.label === 'Get the App' ? (
            /* Get the App — amber action button */
            <a key={l.href} href={l.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', color: '#000', textDecoration: 'none', background: 'linear-gradient(135deg,#F59E0B,#D97706)', borderRadius: 8, padding: '6px 14px', boxShadow: '0 2px 12px rgba(245,158,11,.35)', transition: 'box-shadow 0.2s, transform 0.15s', flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(245,158,11,.55)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(245,158,11,.35)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
              Get the App
            </a>
          ) : (
            <a key={l.href} href={l.href} style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.88)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F59E0B')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.88)')}>
              {l.label}
            </a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Portals dropdown */}
          <div ref={portalsRef} className="desktop-nav" style={{ position: 'relative' }}>
            <button
              onClick={() => setPortalsOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', border: `1px solid ${portalsOpen ? GOLD : 'rgba(255,255,255,0.15)'}`, borderRadius: 6, color: portalsOpen ? GOLD : 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
              onMouseLeave={e => { if (!portalsOpen) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; } }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x={3} y={3} width={7} height={7}/><rect x={14} y={3} width={7} height={7}/><rect x={14} y={14} width={7} height={7}/><rect x={3} y={14} width={7} height={7}/></svg>
              Portals
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11} style={{ transform: portalsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>

            {portalsOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 242, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden', zIndex: 200 }}>
                <div style={{ padding: '6px 16px 10px', fontSize: 10, fontWeight: 700, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}`, paddingTop: 12 }}>Portal Access</div>
                <a href="/portals/client/login" onClick={() => setPortalsOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', textDecoration: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,160,23,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Client Portal</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>Project updates &amp; approvals</div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} style={{ marginLeft: 'auto' }}><polyline points="9 18 15 12 9 6"/></svg>
                </a>
                <a href="/portals/sub/login" onClick={() => setPortalsOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', textDecoration: 'none', transition: 'background 0.15s', borderTop: `1px solid ${BORDER}` }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Subcontractor Portal</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>Bids, pay apps &amp; compliance</div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} style={{ marginLeft: 'auto' }}><polyline points="9 18 15 12 9 6"/></svg>
                </a>
                <div style={{ padding: '10px 16px 12px', borderTop: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: 11, color: DIM, lineHeight: 1.5 }}>Enter your email to find your access link.</div>
                </div>
              </div>
            )}
          </div>

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
        <div style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99, background: 'rgba(13,17,23,.99)', borderBottom: `1px solid ${BORDER}`, padding: '8px 0', backdropFilter: 'blur(12px)' }}>
          {[...NAV_LINKS, { label: 'Log In', href: '/login' }].map(l => l.label === 'Get the App' ? (
            /* Get the App — full-width amber button row in mobile menu */
            <a key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '8px 16px', padding: '14px 24px', fontSize: 15, fontWeight: 900, color: '#000', textDecoration: 'none', borderBottom: 'none', background: 'linear-gradient(135deg,#F59E0B,#D97706)', borderRadius: 10, boxShadow: '0 4px 20px rgba(245,158,11,.4)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
              Get the App — Free
            </a>
          ) : (
            <a key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: l.label === 'Field App' ? 8 : 0, padding: '14px 24px', fontSize: 15, fontWeight: 600, color: l.label === 'Field App' ? GREEN : TEXT, textDecoration: 'none', borderBottom: `1px solid rgba(38,51,71,.5)` }}>
              {l.label === 'Field App' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>
              )}
              {l.label}
              {l.label === 'Field App' && (
                <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 800, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '1px 7px', color: GREEN, letterSpacing: 0.3 }}>FREE</span>
              )}
            </a>
          ))}
          <div style={{ padding: '8px 0', borderBottom: `1px solid rgba(38,51,71,.5)` }}>
            <div style={{ padding: '8px 24px 6px', fontSize: 10, fontWeight: 700, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Portals</div>
            <a href="/portals/client/login" onClick={() => setMobileMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, color: TEXT, textDecoration: 'none' }}>
              <span style={{ fontSize: 16 }}>🏠</span> Client Portal
            </a>
            <a href="/portals/sub/login" onClick={() => setMobileMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, color: TEXT, textDecoration: 'none' }}>
              <span style={{ fontSize: 16 }}>👷</span> Subcontractor Portal
            </a>
          </div>
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
          .hero-left h1 { text-align: center !important; font-size: clamp(32px, 9vw, 48px) !important; }
          .hero-left p { text-align: center !important; max-width: 100% !important; }
          .hero-cta-row { justify-content: center !important; }
          .hero-trust { justify-content: center !important; }
          .hero-right { flex: 0 0 100% !important; max-width: 100% !important; display: none !important; }
          .hero-section > div > div { padding: 24px 20px 40px !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .demo-layout { flex-direction: column !important; }
          .demo-steps-col { flex-direction: row !important; overflow-x: auto; min-width: unset !important; }
          .demo-screen { min-height: 320px !important; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .hero-animate { animation: fadeInUp .6s ease both; }
        .hero-animate-delay { animation: fadeInUp .6s ease .15s both; }
        .hero-animate-panel { animation: fadeInUp .7s ease .1s both; }
        .demo-screen-inner { animation: fadeInUp .35s ease; }
        .cta-primary:hover { opacity: 0.9; transform: translateY(-1px); transition: all .15s ease; }
        .cta-secondary:hover { border-color: rgba(255,255,255,0.4) !important; color: #fff !important; transition: all .15s ease; }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How long does AI blueprint takeoff take?",
            "acceptedAnswer": { "@type": "Answer", "text": "Saguaro's AI completes a full material takeoff in 41 seconds on average for commercial projects. A manual takeoff typically takes 4–8 hours." }
          },
          {
            "@type": "Question",
            "name": "How does Saguaro compare to Procore?",
            "acceptedAnswer": { "@type": "Answer", "text": "Saguaro starts at $199/month flat rate for your whole team, vs Procore's $1,850+/month per-seat pricing. Saguaro also includes AI blueprint takeoff, lien waivers in all 50 states, and certified payroll WH-347 — features Procore doesn't offer or charges extra for." }
          },
          {
            "@type": "Question",
            "name": "Do I need the App Store to use the mobile field app?",
            "acceptedAnswer": { "@type": "Answer", "text": "No. Saguaro Field is a PWA (Progressive Web App) that installs directly from your browser in 30 seconds. No App Store, no IT approval, no device management required." }
          },
          {
            "@type": "Question",
            "name": "What is Saguaro's pricing?",
            "acceptedAnswer": { "@type": "Answer", "text": "Saguaro offers Starter at $299/month, Professional at $599/month, and Enterprise at custom pricing. All plans include your whole team at a flat rate — no per-seat fees. Month-to-month, cancel anytime." }
          },
          {
            "@type": "Question",
            "name": "Does Saguaro generate WH-347 certified payroll?",
            "acceptedAnswer": { "@type": "Answer", "text": "Yes. Saguaro automatically generates DOL-compliant WH-347 certified payroll reports with live Davis-Bacon wage rates for prevailing wage projects. Procore does not include this feature." }
          },
          {
            "@type": "Question",
            "name": "Can I switch from Procore to Saguaro?",
            "acceptedAnswer": { "@type": "Answer", "text": "Yes. Saguaro offers free data migration from Procore. Our team handles the export and import, and most customers go live within 1 business day — vs Procore's typical 4–6 month implementation." }
          }
        ]
      })}} />

      <div style={{ paddingTop: announcementDismissed ? 64 : 100 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{ position: 'relative', overflow: 'hidden' }} className="hero-section">

          {/* Atmospheric background */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 70% at 10% 50%, rgba(245,158,11,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 90% 20%, rgba(37,99,235,0.14) 0%, transparent 55%), radial-gradient(ellipse 50% 50% at 50% 100%, rgba(245,158,11,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
          {/* Grid texture */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)', backgroundSize: '64px 64px', pointerEvents: 'none', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)' }} />

          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '28px 48px 52px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 56 }} className="hero-flex">

              {/* ── Left column ── */}
              <div style={{ flex: '0 0 52%', maxWidth: '52%' }} className="hero-left">

                {/* Badge */}
                <div className="hero-animate" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 24, padding: '5px 14px 5px 8px', marginBottom: 16 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(212,160,23,0.2)', fontSize: 10 }}>✦</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI-Powered Construction CRM</span>
                </div>

                {/* Headline */}
                <h1 className="hero-animate" style={{ fontSize: 'clamp(36px, 3.8vw, 56px)', fontWeight: 900, margin: '0 0 14px', lineHeight: 1.06, letterSpacing: '-0.03em', textAlign: 'left' }}>
                  The Smarter CRM<br />
                  <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #F5D060 50%, #C8960F 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Built for General Contractors</span>
                </h1>

                {/* Subheadline */}
                <p className="hero-animate-delay" style={{ fontSize: 17, color: 'rgba(255,255,255,0.85)', maxWidth: 480, margin: '0 0 16px', lineHeight: 1.58, textAlign: 'left' }}>
                  Upload any blueprint PDF. Sage AI reads every dimension, calculates all materials, and generates a full bid estimate in 41 seconds. No manual measuring. No spreadsheets. No Procore.
                </p>

                {/* Field app mini-callout */}
                <div className="hero-animate-delay" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '9px 14px', marginBottom: 20, maxWidth: 420 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREEN, flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>Saguaro Field — Mobile App Included Free</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 }}>GPS clock-in · Daily logs · Offline · No App Store · AI assistant</div>
                  </div>
                </div>

                {/* CTA row */}
                <div className="hero-cta-row hero-animate-delay" style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
                  <a href="/sandbox" className="cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 38px', background: `linear-gradient(135deg,#F59E0B,#EF4444)`, border: 'none', borderRadius: 8, color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: '0.02em', textDecoration: 'none', boxShadow: `0 8px 40px rgba(245,158,11,0.55), 0 2px 8px rgba(0,0,0,0.4)` }}>
                    ⚡ Try AI Takeoff Free →
                  </a>
                  <a href="/signup" className="cta-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 22px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                    Start Free Trial
                  </a>
                </div>

                {/* Trust row */}
                <div className="hero-trust hero-animate-delay" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                  {[
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><polyline points="20 6 9 17 4 12"/></svg>, label: '30-day free trial' },
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><polyline points="20 6 9 17 4 12"/></svg>, label: 'No credit card' },
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: 'SSL Secured' },
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><polyline points="20 6 9 17 4 12"/></svg>, label: 'Cancel anytime' },
                  ].map(t => (
                    <span key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                      <span style={{ color: GOLD, display: 'flex' }}>{t.icon}</span>
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Right column — Product screenshot ── */}
              <div style={{ flex: '0 0 48%', maxWidth: '48%', position: 'relative' }} className="hero-right">
                {/* Glow behind panel */}
                <div style={{ position: 'absolute', inset: -24, background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(212,160,23,0.12) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(20px)' }} />

                <div className="hero-animate-panel" style={{ position: 'relative', background: 'linear-gradient(160deg, #141e2e 0%, #0d1520 100%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,160,23,0.08), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                  {/* Browser chrome */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
                    </div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.28)', marginLeft: 6, fontFamily: 'monospace' }}>
                      saguarocontrol.net/app/takeoff
                    </div>
                  </div>

                  {/* Takeoff header */}
                  <div style={{ padding: '14px 16px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>AI Blueprint Takeoff</div>
                        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>Riverside Medical Pavilion · 48 pages · 24,200 SF</div>
                      </div>
                      {animDone
                        ? <span style={{ fontSize: 9, background: 'rgba(34,197,94,0.12)', color: '#3dd68c', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5, padding: '3px 8px', fontWeight: 700, letterSpacing: '0.05em' }}>✓ COMPLETE</span>
                        : <div style={{ borderRadius: '50%', border: '2px solid rgba(245,158,11,0.3)', borderTopColor: '#F59E0B', width: 10, height: 10, animation: 'spin 0.8s linear infinite' }} />
                      }
                    </div>
                    {/* AI bar */}
                    <div style={{ background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.18)', borderRadius: 7, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ color: GOLD, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
                        {animDone
                          ? <>Sage analyzed 847 dimensions · 5 CSI divisions · <span style={{ color: GOLD, fontWeight: 700 }}>Completed in 41s</span></>
                          : animMsg || <span style={{ color: 'rgba(255,255,255,0.35)' }}>Initializing...</span>
                        }
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${animProgress}%`, background: 'linear-gradient(90deg, #F59E0B, #F5D060)', borderRadius: 2, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  {/* Material table */}
                  <div style={{ padding: '0 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr 52px 36px 54px 62px', gap: '0 6px', padding: '6px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px 6px 0 0' }}>
                      {['CSI','Description','Qty','Unit','Unit $','Total'].map(h => (
                        <div key={h} style={{ fontSize: 8, fontWeight: 700, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: h === 'Total' || h === 'Unit $' || h === 'Qty' ? 'right' : 'left' }}>{h}</div>
                      ))}
                    </div>
                    {TAKEOFF_MATERIALS.map((row, i) => (
                      <div key={row.csi} style={{ display: 'grid', gridTemplateColumns: '68px 1fr 52px 36px 54px 62px', gap: '0 6px', padding: '6px 6px', background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.035)', opacity: visibleRows > i ? 1 : 0, transform: visibleRows > i ? 'none' : 'translateX(-8px)', transition: 'all 0.35s ease' }}>
                        <div style={{ fontSize: 9, color: GOLD, fontFamily: 'monospace', fontWeight: 700 }}>{row.csi}</div>
                        <div style={{ fontSize: 9, color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.desc}</div>
                        <div style={{ fontSize: 9, color: TEXT, textAlign: 'right' }}>{row.qty}</div>
                        <div style={{ fontSize: 9, color: DIM, textAlign: 'right' }}>{row.unit}</div>
                        <div style={{ fontSize: 9, color: DIM, textAlign: 'right' }}>{row.unit_cost}</div>
                        <div style={{ fontSize: 9, color: '#3dd68c', fontWeight: 700, textAlign: 'right' }}>{row.total}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '10px 16px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.15)', borderRadius: 7, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>Estimated Material Total</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: GOLD }}>$2,596,252</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                      <div style={{ padding: '8px 10px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#000' }}>
                        Export Bid Package →
                      </div>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 600, color: TEXT }}>
                        Generate G702 Pay App
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ── Live AI Demo teaser strip ─────────────────────────────────── */}
        <div style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.18)', borderTop: '1px solid rgba(245,158,11,0.18)' }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '16px 48px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 280 }}>
              {/* Lightning bolt icon */}
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="#F59E0B" width={16} height={16}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#F8FAFC' }}>Try the AI Takeoff — Live</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>Upload your own blueprint and see Sage analyze it in real time. Free. No credit card.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {['PDF blueprints', 'Image plans', 'CAD exports', 'Any page count'].map(tag => (
                <span key={tag} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(245,158,11,0.8)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 20, padding: '3px 10px' }}>{tag}</span>
              ))}
            </div>
            <a href="/sandbox" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: 'linear-gradient(135deg,#F59E0B,#D97706)', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 800, textDecoration: 'none', boxShadow: '0 4px 16px rgba(245,158,11,0.35)', flexShrink: 0 }}>
              Run Free Takeoff
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          </div>
        </div>

        {/* ── Social proof strip ───────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '14px 48px', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Trusted by General Contractors Nationwide</span>
            {[
              { v: '500+', l: 'GC teams onboarded' },
              { v: '$2B+', l: 'In contract value tracked' },
              { v: '50 states', l: 'Lien waiver coverage' },
              { v: '41s', l: 'Avg. AI takeoff time' },
            ].map((s, i) => (
              <React.Fragment key={s.l}>
                {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{s.v}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{s.l}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Company logos bar ───────────────────────────────────────── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.14em', whiteSpace: 'nowrap', flexShrink: 0 }}>Used by teams at</span>
              {[
                'Mesa Commercial Builders',
                'Apex Structural Group',
                'Ironworks GC',
                'Summit Specialty Contractors',
                'Vanguard Build',
                'Desert Ridge Construction',
              ].map(name => (
                <div key={name} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section style={{ padding: '72px 48px', background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1117 100%)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Zero learning curve</div>
              <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, color: TEXT, margin: '0 0 14px', letterSpacing: -0.5 }}>Up and running in under 5 minutes</h2>
              <p style={{ fontSize: 16, color: DIM, maxWidth: 520, margin: '0 auto', lineHeight: 1.65 }}>
                Saguaro is a web platform — nothing to download. Sign up, log in from any browser, and your whole team is live.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, background: 'rgba(30,58,95,0.3)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(30,58,95,0.5)' }}>
              {[
                { n: '01', icon: '📝', title: 'Sign Up Free', desc: 'Create your account in 30 seconds at saguarocontrol.net/signup. No credit card. 30-day trial starts instantly.' },
                { n: '02', icon: '🌐', title: 'Log In — No Download', desc: 'Open any browser, go to saguarocontrol.net/app, and log in. That\'s it. Works on PC, Mac, phone, and tablet.' },
                { n: '03', icon: '⚙️', title: 'Set Up in 5 Minutes', desc: 'Add your company, create a project, upload a blueprint. Sage AI does the heavy lifting from there.' },
                { n: '04', icon: '📱', title: 'Install on Any Phone', desc: 'Tap "Add to Home Screen" on your iPhone or Android. Your crew gets GPS clock-in, daily logs, and RFIs — offline-capable.' },
              ].map((s, i) => (
                <div key={i} style={{ padding: '32px 28px', background: '#0a0f1a', borderRight: '1px solid rgba(30,58,95,0.4)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Step {s.n}</div>
                  <div style={{ fontSize: 28, marginBottom: 14 }}>{s.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: DIM, lineHeight: 1.65 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/signup" style={{ padding: '14px 36px', background: `linear-gradient(135deg, ${GOLD}, #D97706)`, borderRadius: 10, color: '#000', fontWeight: 900, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 20px rgba(245,158,11,0.3)' }}>
                Start Free Trial →
              </a>
              <a href="/how-to-get-started" style={{ padding: '14px 28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(30,58,95,0.8)', borderRadius: 10, color: DIM, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
                Full Setup Guide →
              </a>
            </div>
          </div>
        </section>

        {/* ── Stats bar ─────────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(245,158,11,0.25)', borderBottom: '1px solid rgba(245,158,11,0.25)', background: 'linear-gradient(180deg, rgba(245,158,11,0.07) 0%, rgba(245,158,11,0.03) 100%)' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 1100, margin: '0 auto', padding: '36px 48px', textAlign: 'center' }}>
            {STATS.map((s, i) => (
              <div key={s.label} style={{ borderRight: i < STATS.length - 1 ? '1px solid rgba(245,158,11,0.2)' : 'none', padding: '0 24px' }}>
                <div style={{ fontSize: 42, fontWeight: 900, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6, lineHeight: 1.4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Field Tools Competition Strip ──────────────────────────────── */}
        <div style={{ background: 'rgba(34,197,94,0.05)', borderTop: '1px solid rgba(34,197,94,0.12)', borderBottom: '1px solid rgba(34,197,94,0.12)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREEN, flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Procore charges $600+/mo for field tools. Buildertrend makes you pay per seat. Saguaro Field is <span style={{ color: GREEN }}>included free</span> with every plan.</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Works Offline', ok: true },
                  { label: 'No App Store', ok: true },
                  { label: 'GPS Clock-In', ok: true },
                  { label: 'AI Assistant', ok: true },
                  { label: 'Free with plan', ok: true },
                ].map(f => (
                  <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: GREEN, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '4px 10px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><polyline points="20 6 9 17 4 12"/></svg>
                    {f.label}
                  </span>
                ))}
              </div>
              <a href="/field-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: GREEN, borderRadius: 7, color: '#000', fontSize: 12, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                See Field App →
              </a>
            </div>
          </div>
        </div>

        {/* ── Mobile Field App Section ─────────────────────────────────── */}
        <section id="field-app" style={{ background: 'rgba(212,160,23,0.04)', borderTop: '1px solid rgba(212,160,23,0.15)', borderBottom: '1px solid rgba(212,160,23,0.15)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap' }}>

            {/* Left: phone mockup */}
            <div style={{ flex: '0 0 320px', maxWidth: 320, margin: '0 auto', position: 'relative' }}>
              {/* Glow */}
              <div style={{ position: 'absolute', inset: -32, background: 'radial-gradient(ellipse 80% 60% at 50% 55%, rgba(212,160,23,0.15) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(18px)' }} />

              {/* Phone shell */}
              <div style={{ position: 'relative', background: 'linear-gradient(160deg, #141e2e 0%, #0d1520 100%)', border: '2px solid rgba(255,255,255,0.12)', borderRadius: 36, padding: '12px 8px', boxShadow: '0 40px 100px rgba(0,0,0,.7), 0 0 0 1px rgba(212,160,23,0.08)' }}>
                {/* Notch */}
                <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 10px' }} />

                {/* Screen content — Field home */}
                <div style={{ background: '#09111A', borderRadius: 24, overflow: 'hidden', padding: '14px 12px' }}>
                  {/* Header bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(212,160,23,0.2)', border: '1px solid rgba(212,160,23,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontWeight: 900, fontSize: 8, letterSpacing: '-0.5px' }}>SG</div>
                      <div>
                        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1, color: GOLD }}>SAGUARO</div>
                        <div style={{ fontSize: 6, color: DIM, letterSpacing: 0.5 }}>FIELD</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 7, color: GREEN, fontWeight: 700 }}>● Online</div>
                  </div>

                  {/* Action grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {([
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, label: 'Daily Log', color: '#3B82F6', rgb: '59,130,246' },
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx={12} cy={13} r={4}/></svg>, label: 'Photos', color: GOLD, rgb: '212,160,23' },
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Clock In', color: GREEN, rgb: '34,197,94' },
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>, label: 'Punch List', color: '#8B5CF6', rgb: '139,92,246' },
                    ] as { icon: React.ReactNode; label: string; color: string; rgb: string }[]).map(a => (
                      <div key={a.label} style={{ background: `rgba(${a.rgb},.08)`, border: `1px solid rgba(${a.rgb},.2)`, borderRadius: 10, padding: '8px 6px', textAlign: 'center' as const }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2, color: a.color }}>{a.icon}</div>
                        <div style={{ fontSize: 7, fontWeight: 700, color: TEXT }}>{a.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Open RFIs mini card */}
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 8px', marginBottom: 6 }}>
                    <div style={{ fontSize: 7, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 }}>Open RFIs</div>
                    {['Footing depth clarification', 'MEP coordination — Level 2'].map(r => (
                      <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
                        <div style={{ fontSize: 7, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r}</div>
                      </div>
                    ))}
                  </div>

                  {/* GPS clock bar */}
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: GREEN, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx={12} cy={10} r={3}/></svg></span>
                    <div style={{ fontSize: 7, color: GREEN, fontWeight: 700 }}>Clocked in · 7:02 AM · GPS verified</div>
                  </div>
                </div>

                {/* Home bar */}
                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '10px auto 0' }} />
              </div>
            </div>

            {/* Right: copy */}
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.35)', borderRadius: 24, padding: '5px 14px 5px 8px', marginBottom: 20 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(212,160,23,0.2)', color: GOLD }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg></span>
                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Mobile Field App</span>
              </div>

              <h2 style={{ fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.08 }}>
                Your crew's office<br />
                <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #F5D060 50%, #C8960F 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>is their phone</span>
              </h2>

              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', margin: '0 0 28px', lineHeight: 1.65, maxWidth: 460 }}>
                Saguaro Field gives your crew everything they need in the field — daily logs, photos, GPS clock-in, punch lists, RFIs, and safety inspections. Works offline on any device. No App Store. No extra license fees.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 32 }}>
                {([
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M1.05 12A11 11 0 0 1 23 12"/><path d="M5 12a7 7 0 0 1 14 0"/><path d="M9 12a3 3 0 0 1 6 0"/><line x1={12} y1={12} x2={12.01} y2={12}/></svg>, title: 'Works 100% Offline', desc: 'Log work, clock in, and submit photos with zero signal. Syncs automatically when you reconnect.' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx={12} cy={10} r={3}/></svg>, title: 'GPS Time Tracking', desc: 'Clock in with verified GPS coordinates. Foremen see the whole crew in real time.' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, title: 'AI Field Assistant', desc: 'Ask Sage anything about the project — plans, schedules, specs, contacts — while standing on the slab.' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>, title: 'No App Store Needed', desc: 'Install directly from your browser on iOS, Android, iPad, or Desktop. Nothing to download or update.' },
                ] as { icon: React.ReactNode; title: string; desc: string }[]).map(f => (
                  <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, flexShrink: 0 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="/get-the-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 28px', background: `linear-gradient(135deg,#F59E0B,#EF4444)`, borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: '0.02em', textDecoration: 'none', boxShadow: `0 6px 28px rgba(245,158,11,0.45)` }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
                  Get the App — Free →
                </a>
                <a href="/field-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'rgba(212,160,23,0.1)', border: `1px solid rgba(212,160,23,0.35)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>
                  See All Features
                </a>
                <a href="/field" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.72)', fontSize: 13, textDecoration: 'none' }}>
                  Open Field App
                </a>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                {['✓ iOS & Android', '✓ Works Offline', '✓ Free with any plan', '✓ No App Store'].map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>{t.slice(0,1)}</span>{t.slice(1)}
                  </span>
                ))}
              </div>
            </div>

          </div>

          {/* ── Field App vs Competition table ── */}
          <div style={{ marginTop: 56, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 48 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>How We Compare</div>
              <h3 style={{ fontSize: 'clamp(18px, 2.5vw, 26px)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Saguaro Field beats every field tool on the market</h3>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, maxWidth: 860, margin: '0 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: RAISED }}>
                {['Field Feature', 'Saguaro', 'Procore', 'Buildertrend'].map((h, i) => (
                  <div key={h} style={{ padding: '13px 16px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: i === 1 ? GOLD : DIM, borderRight: i < 3 ? `1px solid ${BORDER}` : 'none', textAlign: i > 0 ? 'center' as const : 'left' as const }}>{h}</div>
                ))}
              </div>
              {([
                { feature: 'Works 100% Offline', saguaro: true, procore: false, bt: false },
                { feature: 'No App Store Required', saguaro: true, procore: false, bt: false },
                { feature: 'GPS Clock-In / Verification', saguaro: true, procore: true, bt: false },
                { feature: 'AI Field Assistant (Sage)', saguaro: true, procore: false, bt: false },
                { feature: 'Daily Logs + Site Photos', saguaro: true, procore: true, bt: true },
                { feature: 'Punch List (mobile)', saguaro: true, procore: true, bt: false },
                { feature: 'RFI Submission from Field', saguaro: true, procore: true, bt: false },
                { feature: 'Included in Base Plan', saguaro: true, procore: false, bt: false },
                { feature: 'No Per-Seat Fees', saguaro: true, procore: false, bt: false },
                { feature: 'Installs in 30 seconds', saguaro: true, procore: false, bt: false },
              ] as { feature: string; saguaro: boolean; procore: boolean; bt: boolean }[]).map((row, i) => (
                <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ padding: '11px 16px', fontSize: 13, color: TEXT, borderRight: `1px solid ${BORDER}` }}>{row.feature}</div>
                  {[row.saguaro, row.procore, row.bt].map((v, j) => (
                    <div key={j} style={{ padding: '11px 16px', textAlign: 'center' as const, borderRight: j < 2 ? `1px solid ${BORDER}` : 'none' }}>
                      {v
                        ? <span style={{ color: j === 0 ? GREEN : 'rgba(34,197,94,0.5)', fontSize: 15, fontWeight: 700 }}>✓</span>
                        : <span style={{ color: 'rgba(239,68,68,0.5)', fontSize: 15 }}>✕</span>
                      }
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <a href="/field-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 28px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                See Full Field App Features →
              </a>
            </div>
          </div>
          </div>
        </section>

        {/* ── How It Works / Try It Now ─────────────────────────────────── */}
        <section id="demo" style={{ padding: '56px 48px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>From Blueprint to Paid — in One Platform</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.78)', maxWidth: 560, margin: '0 auto 28px' }}>Upload any PDF blueprint. Sage reads every dimension, calculates all materials, and drives the entire project lifecycle.</p>
            <a href="/sandbox" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 36px', background: `linear-gradient(135deg,#F59E0B,#EF4444)`, borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: '0.04em', textDecoration: 'none', boxShadow: '0 6px 32px rgba(245,158,11,0.45)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>
              Try Free — Upload Your Blueprint
            </a>
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>5 free AI runs · No credit card · Results in under 60 seconds</div>
          </div>

          <div className="demo-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {WORKFLOW_STEPS.map((s) => (
              <div key={s.step} style={{ display: 'flex', gap: 14, padding: '18px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `rgba(212,160,23,0.12)`, border: `1px solid rgba(212,160,23,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, fontWeight: 800, color: GOLD }}>
                  {s.step}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: GOLD, display: 'flex' }}>{s.icon}</span>{s.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 36, background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 12, padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Ready to run your first AI takeoff?</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Create a free sandbox account — includes 5 AI blueprint runs on your actual blueprints.</div>
            </div>
            <a href="/sandbox" style={{ padding: '11px 28px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Start Free Sandbox →
            </a>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="features" style={{ padding: '72px 48px', background: 'linear-gradient(180deg, #0d1117 0%, #0a1628 50%, #0d1117 100%)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Everything You Need</div>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>One platform. Every project document.</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', maxWidth: 540, margin: '0 auto' }}>No more switching between 6 different tools. Saguaro handles the full construction document lifecycle.</p>
          </div>
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderLeft: '3px solid rgba(245,158,11,0.5)', borderRadius: 10, padding: '22px 22px', transition: 'all .2s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.7)'; e.currentTarget.style.background = 'rgba(245,158,11,0.06)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: GOLD, display: 'flex' }}>{f.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.4)', borderRadius: 10, padding: '2px 8px', letterSpacing: '0.1em' }}>{f.pill}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', color: TEXT, marginBottom: 7 }}>{f.title}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(30,58,95,0.8)', borderBottom: '1px solid rgba(30,58,95,0.8)', background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 48px' }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Built by GCs, for GCs</h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', margin: 0 }}>Real feedback from contractors who switched from legacy software</p>
            </div>
            <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(30,58,95,0.8)`, borderTop: `3px solid ${GOLD}`, borderRadius: 12, padding: '24px 22px', transition: 'transform .2s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                  {/* Stars */}
                  <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(s => (
                      <svg key={s} viewBox="0 0 24 24" fill={GOLD} stroke="none" width={14} height={14}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.65, marginBottom: 16 }}>{t.quote}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, rgba(245,158,11,0.3), rgba(245,158,11,0.1))`, border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: GOLD, flexShrink: 0 }}>
                      {t.name.split(' ').map((n: string) => n[0]).join('').slice(0,2)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{t.title}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ───────────────────────────────────────────────── */}
        <section style={{ padding: '80px 48px', textAlign: 'center', background: 'linear-gradient(180deg, #0d1117 0%, #0a1628 100%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,158,11,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 16px', lineHeight: 1.05 }}>
            Ready to run smarter projects?
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', margin: '0 0 32px', lineHeight: 1.65 }}>
            Start your 30-day free trial. No credit card required. Full access to every feature from day one.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" style={{ padding: '15px 36px', background: `linear-gradient(135deg,#F59E0B,#EF4444)`, border: 'none', borderRadius: 9, color: '#fff', fontSize: 15, fontWeight: 900, letterSpacing: '0.04em', textDecoration: 'none', boxShadow: '0 8px 40px rgba(245,158,11,0.5)' }}>
              Start Free Trial →
            </a>
            <button onClick={() => setContactModal(true)} style={{ padding: '15px 28px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 9, color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Talk to Sales
            </button>
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {['30 days free', 'Cancel anytime', 'No per-seat fees', 'Unlimited users'].map(t => (
              <span key={t} style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11} style={{ color: GOLD }}><polyline points="20 6 9 17 4 12"/></svg>{t}
              </span>
            ))}
          </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '40px 24px', background: 'rgba(13,17,23,.8)' }}>
          {/* App install callout strip */}
          <div style={{ maxWidth: 1100, margin: '0 auto 36px', background: 'linear-gradient(135deg, rgba(245,158,11,.1), rgba(239,68,68,.07))', border: '1px solid rgba(245,158,11,.22)', borderRadius: 14, padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Saguaro Field — Free Mobile App</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', marginTop: 2 }}>iPhone · Android · iPad · Mac · Windows · No App Store required</div>
              </div>
            </div>
            <a href="/get-the-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: 'linear-gradient(135deg,#F59E0B,#EF4444)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 900, textDecoration: 'none', boxShadow: '0 4px 16px rgba(245,158,11,.4)', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
              Get the App Free
            </a>
          </div>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32 }}>
            <div>
              <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 12 }}>
                <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 44, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' as const }} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 1, background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
                  <span style={{ fontSize: 10, color: DIM, letterSpacing: .5, fontWeight: 600 }}>Control Systems</span>
                </span>
              </a>
              <p style={{ fontSize: 12, color: DIM, lineHeight: 1.6, margin: 0 }}>AI-powered construction management for general contractors.</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Product</div>
              {[['Features', '/#features'], ['Field App', '/field-app'], ['How It Works', '/#demo'], ['Pricing', '/pricing'], ['Security', '/security'], ['Compare Procore', '/compare/procore']].map(([l, h]) => (
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

      {/* ── Social Proof Toast ───────────────────────────────────────── */}
      {!toastDismissed && toastVisible && (
        <div style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 1000,
          background: '#0F172A', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 12, padding: '12px 14px', maxWidth: 300,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.1)',
          opacity: toastVisible ? 1 : 0,
          transform: toastVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'all 0.4s ease',
          display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
          {/* Green pulse dot */}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginTop: 5, boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#F8FAFC' }}>
              {SOCIAL_PROOF_TOASTS[toastIdx].name} · {SOCIAL_PROOF_TOASTS[toastIdx].city}
            </div>
            <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600, marginTop: 1 }}>
              {SOCIAL_PROOF_TOASTS[toastIdx].action}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              {SOCIAL_PROOF_TOASTS[toastIdx].detail}
            </div>
          </div>
          <button onClick={() => setToastDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
      )}

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
                  <div style={{ marginBottom: 12, color: GREEN, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={44} height={44}><polyline points="20 6 9 17 4 12"/></svg></div>
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
