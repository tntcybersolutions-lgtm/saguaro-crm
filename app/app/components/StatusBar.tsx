'use client';
import { useState, useEffect, useCallback } from 'react';

export type StatusType = 'working' | 'success' | 'warning' | 'error' | 'info';

export interface StatusMessage {
  id: string;
  type: StatusType;
  message: string;
  detail?: string;
  progress?: number;
  autoDismissMs?: number;
  timestamp: number;
}

const EVENT_SHOW    = 'saguaro:status:show';
const EVENT_UPDATE  = 'saguaro:status:update';
const EVENT_DISMISS = 'saguaro:status:dismiss';
const EVENT_CLEAR   = 'saguaro:status:clear';

export const statusBar = {
  show(id: string, type: StatusType, message: string, detail?: string, progress?: number) {
    window.dispatchEvent(new CustomEvent(EVENT_SHOW, {
      detail: { id, type, message, detail, progress, timestamp: Date.now() },
    }));
  },
  update(id: string, updates: Partial<Pick<StatusMessage, 'message' | 'detail' | 'progress' | 'type'>>) {
    window.dispatchEvent(new CustomEvent(EVENT_UPDATE, { detail: { id, ...updates } }));
  },
  success(id: string, message: string, detail?: string) {
    window.dispatchEvent(new CustomEvent(EVENT_UPDATE, {
      detail: { id, type: 'success' as StatusType, message, detail, autoDismissMs: 3500 },
    }));
  },
  error(id: string, message: string, detail?: string) {
    window.dispatchEvent(new CustomEvent(EVENT_UPDATE, {
      detail: { id, type: 'error' as StatusType, message, detail },
    }));
  },
  clear(id: string) {
    window.dispatchEvent(new CustomEvent(EVENT_CLEAR, { detail: { id } }));
  },
};

const TYPE_CONFIG: Record<StatusType, {
  bg: string; border: string; text: string; dot: string; icon: string;
}> = {
  working: { bg: 'rgba(212,160,23,0.07)', border: 'rgba(212,160,23,0.3)',
    text: '#d4a017', dot: '#d4a017', icon: '⟳' },
  success: { bg: 'rgba(46,160,67,0.07)',  border: 'rgba(46,160,67,0.3)',
    text: '#2ea043', dot: '#2ea043', icon: '✓' },
  warning: { bg: 'rgba(227,179,65,0.07)', border: 'rgba(227,179,65,0.3)',
    text: '#e3b341', dot: '#e3b341', icon: '⚠' },
  error:   { bg: 'rgba(248,81,73,0.07)',  border: 'rgba(248,81,73,0.3)',
    text: '#f85149', dot: '#f85149', icon: '✕' },
  info:    { bg: 'rgba(56,139,253,0.07)', border: 'rgba(56,139,253,0.3)',
    text: '#388bfd', dot: '#388bfd', icon: 'ℹ' },
};

export function StatusBar() {
  const [messages, setMessages] = useState<StatusMessage[]>([]);

  const addOrUpdate = useCallback((msg: StatusMessage) => {
    setMessages(prev => {
      const existing = prev.findIndex(m => m.id === msg.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], ...msg };
        return updated;
      }
      return [...prev, msg].slice(-4);
    });
    if (msg.autoDismissMs) {
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
      }, msg.autoDismissMs);
    }
  }, []);

  useEffect(() => {
    const onShow = (e: Event) => {
      const d = (e as CustomEvent).detail;
      addOrUpdate({
        autoDismissMs: d.type === 'success' ? 3500 : d.type === 'info' ? 5000 : undefined,
        ...d,
      });
    };
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === d.id);
        if (idx < 0) {
          addOrUpdate({ timestamp: Date.now(), ...d });
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...d };
        if (d.autoDismissMs) {
          setTimeout(() => setMessages(p => p.filter(m => m.id !== d.id)), d.autoDismissMs);
        }
        return updated;
      });
    };
    const onClear = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setMessages(prev => prev.filter(m => m.id !== id));
    };

    window.addEventListener(EVENT_SHOW, onShow);
    window.addEventListener(EVENT_UPDATE, onUpdate);
    window.addEventListener(EVENT_CLEAR, onClear);
    window.addEventListener(EVENT_DISMISS, onClear);
    return () => {
      window.removeEventListener(EVENT_SHOW, onShow);
      window.removeEventListener(EVENT_UPDATE, onUpdate);
      window.removeEventListener(EVENT_CLEAR, onClear);
      window.removeEventListener(EVENT_DISMISS, onClear);
    };
  }, [addOrUpdate]);

  if (messages.length === 0) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      {messages.map(msg => {
        const cfg = TYPE_CONFIG[msg.type];
        return (
          <div key={msg.id} style={{
            background: cfg.bg, borderBottom: `1px solid ${cfg.border}`,
            padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10,
            animation: 'statusSlideDown 0.2s ease',
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: cfg.dot, flexShrink: 0,
              animation: msg.type === 'working' ? 'statusPulse 1.2s ease-in-out infinite' : 'none',
            }}/>
            <span style={{
              fontSize: 13, flexShrink: 0, color: cfg.text, fontWeight: 700,
              animation: msg.type === 'working' ? 'statusRotate 1.5s linear infinite' : 'none',
              display: 'inline-block',
            }}>
              {cfg.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: cfg.text, marginRight: 8 }}>
                {msg.message}
              </span>
              {msg.detail && (
                <span style={{ fontSize: 11, color: '#8b949e' }}>{msg.detail}</span>
              )}
            </div>
            {msg.progress !== undefined && msg.type === 'working' && (
              <div style={{
                width: 80, height: 4, background: '#21262d',
                borderRadius: 2, overflow: 'hidden', flexShrink: 0,
              }}>
                <div style={{
                  height: '100%', width: `${msg.progress}%`,
                  background: cfg.dot, borderRadius: 2,
                  transition: 'width 0.4s ease',
                }}/>
              </div>
            )}
            <button
              onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
              style={{
                background: 'none', border: 'none', color: '#6e7681',
                cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0,
              }}
              title="Dismiss"
            >×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes statusSlideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes statusPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes statusRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
