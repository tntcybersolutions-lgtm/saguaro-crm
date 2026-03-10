import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { saveDocument, fmtCurrency } from '../pdf-engine';

export interface WH347Worker {
  name: string;
  address: string;
  workClassification: string;
  daysWorked: Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', number>>;
  regularHours: number;
  overtimeHours: number;
  regularRate: number;
  overtimeRate: number;
  grossWages: number;
  ficaEmployee: number;
  fedWithholding: number;
  stateWithholding: number;
  otherDeductions: number;
  netWages: number;
  prevailingWageRate?: number; // if set, flag workers below this in orange
}

export interface WH347Input {
  projectId: string;
  projectName: string;
  projectNumber: string;
  contractorName: string;
  contractorAddress: string;
  payrollNumber: number;
  weekEnding: string;
  workers: WH347Worker[];
  federalProjectNumber?: string;
  contractingAgency?: string;
}

export async function generateWH347(input: WH347Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const WORKERS_PER_PAGE = 6;
  let remainingWorkers = [...input.workers];
  let pageNum = 1;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  while (remainingWorkers.length > 0 || pageNum === 1) {
    const page = pdf.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();

    // Gold header bar
    page.drawRectangle({
      x: 0,
      y: height - 40,
      width,
      height: 40,
      color: rgb(0.831, 0.627, 0.09),
    });
    page.drawText('U.S. DEPT. OF LABOR \u2014 WH-347 CERTIFIED PAYROLL REPORT', {
      x: 10,
      y: height - 26,
      size: 11,
      font: bold,
      color: rgb(0.05, 0.07, 0.09),
    });
    page.drawText(
      `Page ${pageNum}  \u2022  SAGUARO CONSTRUCTION INTELLIGENCE PLATFORM`,
      { x: 10, y: height - 36, size: 7, font, color: rgb(0.2, 0.1, 0) }
    );

    let y = height - 60;

    // Header info
    page.drawText(`CONTRACTOR: ${input.contractorName}`, {
      x: 10,
      y,
      size: 9,
      font: bold,
      color: rgb(0, 0, 0),
    });
    page.drawText(`ADDRESS: ${input.contractorAddress}`, {
      x: 10,
      y: y - 12,
      size: 8,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(`PAYROLL NO: ${input.payrollNumber}`, {
      x: 360,
      y,
      size: 9,
      font: bold,
      color: rgb(0, 0, 0),
    });
    page.drawText(`WEEK ENDING: ${input.weekEnding}`, {
      x: 360,
      y: y - 12,
      size: 9,
      font: bold,
      color: rgb(0, 0, 0),
    });

    y -= 30;
    page.drawText(`PROJECT NAME: ${input.projectName}`, {
      x: 10,
      y,
      size: 9,
      font: bold,
      color: rgb(0, 0, 0),
    });
    page.drawText(`PROJECT NO: ${input.projectNumber}`, {
      x: 360,
      y,
      size: 9,
      font,
      color: rgb(0, 0, 0),
    });

    if (input.federalProjectNumber || input.contractingAgency) {
      y -= 12;
      if (input.federalProjectNumber) {
        page.drawText(`FEDERAL PROJECT NO: ${input.federalProjectNumber}`, {
          x: 10,
          y,
          size: 8,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
      if (input.contractingAgency) {
        page.drawText(`CONTRACTING AGENCY: ${input.contractingAgency}`, {
          x: 290,
          y,
          size: 8,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
    }

    y -= 15;
    page.drawLine({
      start: { x: 10, y },
      end: { x: width - 10, y },
      thickness: 1,
      color: rgb(0.83, 0.63, 0.09),
    });

    // Column headers
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 14,
      width: width - 20,
      height: 28,
      color: rgb(0.15, 0.2, 0.25),
    });

    const colHeaders = [
      { label: '(1)\nNAME / ADDRESS\nCLASSIFICATION', x: 10, w: 130 },
      { label: '(2)\nDAYS / HOURS', x: 143, w: 80 },
      { label: '(3)\nREG HRS', x: 226, w: 35 },
      { label: '(4)\nOT HRS', x: 264, w: 35 },
      { label: '(5)\nREG RATE', x: 302, w: 45 },
      { label: '(6)\nOT RATE', x: 350, w: 45 },
      { label: '(7)\nGROSS WAGES', x: 398, w: 60 },
      { label: '(8)\nDEDUCTIONS', x: 461, w: 50 },
      { label: '(9)\nNET WAGES', x: 514, w: 55 },
    ];

    colHeaders.forEach((col) => {
      const lines = col.label.split('\n');
      lines.forEach((line, li) => {
        page.drawText(line, {
          x: col.x + 2,
          y: y - 2 - li * 8,
          size: 6,
          font: bold,
          color: rgb(1, 1, 1),
          maxWidth: col.w - 4,
        });
      });
    });

    y -= 16;

    // Worker rows
    const batch = remainingWorkers.splice(0, WORKERS_PER_PAGE);
    const ROW_HEIGHT = 40;

    batch.forEach((worker, i) => {
      const rowY = y - i * ROW_HEIGHT;
      const belowPrevailing =
        worker.prevailingWageRate !== undefined &&
        worker.regularRate < worker.prevailingWageRate;

      // Alternating row background
      page.drawRectangle({
        x: 10,
        y: rowY - ROW_HEIGHT + 2,
        width: width - 20,
        height: ROW_HEIGHT,
        color: belowPrevailing
          ? rgb(1, 0.95, 0.88)
          : i % 2 === 0
          ? rgb(0.96, 0.97, 0.98)
          : rgb(1, 1, 1),
      });

      // Name, address, classification
      page.drawText(worker.name.slice(0, 22), {
        x: 12,
        y: rowY - 5,
        size: 7.5,
        font: bold,
        color: belowPrevailing ? rgb(0.7, 0.3, 0.05) : rgb(0.05, 0.05, 0.05),
      });
      page.drawText(worker.address.slice(0, 24), {
        x: 12,
        y: rowY - 14,
        size: 6.5,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      page.drawText(worker.workClassification.slice(0, 22), {
        x: 12,
        y: rowY - 23,
        size: 6.5,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });

      if (belowPrevailing) {
        page.drawText(
          `BELOW PREVAILING (${fmtCurrency(worker.prevailingWageRate!)}/hr)`,
          { x: 12, y: rowY - 33, size: 6, font: bold, color: rgb(0.8, 0.2, 0) }
        );
      }

      // Days/hours worked
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
      const dayLabels = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
      days.forEach((day, di) => {
        const hrs = worker.daysWorked[day] || 0;
        page.drawText(`${dayLabels[di]}:${hrs}`, {
          x: 143 + di * 11,
          y: rowY - 8,
          size: 6,
          font: hrs > 0 ? bold : font,
          color: hrs > 8 ? rgb(0.7, 0.2, 0.1) : rgb(0.2, 0.2, 0.2),
        });
      });

      // Numeric columns
      const numCols: [number, string][] = [
        [226, worker.regularHours.toString()],
        [264, worker.overtimeHours > 0 ? worker.overtimeHours.toString() : '-'],
        [302, fmtCurrency(worker.regularRate)],
        [350, fmtCurrency(worker.overtimeRate)],
        [398, fmtCurrency(worker.grossWages)],
        [
          461,
          fmtCurrency(
            worker.ficaEmployee +
              worker.fedWithholding +
              worker.stateWithholding +
              worker.otherDeductions
          ),
        ],
        [514, fmtCurrency(worker.netWages)],
      ];

      numCols.forEach(([x, val]) => {
        page.drawText(val, {
          x,
          y: rowY - 8,
          size: 7,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    });

    y -= batch.length * ROW_HEIGHT + 8;

    // Totals row
    if (batch.length > 0) {
      page.drawRectangle({
        x: 10,
        y: y - 14,
        width: width - 20,
        height: 16,
        color: rgb(0.05, 0.07, 0.09),
      });
      const totGross = batch.reduce((s, w) => s + w.grossWages, 0);
      const totDeductions = batch.reduce(
        (s, w) =>
          s +
          w.ficaEmployee +
          w.fedWithholding +
          w.stateWithholding +
          w.otherDeductions,
        0
      );
      const totNet = batch.reduce((s, w) => s + w.netWages, 0);
      const totRegHrs = batch.reduce((s, w) => s + w.regularHours, 0);
      const totOtHrs = batch.reduce((s, w) => s + w.overtimeHours, 0);
      page.drawText('PAGE TOTALS', {
        x: 15,
        y: y - 10,
        size: 7.5,
        font: bold,
        color: rgb(0.83, 0.63, 0.09),
      });
      page.drawText(totRegHrs.toString(), {
        x: 226,
        y: y - 10,
        size: 7.5,
        font: bold,
        color: rgb(0.83, 0.63, 0.09),
      });
      page.drawText(totOtHrs.toString(), {
        x: 264,
        y: y - 10,
        size: 7.5,
        font: bold,
        color: rgb(0.83, 0.63, 0.09),
      });
      page.drawText(fmtCurrency(totGross), {
        x: 398,
        y: y - 10,
        size: 7.5,
        font: bold,
        color: rgb(0.83, 0.63, 0.09),
      });
      page.drawText(fmtCurrency(totDeductions), {
        x: 461,
        y: y - 10,
        size: 7.5,
        font: bold,
        color: rgb(0.83, 0.63, 0.09),
      });
      page.drawText(fmtCurrency(totNet), {
        x: 514,
        y: y - 10,
        size: 7.5,
        font: bold,
        color: rgb(0.83, 0.63, 0.09),
      });
    }

    // On last page add certification statement
    if (remainingWorkers.length === 0) {
      y -= 30;
      page.drawLine({
        start: { x: 10, y },
        end: { x: width - 10, y },
        thickness: 0.5,
        color: rgb(0.75, 0.75, 0.75),
      });
      y -= 14;
      page.drawText('STATEMENT OF COMPLIANCE (CERTIFICATION)', {
        x: 10,
        y,
        size: 9,
        font: bold,
        color: rgb(0, 0, 0),
      });
      y -= 12;
      const certText =
        `I, _________________________, do hereby certify that I am the _________________________ of ` +
        `${input.contractorName}, and that all laborers and mechanics employed by such contractor and subcontractor(s) ` +
        `on the Contract have been paid not less than the applicable wage rates and fringe benefits or cash equivalents ` +
        `for the classification of work performed, as specified in the applicable wage determination incorporated into ` +
        `the contract, in accordance with the provisions of the Davis-Bacon Act (40 U.S.C. 3141 et seq.) and ` +
        `29 CFR Part 5. This payroll report is correct and complete.`;

      const certWords = certText.split(' ');
      let certLine = '';
      for (const word of certWords) {
        if ((certLine + ' ' + word).length > 95) {
          page.drawText(certLine.trim(), {
            x: 10,
            y,
            size: 7.5,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= 10;
          certLine = word;
        } else {
          certLine = certLine + ' ' + word;
        }
      }
      if (certLine.trim()) {
        page.drawText(certLine.trim(), {
          x: 10,
          y,
          size: 7.5,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 10;
      }

      y -= 15;
      page.drawLine({
        start: { x: 10, y },
        end: { x: 280, y },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: 320, y },
        end: { x: width - 10, y },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      y -= 10;
      page.drawText('Signature / Title', {
        x: 10,
        y,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText('Date', {
        x: 320,
        y,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    page.drawText(
      `Generated by Saguaro CRM  \u2022  ${new Date().toLocaleDateString()}  \u2022  WH-347 Certified Payroll`,
      { x: 10, y: 15, size: 7, font, color: rgb(0.6, 0.6, 0.6) }
    );

    pageNum++;

    // Safety valve: if somehow remainingWorkers is empty and we've already done page 1, break
    if (remainingWorkers.length === 0) break;
  }

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(
    input.projectId,
    'wh347-certified-payroll',
    pdfBytes,
    {
      payrollNumber: input.payrollNumber,
      weekEnding: input.weekEnding,
      workerCount: input.workers.length,
    }
  );

  // Save to certified_payroll table
  try {
    await import('../../supabase/admin').then(({ supabaseAdmin }) =>
      supabaseAdmin.from('certified_payroll').insert({
        project_id: input.projectId,
        payroll_number: input.payrollNumber,
        week_ending: input.weekEnding,
        contractor_name: input.contractorName,
        worker_count: input.workers.length,
        total_gross_wages: input.workers.reduce((s, w) => s + w.grossWages, 0),
        total_net_wages: input.workers.reduce((s, w) => s + w.netWages, 0),
        pdf_url: pdfUrl,
      })
    );
  } catch {
    /* ignore */
  }

  return { pdfBytes, pdfUrl };
}
