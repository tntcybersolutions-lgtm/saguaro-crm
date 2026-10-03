'use client';
/**
 * Saguaro Radio — web dispatch console v2.
 *
 * Left rail: talkgroups (project + org-wide) with monitor toggles, member
 * counts, presence ("on channel") and unread badges (v2 channel fields),
 * last-traffic preview, inline New Channel form. Main: live channel feed —
 * Supabase Realtime postgres_changes INSERT on the active channel triggers an
 * immediate SWR revalidate, with polling as the safety net (15s while the
 * socket is SUBSCRIBED, 4s otherwise) — voice clips with pseudo-waveform
 * players + transcript/translation (EN/ES, persisted under 'sag_lang'), amber
 * alerts, red panic rows with a numbered location trail, a NOW-TRANSMITTING /
 * NOW-PLAYING gold band with animated equalizer plus an analog S/RF meter
 * (needle driven by real Web Audio levels when taps are available — mic
 * AnalyserNode while keyed, media-element AnalyserNode while playing — and
 * by honest synthesized/seeded envelopes otherwise), "Catch me up"
 * sequential playback of unheard clips, and a hover "File to log" action
 * per row.
 *
 * PTT: browser hold-to-talk (MediaRecorder webm/opus, feature-detected) via
 * the mic button OR hold-SPACEBAR anywhere outside a text field (keydown keys
 * up, keyup transmits). Hold-to-confirm PANIC fans out push/email/SMS.
 *
 * Server layer: /api/radio/channels · /api/radio/messages · /api/radio/voice ·
 * /api/radio/panic · /api/radio/file-to-log. Accepts ?projectId= and ?channel=
 * search params read on mount (house pattern — no Suspense gate). Read/presence
 * piggyback (radio_members.last_seen_at/last_read_at) rides the GETs server-side.
 *
 * The monitor toggle is a per-browser dispatch preference (localStorage
 * 'sag_radio_mon') layered over the server membership flag. Heard voice clips
 * are tracked per-browser under 'sag_radio_heard' (capped at 500 ids).
 *
 * Tier-1 dispatch controls: assistance queue (SWR 10s; one-click ack /
 * resolve w/ header badge), channel roster w/ call signs + presence (GET
 * ?roster= / POST profile), patch board (two-channel bridge w/ release;
 * mirrored rows tagged 'via <channel>'), priority-channel star, tone
 * signaling (ACK / NEG / COME IN — WebAudio beeps at distinct frequencies),
 * and the recording console (date range + search + print-ready record).
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { safeJsonParse } from '@/lib/safe-json';
import useSWR from 'swr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  Broadcast,
  Microphone,
  Siren,
  Waveform,
  WaveformSlash,
  UsersThree,
  Plus,
  PaperPlaneRight,
  Warning,
  MapPin,
  Hash,
  ChatCircleText,
  SpeakerHigh,
  Play,
  Pause,
  FastForward,
  ClipboardText,
  Check,
  Paperclip,
  ShareNetwork,
  Copy,
  Trash,
  X,
  MapTrifold,
  CaretDown,
} from '@phosphor-icons/react';
import {
  PremiumSurface,
  ModuleHero,
  PremiumEmpty,
  goldButtonStyle,
  goldOutlineButtonStyle,
} from '@/components/ui/premium';
import { Skeleton } from '@/components/ui/Skeleton';
import { SMeter } from '@/components/ui/SMeter';
import { CrewMap, type CrewPin, type HeatBin } from '@/components/ui/CrewMap';
import { HAS_SUPABASE, getSupabaseBrowser, ensureBrowserSession, getSession } from '@/lib/supabase-browser';
/* Tier-1 dispatch console additions (separate import statement so the block
 * above stays byte-stable for parallel workstreams). */
import {
  Star,
  Printer,
  PlugsConnected,
  Lifebuoy,
  BellRinging,
  ClockCounterClockwise,
  MagnifyingGlass,
  PencilSimple,
  DotsThree,
  Megaphone,
  Lock,
  LockOpen,
  UserPlus,
} from '@phosphor-icons/react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
/* "Make a record" — radio → tracked project record. Separate import block so
 * the two above stay byte-stable for parallel workstreams. */
import {
  Question,
  ListChecks,
  WarningOctagon,
  Notebook,
  NotePencil,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { moduleAccent } from '@/lib/module-identity';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import {
  PROMOTE_RECORD_TYPES,
  DAILY_LOG_SECTIONS,
  TRANSCRIPT_PENDING_NOTE,
  localLogDate,
  titleFrom,
  type PromoteRecordType,
} from '@/lib/radio-promote';

/* ── Palette (dark shell: white/gold alphas only) ─────────────────────── */
const WHITE = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.42)';
const BORDER = 'rgba(255,255,255,0.08)';
const FIELD_BG = 'rgba(255,255,255,0.04)';
const FIELD_BORDER = '1px solid rgba(255,255,255,0.10)';
const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const RED = '#EF4444';
const RED_SOFT = 'rgba(239,68,68,0.14)';
const RED_BORDER = 'rgba(239,68,68,0.45)';
const AMBER_SOFT = 'var(--brand-primary-12)';
const AMBER_BORDER = 'var(--brand-primary-35)';
const GREEN = '#45B37D';
const GREEN_SOFT = 'rgba(69,179,125,0.15)';
const GREEN_BORDER = 'rgba(69,179,125,0.5)';
const NEST = 'rgba(20,20,22,0.55)';

/* ── Types (mirror the server layer; v2 fields optional — render only when present) */
interface RadioChannel {
  id: string;
  project_id: string | null;
  /** Project display name — rides the list GET when the server provides it. */
  project_name?: string | null;
  name: string;
  kind: 'project' | 'custom' | 'direct';
  allow_subs: boolean;
  members: number;
  monitoring: boolean;
  /** v2: members seen on this channel in the last few minutes (presence). */
  onChannel?: number;
  /** v2: traffic since the caller's last_read_at. */
  unread?: number;
  /** Tier-1: dispatcher-invite-only channel (invisible to non-members). */
  locked?: boolean;
  /** Tier-1: priority channel — interrupts scanning first. */
  priority?: boolean;
  lastMessage: { kind: string; body: string | null; sender: string | null; at: string; secs: number | null } | null;
}
interface RadioMessage {
  id: string;
  kind: 'voice' | 'text' | 'image' | 'alert' | 'panic' | 'tone';
  body: string | null;
  sender_name: string | null;
  sender_user_id: string | null;
  audio_url: string | null;
  audio_duration_secs: number | null;
  image_url: string | null;
  transcript: string | null;
  translations: { en?: string; es?: string } | null;
  detected_lang: string | null;
  location: { lat: number; lng: number } | null;
  /** v2: breadcrumb positions appended while a panic is live. */
  location_trail?: { lat: number; lng: number; at?: string }[] | null;
  /** v2: set when a dispatcher stands the panic down. */
  panic_resolved_at?: string | null;
  /** v2: members who have seen this row (from read piggyback), when computed. */
  seen_count?: number | null;
  /** Tier-1: source channel id when this row was mirrored through a patch. */
  patched_from?: string | null;
  /** R13 heard-by: who has played this clip (migration 063; absent pre-migration). */
  receipts?: { user_id?: string | null; portal_sub_id?: string | null; display_name?: string | null; action?: string | null; created_at?: string }[] | null;
  /** R13 heard-by: who was live on the channel at send time (snapshot). */
  present_at_send?: { user_id?: string | null; portal_sub_id?: string | null; name?: string | null }[] | null;
  created_at: string;
}
/** Guest sharing link (staff rows from GET /api/radio/guest?channelId=). */
interface GuestLink {
  id: string;
  token: string;
  label: string | null;
  can_talk: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
/** Assistance request (rows from GET /api/radio/assist). */
interface AssistRow {
  id: string;
  channel_id: string | null;
  project_id: string | null;
  requester_user_id: string | null;
  requester_name: string | null;
  note: string | null;
  location: { lat: number; lng: number } | null;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}
/** Channel roster row (GET /api/radio/channels?roster=). */
interface RosterMember {
  /** radio_members row id — present once the server exposes it; remove needs it. */
  id?: string | null;
  user_id: string | null;
  portal_sub_id?: string | null;
  display_name: string | null;
  call_sign: string | null;
  presence_status: 'available' | 'busy' | 'on_route' | 'off' | null;
  role: string | null;
  last_seen_at: string | null;
}
/** Directory person (GET /api/radio/channels?directory=1 → {staff, subs}).
 * Field names tolerated in both camelCase and snake_case so the console
 * survives server drift; ids resolve through the helpers below. */
interface DirectoryPerson {
  userId?: string | null;
  user_id?: string | null;
  portalSubId?: string | null;
  portal_sub_id?: string | null;
  name?: string | null;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
  company?: string | null;
}
const personUserId = (p: DirectoryPerson) => p.userId || p.user_id || null;
const personSubId = (p: DirectoryPerson) => p.portalSubId || p.portal_sub_id || null;
const personKey = (p: DirectoryPerson) => {
  const u = personUserId(p), s = personSubId(p);
  return u ? `u:${u}` : s ? `s:${s}` : `x:${p.email || p.name || p.display_name || 'unknown'}`;
};
const personName = (p: DirectoryPerson) =>
  String(p.name || p.display_name || p.email || 'Team member').trim() || 'Team member';
/* ── Transmit outbox ───────────────────────────────────────────────────────
 * A recorded clip is the user's words. It is never held only in memory and it
 * is never dropped on a failed POST: it is written to IndexedDB the instant
 * the key is released, retried with backoff, replayed on reconnect and on the
 * next page load, and surfaced as a feed row with RETRY / DISCARD if delivery
 * keeps failing. Degrades to memory-only where IndexedDB is unavailable. */
type TxState = 'sending' | 'queued' | 'failed';
interface OutboxClip {
  localId: string;
  channelId: string;
  channelName: string;
  secs: number;
  mime: string;
  ext: string;
  bytes: number;
  createdAt: number;
  blob: Blob;
}
interface PendingTx extends OutboxClip {
  status: TxState;
  attempts: number;
  error?: string | null;
}
/** One key-down to key-up recording. Self-contained on purpose: a fast
 *  press-release-press must never let take #2 overwrite take #1's buffer or
 *  start stamp while take #1's async onstop is still in flight. */
interface Take {
  rec: MediaRecorder;
  chunks: BlobPart[];
  startedAt: number;
  channelId: string;
  channelName: string;
}
const OUTBOX_DB = 'sag_radio_outbox';
const OUTBOX_STORE = 'clips';
function outboxOpen(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(OUTBOX_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'localId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function outboxPut(rec: OutboxClip) {
  const db = await outboxOpen();
  if (!db) return;
  try { db.transaction(OUTBOX_STORE, 'readwrite').objectStore(OUTBOX_STORE).put(rec); } catch { /* memory-only */ }
}
async function outboxDelete(localId: string) {
  const db = await outboxOpen();
  if (!db) return;
  try { db.transaction(OUTBOX_STORE, 'readwrite').objectStore(OUTBOX_STORE).delete(localId); } catch { /* memory-only */ }
}
function outboxAll(): Promise<OutboxClip[]> {
  return outboxOpen().then((db) => new Promise<OutboxClip[]>((resolve) => {
    if (!db) { resolve([]); return; }
    try {
      const req = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as OutboxClip[];
        resolve(rows.filter((r) => r && r.blob instanceof Blob && r.blob.size > 0));
      };
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  }));
}
/** Turn a getUserMedia rejection into something a dispatcher can act on. */
function micErrorText(e: unknown): string {
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name || '') : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Mic blocked — allow microphone access for this site, then key again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found — connect one, then key again.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Mic busy — another tab or app is holding it. Close it, then key again.';
  return 'Mic did not open — press the key again to retry.';
}

/** Live channel patch (rides the channels GET as `patches`). */
interface ActivePatch {
  id: string;
  channel_a: string;
  channel_b: string;
  created_at?: string;
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const isToday = (iso: string) => {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const secsLabel = (s: number | null | undefined) => (s ? `${Math.max(1, Math.round(s))}s` : '');
const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/* Attachments — mirror /api/radio/media's accept list and 50MB cap so a bad
 * pick fails instantly in the tray instead of round-tripping to a 4xx. */
const MEDIA_OK = /\.(png|jpe?g|webp|heic|gif|pdf|mp4|mov|webm)$/i;
const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const MEDIA_ACCEPT =
  'image/png,image/jpeg,image/webp,image/heic,image/gif,.png,.jpg,.jpeg,.webp,.heic,.gif,' +
  'application/pdf,.pdf,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
const senderShort = (name: string | null) => {
  const n = (name || 'Unknown').trim();
  return n.includes('@') ? n.split('@')[0] : n;
};
const initialsOf = (name: string | null) => {
  const n = senderShort(name);
  return n.slice(0, 2).toUpperCase();
};

/* Monitor preference (per-browser dispatch board state). */
const MON_KEY = 'sag_radio_mon';
function readMonOverrides(): Record<string, boolean> {
  try { return JSON.parse(window.localStorage.getItem(MON_KEY) || '{}') || {}; } catch { return {}; }
}

/* Heard voice clips (per-browser; capped so localStorage never balloons). */
const HEARD_KEY = 'sag_radio_heard';
function readHeard(): string[] {
  try {
    const a = safeJsonParse<any[]>(window.localStorage.getItem(HEARD_KEY), []);
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

/* Deterministic pseudo-waveform heights (FNV-ish hash of the message id). */
function waveHeights(id: string, n: number): number[] {
  let h = 2166136261;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= id.charCodeAt(i % Math.max(1, id.length)) + i * 131;
    h = Math.imul(h, 16777619);
    out.push(0.2 + ((Math.abs(h) % 1000) / 1000) * 0.8);
  }
  return out;
}

/* RMS of an analyser's current time-domain frame, soft-kneed onto the S/RF
 * meter's 0..1 scale (speech RMS lives around 0.03-0.3; the curve keeps the
 * needle lively across normal voice levels). */
function levelFromAnalyser(an: AnalyserNode): number {
  const buf = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length);
  return Math.min(1, Math.pow(rms * 3.5, 0.6));
}

/* Animated equalizer bars (gold, staggered) — the ON AIR heartbeat. */
function EqBars({ color = GOLD_HI, size = 14 }: { color?: string; size?: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: size, flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: 3, height: size, borderRadius: 2, background: color, transformOrigin: 'bottom',
            animation: `sagRadioEq ${0.7 + (i % 3) * 0.18}s ease-in-out ${i * 0.09}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

/* Vivid gold module chip — the platform icon standard: a saturated gold plate
 * (bright-to-deep gradient) with a ring + soft glow and a near-white glyph ON
 * the color. Never gold-on-gold. Radio stays in the gold family. */
function VividGoldChip({
  icon,
  size = 40,
  style,
}: { icon: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0, width: size, height: size, borderRadius: Math.round(size * 0.29),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(145deg, ${GOLD_HI} 0%, ${GOLD} 52%, #B45309 100%)`,
        border: '1px solid color-mix(in srgb, var(--brand-primary-strong) 55%, transparent)',
        boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand-primary) 16%, transparent), 0 10px 26px -10px color-mix(in srgb, var(--brand-primary) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.40)',
        color: '#F8FAFC',
        ...style,
      }}
    >
      {icon}
    </span>
  );
}

/* Decorative tuning-band strip for the standby radio face — pure SVG in the
 * S/RF meter's family look (dark face + hairline bezel, white ticks, a red
 * top-band segment, gold needle, glass highlight). The "frequency" is seeded
 * from the active channel id so every channel holds its own spot on the band.
 * Purely decorative — no real RF here. */
function FrequencyDial({ seed }: { seed: string }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const frac = 0.06 + ((Math.abs(h) % 1000) / 1000) * 0.88;
  const W = 760, H = 92, L = 34, R = 726;
  const xAt = (f: number) => L + f * (R - L);
  const nx = xAt(frac);
  const ticks = Array.from({ length: 41 }, (_, i) => i / 40);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`sagDialFace-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17171C" />
          <stop offset="1" stopColor="#0B0B0E" />
        </linearGradient>
        <linearGradient id={`sagDialGlass-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.09)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={`sagDialNeedle-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GOLD_HI} />
          <stop offset="1" stopColor={GOLD} />
        </linearGradient>
      </defs>
      {/* Bezel + face */}
      <rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} rx={16} fill="#18181E" stroke="rgba(255,255,255,0.13)" strokeWidth={1} />
      <rect x={6} y={6} width={W - 12} height={H - 12} rx={12} fill={`url(#sagDialFace-${uid})`} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      {/* Band line — white span + red top segment (the S-meter split) */}
      <line x1={L} y1={22} x2={xAt(0.86)} y2={22} stroke="rgba(255,255,255,0.40)" strokeWidth={1.4} />
      <line x1={xAt(0.86)} y1={22} x2={R} y2={22} stroke={RED} strokeWidth={3} />
      {/* Ticks + MHz numerals */}
      {ticks.map((f, i) => (
        <line
          key={i}
          x1={xAt(f)} y1={24} x2={xAt(f)} y2={i % 5 === 0 ? 44 : 35}
          stroke={f >= 0.86 ? 'rgba(248,113,113,0.75)' : i % 5 === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.40)'}
          strokeWidth={i % 5 === 0 ? 1.6 : 1}
        />
      ))}
      {[0, 10, 20, 30, 40].map((i) => (
        <text key={i} x={xAt(i / 40)} y={58} textAnchor="middle" fontSize={11} fontWeight={700} fill={i === 40 ? '#F87171' : 'rgba(255,255,255,0.62)'}>
          {(26.9 + (i / 40) * 0.5).toFixed(1)}
        </text>
      ))}
      {/* Legend + standby lamp */}
      <text x={W / 2} y={78} textAnchor="middle" fontSize={9} fontWeight={800} fill="rgba(255,255,255,0.46)">
        FREQ — MHZ
      </text>
      <circle cx={30} cy={74} r={8.5} fill={GOLD_HI} opacity={0.16} />
      <circle cx={30} cy={74} r={4.2} fill={GOLD_HI} stroke="rgba(255,255,255,0.30)" strokeWidth={0.8} />
      <text x={40} y={77} fontSize={7.5} fontWeight={800} fill={GOLD_HI}>Stby</text>
      {/* Needle — seeded per channel */}
      <rect x={nx - 5} y={12} width={10} height={56} rx={4} fill={GOLD} opacity={0.14} />
      <line x1={nx} y1={12} x2={nx} y2={66} stroke={`url(#sagDialNeedle-${uid})`} strokeWidth={2.4} strokeLinecap="round" />
      <path d={`M ${nx - 4} 12 L ${nx + 4} 12 L ${nx} 19 Z`} fill={GOLD_HI} />
      {/* Glass highlight */}
      <path d={`M 6 6 H ${W - 6} V 34 Q ${W / 2} 52 6 34 Z`} fill={`url(#sagDialGlass-${uid})`} pointerEvents="none" />
    </svg>
  );
}

/* One-line preview of a channel's last transmission (standby panel). */
const trafficPreview = (lm: NonNullable<RadioChannel['lastMessage']>) =>
  lm.kind === 'voice' ? `PTT ${secsLabel(lm.secs)}`
    : lm.kind === 'panic' ? 'Panic Alarm'
    : lm.kind === 'image' ? 'Photo'
    : lm.kind === 'tone' ? 'Tone'
    : (lm.body || '').slice(0, 80) || 'Traffic';
const whenLabel = (iso: string) =>
  isToday(iso) ? timeOf(iso) : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

const rowActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
  color: MUTED, fontSize: 10.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
};

/* ── Machined toolbar kit — the ONE secondary-control geometry (32px). No
 * mismatched pills: buttons stand alone or fuse into segmented groups with
 * hairline dividers, tertiary actions live behind the overflow menu, and
 * primary actions keep the gold pmBtn tier. */
/* ONE header-control height. The channel selector, the roster selector, the
 * patch/broadcast group and the overflow button all sit on this line — no
 * mismatched pills, no control that reads as an afterthought. */
const TOOL_H = 40;
const toolBtnStyle = (on: boolean, enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: TOOL_H, padding: '0 12px', borderRadius: 9, boxSizing: 'border-box',
  background: on ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 28%, transparent), var(--brand-primary-12))' : FIELD_BG,
  border: on ? `1px solid ${AMBER_BORDER}` : FIELD_BORDER,
  color: on ? GOLD_HI : MUTED, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
  cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.45,
});
/** The one 26px icon-toggle geometry (channel row controls, row affordances). */
const miniBtnStyle = (on: boolean): React.CSSProperties => ({
  flexShrink: 0, width: 26, height: 26, borderRadius: 8, padding: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: on ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'rgba(255,255,255,0.04)',
  border: on ? '1px solid var(--brand-primary-35)' : `1px solid ${BORDER}`,
  color: on ? GOLD_HI : FAINT, cursor: 'pointer',
});
/** Close/dismiss glyph button — same everywhere, no bespoke variants. */
const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: FAINT, cursor: 'pointer',
  padding: 2, display: 'inline-flex', flexShrink: 0,
};
const toolGroupStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'stretch', height: TOOL_H, borderRadius: 9,
  border: FIELD_BORDER, background: FIELD_BG, overflow: 'hidden',
};
const toolSegStyle = (on: boolean, enabled: boolean, divider: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: '100%', padding: '0 12px', border: 'none', borderRadius: 0,
  borderLeft: divider ? `1px solid ${BORDER}` : 'none',
  background: on ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 28%, transparent), var(--brand-primary-12))' : 'transparent',
  color: on ? GOLD_HI : MUTED, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
  cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.45,
});
/* Kit popover / menu / modal shells — one look everywhere. */
const popoverStyle = (width: number): React.CSSProperties => ({
  position: 'absolute', right: 0, top: 'calc(100% + 10px)', width, zIndex: 50,
  background: 'rgba(24,24,27,0.98)', border: `1px solid ${AMBER_BORDER}`,
  borderRadius: 14, boxShadow: '0 22px 48px rgba(12,12,16,0.65)',
  padding: 14, textAlign: 'left',
});
const menuItemStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 9, width: '100%', boxSizing: 'border-box',
  height: 34, padding: '0 10px', borderRadius: 9, background: 'transparent', border: 'none',
  color: enabled ? WHITE : FAINT, fontSize: 12.5, fontWeight: 700, textAlign: 'left',
  cursor: enabled ? 'pointer' : 'default', whiteSpace: 'nowrap',
});
const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  background: FIELD_BG, border: FIELD_BORDER, borderRadius: 10,
  color: WHITE, fontSize: 12.5, outline: 'none',
};
const eyebrowStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: FAINT,
};

/* ── Dialog ────────────────────────────────────────────────────────────────
 * Every secondary surface in this console is one of these: a fixed-height
 * card with a pinned header, a pinned footer, and EXACTLY ONE scroll region
 * between them. No capped 150px portholes, no popover inside a popover, no
 * list that scrolls inside a panel that scrolls inside a page that scrolls. */
