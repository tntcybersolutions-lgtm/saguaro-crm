import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { getProjectContext, saveDocument, mergePDFs, fmtCurrency } from '../pdf-engine';
import { brandDoc, DOC } from './report-theme';
import { subsOnProject } from '@/lib/project-subs';

export interface CloseoutItem {
  id: string;
  category: string;
  title: string;
  required: boolean;
  completed: boolean;
  documentUrl?: string;
}

const REQUIRED_CLOSEOUT_ITEMS: Omit<CloseoutItem, 'completed' | 'documentUrl'>[] = [
  { id: 'g702-final',      category: 'Financial',    title: 'AIA G702 Final Pay Application',          required: true },
  { id: 'g703-final',      category: 'Financial',    title: 'AIA G703 Final Schedule of Values',       required: true },
  { id: 'g704',            category: 'Completion',   title: 'AIA G704 Certificate of Substantial Completion', required: true },
  { id: 'g706',            category: 'Completion',   title: "AIA G706 Contractor's Affidavit",         required: true },
  { id: 'lien-waivers',    category: 'Legal',        title: 'Unconditional Final Lien Waivers (All Subs)', required: true },
  { id: 'osha-300',        category: 'Safety',       title: 'OSHA 300 Log Summary',                    required: true },
  { id: 'warranty',        category: 'Warranty',     title: 'Contractor Warranty Letter (1-year min)', required: true },
  { id: 'as-builts',       category: 'Drawings',     title: 'As-Built Drawings',                       required: true },
  { id: 'op-manuals',      category: 'O&M',          title: 'Operations & Maintenance Manuals',        required: true },
  { id: 'attic-stock',     category: 'Materials',    title: 'Attic Stock Receipt',                     required: false },
  { id: 'equipment-list',  category: 'Equipment',    title: 'Equipment List & Serial Numbers',         required: false },
  { id: 'test-reports',    category: 'QA/QC',        title: 'Commissioning & Test Reports',            required: false },
  { id: 'permits-closed',  category: 'Permits',      title: 'Final Permit Inspection / Certificate of Occupancy', required: true },
  { id: 'bonds-released',  category: 'Legal',        title: 'Performance & Payment Bond Release',      required: false },
  { id: 'insurance',       category: 'Insurance',    title: 'Project Insurance Closeout',              required: false },
];

export async function getCloseoutChecklist(
  projectId: string
): Promise<{ items: CloseoutItem[]; completionPct: number }> {
  try {
    const { supabaseAdmin } = await import('../../supabase/admin');

    // Check generated_documents for each item
    const { data: generatedDocs } = await supabaseAdmin
      .from('generated_documents')
      .select('doc_type, pdf_url')
      .eq('project_id', projectId);

    const { data: lienWaivers } = await supabaseAdmin
      .from('lien_waivers')
      .select('waiver_type')
      .eq('project_id', projectId);

    const subs = await subsOnProject(supabaseAdmin as any, projectId);

    const docTypes = new Set((generatedDocs || []).map((d: any) => d.doc_type));
    const allSubsHaveFinalWaivers =
      (subs || []).length > 0 &&
      (subs || []).every((sub: any) =>
        (lienWaivers || []).some(
          (w: any) =>
            w.waiver_type === 'unconditional_final'
        )
      );

    const items: CloseoutItem[] = REQUIRED_CLOSEOUT_ITEMS.map((template) => {
      let completed = false;
      let documentUrl: string | undefined;

      switch (template.id) {
        case 'g702-final':
          completed = docTypes.has('g702');
          documentUrl = (generatedDocs || []).find((d: any) => d.doc_type === 'g702')?.pdf_url;
          break;
        case 'g703-final':
          completed = docTypes.has('g703');
          documentUrl = (generatedDocs || []).find((d: any) => d.doc_type === 'g703')?.pdf_url;
          break;
        case 'g704':
          completed = docTypes.has('g704');
          documentUrl = (generatedDocs || []).find((d: any) => d.doc_type === 'g704')?.pdf_url;
          break;
        case 'g706':
          completed = docTypes.has('g706');
          documentUrl = (generatedDocs || []).find((d: any) => d.doc_type === 'g706')?.pdf_url;
          break;
        case 'lien-waivers':
          completed = allSubsHaveFinalWaivers;
          break;
        case 'osha-300':
          completed = docTypes.has('osha-300');
          documentUrl = (generatedDocs || []).find((d: any) => d.doc_type === 'osha-300')?.pdf_url;
          break;
        default:
          completed = false;
      }

      return { ...template, completed, documentUrl };
    });

    const requiredItems = items.filter((i) => i.required);
    const completedRequired = requiredItems.filter((i) => i.completed).length;
    const completionPct =
      requiredItems.length > 0
        ? Math.round((completedRequired / requiredItems.length) * 100)
        : 0;

    return { items, completionPct };
  } catch {
    // Fallback: return all items as incomplete
    const items = REQUIRED_CLOSEOUT_ITEMS.map((t) => ({ ...t, completed: false }));
    return { items, completionPct: 0 };
  }
}

