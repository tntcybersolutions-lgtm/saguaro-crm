'use client';

/**
 * RadioEvidence — the record side of Saguaro Radio's one-tap promote.
 *
 * A super keys the mic and says "the footing depth is wrong on grid line C".
 * One tap files it as an RFI or a punch item. THIS component is what makes that
 * worth anything six months later, in a dispute: the record SHOWS the voice
 * behind it, and plays it.
 *
 * GROUND TRUTH this file is written against (verified live, 2026-08-24):
 *  - The clip lives in the PRIVATE `project-files` bucket. Records persist the
 *    storage PATH, never a signed URL. This card signs ON READ, every mount, by
 *    asking GET /api/radio/promote?messageId= for a fresh `audioUrl`. Nothing
 *    signed is ever written back or cached past the page.
 *  - ZERO voice messages in production carry a transcript: transcription is
 *    env-gated on OPENAI_API_KEY, which is not set. So an absent transcript is
 *    the NORMAL case and is stated plainly (TRANSCRIPT_PENDING_NOTE) — it is
 *    never rendered as an empty box or as a failed read.
 *  - Where the provenance is stored differs by target:
 *      rfis        → structured object inside `attachments` jsonb (+ headline
 *                    appended to `question`, which is what the RFI LIST returns)
 *      punch_list  → readable provenance block in `notes` (no jsonb column)
 *      field_issues→ readable block appended to `description`
 *    The readers below cover all three, so one card serves every surface.
 *  - GET /api/radio/promote requires Projects:View AND membership of the channel
 *    the transmission came from. A viewer who fails that gate gets the server's
 *    own plain-English reason here, not a dead player.
 *
 * Read-only. This component never writes.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Broadcast, Waveform, MapPin, Warning, ArrowClockwise } from '@phosphor-icons/react';
import { T } from '@/components/ui/shell';
import { moduleAccent } from '@/lib/module-identity';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { TRANSCRIPT_PENDING_NOTE, durationSecs as toSecs } from '@/lib/radio-promote';

/* ─────────────────────────── shape ─────────────────────────── */

/**
 * What a record can tell us about the transmission behind it, before we call
 * the server. Every field is optional because the readable-block targets carry
 * less than the jsonb ones — the card degrades honestly rather than guessing.
 */
export interface RadioEvidenceSource {
  message_id: string | null;
  sender_name: string | null;
  channel_name: string | null;
  transmitted_at: string | null;
  transmitted_at_display: string | null;
  audio_path: string | null;
  audio_bucket: string | null;
  audio_duration_secs: number | null;
  /**
   * Whether a clip exists at all. Kept separate from `audio_path` because a
   * headline-only source (rfis.question) proves a clip exists without naming
   * where it is stored — and "no path" must never be shown as "no recording".
   */
  has_audio: boolean;
  transcript: string | null;
  transcript_status: 'available' | 'not_transcribed';
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_SOURCE: RadioEvidenceSource = {
  message_id: null,
  sender_name: null,
  channel_name: null,
  transmitted_at: null,
  transmitted_at_display: null,
  audio_path: null,
  audio_bucket: null,
  has_audio: false,
  audio_duration_secs: null,
  transcript: null,
  transcript_status: 'not_transcribed',
  latitude: null,
  longitude: null,
};

/** The marker every promoted record carries, in jsonb or in prose. */
export const RADIO_HEADLINE_MARK = 'From Saguaro Radio';

/* ─────────────────────────── readers ───────────────────────────
 * Three ways a record can carry its provenance; one shape out.
 */

function nn(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * rfis.attachments — the structured entry written by radioAttachment().
 * Identified by `source === 'saguaro_radio'`, never by position.
 */
export function radioProvenanceFromAttachments(attachments: unknown): RadioEvidenceSource | null {
  if (!Array.isArray(attachments)) return null;
  for (const raw of attachments) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    if (a.source !== 'saguaro_radio') continue;
    const transcript = nn(a.transcript);
    const audioPath = nn(a.audio_path);
    return {
      message_id: nn(a.message_id),
      sender_name: nn(a.sender_name),
      channel_name: nn(a.channel_name),
      transmitted_at: nn(a.transmitted_at),
      transmitted_at_display: nn(a.transmitted_at_display),
      audio_path: audioPath,
      audio_bucket: nn(a.audio_bucket),
      audio_duration_secs: toSecs(a.audio_duration_secs as number | string | null),
      has_audio: !!audioPath,
      transcript,
      transcript_status: transcript ? 'available' : 'not_transcribed',
      latitude: num(a.latitude),
      longitude: num(a.longitude),
    };
  }
  return null;
}

/** "From Saguaro Radio — Mike Reyes, Aug 24, 2026, 9:15 AM (12s voice)" */
const HEADLINE_RE = /^From Saguaro Radio\s*[—–-]\s*(.+)$/;
/** Trailing clip marker on the headline: "(12s voice)" or bare "(voice)". */
const CLIP_RE = /\s*\((?:(\d+)s\s+)?voice\)\s*$/;
/** The timestamp always opens with a 3-letter month, which splits it off a name containing commas. */
const WHEN_RE = /^(.*?),\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},.*)$/;

