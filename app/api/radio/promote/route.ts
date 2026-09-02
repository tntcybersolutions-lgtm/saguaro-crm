import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { onRFICreated } from '@/lib/triggers';
import {
  isPromoteRecordType,
  buildProvenance,
  buildRecordFields,
  recordLabel,
  recordHref,
  localLogDate,
  provenanceHeadline,
  RADIO_AUDIO_BUCKET,
  PROMOTE_RECORD_TYPES,
  type PromoteRecordType,
  type RadioMessageRow,
  type RadioProvenance,
} from '@/lib/radio-promote';
import { must, tryWrite } from '@/lib/db-write';

/**
 * Saguaro Radio — ONE-TAP PROMOTE.
 *
 * A transmission becomes a tracked project record with the original audio
 * attached as evidence. No phone can do this; a radio app with no project to
 * file into cannot either.
 *
 *   POST { messageId, recordType, fields } -> { ok, recordId, recordLabel, recordType }
 *   GET  ?messageId=            -> links already created for that transmission
 *   GET  ?messageId=&audio=1    -> 302 to a freshly signed URL for the clip
 *
 * Rules held here:
 *  - project_id comes FROM THE MESSAGE, never from the body. The transmission
 *    decides which job it files into.
 *  - The record is created through the same numbering the module's own create
 *    route uses, so a promoted RFI is indistinguishable from a hand-made one.
 *  - supabase-js does NOT throw. Every write is error-checked, and a partial
 *    write is rolled back rather than reported as success.
 *  - Promoting the same transmission to the same record type twice returns the
 *    ORIGINAL record instead of creating a duplicate.
 */

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

const TARGETS: Record<PromoteRecordType, { table: string; softDelete: boolean }> = {
  rfi:         { table: 'rfis',         softDelete: true },
  punch:       { table: 'punch_list',   softDelete: false },
  field_issue: { table: 'field_issues', softDelete: true },
  daily_log:   { table: 'daily_logs',   softDelete: true },
};

