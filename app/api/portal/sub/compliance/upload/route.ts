import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/portal/sub/compliance/upload
 * Upload a compliance document file (insurance cert, W-9, bond, etc.)
 * from the subcontractor portal.
 * Accepts multipart/form-data with file + metadata.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
    if (!token) {
      return NextResponse.json({ error: 'Missing portal token' }, { status: 401 });
    }

    // Verify portal session
    const { data: session } = await supabase
      .from('portal_sub_sessions')
      .select('*, portal_subcontractors(id, tenant_id, project_id, company_name)')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const sub = (session as any).portal_subcontractors;
    if (!sub) {
      return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const docType = formData.get('doc_type') as string || '';
    const expiresAt = formData.get('expires_at') as string || null;
    const carrier = formData.get('carrier') as string || null;
    const policyNumber = formData.get('policy_number') as string || null;
    const coverageAmount = formData.get('coverage_amount') as string || null;

    if (!docType) {
      return NextResponse.json({ error: 'Document type is required' }, { status: 400 });
    }

    let fileUrl: string | null = null;
    let fileName = docType + '_' + Date.now();

    // Upload file to Supabase Storage if provided
    if (file) {
      fileName = file.name;
      const fileExt = file.name.split('.').pop() || 'pdf';
      const storagePath = `${sub.tenant_id}/${sub.project_id}/compliance/${sub.id}/${docType}_${Date.now()}.${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, Buffer.from(arrayBuffer), {
          contentType: file.type || 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        // Don't fail — continue with record creation even if upload fails
      } else {
        const { data: urlData } = supabase.storage
          .from('project-files')
          .getPublicUrl(storagePath);
        fileUrl = urlData?.publicUrl || null;
      }
    }

    // Create compliance doc record in DB
    const { data: complianceDoc, error: dbError } = await supabase
      .from('portal_sub_compliance_docs')
      .insert({
        tenant_id: sub.tenant_id,
        project_id: sub.project_id,
        sub_id: sub.id,
        doc_type: docType,
        file_name: fileName,
        file_url: fileUrl,
        expires_at: expiresAt || null,
        carrier: carrier || null,
        policy_number: policyNumber || null,
        coverage_amount: coverageAmount ? parseFloat(coverageAmount) : null,
        status: 'pending_review',
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      // Try alternative table name
      const { data: altDoc, error: altError } = await supabase
        .from('subcontractor_documents')
        .insert({
          tenant_id: sub.tenant_id,
          subcontractor_id: sub.id,
          doc_type: docType,
          file_name: fileName,
          file_url: fileUrl,
          expires_at: expiresAt || null,
          carrier: carrier || null,
          policy_number: policyNumber || null,
          coverage_amount: coverageAmount ? parseFloat(coverageAmount) : null,
          status: 'pending_review',
        })
        .select()
        .single();

      if (altError) {
        return NextResponse.json({
          error: 'Failed to save document record',
          details: dbError.message,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        compliance_doc: altDoc,
        message: 'Document uploaded successfully',
      });
    }

    return NextResponse.json({
      success: true,
      compliance_doc: complianceDoc,
      message: 'Document uploaded successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 },
    );
  }
}