function firstLabelled(lines: string[], label: string): string | null {
  const hit = lines.find(l => l.trim().startsWith(label));
  return hit ? nn(hit.trim().slice(label.length)) : null;
}

/**
 * Parse the readable provenance block written by provenanceBlock() — the only
 * home punch_list (no jsonb column) and field_issues (no notes column) have.
 * Also parses a bare headline on its own, which is all rfis.question carries in
 * the narrow column set the RFI list route returns.
 */
export function radioProvenanceFromText(text: unknown): RadioEvidenceSource | null {
  const body = nn(text);
  if (!body || !body.includes(RADIO_HEADLINE_MARK)) return null;

  const lines = body.split('\n');
  const headIdx = lines.findIndex(l => HEADLINE_RE.test(l.trim()));
  if (headIdx < 0) return null;

  const out: RadioEvidenceSource = { ...EMPTY_SOURCE };

  let rest = (lines[headIdx].trim().match(HEADLINE_RE) as RegExpMatchArray)[1];
  const clip = rest.match(CLIP_RE);
  if (clip) {
    out.audio_duration_secs = clip[1] ? Number(clip[1]) : null;
    // A "(…voice)" marker proves a clip exists even when the block is only a
    // headline and never names the storage path.
    out.has_audio = true;
    rest = rest.slice(0, clip.index ?? rest.length);
  }
  const when = rest.match(WHEN_RE);
  if (when) {
    out.sender_name = nn(when[1]);
    out.transmitted_at_display = nn(when[2]);
  } else {
    const comma = rest.indexOf(',');
    out.sender_name = nn(comma > 0 ? rest.slice(0, comma) : rest);
    out.transmitted_at_display = comma > 0 ? nn(rest.slice(comma + 1)) : null;
  }

  const tail = lines.slice(headIdx + 1);
  out.channel_name = firstLabelled(tail, 'Channel:');
  out.message_id = firstLabelled(tail, 'Radio message ID:');

  const stored = firstLabelled(tail, 'Stored at:'); // "<bucket>/<path>"
  if (stored) {
    const slash = stored.indexOf('/');
    out.audio_bucket = slash > 0 ? stored.slice(0, slash) : null;
    out.audio_path = slash > 0 ? stored.slice(slash + 1) : stored;
    out.has_audio = true;
  }

  const gps = firstLabelled(tail, 'GPS:');
  if (gps) {
    const [la, lo] = gps.split(',').map(s => Number(s.trim()));
    if (Number.isFinite(la) && Number.isFinite(lo)) { out.latitude = la; out.longitude = lo; }
  }

  // Transcript runs from its label to the message-ID line (it can be multi-line).
  const tIdx = tail.findIndex(l => l.trim().startsWith('Transcript:'));
  if (tIdx >= 0) {
    const endIdx = tail.findIndex((l, i) => i > tIdx && l.trim().startsWith('Radio message ID:'));
    const chunk = tail.slice(tIdx, endIdx < 0 ? tail.length : endIdx).join('\n').trim();
    const value = nn(chunk.slice('Transcript:'.length));
    // "none on file. <pending note>" is the honest absence, not a transcript.
    if (value && !value.startsWith('none on file')) {
      out.transcript = value;
      out.transcript_status = 'available';
    }
  }

  return out;
}

/**
 * One reader for any promoted record: structured provenance first, then each
 * prose column the shaping brain writes into.
 */
export function radioEvidenceFromRecord(record: unknown): RadioEvidenceSource | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as Record<string, unknown>;
  return (
    radioProvenanceFromAttachments(r.attachments)
    ?? radioProvenanceFromText(r.notes)
    ?? radioProvenanceFromText(r.description)
    ?? radioProvenanceFromText(r.question)
    ?? null
  );
}

/** Cheap at-a-glance test for a list row — no parsing, no network. */
export function hasRadioEvidence(record: unknown): boolean {
  return radioEvidenceFromRecord(record) !== null;
}

/**
 * Remove the provenance block from a prose column for DISPLAY only, so a card
 * and the raw notes don't say the same thing twice. Never use this on a value
 * being written back — the stored block is the record's traceability.
 */
