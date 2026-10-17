/**
 * Saguaro Radio → tracked project record.
 *
 * ONE place that shapes a radio transmission into an RFI / punch item /
 * field issue / daily-log entry, so the API route and any future surface
 * (web feed, mobile feed, batch importer) build identical rows.
 *
 * GROUND TRUTH this file is written against (verified live, 2026-08-24):
 *  - radio_messages.audio_path holds a PATH in the PRIVATE `project-files`
 *    bucket. We persist the PATH on the record, never a signed URL — signed
 *    URLs expire and would rot inside a jsonb column. Playback goes through
 *    `radioAudioHref()`, which re-signs on every read.
 *  - transcript is NULL on every voice message in production: transcription is
 *    env-gated on OPENAI_API_KEY, which is not set. The audio IS the evidence;
 *    the user types the summary. We never render an empty transcript as a
 *    failed read — see TRANSCRIPT_PENDING_NOTE.
 *  - audio_duration_secs is `numeric`, which PostgREST returns as a STRING
 *    ("2.0"). Always Number() it before math or display.
 *  - Target tables differ in what they can hold:
 *      rfis            → attachments jsonb  (structured provenance lives here)
 *      punch_list      → notes text         (NO metadata/jsonb, NO lat/long)
 *      field_issues    → description text   (NO metadata/notes column)
 *      daily_logs      → notes + voice_transcript text
 *    Where a jsonb home exists we write the object; where none exists we write
 *    the readable provenance block. The canonical structured record is always
 *    recoverable from radio_message_records.message_id → radio_messages.
 */

import { dayIn, isTimeZone } from './time-zone';
import { rfiLabel } from '@/lib/rfi';

export const PROMOTE_RECORD_TYPES = ['rfi', 'punch', 'field_issue', 'daily_log'] as const;
export type PromoteRecordType = (typeof PROMOTE_RECORD_TYPES)[number];

export function isPromoteRecordType(v: unknown): v is PromoteRecordType {
  return typeof v === 'string' && (PROMOTE_RECORD_TYPES as readonly string[]).includes(v);
}

/** Private bucket every radio clip lives in. */
export const RADIO_AUDIO_BUCKET = 'project-files';

/** Honest copy for a transmission with no transcript. Never say "read failed". */
export const TRANSCRIPT_PENDING_NOTE =
  'Auto-transcription activates when OPENAI_API_KEY is configured on the server. '
  + 'Until then the attached audio is the record of what was said.';

/* ─────────────────────────── shapes ─────────────────────────── */

export interface RadioMessageRow {
  id: string;
  tenant_id: string;
  channel_id: string | null;
  project_id: string | null;
  sender_user_id: string | null;
  sender_name: string | null;
  kind: string | null;
  body: string | null;
  audio_path: string | null;
  /** numeric column — arrives as a string from PostgREST. */
  audio_duration_secs: number | string | null;
  transcript: string | null;
  location: unknown;
  created_at: string;
}

export interface RadioProvenance {
  source: 'saguaro_radio';
  message_id: string;
  channel_id: string | null;
  channel_name: string | null;
  project_id: string | null;
  sender_name: string;
  transmitted_at: string;
  transmitted_at_display: string;
  kind: string;
  /** Storage PATH in the private bucket. Never a signed URL. */
  audio_path: string | null;
  audio_bucket: typeof RADIO_AUDIO_BUCKET;
  audio_duration_secs: number | null;
  /** Stable href that re-signs the clip on every request. */
  audio_href: string | null;
  transcript: string | null;
  /** 'available' | 'not_transcribed' — never 'failed'. */
  transcript_status: 'available' | 'not_transcribed';
  transcript_note: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Typed body of a text transmission, if any. */
  body: string | null;
}

/* ─────────────────────────── helpers ─────────────────────────── */

