'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const BASE = '#F8F9FB';
const CARD = '#F8F9FB';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = '#E5E7EB';
const DIM = '#6B7280';
const TEXT = '#111827';

interface Article {
  id: string;
  title: string;
  trade: string;
  category: string;
  difficulty: string;
  estimated_time: string;
  preview: string;
  content: string;
  tools: string[];
  materials: string[];
  code_references: string[];
  tags: string[];
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const TRADES = ['All', 'Low Volt', 'Electrical', 'Plumbing', 'HVAC', 'Framing', 'Drywall', 'Concrete', 'Roofing', 'Painting', 'Flooring', 'Landscaping'];
const CATEGORIES = ['All', 'How-To', 'Best Practice', 'Code Reference', 'Troubleshooting', 'Safety'];

const TRADE_COLORS: Record<string, string> = {
  'Low Volt': '#3B82F6', 'Electrical': '#F59E0B', 'Plumbing': '#06B6D4', 'HVAC': '#8B5CF6',
  'Framing': '#D97706', 'Drywall': '#9CA3AF', 'Concrete': '#6B7280', 'Roofing': '#EF4444',
  'Painting': '#EC4899', 'Flooring': '#14B8A6', 'Landscaping': '#22C55E',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: GREEN, intermediate: GOLD, advanced: '#F97316', expert: RED,
};

export default function TradeGuidePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTrade, setActiveTrade] = useState('All');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeTrade !== 'All') params.set('trade', activeTrade);
      if (activeCategory !== 'All') params.set('category', activeCategory);
      const res = await fetch(`/api/trade-guide/articles?${params.toString()}`);
      const data = await res.json();
      setArticles(data.articles || []);
    } catch { /* */ }
    setLoading(false);
  }, [search, activeTrade, activeCategory]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/trade-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: chatMessages,
          context: selectedArticle ? { title: selectedArticle.title, trade: selectedArticle.trade } : undefined,
        }),
      });

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';

        setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const d = line.slice(6);
              if (d === '[DONE]') continue;
              try {
                const parsed = JSON.parse(d);
                fullReply += parsed.text || parsed.chunk || '';
              } catch {
                fullReply += d;
              }
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullReply };
                return updated;
              });
            }
          }
        }
      } else {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.message || 'No response.' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to Sage. Please try again.' }]);
    }
    setChatLoading(false);
  };

  const filteredArticles = articles;

  const renderMarkdown = (md: string) => {
    if (!md) return '';
    return md
      .replace(/### (.*)/g, '<h3 style="color:#e8edf8;font-size:16px;font-weight:700;margin:16px 0 8px">$1</h3>')
      .replace(/## (.*)/g, '<h2 style="color:#e8edf8;font-size:18px;font-weight:700;margin:20px 0 10px">$1</h2>')
      .replace(/# (.*)/g, '<h1 style="color:#e8edf8;font-size:22px;font-weight:700;margin:24px 0 12px">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e8edf8">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:#0a0e14;padding:2px 6px;border-radius:4px;font-size:12px;color:#22C55E">$1</code>')
      .replace(/^- (.*)/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
      .replace(/^(\d+)\. (.*)/gm, '<li style="margin:4px 0;padding-left:4px">$2</li>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  };

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16,
  };

  // Article Detail View
  if (selectedArticle) {
    return (
      <div style={{ padding: '16px 16px 100px', maxWidth: 800, margin: '0 auto' }}>
        <button
          onClick={() => setSelectedArticle(null)}
          style={{ background: 'none', border: 'none', color: DIM, fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}
        >
          &larr; Back to articles
        </button>

        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 8, fontWeight: 600,
              background: `${TRADE_COLORS[selectedArticle.trade] || BLUE}20`,
              color: TRADE_COLORS[selectedArticle.trade] || BLUE,
            }}>{selectedArticle.trade}</span>
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 8, fontWeight: 600,
              background: `${DIFFICULTY_COLORS[selectedArticle.difficulty] || GOLD}20`,
              color: DIFFICULTY_COLORS[selectedArticle.difficulty] || GOLD,
              textTransform: 'capitalize',
            }}>{selectedArticle.difficulty}</span>
            {selectedArticle.estimated_time && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: '#EEF0F3', color: DIM }}>
                {selectedArticle.estimated_time}
              </span>
            )}
          </div>

          <h1 style={{ color: TEXT, fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>{selectedArticle.title}</h1>

          {/* Content */}
          <div
            style={{ color: TEXT, fontSize: 14, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedArticle.content) }}
          />

          {/* Tools List */}
          {selectedArticle.tools && selectedArticle.tools.length > 0 && (
            <div style={{ marginTop: 20, padding: 14, background: `${BLUE}08`, borderRadius: 8, border: `1px solid ${BLUE}20` }}>
              <div style={{ color: BLUE, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>TOOLS NEEDED</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedArticle.tools.map((tool, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', background: `${BLUE}10`, color: TEXT, borderRadius: 6,
                    fontSize: 12, border: `1px solid ${BLUE}20`,
                  }}>{tool}</span>
                ))}
              </div>
            </div>
          )}

          {/* Materials List */}
          {selectedArticle.materials && selectedArticle.materials.length > 0 && (
            <div style={{ marginTop: 12, padding: 14, background: `${GREEN}08`, borderRadius: 8, border: `1px solid ${GREEN}20` }}>
              <div style={{ color: GREEN, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>MATERIALS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedArticle.materials.map((mat, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', background: `${GREEN}10`, color: TEXT, borderRadius: 6,
                    fontSize: 12, border: `1px solid ${GREEN}20`,
                  }}>{mat}</span>
                ))}
              </div>
            </div>
          )}

          {/* Code References */}
          {selectedArticle.code_references && selectedArticle.code_references.length > 0 && (
            <div style={{ marginTop: 12, padding: 14, background: `${GOLD}08`, borderRadius: 8, border: `1px solid ${GOLD}20` }}>
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CODE REFERENCES</div>
              {selectedArticle.code_references.map((ref, i) => (
                <div key={i} style={{ color: TEXT, fontSize: 13, padding: '4px 0' }}>
                  {ref}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sage Chat FAB */}
        <button
          onClick={() => setShowChat(!showChat)}
          style={{
            position: 'fixed', bottom: 20, right: 20, width: 56, height: 56,
            borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            zIndex: 100,
          }}
        >
          🤖
        </button>

        {/* Chat Panel */}
        {showChat && (
          <div style={{
            position: 'fixed', bottom: 84, right: 20, width: 340, height: 460,
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
            display: 'flex', flexDirection: 'column', zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: GOLD, fontSize: 14, fontWeight: 700 }}>Ask Sage</div>
                <div style={{ color: DIM, fontSize: 11 }}>Your trade knowledge assistant</div>
              </div>
              <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18 }}>x</button>
            </div>
            <div ref={chatRef} style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chatMessages.length === 0 && (
                <div style={{ color: DIM, fontSize: 12, textAlign: 'center', padding: 20 }}>
                  Ask me anything about any construction trade. I can help with how-tos, code references, troubleshooting, and best practices.
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                  background: msg.role === 'user' ? `${GOLD}20` : '#E2E5EA',
                  color: TEXT, fontSize: 13, lineHeight: 1.5,
                  borderBottomRightRadius: msg.role === 'user' ? 4 : 12,
                  borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 12,
                }}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                </div>
              ))}
              {chatLoading && (
                <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Sage is thinking...</div>
              )}
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Ask a trade question..."
                style={{ flex: 1, padding: '10px 14px', background: BASE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, outline: 'none' }}
              />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{
                padding: '10px 16px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
                color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
              }}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Article List View
  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ color: TEXT, fontSize: 20, fontWeight: 700, margin: 0 }}>Trade Knowledge Base</h1>
        <p style={{ color: DIM, fontSize: 12, margin: '4px 0 0' }}>How-tos, code references, and best practices for every trade.</p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search articles..."
          style={{
            width: '100%', padding: '12px 16px', background: `${CARD}cc`, color: TEXT,
            border: `1px solid ${BORDER}`, borderRadius: 12, fontSize: 14, outline: 'none',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          }}
        />
      </div>

      {/* Trade Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
        {TRADES.map(trade => (
          <button
            key={trade}
            onClick={() => setActiveTrade(trade)}
            style={{
              padding: '6px 12px', border: `1px solid ${activeTrade === trade ? (TRADE_COLORS[trade] || GOLD) : BORDER}`,
              borderRadius: 20, background: activeTrade === trade ? `${TRADE_COLORS[trade] || GOLD}15` : 'transparent',
              color: activeTrade === trade ? (TRADE_COLORS[trade] || GOLD) : DIM,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >{trade}</button>
        ))}
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '4px 10px', border: 'none',
              borderRadius: 6, background: activeCategory === cat ? '#E5E7EB' : 'transparent',
              color: activeCategory === cat ? TEXT : DIM,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >{cat}</button>
        ))}
      </div>

      {/* Article Cards */}
      {loading ? (
        <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 40 }}>Loading articles...</div>
      ) : filteredArticles.length === 0 ? (
        <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 40 }}>
          No articles found. Try a different search or filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredArticles.map(article => (
            <button
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              style={{
                ...cardStyle, cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                  background: `${TRADE_COLORS[article.trade] || BLUE}20`,
                  color: TRADE_COLORS[article.trade] || BLUE,
                }}>{article.trade}</span>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                  background: `${DIFFICULTY_COLORS[article.difficulty] || GOLD}20`,
                  color: DIFFICULTY_COLORS[article.difficulty] || GOLD,
                  textTransform: 'capitalize',
                }}>{article.difficulty}</span>
                {article.estimated_time && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#E2E5EA', color: DIM }}>
                    {article.estimated_time}
                  </span>
                )}
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#E2E5EA', color: DIM,
                }}>{article.category}</span>
              </div>
              <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{article.title}</div>
              <div style={{ color: DIM, fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {article.preview}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sage Chat FAB */}
      <button
        onClick={() => setShowChat(!showChat)}
        style={{
          position: 'fixed', bottom: 20, right: 20, width: 56, height: 56,
          borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          zIndex: 100,
        }}
      >
        🤖
      </button>

      {/* Chat Panel */}
      {showChat && (
        <div style={{
          position: 'fixed', bottom: 84, right: 20, width: 340, height: 460,
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
          display: 'flex', flexDirection: 'column', zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: GOLD, fontSize: 14, fontWeight: 700 }}>Ask Sage</div>
              <div style={{ color: DIM, fontSize: 11 }}>Your trade knowledge assistant</div>
            </div>
            <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18 }}>x</button>
          </div>
          <div ref={chatRef} style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatMessages.length === 0 && (
              <div style={{ color: DIM, fontSize: 12, textAlign: 'center', padding: 20 }}>
                Ask me anything about any construction trade. I can help with how-tos, code references, troubleshooting, and best practices.
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? `${GOLD}20` : '#E2E5EA',
                color: TEXT, fontSize: 13, lineHeight: 1.5,
                borderBottomRightRadius: msg.role === 'user' ? 4 : 12,
                borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 12,
              }}>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              </div>
            ))}
            {chatLoading && (
              <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Sage is thinking...</div>
            )}
          </div>
          <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Ask a trade question..."
              style={{ flex: 1, padding: '10px 14px', background: BASE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, outline: 'none' }}
            />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{
              padding: '10px 16px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
              color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
            }}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}