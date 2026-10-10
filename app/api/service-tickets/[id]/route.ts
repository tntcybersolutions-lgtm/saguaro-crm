/**
 * PATCH /api/service-tickets/[id]
 * Body (any of): { status, assigned_tech_id, scheduled_window_start,
 *   scheduled_window_end, waiting_reason, resolution, note, force,
 *   title, description, category, priority, sla_hours, project_id }
 *
 * - Waiting needs a reason; Completed needs a resolution (spec §7).
 * - Assigning a tech to a window that overlaps another open ticket for the
 *   same tech returns 409 with the conflicting ticket unless force: true.
 * - The call's own details (title … project_id) are editable — they were
 *   set once at creation and could never be corrected.
 * - Every change is appended to dispatch_notes as a dated line.
 * - status 'archived' is refused here; archiving is DELETE (below), and an
 *   archived call is restored with { status: 'triaged' }.
 *
 * DELETE /api/service-tickets/[id] — archive the call (soft delete). A service
 * call carries a dispatch trail and may already have been billed, so it is
 * never hard-deleted: status becomes 'archived', the trail gets a dated line,
 * and the call leaves every list (GET ?archived=1 still finds it).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { ARCHIVED_TICKET_STATUS, OPEN_TICKET_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_STATUS_LABEL, noteLine, normaliseTicketStatus, windowsOverlap, type TicketStatus } from '@/lib/service-tickets';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { user } = g;
  const db = g.db as unknown as Loose;
  try {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    const b = await req.json().catch(() => ({}));

    const { data: t, error: readErr } = await db.from('service_tickets')
      .select('id, ticket_number, status, assigned_tech_id, scheduled_window_start, scheduled_window_end, dispatch_notes, resolution, updated_at, title, description, category, priority, sla_hours, project_id')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (readErr) throw readErr;
    if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    // Stale-write guard: the screen sends the updated_at it loaded.
    if (b.expected_updated_at && t.updated_at && String(b.expected_updated_at) !== String(t.updated_at)) {
      return NextResponse.json({ error: 'Someone else changed this ticket. Reload to see the latest before saving.', ticket: t }, { status: 409 });
    }

    const now = new Date();
    const patch: Record<string, unknown> = { updated_at: now.toISOString() };
    const notes: string[] = [];

    // An archived call only comes back by restoring it (status → triaged).
    if (normaliseTicketStatus(t.status) === ARCHIVED_TICKET_STATUS && b.status !== 'triaged') {
      return NextResponse.json({ error: 'This call is archived — restore it before changing it.' }, { status: 409 });
    }

    // Details — the call's own fields, editable after creation.
    const edited: string[] = [];
    if ('title' in b) {
      const v = String(b.title ?? '').trim();
      if (!v) return NextResponse.json({ error: 'title is required' }, { status: 400 });
      if (v !== t.title) { patch.title = v; edited.push('title'); }
    }
    for (const k of ['description', 'category'] as const) {
      if (!(k in b)) continue;
      const v = String(b[k] ?? '').trim() || null;
      if (v !== (t[k] ?? null)) { patch[k] = v; edited.push(k); }
    }
    if ('priority' in b) {
      if (!(TICKET_PRIORITIES as readonly string[]).includes(String(b.priority))) return NextResponse.json({ error: 'priority must be one of ' + TICKET_PRIORITIES.join(', ') }, { status: 400 });
      if (b.priority !== (t.priority || 'normal')) { patch.priority = b.priority; edited.push(`priority ${t.priority || 'normal'} → ${b.priority}`); }
    }
    if ('sla_hours' in b) {
      const raw = b.sla_hours;
      const n = raw === null || raw === '' || raw === undefined ? null : Number(raw);
      if (n !== null && (!Number.isFinite(n) || n <= 0)) return NextResponse.json({ error: 'sla_hours must be a positive number of hours' }, { status: 400 });
      const v = n === null ? null : Math.round(n);
      if (v !== (t.sla_hours ?? null)) { patch.sla_hours = v; edited.push('SLA'); }
    }
    if ('project_id' in b) {
      let pid: string | null = null;
      if (b.project_id) {
        if (!UUID_RE.test(String(b.project_id))) return NextResponse.json({ error: 'project_id must be a job id' }, { status: 400 });
        const { data: p, error } = await db.from('projects').select('id').eq('id', b.project_id).eq('tenant_id', user.tenantId).maybeSingle();
        if (error) throw error;
        if (!p) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        pid = p.id;
      }
      if (pid !== (t.project_id ?? null)) { patch.project_id = pid; edited.push('job'); }
    }
    if (edited.length) notes.push(`Details edited: ${edited.join(', ')}`);

    // Tech
    let techId: string | null | undefined;
    if ('assigned_tech_id' in b) {
      techId = b.assigned_tech_id ? String(b.assigned_tech_id) : null;
      if (techId) {
        // FK target is public.users — validate there so the write cannot fail on it.
        const { data: p, error } = await db.from('users').select('id, full_name, email, is_active').eq('id', techId).eq('tenant_id', user.tenantId).maybeSingle();
        if (error) throw error;
        if (!p || p.is_active === false) return NextResponse.json({ error: 'assigned_tech_id is not an active member of this company' }, { status: 400 });
        notes.push(`Assigned to ${p.full_name || p.email}`);
      } else if (t.assigned_tech_id) {
        notes.push('Unassigned');
      }
      patch.assigned_tech_id = techId;
    }

    // Window
    const startIn = 'scheduled_window_start' in b ? (b.scheduled_window_start || null) : undefined;
    const endIn = 'scheduled_window_end' in b ? (b.scheduled_window_end || null) : undefined;
    for (const [k, v] of [['scheduled_window_start', startIn], ['scheduled_window_end', endIn]] as const) {
      if (v === undefined) continue;
      if (v !== null && Number.isNaN(Date.parse(String(v)))) return NextResponse.json({ error: `${k} must be a date and time` }, { status: 400 });
      patch[k] = v;
    }
    const start = (startIn !== undefined ? startIn : t.scheduled_window_start) as string | null;
    const end = (endIn !== undefined ? endIn : t.scheduled_window_end) as string | null;
    if (start && end && Date.parse(end) <= Date.parse(start)) return NextResponse.json({ error: 'scheduled_window_end must be after the start' }, { status: 400 });
    // Times are stored as UTC instants; the trail says so rather than passing
    // a UTC clock off as the reader's local time.
    if (startIn !== undefined) notes.push(start ? `Visit window set ${new Date(start).toISOString().slice(0, 16).replace('T', ' ')}${end ? '–' + new Date(end).toISOString().slice(11, 16) : ''} UTC` : 'Visit window cleared');

    // Conflict check for the tech's other open tickets
    const tech = techId !== undefined ? techId : t.assigned_tech_id;
    if (tech && start && !b.force && (techId !== undefined || startIn !== undefined || endIn !== undefined)) {
      const { data: others, error } = await db.from('service_tickets')
        .select('id, ticket_number, title, scheduled_window_start, scheduled_window_end, status')
        .eq('tenant_id', user.tenantId).eq('assigned_tech_id', tech).neq('id', id)
        .in('status', OPEN_TICKET_STATUSES).not('scheduled_window_start', 'is', null).limit(200);
      if (error) throw error;
      const clash = (others || []).find((o: { scheduled_window_start: string; scheduled_window_end: string | null }) => windowsOverlap(start, end, o.scheduled_window_start, o.scheduled_window_end));
      if (clash) return NextResponse.json({ error: `That tech already has ${clash.ticket_number || 'another call'} in an overlapping window.`, conflict: clash, needsConfirmation: true }, { status: 409 });
    }

    // Status
    if ('status' in b) {
      const raw = String(b.status || '');
      if (raw === ARCHIVED_TICKET_STATUS) return NextResponse.json({ error: 'Archive a call with DELETE, not a status change' }, { status: 400 });
      if (!(TICKET_STATUSES as readonly string[]).includes(raw)) return NextResponse.json({ error: 'status must be one of ' + TICKET_STATUSES.filter(s => s !== ARCHIVED_TICKET_STATUS).join(', ') }, { status: 400 });
      const next = raw as TicketStatus;
      const prev = normaliseTicketStatus(t.status);
      if (next === 'waiting') {
        const reason = String(b.waiting_reason || '').trim();
        if (!reason) return NextResponse.json({ error: 'waiting_reason is required to put a call on hold' }, { status: 400 });
        notes.push(`Waiting — ${reason}`);
      } else if (next !== prev) {
        notes.push(`Status: ${TICKET_STATUS_LABEL[prev]} → ${TICKET_STATUS_LABEL[next]}`);
      }
      if (next === 'completed') {
        const resolution = String(b.resolution ?? t.resolution ?? '').trim();
        if (!resolution) return NextResponse.json({ error: 'resolution is required to complete a call' }, { status: 400 });
        patch.resolution = resolution;
      }
      if (next === 'scheduled' && !start) return NextResponse.json({ error: 'Set a visit window before marking the call Scheduled' }, { status: 400 });
      patch.status = next;
      patch.closed_at = next === 'closed' ? now.toISOString() : null;
    } else if ('resolution' in b) {
      patch.resolution = String(b.resolution || '').trim() || null;
    }

    if (b.note && String(b.note).trim()) notes.push(String(b.note).trim());
    if (notes.length) {
      const line = notes.map(n => noteLine(now, `${n} (${user.email})`)).join('\n');
      patch.dispatch_notes = t.dispatch_notes ? `${t.dispatch_notes}\n${line}` : line;
    }

    const { data, error } = await db.from('service_tickets').update(patch).eq('id', id).eq('tenant_id', user.tenantId).select('*').single();
    if (error) throw error;
    return NextResponse.json({ ticket: data });
  } catch (e) {
    return apiError('service-tickets/update', e, 'Could not update the service call.');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { user } = g;
  const db = g.db as unknown as Loose;
  try {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    const { data: t, error: readErr } = await db.from('service_tickets')
      .select('id, status, dispatch_notes')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (readErr) throw readErr;
    if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    const prev = normaliseTicketStatus(t.status);
    if (prev === ARCHIVED_TICKET_STATUS) return NextResponse.json({ ok: true, alreadyArchived: true });

    const now = new Date();
    const line = noteLine(now, `Archived — was ${TICKET_STATUS_LABEL[prev]} (${user.email})`);
    const { error } = await db.from('service_tickets').update({
      status: ARCHIVED_TICKET_STATUS,
      updated_at: now.toISOString(),
      dispatch_notes: t.dispatch_notes ? `${t.dispatch_notes}\n${line}` : line,
    }).eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('service-tickets/archive', e, 'Could not archive the service call.');
  }
}
