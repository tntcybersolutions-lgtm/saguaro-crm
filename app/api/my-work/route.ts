import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { addDays, requestDay } from '@/lib/time-zone';

/**
 * Work Routing Engine — the "My Work" hub feed.
 *
 * GET: ONE response for the caller across ALL their active work_assignments.
 * For every assigned project it gathers the open items that are actually THEIRS
 * (assignee matching is per-table: some tables store uuid, some email, some
 * free-form text — each query matches the shapes that table really contains),
 * plus queue-style work that comes with owning the project (submitted T&M
 * tickets awaiting approval, unresolved radio assists).
 *
 * Resilience contract: every per-table read is swallowed to a partial result —
 * one bad table must never 500 the whole hub.
 */

const CAP = 50; // per table, per project — the hub is a queue, not an archive

const TODO_DONE = ['done', 'complete', 'completed'];
const RFI_OPEN = ['open', 'submitted', 'under_review', 'pending', 'draft'];
const PUNCH_CLOSED = ['closed', 'complete', 'completed'];
const PUNCH_ITEM_OPEN = ['open', 'in_progress', 'ready_for_review'];
const ISSUE_OPEN = ['open', 'in_progress'];

type ModuleKey = 'todos' | 'rfis' | 'punch' | 'issues' | 'tm' | 'assists';

type WorkItem = {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  module: ModuleKey;
  href: string;
  meta: string | null;
};

type Counts = {
  todos: number;
  rfis: number;
  punch: number;
  issues: number;
  tmAwaiting: number;
  assists: number;
  overdue: number;
  dueToday: number;
};

/** A sales follow-up: lead_pipeline.next_action falling due. */
type FollowUp = {
  id: string;
  company: string;
  contact: string | null;
  action: string;
  due: string;
  bucket: 'overdue' | 'today' | 'upcoming';
  stage: string;
  value: number;
  mine: boolean;
};

function zeroCounts(): Counts {
  return { todos: 0, rfis: 0, punch: 0, issues: 0, tmAwaiting: 0, assists: 0, overdue: 0, dueToday: 0 };
}

/**
 * Values embedded in a PostgREST .or() expression are positional — a comma,
 * paren, or quote inside one would splice into the filter grammar. Strip them:
 * a stripped value simply fails its eq (harmless) instead of breaking the query.
 */
