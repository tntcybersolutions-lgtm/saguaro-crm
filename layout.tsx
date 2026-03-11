'use client';
/**
 * App Shell Layout — The main CRM application wrapper.
 * Renders the top navigation bar and provides the page content area.
 * Project-level sidebar is rendered in the project layout.
 */
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GOLD   = '#D4A017';
const DARK   = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM    = '#8fa3c0';
const TEXT   = '#e8edf8';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  async function sendAI() {
    if (!aiMsg.trim()) return;
    setAiLoading(true);
    setAiReply('');
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiMsg, context: 'CRM Dashboard' }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5));
            if (evt.type === 'delta') { full += evt.text; setAiReply(full); }
          } catch {}
        }
      }
    } catch { setAiReply('Error connecting to AI. Please try again.'); }
    setAiLoading(false);
    setAiMsg('');
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 56, background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, backdropFilter: 'blur(12px)' }}>
        <Link href="/app" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: 22 }}>🌵</span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1, color: GOLD }}>SAGUARO</span>
          <span style={{ fontSize: 10, background: GOLD, color: '#0d1117', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>CRM</span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {[
            { label: 'Projects',   href: '/app/projects' },
            { label: 'Bids',       href: '/app/bids' },
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

        {/* AI Assistant Button */}
        <button onClick={() => setAiOpen(!aiOpen)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          🤖 AI Assistant
        </button>

        {/* Avatar */}
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#B85C2A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0d1117', cursor: 'pointer' }}>
          C
        </div>
      </nav>

      {/* ── AI Chat Panel ───────────────────────────────────────────────── */}
      {aiOpen && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 200, width: 380, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
          <div style={{ background: '#0d1117', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>🤖 Saguaro AI</span>
            <button onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <div style={{ padding: 16, minHeight: 120, maxHeight: 280, overflowY: 'auto', fontSize: 13, lineHeight: 1.6, color: DIM }}>
            {aiReply || <span style={{ color: '#4a5f7a' }}>Ask me anything about your projects, bids, contracts, or construction industry questions...</span>}
            {aiLoading && <span style={{ color: GOLD }}>●●●</span>}
          </div>
          {/* Quick questions */}
          <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['What bids should I pursue?', 'How do I create a pay app?', 'What is prevailing wage?'].map(q => (
              <button key={q} onClick={() => { setAiMsg(q); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.2)`, color: GOLD, cursor: 'pointer' }}>{q}</button>
            ))}
          </div>
          <div style={{ padding: '8px 12px 12px', display: 'flex', gap: 8, borderTop: `1px solid ${BORDER}` }}>
            <input
              value={aiMsg}
              onChange={e => setAiMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendAI()}
              placeholder="Ask Saguaro AI..."
              style={{ flex: 1, background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', color: TEXT, fontSize: 13, outline: 'none' }}
            />
            <button onClick={sendAI} disabled={aiLoading} style={{ padding: '8px 14px', background: GOLD, border: 'none', borderRadius: 6, color: '#0d1117', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content (offset for fixed nav) ─────────────────────────── */}
      <main style={{ paddingTop: 56 }}>
        {children}
      </main>
    </div>
  );
}
