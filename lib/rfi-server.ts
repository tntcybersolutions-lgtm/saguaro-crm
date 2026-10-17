/**
 * Server side of RFIs: who an assignee is (their email, from the job's
 * people), and the official answer — one per RFI, written the same way from
 * every place an answer can come from (the RFI page's thread, the RFI log's
 * Answer form, the field app, a reply by email).
 *
 * Every read and write is scoped to the caller's tenant (CLAUDE.md §3).
 */
import { createServerClient } from '@/lib/supabase-server';
import { writeWithOptionalColumns, type DbError } from '@/lib/optional-column';
import { architectContact } from '@/lib/project-parties';
import { assignmentToNotify, pickAssigneeEmail, type Assignee, type PersonCandidate, type RfiPerson } from '@/lib/rfi';

type Db = ReturnType<typeof createServerClient>;
type Row = Record<string, unknown>;
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The people an RFI can be assigned to on this job, in the order a name is
 * matched: the job directory, the job team, the company's users, the job's
 * subs, the job's architect. Each read is non-fatal — a failed lookup just
 * means fewer people to match (logged), never a failed reassignment.
 */
export async function assigneeCandidates(db: Db, tenantId: string, projectId: string | null): Promise<PersonCandidate[]> {
  const out: PersonCandidate[] = [];
  const read = async (label: string, q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await q;
    if (error) { console.error(`[rfi-server] ${label} lookup failed`, error); return [] as Row[]; }
    return (Array.isArray(data) ? data : []) as Row[];
  };
  const [contacts, team, profiles, subs, project] = await Promise.all([
    projectId ? read('contacts', (db as any).from('contacts').select('name, email, company').eq('tenant_id', tenantId).eq('project_id', projectId)) : Promise.resolve([]),
    projectId ? read('project_team', (db as any).from('project_team').select('name, email, company').eq('tenant_id', tenantId).eq('project_id', projectId)) : Promise.resolve([]),
    read('profiles', (db as any).from('profiles').select('full_name, email').eq('tenant_id', tenantId)),
    projectId ? read('project_subcontractors', (db as any).from('project_subcontractors').select('subcontractors(company_name, contact_name, email, contact_email)').eq('tenant_id', tenantId).eq('project_id', projectId)) : Promise.resolve([]),
    projectId ? read('projects', (db as any).from('projects').select('*').eq('tenant_id', tenantId).eq('id', projectId).limit(1)) : Promise.resolve([]),
  ]);
  for (const c of contacts) out.push({ name: c.name, email: c.email, company: c.company });
  for (const m of team) out.push({ name: m.name, email: m.email, company: m.company });
  for (const p of profiles) out.push({ name: p.full_name, email: p.email });
  for (const r of subs) {
    const s = (r.subcontractors || {}) as Row;
    out.push({ name: s.contact_name, company: s.company_name, email: s.contact_email || s.email });
  }
  if (project[0]) {
    const a = architectContact(project[0]);
    if (a.email) out.push({ name: a.name, email: a.email, company: 'Architect' });
  }
  return out;
}

/** The person's email, when the job knows it. */
export async function resolveAssignee(db: Db, tenantId: string, projectId: string | null, who: Assignee): Promise<Assignee> {
  if (who.email) return who;
  const email = pickAssigneeEmail(who, await assigneeCandidates(db, tenantId, projectId));
  return { name: who.name, email };
}

/**
 * A write that hands the RFI to someone new: who, with their email resolved —
 * or null when nobody should hear about it (lib/rfi assignmentToNotify).
 */
export async function planReassignment(db: Db, tenantId: string, before: Row, patch: Row, actorEmail: string | null): Promise<Assignee | null> {
  const who = assignmentToNotify(before as RfiPerson, patch, actorEmail);
  if (!who) return null;
  const resolved = await resolveAssignee(db, tenantId, (before.project_id as string) || null, who);
  // The person making the change is never emailed about their own move.
  if (resolved.email && actorEmail && resolved.email === actorEmail.trim().toLowerCase()) return null;
  return resolved;
}

/**
 * Before an RFI write that may hand it to someone: the write itself, with the
 * new assignee's email filled in (and a previous assignee's email cleared, so
 * the old person's address never sits beside the new person's name), and who
 * to tell. Call it with the RFI as it is now and the columns about to be
 * written; then write `patch`, then (on success) fire onRFIAssigned for `notify`.
 */
