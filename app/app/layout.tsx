'use client';
/**
 * App Shell Layout — Procore-style sidebar + top bar.
 * Renders persistent sidebar navigation, slim top bar with breadcrumbs,
 * and the main content area.
 */
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationBell from '../../components/NotificationBell';
import CommandPalette from '../../components/CommandPalette';
import HelpMode from '../../components/HelpMode';
import { StatusFlashStyles } from '../../components/ui/Status';
import HeaderMessages from '../../components/HeaderMessages';
import PoweredBy from '../../components/PoweredBy';
import PdfViewer from '../../components/PdfViewer';
import SaguaroChatWidget from '../../components/SaguaroChatWidget';
import SubscriptionWall from '../../components/SubscriptionWall';
import OfflineBar from '../../components/OfflineBar';
import { clearOfflineCopies } from '@/lib/offline/worker';
import ErrorBoundary from '../../components/ErrorBoundary';
import GlobalShortcuts from '../../components/GlobalShortcuts';
import ProjectSwitcher from '../../components/ProjectSwitcher';
import PageTransition from '../../components/PageTransition';
import ThemeToggle from '../../components/ThemeToggle';
import PresenceIndicator from '../../components/PresenceIndicator';
import WhiteLabelProvider from '../../components/WhiteLabelProvider';
import AppSidebar from '../../components/AppSidebar';
import AppTopBar from '../../components/AppTopBar';
import NextStepBar from '../../components/NextStepBar';
import HeaderProjectPicker from '../../components/HeaderProjectPicker';
import { HelpModeButton } from '../../components/HelpMode';
import { X, ArrowRight, House, Briefcase, FolderSimple, Clock, DotsThreeOutline, MagnifyingGlass, Bell, Star } from '@phosphor-icons/react';
import { colors, font, sidebar as sidebarTokens, z } from '../../lib/design-tokens';
import { ensureBrowserSession } from '../../lib/supabase-browser';
import TableLabels from '@/components/ui/TableLabels';
import MobileSelectSheet from '@/components/MobileSelectSheet';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

