'use client';
/**
 * SageCommandPalette — Cmd/Ctrl+K command palette.
 * Fixed gold FAB bottom-right always visible. Full-screen dark overlay
 * opens on keyboard shortcut or FAB click. Classifies the user's command
 * via /api/sage/command and shows a large "Go →" button.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const RAISED = '#0D1D2E';
const DARK = '#0d1117';

interface ActionResult {
  label: string;
  description: string;
  buttonLabel: string;
  route: string;
}

const QUICK_ACTIONS: Array<{ icon: string; label: string; command: string }> = [
  { icon: '📋', label: 'Daily Report',    command: 'daily report' },
  { icon: '💵', label: 'G702 Pay App',    command: 'generate G702 pay application' },
  { icon: '🔄', label: 'Change Order',    command: 'draft change order' },
  { icon: '❓', label: 'RFI',             command: 'draft RFI to architect' },
  { icon: '🔏', label: 'Lien Waiver',     command: 'send lien waiver' },
  { icon: '📝', label: 'Subcontract',     command: 'generate subcontract' },
  { icon: '📦', label: 'Closeout',        command: 'project closeout' },
  { icon: '🏆', label: 'Milestone Letter', command: 'generate milestone letter' },
  { icon: '🩺', label: 'System Health',   command: 'system health check' },
];

export default function SageCommandPalette() {
  const router = useRouter();
  const params = useParams();
  const projectId = (params?.projectId as string) || null;

  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [matchedBy, setMatchedBy] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K toggle + Esc close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = mac ? e.metaKey : e.ctrlKey;
      if (modifier && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(v => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      setCommand('');
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const submit = useCallback(async (overrideCommand?: string) => {
    const text = (overrideCommand ?? command).trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/sage/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text, projectId }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j?.error || `Classification failed (${r.status})`);
        return;
      }
      setResult(j.action as ActionResult);
      setMatchedBy(j.matchedBy || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [command, loading, projectId]);

  function go() {
    if (!result) return;
    router.push(result.route);
    setOpen(false);
  }

  return (
    <>
      {/* Fixed gold FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask Sage"
        style={{
          position: 'fixed', bottom: 20, right: 20,
          background: GOLD, color: '#0d1117',
          fontWeight: 800, fontSize: 13,
          padding: '12px 18px', borderRadius: 999, border: 'none',
          cursor: 'pointer', zIndex: 700,
          boxShadow: '0 6px 20px rgba(200,150,15,0.45)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 15 }}>⚡</span>
        <span>Ask Sage</span>
        <span style={{
          background: 'rgba(13,17,23,0.2)', fontSize: 10, fontWeight: 800,
          padding: '2px 6px', borderRadius: 4, marginLeft: 2,
        }}>
          ⌘K
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '10vh 16px 16px',
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              width: '100%', maxWidth: 720,
              background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '12px 18px', borderBottom: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <span style={{ fontSize: 20 }}>⚡</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>Ask Sage</div>
                <div style={{ fontSize: 11, color: DIM }}>
                  Try: "draft change order" · "send lien waiver" · "G702 pay app"
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', color: DIM, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}
              >×</button>
            </div>

            {/* Input */}
            <div style={{ padding: 16 }}>
              <input
                ref={inputRef}
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="What do you want to do?"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10,
                  color: TEXT, fontSize: 18, padding: '14px 16px', outline: 'none',
                }}
              />

              {error && (
                <div style={{ marginTop: 12, color: '#EF4444', fontSize: 12, fontWeight: 700 }}>{error}</div>
              )}

              {/* Quick actions shown before any input/result */}
              {!result && !loading && (
                <>
                  <div
                    style={{
                      marginTop: 16, fontSize: 10, fontWeight: 800, color: GOLD,
                      textTransform: 'uppercase', letterSpacing: 1.2,
                    }}
                  >
                    Quick Actions
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8, marginTop: 10,
                    }}
                  >
                    {QUICK_ACTIONS.map(q => (
                      <button
                        key={q.label}
                        onClick={() => submit(q.command)}
                        style={{
                          background: 'rgba(200,150,15,0.06)',
                          border: `1px solid rgba(200,150,15,0.25)`,
                          borderRadius: 10,
                          padding: '12px 10px',
                          color: TEXT,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{q.icon}</span>
                        <span>{q.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {loading && (
                <div style={{ padding: '30px 0', textAlign: 'center', color: GOLD, fontWeight: 700 }}>
                  Thinking…
                </div>
              )}

              {result && !loading && (
                <div
                  style={{
                    marginTop: 16, background: DARK, border: `1px solid ${BORDER}`,
                    borderRadius: 12, padding: 16,
                  }}
                >
                  <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                    Matched{matchedBy ? ` · via ${matchedBy}` : ''}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, marginBottom: 4 }}>
                    {result.label}
                  </div>
                  <div style={{ fontSize: 13, color: DIM, marginBottom: 14 }}>
                    {result.description}
                  </div>
                  <button
                    onClick={go}
                    style={{
                      width: '100%',
                      background: GOLD, color: '#0d1117',
                      fontWeight: 800, fontSize: 15,
                      padding: '14px 18px', borderRadius: 10,
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {result.buttonLabel} →
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '10px 18px', borderTop: `1px solid ${BORDER}`,
                fontSize: 11, color: DIM, display: 'flex', justifyContent: 'space-between',
              }}
            >
              <span>Enter to submit · Esc to close</span>
              <span>⌘K toggles anywhere</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
