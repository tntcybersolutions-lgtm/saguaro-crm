import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * /api/warranty-claims
 * Flat warranty-claims endpoint consumed by app/field/warranty-claims/page.tsx.
 *
 * The `warranty_claims` table stores: id, tenant_id, project_id, title, description,
 * location, severity, reported_by, assigned_to, trade, status, photo_urls (jsonb),
 * resolution, resolved_at, warranty_expiry, created_at, updated_at.
 *
 * The page's WarrantyClaim shape uses `priority` (mapped to `severity`) and
 * `category` (mapped to `trade`). Fields the table cannot persist
 * (due_date, assigned_email, assigned_phone, resolution_photos, timeline) are
 * returned as safe defaults / synthesized so the UI renders.
 */

interface DbClaim {
  id: string;
  description?: string | null;
  location?: string | null;
  trade?: string | null;
  severity?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  warranty_expiry?: string | null;
  assigned_to?: string | null;
  resolution?: string | null;
  resolved_at?: string | null;
  photo_urls?: unknown;
  title?: string | null;
}

/** Convert a DB row into the page's WarrantyClaim shape. */
function toClaim(row: DbClaim) {
  const photos = Array.isArray(row.photo_urls) ? (row.photo_urls as string[]) : [];
  const timeline: Array<{ timestamp: string; status: string; note?: string }> = [];
  if (row.created_at) {
    timeline.push({ timestamp: row.created_at, status: row.status || 'Open' });
  }
  if (row.resolved_at) {
    timeline.push({ timestamp: row.resolved_at, status: 'Resolved', note: row.resolution || undefined });
  }
  return {
    id: row.id,
    description: row.description || row.title || '',
    location: row.location || '',
    category: row.trade || 'Other',
    priority: row.severity || 'Medium',
    status: row.status || 'Open',
    created_at: row.created_at || new Date().toISOString(),
    warranty_expiry: row.warranty_expiry || undefined,
    assigned_to: row.assigned_to || undefined,
    assigned_email: undefined,
    assigned_phone: undefined,
    resolution_notes: row.resolution || undefined,
    photo_urls: photos,
    resolution_photos: [],
    timeline,
  };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const projectId = req.nextUrl.searchParams.get('projectId');
    const supabase = createServerClient();
    let query = supabase
      .from('warranty_claims')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ claims: (data ?? []).map(toClaim) });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no warranty claims" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('warranty-claims', e, 'Could not load warranty claims');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = body.projectId || body.project_id;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    const supabase = createServerClient();
    const insert: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: projectId,
      title: (body.description || '').slice(0, 120) || 'Warranty Claim',
      description: body.description || '',
      location: body.location || null,
      trade: body.category || null,
      severity: body.priority || 'Medium',
      status: body.status || 'Open',
      warranty_expiry: body.warranty_expiry || null,
      assigned_to: body.assigned_to || null,
      reported_by: user.email || null,
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls : [],
    };
    const { data, error } = await supabase
      .from('warranty_claims')
      .insert(insert as Database['public']['Tables']['warranty_claims']['Insert'])
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ claim: toClaim(data as DbClaim) }, { status: 201 });
  } catch (e) {
    return apiError('warranty-claims POST', e, 'Failed to create claim');
  }
}