export async function prepareReassignment(
  db: Db, tenantId: string, before: Row, patch: Row, actorEmail: string | null,
): Promise<{ patch: Row; notify: Assignee | null }> {
  const out: Row = { ...patch };
  const nameChanged = 'assigned_to_name' in patch
    && String(patch.assigned_to_name ?? '').trim().toLowerCase() !== String(before.assigned_to_name ?? '').trim().toLowerCase();
  if (nameChanged && !('assigned_to_email' in patch)) {
    const name = String(patch.assigned_to_name ?? '').trim();
    const resolved = name ? await resolveAssignee(db, tenantId, (before.project_id as string) || null, { name, email: null }) : { name, email: null };
    out.assigned_to_email = resolved.email;
  }
  const notify = await planReassignment(db, tenantId, before, out, actorEmail);
  return { patch: out, notify };
}

/** The name to sign an assignment email with: the user's profile name, else their email. */
export async function actorName(db: Db, user: { id: string; email: string; tenantId: string }): Promise<string> {
  const { data, error } = await (db as any).from('profiles').select('full_name').eq('id', user.id).eq('tenant_id', user.tenantId).maybeSingle();
  if (error) console.error('[rfi-server] actor name lookup failed', error);
  return String((data as { full_name?: string } | null)?.full_name || user.email || '');
}

/**
 * Insert one RFI. Its number is the job's next one, stamped by the database
 * (set_rfi_number takes a per-job lock, and a unique index on the job's
 * numbers stands behind it). Should two writers still collide on that index,
 * the insert is tried once more — the trigger then reads the number the other
 * one took and moves past it.
 */
export async function insertRfi(db: Db, row: Record<string, unknown>, columns = '*'): Promise<{ data: any; error: any }> {
  const once = () => (db as any).from('rfis').insert(row).select(columns).single();
  const first = await once();
  const dup = first.error && (first.error as { code?: string }).code === '23505'
    && /rfis_project_rfi_number_key/.test(String((first.error as { message?: string }).message || ''));
  return dup ? once() : first;
}

/* ── The official answer ────────────────────────────────────────────────── */

export type OfficialEntry = { kind: 'comment' | 'response'; id: string };

/** Un-mark every official entry on this RFI (both tables), except `keep`. */
export async function clearOfficialFlags(db: Db, tenantId: string, rfiId: string, keep: { comment?: string | null; response?: string | null } = {}) {
  let c = (db as any).from('entity_comments').update({ is_official: false } as never)
    .eq('tenant_id', tenantId).eq('entity_type', 'rfis').eq('entity_id', rfiId).eq('is_official', true);
  if (keep.comment) c = c.neq('id', keep.comment);
  const { error: cErr } = await c;
  if (cErr) throw cErr;
  let r = (db as any).from('rfi_responses').update({ is_official: false } as never)
    .eq('tenant_id', tenantId).eq('rfi_id', rfiId).eq('is_official', true);
  if (keep.response) r = r.neq('id', keep.response);
  const { error: rErr } = await r;
  if (rErr) throw rErr;
}

/**
 * Find the entry and its twin: a comment's mirrored response, or a response's comment.
 * Returns null when the entry is not on this RFI.
 */
async function entryPair(db: Db, tenantId: string, rfiId: string, entry: OfficialEntry): Promise<{ comment: Row | null; response: Row | null } | null> {
  if (entry.kind === 'comment') {
    const { data: comment, error } = await (db as any).from('entity_comments').select('*')
      .eq('tenant_id', tenantId).eq('entity_type', 'rfis').eq('entity_id', rfiId).eq('id', entry.id).maybeSingle();
    if (error) throw error;
    if (!comment || (comment as Row).deleted_at) return null;
    const { data: twins, error: tErr } = await (db as any).from('rfi_responses').select('*')
      .eq('tenant_id', tenantId).eq('rfi_id', rfiId).eq('comment_id', entry.id);
    // An older database without rfi_responses.comment_id simply has no twin.
    if (tErr && (tErr as { code?: string }).code !== '42703') throw tErr;
    return { comment: comment as Row, response: ((twins || []) as Row[])[0] ?? null };
  }
  const { data: response, error } = await (db as any).from('rfi_responses').select('*')
    .eq('tenant_id', tenantId).eq('rfi_id', rfiId).eq('id', entry.id).maybeSingle();
  if (error) throw error;
  if (!response) return null;
  const cid = (response as Row).comment_id as string | undefined;
  let comment: Row | null = null;
  if (cid) {
    const { data } = await (db as any).from('entity_comments').select('*').eq('tenant_id', tenantId).eq('id', cid).maybeSingle();
    comment = (data as Row | null) ?? null;
  }
  return { comment, response: response as Row };
}

