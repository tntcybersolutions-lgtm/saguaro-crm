'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';

/* ─── Palette ─── */
const BG = '#F8F9FB', CARD = '#F8F9FB', GOLD = '#C8960F', GREEN = '#22C55E';
const BORDER = '#2A3040', TEXT = '#F0F4FF', DIM = '#8B9DB8', DARK = '#141922';
const BLUE = '#3B82F6';

const glass: React.CSSProperties = {
  background: `${CARD}CC`, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`, borderRadius: 16,
};

/* ─── Tone Detection ─── */
const TONE_PATTERNS: { pattern: RegExp; tone: string; emoji: string }[] = [
  { pattern: /\b(frustrated|annoyed|angry|upset|hate|terrible|awful|worst|ridiculous)\b/i, tone: 'frustrated', emoji: '😤' },
  { pattern: /\b(excited|amazing|love|awesome|great|fantastic|perfect|beautiful|wonderful)\b/i, tone: 'excited', emoji: '😊' },
  { pattern: /\b(how|what|why|when|where|can you|could you|wondering|curious|question)\b/i, tone: 'curious', emoji: '🤔' },
  { pattern: /\b(urgent|asap|hurry|immediately|emergency|fast|quick|now)\b/i, tone: 'urgent', emoji: '⚡' },
  { pattern: /\b(looking|browsing|exploring|checking|interested|tell me|show me)\b/i, tone: 'browsing', emoji: '👀' },
];

function detectTone(text: string): { tone: string; emoji: string } {
  for (const tp of TONE_PATTERNS) {
    if (tp.pattern.test(text)) return { tone: tp.tone, emoji: tp.emoji };
  }
  return { tone: 'neutral', emoji: '😊' };
}

/* ─── Location Detection ─── */
const LOCATION_PATTERN = /\b(in|near|around|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,?\s*[A-Z]{2})?)\b/;
const STATE_PATTERN = /\b(Arizona|California|Colorado|Florida|Georgia|Texas|Nevada|New York|Oregon|Washington)\b/i;

type ChatMessage = {
  id: string; role: 'user' | 'assistant'; content: string;
  tone?: { tone: string; emoji: string };
  upsell?: { title: string; price: string; image?: string; link: string };
};

const SUGGESTED_PROMPTS = [
  { text: 'What would a kitchen remodel cost?', icon: '🍳' },
  { text: 'How much can I save with solar?', icon: '☀️' },
  { text: 'Design my dream home', icon: '🏠' },
  { text: 'Find me a contractor', icon: '🔧' },
];

/* ─── Upsell Extraction ─── */
function extractUpsell(text: string): ChatMessage['upsell'] | undefined {
  const patterns = [
    { match: /solar/i, title: 'Solar Panel Package', price: '$18,000 - $24,000', link: '/design/packages' },
    { match: /kitchen/i, title: 'Kitchen Remodel Package', price: '$25,000 - $65,000', link: '/design/materials' },
    { match: /smart.*home|automation/i, title: 'Smart Home Starter', price: '$2,800 - $5,200', link: '/design/packages' },
    { match: /ev.*charg|electric.*vehicle/i, title: 'EV Charging Station', price: '$800 - $2,400', link: '/design/roi' },
    { match: /pool|spa/i, title: 'Pool & Spa Package', price: '$35,000 - $75,000', link: '/design/discover' },
    { match: /bathroom/i, title: 'Bathroom Renovation', price: '$15,000 - $40,000', link: '/design/materials' },
  ];
  for (const p of patterns) {
    if (p.match.test(text)) return p;
  }
  return undefined;
}

export default function SageChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `sage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [currentTone, setCurrentTone] = useState({ tone: 'neutral', emoji: '😊' });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const tone = detectTone(text);
    setCurrentTone(tone);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`, role: 'user', content: text.trim(), tone,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/sage/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      const responseText = data.response || data.error || 'I hit a snag there. Mind trying again?';
      const upsell = extractUpsell(responseText);

      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`, role: 'assistant', content: responseText,
        tone: { tone: 'neutral', emoji: '😊' }, upsell,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: `a_${Date.now()}`, role: 'assistant',
        content: "Looks like I lost my connection for a moment. Let me try again — what were you asking about?",
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column',
      color: TEXT,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
        background: `${DARK}E0`, backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: `${GOLD}20`,
          border: `1px solid ${GOLD}40`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22,
        }}>🌵</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            Sage
            <span style={{ fontSize: 14, marginLeft: 6 }} title={currentTone.tone}>
              {currentTone.emoji}
            </span>
          </div>
          <div style={{ fontSize: 12, color: DIM }}>
            Your AI Construction Advisor
          </div>
        </div>
        <div style={{
          marginLeft: 'auto', padding: '4px 12px', borderRadius: 99,
          background: `${GREEN}20`, color: GREEN, fontSize: 12, fontWeight: 600,
        }}>Online</div>
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px', maxWidth: 800,
        margin: '0 auto', width: '100%',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌵</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              Hey there! I&apos;m <span style={{ color: GOLD }}>Sage</span>.
            </h2>
            <p style={{ color: DIM, fontSize: 15, maxWidth: 420, margin: '0 auto 32px', lineHeight: 1.6 }}>
              Think of me as your personal construction advisor. I know costs, materials, timelines, and
              smart home tech like the back of my hand. What can I help you with?
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12, maxWidth: 520, margin: '0 auto',
            }}>
              {SUGGESTED_PROMPTS.map(sp => (
                <button key={sp.text} onClick={() => sendMessage(sp.text)} style={{
                  ...glass, padding: '16px 14px', textAlign: 'left', cursor: 'pointer',
                  transition: 'border-color .2s',
                }}>
                  <span style={{ fontSize: 20, marginRight: 8 }}>{sp.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{sp.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 16,
          }}>
            <div style={{
              maxWidth: '80%', display: 'flex', gap: 10,
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: 32, height: 32, borderRadius: 10, background: `${GOLD}20`,
                  border: `1px solid ${GOLD}30`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 16, flexShrink: 0,
                }}>🌵</div>
              )}
              <div>
                <div style={{
                  ...(msg.role === 'assistant' ? glass : {}),
                  padding: '12px 16px', borderRadius: 14,
                  background: msg.role === 'user'
                    ? `linear-gradient(135deg, ${GOLD}, #B8860B)`
                    : `${CARD}CC`,
                  color: msg.role === 'user' ? '#000' : TEXT,
                  fontSize: 14, lineHeight: 1.6,
                  borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
                }}>
                  {msg.content}
                </div>

                {/* Upsell Card */}
                {msg.upsell && (
                  <a href={msg.upsell.link} style={{ textDecoration: 'none', display: 'block', marginTop: 10 }}>
                    <div style={{
                      ...glass, padding: '14px 16px', cursor: 'pointer',
                      borderColor: `${GOLD}40`, transition: 'border-color .2s',
                      display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 10,
                        background: `linear-gradient(135deg, ${GOLD}30, ${CARD})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, flexShrink: 0,
                      }}>&#9733;</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{msg.upsell.title}</div>
                        <div style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>{msg.upsell.price}</div>
                      </div>
                      <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>Learn More &rarr;</div>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: `${GOLD}20`,
              border: `1px solid ${GOLD}30`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 16, flexShrink: 0,
            }}>🌵</div>
            <div style={{
              ...glass, padding: '14px 20px', borderBottomLeftRadius: 4,
              display: 'flex', gap: 6,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, animation: 'bounce 1.2s infinite 0s' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, animation: 'bounce 1.2s infinite 0.2s' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, animation: 'bounce 1.2s infinite 0.4s' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <div style={{
        padding: '16px 20px', borderTop: `1px solid ${BORDER}`,
        background: `${DARK}E0`, backdropFilter: 'blur(12px)',
        position: 'sticky', bottom: 0,
      }}>
        <div style={{
          maxWidth: 800, margin: '0 auto', display: 'flex', gap: 10,
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Sage anything about your project..."
            style={{
              flex: 1, padding: '14px 18px', background: `${CARD}CC`,
              border: `1px solid ${BORDER}`, borderRadius: 14, color: TEXT,
              fontSize: 15, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              width: 48, height: 48, borderRadius: 14,
              background: input.trim() ? `linear-gradient(135deg, ${GOLD}, #B8860B)` : `${CARD}CC`,
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: input.trim() ? '#000' : DIM,
              transition: 'all .2s',
            }}
          >
            &#9654;
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
