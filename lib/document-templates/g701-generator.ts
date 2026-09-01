import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters } from './report-theme';

export interface G701Input {
  /* What the GC typed on the contract form. Values still derive from the
     database as before; an override simply wins. */
  overrides?: Record<string, unknown>;
  projectId: string;
  changeOrderId: string;
}

export async function generateG701(input: G701Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;

  // Fetch change order
  const { createServerClient } = await import('../supabase-server');
  const db = createServerClient();
  const { data: changeOrder } = await db
    .from('change_orders')
    .select('*')
    .eq('id', input.changeOrderId)
    .single();
  const co = changeOrder as any;

  /* Anything the GC typed on the contract form wins over the change order
     record. Blank is not an override. */
  const ov = (input.overrides ?? {}) as Record<string, any>;
  const pick = (k: string, fallback: any) => {
    const v = ov[k];
    return v === undefined || v === null || v === '' ? fallback : v;
  };
  const coNumber = String(pick('coNumber', co?.co_number ?? co?.number ?? ''));
  /* One figure, printed in two places — the cost-impact line and the
     financial summary had drifted apart once already. */
  const costImpact = Number(pick('costImpact', co?.cost_impact || co?.amount || 0)) || 0;

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead \u2014 tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, {
    title: 'AIA G701 \u2014 CHANGE ORDER',
    docTag: coNumber ? `CO #${coNumber}` : undefined,
  });

  // Project info fields
  let y = height - 65;
  drawField(page, font, bold, 'PROJECT:', (project as any)?.name || '', 10, y, 200);
  drawField(page, font, bold, 'PROJECT NO:', (project as any)?.project_number || '', 215, y, 130);
  drawField(page, font, bold, 'CO NUMBER:', coNumber, 350, y, 130);

  y -= 30;
  drawField(page, font, bold, 'DATE:', co?.date || new Date().toLocaleDateString(), 10, y, 130);
  drawField(page, font, bold, 'OWNER:', pick('counterparty', (ctx.owner as any)?.name || ''), 145, y, 165);
  drawField(page, font, bold, 'ARCHITECT:', (ctx.architect as any)?.name || '', 315, y, 165);

  y -= 30;
  drawField(page, font, bold, 'CONTRACTOR:', pick('contractorName', (project as any)?.gc_entity?.name || ''), 10, y, 200);
  drawField(page, font, bold, 'CONTRACT DATE:', (project as any)?.start_date || '', 215, y, 130);
  drawField(page, font, bold, 'CONTRACT FOR:', 'General Construction', 350, y, 165);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: rgb(0.83, 0.63, 0.09),
  });

  // Description of change
  y -= 18;
  page.drawText('DESCRIPTION OF CHANGE', {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: rgb(0, 0, 0),
  });

  y -= 14;
  /* Why the change happened, when the GC picked one. It sits above the
     description because it is the first thing an owner reads when deciding
     whether the change is theirs to pay for. */
  const reason = String(pick('reason', ''));
  if (reason) {
    page.drawText('Reason: ' + reason, {
      x: 10,
      y,
      size: 8.5,
      font: bold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 14;
  }
  const description = pick('description', co?.description || co?.title || 'See attached documentation.');
  const descWords = description.split(' ');
  let descLine = '';
  for (const word of descWords) {
    if ((descLine + ' ' + word).length > 95) {
      page.drawText(descLine.trim(), {
        x: 10,
        y,
        size: 8.5,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
      descLine = word;
    } else {
      descLine = descLine + ' ' + word;
    }
  }
  if (descLine.trim()) {
    page.drawText(descLine.trim(), {
      x: 10,
      y,
      size: 8.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

  // Cost and schedule impact
  y -= 10;
  page.drawText('COST IMPACT', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  page.drawText(`Amount: ${fmtCurrency(costImpact)}`, {
    x: 15,
    y,
    size: 9,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  y -= 18;
  page.drawText('SCHEDULE IMPACT', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  const scheduleDays = pick('scheduleImpactDays', co?.schedule_impact || co?.schedule_days || 0);
  page.drawText(
    scheduleDays === 0
      ? 'No change to contract time.'
      : `${scheduleDays} calendar day(s) ${scheduleDays > 0 ? 'added to' : 'deducted from'} the Contract Time.`,
    {
      x: 15,
      y,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    }
  );

  // Financial summary
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.83, 0.63, 0.09),
  });
  y -= 15;
  page.drawText('FINANCIAL SUMMARY', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: rgb(0, 0, 0),
  });

  const originalContract = (project as any)?.contract_amount || 0;
  const netPriorCOs = ctx.changeOrders
    .filter((c: any) => c.id !== input.changeOrderId)
    .reduce((s: number, c: any) => s + (c.cost_impact || c.amount || 0), 0);
  const contractPriorToCO = originalContract + netPriorCOs;
  const thisCOAmount = costImpact;
  /* The revised sum is computed, but a GC who has reconciled it against their
     own books can correct it and be believed. */
  const newContractSum = Number(pick('newContractSum', contractPriorToCO + thisCOAmount)) || 0;

  const finRows = [
    ['Original Contract Sum:', fmtCurrency(originalContract)],
    ['Net Change by Previously Authorized Change Orders:', fmtCurrency(netPriorCOs)],
    ['Contract Sum Prior to This Change Order:', fmtCurrency(contractPriorToCO)],
    ['This Change Order Amount:', fmtCurrency(thisCOAmount)],
    ['New Contract Sum Including This Change Order:', fmtCurrency(newContractSum)],
  ];

  finRows.forEach(([label, value], i) => {
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 18,
      color: i % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
    });
    page.drawText(label, {
      x: 15,
      y: y + 2,
      size: 9,
      font: i === 4 ? bold : font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(value, {
      x: 420,
      y: y + 2,
      size: 9,
      font: i === 4 ? bold : font,
      color: rgb(0, 0, 0),
    });
  });

  // Signature blocks
  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 15;

  const sigCols = [
    { label: 'ARCHITECT:', x: 10 },
    { label: 'CONTRACTOR:', x: 210 },
    { label: 'OWNER:', x: 410 },
  ];

  sigCols.forEach((col) => {
    page.drawText(col.label, {
      x: col.x,
      y,
      size: 8,
      font: bold,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: col.x, y: y - 20 },
      end: { x: col.x + 180, y: y - 20 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    page.drawText('Signature / Date', {
      x: col.x,
      y: y - 30,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawLine({
      start: { x: col.x, y: y - 45 },
      end: { x: col.x + 180, y: y - 45 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    page.drawText('Printed Name / Title', {
      x: col.x,
      y: y - 55,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  // Corporate footer: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, 'AIA G701 Change Order');

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(input.projectId, 'g701', pdfBytes, {
    changeOrderId: input.changeOrderId,
    coNumber,
    costImpact: thisCOAmount,
    newContractSum,
  });

  return { pdfBytes, pdfUrl };
}
