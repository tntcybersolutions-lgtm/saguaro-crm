'use client';

/**
 * The message strip under the header — where anything the GC must see lands.
 *
 * Before this, messages went wherever the page that raised them decided:
 * a centred modal, a toast in a corner, a red line inside a card halfway down
 * a scroll. Three problems with that. A modal stops the work to say something
 * that often did not need to stop it. A toast disappears while you are reading
 * something else. A line inside a card is invisible unless you happen to be
 * looking at that card.
 *
 * One strip, directly under the top bar, on every screen, in the same place.
 * It pushes the page down rather than covering it, so nothing is ever hidden
 * behind it, and it survives navigation — a message raised on one page is
 * still there on the next until it is dealt with or dismissed.
 *
 * Anywhere in the app:
 *
 *   import { headerMessage } from '@/components/HeaderMessages';
 *   headerMessage({ tone: 'bad', text: 'Insurance for Bell Electric expired.',
 *                   action: { label: 'Open compliance', href: '/app/compliance' } });
 *
 * Deliberately not a replacement for a confirmation dialog. "You have unsaved
 * changes — leave anyway?" has to block, because the answer changes what
 * happens next. This is for things the GC needs to KNOW, not decide.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Warning, Info, CheckCircle, WarningOctagon } from '@phosphor-icons/react';
import { TONES, type Tone } from '@/lib/status-system';

const EVENT = 'saguaro-header-message';
const CLEAR = 'saguaro-header-message-clear';

export interface HeaderMessage {
  /**
   * Stable id. Raising the same id twice replaces rather than stacks, so a
   * page that re-renders cannot pile up six copies of one warning.
   */
  id?: string;
  /** Reuses the platform tone vocabulary — same colors, same meanings. */
  tone: Extract<Tone, 'active' | 'waiting' | 'good' | 'warn' | 'bad'>;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
  /** Auto-clear after this many ms. Omit for messages that must be dismissed. */
  ttlMs?: number;
  /** Hide the dismiss control — for something that must be resolved, not waved away. */
  sticky?: boolean;
}

/** Raise a message. Safe to call from anywhere on the client. */
export function headerMessage(msg: HeaderMessage) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: msg }));
}

/** Clear one by id, or all of them. */
export function clearHeaderMessage(id?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLEAR, { detail: { id } }));
}

const ICONS: Record<string, React.ElementType> = {
  active: Warning,
  waiting: Info,
  good: CheckCircle,
  warn: Warning,
  bad: WarningOctagon,
};

let seq = 0;

export default function HeaderMessages() {
  const [messages, setMessages] = useState<Array<HeaderMessage & { id: string }>>([]);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Publish our height so the page can move down by exactly that much.
   *
   * The strip lives inside the fixed header, so without this it would sit on
   * top of the first rows of whatever the reader was looking at — turning a
   * message meant to inform into one that hides the thing it is about. The
   * shell adds this variable to its top padding.
   */
  useEffect(() => {
    const el = boxRef.current;
    const set = (h: number) => document.documentElement.style.setProperty('--sag-header-msg-h', `${h}px`);
    if (!el) { set(0); return; }
    set(el.offsetHeight);
    const ro = new ResizeObserver(() => set(el.offsetHeight));
    ro.observe(el);
    return () => { ro.disconnect(); set(0); };
  }, [messages.length]);

  useEffect(() => {
    const onMsg = (e: Event) => {
      const detail = (e as CustomEvent).detail as HeaderMessage;
      if (!detail?.text) return;
      const id = detail.id ?? `hm-${++seq}`;
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== id);
        return [...without, { ...detail, id }];
      });
      if (detail.ttlMs && detail.ttlMs > 0) {
        window.setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m.id !== id));
        }, detail.ttlMs);
      }
    };
    const onClear = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      setMessages((prev) => (id ? prev.filter((m) => m.id !== id) : []));
    };
    window.addEventListener(EVENT, onMsg);
    window.addEventListener(CLEAR, onClear);
    return () => {
      window.removeEventListener(EVENT, onMsg);
      window.removeEventListener(CLEAR, onClear);
    };
  }, []);

  if (!messages.length) return null;

  return (
    <div
      ref={boxRef}
      role="status"
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.10)' }}
    >
      {messages.map((m) => {
        const t = TONES[m.tone];
        const Icon = ICONS[m.tone] ?? Info;
        return (
          <div
            key={m.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 16px',
              background: `linear-gradient(${t.bg}, ${t.bg}), #000000`,
              borderTop: `1px solid ${t.border}`,
              color: t.fg,
              fontSize: 13, fontWeight: 600,
            }}
          >
            <Icon size={16} weight="fill" />
            <span style={{ flex: 1, minWidth: 0, color: '#FFFFFF', fontWeight: 600 }}>{m.text}</span>

            {m.action && (m.action.href ? (
              <Link
                href={m.action.href}
                style={{
                  flexShrink: 0, padding: '4px 11px', borderRadius: 7, textDecoration: 'none',
                  background: t.fg, color: '#0A0A00', fontSize: 12, fontWeight: 800,
                }}
              >
                {m.action.label}
              </Link>
            ) : (
              <button
                onClick={m.action.onClick}
                style={{
                  flexShrink: 0, padding: '4px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: t.fg, color: '#0A0A00', fontSize: 12, fontWeight: 800,
                }}
              >
                {m.action.label}
              </button>
            ))}

            {!m.sticky && (
              <button
                onClick={() => setMessages((prev) => prev.filter((x) => x.id !== m.id))}
                aria-label="Dismiss"
                style={{
                  flexShrink: 0, width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: 'none', color: t.fg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