function orSafe(v: string): string {
  return String(v || '').replace(/[,()"\\]/g, '');
}

/** Any supabase query promise -> rows, never throws, never nulls. */
async function rows(q: any): Promise<any[]> {
  try {
    const { data, error } = await q;
    if (error) return [];
    return (data as any[]) || [];
  } catch {
    return [];
  }
}

/** date/timestamptz -> YYYY-MM-DD for lexicographic compare against today. */
function day(v: unknown): string | null {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  const uid = g.user.id;
  const email = g.user.email || '';

  try {
    const db = createServerClient() as any;
    // Overdue / due today on the person's day (device, else company zone) — not the server's UTC day.
    const { today } = await requestDay(req.headers, db, t, 'my-work');

    /* 0) SALES FOLLOW-UPS — deliberately computed BEFORE the assignments check
       below. They hang off a lead, not a project, so a salesperson who holds no
       work_assignments still owes somebody a call today; returning early on an
       empty assignment list would have shown them an empty day while their
       pipeline went cold. next_action/next_action_date have been captured on
       every lead since lead_pipeline existed and were read by nothing.
       Won and Lost are excluded: a closed deal owes no follow-up. */
    const leadRows = await rows(
      db.from('lead_pipeline')
        .select('id, company_name, contact_name, next_action, next_action_date, stage, estimated_value, assigned_to')
        .eq('tenant_id', t)
        .not('next_action_date', 'is', null)
        .not('stage', 'in', '(Won,Lost)')
        .or(`assigned_to.eq.${orSafe(uid)},assigned_to.is.null`)
        .order('next_action_date', { ascending: true })
        .limit(CAP),
    );

    /* Horizon: two weeks. The hub is a queue, not an archive — a call booked for
       March is not work you can do today, and listing it only buries what is. */
    const horizon = addDays(today, 14);

    const followUps: FollowUp[] = leadRows
      .map((r: any) => {
        const due = day(r.next_action_date);
        if (!due || due > horizon) return null;
        return {
          id: String(r.id),
          company: String(r.company_name || 'Untitled lead'),
          contact: r.contact_name ?? null,
          action: String(r.next_action || 'Follow up'),
          due,
          bucket: due < today ? 'overdue' : due === today ? 'today' : 'upcoming',
          stage: String(r.stage || ''),
          value: Number(r.estimated_value) || 0,
          mine: !!r.assigned_to,
        } as FollowUp;
      })
      .filter((f): f is FollowUp => f !== null);

    const followUpCounts = {
      overdue:  followUps.filter((f) => f.bucket === 'overdue').length,
      today:    followUps.filter((f) => f.bucket === 'today').length,
      upcoming: followUps.filter((f) => f.bucket === 'upcoming').length,
    };

    // 1) The routing table: which projects are mine right now.
    const assignments = await rows(
      db.from('work_assignments')
        .select('id, project_id, role, scope, created_at')
        .eq('tenant_id', t)
        .eq('assignee_user_id', uid)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(100),
    );

    if (assignments.length === 0) {
      // No assigned projects is NOT an empty day — the follow-ups still stand.
      return NextResponse.json({ projects: [], totals: zeroCounts(), followUps, followUpCounts });
    }

    // Dedupe by project (a person can hold two roles on one project): merge to
    // one card, preferring the first non-viewer role so tm-approval gating and
    // the role badge reflect their strongest hat.
    const byProject = new Map<string, { role: string; scope: string }>();
    for (const a of assignments) {
      if (!a.project_id) continue;
      const cur = byProject.get(a.project_id);
      if (!cur) {
        byProject.set(a.project_id, { role: a.role || 'project_manager', scope: a.scope || 'full' });
      } else if (cur.role === 'viewer' && a.role && a.role !== 'viewer') {
        byProject.set(a.project_id, { role: a.role, scope: a.scope || cur.scope });
      }
    }
    const projectIds = Array.from(byProject.keys());

    const projectRows = await rows(
      db.from('projects').select('id, name, status').eq('tenant_id', t).in('id', projectIds),
    );
    const projectById = new Map<string, any>(projectRows.map((p: any) => [p.id, p]));

    const safeId = orSafe(uid);
    const safeEmail = orSafe(email);

    // 2) Fan out per project — all tables in parallel, all failures partial.
    const cards = await Promise.all(projectIds.map(async (pid) => {
      const meta = byProject.get(pid)!;
      const base = `/app/projects/${pid}`;

      const [todos, rfis, punch, issues, tm, assists] = await Promise.all([
        // project_todos.assigned_to/_id is TEXT holding uuid OR email — match both columns against both shapes.
        rows(
          db.from('project_todos')
            .select('id, title, description, status, due_date, priority')
            .eq('tenant_id', t).eq('project_id', pid)
            .or(`assigned_to.eq.${safeId},assigned_to.eq.${safeEmail},assigned_to_id.eq.${safeId},assigned_to_id.eq.${safeEmail}`)
            .or(`status.is.null,status.not.in.(${TODO_DONE.join(',')})`)
            .limit(CAP),
        ),
        rows(
          db.from('rfis')
            .select('id, rfi_number, subject, status, due_date, priority')
            .eq('tenant_id', t).eq('project_id', pid)
            .or(`assigned_to.eq.${safeId},assigned_to.eq.${safeEmail},assigned_to_email.eq.${safeEmail}`)
            .in('status', RFI_OPEN)
            .is('deleted_at', null)
            .limit(CAP),
        ),
        // ONE punch table. punch_list_items was merged into punch_list (its four
        // rows were copied, ids preserved) — reading both now DOUBLE-COUNTS the
        // merged rows. assigned_to is legacy TEXT (web fills it with a company
        // name or an email); assigned_to_id is the person. Match either.
        rows(
          db.from('punch_list')
            .select('id, title, description, status, due_date, priority, location')
            .eq('tenant_id', t).eq('project_id', pid)
            .or(
              [
                `assigned_to_id.eq.${uid}`,
                ...[uid, email].filter(Boolean).map((v) => `assigned_to.eq.${v}`),
              ].join(','),
            )
            .not('status', 'in', `(${PUNCH_CLOSED.join(',')})`)
            .is('deleted_at', null)
            .limit(CAP),
        ),
        rows(
          db.from('field_issues')
            .select('id, title, issue_number, status, due_date, priority')
            .eq('tenant_id', t).eq('project_id', pid)
            .eq('assigned_to', uid)
            .in('status', ISSUE_OPEN)
            .limit(CAP),
        ),
        // Submitted T&M awaits the project owner's approval — a viewer never approves.
        meta.role === 'viewer'
          ? Promise.resolve([] as any[])
          : rows(
              db.from('tm_tickets')
                .select('id, ticket_number, description, status, total, work_date')
                .eq('tenant_id', t).eq('project_id', pid)
                .eq('status', 'submitted')
                .limit(CAP),
            ),
        rows(
          db.from('radio_assists')
            .select('id, note, status, requester_name, channel_id, created_at')
            .eq('tenant_id', t).eq('project_id', pid)
            .neq('status', 'resolved')
            .limit(CAP),
        ),
      ]);

      const items: Record<string, WorkItem[]> = {
        todos: todos.map((r: any) => ({
          id: r.id,
          title: r.title || r.description || 'Untitled to-do',
          status: r.status ?? null,
          due_date: r.due_date ?? null,
          module: 'todos' as const,
          href: `${base}/todos`,
          meta: r.priority ?? null,
        })),
        rfis: rfis.map((r: any) => ({
          id: r.id,
          title: r.subject || 'Untitled RFI',
          status: r.status ?? null,
          due_date: r.due_date ?? null,
          module: 'rfis' as const,
          href: `${base}/rfis`,
          meta: r.rfi_number ?? null,
        })),
        punch: punch.map((r: any) => ({
          id: r.id,
          // title is the modern column; description is what older web-written
          // rows carry. Prefer title, fall back, never render "Punch item" when
          // the row actually has text.
          title: r.title || r.description || 'Punch item',
          status: r.status ?? null,
          due_date: r.due_date ?? null,
          module: 'punch' as const,
          href: `${base}/punch-list`,
          meta: r.location ?? null,
        })),
        issues: issues.map((r: any) => ({
          id: r.id,
          title: r.title || 'Field issue',
          status: r.status ?? null,
          due_date: r.due_date ?? null,
          module: 'issues' as const,
          href: base,
          meta: r.issue_number ?? null,
        })),
        tm: tm.map((r: any) => ({
          id: r.id,
          title: r.description || 'T&M ticket',
          status: r.status ?? null,
          due_date: null, // tm carries work_date, not a deadline — never counts as overdue
          module: 'tm' as const,
          href: `${base}/tm-tickets`,
          // total is TEXT in some tenants — Number() before it ever reaches math or display
          meta: r.ticket_number ? `${r.ticket_number} · $${Number(r.total || 0).toLocaleString()}` : `$${Number(r.total || 0).toLocaleString()}`,
        })),
        assists: assists.map((r: any) => ({
          id: r.id,
          title: r.note || `${r.requester_name || 'Someone'} needs a hand`,
          status: r.status ?? null,
          due_date: null,
          module: 'assists' as const,
          href: r.channel_id ? `/app/radio?channel=${r.channel_id}` : '/app/radio',
          meta: r.requester_name ?? null,
        })),
      };

      const counts = zeroCounts();
      counts.todos = items.todos.length;
      counts.rfis = items.rfis.length;
      counts.punch = items.punch.length;
      counts.issues = items.issues.length;
      counts.tmAwaiting = items.tm.length;
      counts.assists = items.assists.length;
      for (const list of [items.todos, items.rfis, items.punch, items.issues]) {
        for (const it of list) {
          const d = day(it.due_date);
          if (!d) continue;
          if (d < today) counts.overdue += 1;
          else if (d === today) counts.dueToday += 1;
        }
      }

      const project = projectById.get(pid) || { id: pid, name: 'Project', status: null };
      return {
        project: { id: project.id, name: project.name, status: project.status ?? null },
        role: meta.role,
        scope: meta.scope,
        counts,
        items,
      };
    }));

    // Hottest projects first: overdue work outranks sheer volume.
    cards.sort((a, b) => {
      if (b.counts.overdue !== a.counts.overdue) return b.counts.overdue - a.counts.overdue;
      const load = (c: Counts) => c.todos + c.rfis + c.punch + c.issues + c.tmAwaiting + c.assists;
      return load(b.counts) - load(a.counts);
    });

    const totals = zeroCounts();
    for (const c of cards) {
      (Object.keys(totals) as (keyof Counts)[]).forEach((k) => { totals[k] += c.counts[k]; });
    }

    return NextResponse.json({ projects: cards, totals, followUps, followUpCounts });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
