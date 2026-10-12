'use client';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { colors, brand, radius, font, space } from '@/lib/design-tokens';

/**
 * Signature capture.
 *
 * What was wrong before:
 *  - The signing surface was DARK (#1c1c1e) with WHITE ink, so `toDataURL`
 *    baked a dark rectangle with pale strokes into the PNG. Dropped into a pay
 *    app, a waiver or an inspection PDF — all white paper — that reads as a
 *    black box, not a signature. The surface is now light and the ink is dark,
 *    which is also what makes it legible wherever the image ends up.
 *  - The canvas bitmap was sized ONCE at mount from `parent.clientWidth`. Mount
 *    inside a panel that is not laid out yet and the bitmap is 0px wide — an
 *    invisible signature. Resize or rotate afterwards and the bitmap no longer
 *    matches the CSS box, so the ink lands offset from the finger.
 *  - Strokes lived only as pixels, so any resize destroyed them.
 *  - Mouse and touch were handled separately, a stylus not at all, and letting
 *    go outside the canvas dropped the stroke.
 *
 * Now: strokes are kept as a point model and re-rendered, the bitmap is
 * device-pixel-ratio scaled and kept in sync by a ResizeObserver, and input is
 * unified on Pointer Events with pointer capture so mouse, finger and stylus all
 * behave the same and a stroke survives leaving the element.
 */

const PAPER = brand.sand; // warm light signing surface
const INK = colors.dark; // near-black ink — legible on any document
const RULE = colors.textFaint; // muted slate — the printed rule + placeholder
const HEIGHT = 168;

type Point = { x: number; y: number };
type Stroke = Point[];

interface SignatureCanvasProps {
  /** A previously captured PNG data URL, restored onto the paper. */
  value?: string;
  /** Fires with a PNG data URL after each stroke, or '' when cleared. */
  onChange?: (dataUrl: string) => void;
  height?: number;
  disabled?: boolean;
}

export interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

/**
 * The drawing surface on its own — no buttons, no chrome. Used directly by forms
 * that capture inline (T&M tickets) and wrapped by `SignaturePad` below for
 * flows that want an explicit Save.
 */
export const SignatureCanvas = React.forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas({ value, onChange, height = HEIGHT, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Stroke[]>([]);
    const active = useRef<Stroke | null>(null);
    const restored = useRef<HTMLImageElement | null>(null);
    const [empty, setEmpty] = useState(true);

    /** Repaint paper → restored image → every stroke. The single source of truth. */
    const render = useCallback(() => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.width / dpr;
      const h = c.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, w, h);

      // Printed signature rule + ✕, so the signer knows where to sign.
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(34, h - 34);
      ctx.lineTo(w - 18, h - 34);
      ctx.stroke();
      ctx.fillStyle = RULE;
      ctx.font = `${font.weight.bold} 14px ${font.family}`;
      ctx.fillText('✕', 16, h - 30);

      if (restored.current) {
        ctx.drawImage(restored.current, 0, 0, w, h);
      }

      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const all = active.current ? [...strokes.current, active.current] : strokes.current;
      for (const s of all) {
        if (s.length === 0) continue;
        ctx.beginPath();
        if (s.length === 1) {
          // A deliberate dot (period, i-dot) still has to render.
          ctx.arc(s[0].x, s[0].y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
          continue;
        }
        ctx.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.stroke();
      }
    }, []);

    /** Size the bitmap to the element's real CSS box at the device pixel ratio. */
    const resize = useCallback(() => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height || height));
      if (c.width === w * dpr && c.height === h * dpr) return;
      c.width = w * dpr;
      c.height = h * dpr;
      render();
    }, [height, render]);

    useEffect(() => {
      resize();
      const c = canvasRef.current;
      if (!c || typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
      }
      const ro = new ResizeObserver(resize);
      ro.observe(c);
      return () => ro.disconnect();
    }, [resize]);

    // Restore a stored signature. Runs on every `value` change — the old version
    // ran once on mount with an empty dep array, so a signature that arrived with
    // an async fetch (which is every reload) never appeared.
    useEffect(() => {
      if (!value) {
        restored.current = null;
        setEmpty(strokes.current.length === 0);
        render();
        return;
      }
      let alive = true;
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        restored.current = img;
        setEmpty(false);
        render();
      };
      img.src = value;
      return () => { alive = false; };
    }, [value, render]);

    const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const c = canvasRef.current!;
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const emit = useCallback(() => {
      const c = canvasRef.current;
      if (c && onChange) onChange(c.toDataURL('image/png'));
    }, [onChange]);

    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      // Capture so the stroke keeps tracking when the pointer leaves the canvas.
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = [pointFrom(e)];
      render();
    };

    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || !active.current) return;
      active.current.push(pointFrom(e));
      render();
    };

    const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!active.current) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      strokes.current = [...strokes.current, active.current];
      active.current = null;
      setEmpty(false);
      render();
      emit();
    };

    const clear = useCallback(() => {
      strokes.current = [];
      active.current = null;
      restored.current = null;
      setEmpty(true);
      render();
      onChange?.('');
    }, [onChange, render]);

    React.useImperativeHandle(ref, () => ({
      clear,
      isEmpty: () => strokes.current.length === 0 && !restored.current,
      toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    }), [clear]);

    return (
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height,
            background: PAPER,
            borderRadius: radius.lg,
            // touch-action must sit on the element that receives the pointer, or
            // the browser scrolls the page instead of letting the user sign.
            touchAction: 'none',
            cursor: disabled ? 'not-allowed' : 'crosshair',
          }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {empty && (
          <span
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '38%',
              textAlign: 'center',
              pointerEvents: 'none',
              color: RULE,
              fontSize: font.size.md,
              fontWeight: font.weight.medium,
            }}
          >
            Sign above the line
          </span>
        )}
      </div>
    );
  },
);

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  label?: string;
  /** An existing signature to show; the pad opens with it already on the paper. */
  value?: string;
}

