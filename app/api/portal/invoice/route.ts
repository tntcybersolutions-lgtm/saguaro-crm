import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Public tokenized invoice view — GET ?token=<public_token>.
 * Returns the sanitized invoice a vendor may see (no tenant internals) plus a
 * freshly signed PDF link when a generated document exists. Read-only; the
 * token is an unguessable uuid minted per invoice (DB default).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  }
  try {
    const db = createServerClient() as any;
    const { data: inv } = await db
      .from('invoices')
      .select('id, tenant_id, project_id, invoice_number, vendor_name, vendor_email, description, amount, tax, total, due_date, status, notes, created_at')
      .eq('public_token', token)
      .maybeSingle();
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    let projectName: string | null = null;
    if (inv.project_id) {
      const { data: p } = await db.from('projects').select('name').eq('id', inv.project_id).maybeSingle();
      projectName = p?.name ?? null;
    }
    const { data: tenant } = await db.from('tenants').select('name').eq('id', inv.tenant_id).maybeSingle();

    // Fresh signed PDF link from the latest generated document for this
    // invoice (the stored invoices.pdf_url signature may have expired).
    let pdfUrl: string | null = null;
    try {
      const { data: docs } = await db
        .from('generated_documents')
        .select('pdf_url, created_at')
        .eq('tenant_id', inv.tenant_id)
        .eq('doc_type', 'invoice')
        .eq('data_snapshot->>invoiceId', inv.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const stored = (docs || [])[0]?.pdf_url as string | undefined;
      const marker = '/documents/';
      if (stored && stored.includes(marker)) {
        const path = stored.slice(stored.indexOf(marker) + marker.length).split('?')[0];
        const { data: signed } = await db.storage.from('documents').createSignedUrl(path, 3600);
        pdfUrl = signed?.signedUrl ?? null;
      }
    } catch { /* view still renders without the PDF link */ }

    const amount = Number(inv.amount) || 0;
    const tax = Number(inv.tax) || 0;
    const total = Number(inv.total) > 0 ? Number(inv.total) : amount + tax;

    return NextResponse.json({
      invoice: {
        invoiceNumber: inv.invoice_number || `INV-${String(inv.id).slice(0, 6).toUpperCase()}`,
        vendorName: inv.vendor_name,
        description: inv.description,
        amount, tax, total,
        dueDate: inv.due_date,
        status: String(inv.status || 'draft').toLowerCase(),
        notes: inv.notes,
        issuedAt: inv.created_at,
      },
      from: tenant?.name || 'Saguaro Control Systems — Construction Management & Project Controls',
      projectName,
      pdfUrl,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
