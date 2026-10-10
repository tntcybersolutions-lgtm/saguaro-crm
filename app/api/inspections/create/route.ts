import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
    /* A record with no project is invisible: every project screen filters on
       project_id, so this wrote a row the user was told had saved and could
       never see again. 400 naming the field, like the nineteen other create
       endpoints in this codebase already do. */
    if (!(body.project_id ?? body.projectId)) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

  try {
    const supabase = createServerClient();

    // Mobile sends { results: [{ result: 'pass' | 'fail', ... }], score }.
    // Derive the persisted outcome columns from results when present.
    const results = Array.isArray(body.results) ? (body.results as Array<Record<string, unknown>>) : null;
    const checklistTotal  = results ? results.length : (body.checklist_total  || 0);
    const checklistPassed = results ? results.filter((r) => r?.result === 'pass').length : (body.checklist_passed || 0);
    const deficiencyCount = results ? results.filter((r) => r?.result === 'fail').length : (body.deficiency_count || 0);

    // Accept both camelCase and snake_case from the body for every field.
    const inspectionType =
      body.inspection_type ?? body.inspectionType ?? body.type ?? body.template_name ?? 'Other';
    const inspectorName    = body.inspector_name    ?? body.inspectorName    ?? body.inspector ?? null;
    const inspectorAgency  = body.inspector_agency  ?? body.inspectorAgency  ?? body.agency ?? body.agencyName ?? null;
    const agency           = body.agency            ?? body.agencyName       ?? inspectorAgency ?? null;
    const ahjName          = body.ahj_name          ?? body.ahjName          ?? null;
    const permitNumber     = body.permit_number     ?? body.permitNumber     ?? null;
    // The web schedule form posts `date`; honor it so the inspector's chosen
    // date is persisted instead of being silently overwritten with today.
    const scheduledDate    = body.scheduled_date    ?? body.scheduledDate     ?? body.date ?? new Date().toISOString().split('T')[0];
    const notes            = body.notes             ?? null;
    const weather          = body.weather           ?? null;

    // The template wizard posts { template_name, results, score } with NO
    // top-level result, so without a fallback every wizard inspection saved as
    // "pending". Honor an explicit result (manual form) first; otherwise derive
    // one from the wizard's 0-100 score. The detail/list screens read the
    // `result` column and recognize passed | conditional_pass | failed | pending,
    // matching their own score buckets (>=80 green, >=60 amber, else red).
    const scoreRaw = body.score ?? body.checklist_score ?? body.checklistScore;
    const score = scoreRaw == null ? null : Number(scoreRaw);
    const explicitResult = body.result ?? body.outcome;
    const result =
      explicitResult ??
      (score == null || Number.isNaN(score)
        ? 'pending'
        : score >= 80
        ? 'passed'
        : score >= 60
        ? 'conditional_pass'
        : 'failed');

    // Mark inspections that carry a result/score as completed instead of always
    // "Scheduled"; pending (no result yet) stays Scheduled. Honor an explicit
    // status from the body if one was sent.
    const explicitStatus = body.status;
    const status =
      explicitStatus ??
      (result && result !== 'pending' ? 'completed' : 'Scheduled');

    const row = {
      project_id:        body.project_id ?? body.projectId,
      tenant_id:         user.tenantId,
      inspection_type:   inspectionType,
      result:            result || 'pending',
      inspector:         inspectorName,
      inspector_name:    inspectorName,
      inspector_agency:  inspectorAgency,
      agency:            agency,
      ahj_name:          ahjName,
      permit_number:     permitNumber,
      scheduled_date:    scheduledDate,
      notes:             notes,
      weather:           weather,
      checklist:         body.checklist         || '[]',
      checklist_total:   checklistTotal,
      checklist_passed:  checklistPassed,
      deficiency_count:  deficiencyCount,
      items:             body.results           || body.checklist || '[]',
      status:            status,
      // The column defaults to now(); a booked inspection has not been held yet.
      inspected_at:      body.inspected_at ?? body.inspectedAt ?? (result && result !== 'pending' ? new Date().toISOString() : null),
    };

    // QC-before-inspections gate (per SCS spec: "QC occurs before inspections").
    // Scoped by data: only projects that carry a QC-by-trade checklist (franchise
    // sites) are gated; any other project has no qc_trade rows and is unaffected.
    // Soft-block (409) that the caller can re-submit with override:true.
    const gateProjectId = row.project_id;
    const override = body.override === true || body.qc_override === true;
    if (gateProjectId && !override) {
      const { data: qcRows } = await supabase
        .from('project_todos')
        .select('title,status')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', gateProjectId as string)
        .eq('linked_module', 'qc_trade');
      if (qcRows && qcRows.length) {
        const open = qcRows
          .filter((t) => !/pass|complete|done/i.test(String((t as Record<string, unknown>).status || '')))
          .map((t) => String((t as Record<string, unknown>).title || 'trade'));
        if (open.length) {
          return NextResponse.json({
            requiresQcOverride: true,
            qcOpen: open,
            error: `QC not signed off for ${open.length} trade(s): ${open.slice(0, 6).join(', ')}${open.length > 6 ? '…' : ''}. Complete QC before scheduling the inspection, or override.`,
          }, { status: 409 });
        }
      }
    }

    const { data, error } = await supabase
      .from('inspections')
      .insert(row as Database['public']['Tables']['inspections']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, inspection: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[inspections/create] error:', msg);
    return NextResponse.json(
      { error: `[inspections/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
