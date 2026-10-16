import { NextRequest, NextResponse } from 'next/server';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { SOURCE_LABEL } from '@/lib/my-work';
import { collectMyWork } from '@/lib/my-work-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/my-work — the signed-in person's to-do list.
 *
 * Every open thing with their name on it (or, for an owner or admin, the
 * company's), as verb-first items: bid links switched off, bidders who haven't
 * answered, RFIs, submittals, punch, to-dos, field issues, inspections,
 * schedule tasks, today's daily log, expiring COIs, pay apps waiting on
 * approval or payment, T&M to approve, radio assists and sales follow-ups.
 * lib/my-work-server reads the tables; lib/my-work turns rows into items and
 * buckets them (the same functions the tab badge counts with).
 *
 * "Today" is the person's day — the device's zone (x-time-zone), else the
 * company's — never the server's.
 *
 * { today, zone, companyWide, assigned, items, snoozes, snoozeReady,
 *   failures: [{ source, label }] }  — a source that could not be read is
 * named, and everything else still comes back.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const { today, zone } = await requestDay(req.headers, db, user.tenantId, 'my-work');
    /* An owner / admin sees the company's work; ?view=mine narrows it to
       their own jobs (My Day's Mine / Company switch). */
    const canSeeCompany = hasPermission(g.perms, 'Admin', 'Full');
    const companyWide = canSeeCompany && req.nextUrl.searchParams.get('view') !== 'mine';
    const c = await collectMyWork({ db, tenantId: user.tenantId, userId: user.id, email: user.email || '', today, zone, companyWide });
    return NextResponse.json(
      {
        today, zone, companyWide, canSeeCompany, assigned: c.assigned, jobs: c.jobs, agenda: c.agenda, roles: c.roles,
        items: c.items, snoozes: c.snoozes, snoozeReady: c.snoozeReady,
        failures: c.failures.map((source) => ({ source, label: SOURCE_LABEL[source] })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return apiError('my-work', e, "Couldn't load your work. Please try again.");
  }
}
