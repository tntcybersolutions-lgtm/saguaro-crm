import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { computeSuggestions } from '@/lib/suggestions';
import { recordLearning } from '@/lib/learning';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/suggestions
 *
 * The real-time suggestion feed — ranked learning moments computed live from
 * the tenant's own tables by lib/suggestions.ts (rule engine; every dollar
 * figure comes from actual rows, never invented). Permission: Reports ≥ View,
 * same gate as the intelligence summary this feed extends.
 *
 * Response: { suggestions, degradedSources, generatedAt } — one bad table
 * degrades its rule to empty and lands in degradedSources; it never zeroes
 * the feed.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const feed = await computeSuggestions(db, user.tenantId);
    return NextResponse.json(feed);
  } catch (err) {
    return apiError('suggestions GET', err);
  }
}

/**
 * POST /api/suggestions
 *
 * Records what the user did with a suggestion, via the learning layer:
 *   { suggestionId, rule, action: 'accept' | 'dismiss', dollars }
 *
 * 'accept'  — the deep link was followed; the engine's honest dollar figure
 *             lands in dollars_surfaced (the "prove it" receipt).
 * 'dismiss' — the suggestion is suppressed on recompute for 30 days:
 *             computeSuggestions excludes ids with a dismiss event in
 *             learning_events, and ids are stable (rule + row id) across
 *             recomputes, so the exclusion sticks.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const body = await req.json().catch(() => null);
    const suggestionId =
      typeof body?.suggestionId === 'string' ? body.suggestionId.slice(0, 200) : '';
    const rule = typeof body?.rule === 'string' ? body.rule.slice(0, 80) : '';
    const action = body?.action;
    if (!suggestionId || (action !== 'accept' && action !== 'dismiss')) {
      return NextResponse.json(
        { error: 'suggestionId and action ("accept" | "dismiss") are required' },
        { status: 400 },
      );
    }
    const dollars = Number(body?.dollars);
    const honestDollars = Number.isFinite(dollars) && dollars > 0 ? dollars : 0;

    await recordLearning(db, {
      tenantId: user.tenantId,
      userId: user.id,
      kind: action === 'dismiss' ? 'suggestion_dismissed' : 'suggestion_accepted',
      dollarsSurfaced: action === 'accept' ? honestDollars : 0,
      meta: { suggestionId, rule, action, dollars: honestDollars || null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('suggestions POST', err);
  }
}
