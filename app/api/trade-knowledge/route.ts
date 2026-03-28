import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/trade-knowledge?trade=electrical&category=installation&keyword=conduit&tags=NEC,grounding
 * List/search trade_knowledge articles by trade, category, tags, keyword search.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const trade = searchParams.get('trade');
    const category = searchParams.get('category');
    const keyword = searchParams.get('keyword');
    const tags = searchParams.get('tags');
    const limit = parseInt(searchParams.get('limit') || '50');

    const db = createServerClient();

    let query = db
      .from('trade_knowledge')
      .select('id, title, trade, category, tags, summary, author, view_count, created_at, updated_at')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (trade) query = query.eq('trade', trade);
    if (category) query = query.eq('category', category);
    if (keyword) query = query.or(`title.ilike.%${keyword}%,summary.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim());
      query = query.overlaps('tags', tagList);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/trade-knowledge
 * Create a knowledge article.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      title, trade, category, content, summary,
      tags, code_references, tools_needed, safety_notes,
      difficulty_level, estimated_time,
    } = body;

    if (!title) return badRequest('title is required');
    if (!trade) return badRequest('trade is required');
    if (!content) return badRequest('content is required');

    const db = createServerClient();

    const { data, error } = await db
      .from('trade_knowledge')
      .insert({
        tenant_id: user.tenantId,
        title,
        trade,
        category: category || 'general',
        content,
        summary: summary || title,
        tags: tags || [],
        code_references: code_references || [],
        tools_needed: tools_needed || [],
        safety_notes: safety_notes || [],
        difficulty_level: difficulty_level || 'intermediate',
        estimated_time: estimated_time || null,
        author: user.email || user.id,
        view_count: 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
