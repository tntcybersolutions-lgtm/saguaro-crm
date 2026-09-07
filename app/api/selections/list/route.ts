import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { normaliseSelection, selectionTotals, groupByCategory, selectionFlags, type SelectionRow } from '@/lib/selections';

/**
 * GET /api/selections/list?projectId=…
 *
 * The write path has always mapped the page's field names onto the real columns
 * (item → item_name, cost → selected_amount). The read path never mapped back,
 * so a selection saved correctly returned as a row the screen could not render:
 * the card title reads `.item` and the price reads `.cost`, and a `selections`
 * row has neither. Every card came back blank and unpriced, and the "Over/Under
 * Allowance" tile summed `.cost` across rows that had none — reporting the whole
 * allowance as an underrun.
 *
 * Rows are normalised here rather than in the page so the client portal and the
 * project route get the same record, and the derived money (variance, over/under,
 * lead-time risk) is computed once on the server instead of three times, three
 * different ways.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ selections: [], source: 'unauth' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('selections')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('category', { ascending: true }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as SelectionRow[];
    const now = Date.now();
    return NextResponse.json({
      selections: rows.map((r) => normaliseSelection(r, now)),
      totals: selectionTotals(rows, now),
      categories: groupByCategory(rows),
      flags: selectionFlags(rows, now),
      source: 'live',
    });
  } catch {
    return NextResponse.json({ selections: [], source: 'error' }, { status: 500 });
  }
}
