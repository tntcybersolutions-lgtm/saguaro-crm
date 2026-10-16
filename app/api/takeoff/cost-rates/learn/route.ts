/**
 * Learn this GC's rates from their own history. Pulls every past takeoff line that
 * carries a costKey (measured line items + priced AI blueprint materials), computes
 * quantity-weighted unit costs (deterministic, lib/takeoff.learnRates), and upserts
 * them as the tenant's 'learned' rates. Manual overrides are never clobbered.
 *
 * This route is the MANUAL "Learn from my jobs" button. The identical logic now also
 * runs automatically on every takeoff completion — see lib/takeoff-learn.learnTenantRates.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { learnTenantRates } from '@/lib/takeoff-learn';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  try {
    const result = await learnTenantRates(supabase, user.tenantId);
    return Response.json(result);
  } catch (e) {
    return apiError('takeoff/cost-rates/learn POST', e, 'Could not learn from your takeoff history. Please try again.');
  }
}