/** Framed pad with uniform Clear / Cancel / Save. */
export default function SignaturePad({ onSave, onCancel, label = 'Signature', value }: SignaturePadProps) {
  const padRef = useRef<SignatureCanvasHandle>(null);
  const [dirty, setDirty] = useState(!!value);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setError('Draw a signature before saving.');
      return;
    }
    const data = pad.toDataURL();
    if (!data || data.length < 128) {
      setError("The signature image came back empty — try signing again.");
      return;
    }
    setError(null);
    onSave(data);
  };

  return (
    <div
      style={{
        background: colors.raised,
        border: `1px solid ${colors.border}`,
        borderRadius: radius['2xl'],
        padding: space.md,
        marginBottom: space.md,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <p
        style={{
          margin: `0 0 ${space.sm}px`,
          fontSize: font.size.xs,
          fontWeight: font.weight.black,
          color: 'var(--text-primary)',
        }}
      >
        {label}
      </p>

      <div style={{ borderRadius: radius.lg, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
        <SignatureCanvas
          ref={padRef}
          value={value}
          onChange={(d) => { setDirty(!!d); if (d) setError(null); }}
        />
      </div>

      <p style={{ margin: `${space.sm}px 0 0`, fontSize: font.size.xs, color: colors.textDim }}>
        Draw your signature with a mouse, finger or stylus. This image is stored as the signature of record.
      </p>
      {error && (
        <p style={{ margin: `${space.xs}px 0 0`, fontSize: font.size.sm, color: colors.red, fontWeight: font.weight.bold }}>
          {error}
        </p>
      )}

      {/* Uniform controls: same height, same radius, same padding — only the material differs. */}
      <div style={{ display: 'flex', gap: space.sm, marginTop: space.md }}>
        <button type="button" onClick={() => { padRef.current?.clear(); setDirty(false); setError(null); }} style={btn('ghost')}>
          Clear
        </button>
        <button type="button" onClick={onCancel} style={btn('danger')}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!dirty} style={btn(dirty ? 'gold' : 'off')}>
          Save Signature
        </button>
      </div>
    </div>
  );
}

function btn(kind: 'ghost' | 'danger' | 'gold' | 'off'): React.CSSProperties {
  const base: React.CSSProperties = {
    flex: 1,
    height: 42,
    borderRadius: radius.lg,
    fontSize: font.size.md,
    fontWeight: font.weight.bold,
    cursor: kind === 'off' ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (kind === 'gold') {
    return { ...base, background: colors.gold, border: `1px solid ${colors.goldBorder}`, color: colors.black, fontWeight: font.weight.black };
  }
  if (kind === 'danger') {
    return { ...base, background: 'transparent', border: `1px solid ${colors.border}`, color: colors.red };
  }
  if (kind === 'off') {
    return { ...base, background: colors.raisedAlt, border: `1px solid ${colors.borderDim}`, color: colors.textFaint };
  }
  return { ...base, background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textMuted };
}