export function stripRadioProvenance(text: unknown): string {
  const body = nn(text);
  if (!body || !body.includes(RADIO_HEADLINE_MARK)) return body ?? '';
  const lines = body.split('\n');
  const headIdx = lines.findIndex(l => HEADLINE_RE.test(l.trim()));
  if (headIdx < 0) return body;
  // A full block always closes with the message-ID line. Without that terminator
  // (rfis.question carries the headline ALONE) drop only the headline — never
  // assume everything after it is ours to remove.
  const idIdx = lines.findIndex((l, i) => i > headIdx && l.trim().startsWith('Radio message ID:'));
  const endIdx = idIdx < 0 ? headIdx : idIdx;
  const kept = [...lines.slice(0, headIdx), ...lines.slice(endIdx + 1)];
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ─────────────────────────── chrome ─────────────────────────── */

const ACCENT = moduleAccent('radio');

/** "12s" under a minute, "1:05" over it. */
export function clipLength(secs: number | null | undefined): string | null {
  if (secs === null || secs === undefined || !Number.isFinite(secs) || secs <= 0) return null;
  const s = Math.max(1, Math.round(secs));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: T.faint,
};

/**
 * The at-a-glance mark for a list row: this record has a voice recording
 * behind it. Becomes a button when `onClick` is supplied.
 */
export function RadioEvidenceChip({
  durationSecs,
  onClick,
  active = false,
}: {
  durationSecs?: number | null;
  onClick?: () => void;
  active?: boolean;
}) {
  const len = clipLength(durationSecs);
  const inner = (
    <>
      <Waveform size={12} weight="fill" color={ACCENT.hex} />
      <span>{RADIO_HEADLINE_MARK}</span>
      {len && <span style={{ color: T.faint, fontVariantNumeric: 'tabular-nums' }}>{len}</span>}
    </>
  );
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 8px', borderRadius: 20,
    background: active ? ACCENT.ring : ACCENT.soft,
    border: `1px solid ${active ? ACCENT.hex : ACCENT.ring}`,
    color: ACCENT.hex, fontSize: 12, fontWeight: 700,
    letterSpacing: 0.2, lineHeight: 1.6, whiteSpace: 'nowrap',
  };
  if (!onClick) return <span style={base}>{inner}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={active ? 'Hide the radio evidence' : 'Play the radio transmission behind this record'}
      style={{ ...base, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700 }}
    >
      {inner}
    </button>
  );
}

/* ─────────────────────────── the card ─────────────────────────── */

type AudioState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; url: string }
  | { phase: 'unavailable'; reason: string };

interface PromoteGetResponse {
  ok?: boolean;
  error?: string;
  audioUrl?: string | null;
  provenance?: Record<string, unknown> | null;
}

/**
 * The evidence card. Renders every durable fact straight from the record, then
 * signs the clip on read so it plays today and a year from now.
 */
