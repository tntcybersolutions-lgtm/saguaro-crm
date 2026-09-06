import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/files/manager
 *
 * Tenant-wide document listing for the Document Manager. The per-project
 * endpoint (/api/projects/[projectId]/files) answers "what is attached to this
 * project"; this one answers "where is that file", which is the question you
 * actually have when a sub emails asking which revision they priced.
 *
 * Returns the rows plus the facets the tree and filter row are built from, so
 * the client renders the whole navigator from one round trip instead of
 * discovering folders by scanning the page it happens to be showing.
 *
 * Query params (all optional):
 *   projectId  — restrict to one project
 *   folder     — restrict to one folder (exact match; '' means unfiled)
 *   category   — restrict to one category
 *   kind       — restrict to one kind (pdf/image/video/...)
 *   q          — substring match on file name, folder, category, uploader
 *   versions   — 'current' (default) shows only is_current rows; 'all' shows history
 *   limit      — page size, default 200, max 1000
 *   offset     — page offset
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const sp = req.nextUrl.searchParams;

    const projectId = sp.get('projectId') || '';
    const folder = sp.get('folder');
    const category = sp.get('category') || '';
    const kind = sp.get('kind') || '';
    const q = (sp.get('q') || '').trim();
    const versions = sp.get('versions') === 'all' ? 'all' : 'current';
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 1000);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    /* Facets are computed over the tenant's whole live set, not the current
       page. A folder with no matches still belongs in the tree — it is where
       the user is about to look next. */
    const facetQuery = db
      .from('project_files')
      .select('project_id, folder, category, kind, file_size')
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .eq('is_current', true);

    let rowQuery = db
      .from('project_files')
      .select(
        'id, project_id, file_name, file_url, file_size, file_type, mime_type, category, folder, ' +
          'uploaded_by_name, created_at, updated_at, version_number, supersedes_file_id, is_current, ' +
          'kind, storage_bucket, storage_path, poster_url, width, height, duration_seconds, ' +
          'entity_type, entity_id, file_hash',
        { count: 'exact' },
      )
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null);

    if (versions === 'current') rowQuery = rowQuery.eq('is_current', true);
    if (projectId) rowQuery = rowQuery.eq('project_id', projectId);
    if (category) rowQuery = rowQuery.eq('category', category);
    if (kind) rowQuery = rowQuery.eq('kind', kind);
    if (folder !== null) {
      if (folder === '') rowQuery = rowQuery.is('folder', null);
      else rowQuery = rowQuery.eq('folder', folder);
    }
    if (q) {
      const esc = q.replace(/[%_,()]/g, (c) => `\\${c}`);
      rowQuery = rowQuery.or(
        `file_name.ilike.%${esc}%,folder.ilike.%${esc}%,category.ilike.%${esc}%,uploaded_by_name.ilike.%${esc}%`,
      );
    }

    const [{ data: rows, error: rowErr, count }, { data: facetRows, error: facetErr }, projectsRes] =
      await Promise.all([
        rowQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
        facetQuery,
        db.from('projects').select('id, name').eq('tenant_id', user.tenantId).order('name'),
      ]);

    if (rowErr) throw rowErr;
    if (facetErr) throw facetErr;

    const projectNames = new Map<string, string>(
      ((projectsRes.data || []) as { id: string; name: string | null }[]).map((p) => [
        p.id,
        p.name || 'Untitled project',
      ]),
    );

    type Facet = { value: string; label: string; count: number; bytes: number };
    const tally = (
      list: Record<string, any>[],
      key: string,
      label: (v: string) => string,
    ): Facet[] => {
      const m = new Map<string, { count: number; bytes: number }>();
      for (const r of list) {
        const v = r[key] == null ? '' : String(r[key]);
        const cur = m.get(v) || { count: 0, bytes: 0 };
        cur.count += 1;
        cur.bytes += Number(r.file_size) || 0;
        m.set(v, cur);
      }
      return [...m.entries()]
        .map(([value, s]) => ({ value, label: label(value), count: s.count, bytes: s.bytes }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };

    const facetList = (facetRows || []) as Record<string, any>[];

    /* The tree is project → folder, which is how a GC actually files: the
       project is the cabinet, the folder is the divider inside it. */
    const tree = tally(facetList, 'project_id', (v) => projectNames.get(v) || 'Unassigned').map((p) => ({
      ...p,
      folders: tally(
        facetList.filter((r) => String(r.project_id ?? '') === p.value),
        'folder',
        (v) => v || 'Unfiled',
      ),
    }));

    return NextResponse.json({
      data: (rows || []).map((r: Record<string, any>) => ({
        ...r,
        project_name: projectNames.get(String(r.project_id)) || null,
      })),
      total: count ?? (rows || []).length,
      limit,
      offset,
      facets: {
        tree,
        folders: tally(facetList, 'folder', (v) => v || 'Unfiled'),
        categories: tally(facetList, 'category', (v) => v || 'Uncategorised'),
        kinds: tally(facetList, 'kind', (v) => v || 'Other'),
      },
      totals: {
        files: facetList.length,
        bytes: facetList.reduce((s, r) => s + (Number(r.file_size) || 0), 0),
      },
    });
  } catch (e) {
    return apiError('files_manager', e);
  }
}
