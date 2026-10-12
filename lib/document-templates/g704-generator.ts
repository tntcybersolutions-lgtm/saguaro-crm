import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';

export interface PunchListItem {
  id: string;
  description: string;
  assignedTo: string;
  dueDate: string;
  completed: boolean;
}

export interface G704Input {
  projectId: string;
  substantialCompletionDate: string;
  warrantyStartDate?: string;
  punchListItems?: PunchListItem[];
  punchListCost?: number;
  ownerOccupancyDate?: string;
  certificateDate?: string;
}

export async function generateG704(input: G704Input): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead \u2014 tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, { title: 'AIA G704 \u2014 CERTIFICATE OF SUBSTANTIAL COMPLETION' });

  // Project info fields
  let y = height - 65;
  drawField(
    page,
    font,
    bold,
    'PROJECT:',
    (project as any)?.name || 'Project Name',
    10,
    y,
    200
  );
  drawField(
    page,
    font,
    bold,
    'PROJECT NO:',
    (project as any)?.project_number || '',
    215,
    y,
    130
  );
  drawField(
    page,
    font,
    bold,
    'CONTRACT DATE:',
    (project as any)?.start_date || '',
    350,
    y,
    130
  );

  y -= 30;
  drawField(
    page,
    font,
    bold,
    'OWNER:',
    (ctx.owner as any)?.name || '',
    10,
    y,
    200
  );
  drawField(
    page,
    font,
    bold,
    'ARCHITECT:',
    (ctx.architect as any)?.name || '',
    215,
    y,
    165
  );
  drawField(
    page,
    font,
    bold,
    'CONTRACTOR:',
    (project as any)?.gc_entity?.name || '',
    385,
    y,
    165
  );

  y -= 30;
  drawField(
    page,
    font,
    bold,
    'PROJECT ADDRESS:',
    (project as any)?.address || '',
    10,
    y,
    330
  );
  drawField(
    page,
    font,
    bold,
    'CONTRACT FOR:',
    'General Construction',
    345,
    y,
    165
  );

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: DOC.accent,
  });

  // Certificate body
  y -= 18;
  page.drawText('CERTIFICATE OF SUBSTANTIAL COMPLETION', {
    x: 10,
    y,
    size: 11,
    font: bold,
    color: DOC.ink,
  });

  y -= 14;
  const certText =
    'To the Owner and Contractor: The Work performed under this Contract has been reviewed and found, to the ' +
    "Architect's best knowledge, information, and belief, to be substantially complete. This Certificate is issued so " +
    'that the Owner and Contractor may agree upon and execute the Division of Responsibilities pending Final Completion ' +
    'and the attached list of items to be completed or corrected.';

  const certWords = certText.split(' ');
  let certLine = '';
  for (const word of certWords) {
    if ((certLine + ' ' + word).length > 95) {
      page.drawText(certLine.trim(), {
        x: 10,
        y,
        size: 8.5,
        font,
        color: DOC.text,
      });
      y -= 12;
      certLine = word;
    } else {
      certLine = certLine + ' ' + word;
    }
  }
  if (certLine.trim()) {
    page.drawText(certLine.trim(), {
      x: 10,
      y,
      size: 8.5,
      font,
      color: DOC.text,
    });
    y -= 12;
  }

  // Date table
  y -= 15;
  page.drawText('COMPLETION DATES', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: DOC.ink,
  });
  y -= 5;

  const dateRows = [
    [
      'Date of Issuance:',
      input.certificateDate || new Date().toLocaleDateString(),
    ],
    ['Date of Substantial Completion:', input.substantialCompletionDate],
    ['Warranty Start Date:', input.warrantyStartDate || input.substantialCompletionDate],
    [
      'Owner Occupancy Date:',
      input.ownerOccupancyDate || input.substantialCompletionDate,
    ],
    ['Original Contract Completion Date:', (project as any)?.substantial_date || ''],
  ];

  dateRows.forEach(([label, value], i) => {
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 18,
      color: i % 2 === 0 ? DOC.zebra : DOC.paper,
    });
    page.drawText(label, {
      x: 15,
      y: y + 2,
      size: 9,
      font: bold,
      color: DOC.text,
    });
    page.drawText(value, {
      x: 280,
      y: y + 2,
      size: 9,
      font,
      color: DOC.ink,
    });
  });

  // Punch list section
  y -= 25;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.accent,
  });
  y -= 15;
  page.drawText('WORK TO COMPLETE OR CORRECT (PUNCH LIST)', {
    x: 10,
    y,
    size: 10,
    font: bold,
    color: DOC.ink,
  });

  if (input.punchListCost) {
    page.drawText(
      `Estimated Cost to Complete Punch List: ${fmtCurrency(input.punchListCost)}`,
      { x: 10, y: y - 14, size: 9, font, color: DOC.muted }
    );
    y -= 14;
  }

  const punchItems = input.punchListItems || [];
  if (punchItems.length === 0) {
    y -= 14;
    page.drawText('See attached punch list.', {
      x: 15,
      y,
      size: 9,
      font,
      color: DOC.muted,
    });
    y -= 14;
  } else {
    // Column headers
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 16,
      color: DOC.ink,
    });
    page.drawText('DESCRIPTION', {
      x: 15,
      y: y + 1,
      size: 7.5,
      font: bold,
      color: DOC.paper,
    });
    page.drawText('ASSIGNED TO', {
      x: 310,
      y: y + 1,
      size: 7.5,
      font: bold,
      color: DOC.paper,
    });
    page.drawText('DUE DATE', {
      x: 440,
      y: y + 1,
      size: 7.5,
      font: bold,
      color: DOC.paper,
    });
    page.drawText('STATUS', {
      x: 520,
      y: y + 1,
      size: 7.5,
      font: bold,
      color: DOC.paper,
    });

    const maxItems = Math.min(punchItems.length, 12);
    for (let i = 0; i < maxItems; i++) {
      const item = punchItems[i];
      y -= 14;
      page.drawRectangle({
        x: 10,
        y: y - 4,
        width: width - 20,
        height: 14,
        color: i % 2 === 0 ? DOC.zebra : DOC.paper,
      });
      page.drawText(item.description.slice(0, 42), {
        x: 15,
        y: y + 1,
        size: 8,
        font,
        color: DOC.ink,
      });
      page.drawText(item.assignedTo.slice(0, 18), {
        x: 310,
        y: y + 1,
        size: 8,
        font,
        color: DOC.text,
      });
      page.drawText(item.dueDate, {
        x: 440,
        y: y + 1,
        size: 8,
        font,
        color: DOC.text,
      });
      page.drawText(item.completed ? 'COMPLETE' : 'OPEN', {
        x: 520,
        y: y + 1,
        size: 8,
        font: bold,
        color: item.completed ? DOC.success : DOC.warning,
      });
    }

    if (punchItems.length > 12) {
      y -= 14;
      page.drawText(
        `... and ${punchItems.length - 12} more items. See attached full punch list.`,
        { x: 15, y, size: 8, font, color: DOC.faint }
      );
    }
  }

  // Signature blocks
  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.rule,
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
      color: DOC.ink,
    });
    page.drawLine({
      start: { x: col.x, y: y - 20 },
      end: { x: col.x + 180, y: y - 20 },
      thickness: 0.5,
      color: DOC.ink,
    });
    page.drawText('Signature / Date', {
      x: col.x,
      y: y - 30,
      size: 7,
      font,
      color: DOC.faint,
    });
    page.drawLine({
      start: { x: col.x, y: y - 45 },
      end: { x: col.x + 180, y: y - 45 },
      thickness: 0.5,
      color: DOC.ink,
    });
    page.drawText('Printed Name / Title', {
      x: col.x,
      y: y - 55,
      size: 7,
      font,
      color: DOC.faint,
    });
  });

  // Corporate footer: Page X of Y \u2022 company \u2022 generated date
  stampFooters(pdf, kit, 'AIA G704 Substantial Completion');

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(
    input.projectId,
    'g704',
    pdfBytes,
    {
      substantialCompletionDate: input.substantialCompletionDate,
      punchListItems: punchItems.length,
    }
  );

  // Update project record
  try {
    await import('../../supabase/admin').then(({ supabaseAdmin }) =>
      supabaseAdmin
        .from('projects')
        .update({
          substantial_completion_actual: input.substantialCompletionDate,
          g704_pdf_url: pdfUrl,
        })
        .eq('id', input.projectId)
    );
  } catch {
    /* ignore */
  }

  return { pdfBytes, pdfUrl };
}
