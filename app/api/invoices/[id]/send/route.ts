import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { sendInvoiceEmail } from '@/lib/email';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const db = g.db;

  try {
    // Load the invoice, tenant-scoped, so we can email the real vendor.
    const { data: invoice, error: loadErr } = await db
      .from('invoices')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (loadErr) throw loadErr;
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (!invoice.vendor_email) {
      return NextResponse.json(
        { error: 'This invoice has no vendor email. Add one before sending.' },
        { status: 400 },
      );
    }

    const amountDue =
      invoice.total != null
        ? Number(invoice.total)
        : invoice.amount != null
          ? Number(invoice.amount) + Number(invoice.tax ?? 0)
          : 0;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    // Actually send the email. This returns an honest result — if RESEND is not
    // configured (or the provider rejects the send) it comes back { sent:false }.
    const result = await sendInvoiceEmail({
      to: invoice.vendor_email,
      vendorName: invoice.vendor_name,
      invoiceNumber: invoice.invoice_number || 'Invoice',
      amountDue,
      dueDate: invoice.due_date,
      description: invoice.description,
      // Public tokenized page — vendors must never hit the login wall.
      viewUrl: `${appUrl}/portals/invoice/${(invoice as any).public_token || params.id}`,
    });

    if (!result.sent) {
      // Do NOT flip status to Sent when nothing was delivered — return the honest
      // reason so the client toasts a failure instead of a phantom success.
      return NextResponse.json(
        { error: result.error || 'Failed to email the invoice.' },
        { status: 502 },
      );
    }

    // Email is out the door — now it's genuinely "Sent".
    const { error: updErr } = await db
      .from('invoices')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (updErr) throw updErr;

    return NextResponse.json({ success: true, emailed: true, to: invoice.vendor_email });
  } catch (err) {
    return apiError('invoices/[id]/send POST', err, 'Failed to send invoice');
  }
}
