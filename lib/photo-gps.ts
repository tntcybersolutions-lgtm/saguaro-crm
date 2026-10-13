/**
 * lib/photo-gps.ts — the GPS stamp on a jobsite photo: where the phone is when
 * the photo is added on it (in the iPhone app, or a phone's browser).
 *
 * It never holds up or fails an upload: with no location permission, no fix
 * within a few seconds, or on a desktop (office uploads are not where the photo
 * was taken), the photo saves without GPS. One fix is reused for a minute, so a
 * batch of photos asks the phone once. A photo kept on the phone while offline
 * takes its fix when it is taken (lib/offline/outbox.ts), not when it uploads.
 */
import { getCurrentPosition, isNative } from '@/lib/native';

export interface PhotoFix {
  lat: number;
  lng: number;
}

let recent: { fix: PhotoFix; at: number } | null = null;

function onPhone(): boolean {
  if (isNative()) return true;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export async function photoFix(waitMs = 6000): Promise<PhotoFix | null> {
  if (!onPhone()) return null;
  if (recent && Date.now() - recent.at < 60_000) return recent.fix;
  const pos = await Promise.race([
    getCurrentPosition(waitMs).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs + 1000)),
  ]);
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return null;
  const fix = { lat: pos.lat, lng: pos.lng };
  recent = { fix, at: Date.now() };
  return fix;
}

/** A stored lat / lng pair when both are real coordinates, else null. */
export function readFix(lat: unknown, lng: unknown): PhotoFix | null {
  const a = typeof lat === 'string' ? Number(lat) : lat;
  const b = typeof lng === 'string' ? Number(lng) : lng;
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

export const fixLabel = (f: PhotoFix) => `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`;
/** Opens Apple Maps on an iPhone, Apple Maps on the web elsewhere. */
export const fixMapUrl = (f: PhotoFix) => `https://maps.apple.com/?ll=${f.lat},${f.lng}&q=Jobsite%20photo`;
