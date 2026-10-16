import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Update a subcontractor's field performance rating.
 * Called from app/field/prequalification/page.tsx (StarRating -> updateRating).
 * Body: { field_rating: number }  (1-5)
 *
 * Persisted to prequalification_submissions.score (the live submissions table
 * the field page rounds-trips through). Offline-capable: the page enqueues the
 * write and updates local state optimistically, so it only needs a 2xx here.
 */
async function handle(
  req: NextRequest,
  { params }: { params: { projectId: string; id: string } }
) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let rating = 0;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const raw = body.field_rating ?? body.rating ?? body.score;
    rating = Math.max(0, Math.min(5, Number(raw) || 0));
  } catch {
    /* safe default */
  }

  try {
    const db = createServerClient();
    const { error } = await db
      .from('prequalification_submissions')
      .update({ score: rating, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true, field_rating: rating });
  } catch (e) {
    return apiError('projects/[projectId]/prequalification/[id]/rating', e);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { projectId: string; id: string } }
) {
  return handle(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: { projectId: string; id: string } }
) {
  return handle(req, ctx);
}
