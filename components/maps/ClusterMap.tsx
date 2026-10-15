'use client';
/**
 * ClusterMap — a real map with clustered pins, on the free stack: Leaflet +
 * react-leaflet over Esri World Imagery satellite tiles with place labels (free
 * to display with the attribution in the corner, no API key). Set NEXT_PUBLIC_MAP_TILE_URL (and
 * NEXT_PUBLIC_MAP_TILE_ATTRIBUTION) to point it at another tile server.
 *
 * Leaflet touches `window` on import, so NEVER import this file directly from
 * a page: load it with next/dynamic(..., { ssr: false }) — see PhotoMap /
 * JobsMapPanel.
 *
 * Pins near each other on screen merge (lib/photo-views clusterPoints, a
 * screen-grid cluster recomputed on every zoom). Tapping a merged pin zooms
 * in on its members; a pin that will not split any further (one item, or all
 * on the same spot) opens its popup instead.
 */
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { clusterPoints, boundsOf, type GeoFix, type PointCluster } from '@/lib/photo-views';

// Default: Esri World Imagery (satellite) + place labels — free to display with
// attribution and needs no API key (the CARTO basemap now demands one).
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABEL_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ? '' : 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION
  || 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const MAX_ZOOM = 19;
/* Past this zoom a merged pin opens its popup instead of zooming further. */
const SPLIT_LIMIT = 17;

/** Safe text for the pin's HTML (pins are Leaflet divIcons, built from strings). */
export function escHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface ClusterMapProps<T> {
  items: T[];
  geoOf: (t: T) => GeoFix | null;
  /** Inner HTML of a pin (escape every value with escHtml). */
  pinHtml: (c: PointCluster<T>) => string;
  /** Ring colour of a pin: 'good' (green), 'warn' (amber), 'muted'; default white. */
  pinTone?: (c: PointCluster<T>) => 'good' | 'warn' | 'muted' | undefined;
  /** What a screen reader hears for a pin. */
  pinLabel: (c: PointCluster<T>) => string;
  /** The popup for a pin that will not split further. */
  popup: (c: PointCluster<T>, close: () => void) => React.ReactNode;
  /** Re-fit the view when this changes (e.g. the filter set). */
  fitKey?: string;
  ariaLabel: string;
  height?: string;
}

const CSS = `
.cmap { position: relative; isolation: isolate; z-index: 0; width: 100%; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-solid); }
.cmap .leaflet-container { width: 100%; height: 100%; background: var(--bg-solid); font: inherit; color: var(--text-primary); }
.cmap .leaflet-control-zoom { border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--shadow-md); }
.cmap .leaflet-control-zoom a { width: 40px; height: 40px; line-height: 38px; font-size: 20px; background: var(--bg-surface); color: var(--text-primary); border-bottom: 1px solid var(--border-default); }
.cmap .leaflet-control-zoom a:hover { background: var(--bg-surface-2); color: var(--text-primary); }
.cmap .leaflet-control-zoom a.leaflet-disabled { color: var(--text-tertiary); background: var(--bg-surface); }
.cmap .leaflet-control-attribution { background: color-mix(in srgb, var(--bg-base) 82%, transparent); color: var(--text-tertiary); font-size: 12px; }
.cmap .leaflet-control-attribution a { color: var(--text-secondary); }
.cmap .leaflet-popup-content-wrapper, .cmap .leaflet-popup-tip { background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); box-shadow: var(--shadow-lg); }
.cmap .leaflet-popup-content-wrapper { border-radius: var(--radius-sm); }
.cmap .leaflet-popup-content { margin: 12px; font-size: 13px; line-height: 1.4; min-width: 0; }
.cmap .leaflet-container a.leaflet-popup-close-button { color: var(--text-secondary); width: 32px; height: 32px; font-size: 22px; line-height: 30px; }
.cmap .leaflet-container a.leaflet-popup-close-button:hover { color: var(--text-primary); }
.cmapIcon { background: none; border: 0; }
.cmapPin { position: relative; width: 52px; height: 52px; cursor: pointer; }
.cmapPin > i { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 10px; overflow: hidden; background: var(--bg-solid); border: 2px solid var(--text-primary); box-shadow: var(--shadow-lg); }
.cmapPin > i > img { width: 100%; height: 100%; object-fit: contain; display: block; }
.cmapPin > i > em { font-style: normal; font-size: 12px; font-weight: 800; color: var(--text-primary); }
.cmapPin > b { position: absolute; top: -9px; right: -9px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--bg-surface-2); border: 1px solid var(--border-strong); color: var(--text-primary); font-size: 12px; font-weight: 800; box-shadow: var(--shadow-md); }
.cmapPin[data-tone="good"] > i { border-color: var(--success); }
.cmapPin[data-tone="warn"] > i { border-color: var(--warning); }
.cmapPin[data-tone="muted"] > i { border-color: var(--border-strong); }
.cmapPin:hover > i { transform: scale(1.06); }
`;

