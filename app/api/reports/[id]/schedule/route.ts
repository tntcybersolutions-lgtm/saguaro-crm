import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { requestDay } from '@/lib/time-zone';

export const dynamic = 'force-dynamic';

/**
 * Schedule config for a saved report. The page (reports-builder) sends a
 * ScheduleConfig body: { enabled, frequency, recipients, nextRun? } via PUT.
 * Schedule lives inside report_templates.template_data.schedule (there is no
 * dedicated schedule column in the table).
 */

async function saveSchedule(req: NextRequest, id: string, tenantId: string) {
  const supabase = createServerClient();
  const schedule = await req.json().catch(() => ({}));

  const { data: existing, error: readErr } = await supabase
    .from('report_templates')
    .select('template_data')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (readErr) throw readErr;

  const prev = (existing?.template_data && typeof existing.template_data === 'object') ? existing.template_data : {};
  const merged = {
    ...prev,
    schedule: {
      enabled: schedule.enabled ?? false,
      frequency: schedule.frequency ?? 'weekly',
      recipients: Array.isArray(schedule.recipients) ? schedule.recipients : [],
      ...(schedule.nextRun ? { nextRun: schedule.nextRun } : {}),
    },
    updatedAt: (await requestDay(req.headers, supabase, tenantId, 'reports/schedule')).today,
  };

  const { data, error } = await supabase
    .from('report_templates')
    .update({ template_data: merged })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, template_data')
    .single();
  if (error) throw error;
  return { id: data.id, schedule: (data.template_data as any)?.schedule ?? merged.schedule };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await saveSchedule(req, params.id, user.tenantId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await saveSchedule(req, params.id, user.tenantId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
