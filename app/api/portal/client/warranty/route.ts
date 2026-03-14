import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

  return session;
}

/** Generate next claim number in WC-001 format */
async function getNextClaimNumber(db: any, tenantId: string): Promise<string> {
  const { data: latest } = await db
    .from('portal_warranty_claims')
    .select('claim_number')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!latest || !latest.claim_number) {
    return 'WC-001';
  }

  const match = latest.claim_number.match(/WC-(\d+)/);
  const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load warranty claims' }, { status: 500 });
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

    const { data: claim, error } = await db
      .from('portal_warranty_claims')
      .insert({
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        claim_number: claimNumber,
        title,
        description,
        category: category || 'general',
        priority: priority || 'medium',
        location: location || null,
        photos: photos || null,
        status: 'submitted',
        submitted_by: session.client_name || session.client_email,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ claim });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create warranty claim' }, { status: 500 });
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

    // Only allow clients to update certain fields
    const allowedFields: Record<string, any> = {};
    if (updates.description !== undefined) allowedFields.description = updates.description;
    if (updates.photos !== undefined) allowedFields.photos = updates.photos;
    if (updates.additional_notes !== undefined) allowedFields.additional_notes = updates.additional_notes;
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update warranty claim' }, { status: 500 });
  }
}
