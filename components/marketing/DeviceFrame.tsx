'use client';

/**
 * DeviceFrame — the marketing device-frame system.
 *
 * PhoneFrame: dark titanium bezel, dynamic-island notch, machined side keys,
 * subtle glass reflection. LaptopFrame: matching titanium lid + hinge deck.
 *
 * Both frames show a REAL app screenshot from /public/marketing/<file>.
 * If the asset is missing (404), the frame renders a DARK in-frame placeholder
 * telling the owner the exact filename to drop in — never a fabricated
 * light-mode UI. The app is dark; the marketing site never pretends otherwise.
 */

import React, { useEffect, useRef, useState } from 'react';

const fileOf = (src: string) => src.split('/').pop() || src;

const TITANIUM =
  'linear-gradient(150deg, #4A4A4F 0%, #232327 30%, #1A1A1E 55%, #2E2E33 100%)';

/** Screenshot with a dark "drop the real file here" fallback when it 404s. */
function ScreenMedia({ src, alt }: { src: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // SSR race: a 404 can fire the img error event BEFORE React hydrates and
  // attaches onError. Re-check the broken state after mount.
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setMissing(true);
  }, []);
  if (missing) {
    return (
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          background: '#0B0B0D', padding: '0 12%', textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 34, height: 34, borderRadius: 9,
            border: '1px dashed rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
            <circle cx="7" cy="8" r="1.6" />
            <path d="M17.5 13.5l-4.2-4.2L6 16.5" />
          </svg>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.02em' }}>
          Real app screenshot
        </div>
        <div style={{ fontSize: 10, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' }}>
          Drop{' '}
          <code style={{ color: '#FFE600', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 9.5 }}>
            {fileOf(src)}
          </code>{' '}
          into /public/marketing/
        </div>
      </div>
    );
  }
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      onError={() => setMissing(true)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/** Dark-titanium iPhone frame. height defaults to the 19.5:9-ish body ratio. */
export function PhoneFrame({ src, alt, width = 220, height }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const w = width;
  const h = height ?? Math.round(w * 2.05);
  const bezel = Math.max(6, Math.round(w * 0.032));
  const outerR = Math.round(w * 0.2);
  const innerR = outerR - bezel;
  return (
    <div
      aria-label={alt}
      style={{
        position: 'relative', width: w, height: h, borderRadius: outerR,
        background: TITANIUM, padding: bezel,
        boxShadow: '0 34px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 1px rgba(255,255,255,0.22)',
      }}
    >
      {/* machined side keys: volume (left) + power (right) */}
      <div style={{ position: 'absolute', left: -2, top: h * 0.22, width: 2.5, height: h * 0.055, borderRadius: 2, background: '#3A3A3F' }} />
      <div style={{ position: 'absolute', left: -2, top: h * 0.3, width: 2.5, height: h * 0.055, borderRadius: 2, background: '#3A3A3F' }} />
      <div style={{ position: 'absolute', right: -2, top: h * 0.26, width: 2.5, height: h * 0.09, borderRadius: 2, background: '#3A3A3F' }} />

      {/* screen */}
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: innerR, background: '#060607', overflow: 'hidden' }}>
        <ScreenMedia src={src} alt={alt} />

        {/* dynamic island */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: Math.round(w * 0.045), left: '50%', transform: 'translateX(-50%)',
            width: Math.round(w * 0.31), height: Math.round(w * 0.093), borderRadius: 999,
            background: '#000', boxShadow: '0 0 0 1px rgba(255,255,255,0.05)', zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute', right: '14%', top: '50%', transform: 'translateY(-50%)',
              width: Math.max(3, w * 0.024), height: Math.max(3, w * 0.024), borderRadius: '50%',
              background: '#101017', boxShadow: 'inset 0 0 2px rgba(90,110,160,0.8)',
            }}
          />
        </div>

        {/* subtle glass reflection */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: innerR, zIndex: 3, pointerEvents: 'none',
            background: 'linear-gradient(118deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.025) 22%, rgba(255,255,255,0) 38%)',
          }}
        />
      </div>
    </div>
  );
}

/** Matching titanium laptop: lid + camera dot + hinge deck with trackpad lip. */
export function LaptopFrame({ src, alt, width = 520, height = 330 }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const deckW = Math.round(width * 1.12);
  return (
    <div aria-label={alt} style={{ width: deckW, filter: 'drop-shadow(0 36px 60px rgba(0,0,0,0.5))' }}>
      {/* lid */}
      <div
        style={{
          position: 'relative', width, height, margin: '0 auto',
          borderRadius: '14px 14px 0 0', background: TITANIUM, padding: '9px 8px 10px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 1px rgba(255,255,255,0.2)',
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, background: '#060607', overflow: 'hidden' }}>
          <ScreenMedia src={src} alt={alt} />
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
              background: 'linear-gradient(112deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 20%, rgba(255,255,255,0) 36%)',
            }}
          />
        </div>
        {/* camera dot in the top bezel */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 3, left: '50%', transform: 'translateX(-50%)',
            width: 4, height: 4, borderRadius: '50%', background: '#101017',
            boxShadow: 'inset 0 0 1.5px rgba(90,110,160,0.8)',
          }}
        />
      </div>
      {/* hinge deck */}
      <div
        style={{
          position: 'relative', width: deckW, height: 14,
          background: 'linear-gradient(180deg, #3A3A3F 0%, #232327 45%, #141417 100%)',
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.14)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: Math.round(deckW * 0.16), height: 5, borderRadius: '0 0 6px 6px', background: '#0E0E11',
          }}
        />
      </div>
    </div>
  );
}