const QUICK_PROMPTS = [
  { label: 'Write Bid Intro Letter', prompt: 'Write a professional bid cover letter for a commercial construction project. Make it persuasive and include our qualifications, approach, and value proposition.' },
  { label: 'G702 Pay App Walkthrough', prompt: 'Walk me through how to properly fill out an AIA G702/G703 Application for Payment. What are the most common mistakes that cause rejection?' },
  { label: 'Change Order Negotiation', prompt: 'How do I negotiate a change order with an owner who is pushing back on cost? Give me specific talking points and strategies.' },
  { label: 'Subcontractor Default', prompt: 'One of my subcontractors is behind schedule and I think they may default. What are my options and what steps should I take immediately to protect myself?' },
  { label: 'Lien rights — Arizona', prompt: 'Explain Arizona mechanics lien rights for a general contractor. What are the deadlines, required notices, and steps to perfect a lien?' },
  { label: 'Win Rate Improvement', prompt: 'My company has been winning about 20% of bids. What are the most effective strategies to improve win rate in commercial construction?' },
  { label: 'Cash Flow Projection', prompt: 'Help me build a cash flow projection for a $3M commercial project. What are the key inputs, how do I model retainage, and what are the typical cash flow risk periods?' },
  { label: 'OSHA Violation Response', prompt: 'We just received an OSHA citation on one of our job sites. What are our options, timeline to respond, and how do we negotiate a reduction in penalties?' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // The phone menu closes with Escape too (keyboards on iPad, screen readers).
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileSidebarOpen]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [aiMessages, setAiMessages] = useState<ChatMsg[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userInitials, setUserInitials] = useState('?');
  const [sageUserId, setSageUserId] = useState<string | null>(null);
  const [sageProjects, setSageProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sidebarWidth = sidebarCollapsed ? sidebarTokens.widthCollapsed : sidebarTokens.width;

  // Persist sidebar state
  useEffect(() => {
    const saved = localStorage.getItem('saguaro-sidebar-collapsed');
    if (saved === 'true') setSidebarCollapsed(true);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed(v => {
      localStorage.setItem('saguaro-sidebar-collapsed', String(!v));
      return !v;
    });
  }

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  // iPhone app: tapping an alert opens the page it's about. No-op in a browser
  // (push-sw.js handles taps there).
  useEffect(() => {
    let off: (() => void) | undefined;
    import('@/lib/native').then(({ isNative, setupPushListeners }) => {
      if (!isNative()) return;
      off = setupPushListeners({
        onTap: (d) => {
          const url = typeof d?.url === 'string' ? d.url : typeof d?.route === 'string' ? d.route : '';
          if (url.startsWith('/')) window.location.assign(url);
        },
      });
    }).catch(() => { /* not in the app shell */ });
    return () => off?.();
  }, []);

  // Single init effect (W-9): refresh + me + projects all fire concurrently —
  // refresh only gates the 401 redirect, and a sessionStorage cache paints the
  // shell identity instantly on repeat hard loads.
  useEffect(() => {
    let cancelled = false;

    // Paint cached identity/projects immediately (revalidated below; the cache
    // is wiped by handleLogout's sessionStorage.clear()).
    try {
      const cached = sessionStorage.getItem('sag_shell_cache');
      if (cached) {
        const c = JSON.parse(cached);
        if (c.initials) setUserInitials(c.initials);
        if (c.userId) setSageUserId(c.userId);
        if (Array.isArray(c.projects)) setSageProjects(c.projects);
      }
    } catch { /* cache is best-effort */ }

    async function init() {
      const fetchJson = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);

      // Fire all three concurrently; refresh only gates the 401 redirect.
      const refreshP = fetch('/api/auth/refresh').catch(() => null);
      let [me, proj] = await Promise.all([
        fetchJson('/api/auth/me'),
        fetchJson('/api/projects?limit=15&fields=id,name'),
      ]);

      const refreshRes = await refreshP;
      if (refreshRes && refreshRes.status === 401) {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
        return;
      }

      // Hydrate the browser Supabase client from the freshly-refreshed server cookies so pages
      // that query Supabase directly from the browser (time clock, fleet, daily log, …) are authenticated.
      ensureBrowserSession();

      // If the concurrent calls raced an expired session, retry once post-refresh.
      if (!me) me = await fetchJson('/api/auth/me');
      if (!proj) proj = await fetchJson('/api/projects?limit=15&fields=id,name');

      if (cancelled) return;

      let initials = '';
      if (me) {
        if (me.id) setSageUserId(me.id);
        if (me.name) {
          const parts = me.name.trim().split(/\s+/);
          initials = parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : me.name.slice(0, 2).toUpperCase();
          setUserInitials(initials);
        } else if (me.email) {
          initials = me.email[0].toUpperCase();
          setUserInitials(initials);
        }
      }

      let projList: Array<{ id: string; name: string }> | null = null;
      if (proj) {
        if (Array.isArray(proj.projects)) projList = proj.projects;
        else if (Array.isArray(proj)) projList = proj;
      }
      if (projList) setSageProjects(projList);

      // Cache identity + project names for an instant paint on the next load.
      try {
        sessionStorage.setItem('sag_shell_cache', JSON.stringify({
          initials: initials || undefined,
          userId: me && me.id ? me.id : undefined,
          projects: projList ? projList.map(p => ({ id: p.id, name: p.name })) : undefined,
        }));
      } catch { /* best-effort */ }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll AI messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // Focus AI input when panel opens
  useEffect(() => {
    if (aiOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [aiOpen]);

  async function handleLogout() {
    // 0. Drop this person's offline copies of screens and data from the phone.
    clearOfflineCopies();
    // 1. Clear the server-side httpOnly session cookies.
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    // 2. CRITICAL: also destroy the browser Supabase session in localStorage.
    //    Without this, the persisted session silently logs you — or the next
    //    person on a shared device — right back into the app.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') || k.toLowerCase().includes('supabase')) {
          localStorage.removeItem(k);
        }
      }
      sessionStorage.clear();
    } catch { /* storage unavailable — ignore */ }
    // 3. Hard replace so no in-memory client state survives the redirect.
    window.location.replace('/login');
  }

  async function sendAI(overrideMsg?: string) {
    const text = (overrideMsg ?? aiMsg).trim();
    if (!text || aiLoading) return;
    setAiMsg('');

    const updatedMessages: ChatMsg[] = [...aiMessages, { role: 'user', content: text }];
    setAiMessages(updatedMessages);
    setAiLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = '';

      setAiMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5));
            if (evt.type === 'delta') {
              full += evt.text;
              setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);
            }
          } catch {}
        }
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }]);
    }
    setAiLoading(false);
  }

  return (
    <WhiteLabelProvider>
    <div className="sag-app" style={{ minHeight: '100vh', background: colors.dark, color: colors.text, fontFamily: font.family }}>
      <TableLabels />

      {/* ── Responsive + AI panel styles ──────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-overlay { display: block !important; }
          .mobile-hamburger-topbar { display: flex !important; }
          .main-content-area { margin-left: 0 !important; }
          .topbar-area { left: 0 !important; }
        }
        .ai-msg-content p { margin: 0 0 8px; }
        .ai-msg-content p:last-child { margin: 0; }
        .ai-msg-content ul, .ai-msg-content ol { margin: 4px 0 8px 18px; }
        .ai-msg-content li { margin-bottom: 3px; }
        .ai-msg-content strong { color: ${colors.text}; }
        .ai-msg-content code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
        .ai-msg-content h3 { color: ${colors.gold}; font-size: 13px; margin: 10px 0 4px; }
        .quick-prompt-btn:hover { background: rgba(255,230,0,.18) !important; border-color: rgba(255,230,0,.5) !important; }
      `}</style>

      {/* ── Sidebar (Desktop) ────────────────────────────────────────── */}
      <div className="sidebar-desktop">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          onLogout={handleLogout}
          userInitials={userInitials}
        />
      </div>

      {/* ── Sidebar (Mobile Overlay) ─────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div className="sidebar-mobile-overlay" style={{ display: 'none' }}>
          <div
            onClick={() => setMobileSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--bg-base) 60%, transparent)', zIndex: 150 /* above the sticky project bar (90), below modals (200) */ }}
          />
          <div role="dialog" aria-modal="true" aria-label="Menu" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 151, display: 'flex', flexDirection: 'column', maxWidth: '86vw', background: 'var(--bg-base)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            {/* The controls that leave the phone top bar live here: search,
                the job picker, help mode and notifications. */}
            <div className="sag-menu-tools" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 10px', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Menu</span>
                <button type="button" onClick={() => setMobileSidebarOpen(false)} aria-label="Close menu" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
              </div>
              <button
                type="button"
                onClick={() => { setMobileSidebarOpen(false); window.dispatchEvent(new Event('open-command-palette')); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                <MagnifyingGlass size={16} /> Search
              </button>
              <HeaderProjectPicker />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <HelpModeButton />
                <Link href="/app/notifications" onClick={() => setMobileSidebarOpen(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                  <Bell size={16} /> Notifications
                </Link>
                <button type="button" onClick={() => { setMobileSidebarOpen(false); setAiOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <Star size={16} weight="fill" /> Sage AI Expert
                </button>
              </div>
            </div>
            <AppSidebar
              collapsed={false}
              onToggle={() => setMobileSidebarOpen(false)}
              onLogout={handleLogout}
              userInitials={userInitials}
            />
          </div>
        </div>
      )}

      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      {/* AppTopBar renders its own position:fixed <header>, so it is OUT OF
          FLOW and every in-flow sibling below it would otherwise start at y=0,
          hidden behind it. Reserving the header's height here puts the strips
          where they belong. HeaderMessages had the same latent problem and was
          only ever invisible because it renders nothing when there is nothing
          to say. */}
      <div className="topbar-area" style={{ position: 'fixed', top: 0, left: sidebarWidth, right: 0, zIndex: z.topbar, transition: 'left .2s ease', paddingTop: `calc(${sidebarTokens.headerHeight}px + env(safe-area-inset-top, 0px))` }}>
        <AppTopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setMobileSidebarOpen(v => !v)}
          onOpenSage={() => setAiOpen(!aiOpen)}
          onOpenCommandPalette={() => window.dispatchEvent(new Event('open-command-palette'))}
          onLogout={handleLogout}
          userInitials={userInitials}
        />
        {/* Anything the GC must see lands here — one strip, same place, every
            screen. It sits inside the fixed header and publishes its height so
            the page moves down instead of being covered by it. */}
        <HeaderMessages />
        {/* "You are here. Do this next." One strip, same place, every screen,
            on both halves of the product. It does not hide itself once the
            steps are done — a guide that disappears the moment you are
            competent is one you cannot hand to a new hire. */}
        <NextStepBar />
      </div>

      {/* ── AI Expert Chat Panel ─────────────────────────────────────── */}
      {aiOpen && (
        <div
          data-ai-panel
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: z.modal,
            width: 'min(540px, calc(100vw - 24px))',
            height: 'min(680px, calc(100vh - 80px))',
            background: colors.raised, border: `1px solid ${colors.border}`,
            borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,.7)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ background: colors.dark, padding: '14px 18px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: colors.text, display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ color: colors.gold }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Sage AI Expert
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>Construction · Bidding · Contracts · Finance · Safety</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {aiMessages.length > 0 && (
                <button
                  onClick={() => setAiMessages([])}
                  style={{ background: 'none', border: `1px solid ${colors.border}`, color: colors.textMuted, cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 5, fontWeight: 600 }}
                >
                  Clear
                </button>
              )}
              <button onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px', display: 'inline-flex', alignItems: 'center' }}><X size={18} weight="regular" color={colors.textMuted} /></button>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {aiMessages.length === 0 ? (
              <div>
                <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
                  <div style={{ marginBottom: 8, color: colors.gold, display: 'flex', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: colors.text, marginBottom: 4 }}>Sage AI Expert</div>
                  <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>Expert in bidding, AIA contracts, lien law, finance,<br/>subcontractors, OSHA, estimating & more.</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, marginBottom: 8 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUICK_PROMPTS.map(q => (
                    <button
                      key={q.label}
                      className="quick-prompt-btn"
                      onClick={() => sendAI(q.prompt)}
                      style={{ textAlign: 'left', padding: '9px 12px', background: colors.goldDim, border: `1px solid ${colors.goldBorder}`, borderRadius: 8, color: colors.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              aiMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: msg.role === 'user' ? colors.gold : 'var(--bg-surface-2)', color: msg.role === 'user' ? 'var(--on-brand)' : colors.gold }}>
                    {msg.role === 'user' ? userInitials : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                  </div>
                  <div style={{ maxWidth: '82%', background: msg.role === 'user' ? colors.goldDim : colors.dark, border: `1px solid ${msg.role === 'user' ? colors.goldBorder : colors.border}`, borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px', padding: '10px 14px', fontSize: 13, lineHeight: 1.65, color: colors.text }}>
                    {msg.role === 'assistant' && msg.content === '' && aiLoading ? (
                      <span style={{ color: colors.gold }}>●●●</span>
                    ) : (
                      <div
                        className="ai-msg-content"
                        style={{ whiteSpace: 'pre-wrap' }}
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
                            .replace(/^- (.+)$/gm, '• $1')
                            .replace(/\n\n/g, '<br/><br/>')
                        }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${colors.border}`, flexShrink: 0, background: colors.dark }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={aiMsg}
                onChange={e => setAiMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAI()}
                placeholder="Ask anything — bidding, contracts, lien, OSHA, finance…"
                style={{ flex: 1, background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 14px', color: colors.text, fontSize: 13, outline: 'none', transition: 'border-color .15s' }}
                onFocus={e => (e.target.style.borderColor = colors.gold)}
                onBlur={e => (e.target.style.borderColor = colors.border)}
                disabled={aiLoading}
              />
              <button
                onClick={() => sendAI()}
                disabled={aiLoading || !aiMsg.trim()}
                style={{ padding: '10px 18px', background: aiLoading || !aiMsg.trim() ? 'var(--brand-primary-25)' : colors.gold, border: 'none', borderRadius: 8, color: 'var(--on-brand)', fontWeight: 800, cursor: aiLoading || !aiMsg.trim() ? 'not-allowed' : 'pointer', fontSize: 13, transition: 'background .15s', whiteSpace: 'nowrap' }}
              >
                {aiLoading ? '…' : 'Send'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 6 }}>Powered by Sage · Enter to send · Expert in construction law, finance & operations</div>
          </div>
        </div>
      )}

      {/* ── Global Keyboard Shortcuts ─────────────────────────────────── */}
      <GlobalShortcuts onProjectSwitch={() => setShowProjectSwitcher(true)} />

      {/* Offline / back-online status, on every screen */}
      <OfflineBar top={`calc(${sidebarTokens.headerHeight}px + env(safe-area-inset-top, 0px) + var(--sag-header-msg-h, 0px) + 8px)`} />

      {/* ── Project Switcher Modal ─────────────────────────────────────── */}
      <ProjectSwitcher open={showProjectSwitcher} onClose={() => setShowProjectSwitcher(false)} />

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main
        className="main-content-area"
        style={{
          marginLeft: sidebarWidth,
          paddingTop: `calc(${sidebarTokens.headerHeight}px + env(safe-area-inset-top, 0px) + var(--sag-header-msg-h, 0px) + var(--sag-nextstep-h, 0px))`,
          minHeight: '100vh',
          transition: 'margin-left .2s ease',
        }}
      >
        <ErrorBoundary>
          <SubscriptionWall>
            <PageTransition>{children}</PageTransition>
          {/* The one place the Saguaro name appears once a tenant has branded
              the platform — and switchable off from Settings → Branding. */}
          <PoweredBy />
          </SubscriptionWall>
        </ErrorBoundary>
      </main>

      {/* ── Phone tab bar: Home · My Work · Projects · Time · More ──────────
          Hidden on desktop by its own display:none; the phone-frame block in
          globals.css shows it under 768px and reserves its height as
          --sag-tabbar-h so content, the chat bubble and the Sage panel clear it. */}
      <nav className="sag-tabbar" aria-label="Primary" style={{ display: 'none', position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: z.topbar, height: 'var(--sag-tabbar-h, 56px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxSizing: 'border-box', background: 'var(--bg-solid)', borderTop: '1px solid var(--border-default)', backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)' }}>
        {([
          { label: 'Home', href: '/app', icon: House, active: pathname === '/app' || pathname === '/app/' },
          { label: 'My Work', href: '/app/my-work', icon: Briefcase, active: pathname.startsWith('/app/my-work') },
          { label: 'Projects', href: '/app/projects', icon: FolderSimple, active: pathname.startsWith('/app/projects') },
          { label: 'Time', href: '/app/time', icon: Clock, active: pathname.startsWith('/app/time') },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="sag-tab" data-active={t.active ? 'true' : undefined} aria-current={t.active ? 'page' : undefined} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56, textDecoration: 'none', color: t.active ? 'var(--brand-primary)' : 'var(--c-text-2)', fontSize: 11, fontWeight: t.active ? 800 : 600 }}>
              <Icon size={22} weight={t.active ? 'fill' : 'regular'} />
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button type="button" className="sag-tab" data-active={mobileSidebarOpen ? 'true' : undefined} onClick={() => setMobileSidebarOpen(v => !v)} aria-expanded={mobileSidebarOpen} aria-label="More" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56, background: 'none', border: 'none', color: mobileSidebarOpen ? 'var(--brand-primary)' : 'var(--c-text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          <DotsThreeOutline size={22} weight={mobileSidebarOpen ? 'fill' : 'regular'} />
          <span>More</span>
        </button>
      </nav>

      {/* ── Sage CRM Chat Widget ──────────────────────────────────────── */}
      <SaguaroChatWidget variant="crm" userId={sageUserId} projectList={sageProjects} />

      {/* ── Command Palette ────────────────────────────────────────────── */}
      <CommandPalette onScoreBid={() => setShowScoreModal(true)} />

      <StatusFlashStyles />

      {/* ── Help Mode ──────────────────────────────────────────────────── */}
      {/* Mounted once for the whole shell so a walkthrough survives navigation:
          the arrow has to keep its place when a step moves you to another page. */}
      <HelpMode />

      {/* Every document opens here instead of a browser tab — one reader for
          drawings, pay applications, jackets and waivers alike. */}
      <PdfViewer />

      {/* On a phone every drop-down opens as our sheet, not the white system
          list — one mount covers all 231 selects in the app. */}
      <MobileSelectSheet />

      {/* ── Bid Score Modal ────────────────────────────────────────────── */}
      {showScoreModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowScoreModal(false); }}
        >
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 30px 80px color-mix(in srgb, var(--bg-base) 60%, transparent)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: colors.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ color: colors.gold }}><circle cx={12} cy={12} r={10}/><circle cx={12} cy={12} r={6}/><circle cx={12} cy={12} r={2}/></svg>
                  Score a Bid
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Open the Bids tab to use the full AI scorer.</div>
              </div>
              <button onClick={() => setShowScoreModal(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4, display: 'inline-flex', alignItems: 'center' }}><X size={20} weight="regular" color={colors.textMuted} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                The full bid scoring tool is available in the Bids section. Navigate to <strong style={{ color: colors.text }}>Bids → Score</strong> for detailed AI-powered bid analysis.
              </p>
              <a
                href="/app/bids?tab=score"
                style={{ display: 'block', marginTop: 16, padding: '10px', background: colors.gold, borderRadius: 8, color: 'var(--on-brand)', fontWeight: 800, fontSize: 14, textAlign: 'center', textDecoration: 'none' }}
                onClick={() => setShowScoreModal(false)}
              >
                Open Bid Scorer <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><ArrowRight size={16} weight="regular" color="var(--on-brand)" /></span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
    </WhiteLabelProvider>
  );
}
