'use client';

/**
 * DeviceFrame — the marketing device-frame system.
 *
 * PhoneFrame: a current-generation iPhone at true screen proportions
 * (393 × 852 CSS px, the iPhone 15/16 Pro logical size), dark titanium
 * bezel, dynamic island, machined side keys, a real iOS status bar (time,
 * cellular, Wi-Fi, battery) drawn over the capture, and a glass reflection.
 * The screen media is a 3× (1179 × 2556) image of the phone app on a demo job
 * — tools/marketing-phone-renders.mjs renders the neon set, and
 * tools/marketing-phone-shots.mjs can capture live screens to the same files —
 * so it stays crisp on Retina displays.
 *
 * LaptopFrame: matching titanium lid + hinge deck.
 *
 * If an asset is missing (404) the frame renders a DARK in-frame placeholder
 * naming the exact file to drop into /public/marketing — never a fabricated
 * light-mode UI. The app is dark; the marketing site never pretends otherwise.
 */

import React, { useEffect, useRef, useState } from 'react';

const fileOf = (src: string) => src.split('/').pop() || src;

const TITANIUM =
  'linear-gradient(150deg, #4A4A4F 0%, #232327 30%, #1A1A1E 55%, #2E2E33 100%)';

/** iPhone 15/16 Pro logical screen: 393 × 852. */
const SCREEN_RATIO = 852 / 393;

/** Screenshot with a dark "drop the real file here" fallback when it 404s. */
function ScreenMedia({ src, alt, fit = 'cover' }: { src: string; alt: string; fit?: 'cover' | 'top' }) {
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
          <code style={{ color: 'var(--brand-primary)', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 9.5 }}>
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
      decoding="async"
      onError={() => setMissing(true)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: fit === 'top' ? 'top center' : 'center', display: 'block' }}
    />
  );
}

/** The iOS status bar, drawn over the capture: 9:41, cellular, Wi-Fi, battery. */
function StatusBar({ w }: { w: number }) {
  const fs = Math.max(9, Math.round(w * 0.041));
  const pad = Math.round(w * 0.085);
  const top = Math.round(w * 0.036);
  const ih = Math.round(w * 0.03);
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', top, left: 0, right: 0, zIndex: 4, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${pad}px`, color: '#fff', fontWeight: 600, fontSize: fs, letterSpacing: '-0.01em',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        textShadow: '0 0 2px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>9:41</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(w * 0.018) }}>
        {/* cellular */}
        <svg width={ih * 1.4} height={ih} viewBox="0 0 17 12" fill="#fff">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="4.6" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="9.2" y="3" width="3" height="9" rx="0.8" />
          <rect x="13.8" y="0" width="3" height="12" rx="0.8" />
        </svg>
        {/* wi-fi */}
        <svg width={ih * 1.35} height={ih} viewBox="0 0 16 12" fill="#fff">
          <path d="M8 11.4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          <path d="M3.9 6.9a5.8 5.8 0 0 1 8.2 0l-1.2 1.2a4.1 4.1 0 0 0-5.8 0L3.9 6.9Z" />
          <path d="M.9 3.9a10 10 0 0 1 14.2 0l-1.2 1.2a8.3 8.3 0 0 0-11.8 0L.9 3.9Z" />
        </svg>
        {/* battery */}
        <svg width={ih * 2.3} height={ih} viewBox="0 0 27 12" fill="none">
          <rect x="0.6" y="0.6" width="22" height="10.8" rx="3" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
          <rect x="2.4" y="2.4" width="18.4" height="7.2" rx="1.8" fill="#fff" />
          <path d="M24.6 4v4a2.2 2.2 0 0 0 0-4Z" fill="rgba(255,255,255,0.45)" />
        </svg>
      </span>
    </div>
  );
}

/** Dark-titanium iPhone frame at the real 393 × 852 screen ratio. */
export function PhoneFrame({ src, alt, width = 220, height, statusBar = true, fit = 'top' }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Draw the iOS status bar over the capture (off if the capture has its own). */
  statusBar?: boolean;
  fit?: 'cover' | 'top';
}) {
  const w = width;
  const bezel = Math.max(6, Math.round(w * 0.03));
  const screenW = w - bezel * 2;
  const h = height ?? Math.round(screenW * SCREEN_RATIO) + bezel * 2;
  const outerR = Math.round(w * 0.19);
  const innerR = outerR - bezel;
  return (
    <div
      aria-label={alt}
      role="img"
      style={{
        position: 'relative', width: w, height: h, borderRadius: outerR,
        background: TITANIUM, padding: bezel, flexShrink: 0,
        boxShadow: '0 34px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 1px rgba(255,255,255,0.22)',
      }}
    >
      {/* machined side keys: action + volume (left), power (right) */}
      <div style={{ position: 'absolute', left: -2, top: h * 0.165, width: 2.5, height: h * 0.028, borderRadius: 2, background: '#3A3A3F' }} />
      <div style={{ position: 'absolute', left: -2, top: h * 0.225, width: 2.5, height: h * 0.055, borderRadius: 2, background: '#3A3A3F' }} />
      <div style={{ position: 'absolute', left: -2, top: h * 0.3, width: 2.5, height: h * 0.055, borderRadius: 2, background: '#3A3A3F' }} />
      <div style={{ position: 'absolute', right: -2, top: h * 0.255, width: 2.5, height: h * 0.09, borderRadius: 2, background: '#3A3A3F' }} />

      {/* screen */}
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: innerR, background: '#000', overflow: 'hidden' }}>
        <ScreenMedia src={src} alt="" fit={fit} />
        {statusBar && <StatusBar w={screenW} />}

        {/* dynamic island */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: Math.round(screenW * 0.028), left: '50%', transform: 'translateX(-50%)',
            width: Math.round(screenW * 0.32), height: Math.round(screenW * 0.094), borderRadius: 999,
            background: 'var(--bg-base)', boxShadow: '0 0 0 1px rgba(255,255,255,0.05)', zIndex: 5,
          }}
        >
          <div
            style={{
              position: 'absolute', right: '12%', top: '50%', transform: 'translateY(-50%)',
              width: Math.max(3, screenW * 0.026), height: Math.max(3, screenW * 0.026), borderRadius: '50%',
              background: '#101017', boxShadow: 'inset 0 0 2px rgba(90,110,160,0.8)',
            }}
          />
        </div>

        {/* home indicator */}
        <div
          aria-hidden
          style={{
            position: 'absolute', bottom: Math.round(screenW * 0.02), left: '50%', transform: 'translateX(-50%)',
            width: Math.round(screenW * 0.34), height: Math.max(3, Math.round(screenW * 0.012)), borderRadius: 999,
            background: 'rgba(255,255,255,0.9)', zIndex: 5,
          }}
        />

        {/* glass reflection */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: innerR, zIndex: 6, pointerEvents: 'none',
            background: 'linear-gradient(118deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 22%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 86%, rgba(255,255,255,0.04) 100%)',
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
    <div aria-label={alt} role="img" style={{ width: deckW, filter: 'drop-shadow(0 36px 60px rgba(0,0,0,0.5))' }}>
      {/* lid */}
      <div
        style={{
          position: 'relative', width, height, margin: '0 auto',
          borderRadius: '14px 14px 0 0', background: TITANIUM, padding: '9px 8px 10px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 1px rgba(255,255,255,0.2)',
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, background: '#060607', overflow: 'hidden' }}>
          <ScreenMedia src={src} alt="" fit="cover" />
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
