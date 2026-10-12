'use client';
import React from 'react';

/**
 * Scribble — a marker annotation, the way a super marks up a drawing.
 *
 * Two pieces, usable together or apart:
 *   <ScribbleNote>   the handwritten note itself
 *   <ScribbleArrow>  a hand-drawn arrow pointing at whatever it sits beside
 *
 * The arrow is drawn as an SVG path with a non-uniform stroke and a slight
 * rotation, so it reads as drawn rather than as a UI chevron. Both respect
 * prefers-reduced-motion: the draw-on animation is the only motion here and it
 * is skipped entirely, leaving the finished mark.
 *
 * The font is loaded in app/layout.tsx (Permanent Marker) and exposed as
 * --font-marker. If it fails to load the fallback is a cursive stack, which
 * still reads as handwriting rather than falling back to the UI sans.
 */

const MARKER_STACK =
  "var(--font-marker), 'Permanent Marker', 'Bradley Hand', 'Comic Sans MS', cursive";

export type ScribbleProps = {
  children: React.ReactNode;
  color?: string;
  size?: number;
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function ScribbleNote({
  children,
  color = 'var(--text-secondary)',
  size = 15,
  rotate = -4,
  className,
  style,
}: ScribbleProps) {
  return (
    <span
      className={['scribble', className].filter(Boolean).join(' ')}
      style={{
        fontFamily: MARKER_STACK,
        color,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: '0.01em',
        display: 'inline-block',
        transform: `rotate(${rotate}deg)`,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export type ScribbleArrowProps = {
  /** Where the tip points, relative to the arrow's own box. */
  direction?: 'down' | 'up' | 'left' | 'right';
  color?: string;
  width?: number;
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

/* One drawn path, reused at four rotations — a real marker stroke has a
   consistent character, so redrawing it per direction would look wrong. */
const PATH =
  'M6 14 C 26 4, 44 6, 52 20 C 60 34, 74 38, 92 28';
const HEAD_A = 'M92 28 L 78 27';
const HEAD_B = 'M92 28 L 85 39';

const ROTATION: Record<NonNullable<ScribbleArrowProps['direction']>, number> = {
  right: 0,
  down: 55,
  left: 180,
  up: -125,
};

export function ScribbleArrow({
  direction = 'right',
  color = 'var(--text-secondary)',
  width = 96,
  rotate = 0,
  className,
  style,
  title,
}: ScribbleArrowProps) {
  const deg = ROTATION[direction] + rotate;
  return (
    <svg
      className={className}
      viewBox="0 0 100 44"
      width={width}
      height={(width * 44) / 100}
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{
        display: 'block',
        overflow: 'visible',
        transform: `rotate(${deg}deg)`,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <g
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="scribble-draw"
      >
        <path d={PATH} />
        <path d={HEAD_A} />
        <path d={HEAD_B} />
      </g>
      <style>{`
        .scribble-draw path {
          stroke-dasharray: 140;
          stroke-dashoffset: 140;
          animation: scribble-in .55s ease-out forwards;
        }
        .scribble-draw path:nth-child(2) { animation-delay: .42s; }
        .scribble-draw path:nth-child(3) { animation-delay: .48s; }
        @keyframes scribble-in { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .scribble-draw path {
            animation: none;
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </svg>
  );
}

/** Note and arrow together, positioned absolutely over whatever it annotates. */
export function Scribble({
  children,
  color = 'var(--text-secondary)',
  size = 15,
  rotate = -4,
  direction = 'down',
  arrowWidth = 74,
  arrowRotate = 0,
  gap = 2,
  style,
}: ScribbleProps & {
  direction?: ScribbleArrowProps['direction'];
  arrowWidth?: number;
  arrowRotate?: number;
  gap?: number;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <ScribbleNote color={color} size={size} rotate={rotate}>
        {children}
      </ScribbleNote>
      <ScribbleArrow
        direction={direction}
        color={color}
        width={arrowWidth}
        rotate={arrowRotate}
      />
    </span>
  );
}

export default Scribble;
