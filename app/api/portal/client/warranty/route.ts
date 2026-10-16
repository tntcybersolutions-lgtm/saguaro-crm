import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  if (!session) return null;
  // Reject EXPIRED tokens. The canonical lib/portal-auth validator does this;
  // this local copy previously skipped it, so expired portal tokens still worked.
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;
  return session;
}

/**
 * Generate next claim number in WC-001 format for the response label only.
 * portal_warranty_claims has no claim_number column, so the number is derived
 * from the existing row count rather than a stored value and is not persisted.
 */
async function getNextClaimNumber(db: any, tenantId: string): Promise<string> {
  const { count } = await db
    .from('portal_warranty_claims')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const nextNum = (count || 0) + 1;
  return `WC-${String(nextNum).padStart(3, '0')}`;
}

/** GET — list warranty claims */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const { data: claims, error } = await db
      .from('portal_warranty_claims')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ claims: claims || [] });
  } catch (e) {
    return apiError('portal/client/warranty GET', e);
  }
}

/** POST — create a new warranty claim */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, category, priority, location, photos } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const db = createServerClient();
    const claimNumber = await getNextClaimNumber(db, session.tenant_id);

    // Live portal_warranty_claims columns: title, description, location,
    // severity, photo_urls (jsonb), status, assigned_to, resolved_at,
    // resolution_notes, session_id. There is no claim_number / category /
    // submitted_by column. priority -> severity, photos -> photo_urls.
    // category and the requester identity are folded into photo_urls? No —
    // photo_urls is a photo array; instead category is preserved by prefixing
    // the description, and the submitter is stamped via session_id.
    const { data: claim, error } = await db
      .from('portal_warranty_claims')
      .insert({
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        session_id: session.id,
        title,
        description: category ? `[${category}] ${description}` : description,
        severity: priority || 'medium',
        location: location || null,
        photo_urls: photos || null,
        status: 'submitted',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ claim: { ...claim, claim_number: claimNumber } });
  } catch (e) {
    return apiError('portal/client/warranty POST', e);
  }
}

/** PATCH — update a warranty claim */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { claim_id, ...updates } = body;

    if (!claim_id) {
      return NextResponse.json({ error: 'claim_id is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Only allow clients to update certain fields. Live columns: description,
    // photo_urls (jsonb), updated_at. photos -> photo_urls; there is no
    // additional_notes column, so that field is ignored.
    const allowedFields: Record<string, any> = {};
    if (updates.description !== undefined) allowedFields.description = updates.description;
    if (updates.photos !== undefined) allowedFields.photo_urls = updates.photos;
    allowedFields.updated_at = new Date().toISOString();

    const { data: claim, error } = await db
      .from('portal_warranty_claims')
      .update(allowedFields)
      .eq('id', claim_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ claim });
  } catch (e) {
    return apiError('portal/client/warranty PATCH', e);
  }
}
