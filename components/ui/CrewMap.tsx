'use client';

/**
 * CrewMap — the dispatch site map + human heatmap, no tiles, no map library.
 *
 * A self-contained canvas map in a local-coordinate projection: it fits the
 * bounds of every crew pin + heat bin (padded), projects with a simple
 * equirectangular scaled by cos(midLat), and renders in order:
 *
 *   1. Heat layer — one radial-gradient blob per ~5m density bin from
 *      /api/radio/location?heatmap=1, intensity by sample count, on a
 *      gold-to-red ramp at low alpha ('lighter' compositing so overlap glows).
 *   2. Crew pins — trade-colored discs with initials + a name label,
 *      faded when the fix is stale (>5 min), an amber ring when the
 *      phone battery is under 20%, and a faint accuracy circle when the
 *      reported accuracy is visible at the current scale.
 *   3. Panic pins — pulsing red (rAF loop runs only while a panic is live).
 *
 * Plus: a computed-meters scale bar, click-a-pin (or the roster chips below
 * the canvas) to open the position in Google Maps, and an hour-window pill
 * row (Shift 10h / 24h / 7d) that drives the heatmap's &hours= query.
 *
 * Data comes in as props — the dispatch page owns the SWR polling. The static
 * scene is drawn once per data change to an offscreen canvas; the animation
 * frame loop (panic pulse only) just blits it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, MapTrifold } from '@phosphor-icons/react';
import { PremiumEmpty } from './premium';
import { Skeleton } from './Skeleton';

/* ── Palette (jet black + glass + neon yellow; canvas needs literal colors) ── */
const WHITE = '#FFFFFF';
const MUTED = '#D7DEE8';
const FAINT = '#A9B4C4';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD_HI = '#FFE600';
const RED = '#FF4D5E';
const NEST = 'rgba(255,255,255,0.03)';

/* ── Server shapes (GET /api/radio/location) ─────────────────────────────── */
export interface CrewPin {
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  trade: string | null;
  battery_level: number | null;
  updated_at: string;
}
export interface HeatBin {
  lat: number;
  lng: number;
  n: number;
}
export interface PanicPin {
  lat: number;
  lng: number;
  name?: string;
}

/* Hour windows for the heatmap query. */
const WINDOWS: { label: string; h: number }[] = [
  { label: 'Shift 10h', h: 10 },
  { label: '24h', h: 24 },
  { label: '7d', h: 168 },
];

const STALE_MS = 5 * 60000;
const LOW_BATTERY = 20;

/* Deterministic trade color — hash of the trade name into a fixed palette, so
 * any trade (canonical or custom) gets a stable, distinguishable pin color
 * without hardcoding the taxonomy here. Red is reserved for panic. */
const PIN_PALETTE = ['#FFE600', '#60A5FA', '#34D399', '#F472B6', '#A78BFA', '#FB923C', '#2DD4BF', '#E879F9', '#A3E635', '#38BDF8'];
function tradeColor(trade: string | null | undefined): string {
  if (!trade) return '#94A3B8';
  let h = 0;
  for (let i = 0; i < trade.length; i++) h = (h * 31 + trade.charCodeAt(i)) >>> 0;
  return PIN_PALETTE[h % PIN_PALETTE.length];
}

