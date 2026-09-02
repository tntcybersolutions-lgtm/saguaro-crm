import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendW9Request } from '@/lib/email';
import { generateW9, saveDocument } from '@/lib/pdf-engine';
import { must } from '@/lib/db-write';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db.from('w9_requests').select('*, projects(name)').eq('token', token).single();
    if (error || !data) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    const w = data as any;
    return NextResponse.json({
      request: {
        vendorName: w.vendor_name,
        projectName: w.projects?.name || 'Project',
        status: w.status,
      }
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data: req_ } = await db.from('w9_requests').select('*').eq('token', token).single();
    if (!req_) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

    // Persist the submitted W-9 form payload in the w9_data jsonb column.
    const { error } = await db.from('w9_requests').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      w9_data: body ?? {},
    }).eq('token', token);

    if (error) throw error;

    const r = req_ as any;

    // Generate the actual W-9 PDF from the submitted data and persist it as a
    // real document (uploads to storage + creates a generated_documents row so
    // it appears in the Documents section) — not just a transient form payload.
    let pdfUrl = '';
    try {
      const d = (body || {}) as Record<string, any>;
      const pdfBytes = await generateW9({
        vendorName: d.name || d.vendorName || d.legalName || r.vendor_name,
        businessName: d.businessName || d.business_name || d.dba,
        taxClassification: d.taxClassification || d.classification || d.federalTaxClassification,
        ein: d.ein || d.einNumber,
        ssn: d.ssn || d.ssnNumber,
        tin: d.tin,
        address: d.address || d.streetAddress,
        city: d.city, state: d.state, zip: d.zip || d.zipCode,
        signature: d.signature || d.signedName || d.signerName,
        signedDate: d.date || d.signedDate || new Date().toISOString().split('T')[0],
      });
      pdfUrl = await saveDocument(r.project_id, 'w9', pdfBytes, d, r.tenant_id);
      await must(db.from('w9_requests').update({ pdf_url: pdfUrl }).eq('token', token), 'w9_requests update');
    } catch (pdfErr) {
      console.error('[w9] pdf generation failed (form data still saved):', pdfErr);
    }

    // Update sub w9 status. subcontractors has no w9_status column; the live
    // column is the boolean w9_on_file.
    if (r.sub_id) {
      const { error: writeErr } = await db.from('subcontractors').update({ w9_on_file: true }).eq('id', r.sub_id);
      // This route answers success right after. A rejected write used to
      // vanish — supabase-js returns { error } rather than throwing.
      if (writeErr) { console.error('[portals/w9-on-file]', writeErr); throw writeErr; }
    }

    return NextResponse.json({ success: true, pdfUrl });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
