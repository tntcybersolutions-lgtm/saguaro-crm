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
import SaguaroChatWidget from '../../components/SaguaroChatWidget';
import SubscriptionWall from '../../components/SubscriptionWall';
import ErrorBoundary from '../../components/ErrorBoundary';
import GlobalShortcuts from '../../components/GlobalShortcuts';
import ProjectSwitcher from '../../components/ProjectSwitcher';
import PageTransition from '../../components/PageTransition';
import ThemeToggle from '../../components/ThemeToggle';
import PresenceIndicator from '../../components/PresenceIndicator';
import WhiteLabelProvider from '../../components/WhiteLabelProvider';
import AppSidebar from '../../components/AppSidebar';
import AppTopBar from '../../components/AppTopBar';
import { colors, font, sidebar as sidebarTokens, z } from '../../lib/design-tokens';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

const QUICK_PROMPTS = [
  { label: 'Write bid intro letter', prompt: 'Write a professional bid cover letter for a commercial construction project. Make it persuasive and include our qualifications, approach, and value proposition.' },
  { label: 'G702 pay app walkthrough', prompt: 'Walk me through how to properly fill out an AIA G702/G703 Application for Payment. What are the most common mistakes that cause rejection?' },
  { label: 'Change order negotiation', prompt: 'How do I negotiate a change order with an owner who is pushing back on cost? Give me specific talking points and strategies.' },
  { label: 'Subcontractor default', prompt: 'One of my subcontractors is behind schedule and I think they may default. What are my options and what steps should I take immediately to protect myself?' },
  { label: 'Lien rights — Arizona', prompt: 'Explain Arizona mechanics lien rights for a general contractor. What are the deadlines, required notices, and steps to perfect a lien?' },
  { label: 'Win rate improvement', prompt: 'My company has been winning about 20% of bids. What are the most effective strategies to improve win rate in commercial construction?' },
  { label: 'Cash flow projection', prompt: 'Help me build a cash flow projection for a $3M commercial project. What are the key inputs, how do I model retainage, and what are the typical cash flow risk periods?' },
  { label: 'OSHA violation response', prompt: 'We just received an OSHA citation on one of our job sites. What are our options, timeline to respond, and how do we negotiate a reduction in penalties?' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  // Single init effect: refresh session, fetch user info + projects in parallel
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const refreshRes = await fetch('/api/auth/refresh');
        if (refreshRes.status === 401) {
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
          return;
        }
      } catch {}

      const [meRes, projRes] = await Promise.allSettled([
        fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
        fetch('/api/projects?limit=15&fields=id,name').then(r => r.ok ? r.json() : null),
      ]);

      if (cancelled) return;

      const me = meRes.status === 'fulfilled' ? meRes.value : null;
      if (me) {
        if (me.id) setSageUserId(me.id);
        if (me.name) {
          const parts = me.name.trim().split(/\s+/);
          const initials = parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : me.name.slice(0, 2).toUpperCase();
          setUserInitials(initials);
        } else if (me.email) {
          setUserInitials(me.email[0].toUpperCase());
        }
      }

      const proj = projRes.status === 'fulfilled' ? projRes.value : null;
      if (proj) {
        if (Array.isArray(proj.projects)) setSageProjects(proj.projects);
        else if (Array.isArray(proj)) setSageProjects(proj);
      }
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
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
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
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.text, fontFamily: font.family }}>

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
        .quick-prompt-btn:hover { background: rgba(212,160,23,.2) !important; border-color: rgba(212,160,23,.5) !important; }
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
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: z.sidebar - 1 }}
          />
          <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: z.sidebar }}>
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
      <div className="topbar-area" style={{ position: 'fixed', top: 0, left: sidebarWidth, right: 0, zIndex: z.topbar, transition: 'left .2s ease' }}>
        <AppTopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setMobileSidebarOpen(v => !v)}
          onOpenSage={() => setAiOpen(!aiOpen)}
          onOpenCommandPalette={() => window.dispatchEvent(new Event('open-command-palette'))}
          onLogout={handleLogout}
          userInitials={userInitials}
        />
      </div>

      {/* ── AI Expert Chat Panel ─────────────────────────────────────── */}
      {aiOpen && (
        <div
          data-ai-panel
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: z.modal,
            width: 'min(540px, calc(100vw - 24px))',
            height: 'min(680px, calc(100vh - 80px))',
            background: colors.white, border: `1px solid ${colors.border}`,
            borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,.15)',
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
              <button onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>×</button>
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
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Quick Actions</div>
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
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: msg.role === 'user' ? `linear-gradient(135deg,${colors.gold},#B85C2A)` : '#1a3a5c', color: msg.role === 'user' ? colors.dark : colors.gold }}>
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
                placeholder="Ask anything — bidding, contracts, lien, OSHA, finance..."
                style={{ flex: 1, background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 14px', color: colors.text, fontSize: 13, outline: 'none', transition: 'border-color .15s' }}
                onFocus={e => (e.target.style.borderColor = colors.gold)}
                onBlur={e => (e.target.style.borderColor = colors.border)}
                disabled={aiLoading}
              />
              <button
                onClick={() => sendAI()}
                disabled={aiLoading || !aiMsg.trim()}
                style={{ padding: '10px 18px', background: aiLoading || !aiMsg.trim() ? 'rgba(212,160,23,.3)' : colors.gold, border: 'none', borderRadius: 8, color: colors.dark, fontWeight: 800, cursor: aiLoading || !aiMsg.trim() ? 'not-allowed' : 'pointer', fontSize: 13, transition: 'background .15s', whiteSpace: 'nowrap' }}
              >
                {aiLoading ? '...' : 'Send'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 6 }}>Powered by Sage · Enter to send · Expert in construction law, finance & operations</div>
          </div>
        </div>
      )}

      {/* ── Global Keyboard Shortcuts ─────────────────────────────────── */}
      <GlobalShortcuts onProjectSwitch={() => setShowProjectSwitcher(true)} />

      {/* ── Project Switcher Modal ─────────────────────────────────────── */}
      <ProjectSwitcher open={showProjectSwitcher} onClose={() => setShowProjectSwitcher(false)} />

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main
        className="main-content-area"
        style={{
          marginLeft: sidebarWidth,
          paddingTop: sidebarTokens.headerHeight,
          minHeight: '100vh',
          transition: 'margin-left .2s ease',
        }}
      >
        <ErrorBoundary>
          <SubscriptionWall>
            <PageTransition>{children}</PageTransition>
          </SubscriptionWall>
        </ErrorBoundary>
      </main>

      {/* ── Sage CRM Chat Widget ──────────────────────────────────────── */}
      <SaguaroChatWidget variant="crm" userId={sageUserId} projectList={sageProjects} />

      {/* ── Command Palette ────────────────────────────────────────────── */}
      <CommandPalette onScoreBid={() => setShowScoreModal(true)} />

      {/* ── Bid Score Modal ────────────────────────────────────────────── */}
      {showScoreModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowScoreModal(false); }}
        >
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: colors.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ color: colors.gold }}><circle cx={12} cy={12} r={10}/><circle cx={12} cy={12} r={6}/><circle cx={12} cy={12} r={2}/></svg>
                  Score a Bid
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Navigate to the Bids tab to use the full AI scorer</div>
              </div>
              <button onClick={() => setShowScoreModal(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                The full bid scoring tool is available in the Bids section. Navigate to <strong style={{ color: colors.text }}>Bids → Score</strong> for detailed AI-powered bid analysis.
              </p>
              <a
                href="/app/bids?tab=score"
                style={{ display: 'block', marginTop: 16, padding: '10px', background: colors.gold, borderRadius: 8, color: colors.dark, fontWeight: 800, fontSize: 14, textAlign: 'center', textDecoration: 'none' }}
                onClick={() => setShowScoreModal(false)}
              >
                Open Bid Scorer →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
