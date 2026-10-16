import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { rosterSubId } from '@/lib/sub-portal-scope';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token).gt('expires_at', new Date().toISOString())
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — Get sub's performance scores, averages, per-project history, preferred status */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    // Scores belong to a roster sub; an email-only invite has none yet (lib/sub-portal-scope).
    const subId = rosterSubId(session);
    if (!subId) {
      return NextResponse.json({ scorecards: [], averages: { overall: null }, total_reviews: 0, preferred_status: false, overall_rating: null });
    }

    const db = createServerClient();

    // Get all scorecards for this sub across projects
    const { data: scorecards, error } = await db
      .from('portal_sub_scorecards')
      .select('*')
      .eq('sub_id', subId)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const cards = scorecards || [];

    // Calculate averages. These are the score columns portal_sub_scorecards
    // has — there is no cleanup_score, so it is not averaged (or shown).
    const scoreFields = [
      'quality_score',
      'schedule_score',
      'safety_score',
      'communication_score',
    ];

    const averages: Record<string, number | null> = {};
    for (const field of scoreFields) {
      const values = cards
        .map((c: any) => c[field])
        .filter((v: any) => v !== null && v !== undefined)
        .map(Number);
      averages[field] =
        values.length > 0
          ? Math.round((values.reduce((a: number, b: number) => a + b, 0) / values.length) * 10) / 10
          : null;
    }

    // Overall average
    const allScoreValues = scoreFields.flatMap((field) =>
      cards
        .map((c: any) => c[field])
        .filter((v: any) => v !== null && v !== undefined)
        .map(Number)
    );
    const overallAverage =
      allScoreValues.length > 0
        ? Math.round(
            (allScoreValues.reduce((a: number, b: number) => a + b, 0) /
              allScoreValues.length) *
              10
          ) / 10
        : null;

    // Check preferred status
    const { data: subRecord } = await db
      .from('subcontractors')
      .select('rating')
      .eq('id', subId)
      .eq('tenant_id', session.tenant_id)
      .single();

    return NextResponse.json({
      scorecards: cards,
      averages: {
        ...averages,
        overall: overallAverage,
      },
      total_reviews: cards.length,
      preferred_status: (subRecord?.rating ?? overallAverage ?? 0) >= 4.0,
      overall_rating: subRecord?.rating || overallAverage,
    });
  } catch (err) {
    return apiError('portal/sub/scorecard', err, "Couldn't load your scorecard.");
  }
}

/**
 * POST — refused. A sub cannot rate itself.
 *
 * This used to take scores from anyone holding the portal link, insert them as
 * a scorecard and then overwrite subcontractors.rating with the average — so a
 * sub could give itself five stars and show as "Preferred". A rating is the
 * GC's call: it is set on the GC side (PUT / PATCH /api/subs/[id] with
 * `rating`, behind a Saguaro login and pinned to the GC's tenant). The portal
 * only reads it back (GET above).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Ratings come from your general contractor. A subcontractor can’t rate their own work from the portal.' },
      { status: 403 }
    );
  } catch (err) {
    return apiError('portal/sub/scorecard', err, "Couldn't check your portal link. Please try again.");
  }
}
