import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, num } from './report-theme';

export interface POLineItem {
  itemNumber: number;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface PurchaseOrderInput {
  projectId: string;
  purchaseOrderId?: string;
  vendorName?: string;
  vendorAddress?: string;
  poNumber?: string;
  poDate?: string;
  requiredDeliveryDate?: string;
  items?: POLineItem[];
  tax?: number;
  shipping?: number;
  terms?: string;
  deliveryInstructions?: string;
  /* Collected by the contract form. A PO papered from the form describes one
     delivery with one total rather than a line-item grid, so the description
     and amount below become that single line. */
  buyerName?: string;
  shipTo?: string;
  freightTerms?: string;
  taxable?: string;
  description?: string;
  poAmount?: number | string;
}

export async function generatePurchaseOrder(input: PurchaseOrderInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  // Fetch PO from database if ID provided
  let po: any = null;
  if (input.purchaseOrderId) {
    const { createServerClient } = await import('../supabase-server');
    const db = createServerClient();
    const { data: poData } = await db
      .from('purchase_orders')
      .select('*')
      .eq('id', input.purchaseOrderId)
      .single();
    po = poData as any;
  }

  // Resolve fields from PO record or input
  const vendorName = po?.vendor_name || po?.vendor?.name || input.vendorName || '';
  const vendorAddress = po?.vendor_address || po?.vendor?.address || input.vendorAddress || '';
  const poNumber = po?.po_number || po?.number || input.poNumber || `PO-${Date.now().toString().slice(-6)}`;
  const poDate = po?.po_date || po?.date || input.poDate || new Date().toLocaleDateString();
  const deliveryDate = po?.required_delivery_date || po?.delivery_date || input.requiredDeliveryDate || '';
  const terms = po?.terms || input.terms || 'NET 30';
  const deliveryInstructions = po?.delivery_instructions || input.deliveryInstructions || '';
  const buyerName = po?.buyer_name || input.buyerName || p?.gc_entity?.name || '';
  const shipTo = po?.ship_to || input.shipTo || p?.address || '';
  const freightTerms = po?.freight_terms || input.freightTerms || '';
  const taxStatus = po?.tax_status || input.taxable || '';

  // Build line items — money is NUMERIC-as-TEXT: Number() every stored figure.
  let items: POLineItem[] = input.items || [];
  if (po?.line_items && Array.isArray(po.line_items)) {
    items = po.line_items.map((li: any, idx: number) => {
      const qty = num(li.qty ?? li.quantity);
      const unitPrice = num(li.unit_price ?? li.unitPrice);
      return {
        itemNumber: num(li.item_number) || idx + 1,
        description: li.description || '',
        qty,
        unit: li.unit || li.uom || 'EA',
        unitPrice,
        total: num(li.total) || qty * unitPrice,
      };
    });
  }

  if (!items.length && (input.description || input.poAmount)) {
    const amount = num(input.poAmount);
    items = [{
      itemNumber: 1,
      description: String(input.description || 'Materials per attached'),
      qty: 1,
      unit: 'LS',
      unitPrice: amount,
      total: amount,
    }];
  }

  const subtotal = items.reduce((s, li) => s + num(li.total), 0);
  const tax = num(po?.tax) || num(input.tax);
  const shipping = num(po?.shipping) || num(input.shipping);
  const total = subtotal + tax + shipping;

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead — tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, { title: 'PURCHASE ORDER', docTag: `PO # ${poNumber}` });

  // Vendor and Ship To
  let y = height - 65;
  drawField(page, font, bold, 'VENDOR:', vendorName, 10, y, 260);
  drawField(page, font, bold, 'SHIP TO (PROJECT):', p?.name || '', 275, y, 270);

  y -= 30;
  drawField(page, font, bold, 'VENDOR ADDRESS:', vendorAddress, 10, y, 260);
  drawField(page, font, bold, 'SHIP TO ADDRESS:', shipTo, 275, y, 270);

