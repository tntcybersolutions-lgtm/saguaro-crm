'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

interface GlobalShortcutsProps {
  onProjectSwitch?: () => void;
}

interface ShortcutDef {
  keys: string;
  label: string;
  keyBadges: string[];
}

const SHORTCUT_LIST: ShortcutDef[] = [
  { keys: 'Cmd+N', label: 'New Project', keyBadges: ['Cmd', 'N'] },
  { keys: 'Cmd+Shift+P', label: 'Project Switcher', keyBadges: ['Cmd', 'Shift', 'P'] },
  { keys: 'Cmd+K', label: 'Command Palette', keyBadges: ['Cmd', 'K'] },
  { keys: 'Escape', label: 'Close Modal / Panel', keyBadges: ['Esc'] },
  { keys: 'Cmd+Shift+D', label: 'Toggle Theme', keyBadges: ['Cmd', 'Shift', 'D'] },
  { keys: 'Cmd+/', label: 'Shortcuts Help', keyBadges: ['Cmd', '/'] },
];

export default function GlobalShortcuts({ onProjectSwitch }: GlobalShortcutsProps) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape — close modals or help overlay
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        window.dispatchEvent(new CustomEvent('close-all-modals'));
        return;
      }

      // Cmd+N — new project
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        router.push('/app/projects/new');
        return;
      }

      // Cmd+Shift+P — project switcher
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onProjectSwitch?.();
        return;
      }

      // Cmd+K — command palette
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('open-command-palette'));
        return;
      }

      // Cmd+Shift+D — toggle theme
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-theme'));
        return;
      }

      // Cmd+/ — shortcuts help
      if (mod && e.key === '/') {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }
    },
    [router, onProjectSwitch, showHelp]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!showHelp) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const modLabel = isMac ? 'Cmd' : 'Ctrl';

  return (
    <div
      onClick={() => setShowHelp(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DARK,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '28px 32px',
          minWidth: 420,
          maxWidth: 520,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setShowHelp(false)}
            style={{
              background: 'none',
              border: 'none',
              color: DIM,
              fontSize: 20,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SHORTCUT_LIST.map((s) => (
            <div
              key={s.keys}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: RAISED,
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
              }}
            >
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 500 }}>{s.label}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {s.keyBadges.map((badge) => {
                  const displayBadge =
                    badge === 'Cmd' ? modLabel : badge === 'Esc' ? 'Esc' : badge;
                  return (
                    <span
                      key={badge}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 28,
                        height: 26,
                        padding: '0 7px',
                        background: DARK,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: GOLD,
                        fontFamily: 'monospace',
                      }}
                    >
                      {displayBadge}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            margin: '16px 0 0',
            fontSize: 12,
            color: DIM,
            textAlign: 'center',
          }}
        >
          Press <strong style={{ color: GOLD }}>Esc</strong> or click outside to close
        </p>
      </div>
    </div>
  );
}