function initialsOf(name: string | null | undefined): string {
  const raw = (name || 'TM').trim();
  const base = raw.includes('@') ? raw.split('@')[0] : raw;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function shortName(name: string | null | undefined): string {
  const raw = (name || 'Team member').trim();
  const base = raw.includes('@') ? raw.split('@')[0] : raw;
  return base.length > 16 ? `${base.slice(0, 15)}…` : base;
}

function minutesAgo(iso: string): number {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : Math.max(0, Math.round((Date.now() - t) / 60000));
}

/* Brand yellow (255,230,0) -> status red (255,77,94) ramp for heat intensity t in 0..1. */
function heatRGB(t: number): string {
  const r = 255;
  const g = Math.round(230 + (77 - 230) * t);
  const b = Math.round(0 + (94 - 0) * t);
  return `${r},${g},${b}`;
}

/* Largest 1/2/5 x 10^k value <= x — scale-bar length picking. */
function niceFloor(x: number): number {
  if (!(x > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / pow;
  const nf = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return nf * pow;
}

function mapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/* Name label with a dark halo so it survives any heat behind it. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(16,16,17,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function CrewMap({
  crew,
  bins,
  samples,
  hours,
  onHoursChange,
  panics = [],
  hasProject = true,
  projects = [],
  onPickProject,
  loading = false,
  height = 380,
}: {
  crew: CrewPin[];
  bins: HeatBin[];
  /** Raw ping count behind the heat window (server `samples`). */
  samples: number;
  hours: number;
  onHoursChange: (h: number) => void;
  /** Live unresolved panic positions — rendered pulsing red. */
  panics?: PanicPin[];
  /** False when the console has no projectId — shows the teaching state. */
  hasProject?: boolean;
  /** Pickable projects for the no-project state — never make the user hand-edit a URL. */
  projects?: { id: string; name: string }[];
  onPickProject?: (id: string) => void;
  loading?: boolean;
  height?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitsRef = useRef<{ x: number; y: number; lat: number; lng: number }[]>([]);
  const [rootW, setRootW] = useState(0);

  const validCrew = useMemo(
    () => crew.filter((c) => isFinite(Number(c.latitude)) && isFinite(Number(c.longitude))),
    [crew],
  );
  const validBins = useMemo(
    () => bins.filter((b) => isFinite(Number(b.lat)) && isFinite(Number(b.lng)) && Number(b.n) > 0),
    [bins],
  );
  const validPanics = useMemo(
    () => panics.filter((p) => isFinite(Number(p.lat)) && isFinite(Number(p.lng))),
    [panics],
  );
  const hasData = validCrew.length + validBins.length + validPanics.length > 0;

  /* Track the panel's width (canvas is width-responsive, height fixed). */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setRootW(Math.round(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setRootW(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasProject]);

  const mapW = Math.max(0, rootW - 28); // 14px gutters either side

  /* ── Draw ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasData || mapW < 80) return undefined;

    const W = mapW;
    const H = height;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Fit bounds of pins + bins + panics, padded. */
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    const take = (lat: number, lng: number) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    };
    for (const c of validCrew) take(c.latitude, c.longitude);
    for (const b of validBins) take(b.lat, b.lng);
    for (const p of validPanics) take(p.lat, p.lng);

    /* Simple equirectangular in local meters, x scaled by cos(midLat). */
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    const kx = Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
    const M_LAT = 110574; // meters per degree latitude
    const M_LNG = 111320 * kx; // meters per degree longitude at midLat
    const extentX = Math.max(60, (maxLng - minLng) * M_LNG);
    const extentY = Math.max(60, (maxLat - minLat) * M_LAT);
    const PAD = 40;
    const scale = Math.min(18, Math.min((W - PAD * 2) / extentX, (H - PAD * 2) / extentY)); // px per meter
    const proj = (lat: number, lng: number) => ({
      x: W / 2 + (lng - cLng) * M_LNG * scale,
      y: H / 2 + (cLat - lat) * M_LAT * scale, // north up
    });

    /* Static scene (grid + heat + crew + scale bar) on an offscreen canvas —
     * the rAF loop only blits it and pulses the panic pins on top. */
    const base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    const bctx = base.getContext('2d');
    if (!bctx) return undefined;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Blueprint grid. */
    bctx.strokeStyle = 'rgba(255,255,255,0.04)';
    bctx.lineWidth = 1;
    for (let gx = 0.5; gx < W; gx += 44) {
      bctx.beginPath(); bctx.moveTo(gx, 0); bctx.lineTo(gx, H); bctx.stroke();
    }
    for (let gy = 0.5; gy < H; gy += 44) {
      bctx.beginPath(); bctx.moveTo(0, gy); bctx.lineTo(W, gy); bctx.stroke();
    }

    /* 1. Heat layer — gold->red radial blobs, intensity by n, low alpha. */
    if (validBins.length) {
      const maxN = validBins.reduce((m, b) => Math.max(m, Number(b.n) || 0), 1);
      const heatR = Math.max(14, Math.min(38, 8 * scale)); // ~8m footprint, clamped to stay visible
      bctx.globalCompositeOperation = 'lighter';
      for (const b of validBins) {
        const t = Math.min(1, (Number(b.n) || 0) / maxN);
        const { x, y } = proj(b.lat, b.lng);
        const rgb = heatRGB(Math.pow(t, 0.6));
        const alpha = 0.05 + 0.16 * Math.pow(t, 0.7);
        const grad = bctx.createRadialGradient(x, y, 0, x, y, heatR);
        grad.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.arc(x, y, heatR, 0, Math.PI * 2);
        bctx.fill();
      }
      bctx.globalCompositeOperation = 'source-over';
    }

    /* 2. Crew pins — trade-colored discs w/ initials, stale faded, low-battery amber ring. */
    const hits: { x: number; y: number; lat: number; lng: number }[] = [];
    const now = Date.now();
    for (const c of validCrew) {
      const { x, y } = proj(c.latitude, c.longitude);
      const stale = now - new Date(c.updated_at).getTime() > STALE_MS;
      const color = tradeColor(c.trade);
      bctx.globalAlpha = stale ? 0.38 : 1;

      const acc = Number(c.accuracy_meters) || 0;
      const accR = acc * scale;
      if (accR > 14 && accR < 240) {
        bctx.beginPath();
        bctx.arc(x, y, accR, 0, Math.PI * 2);
        bctx.strokeStyle = 'rgba(255,255,255,0.14)';
        bctx.lineWidth = 1;
        bctx.stroke();
      }

      if (c.battery_level != null && c.battery_level < LOW_BATTERY) {
        bctx.beginPath();
        bctx.arc(x, y, 15, 0, Math.PI * 2);
        bctx.strokeStyle = GOLD_HI;
        bctx.lineWidth = 2;
        bctx.stroke();
      }

      bctx.beginPath();
      bctx.arc(x, y, 11, 0, Math.PI * 2);
      bctx.fillStyle = color;
      bctx.fill();
      bctx.lineWidth = 1.5;
      bctx.strokeStyle = 'rgba(255,255,255,0.85)';
      bctx.stroke();

      bctx.font = '900 9px ui-sans-serif, system-ui, sans-serif';
      bctx.textAlign = 'center';
      bctx.textBaseline = 'middle';
      bctx.fillStyle = '#0A0A00';
      bctx.fillText(initialsOf(c.name), x, y + 0.5);

      drawLabel(bctx, shortName(c.name), x, y + 24, stale ? MUTED : 'rgba(255,255,255,0.82)');
      bctx.globalAlpha = 1;
      hits.push({ x, y, lat: c.latitude, lng: c.longitude });
    }

    /* Scale bar — computed meters, bottom-left. */
    const meters = niceFloor((W * 0.24) / scale);
    const barPx = meters * scale;
    const bx = 16;
    const by = H - 16;
    bctx.strokeStyle = 'rgba(255,255,255,0.65)';
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.moveTo(bx, by - 4); bctx.lineTo(bx, by);
    bctx.lineTo(bx + barPx, by); bctx.lineTo(bx + barPx, by - 4);
    bctx.stroke();
    bctx.font = '800 10px ui-sans-serif, system-ui, sans-serif';
    bctx.textAlign = 'left';
    bctx.textBaseline = 'alphabetic';
    bctx.fillStyle = 'rgba(255,255,255,0.65)';
    bctx.fillText(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, bx, by - 8);

    /* 3. Panic pins — pulsing red rings on top of the blitted scene. */
    for (const p of validPanics) {
      const { x, y } = proj(p.lat, p.lng);
      hits.push({ x, y, lat: p.lat, lng: p.lng });
    }
    hitsRef.current = hits;

    const render = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0, W, H);
      if (!validPanics.length) return;
      const phase = (t % 1400) / 1400;
      for (const p of validPanics) {
        const { x, y } = proj(p.lat, p.lng);
        ctx.beginPath();
        ctx.arc(x, y, 10 + phase * 16, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,77,94,${(0.55 * (1 - phase)).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = RED;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        drawLabel(ctx, 'Panic', x, y + 21, '#FF7A87');
        if (p.name) drawLabel(ctx, shortName(p.name), x, y + 33, '#FF7A87');
      }
    };

    if (validPanics.length) {
      let raf = 0;
      const tick = (t: number) => { render(t); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    render(0);
    return undefined;
  }, [validCrew, validBins, validPanics, hasData, mapW, height]);

  /* Click a pin — open the position in Google Maps. */
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: { lat: number; lng: number } | null = null;
    let bestD = 16 * 16;
    for (const h of hitsRef.current) {
      const d = (h.x - x) * (h.x - x) + (h.y - y) * (h.y - y);
      if (d <= bestD) { bestD = d; best = h; }
    }
    if (best) window.open(mapsUrl(best.lat, best.lng), '_blank', 'noopener');
  };

  if (!hasProject) {
    return (
      <div style={{ padding: '18px 20px 22px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <MapTrifold size={26} color={GOLD_HI} weight="fill" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>Pick a Project to Map</div>
        <div style={{ fontSize: 12.5, color: MUTED, maxWidth: 460, margin: '0 auto 14px' }}>
          The site map plots that crew’s live pins and shift heat.
        </div>
        {projects.length > 0 && onPickProject ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onPickProject(p.id)}
                className="pmBtn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px',
                  borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.07)',
                  color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <MapTrifold size={14} weight="fill" />{p.name}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: FAINT }}>
            No projects with radio channels yet — open a project to spin up its All Hands talkgroup.
          </div>
        )}
      </div>
    );
  }

  const windowLabel = WINDOWS.find((w) => w.h === hours)?.label || `${hours}h`;
  const legendItem = (label: string, value: React.ReactNode, accent?: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: FAINT }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: accent || WHITE, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );

  return (
    <div ref={rootRef} style={{ paddingBottom: 14 }}>
      {/* Toolbar — hour-window pills + tabular legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 14px' }}>
        <div style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)' }}>
          {WINDOWS.map((w) => (
            <button
              key={w.h}
              onClick={() => onHoursChange(w.h)}
              title={`Heatmap window — last ${w.h} hours`}
              style={{
                padding: '7px 13px', border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                background: hours === w.h ? 'rgba(255,230,0,0.16)' : 'rgba(255,255,255,0.04)',
                color: hours === w.h ? GOLD_HI : MUTED,
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          {validPanics.length > 0 && legendItem('Panic', validPanics.length, RED)}
          {legendItem('Crew', validCrew.length)}
          {legendItem('Samples', samples)}
          {legendItem('Window', windowLabel, GOLD_HI)}
        </div>
      </div>

      {/* Canvas map / skeleton / teaching empty state */}
      {hasData ? (
        <div style={{ margin: '0 14px', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, background: NEST }}>
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            title="Click a pin to open the position in Google Maps"
            style={{ display: 'block', width: '100%', height, cursor: 'pointer' }}
          />
        </div>
      ) : loading ? (
        <div style={{ padding: '0 14px' }}>
          <Skeleton height={height} borderRadius={12} />
        </div>
      ) : (
        <PremiumEmpty
          compact
          icon={<MapPin size={26} color={GOLD_HI} weight="fill" />}
          title="No positions yet"
          description="Pins appear when crews clock in with the Field app — locations are shared only on shift, with a visible indicator, and every ping feeds this heatmap. Try a wider window to see older heat."
        />
      )}

      {/* Roster — one open-in-maps link per pin */}
      {validCrew.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px 0' }}>
          {validCrew.map((c) => {
            const stale = Date.now() - new Date(c.updated_at).getTime() > STALE_MS;
            const lowBatt = c.battery_level != null && c.battery_level < LOW_BATTERY;
            return (
              <a
                key={c.user_id}
                href={mapsUrl(c.latitude, c.longitude)}
                target="_blank"
                rel="noreferrer"
                title={`Open ${shortName(c.name)}'s position in Google Maps`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
                  textDecoration: 'none', opacity: stale ? 0.55 : 1,
                }}
              >
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: tradeColor(c.trade), flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: WHITE, whiteSpace: 'nowrap' }}>{shortName(c.name)}</span>
                {c.trade && <span style={{ fontSize: 10, color: MUTED, whiteSpace: 'nowrap' }}>{c.trade}</span>}
                {lowBatt && <span style={{ fontSize: 10, fontWeight: 800, color: GOLD_HI, whiteSpace: 'nowrap' }}>{c.battery_level}%</span>}
                {stale && <span style={{ fontSize: 10, color: FAINT, whiteSpace: 'nowrap' }}>{minutesAgo(c.updated_at)}m ago</span>}
                <MapPin size={11} weight="fill" color={FAINT} />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