export default function RadioEvidence({
  source,
  title = 'Radio Evidence',
  style,
}: {
  source: RadioEvidenceSource;
  title?: string;
  style?: React.CSSProperties;
}) {
  const [audio, setAudio] = useState<AudioState>({ phase: 'idle' });
  const [live, setLive] = useState<RadioEvidenceSource | null>(null);
  const [playerFailed, setPlayerFailed] = useState(false);
  const aliveRef = useRef(true);

  // Facts the record itself carries win the first paint; the server's canonical
  // copy replaces them once it answers. Neither is ever invented.
  const p: RadioEvidenceSource = live ?? source;
  const messageId = source.message_id;
  // Derived from the PROP only, so fetching can never depend on state the fetch
  // itself sets — the effect below runs once per transmission, not in a loop.
  const hasClip = source.has_audio;

  const loadAudio = useCallback(async () => {
    if (!hasClip) return;
    if (!messageId) {
      // The record proves a clip exists but does not name the transmission, so
      // there is nothing to sign. Say that instead of showing a dead player.
      setAudio({
        phase: 'unavailable',
        reason: 'This record does not carry the radio message ID, so the clip cannot be located for playback.',
      });
      return;
    }
    setPlayerFailed(false);
    setAudio({ phase: 'loading' });
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/radio/promote?messageId=${encodeURIComponent(messageId)}`, { headers });
      let d: PromoteGetResponse = {};
      try { d = await r.json(); } catch { /* body shape reported below */ }
      if (!aliveRef.current) return;

      if (!r.ok || !d.ok) {
        setAudio({
          phase: 'unavailable',
          reason: nn(d.error) ?? `The clip could not be retrieved (HTTP ${r.status}).`,
        });
        return;
      }
      // Canonical provenance from the server — the record's copy was a snapshot.
      const canonical = d.provenance ? radioProvenanceFromAttachments([{ ...d.provenance, source: 'saguaro_radio' }]) : null;
      if (canonical) setLive(canonical);

      const url = nn(d.audioUrl);
      if (!url) {
        setAudio({ phase: 'unavailable', reason: 'This transmission has no audio clip on file.' });
        return;
      }
      setAudio({ phase: 'ready', url });
    } catch (e: unknown) {
      if (!aliveRef.current) return;
      setAudio({
        phase: 'unavailable',
        reason: (e as Error)?.message || 'The clip could not be retrieved. Check your connection and try again.',
      });
    }
  }, [messageId, hasClip]);

  useEffect(() => {
    aliveRef.current = true;
    // A different transmission — drop the previous canonical copy so a stale
    // sender or duration can never be shown against the new record.
    setLive(null);
    loadAudio();
    return () => { aliveRef.current = false; };
  }, [loadAudio]);

  const len = clipLength(p.audio_duration_secs);
  const when = p.transmitted_at_display
    ?? (p.transmitted_at ? new Date(p.transmitted_at).toLocaleString('en-US') : null);

  const cell: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: '10px 12px',
  };

  return (
    <div
      style={{
        background: T.surface2,
        border: `1px solid ${ACCENT.ring}`,
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style,
      }}
    >
      {/* Mark + who / when */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20,
            background: ACCENT.soft, border: `1px solid ${ACCENT.ring}`,
            color: ACCENT.hex, fontSize: 12, fontWeight: 800, letterSpacing: 0.3, whiteSpace: 'nowrap',
          }}
        >
          <Broadcast size={13} weight="fill" color={ACCENT.hex} />
          {RADIO_HEADLINE_MARK}
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.white }}>
            {p.sender_name || 'Unknown sender'}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {[when, p.channel_name ? `Channel: ${p.channel_name}` : null].filter(Boolean).join(' · ') || 'Time not recorded'}
          </div>
        </div>
        {len && (
          <span
            style={{
              fontSize: 12, fontWeight: 700, color: T.muted,
              fontVariantNumeric: 'tabular-nums', padding: '4px 9px',
              borderRadius: 20, background: T.goldDim, border: `1px solid ${T.borderGold}`, whiteSpace: 'nowrap',
            }}
          >
            {len} voice
          </span>
        )}
      </div>

      {/* The evidence itself */}
      <div>
        <div style={{ ...label, marginBottom: 6 }}>{title}</div>
        {!hasClip ? (
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
            This transmission was text on the channel — there is no audio clip behind this record.
          </div>
        ) : audio.phase === 'ready' && !playerFailed ? (
          <audio
            controls
            preload="metadata"
            src={audio.url}
            onError={() => setPlayerFailed(true)}
            style={{ width: '100%', height: 38, colorScheme: 'dark', display: 'block' }}
          >
            Your browser cannot play audio. The clip is stored with this record.
          </audio>
        ) : (audio.phase === 'loading' || audio.phase === 'idle') && !playerFailed ? (
          // 'idle' is the frame before the effect fires — still "on its way",
          // never an error.
          <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.55 }}>
            Signing the clip for playback…
          </div>
        ) : (
          <div
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: T.redDim, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '10px 12px',
            }}
          >
            <Warning size={15} weight="fill" color={T.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.white, lineHeight: 1.55 }}>
                {playerFailed
                  ? 'The signed link expired or the clip would not play. Reload it to try again.'
                  : audio.phase === 'unavailable'
                    ? audio.reason
                    : 'The clip has not been loaded yet.'}
              </div>
              <button
                type="button"
                onClick={loadAudio}
                style={{
                  marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.muted, fontSize: 12, fontWeight: 700,
                }}
              >
                <ArrowClockwise size={12} weight="bold" color={T.muted} /> Reload the Clip
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transcript — present, or honestly absent. Never an empty box. */}
      <div>
        <div style={{ ...label, marginBottom: 6 }}>Transcript</div>
        {p.transcript ? (
          <div
            style={{
              fontSize: 13, color: T.white, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', ...cell,
            }}
          >
            {p.transcript}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
            No transcript on file. {TRANSCRIPT_PENDING_NOTE}
          </div>
        )}
      </div>

      {/* Where it came from, and where it lives — traceability for a dispute. */}
      {(p.latitude !== null || p.audio_path || messageId) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
          {p.latitude !== null && p.longitude !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.muted }}>
              <MapPin size={12} weight="fill" color={T.faint} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}
              </span>
              <span style={{ color: T.faint }}>where it was transmitted</span>
            </div>
          )}
          {p.audio_path && (
            <div style={{ fontSize: 12, color: T.faint, wordBreak: 'break-all', lineHeight: 1.5 }}>
              Stored at {p.audio_bucket || 'project-files'}/{p.audio_path}
            </div>
          )}
          {messageId && (
            <div style={{ fontSize: 12, color: T.faint, wordBreak: 'break-all', lineHeight: 1.5 }}>
              Radio message {messageId}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