/** Fit every pin in view once per fitKey (one pin: a street-level view). */
function FitTo({ bounds, fitKey }: { bounds: [[number, number], [number, number]] | null; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    const [[s, w], [n, e]] = bounds;
    if (Math.abs(n - s) < 1e-4 && Math.abs(e - w) < 1e-4) map.setView([(s + n) / 2, (w + e) / 2], 16);
    else map.fitBounds(L.latLngBounds([s, w], [n, e]), { padding: [48, 48], maxZoom: 16 });
    // Re-fit only when the set changes, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function ZoomWatch({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  return null;
}

function Pins<T>({ items, geoOf, pinHtml, pinTone, pinLabel, popup }: Omit<ClusterMapProps<T>, 'ariaLabel' | 'height' | 'fitKey'>) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const clusters = useMemo(() => clusterPoints(items, geoOf, zoom).map((c) => ({
    c,
    label: pinLabel(c),
    icon: L.divIcon({
      className: 'cmapIcon',
      html: `<div class="cmapPin"${pinTone?.(c) ? ` data-tone="${escHtml(pinTone(c))}"` : ''} role="img" aria-label="${escHtml(pinLabel(c))}">${pinHtml(c)}</div>`,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
      popupAnchor: [0, -28],
    }),
  })), [items, geoOf, zoom, pinHtml, pinTone, pinLabel]);
  const close = () => map.closePopup();
  return (
    <>
      <ZoomWatch onZoom={setZoom} />
      {clusters.map(({ c, label, icon }) => {
        const terminal = c.items.length === 1 || c.samePlace || zoom >= SPLIT_LIMIT;
        return (
          <Marker
            key={`${c.key}:${c.items.length}`}
            position={[c.lat, c.lng]}
            icon={icon}
            keyboard
            title={label}
            eventHandlers={terminal ? undefined : {
              click: () => {
                const [[s, w], [n, e]] = c.bounds;
                map.flyToBounds(L.latLngBounds([s, w], [n, e]), { padding: [64, 64], maxZoom: Math.min(MAX_ZOOM, Math.max(zoom + 2, SPLIT_LIMIT)) });
              },
            }}
          >
            {terminal && (
              <Popup minWidth={220} maxWidth={300} autoPanPadding={[24, 24]}>
                {popup(c, close)}
              </Popup>
            )}
          </Marker>
        );
      })}
    </>
  );
}

export default function ClusterMap<T>({ items, geoOf, pinHtml, pinTone, pinLabel, popup, fitKey, ariaLabel, height = 'clamp(320px, 56vh, 640px)' }: ClusterMapProps<T>) {
  const bounds = useMemo(() => boundsOf(items, geoOf), [items, geoOf]);
  const start = bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number] : [39.5, -98.35] as [number, number];
  return (
    <div className="cmap" style={{ height }} role="region" aria-label={ariaLabel}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <MapContainer center={start} zoom={bounds ? 12 : 4} maxZoom={MAX_ZOOM} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} attributionControl>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={MAX_ZOOM} maxNativeZoom={19} />
        {LABEL_URL && <TileLayer url={LABEL_URL} maxZoom={MAX_ZOOM} maxNativeZoom={19} />}
        <FitTo bounds={bounds} fitKey={fitKey ?? String(items.length)} />
        <Pins items={items} geoOf={geoOf} pinHtml={pinHtml} pinTone={pinTone} pinLabel={pinLabel} popup={popup} />
      </MapContainer>
    </div>
  );
}
