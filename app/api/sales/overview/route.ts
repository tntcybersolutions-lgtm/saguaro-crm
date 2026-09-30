import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { isClosedStatus, isDoneStatus } from '@/lib/project-lifecycle';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sales/overview — everything a salesperson needs at a glance.
 *
 * The dashboard answers a builder's questions: what is on site, what is
 * outstanding, where the job stands. A salesperson opens the app with a
 * different set — what am I chasing, what is it worth, what did I win, and
 * what is late. None of that was on one screen, so the person who brings the
 * work in had to assemble it from four pages.
 *
 * PAST DUE IS THE POINT. A follow-up whose date has gone is the single most
 * expensive thing in a pipeline, because a lead nobody called does not
 * announce itself — it just goes quiet and gets counted as "open" forever.
 * It is computed here as its own number, separately from what is merely
 * upcoming, so the two can never be read as one.
 *
 * Dates are compared as calendar days, not timestamps. next_action_date is a
 * `date` column, and `new Date('2026-10-14') < new Date()` turns a follow-up
 * due TODAY into an overdue one for everybody west of Greenwich — the same
 * defect that had the bid jacket showing a deadline a day early.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const t = user.tenantId;

    const [leadsRes, projectsRes, todosRes] = await Promise.all([
      db.from('lead_pipeline')
        .select('id, company_name, contact_name, stage, estimated_value, probability, next_action, next_action_date, won_at, lost_at, created_at')
        .eq('tenant_id', t),
      db.from('projects')
        .select('id, name, status, contract_value, created_at')
        .eq('tenant_id', t),
      db.from('project_todos')
        .select('id, title, due_date, status, completed_at, project_id')
        .eq('tenant_id', t),
    ]);

    /* A failed read is not an empty pipeline. Reporting zero leads because the
       query broke is the kind of number someone makes a decision on. */
    if (leadsRes.error) throw leadsRes.error;

    const leads = leadsRes.data || [];
    const projects = projectsRes.error ? [] : (projectsRes.data || []);
    const todos = todosRes.error ? [] : (todosRes.data || []);

    const num = (v: unknown) => Number(v) || 0;
    /** Today as a calendar day at local midnight — see the header. */
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOf = (s: unknown): Date | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
      if (!m) return null;
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    };
    const inDays = (d: Date, n: number) => {
      const x = new Date(today); x.setDate(x.getDate() + n); return d <= x;
    };

    const open = leads.filter(l => !l.won_at && !l.lost_at);
    const won = leads.filter(l => !!l.won_at);
    const lost = leads.filter(l => !!l.lost_at);

    /* Pipeline twice: what it is worth if everything lands, and what it is
       worth weighted by the odds the salesperson themselves recorded. A raw
       total is the number people quote; the weighted one is the number they
       should plan on. */
    const pipelineValue = open.reduce((s, l) => s + num(l.estimated_value), 0);
    const weightedValue = open.reduce(
      (s, l) => s + num(l.estimated_value) * (num(l.probability) > 0 ? num(l.probability) / 100 : 0), 0);

    const byStage: Record<string, { count: number; value: number }> = {};
    for (const l of open) {
      const k = String(l.stage || 'unstaged');
      byStage[k] = byStage[k] || { count: 0, value: 0 };
      byStage[k].count += 1;
      byStage[k].value += num(l.estimated_value);
    }

    /* Follow-ups, from both places a salesperson records one: the lead's own
       next action and the project to-do list. Merged because "what is late"
       does not care which screen it was written on. */
    const followUps: Array<{ id: string; what: string; who: string; due: string; source: string; leadId?: string; projectId?: string }> = [];
    for (const l of open) {
      const d = dayOf(l.next_action_date);
      if (!d || !l.next_action) continue;
      followUps.push({
        id: `lead:${l.id}`, what: String(l.next_action),
        who: String(l.company_name || l.contact_name || 'Lead'),
        due: String(l.next_action_date), source: 'lead', leadId: String(l.id),
      });
    }
    for (const td of todos) {
      /* project_todos records done-ness as a status plus a timestamp; there is
         no boolean `completed` column, and selecting one would have quietly
         treated every task as outstanding. */
      const done = !!td.completed_at || ['completed', 'done', 'complete'].includes(String(td.status || '').toLowerCase());
      if (done) continue;
      const d = dayOf(td.due_date);
      if (!d) continue;
      followUps.push({
        id: `todo:${td.id}`, what: String(td.title || 'To-do'),
        who: 'Project task', due: String(td.due_date), source: 'todo',
        projectId: td.project_id ? String(td.project_id) : undefined,
      });
    }

    const overdue = followUps.filter(f => { const d = dayOf(f.due); return d ? d < today : false; });
    const dueToday = followUps.filter(f => { const d = dayOf(f.due); return d ? d.getTime() === today.getTime() : false; });
    const upcoming = followUps.filter(f => {
      const d = dayOf(f.due);
      return d ? d > today && inDays(d, 7) : false;
    });

    const activeProjects = projects.filter(p => !isClosedStatus(p.status));
    const closedProjects = projects.filter(p => isClosedStatus(p.status));

    /* Win rate over decided leads only. Counting open ones as losses makes a
       healthy pipeline look like a failing one. */
    const decided = won.length + lost.length;

    return NextResponse.json({
      contract: {
        /* What has actually been sold and is running. */
        activeValue: activeProjects.reduce((s, p) => s + num(p.contract_value), 0),
        activeCount: activeProjects.length,
        closedValue: closedProjects.reduce((s, p) => s + num(p.contract_value), 0),
        closedCount: closedProjects.length,
        /* Closed but NOT complete — cancelled and lost jobs are closed too, and
           a "delivered" figure that includes them overstates the work done. */
        completedCount: projects.filter(p => isDoneStatus(p.status)).length,
      },
      pipeline: {
        openCount: open.length,
        value: pipelineValue,
        weightedValue: Math.round(weightedValue),
        byStage,
      },
      outcomes: {
        wonCount: won.length,
        wonValue: won.reduce((s, l) => s + num(l.estimated_value), 0),
        lostCount: lost.length,
        winRate: decided ? Math.round((won.length / decided) * 100) : null,
      },
      followUps: {
        overdueCount: overdue.length,
        todayCount: dueToday.length,
        upcomingCount: upcoming.length,
        overdue: overdue.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8),
        today: dueToday.slice(0, 8),
        upcoming: upcoming.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8),
      },
      degraded: {
        /* Said out loud rather than shown as zero. */
        projects: !!projectsRes.error,
        todos: !!todosRes.error,
      },
    });
  } catch (e) {
    return apiError('sales/overview', e, 'Could not load your sales overview.');
  }
}
