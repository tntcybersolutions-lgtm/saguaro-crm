import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Potential Change Orders (PCOs).
 *
 * There is no dedicated `potential_change_orders` table. PCOs are persisted
 * in `change_orders` with change_type='pco'. The PCO-specific fields the page
 * needs (estimated_min/max, impacted_scope, pco_number, pricing_history,
 * negotiation_notes) live in the `line_items` jsonb column under a `pco` key;
 * `scope_of_change` and `notes` mirror impacted_scope for convenience and the
 * `amount` column holds the estimate midpoint. GET re-projects rows back to
 * the PCO shape the field page consumes.
 *
 * Caller: app/field/change-orders/page.tsx
 *   loadPCOs()       → reads d.potential_change_orders || d.items || d.data
 *   handleCreatePCO()→ POST JSON or multipart; reads data.id back
 */

type Row = Record<string, unknown>;

function rowToPco(r: Row) {
  const meta = ((r.line_items as Row) || {}) as Row;
  const pco = (meta.pco as Row) || {};
  const amount = Number(r.amount) || 0;
  return {
    id: r.id,
    pco_number: (pco.pco_number as number) ?? (r.co_number as number) ?? undefined,
    title: r.title ?? '',
    description: r.description ?? '',
    reason: r.reason ?? '',
    estimated_min: (pco.estimated_min as number) ?? amount,
    estimated_max: (pco.estimated_max as number) ?? amount,
    status: r.status ?? 'identified',
    impacted_scope: (pco.impacted_scope as string) ?? (r.scope_of_change as string) ?? '',
    photos: (pco.photos as string[]) ?? [],
    pricing_history: (pco.pricing_history as unknown[]) ?? [],
    negotiation_notes: (pco.negotiation_notes as unknown[]) ?? [],
    created_at: r.created_at,
    converted_co_id: (pco.converted_co_id as string) ?? undefined,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    const g = await requirePermission(req, 'Change Orders', 'View', { projectId: (await params).projectId });
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    const { data, error } = await db
      .from('change_orders')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .eq('change_type', 'pco')
      .order('co_number', { ascending: false });
    if (error) throw error;

    const potential_change_orders = (data || []).map((r: Row) => rowToPco(r));
    return NextResponse.json({ potential_change_orders, source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/potential-change-orders] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/potential-change-orders', e, 'Failed to load potential change orders');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Change Orders', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  // Field page may send JSON or multipart/form-data (when photos are attached).
  let body: Record<string, unknown> = {};
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      const fd = await req.formData();
      fd.forEach((v, k) => {
        if (typeof v === 'string') body[k] = v;
      });
    } else {
      body = await req.json();
    }
  } catch { /* empty body */ }

  if (!body.title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const { data: last } = await db
      .from('change_orders')
      .select('co_number')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('co_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const number = (((last as Row | null)?.co_number as number) || 0) + 1;

    const min = Number(body.estimated_min) || 0;
    const max = Number(body.estimated_max) || 0;
    const midpoint = (min + max) / 2;
    const impacted = (body.impacted_scope as string) || '';

    const { data: pco, error } = await db
      .from('change_orders')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        co_number: number,
        change_type: 'pco',
        title: body.title,
        description: body.description ?? null,
        reason: body.reason ?? null,
        status: (body.status as string) || 'identified',
        amount: midpoint,
        scope_of_change: impacted || null,
        notes: impacted || null,
        submitted_by: user.id,
        line_items: {
          pco: {
            pco_number: number,
            estimated_min: min,
            estimated_max: max,
            impacted_scope: impacted,
            photos: [],
            pricing_history: [],
            negotiation_notes: [],
          },
        },
      } as unknown as Database['public']['Tables']['change_orders']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ id: (pco as Row | null)?.id, potential_change_order: rowToPco(pco as Row), success: true });
  } catch (e) {
    return apiError('projects/[projectId]/potential-change-orders POST', e);
  }
}