/**
 * Make one entry the RFI's official answer: it (and its twin) is flagged,
 * every other entry is un-flagged, and the RFI itself is answered — answer
 * text, who, when, status 'answered', the ball back with whoever asked.
 * Returns false when the entry is not on this RFI.
 */
export async function setOfficialAnswer(
  db: Db, tenantId: string, rfi: Row, entry: OfficialEntry,
  opts: { by: string; source?: 'email' | null },
): Promise<boolean> {
  const rfiId = String(rfi.id);
  const pair = await entryPair(db, tenantId, rfiId, entry);
  if (!pair) return false;
  const commentId = (pair.comment?.id as string) || null;
  const responseId = (pair.response?.id as string) || null;
  await clearOfficialFlags(db, tenantId, rfiId, { comment: commentId, response: responseId });
  if (commentId) {
    const { error } = await (db as any).from('entity_comments').update({ is_official: true } as never).eq('tenant_id', tenantId).eq('id', commentId);
    if (error) throw error;
  }
  if (responseId) {
    const { error } = await (db as any).from('rfi_responses').update({ is_official: true } as never).eq('tenant_id', tenantId).eq('id', responseId);
    if (error) throw error;
  }
  const text = String((pair.response?.response_text ?? pair.comment?.body) || '');
  const author = String((pair.response?.responder_name ?? pair.comment?.author_name) || opts.by || '');
  const now = new Date().toISOString();
  const ballBack = String(rfi.submitted_by || '');
  const { result: { error } } = await writeWithOptionalColumns(
    {
      answer: text,
      answered_by: author,
      answered_at: now,
      answered_date: now.slice(0, 10),
      status: 'answered',
      ...(ballBack ? { ball_in_court: ballBack } : {}),
      last_activity_at: now,
      last_activity_type: 'answered',
      answer_source: opts.source ?? ((pair.response?.source ?? pair.comment?.source) === 'email' ? 'email' : null),
    },
    ['answer_source'],
    (row) => (db as any).from('rfis').update(row as never).eq('id', rfiId).eq('tenant_id', tenantId),
  );
  if (error) throw error;
  return true;
}

/**
 * Take the official mark off: no entry is official, the RFI's answer is
 * cleared and an answered RFI goes back to open, with the ball back with
 * whoever it is assigned to.
 */
export async function clearOfficialAnswer(db: Db, tenantId: string, rfi: Row): Promise<void> {
  const rfiId = String(rfi.id);
  await clearOfficialFlags(db, tenantId, rfiId);
  const now = new Date().toISOString();
  const assignee = String(rfi.assigned_to_name || '').trim();
  const { result: { error } } = await writeWithOptionalColumns(
    {
      answer: null,
      answered_by: null,
      answered_at: null,
      answered_date: null,
      ...(String(rfi.status || '') === 'answered' ? { status: 'open' } : {}),
      ...(assignee ? { ball_in_court: assignee } : {}),
      last_activity_at: now,
      last_activity_type: 'answer_unmarked',
      answer_source: null,
    },
    ['answer_source'],
    (row) => (db as any).from('rfis').update(row as never).eq('id', rfiId).eq('tenant_id', tenantId),
  );
  if (error) throw error;
}

/**
 * Record an answer typed somewhere other than the RFI's thread (the RFI log's
 * Answer form, the field app) as an official response on the thread, so the
 * RFI page lists it with who and when. The caller has already answered the RFI.
 */
export async function recordOfficialResponse(
  db: Db, tenantId: string, rfiId: string,
  r: { text: string; name: string; email?: string | null; attachments?: { name: string; url: string }[]; source?: string | null },
): Promise<string | null> {
  await clearOfficialFlags(db, tenantId, rfiId);
  const { result: { data, error } } = await writeWithOptionalColumns<{ data: { id?: string } | null; error: DbError | null }>(
    {
      tenant_id: tenantId,
      rfi_id: rfiId,
      responder_name: r.name || r.email || 'Project team',
      responder_email: r.email || null,
      response_text: r.text,
      attachments: r.attachments || [],
      is_official: true,
      responded_at: new Date().toISOString(),
      source: r.source ?? 'app',
    },
    ['source'],
    (row) => (db as any).from('rfi_responses').insert(row as never).select('id').single(),
  );
  if (error) throw error;
  return ((data as { id?: string } | null)?.id) ?? null;
}
