import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trade-guide/articles
 * Lists trade-guide articles from the trade_knowledge table.
 * Called by app/field/trade-guide/page.tsx.
 *
 * Query params (all optional):
 *   - search:   matches title/content/trade
 *   - trade:    exact trade filter (e.g. "Electrical")
 *   - category: exact category filter (e.g. "How-To")
 *
 * Response: { articles: Article[] }
 *   Article fields the page consumes: id, title, trade, category, difficulty,
 *   estimated_time, preview, content, tools, materials, code_references, tags,
 *   created_at.
 *
 * Articles are tenant-scoped OR global (is_global = true), so a field crew sees
 * both their company's knowledge base and the shared library.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const trade = searchParams.get('trade')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';

    const db = createServerClient();

    let query = db
      .from('trade_knowledge')
      .select(
        'id, trade, category, title, content, tags, difficulty, estimated_time, tools_required, materials_required, code_references, created_at',
      )
      .or(`tenant_id.eq.${user.tenantId},is_global.eq.true`)
      .order('created_at', { ascending: false });

    if (trade) query = query.eq('trade', trade);
    if (category) query = query.eq('category', category);
    if (search) {
      const safe = search.replace(/[%,]/g, ' ');
      query = query.or(
        `title.ilike.%${safe}%,content.ilike.%${safe}%,trade.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const articles = (data || []).map((r: any) => ({
      id: r.id,
      title: r.title || '',
      trade: r.trade || '',
      category: r.category || '',
      difficulty: r.difficulty || '',
      estimated_time: r.estimated_time || '',
      preview: typeof r.content === 'string' ? r.content.slice(0, 200) : '',
      content: r.content || '',
      tools: r.tools_required || [],
      materials: r.materials_required || [],
      code_references: r.code_references || [],
      tags: r.tags || [],
      created_at: r.created_at,
    }));

    return NextResponse.json({ articles });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no articles" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('trade-guide/articles', e, 'Could not load articles');
  }
}