export async function generateCloseoutPackage(projectId: string): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
  missingItems: string[];
}> {
  const ctx = await getProjectContext(projectId);
  const { project } = ctx;

  const { items, completionPct } = await getCloseoutChecklist(projectId);

  // Identify missing required items
  const missingItems = items
    .filter((i) => i.required && !i.completed)
    .map((i) => i.title);

  // Generate cover sheet PDF — branded corporate cover (tenant logo + accent)
  const coverPdf = await PDFDocument.create();
  const kit = await brandDoc(coverPdf, { projectId });
  const coverPage = coverPdf.addPage(PageSizes.Letter);
  const font = await coverPdf.embedFont(StandardFonts.Helvetica);
  const bold = await coverPdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = coverPage.getSize();

  // Cover page design — accent band takes the tenant's brand color
  coverPage.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: DOC.ink,
  });
  coverPage.drawRectangle({
    x: 0,
    y: height - 160,
    width,
    height: 160,
    color: kit.accent,
  });

  // Real tenant logo when set; clean typographic wordmark otherwise.
  if (kit.logo) {
    const lh = 30;
    const lw = Math.min(160, (kit.logo.w * lh) / kit.logo.h);
    coverPage.drawImage(kit.logo.img, { x: 40, y: height - 58, width: lw, height: lh });
  } else {
    coverPage.drawText(kit.companyName.toUpperCase().slice(0, 48), {
      x: 40,
      y: height - 50,
      size: 14,
      font: bold,
      color: DOC.ink,
    });
  }
  coverPage.drawText('PROJECT CLOSEOUT PACKAGE', {
    x: 40,
    y: height - 80,
    size: 24,
    font: bold,
    color: DOC.ink,
  });
  coverPage.drawText((project as any)?.name || 'Project', {
    x: 40,
    y: height - 108,
    size: 16,
    font: bold,
    color: DOC.ink,
  });
  coverPage.drawText((project as any)?.address || '', {
    x: 40,
    y: height - 126,
    size: 10,
    font,
    color: DOC.ink,
  });
  coverPage.drawText(`Prepared: ${new Date().toLocaleDateString()}`, {
    x: 40,
    y: height - 144,
    size: 10,
    font,
    color: DOC.ink,
  });

  // Project details
  let y = height - 200;
  const detailRows = [
    ['Project Number:', (project as any)?.project_number || ''],
    ['Owner:', (ctx.owner as any)?.name || ''],
    ['Architect:', (ctx.architect as any)?.name || ''],
    ['General Contractor:', (project as any)?.gc_entity?.name || ''],
    ['Contract Amount:', fmtCurrency((project as any)?.contract_amount || 0)],
    ['Substantial Completion:', (project as any)?.substantial_completion_actual || ''],
  ];

  detailRows.forEach(([label, value]) => {
    coverPage.drawText(label, {
      x: 40,
      y,
      size: 10,
      font: bold,
      color: DOC.accent,
    });
    coverPage.drawText(value, {
      x: 220,
      y,
      size: 10,
      font,
      color: DOC.highlight,
    });
    y -= 18;
  });

  // Completion status
  y -= 20;
  coverPage.drawRectangle({
    x: 40,
    y: y - 5,
    width: width - 80,
    height: 30,
    color: completionPct === 100 ? DOC.success : DOC.danger,
    borderColor: DOC.accent,
    borderWidth: 1,
  });
  coverPage.drawText(
    completionPct === 100
      ? 'ALL REQUIRED DOCUMENTS COMPLETE'
      : `PACKAGE ${completionPct}% COMPLETE — ${missingItems.length} REQUIRED ITEMS MISSING`,
    {
      x: 50,
      y: y + 7,
      size: 10,
      font: bold,
      color: DOC.paper,
    }
  );

  // Checklist table
  y -= 50;
  coverPage.drawText('DOCUMENT CHECKLIST', {
    x: 40,
    y,
    size: 12,
    font: bold,
    color: DOC.accent,
  });
  y -= 5;

  // Group by category
  const categories = [...new Set(items.map((i) => i.category))];
  for (const category of categories) {
    y -= 18;
    coverPage.drawText(category.toUpperCase(), {
      x: 40,
      y,
      size: 8,
      font: bold,
      color: DOC.rule,
    });

    const catItems = items.filter((i) => i.category === category);
    for (const item of catItems) {
      y -= 14;
      // Status indicator
      coverPage.drawRectangle({
        x: 40,
        y: y - 3,
        width: 10,
        height: 10,
        color: item.completed
          ? DOC.success
          : item.required
          ? DOC.danger
          : DOC.muted,
      });
      coverPage.drawText(item.title, {
        x: 55,
        y,
        size: 8.5,
        font: item.required ? bold : font,
        color: item.completed
          ? DOC.successFill
          : item.required
          ? DOC.dangerFill
          : DOC.faint,
      });
      coverPage.drawText(
        item.completed ? 'INCLUDED' : item.required ? 'MISSING' : 'N/A',
        {
          x: width - 100,
          y,
          size: 8,
          font: bold,
          color: item.completed
            ? DOC.successFill
            : item.required
            ? DOC.warning
            : DOC.faint,
        }
      );

      if (y < 60) break; // Safety - don't overflow page
    }
    if (y < 60) break;
  }

  coverPage.drawText(
    `${kit.companyName}  \u2022  Project Closeout Package  \u2022  Generated ${new Date().toLocaleDateString()}`,
    { x: 40, y: 30, size: 7, font, color: DOC.faint }
  );

  const coverBytes = await coverPdf.save();

  // Collect all PDF bytes to merge
  const allPdfBytes: Uint8Array[] = [coverBytes];

  // Try to fetch and include completed document PDFs
  try {
    const { supabaseAdmin } = await import('../../supabase/admin');
    for (const item of items) {
      if (item.completed && item.documentUrl && !item.documentUrl.startsWith('demo://')) {
        try {
          const response = await fetch(item.documentUrl);
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            allPdfBytes.push(bytes);
          }
        } catch {
          /* skip unavailable doc */
        }
      }
    }
  } catch {
    /* DB unavailable */
  }

  // Merge all collected PDFs
  const mergedBytes = await mergePDFs(allPdfBytes);

  const pdfUrl = await saveDocument(
    projectId,
    'closeout-package',
    mergedBytes,
    {
      completionPct,
      missingItems,
      documentCount: allPdfBytes.length,
      generatedAt: new Date().toISOString(),
    }
  );

  return { pdfBytes: mergedBytes, pdfUrl, missingItems };
}