/** RFIs need RFI rights; everything else is a project-edit action. */
function categoryFor(recordType: PromoteRecordType): 'RFIs' | 'Projects' {
  return recordType === 'rfi' ? 'RFIs' : 'Projects';
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Same membership gate the channel read uses — radio privacy is not bypassed by promoting. */
async function isMember(db: Db, tenantId: string, userId: string, channelId: string | null): Promise<boolean> {
  if (!channelId) return false;
  const { data, error } = await db.from('radio_members').select('id')
    .eq('tenant_id', tenantId).eq('channel_id', channelId).eq('user_id', userId).limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

async function loadMessage(db: Db, tenantId: string, messageId: string): Promise<
  | { msg: RadioMessageRow; channelName: string | null }
  | { error: string; status: number }
> {
  const { data, error } = await db.from('radio_messages')
    .select('id, tenant_id, channel_id, project_id, sender_user_id, sender_name, kind, body, audio_path, audio_duration_secs, transcript, location, created_at')
    .eq('tenant_id', tenantId).eq('id', messageId).maybeSingle();
  if (error) return { error: `Could not read the transmission: ${error.message}`, status: 500 };
  if (!data) return { error: 'Transmission not found in this tenant', status: 404 };

  let channelName: string | null = null;
  const channelId = (data as RadioMessageRow).channel_id;
  if (channelId) {
    const { data: ch } = await db.from('radio_channels').select('name').eq('id', channelId).maybeSingle();
    channelName = (ch as { name?: string } | null)?.name ?? null;
  }
  return { msg: data as RadioMessageRow, channelName };
}

/** Existing link for this transmission + record type, if the target row is still alive. */
async function existingLink(
  db: Db, tenantId: string, messageId: string, recordType: PromoteRecordType,
): Promise<{ link: Record<string, any> | null; error: string | null }> {
  const { data, error } = await db.from('radio_message_records').select('*')
    .eq('tenant_id', tenantId).eq('message_id', messageId).eq('record_type', recordType)
    .order('created_at', { ascending: true }).limit(1);
  if (error) return { link: null, error: `Could not check existing links: ${error.message}` };
  const link = (Array.isArray(data) ? data[0] : null) as Record<string, any> | null;
  if (!link) return { link: null, error: null };

  const target = TARGETS[recordType];
  const { data: row, error: rowErr } = await db.from(target.table)
    .select(target.softDelete ? 'id, deleted_at' : 'id')
    .eq('tenant_id', tenantId).eq('id', link.record_id).maybeSingle();
  if (rowErr) return { link: null, error: `Could not verify the linked record: ${rowErr.message}` };

  const alive = !!row && (!target.softDelete || !(row as Record<string, any>).deleted_at);
  if (alive) return { link, error: null };

  // The record it pointed at is gone — drop the stale link and let the caller re-create.
  await must(db.from('radio_message_records').delete().eq('id', link.id), 'radio_message_records delete');
  return { link: null, error: null };
}

/* ─────────────────────── number allocation ───────────────────────
 * Each one mirrors the module's own create route exactly. Do not
 * "improve" these — a promoted record must number like a hand-made one.
 */

/** rfis: tenant-wide count + 1, zero-padded — identical to app/api/rfis/create. */
async function nextRfiNumber(db: Db, tenantId: string): Promise<string> {
  const { count } = await db.from('rfis').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return `RFI-${String((count || 0) + 1).padStart(3, '0')}`;
}

/** punch_list: per-project max(item_number) + 1 — identical to app/api/punch-list/create. */
async function nextPunchNumber(db: Db, tenantId: string, projectId: string): Promise<number> {
  const { data } = await db.from('punch_list').select('item_number')
    .eq('tenant_id', tenantId).eq('project_id', projectId)
    .order('item_number', { ascending: false }).limit(1).maybeSingle();
  return (Number((data as Record<string, unknown> | null)?.item_number) || 0) + 1;
}

/**
 * field_issues has no create route in web; the live rows carry a per-project
 * integer sequence ("1".."5") alongside seeded "OBS-xxxx" values. Continue the
 * integer sequence and ignore the non-numeric ones.
 */
async function nextIssueNumber(db: Db, tenantId: string, projectId: string): Promise<string> {
  const { data } = await db.from('field_issues').select('issue_number')
    .eq('tenant_id', tenantId).eq('project_id', projectId);
  const highest = (Array.isArray(data) ? data : []).reduce((max: number, r: any) => {
    const n = Number(r?.issue_number);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return String(highest + 1);
}

/* ─────────────────────── POST ─────────────────────── */

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* validated below */ }

  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
  const recordType = body.recordType;
  if (!messageId) return fail('messageId is required', 400);
  if (!isPromoteRecordType(recordType)) {
    return fail(`recordType must be one of: ${PROMOTE_RECORD_TYPES.join(', ')}`, 400);
  }
  const fields = (body.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>;

  const g = await requirePermission(req, categoryFor(recordType), 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const tenantId = user.tenantId;
  const db = createServerClient() as Db;

  const loaded = await loadMessage(db, tenantId, messageId);
  if ('error' in loaded) return fail(loaded.error, loaded.status);
  const { msg, channelName } = loaded;

  // The transmission decides the job. A radio call with no project cannot be filed.
  const projectId = msg.project_id;
  if (!projectId) {
    return fail('This transmission is not tied to a project, so it cannot be filed. Move the channel onto a project first.', 409);
  }

  if (!(await isMember(db, tenantId, user.id, msg.channel_id))) {
    return fail('You are not a member of this channel', 403);
  }

  const prior = await existingLink(db, tenantId, messageId, recordType);
  if (prior.error) return fail(prior.error, 500);
  if (prior.link) {
    return NextResponse.json({
      ok: true,
      alreadyPromoted: true,
      recordId: prior.link.record_id,
      recordLabel: prior.link.record_label,
      recordType,
      projectId,
      href: recordHref(recordType, projectId),
    });
  }

  const prov = buildProvenance(msg, { channelName });

  let recordId = '';
  let label = '';
  /** True only when this request created the row — a daily log we appended to must not be rolled back. */
  let created = false;

  try {
    if (recordType === 'rfi') {
      const shaped = buildRecordFields('rfi', prov, fields);
      const rfi_number = await nextRfiNumber(db, tenantId);
      const { data, error } = await db.from('rfis').insert({
        tenant_id: tenantId,
        project_id: projectId,
        rfi_number,
        submitted_by: user.email || 'Field User',
        created_by: user.id,
        ...shaped,
      }).select('id, rfi_number').single();
      if (error) return fail(`Could not create the RFI: ${error.message}`, 500);
      recordId = (data as any).id;
      created = true;
      label = recordLabel('rfi', { rfiNumber: (data as any).rfi_number });

    } else if (recordType === 'punch') {
      const shaped = buildRecordFields('punch', prov, fields);
      const item_number = await nextPunchNumber(db, tenantId, projectId);
      const { data, error } = await db.from('punch_list').insert({
        tenant_id: tenantId,
        project_id: projectId,
        item_number,
        created_by: user.id,
        ...shaped,
      }).select('id, item_number').single();
      if (error) return fail(`Could not create the punch item: ${error.message}`, 500);
      recordId = (data as any).id;
      created = true;
      label = recordLabel('punch', { itemNumber: Number((data as any).item_number) });

    } else if (recordType === 'field_issue') {
      const shaped = buildRecordFields('field_issue', prov, fields);
      const issue_number = await nextIssueNumber(db, tenantId, projectId);
      const { data, error } = await db.from('field_issues').insert({
        tenant_id: tenantId,
        project_id: projectId,
        issue_number,
        reported_by: user.id,
        ...shaped,
      }).select('id, issue_number').single();
      if (error) return fail(`Could not create the field issue: ${error.message}`, 500);
      recordId = (data as any).id;
      created = true;
      label = recordLabel('field_issue', { issueNumber: (data as any).issue_number });

    } else {
      // daily_log — a transmission is an ENTRY in the day's log, not a second
      // log for the same date. Append when the day already has one.
      const logDate = typeof fields.logDate === 'string' && fields.logDate.trim()
        ? fields.logDate.trim()
        : localLogDate(msg.created_at);

      const { data: dayRows, error: dayErr } = await db.from('daily_logs')
        .select('id, log_date, work_performed, delays, safety_notes, visitors, materials_delivered, quality_issues, notes, voice_transcript')
        .eq('tenant_id', tenantId).eq('project_id', projectId).eq('log_date', logDate)
        .is('deleted_at', null).order('created_at', { ascending: true }).limit(1);
      if (dayErr) return fail(`Could not read the daily log: ${dayErr.message}`, 500);
      const dayLog = (Array.isArray(dayRows) ? dayRows[0] : null) as Record<string, unknown> | null;

      const shaped = buildRecordFields('daily_log', prov, fields, dayLog);
      delete shaped.section; // routing hint only — not a column

      if (dayLog) {
        const { data, error } = await db.from('daily_logs')
          .update(shaped).eq('id', dayLog.id as string).eq('tenant_id', tenantId)
          .select('id, log_date').single();
        if (error) return fail(`Could not add the entry to the daily log: ${error.message}`, 500);
        recordId = (data as any).id;
        label = recordLabel('daily_log', { logDate: (data as any).log_date });
      } else {
        const { data, error } = await db.from('daily_logs').insert({
          tenant_id: tenantId,
          project_id: projectId,
          log_date: logDate,
          created_by: user.id,
          ...shaped,
        }).select('id, log_date').single();
        if (error) return fail(`Could not create the daily log: ${error.message}`, 500);
        recordId = (data as any).id;
        created = true;
        label = recordLabel('daily_log', { logDate: (data as any).log_date });
      }
    }
  } catch (err) {
    console.error('[radio/promote] unexpected:', err);
    return fail('Could not create the record', 500);
  }

  // Write the link. The unique index is (message_id, record_type, record_id), so
  // a concurrent promote of the same transmission would slip past it with a new
  // record_id — re-check by (message_id, record_type) and roll our row back if
  // another request already won.
  const { data: racers, error: raceErr } = await db.from('radio_message_records').select('*')
    .eq('tenant_id', tenantId).eq('message_id', messageId).eq('record_type', recordType)
    .order('created_at', { ascending: true }).limit(1);
  if (raceErr) {
    if (created) await tryWrite(db.from(TARGETS[recordType].table).delete().eq('id', recordId).eq('tenant_id', tenantId), 'row delete');
    return fail(`Could not link the transmission to the record: ${raceErr.message}`, 500);
  }
  const winner = (Array.isArray(racers) ? racers[0] : null) as Record<string, any> | null;
  if (winner) {
    if (created) await tryWrite(db.from(TARGETS[recordType].table).delete().eq('id', recordId).eq('tenant_id', tenantId), 'row delete');
    return NextResponse.json({
      ok: true,
      alreadyPromoted: true,
      recordId: winner.record_id,
      recordLabel: winner.record_label,
      recordType,
      projectId,
      href: recordHref(recordType, projectId),
    });
  }

  const { error: linkErr } = await db.from('radio_message_records').insert({
    tenant_id: tenantId,
    project_id: projectId,
    message_id: messageId,
    record_type: recordType,
    record_id: recordId,
    record_label: label,
    created_by: user.id,
    created_by_name: user.email || null,
  });

  if (linkErr) {
    // Unique violation = another request landed the same link between our
    // re-check and this insert. Roll ours back and return theirs.
    if ((linkErr as any).code === '23505') {
      const { data: theirs } = await db.from('radio_message_records').select('*')
        .eq('tenant_id', tenantId).eq('message_id', messageId).eq('record_type', recordType).limit(1);
      const other = (Array.isArray(theirs) ? theirs[0] : null) as Record<string, any> | null;
      if (created) await must(db.from(TARGETS[recordType].table).delete().eq('id', recordId).eq('tenant_id', tenantId), 'row delete');
      if (other) {
        return NextResponse.json({
          ok: true,
          alreadyPromoted: true,
          recordId: other.record_id,
          recordLabel: other.record_label,
          recordType,
          projectId,
          href: recordHref(recordType, projectId),
        });
      }
    }
    // Never report a half-finished promote as success.
    if (created) await must(db.from(TARGETS[recordType].table).delete().eq('id', recordId).eq('tenant_id', tenantId), 'row delete');
    return fail(`The record could not be linked to the transmission, so it was rolled back: ${linkErr.message}`, 500);
  }

  // Same lifecycle a hand-made RFI fires (architect email + in-app notification
  // + webhook fan-out). Fired only after the link landed, so we never notify
  // about a record we rolled back. Non-blocking — never fails the promote.
  if (recordType === 'rfi' && created) onRFICreated(recordId).catch(console.error);

  return NextResponse.json({
    ok: true,
    alreadyPromoted: false,
    recordId,
    recordLabel: label,
    recordType,
    projectId,
    href: recordHref(recordType, projectId),
    evidence: {
      audioPath: prov.audio_path,
      audioHref: prov.audio_href,
      durationSecs: prov.audio_duration_secs,
      transcriptStatus: prov.transcript_status,
      transcriptNote: prov.transcript_note,
      headline: provenanceHeadline(prov),
    },
  }, { status: 201 });
}

/* ─────────────────────── GET ─────────────────────── */

export async function GET(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get('messageId');
  const wantsAudio = req.nextUrl.searchParams.get('audio') === '1';
  if (!messageId) return fail('messageId is required', 400);

  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const tenantId = user.tenantId;
  const db = createServerClient() as Db;

  const loaded = await loadMessage(db, tenantId, messageId);
  if ('error' in loaded) return fail(loaded.error, loaded.status);
  const { msg, channelName } = loaded;

  if (!(await isMember(db, tenantId, user.id, msg.channel_id))) {
    return fail('You are not a member of this channel', 403);
  }

  // Evidence playback: sign the private object fresh on every request, so the
  // path stored on the record never rots into a dead link.
  if (wantsAudio) {
    if (!msg.audio_path) return fail('This transmission has no audio', 404);
    const signed = await signStoredUrl(RADIO_AUDIO_BUCKET, msg.audio_path, 3600);
    if (!signed || signed === msg.audio_path) return fail('Could not sign the audio clip', 502);
    return NextResponse.redirect(signed, 302);
  }

  const { data, error } = await db.from('radio_message_records').select('*')
    .eq('tenant_id', tenantId).eq('message_id', messageId)
    .order('created_at', { ascending: true });
  if (error) return fail(`Could not read the links for this transmission: ${error.message}`, 500);

  const prov: RadioProvenance = buildProvenance(msg, { channelName });
  const links = ((data || []) as Record<string, any>[]).map((l) => ({
    id: l.id,
    recordType: l.record_type as PromoteRecordType,
    recordId: l.record_id,
    recordLabel: l.record_label,
    createdAt: l.created_at,
    createdByName: l.created_by_name,
    href: isPromoteRecordType(l.record_type) ? recordHref(l.record_type, l.project_id) : null,
  }));

  return NextResponse.json({
    ok: true,
    messageId,
    projectId: msg.project_id,
    links,
    provenance: prov,
    // Signed here for immediate playback in the feed; the durable value is
    // provenance.audio_path plus provenance.audio_href.
    audioUrl: msg.audio_path ? await signStoredUrl(RADIO_AUDIO_BUCKET, msg.audio_path, 3600) : null,
  });
}
