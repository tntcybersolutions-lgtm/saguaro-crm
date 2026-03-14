import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List compliance documents for this sub with expiration tracking */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    const { data: docs, error } = await db
      .from('portal_sub_compliance_docs')
      .select('*')
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Annotate each doc with expiration status
    const now = new Date();
    const annotated = (docs || []).map((doc: any) => {
      let expiration_status = 'valid';
      if (doc.expires_at) {
        const expDate = new Date(doc.expires_at);
        const daysUntilExpiry = Math.ceil(
          (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilExpiry < 0) {
          expiration_status = 'expired';
        } else if (daysUntilExpiry <= 30) {
          expiration_status = 'expiring_soon';
        }
        return { ...doc, expiration_status, days_until_expiry: daysUntilExpiry };
      }
      return { ...doc, expiration_status, days_until_expiry: null };
    });

    return NextResponse.json({ compliance_docs: annotated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Upload new compliance document (simulated upload, stores file_name/url) */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const {
      doc_type,
      file_name,
      file_url,
      expires_at,
      policy_number,
      carrier,
      coverage_amount,
      notes,
    } = body;

    if (!doc_type || !file_name) {
      return NextResponse.json(
        { error: 'doc_type and file_name are required' },
        { status: 400 }
      );
    }

    const { data: doc, error } = await db
      .from('portal_sub_compliance_docs')
      .insert({
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        doc_type,
        file_name,
        file_url: file_url || null,
        expires_at: expires_at || null,
        policy_number: policy_number || null,
        carrier: carrier || null,
        coverage_amount: coverage_amount || null,
        notes: notes || null,
        status: 'pending_review',
        uploaded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(
      { compliance_doc: doc, message: 'Document uploaded successfully' },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
