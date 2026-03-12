'use client';
/**
 * App Shell Layout — The main CRM application wrapper.
 * Renders the top navigation bar and provides the page content area.
 * Project-level sidebar is rendered in the project layout.
 */
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationBell from '../../components/NotificationBell';
import CommandPalette from '../../components/CommandPalette';

const GOLD   = '#D4A017';
const DARK   = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM    = '#8fa3c0';
const TEXT   = '#e8edf8';

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
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [aiMessages, setAiMessages] = useState<ChatMsg[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userInitials, setUserInitials] = useState('?');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch user info for avatar
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) return null;
        return r.json();
      })
      .then(d => {
        if (!d) return;
        if (d.name) {
          const parts = d.name.trim().split(/\s+/);
          const initials = parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : d.name.slice(0, 2).toUpperCase();
          setUserInitials(initials);
        } else if (d.email) {
          setUserInitials(d.email[0].toUpperCase());
        }
      })
      .catch(() => {});
  }, []);

  // Auto-refresh session token on mount
  useEffect(() => {
    fetch('/api/auth/refresh')
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // Focus input when panel opens
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

      // Add empty assistant placeholder
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
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Responsive styles ────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-hamburger { display: flex !important; }
          .desktop-nav-links { display: none !important; }
          .desktop-only { display: none !important; }
        }
        .ai-msg-content p { margin: 0 0 8px; }
        .ai-msg-content p:last-child { margin: 0; }
        .ai-msg-content ul, .ai-msg-content ol { margin: 4px 0 8px 18px; }
        .ai-msg-content li { margin-bottom: 3px; }
        .ai-msg-content strong { color: #e8edf8; }
        .ai-msg-content code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
        .ai-msg-content h3 { color: #D4A017; font-size: 13px; margin: 10px 0 4px; }
        .quick-prompt-btn:hover { background: rgba(212,160,23,.2) !important; border-color: rgba(212,160,23,.5) !important; }
      `}</style>

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 56, background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, backdropFilter: 'blur(12px)' }}>
        <Link href="/app" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 1, background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
            <span style={{ fontSize: 10, color: DIM, letterSpacing: .5, fontWeight: 600 }}>Control Systems</span>
          </span>
        </Link>

        {/* Nav links — hidden on mobile via .desktop-nav-links */}
        <div className="desktop-nav-links" style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {[
            { label: 'Projects',   href: '/app/projects' },
            { label: 'Bids',       href: '/app/bids' },
            { label: 'Documents',  href: '/app/documents' },
            { label: 'Autopilot',  href: '/app/autopilot' },
            { label: 'Reports',    href: '/app/reports' },
            { label: 'Intelligence', href: '/app/intelligence' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, color: pathname.startsWith(item.href) ? GOLD : DIM, background: pathname.startsWith(item.href) ? 'rgba(212,160,23,.1)' : 'transparent', textDecoration: 'none', transition: 'all .15s' }}>
              {item.label}
            </Link>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* ⌘K Command Palette hint — hidden on mobile */}
        <button
          onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          title="Open command palette (⌘K)"
          className="desktop-only"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, color: DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: .5 }}
        >
          <span style={{ fontFamily: 'system-ui, sans-serif' }}>⌘K</span>
        </button>

        <NotificationBell />

        {/* AI Assistant Button */}
        <button
          onClick={() => setAiOpen(!aiOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', background: aiOpen ? 'rgba(212,160,23,.25)' : 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .15s' }}
        >
          🤖 AI Expert
        </button>

        {/* Avatar + user menu */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setShowUserMenu(v => !v)}
            style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#B85C2A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0d1117', cursor: 'pointer' }}
          >
            {userInitials}
          </div>
          {showUserMenu && (
            <div
              style={{ position: 'absolute', top: 40, right: 0, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,.5)', zIndex: 300, overflow: 'hidden' }}
              onMouseLeave={() => setShowUserMenu(false)}
            >
              <button
                onClick={handleLogout}
                style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                🚪 Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Hamburger button — shows on mobile only */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: 22, cursor: 'pointer', padding: '8px', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          className="mobile-hamburger"
          aria-label="Open menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99, background: 'rgba(13,17,23,.98)', borderBottom: '1px solid #263347', padding: '8px 0', backdropFilter: 'blur(12px)' }}>
          {[
            { label: '📁 Projects', href: '/app/projects' },
            { label: '💰 Bids', href: '/app/bids' },
            { label: '📄 Documents', href: '/app/documents' },
            { label: '🤖 Autopilot', href: '/app/autopilot' },
            { label: '📊 Reports', href: '/app/reports' },
            { label: '🧠 Intelligence', href: '/app/intelligence' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'block', padding: '14px 24px', fontSize: 15, fontWeight: 600, color: TEXT, textDecoration: 'none', borderBottom: '1px solid rgba(38,51,71,.4)' }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* ── AI Expert Chat Panel ─────────────────────────────────────────── */}
      {aiOpen && (
        <div
          data-ai-panel
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 200,
            width: 'min(540px, calc(100vw - 24px))',
            height: 'min(680px, calc(100vh - 80px))',
            background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,.7)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ background: '#0d1117', padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>🤖 Saguaro AI Expert</div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>Construction · Bidding · Contracts · Finance · Safety</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {aiMessages.length > 0 && (
                <button
                  onClick={() => setAiMessages([])}
                  style={{ background: 'none', border: `1px solid ${BORDER}`, color: DIM, cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 5, fontWeight: 600 }}
                >
                  Clear
                </button>
              )}
              <button onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>×</button>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {aiMessages.length === 0 ? (
              <div>
                <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🏗️</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 4 }}>Construction AI Expert</div>
                  <div style={{ fontSize: 12, color: DIM, lineHeight: 1.6 }}>Expert in bidding, AIA contracts, lien law, finance,<br/>subcontractors, OSHA, estimating & more.</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUICK_PROMPTS.map(q => (
                    <button
                      key={q.label}
                      className="quick-prompt-btn"
                      onClick={() => sendAI(q.prompt)}
                      style={{ textAlign: 'left', padding: '9px 12px', background: 'rgba(212,160,23,.07)', border: `1px solid rgba(212,160,23,.2)`, borderRadius: 8, color: TEXT, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              aiMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: msg.role === 'user' ? `linear-gradient(135deg,${GOLD},#B85C2A)` : '#1a3a5c', color: msg.role === 'user' ? '#0d1117' : GOLD }}>
                    {msg.role === 'user' ? userInitials : '🤖'}
                  </div>
                  {/* Bubble */}
                  <div style={{ maxWidth: '82%', background: msg.role === 'user' ? 'rgba(212,160,23,.12)' : '#0d1117', border: `1px solid ${msg.role === 'user' ? 'rgba(212,160,23,.25)' : BORDER}`, borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px', padding: '10px 14px', fontSize: 13, lineHeight: 1.65, color: TEXT }}>
                    {msg.role === 'assistant' && msg.content === '' && aiLoading ? (
                      <span style={{ color: GOLD }}>●●●</span>
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
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, background: '#0d1117' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={aiMsg}
                onChange={e => setAiMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAI()}
                placeholder="Ask anything — bidding, contracts, lien, OSHA, finance..."
                style={{ flex: 1, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', color: TEXT, fontSize: 13, outline: 'none', transition: 'border-color .15s' }}
                onFocus={e => (e.target.style.borderColor = GOLD)}
                onBlur={e => (e.target.style.borderColor = BORDER)}
                disabled={aiLoading}
              />
              <button
                onClick={() => sendAI()}
                disabled={aiLoading || !aiMsg.trim()}
                style={{ padding: '10px 18px', background: aiLoading || !aiMsg.trim() ? 'rgba(212,160,23,.3)' : GOLD, border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 800, cursor: aiLoading || !aiMsg.trim() ? 'not-allowed' : 'pointer', fontSize: 13, transition: 'background .15s', whiteSpace: 'nowrap' }}
              >
                {aiLoading ? '...' : 'Send'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: '#3a4f6a', marginTop: 6 }}>Powered by Claude · Enter to send · Expert in construction law, finance & operations</div>
          </div>
        </div>
      )}

      {/* ── Main Content (offset for fixed nav) ─────────────────────────── */}
      <main style={{ paddingTop: 56 }}>
        {children}
      </main>

      {/* ── Command Palette ──────────────────────────────────────────────── */}
      <CommandPalette onScoreBid={() => setShowScoreModal(true)} />

      {/* ── Bid Score Modal ───────────────────────────────────────────────── */}
      {showScoreModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowScoreModal(false); }}
        >
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>🎯 Score a Bid</div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Navigate to the Bids tab to use the full AI scorer</div>
              </div>
              <button onClick={() => setShowScoreModal(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: DIM, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                The full bid scoring tool is available in the Bids section. Navigate to <strong style={{ color: TEXT }}>Bids → Score</strong> for detailed AI-powered bid analysis.
              </p>
              <a
                href="/app/bids?tab=score"
                style={{ display: 'block', marginTop: 16, padding: '10px', background: GOLD, borderRadius: 8, color: '#0d1117', fontWeight: 800, fontSize: 14, textAlign: 'center', textDecoration: 'none' }}
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
