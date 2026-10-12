import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { fmtCurrency, saveDocument } from '../pdf-engine';
import { brandDoc, drawBrandHeader, drawKpiBand, stampFooters, DOC } from './report-theme';

/**
 * Branded invoice PDF — the real document behind every invoice row.
 * Modeled on purchase-order-generator: gold letterhead, vendor block,
 * amount/tax/total ladder, due date, terms. Stored via saveDocument()
 * ('documents' private bucket + generated_documents row) so the invoice
 * becomes a numbered artifact with a real .pdf extension, not just a DB row.
 */
export interface InvoicePdfInput {
  invoiceId: string;
  tenantId: string;
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
  invoiceNumber: string;
}> {
  const { createServerClient } = await import('../supabase-server');
  const db = createServerClient() as any;

  const { data: inv, error } = await db
    .from('invoices')
    .select('*')
    .eq('id', input.invoiceId)
    .eq('tenant_id', input.tenantId)
    .single();
  if (error || !inv) throw new Error('Invoice not found');

  let projectName = '';
  if (inv.project_id) {
    const { data: p } = await db.from('projects').select('name, address, city, state, zip').eq('id', inv.project_id).maybeSingle();
    if (p) projectName = [p.name, [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  }
  // Money is server-canonical: NUMERIC arrives as text — Number() everything,
  // and a stale 0 total defers to amount + tax.
  const amount = Number(inv.amount) || 0;
  const tax = Number(inv.tax) || 0;
  const total = Number(inv.total) > 0 ? Number(inv.total) : amount + tax;
  const invoiceNumber = inv.invoice_number || `INV-${String(inv.id).slice(0, 6).toUpperCase()}`;

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { tenantId: input.tenantId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 46;

  // Corporate letterhead — tenant logo + accent color (report-theme)
  let y = drawBrandHeader(page, kit, { title: 'INVOICE', docTag: `# ${invoiceNumber}` });

  // KPI summary band — the money story at a glance (gold per house style)
  y = drawKpiBand(page, kit, y - 4, [
    { label: 'Amount', value: fmtCurrency(amount), money: true },
    { label: 'Tax', value: fmtCurrency(tax), money: true },
    { label: 'Total Due', value: fmtCurrency(total), money: true },
  ], { x: M, width: width - M * 2 });
  y -= 6;
  const line = (label: string, value: string, opts?: { big?: boolean; goldBar?: boolean }) => {
    if (!value) return;
    if (opts?.goldBar) {
      page.drawRectangle({ x: M - 8, y: y - 6, width: width - 2 * (M - 8), height: 22, color: DOC.highlight });
    }
    page.drawText(label.toUpperCase(), { x: M, y, size: 7.5, font: bold, color: DOC.muted });
    page.drawText(value, {
      x: M + 150, y: y - (opts?.big ? 2 : 0),
      size: opts?.big ? 13 : 10, font: opts?.big ? bold : font, color: DOC.ink,
    });
    y -= opts?.big ? 26 : 20;
  };

  const dateStr = (v?: string | null) => {
    if (!v) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (!m) return String(v);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  line('Billed To', inv.vendor_name || '');
  if (inv.vendor_email) line('Email', inv.vendor_email);
  if (projectName) line('Project', projectName);
  if (inv.description) line('Description', String(inv.description).slice(0, 110));
  if (inv.cost_code) line('Cost Code', String(inv.cost_code));
  line('Invoice Date', dateStr(inv.created_at));
  line('Due Date', dateStr(inv.due_date));
  y -= 8;

  // Totals ladder
  page.drawLine({ start: { x: M, y: y + 8 }, end: { x: width - M, y: y + 8 }, thickness: 0.75, color: DOC.rule });
  line('Amount', fmtCurrency(amount));
  if (tax > 0) line('Tax', fmtCurrency(tax));
  line('Total Due', fmtCurrency(total), { big: true, goldBar: true });

  y -= 10;
  line('Terms', inv.notes ? String(inv.notes).slice(0, 160) : 'Payment due by the date above.');

  // Corporate footer: Page X of Y • company • generated date
  stampFooters(pdf, kit, `Invoice ${invoiceNumber}`);

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(
    inv.project_id || input.tenantId,
    'invoice',
    pdfBytes,
    { invoiceId: inv.id, invoiceNumber, total, vendor: inv.vendor_name },
    input.tenantId,
    /* The number is how anyone refers to an invoice out loud; the vendor is how
       they find it when they only remember who sent it. */
    {
      title: [`Invoice ${invoiceNumber}`, inv.vendor_name].filter(Boolean).join(' — '),
      sourceType: 'invoice',
      sourceId: inv.id,
    },
  );
  return { pdfBytes, pdfUrl, invoiceNumber };
}
