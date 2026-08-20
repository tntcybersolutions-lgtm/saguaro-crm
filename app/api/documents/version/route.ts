import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Document version history.
 *
 * GET  /api/documents/version?sourceType=X&sourceId=Y           → list versions
 * GET  /api/documents/version?sourceType=X&sourceId=Y&version=N → single version (HTML)
 * POST /api/documents/version                                   → create new version
 */

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const sourceType = url.searchParams.get('sourceType');
  const sourceId = url.searchParams.get('sourceId');
  const versionStr = url.searchParams.get('version');

  if (!sourceType || !sourceId) {
    return NextResponse.json(
      { error: 'sourceType and sourceId query params are required' },
      { status: 400 },
    );
  }

  try {
    const db = createServerClient();

    if (versionStr) {
      const versionNumber = Number(versionStr);
      if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
        return NextResponse.json({ error: 'version must be a positive integer' }, { status: 400 });
      }
      const { data, error } = await db
        .from('document_versions')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .eq('source_type', sourceType)
        .eq('source_id', sourceId)
        .eq('version_number', versionNumber)
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ version: data });
    }

    const { data, error } = await db
      .from('document_versions')
      .select('id, version_number, doc_type, approved, approved_by, approved_at, notes, created_at')
      .eq('tenant_id', user.tenantId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .order('version_number', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ versions: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const sourceType: string = body.sourceType;
    const sourceId: string = body.sourceId;
    const projectId: string | null = body.projectId ?? null;
    const docType: string = body.docType;
    const htmlContent: string = body.htmlContent;
    const approved: boolean = body.approved === true;
    const notes: string | null = body.notes ?? null;

    if (!sourceType) return NextResponse.json({ error: 'sourceType is required' }, { status: 400 });
    if (!sourceId)   return NextResponse.json({ error: 'sourceId is required'   }, { status: 400 });
    if (!docType)    return NextResponse.json({ error: 'docType is required'    }, { status: 400 });
    if (!htmlContent || typeof htmlContent !== 'string') {
      return NextResponse.json({ error: 'htmlContent is required (string)' }, { status: 400 });
    }

    const db = createServerClient();

    // Determine next version number
    const { data: latest, error: latestErr } = await db
      .from('document_versions')
      .select('version_number')
      .eq('tenant_id', user.tenantId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw latestErr;

    const nextVersion = (latest?.version_number || 0) + 1;

    const insertRow = {
      tenant_id: user.tenantId,
      project_id: projectId,
      source_type: sourceType,
      source_id: sourceId,
      version_number: nextVersion,
      doc_type: docType,
      html_content: htmlContent,
      approved,
      approved_by: approved ? user.id : null,
      approved_at: approved ? new Date().toISOString() : null,
      notes,
      created_by: user.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await db
      .from('document_versions')
      .insert(insertRow)
      .select('id, version_number, approved, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ version: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
