'use client';
/**
 * PortalSageChat — AI assistant for external portal users (subs + clients).
 * Floating chat widget with streaming responses, quick actions, and project context.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Star, X, PaperPlaneTilt, ArrowClockwise, Sparkle } from '@phosphor-icons/react';
import { colors, font, radius, shadow, z } from '../lib/design-tokens';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PortalSageChatProps {
  token: string;
  portalType: 'sub' | 'client';
  projectContext?: Record<string, any>;
  userName?: string;
}

const SUB_QUICK_ACTIONS = [
  { label: 'What docs do I need?', prompt: 'What compliance documents do I need to have uploaded and current to stay in good standing? List them with deadlines.' },
  { label: 'Help with daily log', prompt: 'Help me write today\'s daily log. I need to describe the work my crew did. Ask me questions and I\'ll tell you what happened.' },
  { label: 'Pay app questions', prompt: 'Explain how pay applications work. How do I know when I can submit one, what happens after I submit, and how long until I get paid?' },
  { label: 'Draft message to GC', prompt: 'Help me draft a professional message to my general contractor. Ask me what I need to communicate.' },
  { label: 'Lien waiver help', prompt: 'Explain the difference between conditional and unconditional lien waivers. When do I sign each one and what do they mean for my lien rights?' },
  { label: 'Insurance expiring soon', prompt: 'My insurance certificate is expiring soon. What do I need to do to update it? Walk me through the steps.' },
];

const CLIENT_QUICK_ACTIONS = [
  { label: 'Project status summary', prompt: 'Give me a quick summary of where my project stands. What percentage is complete, are we on budget, and are there any issues I should know about?' },
  { label: 'Explain this change order', prompt: 'I received a change order request. Can you help me understand what to look for before I approve or reject it? What questions should I ask my contractor?' },
  { label: 'Budget concerns', prompt: 'I\'m worried about the project going over budget. What are the warning signs I should watch for, and what can I do to control costs?' },
  { label: 'What is a pay app?', prompt: 'Explain what a pay application is in simple terms. What am I approving when I sign one, and what happens if I reject it?' },
  { label: 'Understanding my timeline', prompt: 'Help me understand the project timeline. What are the key milestones, what affects the schedule, and what is a realistic expectation for delays?' },
  { label: 'Warranty questions', prompt: 'What does the warranty cover on my construction project? How long does it last and how do I submit a claim if something goes wrong?' },
];

export default function PortalSageChat({ token, portalType, projectContext, userName }: PortalSageChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions = portalType === 'sub' ? SUB_QUICK_ACTIONS : CLIENT_QUICK_ACTIONS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const sendMessage = useCallback(async (overrideMsg?: string) => {
    const text = (overrideMsg ?? input).trim();
    if (!text || loading) return;
    setInput('');

    const updated: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch('/api/portal/sage/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated,
          token,
          portalType,
          projectContext,
        }),
      });

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5));
            if (evt.type === 'delta') {
              full += evt.text;
              setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }]);
    }
    setLoading(false);
  }, [input, loading, messages, token, portalType, projectContext]);

  return (
    <>
      {/* ── Floating Button ──────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Sage AI Assistant"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${colors.gold}, #E5B020)`,
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(200,150,15,.4), 0 2px 8px rgba(0,0,0,.15)',
            zIndex: z.toast,
            transition: 'transform .2s, box-shadow .2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(200,150,15,.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(200,150,15,.4)'; }}
        >
          <Sparkle size={26} weight="fill" />
        </button>
      )}

      {/* ── Chat Panel ───────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 'min(420px, calc(100vw - 32px))',
            height: 'min(600px, calc(100vh - 48px))',
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: z.toast,
            animation: 'sageSlideUp .25s ease',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: colors.pageBg,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, ${colors.gold}, #E5B020)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkle size={20} weight="fill" color="#ffffff" />
              </div>
              <div>
                <div style={{ fontWeight: font.weight.bold, fontSize: font.size.lg, color: colors.text }}>Sage Assistant</div>
                <div style={{ fontSize: font.size.xs, color: colors.textDim }}>
                  {portalType === 'sub' ? 'Construction · Compliance · Billing' : 'Project · Budget · Timeline'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.md, color: colors.textDim, cursor: 'pointer' }} title="New conversation">
                  <ArrowClockwise size={14} />
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.md, color: colors.textDim, cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 ? (
              <div>
                <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
                  <Sparkle size={36} weight="duotone" color={colors.gold} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: font.weight.bold, fontSize: font.size.xl, color: colors.text, marginBottom: 4 }}>
                    Hi{userName ? `, ${userName}` : ''}!
                  </div>
                  <div style={{ fontSize: font.size.md, color: colors.textMuted, lineHeight: 1.5 }}>
                    I'm Sage, your construction AI assistant.<br />How can I help you today?
                  </div>
                </div>
                <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {quickActions.map(q => (
                    <button
                      key={q.label}
                      onClick={() => sendMessage(q.prompt)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        background: `${colors.gold}08`,
                        border: `1px solid ${colors.gold}25`,
                        borderRadius: radius.lg,
                        color: colors.text,
                        fontSize: font.size.md,
                        fontWeight: font.weight.semibold,
                        cursor: 'pointer',
                        transition: 'all .15s',
                        lineHeight: 1.3,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${colors.gold}15`; e.currentTarget.style.borderColor = `${colors.gold}40`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = `${colors.gold}08`; e.currentTarget.style.borderColor = `${colors.gold}25`; }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${colors.gold}, #E5B020)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Sparkle size={14} weight="fill" color="#fff" />
                    </div>
                  )}
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    background: msg.role === 'user' ? colors.gold : colors.pageBg,
                    color: msg.role === 'user' ? '#ffffff' : colors.text,
                    border: msg.role === 'user' ? 'none' : `1px solid ${colors.border}`,
                    fontSize: font.size.md,
                    lineHeight: 1.6,
                  }}>
                    {msg.role === 'assistant' && msg.content === '' && loading ? (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.gold, animation: 'sageDot 1.2s ease infinite' }} />
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.gold, animation: 'sageDot 1.2s ease .2s infinite' }} />
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.gold, animation: 'sageDot 1.2s ease .4s infinite' }} />
                      </span>
                    ) : (
                      <div
                        className="sage-msg"
                        style={{ whiteSpace: 'pre-wrap' }}
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px;color:#111827">$1</h4>')
                            .replace(/^## (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px;color:#111827">$1</h4>')
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
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.border}`, flexShrink: 0, background: colors.white }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={portalType === 'sub' ? 'Ask about compliance, pay apps, documents...' : 'Ask about your project, budget, timeline...'}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: colors.pageBg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg,
                  color: colors.text,
                  fontSize: font.size.md,
                  outline: 'none',
                  transition: 'border-color .15s',
                }}
                onFocus={e => (e.target.style.borderColor = colors.gold)}
                onBlur={e => (e.target.style.borderColor = colors.border)}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{
                  width: 40, height: 40,
                  background: loading || !input.trim() ? colors.raisedAlt : colors.gold,
                  border: 'none',
                  borderRadius: radius.lg,
                  color: loading || !input.trim() ? colors.textDim : '#ffffff',
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s',
                }}
              >
                <PaperPlaneTilt size={18} weight="fill" />
              </button>
            </div>
            <div style={{ fontSize: 10, color: colors.textDim, marginTop: 6, textAlign: 'center' }}>
              Powered by Sage AI · Construction expertise on demand
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sageSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sageDot { 0%, 100% { opacity: .3; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.2); } }
        .sage-msg strong { color: inherit; font-weight: 700; }
        .sage-msg ul, .sage-msg ol { margin: 4px 0 8px 16px; }
        .sage-msg li { margin-bottom: 2px; }
      `}</style>
    </>
  );
}
