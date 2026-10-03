/**
 * GET  /api/service-tickets           — tickets + techs + jobs for the dispatch screen
 * POST /api/service-tickets           — create a service call
 * Table: service_tickets (tenant-scoped). Rules: lib/service-tickets.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { TICKET_PRIORITIES, noteLine } from '@/lib/service-tickets';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { user } = g;
  const db = g.db as unknown as Loose;
  try {
    const [tickets, techs, projects] = await Promise.all([
      db.from('service_tickets')
        .select('id, ticket_number, project_id, title, description, category, system_type, priority, sla_hours, status, scheduled_window_start, scheduled_window_end, assigned_tech_id, dispatch_notes, resolution, closed_at, created_at, updated_at')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false })
        .limit(500),
      // service_tickets.assigned_tech_id references public.users (not profiles),
      // so only offer people who exist there and are active.
      db.from('users').select('id, full_name, email, is_active').eq('tenant_id', user.tenantId).order('full_name').limit(500),
      db.from('projects').select('id, name, address, city, status').eq('tenant_id', user.tenantId).is('deleted_at', null).order('name').limit(1000),
    ]);
    if (tickets.error) throw tickets.error;
    if (techs.error) throw techs.error;
    if (projects.error) throw projects.error;
    const activeTechs = (techs.data || []).filter((u: { is_active?: boolean | null }) => u.is_active !== false);
    return NextResponse.json({ tickets: tickets.data || [], techs: activeTechs, projects: projects.data || [] });
  } catch (e) {
    return apiError('service-tickets', e, 'Could not load service calls.');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { user } = g;
  const db = g.db as unknown as Loose;
  try {
    const b = await req.json().catch(() => ({}));
    const title = String(b.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
    const priority = TICKET_PRIORITIES.includes(b.priority) ? b.priority : 'normal';

    let projectId: string | null = null;
    if (b.project_id) {
      if (!UUID_RE.test(String(b.project_id))) return NextResponse.json({ error: 'project_id must be a job id' }, { status: 400 });
      const { data: p, error } = await db.from('projects').select('id').eq('id', b.project_id).eq('tenant_id', user.tenantId).maybeSingle();
      if (error) throw error;
      if (!p) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      projectId = p.id;
    }

    // Next ticket number for this tenant: SV-0001, SV-0002, …
    const { data: last, error: lastErr } = await db.from('service_tickets').select('ticket_number').eq('tenant_id', user.tenantId).like('ticket_number', 'SV-%').order('ticket_number', { ascending: false }).limit(1);
    if (lastErr) throw lastErr;
    const n = last?.[0]?.ticket_number ? parseInt(String(last[0].ticket_number).slice(3), 10) || 0 : 0;
    const ticketNumber = `SV-${String(n + 1).padStart(4, '0')}`;

    const sla = Number(b.sla_hours);
    const { data, error } = await db.from('service_tickets').insert({
      tenant_id: user.tenantId,
      ticket_number: ticketNumber,
      project_id: projectId,
      title,
      description: String(b.description || '').trim() || null,
      category: String(b.category || '').trim() || null,
      priority,
      // SLA only when the caller configured one — never invented.
      sla_hours: Number.isFinite(sla) && sla > 0 ? Math.round(sla) : null,
      status: 'new',
      dispatch_notes: noteLine(new Date(), `Created by ${user.email}`),
    }).select('id, ticket_number').single();
    if (error) throw error;
    return NextResponse.json({ ticket: data }, { status: 201 });
  } catch (e) {
    return apiError('service-tickets/create', e, 'Could not create the service call.');
  }
}
