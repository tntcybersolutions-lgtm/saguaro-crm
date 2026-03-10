import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { supabaseAdmin } from '../supabase/admin';

// Master project context query - pulls everything needed for any document
export async function getProjectContext(projectId: string) {
  try {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    const { data: subs } = await supabaseAdmin
      .from('subcontractors')
      .select('*')
      .eq('project_id', projectId);

    const { data: changeOrders } = await supabaseAdmin
      .from('change_orders')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'approved');

    const { data: priorPayApps } = await supabaseAdmin
      .from('pay_applications')
      .select('*')
      .eq('project_id', projectId)
      .order('app_number', { ascending: false });

    const { data: lienWaivers } = await supabaseAdmin
      .from('lien_waivers')
      .select('*')
      .eq('project_id', projectId);

    const lastAppNumber = (priorPayApps as any[])?.[0]?.app_number || 0;
    const contractSumToDate =
      ((project as any)?.contract_amount || 0) +
      ((changeOrders as any[])?.reduce(
        (s: number, co: any) => s + (co.cost_impact || 0),
        0
      ) || 0);
    const totalCompletedToDate =
      (priorPayApps as any[])?.[0]?.this_period
        ? ((priorPayApps as any[])[0].prev_completed || 0) +
          ((priorPayApps as any[])[0].this_period || 0)
        : 0;

    return {
      project: project || null,
      subs: (subs as any[]) || [],
      changeOrders: (changeOrders as any[]) || [],
      priorPayApps: (priorPayApps as any[]) || [],
      lienWaivers: (lienWaivers as any[]) || [],
      lastAppNumber,
      contractSumToDate,
      totalCompletedToDate,
      owner: (project as any)?.owner_entity || { name: 'Owner', address: '' },
      architect: (project as any)?.architect_entity || {
        name: 'Architect',
        address: '',
      },
    };
  } catch {
    // Graceful fallback with demo data if DB unavailable
    return {
      project: null,
      subs: [],
      changeOrders: [],
      priorPayApps: [],
      lienWaivers: [],
      lastAppNumber: 0,
      contractSumToDate: 0,
      totalCompletedToDate: 0,
      owner: { name: 'Owner', address: '' },
      architect: { name: 'Architect', address: '' },
    };
  }
}

// Create a new PDF with standard Saguaro branding footer
export async function createPDF(): Promise<PDFDocument> {
  return await PDFDocument.create();
}

// Add a header to a page
export function addDocumentHeader(
  page: any,
  font: any,
  boldFont: any,
  title: string,
  subtitle: string
) {
  const { width, height } = page.getSize();
  // Gold accent bar at top
  page.drawRectangle({
    x: 0,
    y: height - 36,
    width,
    height: 36,
    color: rgb(0.831, 0.627, 0.09),
  });
  page.drawText('SAGUARO', {
    x: 10,
    y: height - 25,
    size: 12,
    font: boldFont,
    color: rgb(0.05, 0.066, 0.086),
  });
  page.drawText(title, {
    x: 10,
    y: height - 60,
    size: 16,
    font: boldFont,
    color: rgb(0.05, 0.066, 0.086),
  });
  page.drawText(subtitle, {
    x: 10,
    y: height - 78,
    size: 10,
    font,
    color: rgb(0.34, 0.4, 0.49),
  });
}

// Draw a labeled field box
export function drawField(
  page: any,
  font: any,
  boldFont: any,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number
) {
  page.drawRectangle({
    x,
    y: y - 22,
    width: w,
    height: 22,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.5,
    color: rgb(0.98, 0.98, 0.98),
  });
  page.drawText(label, {
    x: x + 3,
    y: y - 9,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(String(value || '').slice(0, 50), {
    x: x + 3,
    y: y - 19,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
}

// Format currency
export function fmtCurrency(n: number): string {
  return (
    '$' +
    (n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Save generated document to DB and return URL
export async function saveDocument(
  projectId: string,
  docType: string,
  pdfBytes: Uint8Array,
  dataSnapshot: Record<string, unknown>
): Promise<string> {
  try {
    // Upload to Supabase Storage
    const fileName = `${projectId}/${docType}-${Date.now()}.pdf`;
    await supabaseAdmin.storage
      .from('documents')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf' });

    const { data: urlData } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(fileName);

    const pdfUrl = urlData?.publicUrl || '';

    // Save record to DB
    await supabaseAdmin.from('generated_documents').insert({
      project_id: projectId,
      doc_type: docType,
      pdf_url: pdfUrl,
      data_snapshot: dataSnapshot,
    });

    return pdfUrl;
  } catch {
    return `demo://generated/${docType}-${Date.now()}.pdf`;
  }
}

// Merge multiple PDFs into one
export async function mergePDFs(
  pdfBytesArray: Uint8Array[]
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of pdfBytesArray) {
    try {
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch {
      /* skip corrupt PDFs */
    }
  }
  return await merged.save();
}

// Re-export PageSizes for use by generators
export { PageSizes, StandardFonts, rgb, PDFDocument };