  y -= 30;
  drawField(page, font, bold, 'PO DATE:', poDate, 10, y, 160);
  drawField(page, font, bold, 'REQUIRED DELIVERY:', deliveryDate || 'TBD', 175, y, 160);
  drawField(page, font, bold, 'TERMS:', terms, 340, y, 130);

  if (buyerName || freightTerms || taxStatus) {
    y -= 30;
    drawField(page, font, bold, 'BUYER:', buyerName, 10, y, 160);
    drawField(page, font, bold, 'FREIGHT:', freightTerms, 175, y, 160);
    drawField(page, font, bold, 'TAX STATUS:', taxStatus, 340, y, 130);
  }

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Line items table header
  y -= 18;
  page.drawRectangle({
    x: 10,
    y: y - 4,
    width: width - 20,
    height: 16,
    color: rgb(0.15, 0.2, 0.25),
  });
  page.drawText('ITEM', { x: 15, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText('DESCRIPTION', { x: 50, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText('QTY', { x: 310, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText('UNIT', { x: 360, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText('UNIT PRICE', { x: 410, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText('TOTAL', { x: 500, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });

  // Line item rows
  const maxItems = Math.min(items.length, 18);
  for (let i = 0; i < maxItems; i++) {
    const item = items[i];
    y -= 14;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 14,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    page.drawText(item.itemNumber.toString(), {
      x: 15, y: y + 1, size: 8, font, color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(item.description.slice(0, 38), {
      x: 50, y: y + 1, size: 8, font, color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(item.qty.toString(), {
      x: 310, y: y + 1, size: 8, font, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(item.unit, {
      x: 360, y: y + 1, size: 8, font, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(fmtCurrency(item.unitPrice), {
      x: 410, y: y + 1, size: 8, font, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(fmtCurrency(item.total), {
      x: 500, y: y + 1, size: 8, font, color: rgb(0.1, 0.1, 0.1),
    });
  }

  if (items.length > 18) {
    y -= 14;
    page.drawText(
      `... and ${items.length - 18} more line items. See attached schedule.`,
      { x: 15, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) }
    );
  }

  // Totals section
  y -= 25;
  page.drawLine({
    start: { x: 380, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });

  const totalRows = [
    ['Subtotal:', fmtCurrency(subtotal)],
    ['Tax:', fmtCurrency(tax)],
    ['Shipping:', fmtCurrency(shipping)],
  ];

  totalRows.forEach(([label, value]) => {
    y -= 16;
    page.drawText(label, { x: 400, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: 500, y, size: 9, font, color: rgb(0, 0, 0) });
  });

  // Grand total highlight
  y -= 5;
  page.drawRectangle({
    x: 380,
    y: y - 5,
    width: width - 390,
    height: 22,
    color: rgb(0.05, 0.07, 0.09),
  });
  page.drawText('TOTAL:', {
    x: 400,
    y: y + 3,
    size: 10,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });
  page.drawText(fmtCurrency(total), {
    x: 490,
    y: y + 3,
    size: 11,
    font: bold,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Delivery instructions
  if (deliveryInstructions) {
    y -= 30;
    page.drawText('DELIVERY INSTRUCTIONS:', {
      x: 10,
      y,
      size: 9,
      font: bold,
      color: rgb(0, 0, 0),
    });
    y -= 12;
    page.drawText(deliveryInstructions.slice(0, 120), {
      x: 15,
      y,
      size: 8.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  // Authorization signature
  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;

  page.drawText('AUTHORIZED BY:', { x: 10, y, size: 9, font: bold, color: rgb(0, 0, 0) });
  page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 310,
    y,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: 10, y: y - 20 },
    end: { x: 260, y: y - 20 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText('Signature / Title', {
    x: 10,
    y: y - 30,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Corporate footer: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, `Purchase Order ${poNumber}`);

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'purchase_order', pdfBytes, {
    purchaseOrderId: input.purchaseOrderId || null,
    poNumber,
    vendorName,
    total,
    itemCount: items.length,
  });

  return { pdfBytes, pdfUrl };
}