function Dialog({
  open, onClose, title, icon, width = 520, footer, className, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, overflow: 'hidden',
        background: 'rgba(10,10,14,0.74)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 16px',
      }}
    >
      <div
        style={{
          width: `min(${width}px, 100%)`, maxHeight: '90vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRadius: 16, background: 'rgba(20,20,23,0.99)',
          border: `1px solid ${AMBER_BORDER}`, boxShadow: '0 28px 64px rgba(8,8,12,0.72)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {icon}
          <span style={{ fontSize: 11, fontWeight: 900, color: GOLD_HI, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </span>
          <button onClick={onClose} aria-label="Close" style={closeBtnStyle}><X size={15} weight="bold" /></button>
        </div>
        {/* ── the one scroll region ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>{children}</div>
        {footer && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dropdown ──────────────────────────────────────────────────────────────
 * The channel and roster selectors. Anchored, capped by viewport height, with
 * a pinned head and ONE scroll region — a real select, not a rail. */
function Dropdown({
  open, onClose, anchorRef, width, children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 60,
        width: `min(${width}px, calc(100vw - 48px))`, maxHeight: 'min(62vh, 560px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'rgba(20,20,23,0.99)', border: `1px solid ${AMBER_BORDER}`,
        borderRadius: 14, boxShadow: '0 24px 52px rgba(8,8,12,0.7)', textAlign: 'left',
      }}
    >
      {children}
    </div>
  );
}

/** One labeled control in the "Make a record" form. Two-column grid; `wide`
 * takes the whole row. Kit geometry only — no bespoke field chrome. */
function PromoteField({ label, hint, wide, children }: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block', minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ ...eyebrowStyle, display: 'block', marginBottom: 5 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 10.5, color: FAINT, marginTop: 4, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

/* Tone signaling — labels, colors, and distinct WebAudio beep frequencies. */
const TONES: Record<string, { label: string; color: string; border: string; soft: string; freq: number; hold: number }> = {
  ack: { label: 'Ack', color: GREEN, border: GREEN_BORDER, soft: GREEN_SOFT, freq: 880, hold: 0.22 },
  negative: { label: 'Negative', color: RED, border: RED_BORDER, soft: RED_SOFT, freq: 294, hold: 0.3 },
  comein: { label: 'Come In', color: GOLD_HI, border: AMBER_BORDER, soft: AMBER_SOFT, freq: 587, hold: 0.45 },
};

/* Presence status — roster dot colors + labels (server enum). */
const PRESENCE: Record<string, { label: string; color: string }> = {
  available: { label: 'Available', color: GREEN },
  busy: { label: 'Busy', color: RED },
  on_route: { label: 'On Route', color: GOLD_HI },
  off: { label: 'Off', color: FAINT },
};

/* ── Radio → tracked record ("Make a record") ──────────────────────────────
 * THE WEDGE. A transmission is promotable, in one tap, into an RFI, a punch
 * item, a field issue, or a daily-log entry — with the ORIGINAL AUDIO attached
 * as evidence. A super says "the footing depth is wrong on grid line C" and it
 * becomes a real RFI carrying his actual voice.
 *
 * The server (lib/radio-promote + /api/radio/promote) owns numbering,
 * provenance shaping, the audio storage PATH (never a signed URL) and the
 * duplicate guard. This console owns the picking, the typing, and the honesty.
 *
 * HONESTY, held here: transcription is env-gated on OPENAI_API_KEY, which is
 * not configured — every voice message in production has transcript NULL. So
 * nothing in this flow depends on a transcript. When one exists it seeds the
 * summary; when it does not, the box starts empty on purpose, the dispatcher
 * types what was said, and the clip is the evidence. An absent transcript is
 * never drawn as a failed read. */
interface PromoteLink {
  id: string;
  recordType: PromoteRecordType;
  recordId: string;
  recordLabel: string;
  createdAt?: string | null;
  createdByName?: string | null;
  href?: string | null;
}
/** The four targets, each wearing its own module's accent (lib/module-identity). */
const PROMOTE_META: Record<PromoteRecordType, { label: string; blurb: string; accentKey: string; icon: React.ReactNode }> = {
  rfi:         { label: 'RFI', blurb: 'Ask the architect', accentKey: 'rfis', icon: <Question size={16} weight="bold" /> },
  punch:       { label: 'Punch Item', blurb: 'Something to fix', accentKey: 'punch', icon: <ListChecks size={16} weight="bold" /> },
  field_issue: { label: 'Field Issue', blurb: 'Problem on site', accentKey: 'fieldissues', icon: <WarningOctagon size={16} weight="bold" /> },
  daily_log:   { label: 'Daily Log', blurb: 'Log it for the day', accentKey: 'daily', icon: <Notebook size={16} weight="bold" /> },
};
const promoteAccent = (t: PromoteRecordType) => moduleAccent(PROMOTE_META[t].accentKey);
/** Daily-log columns the server will accept, in its own order. */
const DAILY_LOG_SECTION_LABELS: Record<string, string> = {
  work_performed: 'Work Performed',
  delays: 'Delays',
  safety_notes: 'Safety Notes',
  visitors: 'Visitors',
  materials_delivered: 'Materials Delivered',
  quality_issues: 'Quality Issues',
  notes: 'Notes',
};
/** Stored lowercase, displayed capitalized — the platform-wide convention. */
const PROMOTE_PRIORITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const PROMOTE_TRADE_DEFAULT = 'General Contractor';
interface PromoteForm {
  title: string;
  summary: string;
  priority: string;
  due: string;
  location: string;
  trade: string;
  section: string;
  logDate: string;
}
const emptyPromoteForm = (): PromoteForm => ({
  title: '', summary: '', priority: 'medium', due: '',
  location: '', trade: PROMOTE_TRADE_DEFAULT, section: 'work_performed', logDate: '',
});
/** How many of the newest transmissions hydrate their record chips on load.
 * GET /api/radio/promote is per-message by contract, so the console does NOT
 * fire one request per row of a 100-row feed: it hydrates the newest slice
 * (what the feed actually shows — the list arrives oldest→newest), three at a
 * time, cached for the session, and hydrates any older row on demand the
 * moment its menu or its record modal opens. */
const PROMOTE_HYDRATE_RECENT = 24;
const PROMOTE_HYDRATE_PARALLEL = 3;

/* Age of an assistance request, live against a ticking now. */
const ageLabel = (iso: string, nowMs: number) => {
  const s = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export default function RadioDispatchPage() {
  /* ── URL params, read once on mount (no Suspense requirement) ───────── */
  const [ready, setReady] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [urlChannel, setUrlChannel] = useState<string | null>(null);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setProjectId(sp.get('projectId'));
      setUrlChannel(sp.get('channel'));
    } catch { /* no-op */ }
    setReady(true);
  }, []);

  /* ── Toasts — honest, transient result reporting (kit-styled, no library).
   * Declared FIRST so every engine below (transmit, outbox, tones) can report
   * failures without a temporal-dead-zone dance. */
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: 'ok' | 'err' }[]>([]);
  const toastSeqRef = useRef(1);
  const pushToast = useCallback((text: string, tone: 'ok' | 'err') => {
    const id = toastSeqRef.current++;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
  }, []);

  /* Who am I (for own-alert "Seen" + skipping own clips in catch-up). */
  const [myUserId, setMyUserId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureBrowserSession();
        const s = await getSession();
        if (alive) setMyUserId(s?.user?.id ?? null);
      } catch { /* demo mode — no session */ }
    })();
    return () => { alive = false; };
  }, []);

  /* ── Channels rail ──────────────────────────────────────────────────── */
  const channelsKey = ready
    ? (projectId ? `/api/radio/channels?projectId=${encodeURIComponent(projectId)}` : '/api/radio/channels')
    : null;
  const { data: chData, error: chError, mutate: mutateChannels } = useSWR<{ channels: RadioChannel[]; patches?: ActivePatch[] }>(
    channelsKey, fetcher,
    { refreshInterval: 20_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  const channels = chData?.channels ?? [];
  /* Channel numbering — a CB has channel numbers, so this console does too.
   * Stable for the life of a channels payload, and used by the selector, the
   * standby band, the patch board and the broadcast picker alike. */
  const channelNo = useMemo(() => {
    const m = new Map<string, string>();
    channels.forEach((c, i) => m.set(c.id, `CH ${String(i + 1).padStart(2, '0')}`));
    return m;
  }, [channels]);
  const channelNoRef = useRef(channelNo);
  channelNoRef.current = channelNo;

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (activeId || channels.length === 0) return;
    const fromUrl = urlChannel && channels.find((c) => c.id === urlChannel);
    /* Busiest-channel instant-on: land on the channel with the most unread
     * traffic, tie-broken by the most recent last message — never the oldest
     * row just because it sorts first. */
    const busiest = channels.reduce<RadioChannel | null>((best, c) => {
      if (!best) return c;
      const bu = Number(best.unread) || 0, cu = Number(c.unread) || 0;
      if (cu !== bu) return cu > bu ? c : best;
      const bt = best.lastMessage?.at ? new Date(best.lastMessage.at).getTime() : 0;
      const ct = c.lastMessage?.at ? new Date(c.lastMessage.at).getTime() : 0;
      return ct > bt ? c : best;
    }, null);
    setActiveId((fromUrl || busiest || channels[0]).id);
  }, [channels, activeId, urlChannel]);
  const active = channels.find((c) => c.id === activeId) || null;

  /* Monitor toggles — server flag merged with the local dispatch pref. */
  const [monOverrides, setMonOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => { setMonOverrides(readMonOverrides()); }, []);
  const isMonitored = useCallback(
    (c: RadioChannel) => (monOverrides[c.id] !== undefined ? monOverrides[c.id] : c.monitoring !== false),
    [monOverrides],
  );
  const toggleMonitor = (c: RadioChannel) => {
    setMonOverrides((prev) => {
      const next = { ...prev, [c.id]: !isMonitored(c) };
      try { window.localStorage.setItem(MON_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
      return next;
    });
  };

  /* ── Create group — a real flow: modal w/ name + project + member picker.
   * Create POSTs first, then adds each picked member sequentially; every
   * failure surfaces by name in an honest toast. */
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAllowSubs, setNewAllowSubs] = useState(false);
  const [newProject, setNewProject] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newSel, setNewSel] = useState<DirectoryPerson[]>([]);
  const [creating, setCreating] = useState(false);
  /* R14: the open-reset must not clobber a just-restored draft. */
  const groupDraftRestoringRef = useRef(false);
  useEffect(() => {
    if (showNew) {
      if (groupDraftRestoringRef.current) { groupDraftRestoringRef.current = false; return; }
      setNewProject(projectId || ''); setNewQuery(''); setNewSel([]);
    }
  }, [showNew, projectId]);
  /* R14 unsaved-work guard: an accidental dismiss (Cancel / X / backdrop) of
   * a modal holding a name or picked members asks first, and the fields ride
   * a localStorage draft so even a hard exit brings them back. */
  const newGroupGuard = useUnsavedGuard<{
    name: string; allowSubs: boolean; project: string; query: string; sel: DirectoryPerson[];
  }>({
    dirty: showNew && (!!newName.trim() || newSel.length > 0 || newAllowSubs),
    draftKey: 'radio-group-create',
    draftData: { name: newName, allowSubs: newAllowSubs, project: newProject, query: newQuery, sel: newSel },
    restoreDraft: (d) => {
      if (!d || (!String(d.name || '').trim() && !(Array.isArray(d.sel) && d.sel.length))) return;
      groupDraftRestoringRef.current = true;
      setNewName(String(d.name || ''));
      setNewAllowSubs(!!d.allowSubs);
      setNewProject(String(d.project || ''));
      setNewQuery(String(d.query || ''));
      setNewSel(Array.isArray(d.sel) ? d.sel : []);
      setShowNew(true);
    },
  });
  /* Every dismissal of the create modal routes through the guard. */
  const closeNewModal = () => {
    newGroupGuard.requestClose(() => setShowNew(false));
  };
  const toggleNewPerson = (p: DirectoryPerson) => {
    setNewSel((prev) => prev.some((x) => personKey(x) === personKey(p))
      ? prev.filter((x) => personKey(x) !== personKey(p))
      : [...prev, p]);
  };
  const createChannel = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: newProject || undefined, allowSubs: newAllowSubs }),
      });
      const j = r.ok ? await r.json().catch(() => null) : null;
      const chId: string | null = j?.channel?.id ?? null;
      if (!r.ok || !chId) {
        pushToast(`Could not create "${name}" (${r.status})`, 'err');
      } else {
        /* Sequential member adds — each failure is reported by name. */
        let added = 0;
        const failed: string[] = [];
        for (const p of newSel) {
          const uid = personUserId(p), sid = personSubId(p);
          const payload = uid
            ? { channelId: chId, addUserId: uid }
            : sid ? { channelId: chId, addPortalSubId: sid, displayName: personName(p) } : null;
          if (!payload) { failed.push(personName(p)); continue; }
          try {
            const ar = await fetch('/api/radio/channels', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (ar.ok) added += 1; else failed.push(personName(p));
          } catch { failed.push(personName(p)); }
        }
        setNewName(''); setNewAllowSubs(false); setNewSel([]); setShowNew(false);
        newGroupGuard.clearDraft(); // created for real — the safety copy is done
        pushToast(`"${name}" is on the air${added ? ` — ${added} member${added === 1 ? '' : 's'} added` : ''}`, 'ok');
        if (failed.length) pushToast(`Could not add ${failed.join(', ')} — retry from the roster`, 'err');
        await mutateChannels();
        setActiveId(chId);
      }
    } catch { pushToast('Could not create the channel — check your connection', 'err'); }
    setCreating(false);
  };

  /* ── Assistance queue (SWR 10s — badge always live, board collapsible) ─ */
  const assistKey = ready
    ? (projectId ? `/api/radio/assist?projectId=${encodeURIComponent(projectId)}` : '/api/radio/assist')
    : null;
  const { data: assistData, mutate: mutateAssist } = useSWR<{ queue: AssistRow[] }>(
    assistKey, fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  const assistQueue = assistData?.queue ?? [];
  const assistOpenCount = assistQueue.filter((a) => a.status === 'open').length;
  const [assistShown, setAssistShown] = useState(false);
  const [assistBusy, setAssistBusy] = useState<string | null>(null);
  const [assistNow, setAssistNow] = useState(() => Date.now());
  useEffect(() => {
    if (!assistShown) return;
    setAssistNow(Date.now());
    const iv = setInterval(() => setAssistNow(Date.now()), 10_000);
    return () => clearInterval(iv);
  }, [assistShown]);
  const triageAssist = async (id: string, action: 'ack' | 'resolve') => {
    if (assistBusy) return;
    setAssistBusy(id);
    try {
      const r = await fetch('/api/radio/assist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistId: id, action }),
      });
      if (r.ok) await mutateAssist();
    } catch { /* row stays queued — dispatcher retries */ }
    setAssistBusy(null);
  };

  /* ── Patch board (POST {patch:{a,b}}; live list rides the channels GET) */
  const patches = chData?.patches ?? [];
  const [patchA, setPatchA] = useState('');
  const [patchB, setPatchB] = useState('');
  const [patchBusy, setPatchBusy] = useState(false);
  const channelName = useCallback(
    (id: string) => channels.find((c) => c.id === id)?.name || 'Channel',
    [channels],
  );
  /* Read-through ref so the transmit engine can name a channel without taking
   * `channels` as a dependency (a re-keyed callback mid-transmission would be
   * a bug factory). */
  const channelNameRef = useRef(channelName);
  channelNameRef.current = channelName;
  const postPatch = async (a: string, b: string, release: boolean) => {
    if (!a || !b || a === b || patchBusy) return;
    setPatchBusy(true);
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: release ? { a, b, release: true } : { a, b } }),
      });
      if (r.ok) {
        if (!release) { setPatchA(''); setPatchB(''); }
        await mutateChannels();
      }
    } catch { /* board unchanged — dispatcher retries */ }
    setPatchBusy(false);
  };

  /* ── Priority channel (star toggle — interrupts scanning first) ─────── */
  const [prioBusy, setPrioBusy] = useState<string | null>(null);
  const togglePriority = async (c: RadioChannel) => {
    if (prioBusy) return;
    setPrioBusy(c.id);
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorityChannelId: c.id, priority: !c.priority }),
      });
      if (r.ok) await mutateChannels();
    } catch { /* star stays — dispatcher retries */ }
    setPrioBusy(null);
  };

  /* ── Roster (member panel: GET ?roster= + POST profile for own row) ─── */
  const [rosterOpen, setRosterOpen] = useState(false);
  const rosterRef = useRef<HTMLDivElement | null>(null);
  const rosterKey = rosterOpen && activeId ? `/api/radio/channels?roster=${encodeURIComponent(activeId)}` : null;
  const { data: rosterData, error: rosterError, mutate: mutateRoster } = useSWR<{ members: RosterMember[] }>(
    rosterKey, fetcher, { refreshInterval: 30_000, revalidateOnFocus: false },
  );
  const rosterMembers = rosterData?.members ?? [];
  const [editingProfile, setEditingProfile] = useState(false);
  const [callSignDraft, setCallSignDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<'available' | 'busy' | 'on_route' | 'off'>('available');
  const [savingProfile, setSavingProfile] = useState(false);
  useEffect(() => { setRosterOpen(false); setEditingProfile(false); }, [activeId]);
  useEffect(() => {
    /* Dismissal is owned by <Dropdown> (outside-pointerdown + Escape); this
     * effect only tidies the add-member sub-state when the panel closes. */
    if (rosterOpen) return;
    setRosterAddOpen(false);
    setRemoveArm(null);
  }, [rosterOpen]);
  const startEditProfile = (me: RosterMember) => {
    setCallSignDraft(me.call_sign || '');
    setStatusDraft(me.presence_status && PRESENCE[me.presence_status] ? me.presence_status : 'available');
    setEditingProfile(true);
  };
  // "Handle" header chip: one click opens the roster ALREADY in self-edit —
  // the CB handle must never be buried two taps deep.
  const pendingSelfEditRef = useRef(false);
  const myRosterRow = rosterMembers.find((m) => !!myUserId && m.user_id === myUserId) || null;
  useEffect(() => {
    if (!rosterOpen || !pendingSelfEditRef.current || !myRosterRow) return;
    pendingSelfEditRef.current = false;
    startEditProfile(myRosterRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterOpen, myRosterRow]);
  const saveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { callSign: callSignDraft.trim(), presenceStatus: statusDraft } }),
      });
      if (r.ok) { setEditingProfile(false); await mutateRoster(); }
    } catch { /* panel stays in edit — dispatcher retries */ }
    setSavingProfile(false);
  };

  /* ── Realtime (postgres_changes INSERT on the active channel) ───────── */
  /* radio_messages is in the supabase_realtime publication; the browser anon
   * client is hydrated from the server's httpOnly cookies so RLS sees the
   * caller. While the socket reports SUBSCRIBED, delivery is instant and the
   * poll relaxes to a 15s safety net; any other state keeps the proven 4s poll. */
  const [rtLive, setRtLive] = useState(false);
  const mutateChannelsRef = useRef(mutateChannels);
  mutateChannelsRef.current = mutateChannels;
  const rtBumpRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!activeId || !HAS_SUPABASE) { setRtLive(false); return; }
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    (async () => {
      await ensureBrowserSession(); // best-effort auth so RLS lets rows through
      if (cancelled) return;
      const sb = getSupabaseBrowser();
      channel = sb
        .channel(`radio:feed:${activeId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'radio_messages', filter: `channel_id=eq.${activeId}` },
          () => {
            rtBumpRef.current();          // immediate feed revalidate
            void mutateChannelsRef.current(); // rail previews + unread stay fresh
          },
        )
        .subscribe((status) => { if (!cancelled) setRtLive(status === 'SUBSCRIBED'); });
    })();
    return () => {
      cancelled = true;
      setRtLive(false);
      if (channel) { try { getSupabaseBrowser().removeChannel(channel); } catch { /* socket already gone */ } }
    };
  }, [activeId]);

  /* ── Feed (realtime-first; poll is the safety net) ──────────────────── */
  const messagesKey = activeId ? `/api/radio/messages?channelId=${encodeURIComponent(activeId)}` : null;
  const { data: msgData, error: msgError, mutate: mutateMessages } = useSWR<{ messages: RadioMessage[] }>(
    messagesKey, fetcher,
    { refreshInterval: rtLive ? 15_000 : 4000, revalidateOnFocus: true, keepPreviousData: false, dedupingInterval: 1500 },
  );
  const messages = msgData?.messages ?? [];
  const messagesRef = useRef<RadioMessage[]>(messages);
  messagesRef.current = messages;
  const mutateMessagesRef = useRef(mutateMessages);
  mutateMessagesRef.current = mutateMessages;
  rtBumpRef.current = () => { void mutateMessagesRef.current(); };

  /* The feed is the ONE scroll region on this screen. The ride-to-bottom
   * effect lives further down, next to the transmit engine, so it can follow
   * optimistic transmission rows as well as server traffic. */
  const feedRef = useRef<HTMLDivElement | null>(null);

  /* ── Language (EN/ES) — persisted under 'sag_lang' ──────────────────── */
  const [lang, setLang] = useState<'en' | 'es'>('en');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('sag_lang');
      if (saved === 'es' || saved === 'en') setLang(saved);
    } catch { /* no-op */ }
  }, []);
  const pickLang = (l: 'en' | 'es') => {
    setLang(l);
    try { window.localStorage.setItem('sag_lang', l); } catch { /* best-effort */ }
  };

  /* ── S/RF meter — Web Audio plumbing (feature-detected) ─────────────── */
  /* One page-lifetime AudioContext serves both meter taps: an AnalyserNode
   * on the PTT mic stream (TX) and one on the shared playback element (RX).
   * A MediaElementSource can be created only ONCE per element — after that
   * it owns the element's audio path for the element's lifetime — so the RX
   * tap, once wired, is kept until the console unmounts. */
  const [meterLevel, setMeterLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const playSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playAnalyserRef = useRef<AnalyserNode | null>(null);
  const elementTapRef = useRef<'untried' | 'active' | 'failed'>('untried');
  const tapPlayerRef = useRef<() => void>(() => {});
  const getAudioCtx = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      const AC = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    } catch { return null; }
    return audioCtxRef.current;
  }, []);

  /* ── Voice playback (shared player + catch-up queue) ────────────────── */
  const [heard, setHeard] = useState<Set<string>>(new Set());
  useEffect(() => { setHeard(new Set(readHeard())); }, []);
  const markHeard = useCallback((id: string) => {
    setHeard((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { window.localStorage.setItem(HEARD_KEY, JSON.stringify([...next].slice(-500))); } catch { /* best-effort */ }
      return next;
    });
  }, []);

  /* R13 heard-by: tell the sender their clip was played. Fire-and-forget,
   * once per message per page-load — the server dedupes across sessions and
   * degrades to a silent no-op until migration 063 is applied. */
  const postedReceiptRef = useRef<Set<string>>(new Set());
  const postPlayReceipt = useCallback((m: RadioMessage) => {
    if (!m?.id || m.id.startsWith('local-')) return;
    if (myUserId && m.sender_user_id === myUserId) return; // your own traffic
    if (postedReceiptRef.current.has(m.id)) return;
    postedReceiptRef.current.add(m.id);
    fetch('/api/radio/receipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: [m.id] }),
    }).catch(() => { /* garnish — never surface */ });
  }, [myUserId]);

  const playerRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const advanceRef = useRef<() => void>(() => {});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProg, setPlayProg] = useState(0);
  const [catchingUp, setCatchingUp] = useState(false);

  const ensurePlayer = useCallback(() => {
    if (!playerRef.current) {
      const a = new Audio();
      a.preload = 'none';
      /* CORS mode so the RX meter's AnalyserNode reads real samples (signed
       * Supabase storage URLs answer with ACAO:*). If the very first load
       * rejects CORS, onerror drops the attribute and retries the clip
       * un-tapped — playback always beats metering. */
      a.crossOrigin = 'anonymous';
      a.onended = () => advanceRef.current();
      a.onerror = () => {
        if (!playSourceRef.current && a.crossOrigin === 'anonymous') {
          elementTapRef.current = 'failed';
          a.crossOrigin = null;
          const src = a.src;
          if (src) {
            a.src = src;
            a.load();
            a.play().catch(() => advanceRef.current());
            return;
          }
        }
        advanceRef.current();
      };
      a.onplaying = () => tapPlayerRef.current();
      a.ontimeupdate = () => setPlayProg(a.duration > 0 ? a.currentTime / a.duration : 0);
      playerRef.current = a;
    }
    return playerRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    const a = playerRef.current;
    if (a) { a.pause(); a.removeAttribute('src'); }
    queueRef.current = [];
    setPlayingId(null);
    setPlayProg(0);
    setCatchingUp(false);
  }, []);

  const playById = useCallback((id: string) => {
    const m = messagesRef.current.find((x) => x.id === id);
    if (!m?.audio_url) { advanceRef.current(); return; }
    const a = ensurePlayer();
    a.src = m.audio_url;
    a.currentTime = 0;
    setPlayingId(id);
    setPlayProg(0);
    markHeard(id);
    postPlayReceipt(m); // R13: the sender's "heard by" updates
    a.play().catch(() => advanceRef.current());
  }, [ensurePlayer, markHeard, postPlayReceipt]);

  advanceRef.current = () => {
    const next = queueRef.current.shift();
    if (next) { playById(next); return; }
    setPlayingId(null);
    setPlayProg(0);
    setCatchingUp(false);
  };

  const toggleClip = (m: RadioMessage) => {
    if (playingId === m.id) { stopPlayback(); return; }
    queueRef.current = [];
    setCatchingUp(false);
    playById(m.id);
  };

  const unheardVoice = useMemo(
    () => messages.filter((m) =>
      m.kind === 'voice' && m.audio_url && !heard.has(m.id) && (!myUserId || m.sender_user_id !== myUserId)),
    [messages, heard, myUserId],
  );
  const startCatchUp = () => {
    const q = unheardVoice.map((m) => m.id);
    if (!q.length) return;
    setCatchingUp(true);
    queueRef.current = q.slice(1);
    playById(q[0]);
  };

  /* Stop playback when the channel changes or the console unmounts. */
  useEffect(() => { stopPlayback(); }, [activeId, stopPlayback]);
  useEffect(() => () => {
    const a = playerRef.current;
    if (a) { a.pause(); a.removeAttribute('src'); }
  }, []);

  /* ── Composer ───────────────────────────────────────────────────────── */
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const sendText = async (kind: 'text' | 'alert') => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    const post = async () => {
      try {
        const r = await fetch('/api/radio/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: activeId, kind, body }),
        });
        return r.ok;
      } catch { return false; }
    };
    /* One automatic retry after ~1.5s, then an honest toast. The draft stays
     * in the composer on failure so nothing is lost. */
    let ok = await post();
    if (!ok) {
      await new Promise((res) => setTimeout(res, 1500));
      ok = await post();
    }
    if (ok) { setDraft(''); await mutateMessages(); }
    else pushToast(`${kind === 'alert' ? 'Alert' : 'Message'} not sent — your draft is kept in the composer`, 'err');
    setSending(false);
  };

  /* ── Tone signaling (ACK / NEGATIVE / COME IN — kind 'tone') ────────── */
  /* Short sine beep through the page's shared AudioContext; each tone has
   * its own frequency so dispatchers learn them by ear. Best-effort — the
   * labeled chip in the feed is the source of truth. */
  const playToneBeep = useCallback((tone: string) => {
    const meta = TONES[tone];
    if (!meta) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume().catch(() => { /* beep skipped */ });
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = meta.freq;
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + meta.hold);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + meta.hold + 0.1);
    } catch { /* beep is best-effort — the chip still renders */ }
  }, [getAudioCtx]);

  const [toneSending, setToneSending] = useState<string | null>(null);
  const sendTone = async (tone: 'ack' | 'negative' | 'comein') => {
    if (!activeId || toneSending) return;
    setToneSending(tone);
    playToneBeep(tone); // local sidetone — the sender hears their own beep
    const post = async () => {
      try {
        const r = await fetch('/api/radio/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: activeId, kind: 'tone', body: tone }),
        });
        if (!r.ok) return false;
        const j = await r.json().catch(() => null);
        if (j?.message?.id) toneSeenRef.current.add(String(j.message.id)); // no double beep
        return true;
      } catch { return false; }
    };
    /* One automatic retry after ~1.5s, then an honest toast. */
    let ok = await post();
    if (!ok) {
      await new Promise((res) => setTimeout(res, 1500));
      ok = await post();
    }
    if (ok) await mutateMessages();
    else pushToast(`${TONES[tone]?.label || tone} tone not sent — re-key to try again`, 'err');
    setToneSending(null);
  };

  /* Beep on arrival: any tone row this browser has not seen (and did not
   * send) beeps once while fresh — old rows seed the set silently. */
  const toneSeenRef = useRef<Set<string>>(new Set());
  const toneChannelRef = useRef<string | null>(null);
  useEffect(() => {
    const seen = toneSeenRef.current;
    if (toneChannelRef.current !== activeId) {
      toneChannelRef.current = activeId;
      seen.clear();
    }
    for (const m of messages) {
      if (m.kind !== 'tone' || seen.has(m.id)) continue;
      seen.add(m.id);
      const fresh = Date.now() - new Date(m.created_at).getTime() < 30_000;
      if (fresh && (!myUserId || m.sender_user_id !== myUserId)) playToneBeep(m.body || '');
    }
  }, [messages, activeId, myUserId, playToneBeep]);

  /* ── Recording console (channel log: date range + search + print) ───── */
  const [logOpen, setLogOpen] = useState(false);
  const [logFrom, setLogFrom] = useState('');
  const [logTo, setLogTo] = useState('');
  const [logSearch, setLogSearch] = useState('');
  useEffect(() => { setLogOpen(false); setLogSearch(''); }, [activeId]);
  const logRangeParams = useMemo(() => {
    /* SaguaroDatePicker hands back local calendar dates; the range is the
     * whole local day on each end, sent as ISO instants (&from=&to=). */
    const parse = (iso: string, end: boolean) => {
      const [y, mo, d] = iso.split('-').map(Number);
      if (!y || !mo || !d) return null;
      const dt = end ? new Date(y, mo - 1, d, 23, 59, 59, 999) : new Date(y, mo - 1, d);
      return isNaN(dt.getTime()) ? null : dt.toISOString();
    };
    const from = logFrom ? parse(logFrom, false) : null;
    const to = logTo ? parse(logTo, true) : null;
    return `${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`;
  }, [logFrom, logTo]);
  const logKey = logOpen && activeId
    ? `/api/radio/messages?channelId=${encodeURIComponent(activeId)}${logRangeParams}`
    : null;
  const { data: logData, error: logError } = useSWR<{ messages: RadioMessage[] }>(
    logKey, fetcher, { revalidateOnFocus: false, keepPreviousData: true },
  );
  const logText = useCallback((m: RadioMessage) => {
    if (m.kind === 'voice') return m.transcript || `[voice clip${m.audio_duration_secs ? ` ${secsLabel(m.audio_duration_secs)}` : ''} — no transcript]`;
    if (m.kind === 'tone') return `[tone — ${TONES[m.body || '']?.label || (m.body || '')}]`;
    if (m.kind === 'image') return m.body ? `[photo] ${m.body}` : '[photo]';
    return m.body || '';
  }, []);
  const logRows = useMemo(() => {
    const all = logData?.messages ?? [];
    const q = logSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) =>
      logText(m).toLowerCase().includes(q) ||
      (m.sender_name || '').toLowerCase().includes(q) ||
      m.kind.toLowerCase().includes(q));
  }, [logData, logSearch, logText]);

  /* ── Attach (photos / PDFs / video → /api/radio/media) ──────────────── */
  /* Paperclip in the composer or drag-drop onto the feed; either way the
   * file lands in a pending tray with an inline caption prompt first. */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const takeFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!MEDIA_OK.test(f.name || '')) {
      setPendingFile(null);
      setAttachError('Unsupported type — the channel takes photos, PDFs, and video (mp4 / mov / webm).');
      return;
    }
    if (f.size > MEDIA_MAX_BYTES) {
      setPendingFile(null);
      setAttachError(`Too large (${sizeLabel(f.size)}) — the channel takes files up to 50 MB.`);
      return;
    }
    setAttachError(null);
    setMediaCaption('');
    setPendingFile(f);
  }, []);

  const clearAttach = () => {
    setPendingFile(null);
    setMediaCaption('');
    setAttachError(null);
  };

  /* Dropping the attachment when the dispatcher switches channels. */
  useEffect(() => { setPendingFile(null); setMediaCaption(''); setAttachError(null); }, [activeId]);

  const sendMedia = async () => {
    if (!pendingFile || !activeId || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append('channelId', activeId);
      const cap = mediaCaption.trim();
      if (cap) fd.append('caption', cap);
      fd.append('file', pendingFile);
      const r = await fetch('/api/radio/media', { method: 'POST', body: fd });
      if (r.ok) {
        clearAttach();
        await mutateMessages();
        void mutateChannels(); // rail preview shows the share
      } else {
        const j = await r.json().catch(() => null);
        setAttachError((j && typeof j.error === 'string' && j.error) || `Upload failed (${r.status})`);
      }
    } catch { setAttachError('Upload failed — check your connection and try again.'); }
    setUploadingMedia(false);
  };

  /* Drag-drop onto the feed — same intake as the paperclip. */
  const hasFiles = (e: React.DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  const onFeedDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e) || !activeId) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  };
  const onFeedDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e) || !activeId) return;
    e.preventDefault();
  };
  const onFeedDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };
  const onFeedDrop = (e: React.DragEvent) => {
    if (!hasFiles(e) || !activeId) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    takeFile(e.dataTransfer.files?.[0]);
  };

  /* ══ TRANSMIT ENGINE ════════════════════════════════════════════════════
   * Saguaro Radio is STORE-AND-FORWARD: a key-down records, a release uploads,
   * and every other member's console plays it. It is NOT live full-duplex
   * audio — see `streamStatus` below for where that would live and why it is
   * not on yet. This engine's whole job is to make store-and-forward feel
   * instant and to never, ever lie about what happened:
   *
   *  · KEYED (thumb down — synchronous) is a DIFFERENT state from MIC OPEN
   *    (MediaRecorder actually running). The deck shows OPENING… during the
   *    device gap and only says ON AIR once audio is truly being captured, so
   *    the first word of a transmission is never lost to an optimistic label.
   *  · Duration is wall-clock from the instant record() returns — the one
   *    honest clock. Nothing is derived from polled React state.
   *  · A runtime mic failure NEVER hides the talk key. It prints the reason on
   *    the bar and the next press retries.
   *  · The mic device is held warm between transmissions (released after 45s
   *    idle) so a second key-down doesn't pay device-open latency again.
   *  · A release NEVER gates the next key-down. Uploads run in the background.
   *  · Every clip over the floor lands in a persisted outbox (IndexedDB) and
   *    paints a feed row immediately. Nothing is ever silently discarded.
   *  · 60-second time-out timer hard-stops a stuck key, like a real CB. */
  const MAX_TX_MS = 60_000;
  const TX_WARN_MS = 50_000;
  const TX_FLOOR_MS = 350;
  const MIC_IDLE_MS = 45_000;

  /* null = not yet checked (server render + first paint). Never render the
   * "this browser can't record" message on a guess — a false negative for a
   * frame reads exactly like the bug we are here to kill. */
  const [pttSupported, setPttSupported] = useState<boolean | null>(null);
  const [keyed, setKeyed] = useState(false);      // thumb is down (synchronous)
  const [micOpen, setMicOpen] = useState(false);  // recorder is genuinely running
  const [txSecs, setTxSecs] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTx[]>([]);

  const keyedRef = useRef(false);
  const keySeqRef = useRef(0);
  const recRef = useRef<MediaRecorder | null>(null);
  /* txStartRef drives the on-screen elapsed readout ONLY. Each recording owns
   * its own chunk array and its own start stamp (captured in pttStart), so a
   * fast press-release-press can never let the second take clobber the first
   * take's audio or duration while its onstop is still in flight. */
  const txStartRef = useRef(0);
  const totRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const txTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmStreamRef = useRef<MediaStream | null>(null);
  const warmIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pttStopRef = useRef<() => void>(() => {});
  const deliverRef = useRef<(item: PendingTx, auto: boolean) => void>(() => {});
  const finishTxRef = useRef<(take: Take) => void>(() => {});
  const pendingRef = useRef<PendingTx[]>(pending);
  pendingRef.current = pending;
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;

  /* Feature detection ONLY — this is the single thing allowed to hide the key. */
  useEffect(() => {
    setPttSupported(
      typeof window !== 'undefined' &&
      typeof (window as any).MediaRecorder !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  /* ── Warm mic device (a real pre-warm: the stream is HELD, not discarded) */
  const releaseWarmMic = useCallback(() => {
    if (warmIdleRef.current) { clearTimeout(warmIdleRef.current); warmIdleRef.current = null; }
    try { micSourceRef.current?.disconnect(); } catch { /* graph already gone */ }
    micSourceRef.current = null;
    micAnalyserRef.current = null;
    const s = warmStreamRef.current;
    warmStreamRef.current = null;
    if (s) s.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* already stopped */ } });
  }, []);
  const holdWarmMic = useCallback(() => {
    if (warmIdleRef.current) clearTimeout(warmIdleRef.current);
    warmIdleRef.current = setTimeout(() => releaseWarmMic(), MIC_IDLE_MS);
  }, [releaseWarmMic]);
  const acquireMic = useCallback(async () => {
    const s = warmStreamRef.current;
    if (s && s.getAudioTracks().some((t) => t.readyState === 'live')) {
      if (warmIdleRef.current) { clearTimeout(warmIdleRef.current); warmIdleRef.current = null; }
      return s;
    }
    releaseWarmMic();
    const ns = await navigator.mediaDevices.getUserMedia({ audio: true });
    warmStreamRef.current = ns;
    return ns;
  }, [releaseWarmMic]);
  /* Tap the live mic for the S/RF meter — once per warm stream. */
  const tapMic = useCallback((stream: MediaStream) => {
    if (micAnalyserRef.current) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume().catch(() => { /* meter falls back */ });
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an); // analysis only — never wired to destination (no sidetone)
      micSourceRef.current = src;
      micAnalyserRef.current = an;
    } catch { /* meter falls back to the synthesized envelope */ }
  }, [getAudioCtx]);
  /* Hover / focus on the talk key opens the device ahead of the press. */
  const preflightMic = useCallback(() => {
    if (pttSupported === false || keyedRef.current || !navigator.mediaDevices?.getUserMedia) return;
    if (warmStreamRef.current) { holdWarmMic(); return; }
    acquireMic().then(() => holdWarmMic()).catch(() => { /* denial surfaces on the real key-down */ });
  }, [pttSupported, acquireMic, holdWarmMic]);

  /* ── Outbox delivery — retry with backoff, then hand the row to the user */
  const deliverClip = useCallback(async (item: PendingTx, auto: boolean) => {
    setPending((prev) => prev.map((x) => (x.localId === item.localId ? { ...x, status: 'sending', error: null } : x)));
    const fd = new FormData();
    fd.append('channelId', item.channelId);
    fd.append('durationSecs', item.secs.toFixed(1));
    fd.append('file', new File([item.blob], `ptt.${item.ext}`, { type: item.mime || 'audio/webm' }));
    let ok = false;
    let why = '';
    try {
      const r = await fetch('/api/radio/voice', { method: 'POST', body: fd });
      ok = r.ok;
      if (!ok) {
        const j = await r.json().catch(() => null);
        why = (j && typeof j.error === 'string' && j.error) || `server said ${r.status}`;
      }
    } catch { why = 'no connection'; }
    if (ok) {
      void outboxDelete(item.localId);
      setPending((prev) => prev.filter((x) => x.localId !== item.localId));
      if (item.channelId === activeIdRef.current) void mutateMessagesRef.current();
      void mutateChannelsRef.current();
      return;
    }
    const attempts = item.attempts + 1;
    /* "QUEUED — RETRYING" is only allowed to appear when something really is
     * retrying. A one-shot manual retry that fails lands straight on HELD. */
    const willRetry = auto && attempts < 3;
    const next: PendingTx = { ...item, attempts, status: willRetry ? 'queued' : 'failed', error: why || null };
    setPending((prev) => prev.map((x) => (x.localId === item.localId ? next : x)));
    if (willRetry) {
      setTimeout(() => deliverRef.current(next, true), attempts === 1 ? 1500 : 5000);
    } else {
      pushToast(`Clip held on ${item.channelName} — ${why || 'delivery failed'}. Hit RETRY on the row.`, 'err');
    }
  }, [pushToast]);
  deliverRef.current = deliverClip;

  /* Anything stranded by a crash, a reload, or a dead link comes back. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await outboxAll();
      if (!alive || !rows.length) return;
      const items: PendingTx[] = rows.map((r) => ({ ...r, status: 'queued' as TxState, attempts: 0, error: null }));
      setPending((prev) => [...prev, ...items.filter((i) => !prev.some((p) => p.localId === i.localId))]);
      pushToast(`${items.length} held transmission${items.length === 1 ? '' : 's'} from your last session — sending now`, 'err');
      items.forEach((it) => deliverRef.current(it, true));
    })();
    const onOnline = () => {
      pendingRef.current.filter((p) => p.status !== 'sending').forEach((p) => deliverRef.current({ ...p, attempts: 0 }, true));
    };
    window.addEventListener('online', onOnline);
    return () => { alive = false; window.removeEventListener('online', onOnline); };
  }, [pushToast]);

  /* ── Release: measure honestly, queue, paint the row ─────────────────── */
  const finishTx = useCallback((take: Take) => {
    const secs = (Date.now() - take.startedAt) / 1000;
    const blob = new Blob(take.chunks, { type: take.rec.mimeType || 'audio/webm' });
    take.chunks.length = 0;
    holdWarmMic(); // keep the device open for the next key — CB cadence is press-release-press
    if (secs * 1000 < TX_FLOOR_MS || blob.size === 0) {
      pushToast('Too short — hold the key down while you talk, then release.', 'err');
      return;
    }
    const { channelId: chId, channelName: chName } = take;
    const mt = take.rec.mimeType || '';
    const ext = mt.includes('mp4') ? 'mp4' : mt.includes('ogg') ? 'ogg' : mt.includes('wav') ? 'wav' : 'webm';
    const clip: OutboxClip = {
      localId: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId: chId,
      channelName: chName,
      secs: Math.round(secs * 10) / 10,
      mime: blob.type || 'audio/webm',
      ext,
      bytes: blob.size,
      createdAt: Date.now(),
      blob,
    };
    const item: PendingTx = { ...clip, status: 'sending', attempts: 0, error: null };
    setPending((prev) => [...prev, item]);
    void outboxPut(clip); // persisted BEFORE the first attempt — a crash cannot eat it
    deliverRef.current(item, true);
  }, [holdWarmMic, pushToast]);
  finishTxRef.current = finishTx;

  /* ── Key down ────────────────────────────────────────────────────────── */
  const pttStart = useCallback(async () => {
    if (pttSupported === false || keyedRef.current) return;
    const chId = activeIdRef.current;
    if (!chId) { pushToast('Tune to a channel before you key up', 'err'); return; }
    const chName = channelNameRef.current(chId);
    keyedRef.current = true;                 // synchronous guard — never React state
    const mySeq = ++keySeqRef.current;
    setKeyed(true);
    setMicError(null);
    setTxSecs(0);
    stopPlayback(); // never transmit over receive
    try {
      const stream = await acquireMic();
      /* The key may have been released during the await (fast press, or the
       * permission prompt stealing focus). Bail instead of leaving a runaway
       * recorder holding a hot mic. */
      if (!keyedRef.current || keySeqRef.current !== mySeq) { holdWarmMic(); return; }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (m) => (window as any).MediaRecorder?.isTypeSupported?.(m),
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      /* One take = one recorder + its own buffer + its own start stamp. */
      const take: Take = { rec, chunks: [], startedAt: 0, channelId: chId, channelName: chName };
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) take.chunks.push(e.data); };
      rec.onstop = () => finishTxRef.current(take);
      recRef.current = rec;
      rec.start();
      take.startedAt = Date.now();           // ← the ONLY honest transmission clock
      txStartRef.current = take.startedAt;   // (the elapsed readout mirrors it)
      setMicOpen(true);
      tapMic(stream);
      if (txTickRef.current) clearInterval(txTickRef.current);
      txTickRef.current = setInterval(() => setTxSecs((Date.now() - txStartRef.current) / 1000), 100);
      if (totRef.current) clearTimeout(totRef.current);
      totRef.current = setTimeout(() => {
        if (!keyedRef.current) return;
        pushToast('60-second limit — the key released and the clip was sent.', 'err');
        pttStopRef.current();
      }, MAX_TX_MS);
    } catch (err) {
      /* A runtime failure is NEVER allowed to hide the talk key (that is how
       * "I can't push the PTT" happens). Print the reason; the next press
       * retries from scratch. */
      keyedRef.current = false;
      setKeyed(false);
      setMicOpen(false);
      releaseWarmMic();
      const text = micErrorText(err);
      setMicError(text);
      pushToast(text, 'err');
    }
  }, [pttSupported, acquireMic, holdWarmMic, tapMic, releaseWarmMic, stopPlayback, pushToast]);

  /* ── Key up ──────────────────────────────────────────────────────────── */
  const pttStop = useCallback(() => {
    if (!keyedRef.current) return;
    keyedRef.current = false;
    keySeqRef.current += 1;                  // invalidates any start still awaiting
    setKeyed(false);
    setMicOpen(false);
    setTxSecs(0);
    if (totRef.current) { clearTimeout(totRef.current); totRef.current = null; }
    if (txTickRef.current) { clearInterval(txTickRef.current); txTickRef.current = null; }
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { holdWarmMic(); }
    } else {
      holdWarmMic();
    }
  }, [holdWarmMic]);
  pttStopRef.current = pttStop;

  /* Ride the feed to the bottom on new traffic and on every new optimistic
   * transmission row — a release must always show you your own clip landing. */
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId, pending.length]);

  /* Stuck-key safety: if the window loses focus or the tab is hidden while the
   * key is down (alt-tab, a call, a lock screen), stop and SEND rather than
   * orphaning a live recorder on a hot mic. */
  useEffect(() => {
    const bail = () => { if (keyedRef.current) pttStopRef.current(); };
    const onVis = () => { if (document.visibilityState === 'hidden') bail(); };
    window.addEventListener('blur', bail);
    window.addEventListener('pagehide', bail);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', bail);
      window.removeEventListener('pagehide', bail);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const retryClip = (item: PendingTx) => { if (item.status !== 'sending') deliverRef.current({ ...item, attempts: 0 }, false); };
  const discardClip = (item: PendingTx) => {
    void outboxDelete(item.localId);
    setPending((prev) => prev.filter((x) => x.localId !== item.localId));
  };

  useEffect(() => () => {
    if (totRef.current) clearTimeout(totRef.current);
    if (txTickRef.current) clearInterval(txTickRef.current);
    if (warmIdleRef.current) clearTimeout(warmIdleRef.current);
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* gone */ } }
    const s = warmStreamRef.current;
    if (s) s.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* gone */ } });
  }, []);

  /* ── Live full-duplex capability probe — honesty, not a feature ───────
   * /api/radio/stream-token's GET is a capability probe that mints nothing.
   * The console renders ONE quiet line from it and builds no LiveKit UI: the
   * transport here is push-to-talk clips until credentials exist. */
  const [streamProbe, setStreamProbe] = useState<{ available: boolean; reason?: string } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetch('/api/radio/stream-token')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setStreamProbe(j && typeof j.available === 'boolean'
          ? { available: !!j.available, reason: j.reason }
          : { available: false, reason: 'unknown' });
      })
      .catch(() => { if (alive) setStreamProbe({ available: false, reason: 'unknown' }); });
    return () => { alive = false; };
  }, [ready]);
  const streamStatus = !streamProbe
    ? 'Live full-duplex: checking…'
    : streamProbe.available
      ? 'Live full-duplex is licensed for this workspace but is not wired into this console — traffic still goes out as push-to-talk clips.'
      : streamProbe.reason === 'upsell'
        ? 'Live full-duplex streaming is a paid add-on and is not on for this workspace. Push-to-talk clips are the transport.'
        : streamProbe.reason === 'not_configured'
          ? 'Live full-duplex is not configured — it needs LiveKit credentials. Push-to-talk clips are the transport.'
          : 'Live full-duplex: the capability probe did not answer. Push-to-talk clips are the transport either way.';

  /* ── Hold-SPACEBAR PTT (dispatcher muscle memory) ───────────────────── */
  /* Keydown keys up, keyup transmits. Ignored while typing in any field. */
  const [spaceKeyed, setSpaceKeyed] = useState(false);
  const spaceDownRef = useRef(false);
  const pttStartRef = useRef<() => void>(() => {});
  pttStartRef.current = () => { void pttStart(); };
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || spaceDownRef.current || isTyping(e.target)) return;
      e.preventDefault();
      spaceDownRef.current = true;
      setSpaceKeyed(true);
      pttStartRef.current();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceDownRef.current) return;
      e.preventDefault();
      spaceDownRef.current = false;
      setSpaceKeyed(false);
      pttStopRef.current();
    };
    const cancel = () => {
      if (!spaceDownRef.current) return;
      spaceDownRef.current = false;
      setSpaceKeyed(false);
      pttStopRef.current();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', cancel);
    };
  }, []);

  /* ── S/RF meter drive (tx while keyed, rx while playing, idle otherwise) */
  /* RX tap: created on the first successful CORS 'playing' event, then kept
   * for the element's lifetime (a MediaElementSource cannot be detached from
   * its element). The tap re-routes the element's audio through the graph,
   * so the analyser is wired on to destination to keep clips audible. */
  const tapPlayer = () => {
    const a = playerRef.current;
    if (!a || playSourceRef.current || elementTapRef.current === 'failed') return;
    if (a.crossOrigin !== 'anonymous') { elementTapRef.current = 'failed'; return; }
    const ctx = getAudioCtx();
    if (!ctx) { elementTapRef.current = 'failed'; return; }
    if (ctx.state !== 'running') {
      /* Autoplay policy: tapping a suspended context would mute the clip.
       * Nudge it awake and try again on the next 'playing' event. */
      void ctx.resume().catch(() => { /* stays untried */ });
      return;
    }
    try {
      const src = ctx.createMediaElementSource(a);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      an.connect(ctx.destination); // keep playback audible through the tap
      playSourceRef.current = src;
      playAnalyserRef.current = an;
      elementTapRef.current = 'active';
    } catch { elementTapRef.current = 'failed'; }
  };
  tapPlayerRef.current = tapPlayer;

  const meterMode: 'idle' | 'rx' | 'tx' = micOpen || keyed ? 'tx' : playingId ? 'rx' : 'idle';
  const playingIdRef = useRef<string | null>(null);
  playingIdRef.current = playingId;
  useEffect(() => {
    if (meterMode === 'idle') { setMeterLevel(0); return; }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 90) return; // ~11 Hz — the meter's own spring interpolates between samples
      last = now;
      const ctx = audioCtxRef.current;
      const live = !!ctx && ctx.state === 'running';
      let target = 0;
      if (meterMode === 'tx') {
        if (live && micAnalyserRef.current) {
          target = levelFromAnalyser(micAnalyserRef.current); // real mic level
        } else {
          /* Honest fallback: no Web Audio tap available, so this is a
           * synthesized modulation-style envelope — a plausible voice
           * cadence, NOT the real microphone level. */
          const t = now / 1000;
          target = 0.44 + 0.26 * Math.sin(t * 6.7) * Math.sin(t * 1.9) + 0.12 * Math.sin(t * 13.1);
        }
      } else {
        const a = playerRef.current;
        if (live && playAnalyserRef.current) {
          target = levelFromAnalyser(playAnalyserRef.current); // real playback level
        } else if (a && a.duration > 0) {
          /* Fallback: sample the same seeded pseudo-waveform the feed row
           * renders, synced to currentTime — deterministic per clip, NOT
           * real audio analysis. */
          const id = playingIdRef.current;
          if (id) {
            const m = messagesRef.current.find((x) => x.id === id);
            const n = Math.max(18, Math.min(42, Math.round((m?.audio_duration_secs || a.duration || 8) * 2)));
            const hs = waveHeights(id, n);
            const i = Math.min(n - 1, Math.max(0, Math.floor((a.currentTime / a.duration) * n)));
            target = 0.12 + hs[i] * 0.7;
          }
        }
      }
      target = Math.min(0.98, Math.max(0.04, target));
      setMeterLevel((prev) => (Math.abs(prev - target) < 0.015 ? prev : target));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meterMode]);

  /* Tear the whole audio graph down with the console. */
  useEffect(() => () => {
    try { micSourceRef.current?.disconnect(); } catch { /* graph already gone */ }
    micSourceRef.current = null;
    micAnalyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) void ctx.close().catch(() => { /* already closed */ });
  }, []);

  /* ── File to log (row hover action) ─────────────────────────────────── */
  const [filedIds, setFiledIds] = useState<Set<string>>(new Set());
  const [filingId, setFilingId] = useState<string | null>(null);
  const fileToLog = async (m: RadioMessage) => {
    if (filingId || filedIds.has(m.id) || !activeId) return;
    setFilingId(m.id);
    try {
      const r = await fetch('/api/radio/file-to-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: m.id, channelId: activeId }),
      });
      if (r.ok) setFiledIds((prev) => new Set(prev).add(m.id));
    } catch { /* row simply stays unfiled — dispatcher retries */ }
    setFilingId(null);
  };

  /* ── Make a record — radio → RFI / punch / field issue / daily log ─────
   * One tap from a transmission to a tracked record, with the clip attached
   * as evidence. Chips on the row show what a transmission has already
   * become, and they survive a reload because they are read back from the
   * server, not remembered in the browser. */
  const [links, setLinks] = useState<Record<string, PromoteLink[]>>({});
  const linksSeenRef = useRef<Set<string>>(new Set());
  const linksQueueRef = useRef<string[]>([]);
  const linksActiveRef = useRef(0);
  const pumpLinksRef = useRef<() => void>(() => {});

  /** Read the links already on a transmission. A 403/404 leaves the row with
   * no chip — it never invents one, and it never claims a failure it cannot
   * prove. Real errors surface in the modal, where the user is watching. */
  const fetchLinks = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/radio/promote?messageId=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      const rows: PromoteLink[] = Array.isArray(j?.links) ? j.links : [];
      setLinks((prev) => (rows.length === 0 && !prev[id] ? prev : { ...prev, [id]: rows }));
    } catch { /* offline — chips fill in on the next visit, nothing is faked */ }
  }, []);

  pumpLinksRef.current = () => {
    while (linksActiveRef.current < PROMOTE_HYDRATE_PARALLEL && linksQueueRef.current.length > 0) {
      const id = linksQueueRef.current.shift() as string;
      linksActiveRef.current += 1;
      /* fetchLinks already swallows its own failures; the extra catch keeps a
       * surprise rejection from stranding the in-flight counter forever. */
      void fetchLinks(id).catch(() => { /* counted below either way */ }).then(() => {
        linksActiveRef.current -= 1;
        pumpLinksRef.current();
      });
    }
  };
  const queueLinks = useCallback((ids: string[]) => {
    let added = false;
    for (const id of ids) {
      if (!id || linksSeenRef.current.has(id)) continue;
      linksSeenRef.current.add(id);
      linksQueueRef.current.push(id);
      added = true;
    }
    if (added) pumpLinksRef.current();
  }, []);
  /* The newest slice of the feed is what the dispatcher is looking at. Keyed
   * on the SWR payload (not the derived array) so this runs once per real
   * fetch; queueLinks de-dupes across every later pass anyway. */
  useEffect(() => {
    const list = messagesRef.current;
    if (!activeId || list.length === 0) return;
    queueLinks(list.slice(-PROMOTE_HYDRATE_RECENT).map((m) => m.id));
  }, [activeId, msgData, queueLinks]);
  /** Force a re-read for one transmission (after opening its modal). */
  const refreshLinks = useCallback((id: string) => {
    linksSeenRef.current.add(id);
    void fetchLinks(id);
  }, [fetchLinks]);

  /* Row overflow menu — ALWAYS present, so the action is never hover-only.
   * Fixed-positioned off the button's rect so the feed's scroll region can
   * never clip it. */
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setRowMenu((cur) => (cur && cur.id === id
      ? null
      : { id, top: Math.round(r.bottom + 6), right: Math.round(Math.max(10, window.innerWidth - r.right)) }));
    queueLinks([id]);
  };
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenu(null); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [rowMenu]);

  /* The modal */
  const [promoteFor, setPromoteFor] = useState<string | null>(null);
  const [promoteType, setPromoteType] = useState<PromoteRecordType>('rfi');
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [pf, setPf] = useState<PromoteForm>(emptyPromoteForm);
  const [pfTitleTouched, setPfTitleTouched] = useState(false);
  const promoteMsg = promoteFor ? messages.find((m) => m.id === promoteFor) || null : null;
  const rowMenuMsg = rowMenu ? messages.find((m) => m.id === rowMenu.id) || null : null;

  const openPromote = useCallback((m: RadioMessage) => {
    setRowMenu(null);
    setPromoteFor(m.id);
    setPromoteType('rfi');
    setPromoteBusy(false);
    setPromoteError(null);
    setPfTitleTouched(false);
    /* Seed from the transcript when there is one, else the typed body. When
     * there is neither — the normal case for voice today — the box stays
     * empty and says so. We never put words in the field's mouth. */
    const seed = (m.transcript || m.body || '').trim();
    setPf({
      ...emptyPromoteForm(),
      summary: seed,
      title: seed ? titleFrom(seed) : '',
      logDate: localLogDate(m.created_at),
    });
    refreshLinks(m.id);
  }, [refreshLinks]);

  const setSummary = (text: string) => {
    setPf((f) => ({ ...f, summary: text, title: pfTitleTouched ? f.title : (text.trim() ? titleFrom(text) : '') }));
  };

  const linkFor = (messageId: string | null, t: PromoteRecordType) =>
    (messageId ? links[messageId] || [] : []).find((l) => l.recordType === t) || null;
  const promoteExisting = linkFor(promoteFor, promoteType);

  const submitPromote = async () => {
    const m = promoteMsg;
    if (!m || promoteBusy) return;
    const summary = pf.summary.trim();
    if (summary.length < 3) {
      setPromoteError(m.kind === 'voice'
        ? 'Type what was said — your summary becomes the record, and the clip rides along as the evidence.'
        : 'Type the summary that should become the record.');
      return;
    }
    setPromoteBusy(true);
    setPromoteError(null);
    const fields: Record<string, unknown> = { summary };
    const title = pf.title.trim();
    if (title && promoteType !== 'daily_log') fields.title = title;
    if (promoteType === 'rfi') {
      fields.priority = pf.priority;
      if (pf.due) fields.dueDate = pf.due;
    } else if (promoteType === 'punch') {
      fields.priority = pf.priority;
      fields.trade = pf.trade;
      if (pf.location.trim()) fields.location = pf.location.trim();
      if (pf.due) fields.dueDate = pf.due;
    } else if (promoteType === 'field_issue') {
      fields.priority = pf.priority;
      if (pf.location.trim()) fields.location = pf.location.trim();
    } else {
      fields.section = pf.section;
      if (pf.logDate) fields.logDate = pf.logDate;
    }
    try {
      const r = await fetch('/api/radio/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: m.id, recordType: promoteType, fields }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) {
        /* supabase-js does not throw and neither does the route — the error
         * text it hands back is the real reason. Show it verbatim. */
        setPromoteError(
          (j && typeof j.error === 'string' && j.error)
          || `The record was not created (${r.status}). Nothing was written.`,
        );
        setPromoteBusy(false);
        return;
      }
      const created: PromoteLink = {
        id: String(j.recordId || `${m.id}:${promoteType}`),
        recordType: promoteType,
        recordId: String(j.recordId || ''),
        recordLabel: String(j.recordLabel || PROMOTE_META[promoteType].label),
        createdAt: new Date().toISOString(),
        createdByName: null,
        href: typeof j.href === 'string' ? j.href : null,
      };
      setLinks((prev) => ({
        ...prev,
        [m.id]: [...(prev[m.id] || []).filter((l) => l.recordType !== promoteType), created],
      }));
      pushToast(
        j.alreadyPromoted
          ? `${created.recordLabel} already carries this transmission — nothing was duplicated.`
          /* The server reports what it actually attached; the chip claims no more than that. */
          : `${created.recordLabel} created${j.evidence && j.evidence.audioPath ? ' with the clip attached as evidence' : ''}.`,
        'ok',
      );
      setPromoteBusy(false);
      setPromoteFor(null);
    } catch {
      setPromoteError('Could not reach the server, so nothing was created. Check your connection and try again.');
      setPromoteBusy(false);
    }
  };

  /* ── Share channel (guest links via /api/radio/guest) ───────────────── */
  /* Header popover: list + revoke the channel's live links, mint new ones
   * (label, talk toggle, expiry), copy the absolute guest URL one-click. */
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState('');
  const [shareTalk, setShareTalk] = useState(true);
  const [shareDays, setShareDays] = useState<'7' | '30' | '90' | 'never'>('30');
  const [creatingLink, setCreatingLink] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linksKey = shareOpen && activeId ? `/api/radio/guest?channelId=${encodeURIComponent(activeId)}` : null;
  const { data: linkData, error: linkError, mutate: mutateLinks } = useSWR<{ links: GuestLink[] }>(
    linksKey, fetcher, { revalidateOnFocus: false },
  );
  const guestLinks = (linkData?.links ?? []).filter((l) => !l.revoked_at);

  const closeShare = useCallback(() => {
    setShareOpen(false);
    setCreatedUrl(null);
    setShareError(null);
  }, []);
  useEffect(() => { closeShare(); setShareLabel(''); }, [activeId, closeShare]);

  const guestAbsUrl = (token: string) => `${window.location.origin}/portals/radio/${token}`;
  const copyShare = async (key: string, text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), 1800);
    } catch { /* clipboard blocked — the URL stays visible to select by hand */ }
  };
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const createGuestLink = async () => {
    if (!activeId || creatingLink) return;
    setCreatingLink(true);
    setShareError(null);
    try {
      const payload: Record<string, unknown> = { channelId: activeId, canTalk: shareTalk };
      const label = shareLabel.trim();
      if (label) payload.label = label;
      if (shareDays !== 'never') payload.expiresDays = Number(shareDays);
      const r = await fetch('/api/radio/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.url) {
        setCreatedUrl(`${window.location.origin}${j.url}`);
        setShareLabel('');
        await mutateLinks();
      } else {
        setShareError((j && typeof j.error === 'string' && j.error) || `Could not create the link (${r.status})`);
      }
    } catch { setShareError('Could not create the link — check your connection and try again.'); }
    setCreatingLink(false);
  };

  const revokeGuestLink = async (linkId: string) => {
    if (revokingId) return;
    setRevokingId(linkId);
    try {
      const r = await fetch('/api/radio/guest', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId }),
      });
      if (r.ok) await mutateLinks();
    } catch { /* link stays listed — staff retries */ }
    setRevokingId(null);
  };

  /* ── Dialog surfaces — every secondary panel is a real dialog with exactly
   * ONE scroll region of its own. No popover-inside-popover, no 150px
   * portholes nested inside a page that also scrolls. */
  const [patchOpen, setPatchOpen] = useState(false);
  const [bcOpen, setBcOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeAllDialogs = useCallback(() => {
    setShareOpen(false); setCreatedUrl(null); setShareError(null);
    setPatchOpen(false); setBcOpen(false); setMenuOpen(false);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  /* ── Broadcast — one message onto up to 8 channels at once ───────────── */
  const [bcSel, setBcSel] = useState<Set<string>>(new Set());
  const [bcText, setBcText] = useState('');
  const [bcAlert, setBcAlert] = useState(false);
  const [bcBusy, setBcBusy] = useState(false);
  const [bcSent, setBcSent] = useState<string[] | null>(null);
  const toggleBcChannel = (id: string) => {
    setBcSent(null);
    setBcSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });
  };
  const sendBroadcast = async () => {
    const ids = [...bcSel];
    const text = bcText.trim();
    if (ids.length < 2 || !text || bcBusy) return;
    setBcBusy(true);
    setBcSent(null);
    try {
      const r = await fetch('/api/radio/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: ids, kind: bcAlert ? 'alert' : 'text', body: text }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok) {
        const sentIds: string[] = Array.isArray(j?.messages)
          ? j.messages.map((m: { channel_id?: string }) => String(m?.channel_id || '')).filter(Boolean)
          : [];
        const landed = sentIds.length ? sentIds : ids;
        setBcSent(landed.map((id) => channelName(id)));
        setBcText(''); setBcSel(new Set());
        const skipped = ids.filter((id) => sentIds.length && !sentIds.includes(id));
        if (skipped.length) pushToast(`Skipped ${skipped.map((id) => channelName(id)).join(', ')} — you are not a member`, 'err');
        await mutateMessages();
        void mutateChannels();
      } else {
        pushToast(`Broadcast failed (${r.status})`, 'err');
      }
    } catch { pushToast('Broadcast failed — check your connection', 'err'); }
    setBcBusy(false);
  };

  /* ── Directory (GET ?directory=1 → {staff, subs}) — fetched only while a
   * picker is on screen; tolerates a server without the branch. ─────────── */
  const [directOpen, setDirectOpen] = useState(false);
  const [directQuery, setDirectQuery] = useState('');
  const [directBusy, setDirectBusy] = useState<string | null>(null);
  const [rosterAddOpen, setRosterAddOpen] = useState(false);
  const [rosterAddQuery, setRosterAddQuery] = useState('');
  const [removeArm, setRemoveArm] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const dirKey = showNew || directOpen || rosterAddOpen ? '/api/radio/channels?directory=1' : null;
  const { data: dirData, error: dirError } = useSWR<{ staff?: DirectoryPerson[]; subs?: DirectoryPerson[] }>(
    dirKey, fetcher, { revalidateOnFocus: false },
  );
  const dirReady = !!dirData && (Array.isArray(dirData.staff) || Array.isArray(dirData.subs));
  const dirStaff: DirectoryPerson[] = (dirReady && dirData?.staff) || [];
  const dirSubs: DirectoryPerson[] = (dirReady && dirData?.subs) || [];

  /* Panels tied to the active channel reset when the dispatcher retunes. */
  useEffect(() => {
    setPatchOpen(false); setBcOpen(false); setMenuOpen(false);
    setBcSent(null); setRosterAddOpen(false); setRosterAddQuery(''); setRemoveArm(null);
  }, [activeId]);

  /* ── Direct 1:1 — person picker → POST {directToUserId} → tune in ────── */
  const startDirect = async (p: DirectoryPerson) => {
    const uid = personUserId(p);
    if (!uid || directBusy) return;
    setDirectBusy(personKey(p));
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directToUserId: uid, directToName: personName(p) }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.channel?.id) {
        setDirectOpen(false);
        await mutateChannels();
        setActiveId(String(j.channel.id));
        pushToast(`Direct channel with ${personName(p)} is open`, 'ok');
      } else {
        pushToast(`Could not open a direct channel (${r.status})`, 'err');
      }
    } catch { pushToast('Could not open a direct channel — check your connection', 'err'); }
    setDirectBusy(null);
  };

  /* ── Roster member management (server add/remove branches) ───────────── */
  const rosterUserIds = useMemo(
    () => new Set(rosterMembers.map((m) => m.user_id).filter((x): x is string => !!x)),
    [rosterMembers],
  );
  const rosterSubIds = useMemo(
    () => new Set(rosterMembers.map((m) => m.portal_sub_id).filter((x): x is string => !!x)),
    [rosterMembers],
  );
  const addMember = async (p: DirectoryPerson) => {
    if (!activeId || memberBusy) return;
    const uid = personUserId(p), sid = personSubId(p);
    const payload = uid
      ? { channelId: activeId, addUserId: uid }
      : sid ? { channelId: activeId, addPortalSubId: sid, displayName: personName(p) } : null;
    if (!payload) return;
    setMemberBusy(personKey(p));
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        pushToast(`${personName(p)} added to ${active?.name || 'the channel'}`, 'ok');
        await mutateRoster();
        void mutateChannels();
      } else {
        pushToast(`Could not add ${personName(p)} (${r.status})`, 'err');
      }
    } catch { pushToast(`Could not add ${personName(p)} — check your connection`, 'err'); }
    setMemberBusy(null);
  };
  const removeMember = async (mem: RosterMember) => {
    if (!mem.id || memberBusy) return;
    setMemberBusy(String(mem.id));
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeMemberId: mem.id }),
      });
      if (r.ok) {
        pushToast(`${senderShort(mem.display_name)} removed from ${active?.name || 'the channel'}`, 'ok');
        await mutateRoster();
        void mutateChannels();
      } else {
        const je = await r.json().catch(() => null);
        pushToast((je && typeof je.error === 'string' && je.error) || `Could not remove ${senderShort(mem.display_name)} (${r.status})`, 'err');
      }
    } catch { pushToast('Could not remove the member — check your connection', 'err'); }
    setMemberBusy(null);
    setRemoveArm(null);
  };

  /* ── Lock / unlock — dispatcher-invite-only groups (confirm-gated) ───── */
  const [lockConfirm, setLockConfirm] = useState<RadioChannel | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const applyLock = async () => {
    const c = lockConfirm;
    if (!c || lockBusy) return;
    setLockBusy(true);
    try {
      const r = await fetch('/api/radio/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockChannelId: c.id, locked: !c.locked }),
      });
      if (r.ok) {
        pushToast(!c.locked ? `${c.name} locked — dispatcher invite only` : `${c.name} unlocked — open to the team`, 'ok');
        await mutateChannels();
        setLockConfirm(null);
      } else {
        pushToast(`Could not ${c.locked ? 'unlock' : 'lock'} ${c.name} (${r.status})`, 'err');
      }
    } catch { pushToast('Lock change failed — check your connection', 'err'); }
    setLockBusy(false);
  };

  /* ── Channel selector state — the ONE way you pick a channel ────────── */
  const [chanOpen, setChanOpen] = useState(false);
  const [chanQuery, setChanQuery] = useState('');
  const chanRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (!chanOpen) setChanQuery(''); }, [chanOpen]);
  const tuneTo = useCallback((id: string) => {
    setActiveId(id);
    setChanOpen(false);
    setChanQuery('');
  }, []);

  /* ── Channel grouping — projects first, then Organization, Direct last ─ */
  const railGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { key: string; label: string; rows: RadioChannel[] }>();
    for (const c of channels) {
      const key = c.kind === 'direct' ? '~direct' : c.project_id ? `p:${c.project_id}` : '~org';
      const label = c.kind === 'direct' ? 'Direct' : c.project_id ? (c.project_name || 'Project') : 'Organization';
      if (!map.has(key)) { map.set(key, { key, label, rows: [] }); order.push(key); }
      map.get(key)!.rows.push(c);
    }
    const rank = (k: string) => (k === '~direct' ? 2 : k === '~org' ? 1 : 0);
    return order
      .map((k, i) => ({ k, i }))
      .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
      .map(({ k }) => map.get(k)!);
  }, [channels]);
  /* Search filter over those groups — empty groups drop out entirely. */
  const chanGroups = useMemo(() => {
    const q = chanQuery.trim().toLowerCase();
    if (!q) return railGroups;
    return railGroups
      .map((g) => ({
        ...g,
        rows: g.rows.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          String(c.project_name || '').toLowerCase().includes(q) ||
          String(channelNoRef.current.get(c.id) || '').toLowerCase().includes(q)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [railGroups, chanQuery]);
  /* Unread waiting on every channel EXCEPT the one you are tuned to — the
   * badge on the selector, so a closed dropdown never hides live traffic. */
  const unreadElsewhere = useMemo(
    () => channels.reduce((n, c) => (c.id === activeId ? n : n + (Number(c.unread) || 0)), 0),
    [channels, activeId],
  );
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of channels) if (c.project_id && !seen.has(c.project_id)) seen.set(c.project_id, c.project_name || 'Project');
    if (projectId && !seen.has(projectId)) seen.set(projectId, 'This project');
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [channels, projectId]);

  /* ── Directory list — the one member-picker renderer (check or pick) ─── */
  const renderDirectory = (opts: {
    query: string;
    mode: 'check' | 'pick';
    staffOnly?: boolean;
    excludeUsers?: Set<string>;
    excludeSubs?: Set<string>;
    selectedKeys?: Set<string>;
    busyKey?: string | null;
    pickIcon?: React.ReactNode;
    onRow: (p: DirectoryPerson) => void;
  }) => {
    if (dirKey && !dirData && !dirError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={34} borderRadius={9} />)}
        </div>
      );
    }
    if (dirError) return <div style={{ fontSize: 11.5, color: RED }}>Could not load the directory — close and reopen to retry.</div>;
    if (dirData && !dirReady) return <div style={{ fontSize: 11.5, color: FAINT }}>Directory unavailable — this server does not expose it yet.</div>;
    const q = opts.query.trim().toLowerCase();
    const hit = (p: DirectoryPerson) =>
      !q || personName(p).toLowerCase().includes(q) || String(p.role || '').toLowerCase().includes(q) || String(p.company || '').toLowerCase().includes(q);
    const staff = dirStaff.filter((p) => { const u = personUserId(p); return u && !opts.excludeUsers?.has(u) && hit(p); });
    const subs = opts.staffOnly ? [] : dirSubs.filter((p) => { const s = personSubId(p); return s && !opts.excludeSubs?.has(s) && hit(p); });
    if (!staff.length && !subs.length) {
      return <div style={{ fontSize: 11.5, color: FAINT }}>{q ? 'No one matches that search.' : 'Nobody available to add.'}</div>;
    }
    const row = (p: DirectoryPerson, sub: boolean) => {
      const key = personKey(p);
      const on = !!opts.selectedKeys?.has(key);
      const busy = opts.busyKey === key;
      return (
        <button
          key={key}
          onClick={() => opts.onRow(p)}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
            padding: '6px 8px', borderRadius: 9, marginBottom: 2, textAlign: 'left', cursor: 'pointer',
            background: on ? AMBER_SOFT : 'transparent',
            border: on ? `1px solid ${AMBER_BORDER}` : '1px solid transparent',
            color: WHITE, opacity: busy ? 0.55 : 1,
          }}
        >
          {opts.mode === 'check' ? (
            <span
              aria-hidden
              style={{
                flexShrink: 0, width: 15, height: 15, borderRadius: 5,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: on ? `linear-gradient(180deg, ${GOLD_HI}, ${GOLD})` : FIELD_BG,
                border: on ? 'none' : FIELD_BORDER, color: '#0A0A00',
              }}
            >
              {on && <Check size={10} weight="bold" />}
            </span>
          ) : (
            <span aria-hidden style={{ flexShrink: 0, display: 'inline-flex', color: GOLD_HI }}>
              {opts.pickIcon || <UserPlus size={13} weight="bold" />}
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {busy ? 'Working…' : personName(p)}
          </span>
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: FAINT, whiteSpace: 'nowrap' }}>
            {sub ? 'Sub' : String(p.role || 'Staff').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 14)}
          </span>
        </button>
      );
    };
    return (
      <>
        {staff.length > 0 && <div style={{ ...eyebrowStyle, margin: '2px 0 4px' }}>Staff</div>}
        {staff.map((p) => row(p, false))}
        {subs.length > 0 && <div style={{ ...eyebrowStyle, margin: '6px 0 4px' }}>Subcontractors</div>}
        {subs.map((p) => row(p, true))}
      </>
    );
  };

  /* ── PANIC (hold-to-confirm, best-effort geolocation) ───────────────── */
  const PANIC_HOLD_MS = 1500;
  const [panicHold, setPanicHold] = useState(0); // 0..1
  const [panicSent, setPanicSent] = useState(false);
  const [panicFiring, setPanicFiring] = useState(false);
  const panicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panicFiredRef = useRef(false);

  const firePanic = async () => {
    if (panicFiring) return;
    setPanicFiring(true);
    const location = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const to = setTimeout(() => resolve(null), 2500);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(to); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { clearTimeout(to); resolve(null); },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 60_000 },
      );
    });
    try {
      const payload: Record<string, unknown> = location ? { location } : {};
      if (activeId) payload.channelId = activeId; else if (projectId) payload.projectId = projectId;
      const r = await fetch('/api/radio/panic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setPanicSent(true);
        setTimeout(() => setPanicSent(false), 6000);
        await mutateMessages();
      }
    } catch { /* panic row absence tells the dispatcher to retry */ }
    setPanicFiring(false);
  };
  const panicDown = () => {
    if (panicFiring) return;
    panicFiredRef.current = false;
    const started = Date.now();
    panicTimerRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / PANIC_HOLD_MS);
      setPanicHold(p);
      if (p >= 1 && !panicFiredRef.current) {
        panicFiredRef.current = true;
        if (panicTimerRef.current) clearInterval(panicTimerRef.current);
        setPanicHold(0);
        firePanic();
      }
    }, 50);
  };
  const panicUp = () => {
    if (panicTimerRef.current) clearInterval(panicTimerRef.current);
    panicTimerRef.current = null;
    setPanicHold(0);
  };
  useEffect(() => () => { if (panicTimerRef.current) clearInterval(panicTimerRef.current); }, []);

  /* ── Site Map (dispatch map + human heatmap) ────────────────────── */
  /* Collapsible panel over /api/radio/location: live pins poll at 15s while
   * the panel is open, heat bins at 60s. Keys are null while collapsed (or
   * without a projectId) so the closed panel costs zero requests. */
  const [mapOpen, setMapOpen] = useState(false);
  const [mapHours, setMapHours] = useState(10);
  const crewKey = mapOpen && projectId
    ? `/api/radio/location?projectId=${encodeURIComponent(projectId)}`
    : null;
  const { data: crewData, error: crewErr } = useSWR<{ crew: CrewPin[] }>(
    crewKey, fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  const heatKey = mapOpen && projectId
    ? `/api/radio/location?projectId=${encodeURIComponent(projectId)}&heatmap=1&hours=${mapHours}`
    : null;
  const { data: heatData, error: heatErr } = useSWR<{ bins: HeatBin[]; samples: number }>(
    heatKey, fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  /* Live unresolved panic positions from the active feed — pulsing red pins. */
  const panicPins = useMemo(
    () => messages
      .filter((m) => m.kind === 'panic' && !m.panic_resolved_at)
      .map((m) => {
        const trail = Array.isArray(m.location_trail)
          ? m.location_trail.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
          : [];
        const pos = trail.length ? trail[trail.length - 1] : m.location;
        return pos && typeof pos.lat === 'number' && typeof pos.lng === 'number'
          ? { lat: pos.lat, lng: pos.lng, name: senderShort(m.sender_name) }
          : null;
      })
      .filter((p): p is { lat: number; lng: number; name: string } => !!p),
    [messages],
  );
  const mapLoading = !!crewKey && ((!crewData && !crewErr) || (!heatData && !heatErr));

  /* ── Stats ──────────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const reachable = channels.reduce((max, c) => Math.max(max, Number(c.members) || 0), 0);
    const monitored = channels.filter((c) => isMonitored(c)).length;
    const trafficToday = messages.filter((m) => isToday(m.created_at)).length;
    return { channels: channels.length, reachable, monitored, trafficToday };
  }, [channels, messages, isMonitored]);

  const firstLoad = !chData && !chError;
  const playingMsg = playingId ? messages.find((m) => m.id === playingId) || null : null;
  const onAir = micOpen || keyed || !!playingId;

  /* ── The zero-listener truth ─────────────────────────────────────────
   * The single most dishonest thing a radio can do is let you transmit into
   * an empty channel while the screen reads "1 member". The deck says it out
   * loud, on the sending console, before the key goes down. */
  const otherMembers = active ? Math.max(0, (Number(active.members) || 0) - 1) : 0;
  const activeLive = active && typeof active.onChannel === 'number' && active.onChannel > 0 ? active.onChannel : 0;
  const listenerTruth: { tone: 'none' | 'idle' | 'live'; text: string } | null = !active
    ? null
    : otherMembers === 0
      ? { tone: 'none', text: 'Nobody else is on this channel — a transmission has no listeners until you add someone.' }
      : activeLive <= 1
        ? { tone: 'idle', text: `Nobody is live on this channel right now — your ${otherMembers === 1 ? 'teammate hears' : `${otherMembers} teammates hear`} it when the radio is next open.` }
        : { tone: 'live', text: `${activeLive} on channel now of ${otherMembers + 1} on the roster.` };

  /* ── SENT → DELIVERED → HEARD BY, on the SENDING console ─────────────
   * Receipts already ride the feed GET; the sender should never have to hover
   * a row to learn whether anyone actually heard them. */
  const pendingHere = useMemo(() => pending.filter((p) => p.channelId === activeId), [pending, activeId]);
  const myLastVoice = useMemo(() => {
    if (!myUserId) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind === 'voice' && m.sender_user_id === myUserId) return m;
    }
    return null;
  }, [messages, myUserId]);
  const txReceipt = useMemo((): { tone: 'work' | 'ok' | 'warn' | 'bad'; text: string } | null => {
    const sending = pendingHere.filter((p) => p.status === 'sending').length;
    const held = pendingHere.filter((p) => p.status !== 'sending').length;
    if (sending) return { tone: 'work', text: `SENT — delivering ${sending} clip${sending === 1 ? '' : 's'}…` };
    if (held) return { tone: 'bad', text: `HELD — ${held} clip${held === 1 ? '' : 's'} not delivered. Retry from the row below.` };
    if (!myLastVoice) return null;
    const played = (myLastVoice.receipts || []).filter((r) => r && r.action !== 'seen' && (!myUserId || r.user_id !== myUserId));
    const present = Array.isArray(myLastVoice.present_at_send)
      ? myLastVoice.present_at_send.filter((p) => p && (!myUserId || p.user_id !== myUserId)).length
      : 0;
    const stamp = `DELIVERED ${timeOf(myLastVoice.created_at)}`;
    if (played.length > 0) {
      return { tone: 'ok', text: `${stamp} · HEARD BY ${played.length}${present ? ` of ${present} on channel` : ''} — ${played.map((r) => r.display_name || 'Member').join(', ')}` };
    }
    if (present > 0) return { tone: 'warn', text: `${stamp} · ${present} on channel, nobody has played it yet` };
    return { tone: 'warn', text: `${stamp} · nobody was on the channel to hear it` };
  }, [pendingHere, myLastVoice, myUserId]);

  /* ── Standby (radio-face panel when the feed is quiet) ──────────────── */
  /* Most recent traffic anywhere on the band — the rail data already has it. */
  const lastTraffic = useMemo(() => {
    let best: RadioChannel | null = null;
    for (const c of channels) {
      const at = c.lastMessage?.at;
      if (!at) continue;
      if (!best || new Date(at).getTime() > new Date(best.lastMessage!.at).getTime()) best = c;
    }
    return best;
  }, [channels]);
  /* The feed region never renders as a void: with no channel selected, or a
   * selected channel showing two or fewer rows, the standby panel fills it.
   * With NO channels at all the zero-state owns the region instead — the two
   * must never stack. */
  const standbyOn = !firstLoad && !msgError && channels.length > 0
    && (active ? !!msgData && messages.length <= 2 : !chError);

  /* ── Render helpers ─────────────────────────────────────────────────── */
  const renderTranscript = (m: RadioMessage) => {
    const translated = m.translations?.[lang];
    const base = m.transcript || null;
    const text = translated || base;
    if (!text) return null;
    return (
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 6, fontStyle: translated ? 'normal' : 'italic' }}>
        {translated && m.detected_lang && m.detected_lang !== lang && (
          <span style={{ color: FAINT, fontWeight: 800, fontSize: 10, marginRight: 6 }}>
            {lang.toUpperCase()}
          </span>
        )}
        {text}
      </div>
    );
  };

  const renderVoicePlayer = (m: RadioMessage) => {
    if (!m.audio_url) return null;
    const isPlaying = playingId === m.id;
    const n = Math.max(18, Math.min(42, Math.round((m.audio_duration_secs || 8) * 2)));
    const heights = waveHeights(m.id, n);
    const playedTo = isPlaying ? Math.floor(playProg * n) : 0;
    const unheardClip = !heard.has(m.id) && (!myUserId || m.sender_user_id !== myUserId);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, maxWidth: 420 }}>
        <button
          onClick={() => toggleClip(m)}
          aria-label={isPlaying ? 'Stop playback' : 'Play voice clip'}
          title={isPlaying ? 'Stop' : 'Play'}
          style={{
            flexShrink: 0, width: 32, height: 32, borderRadius: 10, padding: 0, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: isPlaying ? 'linear-gradient(180deg, var(--brand-primary-35), color-mix(in srgb, var(--brand-primary) 16%, transparent))' : 'var(--brand-primary-12)',
            border: `1px solid ${AMBER_BORDER}`, color: GOLD_HI,
          }}
        >
          {isPlaying ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
        </button>
        <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 28, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {heights.map((h, i) => (
            <span
              key={i}
              style={{
                width: 3, flexShrink: 0, borderRadius: 2,
                height: Math.round(5 + h * 22),
                background: isPlaying && i < playedTo
                  ? GOLD_HI
                  : unheardClip ? 'color-mix(in srgb, var(--brand-primary) 50%, transparent)' : 'rgba(255,255,255,0.24)',
                transformOrigin: 'center',
                animation: isPlaying && i >= playedTo
                  ? `sagRadioEq ${0.8 + (i % 4) * 0.14}s ease-in-out ${(i % 5) * 0.07}s infinite`
                  : undefined,
              }}
            />
          ))}
        </span>
        {isPlaying && <EqBars size={12} />}
      </div>
    );
  };

  const renderRow = (m: RadioMessage) => {
    const panic = m.kind === 'panic';
    const alert = m.kind === 'alert';
    const tone = m.kind === 'tone' ? TONES[m.body || ''] : undefined;
    const resolved = panic && !!m.panic_resolved_at;
    const rowBg = panic ? (resolved ? 'rgba(239,68,68,0.05)' : RED_SOFT) : alert ? AMBER_SOFT : 'transparent';
    const rowBorder = panic
      ? `1px solid ${resolved ? 'rgba(239,68,68,0.20)' : RED_BORDER}`
      : alert ? `1px solid ${AMBER_BORDER}` : `1px solid ${BORDER}`;
    const translatedBody = m.translations?.[lang];
    const trail = panic && Array.isArray(m.location_trail)
      ? m.location_trail.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
      : [];
    const unheardClip = m.kind === 'voice' && !!m.audio_url && !heard.has(m.id) && (!myUserId || m.sender_user_id !== myUserId);
    const seenN = Number(m.seen_count ?? NaN);
    const showSeen = (alert || panic) && !!myUserId && m.sender_user_id === myUserId && Number.isFinite(seenN) && seenN > 0;
    /* R13 heard-by: on YOUR voice rows, who has played the clip vs. who was
     * live on the channel when you sent it. Absent pre-migration → no chip. */
    const mine = !!myUserId && m.sender_user_id === myUserId;
    const played = mine && m.kind === 'voice'
      ? (m.receipts || []).filter((r) => r && r.action !== 'seen' && (!myUserId || r.user_id !== myUserId))
      : [];
    const presentN = mine && m.kind === 'voice' && Array.isArray(m.present_at_send)
      ? m.present_at_send.filter((p) => p && (!myUserId || p.user_id !== myUserId)).length
      : 0;
    const heardNames = played.map((r) => r.display_name || 'Member').join(', ');
    const showHeard = mine && m.kind === 'voice' && (played.length > 0 || presentN > 0);
    return (
      <div
        key={m.id}
        className="sagRadioRow"
        style={{
          display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12,
          background: rowBg, border: rowBorder, marginBottom: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 10,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: panic ? RED_SOFT : 'var(--brand-primary-12)',
            border: panic ? `1px solid ${RED_BORDER}` : '1px solid var(--brand-primary-25)',
            color: panic ? RED : GOLD_HI, fontSize: 11.5, fontWeight: 900,
          }}
        >
          {panic ? <Siren size={16} weight="fill" /> : alert ? <Warning size={16} weight="fill" /> : m.kind === 'voice' ? <SpeakerHigh size={15} weight="fill" /> : m.kind === 'tone' ? <BellRinging size={15} weight="fill" /> : initialsOf(m.sender_name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: panic ? RED : alert ? GOLD_HI : WHITE }}>
              {senderShort(m.sender_name)}
            </span>
            {m.patched_from && (
              <span
                title={`Mirrored from ${channelName(m.patched_from)} through an active patch`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, color: FAINT, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }}
              >
                <PlugsConnected size={10} weight="bold" /> via {channelName(m.patched_from)}
              </span>
            )}
            {panic && (
              <span style={{ fontSize: 9.5, fontWeight: 900, color: RED, border: `1px solid ${RED_BORDER}`, borderRadius: 999, padding: '1px 7px' }}>
                PANIC
              </span>
            )}
            {resolved && (
              <span style={{ fontSize: 9.5, fontWeight: 900, color: GREEN, border: `1px solid ${GREEN_BORDER}`, borderRadius: 999, padding: '1px 7px' }}>
                RESOLVED {timeOf(m.panic_resolved_at as string)}
              </span>
            )}
            {alert && (
              <span style={{ fontSize: 9.5, fontWeight: 900, color: GOLD_HI, border: `1px solid ${AMBER_BORDER}`, borderRadius: 999, padding: '1px 7px' }}>
                ALERT
              </span>
            )}
            {m.kind === 'voice' && m.audio_duration_secs != null && (
              <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{secsLabel(m.audio_duration_secs)}</span>
            )}
            {unheardClip && (
              <span style={{ fontSize: 9, fontWeight: 900, color: GOLD_HI, background: AMBER_SOFT, border: `1px solid ${AMBER_BORDER}`, borderRadius: 999, padding: '1px 6px' }}>
                NEW
              </span>
            )}
            <span style={{ fontSize: 11, color: FAINT, marginLeft: 'auto', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {timeOf(m.created_at)}
            </span>
            {/* Hover actions — quick reach for the two filing verbs. Neither is
              * hover-ONLY: both also live in the always-present overflow menu. */}
            <span className="sagRowActions" style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => openPromote(m)}
                title="Turn this transmission into a tracked record — the audio goes with it as evidence"
                style={{ ...rowActionStyle, color: GOLD_HI, borderColor: AMBER_BORDER, background: AMBER_SOFT }}
              >
                <NotePencil size={11} weight="bold" /> Make a record
              </button>
              {filedIds.has(m.id) ? (
                <span style={{ ...rowActionStyle, cursor: 'default', color: GREEN, borderColor: GREEN_BORDER, background: GREEN_SOFT }}>
                  <Check size={11} weight="bold" /> Filed
                </span>
              ) : (
                <button
                  onClick={() => fileToLog(m)}
                  disabled={filingId === m.id}
                  title="File this transmission to the project daily log"
                  style={{ ...rowActionStyle, opacity: filingId === m.id ? 0.6 : 1 }}
                >
                  <ClipboardText size={11} weight="bold" /> {filingId === m.id ? 'Filing…' : 'File to log'}
                </button>
              )}
            </span>
            {/* Always present — a touch device and a keyboard both get here. */}
            <button
              onClick={(e) => openRowMenu(e, m.id)}
              aria-label={`Actions for ${senderShort(m.sender_name)}'s transmission`}
              title="Actions"
              style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: 7, padding: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: rowMenu?.id === m.id ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${rowMenu?.id === m.id ? AMBER_BORDER : BORDER}`,
                color: rowMenu?.id === m.id ? GOLD_HI : FAINT, cursor: 'pointer',
              }}
            >
              <DotsThree size={14} weight="bold" />
            </button>
          </div>

          {tone && (
            <div style={{ marginTop: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: tone.soft, border: `1px solid ${tone.border}`, color: tone.color, fontSize: 11, fontWeight: 900 }}>
                <BellRinging size={12} weight="fill" /> {tone.label}
                <span style={{ color: FAINT, fontWeight: 700, letterSpacing: 'normal' }}>beep</span>
              </span>
            </div>
          )}

          {m.kind === 'voice' && renderVoicePlayer(m)}
          {m.kind === 'voice' && renderTranscript(m)}

          {m.kind === 'image' && m.image_url && (
            <a href={m.image_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
              <img src={m.image_url} alt="Radio photo" style={{ maxWidth: 260, maxHeight: 200, borderRadius: 10, border: `1px solid ${BORDER}`, display: 'block' }} />
            </a>
          )}

          {m.kind !== 'voice' && m.kind !== 'tone' && m.body && (
            <div style={{ fontSize: 13.5, color: panic ? '#FCA5A5' : WHITE, lineHeight: 1.55, marginTop: 4, overflowWrap: 'anywhere' }}>
              {m.body}
            </div>
          )}
          {m.kind !== 'voice' && translatedBody && translatedBody !== m.body && (
            <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 4 }}>
              <span style={{ color: FAINT, fontWeight: 800, fontSize: 10, marginRight: 6 }}>{lang.toUpperCase()}</span>
              {translatedBody}
            </div>
          )}

          {/* Location trail (v2) — numbered breadcrumbs, newest last */}
          {trail.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, color: '#FCA5A5' }}>Trail</span>
              {trail.map((p, i) => (
                <a
                  key={i}
                  href={`https://maps.google.com/?q=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`${i === trail.length - 1 ? 'Latest position' : `Position ${i + 1}`}${p.at ? ` — ${timeOf(p.at)}` : ''}`}
                  style={{
                    width: 24, height: 24, borderRadius: 999, textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                    background: i === trail.length - 1 ? 'rgba(239,68,68,0.35)' : RED_SOFT,
                    border: `1px solid ${RED_BORDER}`, color: '#FCA5A5',
                  }}
                >
                  {i + 1}
                </a>
              ))}
            </div>
          )}

          {panic && trail.length === 0 && m.location && typeof m.location.lat === 'number' && (
            <a
              href={`https://maps.google.com/?q=${m.location.lat},${m.location.lng}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
                padding: '5px 12px', borderRadius: 999, textDecoration: 'none',
                background: RED_SOFT, border: `1px solid ${RED_BORDER}`,
                color: '#FCA5A5', fontSize: 11.5, fontWeight: 800,
              }}
            >
              <MapPin size={13} weight="fill" /> Open location in Google Maps
            </a>
          )}

          {/* What this transmission became. Read back from the server, so the
            * chips are still here tomorrow — and each one opens the record. */}
          {(links[m.id] || []).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {(links[m.id] || []).map((l) => {
                const a = promoteAccent(l.recordType);
                const chip: React.CSSProperties = {
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 999, textDecoration: 'none',
                  background: a.soft, border: `1px solid ${a.ring}`, color: a.hex,
                  fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap',
                };
                const label = <>→ {l.recordLabel}</>;
                return l.href ? (
                  <a key={l.id} href={l.href} title={`Open ${l.recordLabel}`} style={chip}>
                    {label}<ArrowSquareOut size={10} weight="bold" />
                  </a>
                ) : (
                  <span key={l.id} title={l.recordLabel} style={{ ...chip, cursor: 'default' }}>{label}</span>
                );
              })}
            </div>
          )}

          {showSeen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: FAINT, marginTop: 5 }}>
              <Check size={11} weight="bold" /> Seen by {seenN}
            </div>
          )}
          {showHeard && (
            <div
              title={played.length ? `Played by: ${heardNames}` : 'Nobody has played this clip yet'}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: played.length ? GREEN : FAINT, marginTop: 5, fontWeight: 700 }}
            >
              <Check size={11} weight="bold" />
              {presentN > 0
                ? `Heard by ${played.length} of ${presentN} on channel`
                : `Heard by ${played.length}`}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── One line in the CHANNEL dropdown ────────────────────────────────
   * Everything the old rail buried — priority, lock, monitor — is a visible
   * control at the one icon geometry the console uses everywhere. */
  const chanRow = (c: RadioChannel) => {
    const isActive = c.id === activeId;
    const mon = isMonitored(c);
    const lm = c.lastMessage;
    const unread = typeof c.unread === 'number' && c.unread > 0 ? c.unread : 0;
    const onCh = typeof c.onChannel === 'number' && c.onChannel > 0 ? c.onChannel : 0;
    const preview = lm ? trafficPreview(lm) : 'No traffic yet';
    return (
      <div
        key={c.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
          borderRadius: 11, marginBottom: 3,
          background: isActive ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 16%, transparent), color-mix(in srgb, var(--brand-primary) 5%, transparent))' : 'transparent',
          border: isActive ? `1px solid ${AMBER_BORDER}` : '1px solid transparent',
        }}
      >
        <button
          onClick={() => tuneTo(c.id)}
          title={`Tune to ${c.name}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            cursor: 'pointer', color: WHITE,
          }}
        >
          <span
            style={{
              flexShrink: 0, fontSize: 10, fontWeight: 900,
              fontVariantNumeric: 'tabular-nums', color: isActive ? GOLD_HI : FAINT,
              border: `1px solid ${isActive ? AMBER_BORDER : BORDER}`, borderRadius: 7, padding: '4px 7px',
            }}
          >
            {channelNo.get(c.id) || 'CH'}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {c.kind === 'direct'
                ? <ChatCircleText size={12} weight="bold" color={FAINT} style={{ flexShrink: 0 }} />
                : <Hash size={12} weight="bold" color={FAINT} style={{ flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 800, color: isActive ? GOLD_HI : WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.name}
              </span>
              {c.locked && <Lock size={11} weight="fill" color={GOLD_HI} style={{ flexShrink: 0 }} />}
              {c.priority && <Star size={11} weight="fill" color={GOLD_HI} style={{ flexShrink: 0 }} />}
              {lm?.kind === 'panic' && <Siren size={12} weight="fill" color={RED} style={{ flexShrink: 0 }} />}
            </span>
            <span style={{ display: 'block', fontSize: 10.5, color: FAINT, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.members} on roster
              {onCh > 0 && <span style={{ color: GREEN, fontWeight: 800 }}>{` · ${onCh} live`}</span>}
              {` · ${preview}`}
            </span>
          </span>
        </button>
        {unread > 0 && !isActive && (
          <span
            title={`${unread} unread transmission${unread === 1 ? '' : 's'}`}
            style={{
              flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(180deg, ${GOLD_HI}, ${GOLD})`,
              color: '#0A0A00', fontSize: 10.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        {c.kind !== 'direct' && (
          <button
            onClick={() => setLockConfirm(c)}
            title={c.locked ? 'Locked — dispatcher invite only. Click to unlock.' : 'Lock this channel — invite only, invisible to non-members'}
            aria-label={c.locked ? `Unlock ${c.name}` : `Lock ${c.name}`}
            style={miniBtnStyle(!!c.locked)}
          >
            {c.locked ? <Lock size={13} weight="fill" /> : <LockOpen size={13} weight="bold" />}
          </button>
        )}
        <button
          onClick={() => togglePriority(c)}
          disabled={prioBusy === c.id}
          title={c.priority ? 'Priority channel — click to clear' : 'Make this a priority channel (interrupts scanning first)'}
          aria-label={c.priority ? `Clear priority on ${c.name}` : `Make ${c.name} a priority channel`}
          style={{ ...miniBtnStyle(!!c.priority), opacity: prioBusy === c.id ? 0.5 : 1 }}
        >
          <Star size={13} weight={c.priority ? 'fill' : 'bold'} />
        </button>
        <button
          onClick={() => toggleMonitor(c)}
          title={mon ? 'Monitoring — click to mute on this board' : 'Muted on this board — click to monitor'}
          aria-label={mon ? `Stop monitoring ${c.name}` : `Monitor ${c.name}`}
          style={miniBtnStyle(mon)}
        >
          {mon ? <Waveform size={13} weight="bold" /> : <WaveformSlash size={13} weight="bold" />}
        </button>
      </div>
    );
  };

  /* ── Optimistic transmission row ─────────────────────────────────────
   * A released key paints a row IMMEDIATELY, before the upload resolves, and
   * that row tells the whole truth: delivering, queued for retry, or held
   * with the reason and a one-click RETRY. Audio is never lost silently. */
  const renderPendingRow = (p: PendingTx) => {
    const working = p.status === 'sending';
    const held = p.status === 'failed';
    return (
      <div
        key={p.localId}
        style={{
          display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12, marginBottom: 8,
          background: held ? RED_SOFT : AMBER_SOFT,
          border: `1px solid ${held ? RED_BORDER : AMBER_BORDER}`,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 10,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: held ? RED_SOFT : 'var(--brand-primary-12)',
            border: `1px solid ${held ? RED_BORDER : 'var(--brand-primary-25)'}`,
            color: held ? RED : GOLD_HI,
          }}
        >
          {held ? <Warning size={16} weight="fill" /> : <SpeakerHigh size={15} weight="fill" />}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: WHITE }}>You</span>
            <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{p.secs.toFixed(1)}s · {sizeLabel(p.bytes)}</span>
            <span
              style={{
                fontSize: 9.5, fontWeight: 900, borderRadius: 999, padding: '1px 8px',
                color: held ? RED : GOLD_HI, border: `1px solid ${held ? RED_BORDER : AMBER_BORDER}`,
              }}
            >
              {working ? 'Sending' : held ? 'Held — Not Delivered' : 'Queued — Retrying'}
            </span>
            {working && <EqBars size={12} />}
            <span style={{ fontSize: 11, color: FAINT, marginLeft: 'auto', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {timeOf(new Date(p.createdAt).toISOString())}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: held ? '#FCA5A5' : MUTED, marginTop: 5, lineHeight: 1.45 }}>
            {working
              ? `Delivering to ${p.channelName}…`
              : held
                ? `Saved on this device${p.error ? ` — ${p.error}` : ''}. It survives a reload; retry when you have signal.`
                : `Retrying delivery to ${p.channelName}${p.error ? ` — ${p.error}` : ''}`}
          </div>
          {!working && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => retryClip(p)} style={{ ...rowActionStyle, color: GOLD_HI, borderColor: AMBER_BORDER, background: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' }}>
                <PaperPlaneRight size={11} weight="bold" /> Retry
              </button>
              <button onClick={() => discardClip(p)} title="Delete this recording for good" style={{ ...rowActionStyle, color: '#FCA5A5', borderColor: RED_BORDER, background: RED_SOFT }}>
                <Trash size={11} weight="bold" /> Discard
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── Page ─────────────────────────────────────────────────────────────
   * Tightened page padding: this screen is a console, not a document. The
   * hero and the console plate are sized to fit one viewport so the feed
   * inside the plate stays the only thing that scrolls. */
  return (
    <PremiumSurface maxWidth={2200} pad="26px 24px 26px">
      <style>{`
        @keyframes sagRadioEq { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
        .sagRadioRow .sagRowActions { opacity: 0; pointer-events: none; transition: opacity .15s ease; }
        .sagRadioRow:hover .sagRowActions, .sagRadioRow:focus-within .sagRowActions { opacity: 1; pointer-events: auto; }
        @media print {
          body * { visibility: hidden; }
          #sagRadioLogPrint, #sagRadioLogPrint * {
            visibility: visible;
            color: #111111 !important;
            background: #FFFFFF !important;
            border-color: #BBBBBB !important;
            box-shadow: none !important;
          }
          #sagRadioLogPrint { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          /* The log dialog is a fixed flex card with its own scroll region —
           * flatten the whole chain so the record prints in full, not clipped
           * to one screenful. */
          .sagRadioLogOverlay,
          .sagRadioLogOverlay div {
            position: static !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            background: none !important;
            box-shadow: none !important;
          }
          .sagLogControls { display: none !important; }
        }
        /* Instrument readouts appear once the header has room for them. */
        @media (min-width: 1200px) { .sagReadout { display: flex !important; } }
      `}</style>
      <ModuleHero
        eyebrow="Dispatch Console"
        eyebrowIcon={<Broadcast size={13} weight="bold" />}
        title={
          <>
            <VividGoldChip
              icon={<Broadcast size={26} weight="fill" />}
              size={50}
              style={{ verticalAlign: 'middle', marginRight: 16, transform: 'translateY(-3px)' }}
            />
            Saguaro
          </>
        }
        accent="Radio"
        subtitle="Push-to-talk for the crew, with English and Spanish transcripts."
        actions={
          <>
            {/* Assistance queue toggle — badge counts the live queue */}
            <button
              onClick={() => setAssistShown((v) => !v)}
              title="Assistance queue — field requests waiting on dispatch"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                background: assistShown ? 'linear-gradient(180deg, var(--brand-primary-25), color-mix(in srgb, var(--brand-primary) 14%, transparent))' : FIELD_BG,
                border: assistOpenCount > 0 ? `1px solid ${RED_BORDER}` : FIELD_BORDER,
                color: assistShown ? GOLD_HI : MUTED, fontWeight: 800, fontSize: 12.5,
              }}
            >
              <Lifebuoy size={15} weight="bold" /> Assist
              {assistQueue.length > 0 && (
                <span
                  style={{
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: assistOpenCount > 0 ? RED : 'rgba(255,255,255,0.14)',
                    color: assistOpenCount > 0 ? WHITE : MUTED,
                    fontSize: 10, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {assistQueue.length}
                </span>
              )}
            </button>
            {/* EN/ES lives in the console overflow menu — a transcript
              * preference does not earn permanent chrome. */}
            {/* PANIC — hold to confirm */}
            <button
              onPointerDown={panicDown}
              onPointerUp={panicUp}
              onPointerLeave={panicUp}
              onPointerCancel={panicUp}
              disabled={panicFiring}
              title="Hold to send a panic alarm to every channel member"
              style={{
                position: 'relative', overflow: 'hidden',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 20px', borderRadius: 12, cursor: panicFiring ? 'wait' : 'pointer',
                background: panicSent ? GREEN_SOFT : RED_SOFT,
                border: `1px solid ${panicSent ? GREEN_BORDER : RED_BORDER}`,
                color: panicSent ? GREEN : RED, fontWeight: 900, fontSize: 13,
                userSelect: 'none', touchAction: 'none',
              }}
            >
              <span
                aria-hidden
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${panicHold * 100}%`,
                  background: 'rgba(239,68,68,0.35)',
                  transition: panicHold === 0 ? 'width .2s ease' : 'none',
                }}
              />
              <Siren size={16} weight="fill" style={{ position: 'relative' }} />
              <span style={{ position: 'relative' }}>
                {panicFiring ? 'Sending…' : panicSent ? 'Panic Sent' : 'Hold — Panic'}
              </span>
            </button>
          </>
        }
      />

      {/* ══════════════════════════════════════════════════════════════════
        * DISPATCH CONSOLE
        * One plate, fixed height. Instrument header on top, ONE scrolling
        * feed in the middle, a fixed transmit deck at the bottom. Channel and
        * roster are dropdowns, not rails. Every other surface is a dialog.
        * ═════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          height: 'min(900px, calc(100vh - 300px))', minHeight: 520,
          borderRadius: 16, background: 'rgba(16,16,18,0.82)', border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 48px -32px color-mix(in srgb, var(--brand-primary) 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* ── Instrument header ──────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '11px 12px', borderBottom: `1px solid ${BORDER}`,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.035), transparent)',
            borderRadius: '16px 16px 0 0',
          }}
        >
          {/* CHANNEL — the primary act of a CB is one always-visible selector */}
          <div ref={chanRef} style={{ position: 'relative', flex: '1 1 260px', minWidth: 210, maxWidth: 430 }}>
            <button
              onClick={() => { setChanOpen((v) => !v); setRosterOpen(false); setMenuOpen(false); }}
              aria-expanded={chanOpen}
              aria-label="Choose Channel"
              title="Choose a Channel"
              disabled={firstLoad}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
                height: TOOL_H, padding: '0 10px', borderRadius: 10, textAlign: 'left',
                background: chanOpen
                  ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 26%, transparent), var(--brand-primary-12))'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))',
                border: chanOpen ? `1px solid ${AMBER_BORDER}` : FIELD_BORDER,
                color: WHITE, cursor: firstLoad ? 'default' : 'pointer', opacity: firstLoad ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 900,
                  fontVariantNumeric: 'tabular-nums', color: GOLD_HI,
                  border: `1px solid ${AMBER_BORDER}`, borderRadius: 7, padding: '3px 7px',
                }}
              >
                {active ? (channelNo.get(active.id) || 'CH') : 'CH —'}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                  {active ? active.name : firstLoad ? 'Loading channels…' : 'No channel tuned'}
                </span>
                <span style={{ display: 'block', fontSize: 10, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {active
                    ? `${active.project_name ? `${active.project_name} · ` : active.kind === 'direct' ? 'Direct · ' : 'Organization · '}${active.members} on roster${active.locked ? ' · locked' : ''}${active.priority ? ' · priority' : ''}`
                    : 'Pick one to start'}
                </span>
              </span>
              {unreadElsewhere > 0 && (
                <span
                  title={`${unreadElsewhere} unread on other channels`}
                  style={{
                    flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(180deg, ${GOLD_HI}, ${GOLD})`, color: '#0A0A00',
                    fontSize: 10.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {unreadElsewhere > 99 ? '99+' : unreadElsewhere}
                </span>
              )}
              <CaretDown size={13} weight="bold" color={FAINT} style={{ flexShrink: 0, transform: chanOpen ? 'rotate(180deg)' : 'none', transition: 'transform .16s ease' }} />
            </button>

            <Dropdown open={chanOpen} onClose={() => setChanOpen(false)} anchorRef={chanRef} width={470}>
              <div style={{ flexShrink: 0, padding: 10, borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ position: 'relative' }}>
                  <MagnifyingGlass size={13} weight="bold" color={FAINT} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={chanQuery}
                    onChange={(e) => setChanQuery(e.target.value)}
                    placeholder="Search channels…"
                    autoFocus
                    style={{ ...fieldStyle, padding: '8px 12px 8px 30px' }}
                  />
                </div>
              </div>
              {/* ── the one scroll region of this dropdown ── */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
                {chanGroups.length === 0 && (
                  <div style={{ fontSize: 12, color: FAINT, padding: '10px 6px' }}>
                    {chanQuery.trim() ? 'No channel matches that search.' : 'No channels yet — start one below.'}
                  </div>
                )}
                {chanGroups.map((grp) => (
                  <div key={grp.key} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 5px', minWidth: 0 }}>
                      <span style={{ ...eyebrowStyle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        {grp.label}
                      </span>
                      <span aria-hidden style={{ flex: 1, height: 1, background: BORDER }} />
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{grp.rows.length}</span>
                    </div>
                    {grp.rows.map(chanRow)}
                  </div>
                ))}
              </div>
              <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${BORDER}` }}>
                <button onClick={() => { setChanOpen(false); setShowNew(true); }} style={{ ...toolBtnStyle(false, true), flex: 1 }}>
                  <Plus size={13} weight="bold" /> New talkgroup
                </button>
                <button onClick={() => { setChanOpen(false); setDirectOpen(true); }} style={{ ...toolBtnStyle(false, true), flex: 1 }}>
                  <ChatCircleText size={13} weight="bold" /> Direct message
                </button>
              </div>
            </Dropdown>
          </div>

          {/* ON CHANNEL — the roster, promoted out of a buried popover */}
          <div ref={rosterRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => { pendingSelfEditRef.current = false; setRosterOpen((v) => !v); setChanOpen(false); setMenuOpen(false); }}
              disabled={!active}
              aria-expanded={rosterOpen}
              title="Who is on this channel — presence, call signs, add and remove members"
              style={{
                ...toolBtnStyle(rosterOpen, !!active),
                borderColor: listenerTruth?.tone === 'none' ? RED_BORDER : undefined,
                color: rosterOpen ? GOLD_HI : listenerTruth?.tone === 'none' ? '#FCA5A5' : listenerTruth?.tone === 'live' ? GREEN : MUTED,
              }}
            >
              <UsersThree size={13} weight="bold" />
              {!active ? 'On Channel'
                : otherMembers === 0 ? 'Nobody else'
                  : activeLive > 1 ? `${activeLive} live · ${otherMembers + 1}`
                    : `${otherMembers + 1} on roster`}
              <CaretDown size={11} weight="bold" style={{ transform: rosterOpen ? 'rotate(180deg)' : 'none', transition: 'transform .16s ease' }} />
            </button>

            <Dropdown open={rosterOpen && !!active} onClose={() => setRosterOpen(false)} anchorRef={rosterRef} width={380}>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderBottom: `1px solid ${BORDER}` }}>
                <UsersThree size={14} weight="bold" color={GOLD_HI} />
                <span style={{ fontSize: 11, fontWeight: 900, color: GOLD_HI, whiteSpace: 'nowrap' }}>On Channel</span>
                <span style={{ fontSize: 11, color: FAINT, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active?.name}</span>
                <button onClick={() => setRosterOpen(false)} aria-label="Close the roster" style={closeBtnStyle}><X size={14} weight="bold" /></button>
              </div>
              {/* ── the one scroll region of this dropdown ── */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
                {listenerTruth && (
                  <div
                    style={{
                      padding: '8px 10px', borderRadius: 10, marginBottom: 10, fontSize: 11.5, lineHeight: 1.45,
                      background: listenerTruth.tone === 'none' ? RED_SOFT : listenerTruth.tone === 'idle' ? AMBER_SOFT : GREEN_SOFT,
                      border: `1px solid ${listenerTruth.tone === 'none' ? RED_BORDER : listenerTruth.tone === 'idle' ? AMBER_BORDER : GREEN_BORDER}`,
                      color: listenerTruth.tone === 'none' ? '#FCA5A5' : listenerTruth.tone === 'idle' ? GOLD_HI : GREEN,
                      fontWeight: 700,
                    }}
                  >
                    {listenerTruth.text}
                  </div>
                )}
                <div style={{ marginBottom: 10 }}>
                  {!rosterAddOpen ? (
                    <button onClick={() => { setRosterAddOpen(true); setRosterAddQuery(''); }} style={{ ...toolBtnStyle(false, true), width: '100%' }}>
                      <UserPlus size={13} weight="bold" /> Add member
                    </button>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <input
                          value={rosterAddQuery}
                          onChange={(e) => setRosterAddQuery(e.target.value)}
                          placeholder="Search staff and subs…"
                          autoFocus
                          style={{ ...fieldStyle, flex: 1, padding: '7px 10px', fontSize: 12 }}
                        />
                        <button onClick={() => setRosterAddOpen(false)} aria-label="Close the member picker" style={closeBtnStyle}><X size={13} weight="bold" /></button>
                      </div>
                      {/* Results flow in the panel's own scroll — never a nested porthole */}
                      <div style={{ marginBottom: 10 }}>
                        {renderDirectory({
                          query: rosterAddQuery,
                          mode: 'pick',
                          excludeUsers: rosterUserIds,
                          excludeSubs: rosterSubIds,
                          busyKey: memberBusy,
                          onRow: addMember,
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {rosterKey && !rosterData && !rosterError && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={40} borderRadius={10} />)}
                  </div>
                )}
                {rosterError && <div style={{ fontSize: 11.5, color: RED }}>Could not load the roster. Close and reopen to retry.</div>}
                {rosterData && rosterMembers.length === 0 && (
                  <div style={{ fontSize: 11.5, color: FAINT }}>No members on this channel yet.</div>
                )}
                {rosterMembers.map((mem, idx) => {
                  const self = !!myUserId && mem.user_id === myUserId;
                  const pres = mem.presence_status ? PRESENCE[mem.presence_status] || null : null;
                  const onNow = !!mem.last_seen_at && Date.now() - new Date(mem.last_seen_at).getTime() <= 90_000;
                  return (
                    <div key={mem.user_id || idx} style={{ padding: '8px 10px', borderRadius: 10, background: self ? AMBER_SOFT : NEST, border: `1px solid ${self ? AMBER_BORDER : BORDER}`, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          aria-hidden
                          title={pres ? pres.label : 'No status set'}
                          style={{ flexShrink: 0, width: 9, height: 9, borderRadius: 999, background: pres ? pres.color : 'rgba(255,255,255,0.18)', boxShadow: onNow && pres ? `0 0 6px ${pres.color}` : undefined }}
                        />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {senderShort(mem.display_name)}{self ? ' (you)' : ''}
                        </span>
                        {mem.call_sign && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, color: GOLD_HI, border: `1px solid ${AMBER_BORDER}`, borderRadius: 999, padding: '1px 7px' }}>
                            {mem.call_sign}
                          </span>
                        )}
                        {!self && !!mem.id && (removeArm === String(mem.id) ? (
                          <button
                            onClick={() => removeMember(mem)}
                            disabled={memberBusy === String(mem.id)}
                            title="Confirm — remove this member from the channel"
                            style={{ ...rowActionStyle, flexShrink: 0, color: '#FCA5A5', borderColor: RED_BORDER, background: RED_SOFT, opacity: memberBusy === String(mem.id) ? 0.6 : 1 }}
                          >
                            {memberBusy === String(mem.id) ? 'Removing…' : 'Remove?'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setRemoveArm(String(mem.id))}
                            title={`Remove ${senderShort(mem.display_name)} from this channel`}
                            aria-label={`Remove ${senderShort(mem.display_name)} from this channel`}
                            style={closeBtnStyle}
                          >
                            <X size={12} weight="bold" />
                          </button>
                        ))}
                        {self && !editingProfile && (
                          <button
                            onClick={() => startEditProfile(mem)}
                            title="Edit your call sign and status"
                            aria-label="Edit your call sign and status"
                            style={{ ...closeBtnStyle, color: MUTED }}
                          >
                            <PencilSimple size={12} weight="bold" />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: FAINT, marginTop: 3, paddingLeft: 17 }}>
                        {pres ? pres.label : 'No status'}
                        {mem.role === 'dispatcher' ? ' · dispatcher' : ''}
                        {onNow ? ' · on channel now' : mem.last_seen_at ? ` · seen ${timeOf(mem.last_seen_at)}` : ''}
                      </div>
                      {self && editingProfile && (
                        <div style={{ marginTop: 9 }}>
                          <input
                            value={callSignDraft}
                            onChange={(e) => setCallSignDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveProfile(); }}
                            placeholder="Call sign (e.g. UNIT 7)"
                            maxLength={24}
                            style={{ ...fieldStyle, padding: '7px 10px', fontSize: 12, marginBottom: 8 }}
                          />
                          {/* Four options is a dropdown, not four chips in a scroller */}
                          <select
                            value={statusDraft}
                            onChange={(e) => setStatusDraft(e.target.value as 'available' | 'busy' | 'on_route' | 'off')}
                            aria-label="Your presence status"
                            style={{ ...fieldStyle, padding: '7px 10px', fontSize: 12, marginBottom: 9 }}
                          >
                            {(['available', 'busy', 'on_route', 'off'] as const).map((s) => (
                              <option key={s} value={s}>{PRESENCE[s].label}</option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={saveProfile} disabled={savingProfile} className="pmBtn" style={{ ...goldButtonStyle, padding: '7px 12px', fontSize: 11.5, opacity: savingProfile ? 0.6 : 1 }}>
                              {savingProfile ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingProfile(false)} style={{ background: 'none', border: 'none', color: FAINT, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ flexShrink: 0, padding: 10, borderTop: `1px solid ${BORDER}` }}>
                <button
                  onClick={() => { pendingSelfEditRef.current = true; if (myRosterRow) startEditProfile(myRosterRow); }}
                  style={{ ...toolBtnStyle(false, true), width: '100%' }}
                >
                  <PencilSimple size={13} weight="bold" /> {myRosterRow?.call_sign ? `Your handle: ${myRosterRow.call_sign}` : 'Set Your Handle'}
                </button>
              </div>
            </Dropdown>
          </div>

          <span style={{ flex: 1 }} />

          {/* Instrument readouts — what the console already knows, inline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, paddingRight: 2 }}>
            {rtLive && (
              <span title="Live — transmissions arrive instantly over the realtime socket" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 900, color: GREEN }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: GREEN, boxShadow: '0 0 8px rgba(69,179,125,0.8)' }} />
                LIVE
              </span>
            )}
            {[
              { label: 'Traffic Today', value: String(stats.trafficToday) },
              { label: 'Monitoring', value: `${stats.monitored}/${stats.channels}` },
            ].map((r) => (
              <span key={r.label} style={{ display: 'none', flexDirection: 'column', lineHeight: 1.15 }} className="sagReadout">
                <span style={{ fontSize: 8.5, fontWeight: 900, color: FAINT }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: WHITE, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
              </span>
            ))}
          </div>

          {/* Channel-bridging group — [Patch · Broadcast], one geometry */}
          <div style={toolGroupStyle}>
            <button
              onClick={() => { closeAllDialogs(); setPatchOpen(true); }}
              title="Patch board — bridge two talkgroups until released"
              style={toolSegStyle(patches.length > 0, true, false)}
            >
              <PlugsConnected size={13} weight="bold" /> Patch{patches.length ? ` (${patches.length})` : ''}
            </button>
            <button
              onClick={() => { closeAllDialogs(); setBcOpen(true); }}
              title="Broadcast — one message onto up to eight channels"
              style={toolSegStyle(false, true, true)}
            >
              <Megaphone size={13} weight="bold" /> Broadcast
            </button>
          </div>

          {/* ONE overflow menu — every tertiary action lives here */}
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => { setMenuOpen((v) => !v); setChanOpen(false); setRosterOpen(false); }}
              title="More — share, log, map, assist, catch up"
              aria-label="More console actions"
              aria-expanded={menuOpen}
              style={{ ...toolBtnStyle(menuOpen, true), padding: '0 10px' }}
            >
              <DotsThree size={17} weight="bold" />
              {(unheardVoice.length > 0 || assistOpenCount > 0) && (
                <span
                  style={{
                    minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: assistOpenCount > 0 ? RED : `linear-gradient(180deg, ${GOLD_HI}, ${GOLD})`,
                    color: assistOpenCount > 0 ? WHITE : '#0A0A00',
                    fontSize: 9.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {unheardVoice.length + assistOpenCount}
                </span>
              )}
            </button>
            {menuOpen && (
              <div style={{ ...popoverStyle(288), padding: 8 }}>
                <button
                  onClick={() => { if (unheardVoice.length) { setMenuOpen(false); startCatchUp(); } }}
                  disabled={unheardVoice.length === 0}
                  title="Play every unheard voice clip in order, oldest first"
                  style={menuItemStyle(unheardVoice.length > 0)}
                >
                  <FastForward size={14} weight="fill" color={unheardVoice.length ? GOLD_HI : FAINT} />
                  Catch me up{unheardVoice.length ? ` (${unheardVoice.length})` : ''}
                </button>
                <button onClick={() => { setMenuOpen(false); setAssistShown(true); }} style={menuItemStyle(true)}>
                  <Lifebuoy size={14} weight="bold" color={assistOpenCount > 0 ? RED : GOLD_HI} />
                  Assistance queue{assistQueue.length ? ` (${assistQueue.length})` : ''}
                </button>
                <button onClick={() => { setMenuOpen(false); setShareOpen(true); }} disabled={!active} style={menuItemStyle(!!active)}>
                  <ShareNetwork size={14} weight="bold" color={active ? GOLD_HI : FAINT} /> Share channel
                </button>
                <button onClick={() => { setMenuOpen(false); setLogOpen(true); }} disabled={!active} style={menuItemStyle(!!active)}>
                  <ClockCounterClockwise size={14} weight="bold" color={active ? GOLD_HI : FAINT} /> Recording log
                </button>
                <button onClick={() => { setMenuOpen(false); setMapOpen(true); }} style={menuItemStyle(true)}>
                  <MapTrifold size={14} weight="bold" color={GOLD_HI} /> Site map
                </button>
                <div aria-hidden style={{ height: 1, background: BORDER, margin: '6px 4px' }} />
                <button onClick={() => { setMenuOpen(false); setShowNew(true); }} style={menuItemStyle(true)}>
                  <Plus size={14} weight="bold" color={GOLD_HI} /> New talkgroup
                </button>
                <button onClick={() => { setMenuOpen(false); setDirectOpen(true); }} style={menuItemStyle(true)}>
                  <ChatCircleText size={14} weight="bold" color={GOLD_HI} /> Direct message
                </button>
                <div aria-hidden style={{ height: 1, background: BORDER, margin: '6px 4px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 8px' }}>
                  <span style={{ ...eyebrowStyle, flex: 1 }}>Transcripts</span>
                  <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: FIELD_BORDER }}>
                    {(['en', 'es'] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => pickLang(l)}
                        style={{
                          padding: '5px 12px', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 900,
                          background: lang === l ? 'linear-gradient(180deg, var(--brand-primary-25), color-mix(in srgb, var(--brand-primary) 14%, transparent))' : FIELD_BG,
                          color: lang === l ? GOLD_HI : MUTED,
                        }}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: FAINT, lineHeight: 1.45, padding: '6px 10px 2px', borderTop: `1px solid ${BORDER}`, marginTop: 4 }}>
                  {streamStatus}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Status band — S/RF meter and exactly what is happening ──── */}
        <div
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
            background: micOpen
              ? 'linear-gradient(90deg, rgba(239,68,68,0.22), rgba(239,68,68,0.05))'
              : onAir
                ? 'linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 24%, transparent), color-mix(in srgb, var(--brand-primary) 7%, transparent))'
                : 'rgba(255,255,255,0.02)',
            borderBottom: `1px solid ${micOpen ? RED_BORDER : onAir ? AMBER_BORDER : BORDER}`,
          }}
        >
          <SMeter mode={meterMode} level={meterLevel} width={116} />
          {micOpen ? (
            <>
              <EqBars color={RED} size={15} />
              <span style={{ fontSize: 10.5, fontWeight: 900, color: RED, whiteSpace: 'nowrap' }}>On Air</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: WHITE, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {txSecs.toFixed(1)}s
              </span>
              <span style={{ fontSize: 12, color: MUTED, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {`Keyed up on ${active?.name || 'this channel'} — release to send`}
              </span>
              {txSecs * 1000 > TX_WARN_MS && (
                <span style={{ fontSize: 10.5, fontWeight: 900, color: RED, whiteSpace: 'nowrap' }}>
                  {Math.max(0, Math.ceil((MAX_TX_MS - txSecs * 1000) / 1000))}s TO CUT-OFF
                </span>
              )}
              <span aria-hidden style={{ marginLeft: 'auto', flexShrink: 0 }}><EqBars color={RED} size={15} /></span>
            </>
          ) : keyed ? (
            <>
              <EqBars color={GOLD_HI} size={15} />
              <span style={{ fontSize: 10.5, fontWeight: 900, color: GOLD_HI, whiteSpace: 'nowrap' }}>OPENING MIC…</span>
              <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Hold the key — start talking when it turns red</span>
            </>
          ) : playingId ? (
            <>
              <EqBars color={GOLD_HI} size={15} />
              <span style={{ fontSize: 10.5, fontWeight: 900, color: GOLD_HI, whiteSpace: 'nowrap' }}>Now Playing</span>
              <span style={{ fontSize: 12, color: MUTED, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {`${senderShort(playingMsg?.sender_name ?? null)}${catchingUp ? ' · catch-up' : ''}${playingMsg?.audio_duration_secs ? ` · ${secsLabel(playingMsg.audio_duration_secs)}` : ''}`}
              </span>
              {catchingUp && (
                <button onClick={stopPlayback} title="Stop the catch-up playback" style={{ ...rowActionStyle, marginLeft: 'auto', color: GOLD_HI, borderColor: AMBER_BORDER, background: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' }}>
                  <Pause size={11} weight="fill" /> Stop catch-up
                </button>
              )}
            </>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {active ? `Standing By — ${(channelNo.get(active.id) || '')} ${active.name}` : 'Standing By'}
            </span>
          )}
        </div>

        {/* ── Traffic — THE ONLY SCROLL REGION ON THIS SCREEN ─────────── */}
        <div
          ref={feedRef}
          onDragEnter={onFeedDragEnter}
          onDragOver={onFeedDragOver}
          onDragLeave={onFeedDragLeave}
          onDrop={onFeedDrop}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', position: 'relative' }}
        >
          {dragOver && (
            <div
              aria-hidden
              style={{
                position: 'sticky', top: 0, zIndex: 30, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 88,
                borderRadius: 14, border: `2px dashed ${AMBER_BORDER}`, background: 'var(--brand-primary-12)',
                color: GOLD_HI, fontSize: 13, fontWeight: 800, marginBottom: 10,
              }}
            >
              <Paperclip size={18} weight="bold" /> Drop to share on {active?.name || 'this channel'}
            </div>
          )}
          {!active && firstLoad && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={58} borderRadius={12} />)}
            </div>
          )}
          {!firstLoad && chError && !channels.length && (
            <PremiumEmpty tone="error" icon={<Warning size={30} color={RED} weight="fill" />} title="Radio unreachable" description="Could not load your talkgroups. Check your connection — the console retries on its own." />
          )}
          {!firstLoad && !chError && channels.length === 0 && (
            <PremiumEmpty
              icon={<Broadcast size={30} color={GOLD_HI} weight="fill" />}
              title="No channels yet"
              description={projectId ? 'Open a project to auto-create its All Hands talkgroup, or start a custom channel.' : 'Start a custom channel, or open Radio from a project to spin up its All Hands talkgroup.'}
              action={<button onClick={() => setShowNew(true)} className="pmBtn" style={goldButtonStyle}><Plus size={14} weight="bold" /> New Talkgroup</button>}
            />
          )}
          {active && !msgData && !msgError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={58} borderRadius={12} />)}
            </div>
          )}
          {active && msgError && (
            <PremiumEmpty tone="error" icon={<Warning size={30} color={RED} weight="fill" />} title="Feed unavailable" description="Could not load this channel's traffic. The console retries automatically every few seconds." />
          )}
          {messages.map(renderRow)}
          {pendingHere.map(renderPendingRow)}

          {/* Standby radio face — the feed is never a black void. No duplicate
            * channel list here: the channel dropdown above owns that job. */}
          {standbyOn && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 240, maxWidth: 640, width: '100%', margin: '0 auto', paddingTop: messages.length || pendingHere.length ? 18 : 4, paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 14 }}>
                <VividGoldChip icon={<Broadcast size={20} weight="fill" />} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: WHITE, letterSpacing: '-0.01em' }}>Saguaro Radio — standing by</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                    {channels.length
                      ? `Monitoring ${stats.monitored} of ${stats.channels} talkgroup${stats.channels === 1 ? '' : 's'} — traffic appears here the moment anyone keys up.`
                      : 'No talkgroups yet — create your first channel and the band comes alive.'}
                  </div>
                </div>
              </div>
              <FrequencyDial seed={activeId || 'saguaro'} />
              {lastTraffic?.lastMessage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', marginTop: 12, borderRadius: 10, background: NEST, border: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 9.5, fontWeight: 900, color: GOLD_HI, whiteSpace: 'nowrap' }}>Last Traffic</span>
                  <span style={{ fontSize: 12, color: WHITE, fontWeight: 700, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {senderShort(lastTraffic.lastMessage.sender)} — {trafficPreview(lastTraffic.lastMessage)}
                  </span>
                  <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {lastTraffic.name} · {whenLabel(lastTraffic.lastMessage.at)}
                  </span>
                </div>
              )}
              {active && otherMembers === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', marginTop: 10, borderRadius: 10, background: RED_SOFT, border: `1px solid ${RED_BORDER}` }}>
                  <Warning size={15} weight="fill" color={RED} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 180, fontSize: 12, color: '#FCA5A5', fontWeight: 700, lineHeight: 1.45 }}>
                    You are the only member of {active.name}. Anything you transmit has nobody to hear it.
                  </span>
                  <button
                    onClick={() => { setRosterOpen(true); setRosterAddOpen(true); setRosterAddQuery(''); }}
                    style={{ ...goldOutlineButtonStyle, padding: '7px 14px', fontSize: 12, flexShrink: 0 }}
                  >
                    <UserPlus size={12} weight="bold" /> Add someone
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Pending attachment tray ─────────────────────────────────── */}
        {(pendingFile || attachError) && (
          <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, padding: '10px 12px', background: NEST }}>
            {attachError && <div style={{ fontSize: 11.5, color: RED, marginBottom: pendingFile ? 8 : 0 }}>{attachError}</div>}
            {pendingFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 240, padding: '6px 10px', borderRadius: 10, background: AMBER_SOFT, border: `1px solid ${AMBER_BORDER}`, color: GOLD_HI, fontSize: 11.5, fontWeight: 800 }}>
                  <Paperclip size={12} weight="bold" style={{ flexShrink: 0 }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</span>
                  <span style={{ color: FAINT, fontWeight: 700, flexShrink: 0 }}>{sizeLabel(pendingFile.size)}</span>
                </span>
                <input
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMedia(); }}
                  placeholder="Add a caption (optional)"
                  autoFocus
                  style={{ ...fieldStyle, flex: 1, minWidth: 160, padding: '8px 12px' }}
                />
                <button onClick={sendMedia} disabled={uploadingMedia} className="pmBtn" style={{ ...goldButtonStyle, padding: '8px 14px', fontSize: 12.5, opacity: uploadingMedia ? 0.6 : 1 }}>
                  {uploadingMedia ? 'Sending…' : 'Send'}
                </button>
                <button onClick={clearAttach} disabled={uploadingMedia} aria-label="Cancel attachment" style={{ background: 'none', border: 'none', color: FAINT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ TRANSMIT DECK — fixed, never scrolls away ══════════════════ */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, padding: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))', borderRadius: '0 0 16px 16px' }}>
          {/* The talk key: the biggest control on the screen, and it NEVER
            * disappears and is NEVER gated by the previous upload. */}
          {pttSupported !== false ? (
            <button
              onPointerEnter={preflightMic}
              onFocus={preflightMic}
              onPointerDown={(e) => {
                /* Pointer capture, NOT pointerleave: a few pixels of drift while
                 * you are talking must never cut the transmission. */
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture unsupported — fine */ }
                void pttStart();
              }}
              onPointerUp={(e) => {
                try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
                pttStop();
              }}
              onPointerCancel={pttStop}
              onLostPointerCapture={pttStop}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!active}
              title={active ? 'Hold to talk — release to transmit (or hold SPACE anywhere on the page)' : 'Tune to a channel first'}
              aria-label="Hold to talk"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                width: '100%', height: 62, borderRadius: 14, border: 'none', padding: '0 18px',
                cursor: active ? 'pointer' : 'not-allowed', userSelect: 'none', touchAction: 'none',
                background: micOpen
                  ? `linear-gradient(180deg, ${RED}, #991B1B)`
                  : keyed
                    ? 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary))'
                    : micError
                      ? `linear-gradient(180deg, rgba(239,68,68,0.22), rgba(239,68,68,0.10))`
                      : `linear-gradient(180deg, ${GOLD_HI}, ${GOLD} 60%, var(--brand-primary-hover))`,
                color: micOpen ? WHITE : micError && !keyed ? '#FCA5A5' : '#0A0A00',
                boxShadow: micOpen
                  ? '0 0 0 5px rgba(239,68,68,0.22), 0 8px 26px -10px rgba(239,68,68,0.8)'
                  : micError ? 'none' : '0 6px 20px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
                outline: micError && !keyed ? `1px solid ${RED_BORDER}` : 'none',
                opacity: active ? 1 : 0.5,
                transition: 'background .12s ease, box-shadow .12s ease',
              }}
            >
              {micOpen ? <Waveform size={24} weight="bold" /> : <Microphone size={24} weight="fill" />}
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2, minWidth: 0, maxWidth: '100%' }}>
                <span style={{ fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>
                  {!active ? 'Tune to a Channel'
                    : micOpen ? `ON AIR — ${txSecs.toFixed(1)}s`
                      : keyed ? 'OPENING MIC…'
                        : micError ? 'MIC PROBLEM — PRESS TO RETRY'
                          : 'Hold to Talk'}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.78, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {micOpen ? 'Release to Send'
                    : keyed ? 'Wait for Red Before You Speak'
                      : micError ? micError
                        : `Or Hold ${spaceKeyed ? '[Space]' : 'Space'} Anywhere`}
                </span>
              </span>
              {micOpen && <span style={{ marginLeft: 'auto' }}><EqBars color={WHITE} size={20} /></span>}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 62, padding: '0 18px', borderRadius: 14, background: FIELD_BG, border: FIELD_BORDER, color: MUTED, fontSize: 12.5, fontWeight: 700 }}>
              <Warning size={18} weight="fill" color={GOLD_HI} style={{ flexShrink: 0 }} />
              This browser cannot record audio (no MediaRecorder). Text, alerts, tones and attachments still work — use Chrome, Edge, or Safari 14.6+ to key up.
            </div>
          )}

          {/* Transmission truth line: what happened to your last clip, and
            * whether anybody was there to hear it. */}
          {(txReceipt || listenerTruth) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 9 }}>
              {txReceipt && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
                    color: txReceipt.tone === 'ok' ? GREEN : txReceipt.tone === 'bad' ? '#FCA5A5' : txReceipt.tone === 'warn' ? MUTED : GOLD_HI,
                  }}
                >
                  {txReceipt.tone === 'ok' ? <Check size={12} weight="bold" />
                    : txReceipt.tone === 'bad' ? <Warning size={12} weight="fill" />
                      : txReceipt.tone === 'work' ? <EqBars size={11} /> : <Check size={12} weight="bold" />}
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txReceipt.text}</span>
                </span>
              )}
              {listenerTruth && listenerTruth.tone !== 'live' && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, marginLeft: 'auto',
                    fontSize: 11, fontWeight: 800,
                    color: listenerTruth.tone === 'none' ? '#FCA5A5' : GOLD_HI,
                  }}
                >
                  <Warning size={12} weight="fill" style={{ flexShrink: 0 }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listenerTruth.text}</span>
                  {listenerTruth.tone === 'none' && (
                    <button
                      onClick={() => { setRosterOpen(true); setRosterAddOpen(true); setRosterAddQuery(''); }}
                      style={{ ...rowActionStyle, color: GOLD_HI, borderColor: AMBER_BORDER, background: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' }}
                    >
                      <UserPlus size={11} weight="bold" /> Add someone
                    </button>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Composer row — attach · message · tones · alert · send */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => { const el = e.currentTarget; takeFile(el.files?.[0]); el.value = ''; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!active || uploadingMedia}
              title="Attach a photo, PDF, or video to this channel"
              aria-label="Attach a file"
              style={{
                flexShrink: 0, width: 42, height: 42, borderRadius: 11, padding: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: pendingFile ? AMBER_SOFT : FIELD_BG,
                border: pendingFile ? `1px solid ${AMBER_BORDER}` : FIELD_BORDER,
                color: pendingFile ? GOLD_HI : MUTED, cursor: active ? 'pointer' : 'not-allowed',
                opacity: !active || uploadingMedia ? 0.55 : 1,
              }}
            >
              <Paperclip size={16} weight="bold" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText('text'); } }}
              placeholder={micOpen ? 'Transmitting… release the key to send' : active ? `Message ${active.name}` : 'Tune to a channel'}
              disabled={!active || sending}
              style={{ ...fieldStyle, flex: '1 1 220px', minWidth: 160, height: 42, padding: '0 14px', fontSize: 13.5, borderRadius: 11 }}
            />
            <span style={{ flexShrink: 0, display: 'inline-flex', gap: 4 }}>
              {(['ack', 'negative', 'comein'] as const).map((tn) => (
                <button
                  key={tn}
                  onClick={() => sendTone(tn)}
                  disabled={!active || toneSending !== null}
                  title={tn === 'ack' ? 'Send an ACK tone (affirmative)' : tn === 'negative' ? 'Send a NEGATIVE tone (denied / no)' : 'Send a COME IN tone (calling any unit)'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 42, padding: '0 10px', borderRadius: 11, cursor: 'pointer',
                    background: TONES[tn].soft, border: `1px solid ${TONES[tn].border}`,
                    color: TONES[tn].color, fontWeight: 900, fontSize: 9.5,
                    whiteSpace: 'nowrap', opacity: !active || toneSending !== null ? 0.5 : 1,
                  }}
                >
                  {tn === 'ack' ? 'Ack' : tn === 'negative' ? 'Neg' : 'Come In'}
                </button>
              ))}
            </span>
            <button
              onClick={() => sendText('alert')}
              disabled={!active || !draft.trim() || sending}
              title="Broadcast as a high-visibility alert (notifies every member)"
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 42, padding: '0 14px', borderRadius: 11, cursor: 'pointer',
                background: AMBER_SOFT, border: `1px solid ${AMBER_BORDER}`,
                color: GOLD_HI, fontWeight: 800, fontSize: 12.5,
                opacity: !active || !draft.trim() || sending ? 0.5 : 1,
              }}
            >
              <Warning size={14} weight="fill" /> Alert
            </button>
            <button
              onClick={() => sendText('text')}
              disabled={!active || !draft.trim() || sending}
              className="pmBtn"
              aria-label="Send message"
              style={{ ...goldButtonStyle, flexShrink: 0, height: 42, padding: '0 18px', borderRadius: 11, opacity: !active || !draft.trim() || sending ? 0.5 : 1 }}
            >
              <PaperPlaneRight size={15} weight="fill" />
            </button>
          </div>

          {/* The honest line about what this transport actually is. */}
          <div style={{ fontSize: 10.5, color: FAINT, marginTop: 9, lineHeight: 1.45 }}>
            Push-to-talk clips: your key-down records, your release delivers, and every member&apos;s console plays it back — typically in about a second. {streamStatus}
          </div>
        </div>
      </div>

      {/* ══ DIALOGS — each one has exactly one scroll region ═════════════ */}

      {/* Site map — live crew pins + human heatmap */}
      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} title="Site Map" icon={<MapTrifold size={15} weight="bold" color={GOLD_HI} />} width={980}>
        <CrewMap
          crew={crewData?.crew ?? []}
          bins={heatData?.bins ?? []}
          samples={heatData?.samples ?? 0}
          hours={mapHours}
          onHoursChange={setMapHours}
          panics={panicPins}
          hasProject={!!projectId}
          projects={projectOptions}
          onPickProject={(id) => {
            setProjectId(id);
            try {
              const u = new URL(window.location.href);
              u.searchParams.set('projectId', id);
              window.history.replaceState(null, '', u.toString());
            } catch { /* URL sync is cosmetic */ }
          }}
          loading={mapLoading}
        />
        <div style={{ fontSize: 11, color: FAINT, marginTop: 12 }}>
          Live crew pins over a shift heatmap — positions appear when crews clock in with the Field app.
        </div>
      </Dialog>

      {/* Assistance queue */}
      <Dialog
        open={assistShown}
        onClose={() => setAssistShown(false)}
        title={`ASSISTANCE QUEUE${assistQueue.length ? ` — ${assistOpenCount} WAITING` : ''}`}
        icon={<Lifebuoy size={15} weight="bold" color={assistOpenCount > 0 ? RED : GOLD_HI} />}
        width={720}
      >
        {assistQueue.length === 0 ? (
          <div style={{ fontSize: 12.5, color: FAINT }}>Queue is clear — no field requests waiting on dispatch.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assistQueue.map((a) => {
              const acked = a.status === 'acknowledged';
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: '10px 12px', borderRadius: 12,
                    background: acked ? NEST : AMBER_SOFT,
                    border: `1px solid ${acked ? BORDER : AMBER_BORDER}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9.5, fontWeight: 900, borderRadius: 999, padding: '2px 8px',
                      color: acked ? GREEN : RED,
                      border: `1px solid ${acked ? GREEN_BORDER : RED_BORDER}`,
                      background: acked ? GREEN_SOFT : RED_SOFT, whiteSpace: 'nowrap',
                    }}
                  >
                    {acked ? 'Ack' : 'Open'}
                  </span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: WHITE }}>{senderShort(a.requester_name)}</span>
                    {a.note && <span style={{ fontSize: 12.5, color: MUTED }}> — {a.note}</span>}
                    {acked && a.acknowledged_by && (
                      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                        Acknowledged by {senderShort(a.acknowledged_by)}{a.acknowledged_at ? ` · ${timeOf(a.acknowledged_at)}` : ''}
                      </div>
                    )}
                  </div>
                  <span title={new Date(a.created_at).toLocaleString()} style={{ fontSize: 11, color: acked ? FAINT : GOLD_HI, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {ageLabel(a.created_at, assistNow)} ago
                  </span>
                  {a.location && typeof a.location.lat === 'number' && (
                    <a href={`https://maps.google.com/?q=${a.location.lat},${a.location.lng}`} target="_blank" rel="noreferrer" title="Open the requester's location in Google Maps" style={{ ...rowActionStyle, textDecoration: 'none' }}>
                      <MapPin size={11} weight="fill" /> Location
                    </a>
                  )}
                  {!acked && (
                    <button onClick={() => triageAssist(a.id, 'ack')} disabled={assistBusy === a.id} title="Acknowledge — tells the requester dispatch is on it" style={{ ...rowActionStyle, color: GOLD_HI, borderColor: AMBER_BORDER, background: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)', opacity: assistBusy === a.id ? 0.6 : 1 }}>
                      <Check size={11} weight="bold" /> Ack
                    </button>
                  )}
                  <button onClick={() => triageAssist(a.id, 'resolve')} disabled={assistBusy === a.id} title="Resolve — closes the request and notifies the requester" style={{ ...rowActionStyle, color: GREEN, borderColor: GREEN_BORDER, background: GREEN_SOFT, opacity: assistBusy === a.id ? 0.6 : 1 }}>
                    <Check size={11} weight="bold" /> Resolve
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>

      {/* Guest access — share this channel */}
      <Dialog
        open={shareOpen && !!active}
        onClose={closeShare}
        title={`GUEST ACCESS — ${active?.name || ''}`}
        icon={<ShareNetwork size={15} weight="bold" color={GOLD_HI} />}
        width={520}
        footer={
          <>
            <button onClick={createGuestLink} disabled={creatingLink} className="pmBtn" style={{ ...goldButtonStyle, padding: '10px 18px', fontSize: 12.5, opacity: creatingLink ? 0.6 : 1 }}>
              <ShareNetwork size={13} weight="bold" /> {creatingLink ? 'Creating…' : 'Create guest link'}
            </button>
            <span style={{ fontSize: 10.5, color: FAINT, flex: 1, minWidth: 140 }}>Guests join in a browser — no account, no app.</span>
          </>
        }
      >
        {createdUrl && (
          <div style={{ padding: 10, borderRadius: 10, background: GREEN_SOFT, border: `1px solid ${GREEN_BORDER}`, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: GREEN, marginBottom: 5 }}>LINK READY — SEND IT TO YOUR GUEST</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: WHITE, overflowWrap: 'anywhere', lineHeight: 1.4 }}>{createdUrl}</span>
              <button onClick={() => copyShare('created', createdUrl)} style={{ ...rowActionStyle, flexShrink: 0, color: copiedKey === 'created' ? GREEN : MUTED, borderColor: copiedKey === 'created' ? GREEN_BORDER : BORDER }}>
                {copiedKey === 'created' ? <Check size={11} weight="bold" /> : <Copy size={11} weight="bold" />} {copiedKey === 'created' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        <input
          value={shareLabel}
          onChange={(e) => setShareLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createGuestLink(); }}
          placeholder="Label (e.g. Inspector Diaz)"
          style={{ ...fieldStyle, marginBottom: 10 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: MUTED, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={shareTalk} onChange={(e) => setShareTalk(e.target.checked)} style={{ accentColor: GOLD }} />
            Guest can talk
          </label>
          <select
            value={shareDays}
            onChange={(e) => setShareDays(e.target.value as '7' | '30' | '90' | 'never')}
            aria-label="Link expiry"
            style={{ ...fieldStyle, flex: 1, minWidth: 160, padding: '8px 10px' }}
          >
            <option value="7">Expires in 7 days</option>
            <option value="30">Expires in 30 days</option>
            <option value="90">Expires in 90 days</option>
            <option value="never">No Expiry</option>
          </select>
        </div>
        {shareError && <div style={{ fontSize: 11.5, color: RED, marginBottom: 10 }}>{shareError}</div>}
        <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Active Links</div>
        {linksKey && !linkData && !linkError && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height={38} borderRadius={10} />)}
          </div>
        )}
        {linkError && <div style={{ fontSize: 11.5, color: RED }}>Could not load guest links. Close and reopen to retry.</div>}
        {linkData && guestLinks.length === 0 && <div style={{ fontSize: 11.5, color: FAINT }}>No guest links yet — create one below.</div>}
        {guestLinks.map((l) => {
          const expired = !!l.expires_at && new Date(l.expires_at).getTime() < Date.now();
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: NEST, border: `1px solid ${BORDER}`, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label || 'Guest link'}</div>
                <div style={{ fontSize: 10, color: expired ? RED : FAINT, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.can_talk === false ? 'Listen-only' : 'Talk + listen'}
                  {' · '}
                  {expired ? 'Expired' : l.expires_at ? `Expires ${new Date(l.expires_at).toLocaleDateString()}` : 'No Expiry'}
                </div>
              </div>
              {!expired && (
                <button onClick={() => copyShare(l.id, guestAbsUrl(l.token))} title="Copy the guest link" style={{ ...rowActionStyle, color: copiedKey === l.id ? GREEN : MUTED, borderColor: copiedKey === l.id ? GREEN_BORDER : BORDER }}>
                  {copiedKey === l.id ? <Check size={11} weight="bold" /> : <Copy size={11} weight="bold" />} {copiedKey === l.id ? 'Copied' : 'Copy'}
                </button>
              )}
              <button onClick={() => revokeGuestLink(l.id)} disabled={revokingId === l.id} title="Revoke this link — the guest loses access immediately" style={{ ...rowActionStyle, color: '#FCA5A5', borderColor: RED_BORDER, background: RED_SOFT, opacity: revokingId === l.id ? 0.6 : 1 }}>
                <Trash size={11} weight="bold" /> {revokingId === l.id ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          );
        })}
      </Dialog>

      {/* Patch board */}
      <Dialog
        open={patchOpen}
        onClose={() => setPatchOpen(false)}
        title="Patch Board"
        icon={<PlugsConnected size={15} weight="bold" color={GOLD_HI} />}
        width={480}
        footer={
          <button
            onClick={() => postPatch(patchA, patchB, false)}
            disabled={!patchA || !patchB || patchBusy}
            className="pmBtn"
            style={{ ...goldButtonStyle, padding: '10px 18px', fontSize: 12.5, opacity: !patchA || !patchB || patchBusy ? 0.55 : 1 }}
          >
            <PlugsConnected size={13} weight="bold" /> {patchBusy ? 'Working…' : 'Patch channels'}
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <select value={patchA} onChange={(e) => setPatchA(e.target.value)} aria-label="First channel to patch" style={{ ...fieldStyle, padding: '9px 11px', color: patchA ? WHITE : FAINT }}>
            <option value="">First channel…</option>
            {channels.filter((c) => c.id !== patchB).map((c) => (
              <option key={c.id} value={c.id}>{channelNo.get(c.id)} · {c.name}{c.project_name ? ` — ${c.project_name}` : ''}</option>
            ))}
          </select>
          <select value={patchB} onChange={(e) => setPatchB(e.target.value)} aria-label="Second channel to patch" style={{ ...fieldStyle, padding: '9px 11px', color: patchB ? WHITE : FAINT }}>
            <option value="">Second channel…</option>
            {channels.filter((c) => c.id !== patchA).map((c) => (
              <option key={c.id} value={c.id}>{channelNo.get(c.id)} · {c.name}{c.project_name ? ` — ${c.project_name}` : ''}</option>
            ))}
          </select>
        </div>
        {patches.length > 0 ? (
          <>
            <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Active Patches</div>
            {patches.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: NEST, border: `1px solid ${AMBER_BORDER}`, marginBottom: 6 }}>
                <PlugsConnected size={13} weight="bold" color={GOLD_HI} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 800, color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {channelName(p.channel_a)} + {channelName(p.channel_b)}
                </span>
                <button onClick={() => postPatch(p.channel_a, p.channel_b, true)} disabled={patchBusy} title="Release this patch — the channels stop mirroring" style={{ ...rowActionStyle, color: '#FCA5A5', borderColor: RED_BORDER, background: RED_SOFT, opacity: patchBusy ? 0.6 : 1 }}>
                  Release
                </button>
              </div>
            ))}
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5 }}>
            Patch two talkgroups and their traffic mirrors both ways until you release it. Mirrored rows are tagged &ldquo;via &lt;channel&gt;&rdquo; in the feed.
          </div>
        )}
      </Dialog>

      {/* Broadcast — one message onto up to eight channels */}
      <Dialog
        open={bcOpen}
        onClose={() => setBcOpen(false)}
        title={`BROADCAST — ${bcSel.size}/8 CHANNELS`}
        icon={<Megaphone size={15} weight="bold" color={GOLD_HI} />}
        width={560}
        footer={
          <>
            <button
              onClick={sendBroadcast}
              disabled={bcSel.size < 2 || !bcText.trim() || bcBusy}
              className="pmBtn"
              style={{ ...goldButtonStyle, padding: '10px 18px', fontSize: 12.5, opacity: bcSel.size < 2 || !bcText.trim() || bcBusy ? 0.55 : 1 }}
            >
              <Megaphone size={13} weight="bold" /> {bcBusy ? 'Sending…' : bcSel.size >= 2 ? `Send to ${bcSel.size} channels` : 'Send broadcast'}
            </button>
            <span style={{ fontSize: 10.5, color: FAINT, flex: 1, minWidth: 150 }}>Pick two to eight channels — one message lands on all of them at once.</span>
          </>
        }
      >
        {bcSent && (
          <div style={{ padding: '9px 11px', borderRadius: 10, background: GREEN_SOFT, border: `1px solid ${GREEN_BORDER}`, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: GREEN, marginBottom: 3 }}>
              SENT TO {bcSent.length} CHANNEL{bcSent.length === 1 ? '' : 's'}
            </div>
            <div style={{ fontSize: 11.5, color: WHITE, lineHeight: 1.5 }}>{bcSent.join(' · ')}</div>
          </div>
        )}
        <input
          value={bcText}
          onChange={(e) => setBcText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendBroadcast(); }}
          placeholder="One message for every selected channel"
          style={{ ...fieldStyle, marginBottom: 10 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: MUTED, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={bcAlert} onChange={(e) => setBcAlert(e.target.checked)} style={{ accentColor: GOLD }} />
          Send as a high-visibility alert
        </label>
        <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Channels</div>
        {channels.map((c) => {
          const on = bcSel.has(c.id);
          const full = !on && bcSel.size >= 8;
          return (
            <button
              key={c.id}
              onClick={() => toggleBcChannel(c.id)}
              disabled={full}
              title={full ? 'Eight channels max per broadcast' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', boxSizing: 'border-box',
                padding: '7px 9px', borderRadius: 9, marginBottom: 3, textAlign: 'left',
                background: on ? AMBER_SOFT : 'transparent',
                border: on ? `1px solid ${AMBER_BORDER}` : '1px solid transparent',
                color: WHITE, cursor: full ? 'default' : 'pointer', opacity: full ? 0.45 : 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0, width: 15, height: 15, borderRadius: 5,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? `linear-gradient(180deg, ${GOLD_HI}, ${GOLD})` : FIELD_BG,
                  border: on ? 'none' : FIELD_BORDER, color: '#0A0A00',
                }}
              >
                {on && <Check size={10} weight="bold" />}
              </span>
              <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{channelNo.get(c.id)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
              <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: FAINT, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.kind === 'direct' ? 'Direct' : c.project_name || (c.project_id ? 'Project' : 'Organization')}
              </span>
            </button>
          );
        })}
      </Dialog>

      {/* ── Recording console — date range + search + print-ready record ─ */}
      <Dialog
        open={logOpen && !!active}
        onClose={() => setLogOpen(false)}
        title={`CHANNEL LOG — ${active?.name || ''}`}
        icon={<ClockCounterClockwise size={15} weight="bold" color={GOLD_HI} />}
        width={880}
        className="sagRadioLogOverlay"
        footer={
          <>
            <button onClick={() => window.print()} title="Print or save this record as a PDF" style={{ ...goldOutlineButtonStyle, padding: '8px 14px', fontSize: 12 }}>
              <Printer size={12} weight="bold" /> Print / Export
            </button>
            <span style={{ fontSize: 10.5, color: FAINT, flex: 1, minWidth: 150 }}>
              Newest 100 transmissions in range, oldest first.
            </span>
          </>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} className="sagLogControls">
          <div style={{ width: 150 }}>
            <SaguaroDatePicker value={logFrom} onChange={setLogFrom} placeholder="From date" />
          </div>
          <div style={{ width: 150 }}>
            <SaguaroDatePicker value={logTo} onChange={setLogTo} placeholder="To date" />
          </div>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <MagnifyingGlass size={13} weight="bold" color={FAINT} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Search text, transcripts, senders…"
              style={{ ...fieldStyle, padding: '9px 12px 9px 30px' }}
            />
          </div>
        </div>

        {/* Print target — @media print lifts this to black-on-white */}
        <div id="sagRadioLogPrint">
          <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: WHITE }}>Saguaro Radio — channel record: {active?.name}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
              {logFrom || logTo ? `Range ${logFrom || 'start'} to ${logTo || 'now'}` : 'Most recent traffic'}
              {logSearch.trim() ? ` · filter "${logSearch.trim()}"` : ''}
              {` · ${logRows.length} transmission${logRows.length === 1 ? '' : 's'}`}
              {` · generated ${new Date().toLocaleString()}`}
            </div>
          </div>
          {logKey && !logData && !logError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={30} borderRadius={8} />)}
            </div>
          )}
          {logError && <div style={{ fontSize: 12, color: RED }}>Could not load the record. Adjust the range and try again.</div>}
          {logData && logRows.length === 0 && (
            <div style={{ fontSize: 12, color: FAINT }}>No transmissions match this range and filter.</div>
          )}
          {logRows.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 2px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ flexShrink: 0, width: 148, fontSize: 11, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {new Date(m.created_at).toLocaleString()}
              </span>
              <span style={{ flexShrink: 0, width: 120, fontSize: 11.5, fontWeight: 800, color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {senderShort(m.sender_name)}
              </span>
              <span style={{ flexShrink: 0, width: 52, fontSize: 9.5, fontWeight: 900, color: m.kind === 'panic' ? RED : m.kind === 'alert' ? GOLD_HI : FAINT }}>
                {m.kind.charAt(0).toUpperCase() + m.kind.slice(1)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: WHITE, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                {logText(m)}
                {m.patched_from ? ` (via ${channelName(m.patched_from)})` : ''}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: FAINT, marginTop: 8 }}>End of record.</div>
        </div>
      </Dialog>

      {/* ── Create group — name + project + member picker ────────────────── */}
      <Dialog
        open={showNew}
        onClose={closeNewModal}
        title="New Talkgroup"
        icon={<Plus size={15} weight="bold" color={GOLD_HI} />}
        width={520}
        footer={
          <>
            <button
              onClick={createChannel}
              disabled={!newName.trim() || creating}
              className="pmBtn"
              style={{ ...goldButtonStyle, padding: '10px 18px', fontSize: 12.5, opacity: !newName.trim() || creating ? 0.6 : 1 }}
            >
              {creating ? 'Creating…' : newSel.length ? `Create + add ${newSel.length} member${newSel.length === 1 ? '' : 's'}` : 'Create channel'}
            </button>
            <button onClick={closeNewModal} style={{ background: 'none', border: 'none', color: FAINT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        }
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Channel name (e.g. Concrete crew)"
          autoFocus
          style={{ ...fieldStyle, fontSize: 13, marginBottom: 10 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <select
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            aria-label="Project for this talkgroup"
            style={{ ...fieldStyle, flex: 1, minWidth: 180, padding: '9px 11px' }}
          >
            <option value="">Organization-wide</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: MUTED, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <input type="checkbox" checked={newAllowSubs} onChange={(e) => setNewAllowSubs(e.target.checked)} style={{ accentColor: GOLD }} />
            Subs can join
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={eyebrowStyle}>Members</span>
          <span style={{ fontSize: 10, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: newSel.length ? GOLD_HI : FAINT, border: `1px solid ${newSel.length ? AMBER_BORDER : BORDER}`, borderRadius: 999, padding: '1px 8px' }}>
            {newSel.length} selected
          </span>
          <span style={{ fontSize: 10.5, color: FAINT, flex: 1, textAlign: 'right' }}>You join automatically as dispatcher</span>
        </div>
        <input
          value={newQuery}
          onChange={(e) => setNewQuery(e.target.value)}
          placeholder="Search staff and subs…"
          style={{ ...fieldStyle, padding: '8px 11px', fontSize: 12, marginBottom: 10 }}
        />
        {/* Picker results flow in the dialog's own scroll — no nested porthole */}
        {renderDirectory({
          query: newQuery,
          mode: 'check',
          selectedKeys: new Set(newSel.map(personKey)),
          onRow: toggleNewPerson,
        })}
        {newSel.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '8px 10px', borderRadius: 10, background: AMBER_SOFT, border: `1px solid ${AMBER_BORDER}` }}>
            <Warning size={13} weight="fill" color={GOLD_HI} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: GOLD_HI, fontWeight: 700, lineHeight: 1.45 }}>
              With nobody picked you will be the only member — transmissions on this channel will have no listeners.
            </span>
          </div>
        )}
      </Dialog>

      {/* ── Direct 1:1 — staff picker ───────────────────────────────────── */}
      <Dialog
        open={directOpen}
        onClose={() => setDirectOpen(false)}
        title="Message Someone"
        icon={<ChatCircleText size={15} weight="bold" color={GOLD_HI} />}
        width={460}
        footer={<span style={{ fontSize: 10.5, color: FAINT }}>Direct channels are staff-to-staff. Reach subs through their project talkgroups.</span>}
      >
        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 12 }}>
          Pick a teammate — a private 1:1 channel opens (or re-opens) and the console tunes to it.
        </div>
        <input
          value={directQuery}
          onChange={(e) => setDirectQuery(e.target.value)}
          placeholder="Search staff…"
          autoFocus
          style={{ ...fieldStyle, marginBottom: 10 }}
        />
        {renderDirectory({
          query: directQuery,
          mode: 'pick',
          staffOnly: true,
          busyKey: directBusy,
          pickIcon: <ChatCircleText size={13} weight="bold" />,
          onRow: startDirect,
        })}
      </Dialog>

      {/* ── Lock / unlock confirm — dispatcher intent gate ──────────────── */}
      <Dialog
        open={!!lockConfirm}
        onClose={() => setLockConfirm(null)}
        title={lockConfirm?.locked ? 'Unlock Channel' : 'Lock Channel'}
        icon={lockConfirm?.locked ? <LockOpen size={15} weight="bold" color={GOLD_HI} /> : <Lock size={15} weight="fill" color={GOLD_HI} />}
        width={440}
        footer={
          <>
            <button
              onClick={applyLock}
              disabled={lockBusy}
              className="pmBtn"
              style={{ ...goldButtonStyle, padding: '10px 18px', fontSize: 12.5, opacity: lockBusy ? 0.6 : 1 }}
            >
              {lockConfirm?.locked ? <LockOpen size={13} weight="bold" /> : <Lock size={13} weight="fill" />}
              {lockBusy ? 'Working…' : lockConfirm?.locked ? 'Unlock channel' : 'Lock channel'}
            </button>
            <button onClick={() => setLockConfirm(null)} style={{ background: 'none', border: 'none', color: FAINT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12.5, color: WHITE, lineHeight: 1.55 }}>
          {lockConfirm?.locked
            ? `Unlock "${lockConfirm?.name}"? It becomes visible to the whole team again and teammates join on their next visit.`
            : `Lock "${lockConfirm?.name}"? Only current members keep access — the channel disappears from everyone else's console until a dispatcher adds them from the roster.`}
        </div>
      </Dialog>

      {/* ── Row overflow menu — the filing verbs, always reachable ───────
        * Fixed off the button's rect so the feed's scroll region cannot clip
        * it, and dismissed by an outside press, Escape, scroll or resize. */}
      {rowMenu && rowMenuMsg && (
        <>
          <div
            onPointerDown={() => setRowMenu(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          />
          <div
            role="menu"
            style={{
              position: 'fixed', top: rowMenu.top, right: rowMenu.right, zIndex: 101,
              width: 218, padding: 6,
              background: 'rgba(24,24,27,0.98)', border: `1px solid ${AMBER_BORDER}`,
              borderRadius: 12, boxShadow: '0 22px 48px rgba(12,12,16,0.65)', textAlign: 'left',
            }}
          >
            <button role="menuitem" onClick={() => openPromote(rowMenuMsg)} style={menuItemStyle(true)}>
              <NotePencil size={14} weight="bold" color={GOLD_HI} /> Make a record
            </button>
            <button
              role="menuitem"
              onClick={() => { setRowMenu(null); if (!filedIds.has(rowMenuMsg.id)) void fileToLog(rowMenuMsg); }}
              disabled={filedIds.has(rowMenuMsg.id) || filingId === rowMenuMsg.id}
              style={menuItemStyle(!filedIds.has(rowMenuMsg.id) && filingId !== rowMenuMsg.id)}
            >
              {filedIds.has(rowMenuMsg.id)
                ? <><Check size={14} weight="bold" color={GREEN} /> Filed to the daily log</>
                : <><ClipboardText size={14} weight="bold" color={FAINT} /> {filingId === rowMenuMsg.id ? 'Filing…' : 'File to log'}</>}
            </button>
            {(links[rowMenuMsg.id] || []).length > 0 && (
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 6, paddingTop: 6 }}>
                <div style={{ ...eyebrowStyle, padding: '0 10px 5px' }}>Already Filed As</div>
                {(links[rowMenuMsg.id] || []).map((l) => {
                  const a = promoteAccent(l.recordType);
                  return l.href ? (
                    <a key={l.id} href={l.href} role="menuitem" style={{ ...menuItemStyle(true), color: a.hex, textDecoration: 'none' }}>
                      <ArrowSquareOut size={13} weight="bold" /> {l.recordLabel}
                    </a>
                  ) : (
                    <span key={l.id} style={{ ...menuItemStyle(false), color: a.hex }}>{l.recordLabel}</span>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Make a record — the transmission becomes a tracked record ─────
        * The audio is the evidence. The server attaches the storage PATH (not
        * a signed URL) and re-signs on every read, so the clip on a record
        * written today still plays a year from now. */}
      <Dialog
        open={!!promoteMsg}
        onClose={() => { if (!promoteBusy) setPromoteFor(null); }}
        title="Make a Record"
        icon={<NotePencil size={15} weight="bold" color={GOLD_HI} />}
        width={640}
        footer={promoteMsg ? (
          <>
            <button
              onClick={submitPromote}
              disabled={promoteBusy || !!promoteExisting}
              className="pmBtn"
              style={{
                ...goldButtonStyle, padding: '10px 18px', fontSize: 12.5,
                opacity: promoteBusy || promoteExisting ? 0.55 : 1,
                cursor: promoteBusy || promoteExisting ? 'default' : 'pointer',
              }}
            >
              <NotePencil size={13} weight="bold" />
              {promoteBusy ? 'Creating…' : `Create ${PROMOTE_META[promoteType].label}`}
            </button>
            <button
              onClick={() => { if (!promoteBusy) setPromoteFor(null); }}
              style={{ background: 'none', border: 'none', color: FAINT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
            {promoteExisting ? (
              <span style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.45, minWidth: 0 }}>
                Already filed as <strong style={{ color: promoteAccent(promoteType).hex }}>{promoteExisting.recordLabel}</strong>
                {promoteExisting.href ? <> — <a href={promoteExisting.href} style={{ color: GOLD_HI, fontWeight: 800 }}>open it</a>.</> : '.'} Pick another target to file it somewhere else too.
              </span>
            ) : (
              <span style={{ fontSize: 10.5, color: FAINT, lineHeight: 1.45, minWidth: 0 }}>
                {promoteMsg.kind === 'voice'
                  ? 'The clip stays in the private file store. The record carries its path and re-signs the audio each time someone opens it.'
                  : 'The record carries this transmission’s text, sender, channel and timestamp as its provenance.'}
              </span>
            )}
          </>
        ) : undefined}
      >
        {promoteMsg && (
          <>
            {/* ── The evidence, playable while you type ───────────────── */}
            <div style={{ borderRadius: 12, border: `1px solid ${AMBER_BORDER}`, background: NEST, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={eyebrowStyle}>Evidence</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: WHITE }}>{senderShort(promoteMsg.sender_name)}</span>
                <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>
                  {isToday(promoteMsg.created_at)
                    ? timeOf(promoteMsg.created_at)
                    : `${whenLabel(promoteMsg.created_at)} ${timeOf(promoteMsg.created_at)}`}
                  {active?.name ? ` · ${active.name}` : ''}
                  {promoteMsg.audio_duration_secs != null ? ` · ${secsLabel(promoteMsg.audio_duration_secs)}` : ''}
                </span>
              </div>

              {promoteMsg.audio_url ? renderVoicePlayer(promoteMsg) : promoteMsg.kind === 'voice' ? (
                /* A voice row whose clip could not be signed for playback. The
                 * audio is still stored — say exactly that, never "no audio". */
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 6 }}>
                  This clip is not playable in the console right now. It is still in the private file store, and the record will carry its path.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 6, overflowWrap: 'anywhere' }}>
                  {promoteMsg.body || 'This transmission carries no text.'}
                </div>
              )}

              {promoteMsg.transcript ? (
                <div style={{ marginTop: 10 }}>
                  <span style={eyebrowStyle}>Transcript</span>
                  <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 4, overflowWrap: 'anywhere' }}>
                    {promoteMsg.transcript}
                  </div>
                </div>
              ) : promoteMsg.kind === 'voice' ? (
                <div
                  style={{
                    display: 'flex', gap: 8, marginTop: 10, padding: '8px 10px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
                  }}
                >
                  <WaveformSlash size={14} weight="bold" color={FAINT} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.45 }}>
                    No transcript on file — nothing failed to read. {TRANSCRIPT_PENDING_NOTE} Play the clip and write the summary below; the audio goes on the record either way.
                  </span>
                </div>
              ) : null}

              {promoteMsg.location && typeof promoteMsg.location.lat === 'number' && (
                <a
                  href={`https://maps.google.com/?q=${promoteMsg.location.lat},${promoteMsg.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10,
                    fontSize: 11, fontWeight: 800, color: GOLD_HI, textDecoration: 'none',
                  }}
                >
                  <MapPin size={12} weight="fill" /> GPS fix travels with the record
                </a>
              )}
            </div>

            {!active?.project_id && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: '9px 11px', borderRadius: 10, background: AMBER_SOFT, border: `1px solid ${AMBER_BORDER}` }}>
                <Warning size={14} weight="fill" color={GOLD_HI} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 11.5, color: GOLD_HI, fontWeight: 700, lineHeight: 1.45 }}>
                  This talkgroup is not tied to a project. A transmission files into the job it was sent on — if this one carries no project, the server will say so and write nothing.
                </span>
              </div>
            )}

            {/* ── The four targets, each in its own module's accent ────── */}
            <div style={{ ...eyebrowStyle, marginBottom: 7 }}>File It As</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
              {PROMOTE_RECORD_TYPES.map((t) => {
                const meta = PROMOTE_META[t];
                const a = promoteAccent(t);
                const on = promoteType === t;
                const done = linkFor(promoteFor, t);
                return (
                  <button
                    key={t}
                    onClick={() => { setPromoteType(t); setPromoteError(null); }}
                    aria-pressed={on}
                    title={done ? `Already filed as ${done.recordLabel}` : `File this transmission as ${meta.label.toLowerCase()}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, minWidth: 0,
                      padding: '9px 10px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                      background: on ? a.soft : FIELD_BG,
                      border: on ? `1px solid ${a.ring}` : FIELD_BORDER,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: 9,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: a.soft, border: `1px solid ${a.ring}`, color: a.hex,
                      }}
                    >
                      {meta.icon}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: on ? WHITE : MUTED }}>
                        {meta.label}
                      </span>
                      <span
                        style={{
                          display: 'block', fontSize: 10.5, fontWeight: 700, marginTop: 1,
                          color: done ? a.hex : FAINT,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {done ? <><Check size={11} weight="bold" color={a.hex} style={{ verticalAlign: '-1px', marginRight: 3 }} />{done.recordLabel}</> : meta.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {promoteError && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: '9px 11px', borderRadius: 10, background: RED_SOFT, border: `1px solid ${RED_BORDER}` }}>
                <Warning size={14} weight="fill" color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 11.5, color: '#FCA5A5', fontWeight: 700, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {promoteError}
                </span>
              </div>
            )}

            {/* ── The compact form ────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
              <PromoteField
                wide
                label={promoteType === 'rfi' ? 'Question' : promoteType === 'daily_log' ? 'Log Entry' : 'Description'}
                hint={promoteMsg.transcript
                  ? 'Seeded from the transcript — edit it into the words you want on the record.'
                  : promoteMsg.kind === 'voice'
                    ? 'Say it in writing: this text is what the record says. The clip is attached as the proof.'
                    : undefined}
              >
                <textarea
                  value={pf.summary}
                  onChange={(e) => setSummary(e.target.value)}
                  autoFocus
                  rows={4}
                  placeholder={promoteType === 'rfi'
                    ? 'What needs answering? e.g. "Footing depth at grid line C reads 30″ on S-201 but the field crew was told 36″ — which governs?"'
                    : promoteType === 'daily_log'
                      ? 'What happened on site?'
                      : 'What is wrong, and where?'}
                  style={{ ...fieldStyle, resize: 'vertical', minHeight: 84, lineHeight: 1.5, fontFamily: 'inherit' }}
                />
              </PromoteField>

              {promoteType !== 'daily_log' && (
                <PromoteField
                  wide
                  label={promoteType === 'rfi' ? 'Subject' : 'Title'}
                  hint="Follows your summary until you edit it."
                >
                  <input
                    value={pf.title}
                    onChange={(e) => { setPfTitleTouched(true); setPf((f) => ({ ...f, title: e.target.value })); }}
                    placeholder="Derived from the first line of the summary"
                    style={fieldStyle}
                  />
                </PromoteField>
              )}

              {promoteType !== 'daily_log' && (
                <PromoteField label="Priority">
                  <select
                    value={pf.priority}
                    onChange={(e) => setPf((f) => ({ ...f, priority: e.target.value }))}
                    style={{ ...fieldStyle, padding: '9px 11px' }}
                  >
                    {PROMOTE_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </PromoteField>
              )}

              {(promoteType === 'rfi' || promoteType === 'punch') && (
                <PromoteField label="Due Date">
                  <SaguaroDatePicker
                    value={pf.due}
                    onChange={(v: string) => setPf((f) => ({ ...f, due: v }))}
                    placeholder="Optional"
                  />
                </PromoteField>
              )}

              {promoteType === 'field_issue' && (
                <PromoteField label="Location">
                  <input
                    value={pf.location}
                    onChange={(e) => setPf((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Grid line, room, area…"
                    style={fieldStyle}
                  />
                </PromoteField>
              )}

              {promoteType === 'punch' && (
                <>
                  <PromoteField label="Trade">
                    <select
                      value={pf.trade}
                      onChange={(e) => setPf((f) => ({ ...f, trade: e.target.value }))}
                      style={{ ...fieldStyle, padding: '9px 11px' }}
                    >
                      {!SUB_TRADES.includes(pf.trade) && <option value={pf.trade}>{pf.trade}</option>}
                      {SUB_TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </PromoteField>
                  <PromoteField label="Location">
                    <input
                      value={pf.location}
                      onChange={(e) => setPf((f) => ({ ...f, location: e.target.value }))}
                      placeholder="Grid line, room, area…"
                      style={fieldStyle}
                    />
                  </PromoteField>
                </>
              )}

              {promoteType === 'daily_log' && (
                <>
                  <PromoteField label="Section">
                    <select
                      value={pf.section}
                      onChange={(e) => setPf((f) => ({ ...f, section: e.target.value }))}
                      style={{ ...fieldStyle, padding: '9px 11px' }}
                    >
                      {DAILY_LOG_SECTIONS.map((s) => (
                        <option key={s} value={s}>{DAILY_LOG_SECTION_LABELS[s] || s}</option>
                      ))}
                    </select>
                  </PromoteField>
                  <PromoteField label="Log Date" hint="Appends to that day's log — it never opens a second one.">
                    <SaguaroDatePicker
                      value={pf.logDate}
                      onChange={(v: string) => setPf((f) => ({ ...f, logDate: v }))}
                      placeholder="Day of the transmission"
                    />
                  </PromoteField>
                </>
              )}
            </div>
          </>
        )}
      </Dialog>

      {/* ── R14: Save / Discard / Stay confirm for the create-group modal ─ */}
      <UnsavedGuardModal guard={newGroupGuard} />

      {/* ── Toasts — honest result reporting, bottom-right ──────────────── */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 120, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
          {toasts.map((tst) => (
            <div
              key={tst.id}
              role="status"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12,
                background: 'rgba(24,24,27,0.98)',
                border: `1px solid ${tst.tone === 'ok' ? GREEN_BORDER : RED_BORDER}`,
                boxShadow: '0 14px 34px rgba(12,12,16,0.6)',
                color: WHITE, fontSize: 12.5, fontWeight: 700, lineHeight: 1.45,
              }}
            >
              {tst.tone === 'ok'
                ? <Check size={14} weight="bold" color={GREEN} style={{ flexShrink: 0 }} />
                : <Warning size={14} weight="fill" color={RED} style={{ flexShrink: 0 }} />}
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{tst.text}</span>
            </div>
          ))}
        </div>
      )}
    </PremiumSurface>
  );
}
