'use client';

/**
 * PageTransition — the 150ms fade the app content enters with.
 *
 * This component quietly broke every modal in the signed-in app.
 *
 * The fade animated `transform: translateY(8px) → translateY(0)` with
 * `fill-mode: forwards`. Forwards means the last keyframe sticks, so once the
 * animation finished the wrapper kept a computed `transform: matrix(1,0,0,1,0,0)`
 * — an identity transform, visually a no-op, and permanent.
 *
 * A transform other than `none` makes an element the containing block for any
 * `position: fixed` descendant. So `fixed` stopped meaning "the viewport" and
 * started meaning "this wrapper" for all 223 pages under /app. Every modal,
 * scrim, drawer, toast and sticky bar was being positioned against the full
 * page box instead of the screen.
 *
 * On a short page that is invisible. On a tall one it is fatal: the measured
 * takeoff page is 2806px, so its first-run wizard painted an 82%-opaque scrim
 * over everything and placed the dialog at y=1238 — 518px below the fold of a
 * 720px window. The reported symptom was the page freezing on a black screen.
 * It had not frozen. It was covered by its own modal backdrop, with the dialog
 * parked off-screen and nothing on screen to dismiss it.
 *
 * The fix keeps the motion and removes what the motion left behind: once the
 * animation ends the animation style is dropped entirely, so the computed
 * transform returns to `none` and `fixed` means the viewport again. A timer
 * backstops `animationend`, which never fires if the element is hidden or the
 * animation is suppressed — without it a missed event would strand the wrapper
 * in the transformed state, which is the bug all over again.
 */

import { useEffect, useRef, useState } from 'react';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  // 'pre' — hidden, waiting for mount so the fade has somewhere to start from.
  // 'run' — animating; the transform exists for these 150ms only.
  // 'done' — no animation, no transform, no containing block.
  const [phase, setPhase] = useState<'pre' | 'run' | 'done'>('pre');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Anyone who has asked for less motion skips straight past the transform.
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setPhase('done');
      return;
    }

    setPhase('run');
    // Backstop: animationend does not fire for a hidden or suppressed element,
    // and a wrapper stuck in 'run' is exactly the bug this file exists to fix.
    timer.current = setTimeout(() => setPhase('done'), 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const style: React.CSSProperties | undefined =
    phase === 'pre'
      ? { opacity: 0 }
      : phase === 'run'
        ? { animation: 'saguaroPageIn 150ms ease-out forwards' }
        : undefined; // 'done' — deliberately no style at all.

  return (
    <div
      style={style}
      onAnimationEnd={() => {
        if (timer.current) clearTimeout(timer.current);
        setPhase('done');
      }}
    >
      {children}
    </div>
  );
}
