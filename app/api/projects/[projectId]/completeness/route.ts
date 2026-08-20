import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface WeightedField { key: string; weight: number; label: string; }

const FIELDS: WeightedField[] = [
  { key: 'name',                    weight: 10, label: 'Project Name' },
  { key: 'address',                 weight: 8,  label: 'Address' },
  { key: 'city',                    weight: 4,  label: 'City' },
  { key: 'state',                   weight: 4,  label: 'State' },
  { key: 'building_type',           weight: 8,  label: 'Building Type' },
  { key: 'project_type',            weight: 5,  label: 'Project Type' },
  { key: 'contract_value',          weight: 10, label: 'Contract Value' },
  { key: 'owner_name',              weight: 8,  label: 'Owner Name' },
  { key: 'architect_name',          weight: 5,  label: 'Architect Name' },
  { key: 'start_date',              weight: 8,  label: 'Start Date' },
  { key: 'end_date',                weight: 8,  label: 'End Date' },
  { key: 'pm_name',                 weight: 5,  label: 'PM Name' },
  { key: 'super_name',              weight: 5,  label: 'Superintendent Name' },
  { key: 'retainage_pct',           weight: 6,  label: 'Retainage %' },
  { key: 'project_number',          weight: 6,  label: 'Project Number' },
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const row = data as Record<string, unknown>;
    let score = 0;
    const missing: WeightedField[] = [];
    for (const f of FIELDS) {
      const v = row[f.key];
      const filled =
        typeof v === 'string' ? v.trim().length > 0
        : typeof v === 'number' ? v > 0
        : v != null && v !== '';
      if (filled) score += f.weight;
      else missing.push(f);
    }

    // Best-effort cache update
    try {
      await db
        .from('projects')
        .update({
          completeness_score: score,
          setup_complete: score >= 80,
        })
        .eq('id', projectId)
        .eq('tenant_id', user.tenantId);
    } catch { /* non-blocking */ }

    const status: 'red' | 'gold' | 'ok' = score < 50 ? 'red' : score < 80 ? 'gold' : 'ok';

    return NextResponse.json({
      score,
      status,
      missing,
      total: 100,
      setupStep: (row.setup_step as number | null) ?? 1,
      setupComplete: score >= 80,
      setupDismissed: !!row.setup_dismissed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
