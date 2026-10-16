import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendW9Request } from '@/lib/email';
import { generateW9, saveDocument } from '@/lib/pdf-engine';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

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
  } catch (e) {
    return apiError('portals/w9/[token] GET', e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data: req_, error: readErr } = await db.from('w9_requests').select('*').eq('token', token).maybeSingle();
    if (readErr) throw readErr;
    if (!req_) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

    /* One W-9 per link. A submitted request used to accept the form again and
       overwrite the taxpayer's name, TIN and signature with whatever the next
       person holding the link typed — the GC would file a 1099 against it. */
    if ((req_ as { status?: string | null }).status === 'submitted' || (req_ as { submitted_at?: string | null }).submitted_at) {
      return NextResponse.json({ error: 'This W-9 has already been submitted. Contact your project manager if something needs to change.' }, { status: 409 });
    }

    // Persist the submitted W-9 form payload in the w9_data jsonb column.
    // The status guard is repeated on the write so two submits racing each
    // other cannot both land.
    const { data: written, error } = await db.from('w9_requests').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      w9_data: body ?? {},
    }).eq('token', token).is('submitted_at', null).select('id');

    if (error) throw error;
    if (!written || written.length === 0) {
      return NextResponse.json({ error: 'This W-9 has already been submitted. Contact your project manager if something needs to change.' }, { status: 409 });
    }

    const r = req_ as any;

    // Generate the actual W-9 PDF from the submitted data and persist it as a
    // real document (uploads to storage + creates a generated_documents row so
    // it appears in the Documents section) — not just a transient form payload.
    let pdfUrl = '';
    try {
      const d = (body || {}) as Record<string, any>;
      /* The W-9 portal (app/portals/w9/[token]) sends legalName, cityStateZip,
         tinType + tin, signatureName and signatureDate. This read none of the
         last four, so every generated W-9 had no city/state/ZIP and a blank
         signature line. Both spellings are accepted. */
      const tinType = String(d.tinType || '').toLowerCase();
      const pdfBytes = await generateW9({
        vendorName: d.name || d.vendorName || d.legalName || r.vendor_name,
        businessName: d.businessName || d.business_name || d.dba,
        taxClassification: d.taxClassification || d.classification || d.federalTaxClassification,
        ein: d.ein || d.einNumber || (tinType === 'ein' ? d.tin : undefined),
        ssn: d.ssn || d.ssnNumber || (tinType === 'ssn' ? d.tin : undefined),
        tin: d.tin,
        address: d.address || d.streetAddress,
        city: d.city || d.cityStateZip, state: d.state, zip: d.zip || d.zipCode,
        signature: d.signature || d.signatureName || d.signedName || d.signerName,
        signedDate: d.date || d.signatureDate || d.signedDate || new Date().toISOString().split('T')[0],
      });
      pdfUrl = await saveDocument(r.project_id, 'w9', pdfBytes, d, r.tenant_id);
      await must(db.from('w9_requests').update({ pdf_url: pdfUrl }).eq('token', token), 'w9_requests update');
    } catch (pdfErr) {
      console.error('[w9] pdf generation failed (form data still saved):', pdfErr);
    }

    /* Mark the W-9 on file on the directory record. This read r.sub_id, and
       w9_requests has no sub_id column — a request is raised against a
       vendor_email — so the flag never flipped: the sub returned the form and
       Subs & Vendors and the award gate went on saying "W-9 missing". Match
       the directory by that email, inside the request's own tenant. */
    const vendorEmail = String(r.vendor_email || '').trim().toLowerCase();
    if (vendorEmail && r.tenant_id) {
      /* Compared in code, exactly and case-insensitively: an ilike filter
         would treat "_" in an address as a wildcard and could mark a
         different company. */
      const { data: dir, error: dirErr } = await db.from('subcontractors')
        .select('id, email, contact_email')
        .eq('tenant_id', r.tenant_id);
      if (dirErr) throw dirErr;
      const ids = (dir || [])
        .filter((x: { email: string | null; contact_email: string | null }) =>
          [x.email, x.contact_email].some((e) => String(e || '').trim().toLowerCase() === vendorEmail))
        .map((x: { id: string }) => x.id);
      if (ids.length) {
        const { error: writeErr } = await db.from('subcontractors')
          .update({ w9_on_file: true })
          .eq('tenant_id', r.tenant_id)
          .in('id', ids);
        // This route answers success right after. A rejected write used to
        // vanish — supabase-js returns { error } rather than throwing.
        if (writeErr) { console.error('[portals/w9-on-file]', writeErr); throw writeErr; }
      }
    }

    return NextResponse.json({ success: true, pdfUrl });
  } catch (e) {
    return apiError('portals/w9/[token] POST', e);
  }
}
