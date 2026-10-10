'use client';
import { useEffect, type RefObject } from 'react';

/**
 * Escape closes this dialog — but only when it is the TOP one. Windows stack
 * (a file preview, its Share sheet, a Rename prompt), and every one of them
 * listens for Escape; without this a single key press closed them all.
 * "Top" is the last aria-modal element in the document — dialogs open later
 * render later.
 *
 * Capture phase on window, so every check runs before anything closes: the
 * prompts in lib/ui/async-dialog listen on document (bubble), and React can
 * flush a close between two listeners. The top dialog stops the event once it
 * has handled it, so nothing under it sees the same key press.
 */
export function useEscapeClose(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current) return;
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (modals[modals.length - 1] !== ref.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ref, onClose, active]);
}
