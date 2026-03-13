import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();
    const url = new URL(req.url);
    const drawingId = url.searchParams.get('drawing_id');

    if (!drawingId) {
      return NextResponse.json({ error: 'drawing_id is required' }, { status: 400 });
    }

    // Fetch markups: show all 'all' visibility + user's own 'private' markups
    const { data, error } = await supabase
      .from('drawing_markups')
      .select('*')
      .eq('project_id', projectId)
      .eq('drawing_id', drawingId)
      .or(`visibility.eq.all,created_by.eq.${user.email}`)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Fetch comments for all returned markups
    const markupIds = (data ?? []).map((m: { id: string }) => m.id);
    let comments: Record<string, Array<{ id: string; comment: string; author: string; author_name: string; created_at: string }>> = {};

    if (markupIds.length > 0) {
      const { data: commentData } = await supabase
        .from('drawing_markup_comments')
        .select('*')
        .in('markup_id', markupIds)
        .order('created_at', { ascending: true });

      if (commentData) {
        for (const c of commentData) {
          if (!comments[c.markup_id]) comments[c.markup_id] = [];
          comments[c.markup_id].push(c);
        }
      }
    }

    const markups = (data ?? []).map((m: Record<string, unknown>) => ({
      ...m,
      comments: comments[m.id as string] || [],
    }));

    return NextResponse.json({ markups });
  } catch {
    return NextResponse.json({ markups: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createServerClient();

    if (!body.drawing_id) {
      return NextResponse.json({ error: 'drawing_id is required' }, { status: 400 });
    }

    const row = {
      project_id: projectId,
      drawing_id: body.drawing_id,
      title: body.title || 'Untitled Markup',
      markup_data: body.markup_data || {},
      markup_type: body.markup_type || 'freehand',
      color: body.color || '#EF4444',
      line_width: body.line_width || 3,
      visibility: body.visibility === 'private' ? 'private' : 'all',
      created_by: user.email,
      created_by_name: body.created_by_name || user.email,
    };

    const { data, error } = await supabase
      .from('drawing_markups')
      .insert(row)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ markup: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create markup' }, { status: 500 });
  }
}