/** numeric-as-string safe duration. Returns null when there is no real value. */
export function durationSecs(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** radio_messages.location is `{ lat, lng }` (see /api/radio/panic). Tolerate aliases. */
export function coordsFromLocation(loc: unknown): { latitude: number | null; longitude: number | null } {
  const none = { latitude: null, longitude: null };
  if (!loc || typeof loc !== 'object') return none;
  const o = loc as Record<string, unknown>;
  const inner = (o.coords && typeof o.coords === 'object' ? o.coords : o) as Record<string, unknown>;
  const lat = Number(inner.lat ?? inner.latitude);
  const lng = Number(inner.lng ?? inner.lon ?? inner.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return none;
  return { latitude: lat, longitude: lng };
}

/**
 * "Aug 24, 2026 2:14 PM" on the given clock — the caller's zone (device, else
 * company: lib/time-zone). There is no default zone. Falls back to the raw ISO.
 */
export function displayTime(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * The calendar day a transmission was sent on, on the given clock, as
 * `YYYY-MM-DD` (daily_logs.log_date) — the caller's zone (device, else
 * company). An unreadable timestamp files to today on that same clock.
 */
export function localLogDate(iso: string, tz: string): string {
  const d = new Date(iso);
  const zone = isTimeZone(tz) ? tz : 'UTC';
  return dayIn(zone, Number.isNaN(d.getTime()) ? new Date() : d);
}

/**
 * Stable playback href. Points at the promote route's audio mode, which signs
 * the private object fresh on every request — so a record written today still
 * plays a year from now.
 */
export function radioAudioHref(messageId: string): string {
  return `/api/radio/promote?messageId=${encodeURIComponent(messageId)}&audio=1`;
}

/* ─────────────────────── provenance ─────────────────────── */

export function buildProvenance(
  msg: RadioMessageRow,
  opts: { channelName?: string | null; tz: string },
): RadioProvenance {
  const tz = opts.tz;
  const { latitude, longitude } = coordsFromLocation(msg.location);
  const transcript = msg.transcript && msg.transcript.trim() ? msg.transcript.trim() : null;
  return {
    source: 'saguaro_radio',
    message_id: msg.id,
    channel_id: msg.channel_id ?? null,
    channel_name: opts.channelName ?? null,
    project_id: msg.project_id ?? null,
    sender_name: (msg.sender_name || '').trim() || 'Unknown sender',
    transmitted_at: msg.created_at,
    transmitted_at_display: displayTime(msg.created_at, tz),
    kind: msg.kind || 'text',
    audio_path: msg.audio_path ?? null,
    audio_bucket: RADIO_AUDIO_BUCKET,
    audio_duration_secs: durationSecs(msg.audio_duration_secs),
    audio_href: msg.audio_path ? radioAudioHref(msg.id) : null,
    transcript,
    transcript_status: transcript ? 'available' : 'not_transcribed',
    transcript_note: transcript ? null : TRANSCRIPT_PENDING_NOTE,
    latitude,
    longitude,
    body: msg.body && msg.body.trim() ? msg.body.trim() : null,
  };
}

/** "From Saguaro Radio — Mike Reyes, Aug 24, 2026 2:14 PM (12s voice)" */
export function provenanceHeadline(p: RadioProvenance): string {
  const secs = p.audio_duration_secs;
  const clip = p.audio_path
    ? ` (${secs === null ? 'voice' : `${Math.max(1, Math.round(secs))}s voice`})`
    : '';
  return `From Saguaro Radio — ${p.sender_name}, ${p.transmitted_at_display}${clip}`;
}

/**
 * Readable provenance for targets with no jsonb column. Every fact in
 * RadioProvenance that a human needs, in plain text — including the storage
 * path, so the evidence is traceable straight from the record.
 */
export function provenanceBlock(p: RadioProvenance): string {
  const lines: string[] = [provenanceHeadline(p)];
  if (p.channel_name) lines.push(`Channel: ${p.channel_name}`);
  if (p.audio_path) {
    lines.push(`Audio evidence: ${p.audio_href}`);
    lines.push(`Stored at: ${p.audio_bucket}/${p.audio_path}`);
  }
  if (p.latitude !== null && p.longitude !== null) {
    lines.push(`GPS: ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`);
  }
  if (p.transcript) lines.push(`Transcript: ${p.transcript}`);
  else if (p.audio_path) lines.push(`Transcript: none on file. ${TRANSCRIPT_PENDING_NOTE}`);
  lines.push(`Radio message ID: ${p.message_id}`);
  return lines.join('\n');
}

/**
 * rfis.attachments entry. Keeps the `{ name, url }` shape the existing RFI
 * detail renderer expects (app/field/rfis/page.tsx), and carries the full
 * structured provenance alongside it.
 */
export function radioAttachment(p: RadioProvenance): Record<string, unknown> {
  return {
    ...p,
    name: provenanceHeadline(p),
    url: p.audio_href ?? '',
    // `kind` above is the radio message kind (voice/text/alert); this names the
    // attachment itself so a renderer can tell audio evidence from a text log.
    attachment_kind: p.audio_path ? 'radio_audio' : 'radio_transmission',
  };
}

/** Append a block to an existing text column without clobbering what's there. */
export function appendText(existing: string | null | undefined, block: string): string {
  const base = (existing || '').trim();
  if (!base) return block;
  if (base.includes(block)) return base;
  return `${base}\n\n${block}`;
}

/**
 * Seed text when the user promoted without typing anything. Never invents
 * content: it uses the typed body, then the transcript, then an honest
 * "voice transmission" placeholder the user can edit.
 */
export function defaultSummary(p: RadioProvenance): string {
  if (p.body) return p.body;
  if (p.transcript) return p.transcript;
  const secs = p.audio_duration_secs;
  return secs === null
    ? `Voice transmission from ${p.sender_name}`
    : `${Math.max(1, Math.round(secs))}s voice transmission from ${p.sender_name}`;
}

/** First line of a blob, trimmed to a title-sized string. */
export function titleFrom(text: string, max = 90): string {
  const first = text.split('\n')[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/* ─────────────────────── row shaping ─────────────────────── */

export type PromoteFields = Record<string, unknown>;

function str(fields: PromoteFields, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = fields[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Daily-log columns a radio entry is allowed to land in. */
export const DAILY_LOG_SECTIONS = [
  'work_performed', 'delays', 'safety_notes', 'visitors',
  'materials_delivered', 'quality_issues', 'notes',
] as const;
export type DailyLogSection = (typeof DAILY_LOG_SECTIONS)[number];

export function dailyLogSection(v: unknown): DailyLogSection {
  return typeof v === 'string' && (DAILY_LOG_SECTIONS as readonly string[]).includes(v)
    ? (v as DailyLogSection)
    : 'work_performed';
}

/**
 * Build the target row for a promote, minus the columns only the route can
 * supply (tenant_id, project_id, the allocated number, created_by).
 *
 * `existing` is the current row when we are appending to a record that already
 * exists (daily logs roll up into the day's log rather than creating a second
 * one for the same date).
 */
export function buildRecordFields(
  recordType: PromoteRecordType,
  p: RadioProvenance,
  fields: PromoteFields,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const summary = str(fields, 'summary', 'description', 'question', 'body', 'notes') || defaultSummary(p);
  const title = str(fields, 'title', 'subject') || titleFrom(summary);
  const headline = provenanceHeadline(p);
  const block = provenanceBlock(p);

  if (recordType === 'rfi') {
    const priorEntries = Array.isArray(existing?.attachments) ? (existing!.attachments as unknown[]) : [];
    return {
      subject: title,
      question: appendText(summary, headline),
      priority: str(fields, 'priority') || 'medium',
      status: 'open',
      due_date: str(fields, 'dueDate', 'due_date'),
      spec_section: str(fields, 'specSection', 'spec_section'),
      drawing_reference: str(fields, 'drawingReference', 'drawing_reference'),
      assigned_to_name: str(fields, 'assignedToName', 'assigned_to_name'),
      ball_in_court: str(fields, 'assignedToName', 'assigned_to_name'),
      notes: block,
      // Structured provenance lives in the jsonb column the module already has.
      attachments: [...priorEntries, radioAttachment(p)],
    };
  }

  if (recordType === 'punch') {
    // punch_list has NO metadata jsonb and NO latitude/longitude columns, so
    // the structured provenance is carried as the readable block in `notes`
    // (including the GPS fix and the storage path) plus the link row.
    return {
      title,
      description: summary,
      location: str(fields, 'location') || '',
      trade: str(fields, 'trade') || 'General',
      priority: str(fields, 'priority') || 'medium',
      status: str(fields, 'status') || 'open',
      due_date: str(fields, 'dueDate', 'due_date'),
      assigned_to: str(fields, 'assignedTo', 'assigned_to'),
      notes: block,
    };
  }

  if (recordType === 'field_issue') {
    // field_issues has no notes/metadata column — the readable provenance
    // block rides at the end of `description`.
    return {
      title,
      description: appendText(summary, block),
      priority: str(fields, 'priority') || 'medium',
      status: str(fields, 'status') || 'open',
      location: str(fields, 'location'),
      due_date: str(fields, 'dueDate', 'due_date'),
    };
  }

  // daily_log — append into the chosen section of the day's log.
  const section = dailyLogSection(fields.section);
  const entry = `${summary}\n${headline}`;
  const priorTranscript = typeof existing?.voice_transcript === 'string' ? existing.voice_transcript : null;
  const priorSection = existing ? (existing[section] as string | null) : null;
  const priorNotes = existing ? (existing.notes as string | null) : null;

  const out: Record<string, unknown> = { section };
  if (section === 'notes') {
    // The entry and the provenance block share one column — chain them so
    // neither overwrites the other.
    out.notes = appendText(appendText(priorNotes, entry), block);
  } else {
    out[section] = appendText(priorSection, entry);
    out.notes = appendText(priorNotes, block);
  }
  if (p.transcript) out.voice_transcript = appendText(priorTranscript, p.transcript);
  return out;
}

/** Human label stored on the link row and shown on the feed chip. */
export function recordLabel(
  recordType: PromoteRecordType,
  parts: { rfiNumber?: string | null; itemNumber?: number | null; issueNumber?: string | null; logDate?: string | null },
): string {
  switch (recordType) {
    case 'rfi':          return rfiLabel(parts.rfiNumber);
    case 'punch':        return parts.itemNumber ? `Punch #${parts.itemNumber}` : 'Punch item';
    case 'field_issue':  return parts.issueNumber ? `Issue #${parts.issueNumber}` : 'Field issue';
    case 'daily_log':    return parts.logDate ? `Daily Log — ${parts.logDate}` : 'Daily Log';
  }
}

/** Where a feed chip should send the user when they tap a promoted record. */
export function recordHref(recordType: PromoteRecordType, projectId: string | null): string {
  const base = projectId ? `/app/projects/${projectId}` : '/app';
  switch (recordType) {
    case 'rfi':          return `${base}/rfis`;
    case 'punch':        return `${base}/punch-list`;
    case 'field_issue':  return base;
    case 'daily_log':    return `${base}/daily-logs`;
  }
}
