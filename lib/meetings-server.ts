/**
 * meetings-server — the shared gate and lookups for the job meetings routes.
 *
 * meeting_items is newer than the generated database types, so the routes use
 * an untyped handle for it (as item_links does). Every query still filters on
 * the caller's tenant; the permission gate also proves the project is theirs.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission, type AuthedUser } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { isMissingTableError, TABLE_MISSING_CODE, TABLE_MISSING_MESSAGE } from '@/lib/meetings';

export type MeetingsDb = SupabaseClient;

export const MEETING_COLS =
  'id, project_id, title, meeting_type, meeting_number, meeting_date, start_time, end_time, location, status, notes, facilitator_name, distributed_at, distributed_to, created_by, created_at, updated_at';
export const ATTENDEE_COLS = 'id, meeting_id, name, company, email, role, attended, created_at';
export const ITEM_COLS =
  'id, meeting_id, project_id, number, topic, discussion, status, assignee_name, due_date, carried_from_item_id, position, closed_at, created_at, updated_at';

type Gate = { ok: true; user: AuthedUser; db: MeetingsDb } | { ok: false; res: NextResponse };

/** Projects permission, scoped to (and proving ownership of) the job. */
export async function meetingsGate(req: NextRequest, level: 'View' | 'Edit', projectId: string): Promise<Gate> {
  const typed = createServerClient();
  const g = await requirePermission(req, 'Projects', level, { projectId, db: typed });
  if (!g.ok) return g;
  return { ok: true, user: g.user, db: typed as unknown as MeetingsDb };
}

export function tableMissing(): NextResponse {
  return NextResponse.json({ error: TABLE_MISSING_MESSAGE, code: TABLE_MISSING_CODE }, { status: 503 });
}

/** A missing table is a typed 503 the screen explains; anything else is logged and hidden. */
export function meetingsFail(scope: string, e: unknown, message: string): NextResponse {
  if (isMissingTableError(e)) return tableMissing();
  return apiError(scope, e, message);
}

export async function loadMeeting(db: MeetingsDb, tenantId: string, projectId: string, id: string) {
  const { data, error } = await db
    .from('meetings')
    .select(MEETING_COLS)
    .eq('id', id)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export const notFound = () => NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

/** "YYYY-MM-DD" or null. */
export function dateOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** "HH:MM" (or HH:MM:SS) or null. */
export function timeOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{2}:\d{2}(:\d{2})?$/.test(s) ? s : null;
}

export function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
