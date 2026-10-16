import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { scoreBidOpportunity, buildBidHistoryContext } from '@/lib/construction-intelligence';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const db = createServerClient();

  // Support both old format {projectName, estValue, trade, location, targetMargin}
  // and new format {projectName, projectType, location, estimatedValue}
  const normalized = {
    projectName: body.projectName || 'Untitled Project',
    projectType: body.projectType || body.trade || 'commercial',
    location: body.location || 'Phoenix, AZ',
    estimatedValue: Number(body.estimatedValue ?? body.estValue ?? 0) || 0,
    trade: body.trade,
    dueDate: body.dueDate,
    ownerName: body.ownerName,
  };

  const historyContext = await buildBidHistoryContext(db, user.tenantId, normalized.projectType);
  const result = await scoreBidOpportunity(normalized, historyContext);

  // The AI scoring call failed and returned a neutral fallback. Do NOT mask this
  // with a fake number — surface a real error so the client can show it and retry.
  if (result.degraded) {
    return NextResponse.json(
      { error: 'AI scoring is temporarily unavailable. Please try again in a moment.' },
      { status: 502 },
    );
  }

  const margin = Number(body.targetMargin ?? body.ourMargin ?? body.margin ?? 0) || 0;

  // Win probability derived from the fit score (win odds trail the fit score).
  const winProbability = Math.min(95, Math.max(5, Math.round(result.score * 0.85)));

  // Suggested margin from the score (higher score → higher suggested margin).
  const suggestedMargin = margin
    ? margin + (result.score > 70 ? 1.5 : result.score < 40 ? -2 : 0)
    : Math.round((result.score / 100) * 15 + 5);

  // ── Persist the scored opportunity so it does not vanish. ──────────────────
  // A scored opportunity is a not-yet-decided bid: store it in bid_history as a
  // 'pending' outcome. This makes it show in the Bid History (Pending) view and
  // feeds buildBidHistoryContext() so future AI scores learn from it.
  let persistedId: string | null = null;
  try {
    const summaryLine =
      `AI fit score ${result.score}/100 · win ${winProbability}% · ` +
      `${result.recommendation}${result.reasoning ? ` — ${result.reasoning}` : ''}` +
      `${body.notes ? `\n\nNotes: ${body.notes}` : ''}`;
    const { data: inserted, error: insErr } = await db
      .from('bid_history')
      .insert({
        tenant_id: user.tenantId,
        project_name: normalized.projectName,
        project_type: normalized.projectType,
        bid_amount: normalized.estimatedValue,
        margin_pct: margin || null,
        outcome: 'pending',
        location: body.location || null,
        trades: normalized.trade ? [normalized.trade] : null,
        notes: summaryLine,
        bid_date: (await requestDay(req.headers, db, user.tenantId, 'bids/score')).today,
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    persistedId = (inserted as { id: string } | null)?.id ?? null;
  } catch (e) {
    // Persistence failed — report it honestly rather than pretending it saved.
    return apiError('bids/score POST', e, 'Scored the bid but failed to save it. Please try again.', 500, { score: result.score });
  }

  const roundedMargin = Math.round(suggestedMargin * 10) / 10;

  // Return both flattened (dashboard modal) and nested (bids page) shapes.
  return NextResponse.json({
    ...result,
    winProbability,
    suggestedMargin: roundedMargin,
    persistedId,
    result: {
      ...result,
      winProbability,
      suggestedMargin: roundedMargin,
    },
  });
}
