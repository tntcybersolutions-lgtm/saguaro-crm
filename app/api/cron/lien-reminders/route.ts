import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { sendLienDeadlineReminder } from '@/lib/email';

import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { addDays, companyDayLookup, companyTimeZones } from '@/lib/time-zone';
import { daysOnEarth, daysUntilDay } from '@/lib/calendar-day';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

// Reminder thresholds (days-out) → the boolean column that records "sent".
// Column names verified against the live lien_deadlines table.
const THRESHOLDS = [
  { days: 30, col: 'reminder_sent_30' },
  { days: 14, col: 'reminder_sent_14' },
  { days: 7, col: 'reminder_sent_7' },
] as const;

// Statuses that mean the deadline is resolved — never remind on these.
const TERMINAL = new Set(['filed', 'completed', 'satisfied', 'waived', 'cancelled', 'closed']);

function humanType(t: string): string {
  return String(t || 'lien deadline').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function GET(req: NextRequest) {
  // Vercel cron auth (same guard as the other crons)
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createServerClient();
    const now = new Date();
    /* "Days left" counts from each company's own day (tenants.time_zone; the
       UTC day, logged, when a company has none). One read covers every
       company: from the earliest day it is anywhere on Earth to 30 days past
       the latest — then each deadline is decided against its own company's day. */
    const earth = daysOnEarth(now);

    // All tenants' deadlines that can be coming due within 30 days of their own today.
    // NOTE: lien_deadlines has no FK to projects, so we can't embed projects(...) —
    // fetch the related projects separately and join in memory.
    const { data: deadlines, error } = await db
      .from('lien_deadlines')
      .select('id, tenant_id, project_id, state, deadline_type, description, due_date, status, reminder_sent_30, reminder_sent_14, reminder_sent_7')
      .gte('due_date', earth.earliest)
      .lte('due_date', addDays(earth.latest, 30));

    if (error) {
      return apiError('cron/lien-reminders', error, undefined, 500);
    }

    const zones = await companyTimeZones(db, (deadlines || []).map((d: { tenant_id: string }) => d.tenant_id));
    const todayFor = companyDayLookup(zones, 'cron/lien-reminders', now);

    // Resolve project name + GC contact for every referenced project.
    const projectIds = Array.from(new Set((deadlines || []).map(d => d.project_id).filter(Boolean)));
    const projectMap = new Map<string, { name: string | null; gc_email: string | null; gc_name: string | null }>();
    if (projectIds.length > 0) {
      const { data: projs } = await db
        .from('projects')
        .select('id, name, gc_email, pm_email, gc_name')
        .in('id', projectIds);
      for (const pr of (projs || []) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
        // gc_email is rarely filled in; the project PM stands in for the GC.
        projectMap.set(pr.id, { name: pr.name, gc_email: (pr.gc_email || pr.pm_email || null), gc_name: pr.gc_name });
      }
    }

    let notified = 0;
    let emailed = 0;

    for (const dl of (deadlines || []) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (TERMINAL.has(String(dl.status || '').toLowerCase())) continue;

      const daysLeft = daysUntilDay(dl.due_date, todayFor(dl.tenant_id));
      if (daysLeft === null || daysLeft < 0 || daysLeft > 30) continue;

      // Active stage = the smallest threshold that is still >= daysLeft.
      // (e.g. 20d out → 30-day stage; 10d out → 14-day stage; 5d out → 7-day stage)
      const stage = THRESHOLDS
        .filter(t => t.days >= daysLeft)
        .sort((a, b) => a.days - b.days)[0];
      if (!stage) continue;                 // outside the 30-day window
      if (dl[stage.col]) continue;          // this stage already reminded

      const project = projectMap.get(dl.project_id) || { name: null, gc_email: null, gc_name: null };
      const typeLabel = humanType(dl.deadline_type);
      const projectName = project.name || 'Project';
      const link = `${APP_URL}/app/compliance/lien-deadlines`;
      const title = `Lien deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${projectName}`;
      const body = `${typeLabel}${dl.state ? ` (${dl.state})` : ''} is due ${dl.due_date}${dl.description ? ` — ${dl.description}` : ''}.`;

      // In-app notification (tenant-wide).
      await createNotification(dl.tenant_id, null, 'lien_deadline_reminder', title, body, link, dl.project_id);
      notified++;

      // Email the GC when we have an address.
      if (project.gc_email) {
        await sendLienDeadlineReminder(
          project.gc_email,
          project.gc_name || 'Team',
          projectName,
          typeLabel,
          dl.state || '',
          dl.due_date,
          daysLeft,
          link,
        );
        emailed++;
      }

      // Mark this stage sent, plus any larger-day stages that were skipped
      // (e.g. deadline created inside 14 days never fired its 30-day reminder) —
      // so the backlog doesn't drip out one email per day on later runs.
      const update: Record<string, boolean> = {};
      for (const t of THRESHOLDS) if (t.days >= stage.days) update[t.col] = true;
      await must(db.from('lien_deadlines').update(update).eq('id', dl.id), 'lien_deadlines update');
    }

    return NextResponse.json({ success: true, scanned: (deadlines || []).length, notified, emailed });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
