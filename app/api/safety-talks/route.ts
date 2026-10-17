import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { requirePermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * /api/safety-talks — backs the Field "Toolbox Talks" page
 * (app/field/safety-talks/page.tsx). Unlike the generic /api/safety/talks
 * route, this one round-trips the AI-generated structure (title, talking
 * points, discussion questions, OSHA reference) and the per-attendee
 * signature record that the page renders.
 *
 * Storage mapping onto the `toolbox_talks` table:
 *   topic                <- title
 *   ai_generated_content <- JSON { talking_points, discussion_questions, osha_reference }
 *   signatures (jsonb)   <- [{ name, signature }]
 *   attendee_count       <- attendees.length
 */

type AttendeeRecord = { name: string; signature: string | null };

interface TalkPayload {
  talking_points?: string[];
  discussion_questions?: string[];
  osha_reference?: string;
}

function parseTalkContent(raw: unknown): TalkPayload {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as TalkPayload;
  } catch {
    /* legacy / plain-text content — no structured fields */
  }
  return {};
}

function normalizeAttendees(value: unknown): AttendeeRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((a) => {
      if (a && typeof a === 'object') {
        const rec = a as Record<string, unknown>;
        return {
          name: typeof rec.name === 'string' ? rec.name : String(rec.name ?? ''),
          signature: typeof rec.signature === 'string' ? rec.signature : null,
        };
      }
      return { name: String(a ?? ''), signature: null };
    })
    .filter((a) => a.name.trim().length > 0);
}

// GET /api/safety-talks?tenantId=&projectId=  -> { talks: [...] }
export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Safety: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Safety', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  try {
    const db = createServerClient();
    let q = db
      .from('toolbox_talks')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('talk_date', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw error;

    const talks = (data || []).map((t: Record<string, any>) => {
      const content = parseTalkContent(t.ai_generated_content);
      const attendees = normalizeAttendees(t.signatures);
      return {
        id: t.id,
        title: t.topic || 'Safety Talk',
        date: t.talk_date || t.created_at || new Date().toISOString(),
        attendee_count: t.attendee_count ?? attendees.length ?? 0,
        osha_reference: content.osha_reference ?? '',
        talking_points: Array.isArray(content.talking_points) ? content.talking_points : [],
        discussion_questions: Array.isArray(content.discussion_questions) ? content.discussion_questions : [],
        attendees,
      };
    });
    return NextResponse.json({ talks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety-talks', e);
  }
}

// POST /api/safety-talks  -> save an AI toolbox talk with attendance + signatures
export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'Safety', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({} as Record<string, any>));
    const db = createServerClient();

    const attendees = normalizeAttendees(body.attendees);
    const talkContent: TalkPayload = {
      talking_points: Array.isArray(body.talking_points) ? body.talking_points : [],
      discussion_questions: Array.isArray(body.discussion_questions) ? body.discussion_questions : [],
      osha_reference: body.osha_reference || '',
    };

    const row: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: body.projectId || body.project_id || null,
      topic: body.title || 'Safety Talk',
      talk_date: (await requestDay(req.headers, db, user.tenantId, 'safety-talks')).today,
      attendee_count: attendees.length,
      ai_generated_content: JSON.stringify(talkContent),
      signatures: attendees,
      created_by: user.id,
    };

    const { data, error } = await db.from('toolbox_talks').insert(row as Database['public']['Tables']['toolbox_talks']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, talk: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety-talks', e);
  }
}
