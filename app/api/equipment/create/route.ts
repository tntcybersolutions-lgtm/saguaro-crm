import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const row = {
    tenant_id: user.tenantId,
    project_id: body.project_id || body.projectId || null,
    equipment_name: body.equipment_name || body.equipmentName || '',
    operator: body.operator || '',
    hours: Number(body.hours || body.hours_used || body.hoursUsed) || 0,
    condition: body.condition || 'Good',
    notes: body.notes || '',
    log_date:
      body.log_date ||
      body.work_date ||
      body.workDate ||
      null,
  };

  try {
    const db = createServerClient();
    // Dated the operator's day (device, else company zone) unless the form sent one.
    if (!row.log_date) row.log_date = (await requestDay(req.headers, db, user.tenantId, 'equipment/create')).today;
    const { data, error } = await db
      .from('equipment_log')
      .insert(row as Database['public']['Tables']['equipment_log']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, entry: data });
  } catch (err: unknown) {
    return apiError('equipment/create POST', err);
  }
}
