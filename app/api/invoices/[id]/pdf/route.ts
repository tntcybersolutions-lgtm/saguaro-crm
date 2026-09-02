import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { generateInvoicePdf } from '@/lib/document-templates/invoice-generator';
import { must } from '@/lib/db-write';

/**
 * POST — generate (or regenerate) the branded invoice PDF via the pdf engine,
 * store the link on the invoice row, and return a fresh signed URL. The
 * stored pdf_url is short-lived-signed; regenerating is cheap and always
 * returns a working link.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  try {
    const { pdfUrl, invoiceNumber } = await generateInvoicePdf({ invoiceId: id, tenantId: g.user.tenantId });
    const db = createServerClient() as any;
    await must(db.from('invoices')
      .update({ pdf_url: pdfUrl, updated_at: new Date().toISOString() } as never)
      .eq('id', id).eq('tenant_id', g.user.tenantId), 'invoices write');
    return NextResponse.json({ pdfUrl, invoiceNumber });
  } catch (err) {
    console.error('[invoices/pdf]', err);
    return NextResponse.json({ error: 'Could not generate the invoice PDF.' }, { status: 500 });
  }
}
