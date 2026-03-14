import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
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

    const db = createServerClient();

    // Get all scorecards for this sub across projects
    const { data: scorecards, error } = await db
      .from('portal_sub_scorecards')
      .select('*')
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .order('rated_at', { ascending: false });

    if (error) throw error;

    const cards = scorecards || [];

    // Calculate averages
    const scoreFields = [
      'quality_score',
      'schedule_score',
      'safety_score',
      'communication_score',
      'cleanup_score',
    ];

    const averages: Record<string, number | null> = {};
    for (const field of scoreFields) {
      const values = cards
        .map((c: any) => c[field])
        .filter((v: any) => v !== null && v !== undefined);
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
      .select('preferred_status, overall_rating')
      .eq('id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    return NextResponse.json({
      scorecards: cards,
      averages: {
        ...averages,
        overall: overallAverage,
      },
      total_reviews: cards.length,
      preferred_status: subRecord?.preferred_status || false,
      overall_rating: subRecord?.overall_rating || overallAverage,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Submit a scorecard rating (GC side, but accessible through portal for now) */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const {
      quality_score,
      schedule_score,
      safety_score,
      communication_score,
      cleanup_score,
      comments,
      rated_by,
    } = body;

    // Validate scores are 1-5
    const scores = { quality_score, schedule_score, safety_score, communication_score, cleanup_score };
    for (const [key, val] of Object.entries(scores)) {
      if (val !== undefined && val !== null) {
        const num = Number(val);
        if (num < 1 || num > 5) {
          return NextResponse.json(
            { error: `${key} must be between 1 and 5` },
            { status: 400 }
          );
        }
      }
    }

    const { data: scorecard, error } = await db
      .from('portal_sub_scorecards')
      .insert({
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        quality_score: quality_score || null,
        schedule_score: schedule_score || null,
        safety_score: safety_score || null,
        communication_score: communication_score || null,
        cleanup_score: cleanup_score || null,
        comments: comments || null,
        rated_by: rated_by || null,
        rated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update overall rating on subcontractor record
    const { data: allCards } = await db
      .from('portal_sub_scorecards')
      .select('quality_score, schedule_score, safety_score, communication_score, cleanup_score')
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id);

    if (allCards && allCards.length > 0) {
      const allVals = allCards.flatMap((c: any) =>
        [c.quality_score, c.schedule_score, c.safety_score, c.communication_score, c.cleanup_score]
          .filter((v: any) => v !== null && v !== undefined)
      );
      if (allVals.length > 0) {
        const newOverall =
          Math.round(
            (allVals.reduce((a: number, b: number) => a + b, 0) / allVals.length) * 10
          ) / 10;

        await db
          .from('subcontractors')
          .update({
            overall_rating: newOverall,
            preferred_status: newOverall >= 4.0,
          })
          .eq('id', session.sub_id)
          .eq('tenant_id', session.tenant_id);
      }
    }

    return NextResponse.json(
      { scorecard, message: 'Rating submitted successfully' },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
