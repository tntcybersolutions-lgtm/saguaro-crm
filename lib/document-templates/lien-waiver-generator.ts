import { PDFDocument, StandardFonts } from 'pdf-lib';
import { saveDocument, fmtCurrency } from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';
import { fmtDate } from '@/lib/format-date';

export type WaiverType =
  | 'conditional_progress'
  | 'unconditional_progress'
  | 'conditional_final'
  | 'unconditional_final';

export interface LienWaiverInput {
  projectId: string;
  waiverType: WaiverType;
  claimantName: string;
  claimantAddress: string;
  ownerName: string;
  projectName: string;
  projectAddress: string;
  amount: number;
  throughDate: string;
  checkNumber?: string;
  stateJurisdiction?: string;
}

function getWaiverTitle(
  type: WaiverType,
  state?: string
): { title: string; statute: string; body: string } {
  const titles: Record<WaiverType, string> = {
    conditional_progress:
      'CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
    unconditional_progress:
      'UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
    conditional_final: 'CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
    unconditional_final: 'UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
  };

  const azStatutes: Record<WaiverType, string> = {
    conditional_progress: 'A.R.S. \u00a733-1008(A)',
    unconditional_progress: 'A.R.S. \u00a733-1008(B)',
    conditional_final: 'A.R.S. \u00a733-1008(C)',
    unconditional_final: 'A.R.S. \u00a733-1008(D)',
  };

  const caStatutes: Record<WaiverType, string> = {
    conditional_progress: 'Cal. Civil Code \u00a78132',
    unconditional_progress: 'Cal. Civil Code \u00a78134',
    conditional_final: 'Cal. Civil Code \u00a78136',
    unconditional_final: 'Cal. Civil Code \u00a78138',
  };

  const txStatutes: Record<WaiverType, string> = {
    conditional_progress: 'Tex. Prop. Code \u00a753.281',
    unconditional_progress: 'Tex. Prop. Code \u00a753.284',
    conditional_final: 'Tex. Prop. Code \u00a753.287',
    unconditional_final: 'Tex. Prop. Code \u00a753.290',
  };

  const statutes =
    state === 'AZ'
      ? azStatutes
      : state === 'CA'
      ? caStatutes
      : state === 'TX'
      ? txStatutes
      : {
          conditional_progress: '',
          unconditional_progress: '',
          conditional_final: '',
          unconditional_final: '',
        };

  const bodies: Record<WaiverType, string> = {
    conditional_progress: `CONDITIONAL UPON RECEIPT OF PAYMENT: The claimant named below conditionally releases and waives all rights to a mechanic's lien, stop payment notice, or any right against a labor and material payment bond on the job for labor, services, equipment, or material furnished through the date shown below. This release is conditioned upon receipt of payment in the sum shown below.`,
    unconditional_progress: `UNCONDITIONAL AND FINAL AS TO PROGRESS PAYMENT: The claimant named below unconditionally releases and waives all rights to a mechanic's lien, stop payment notice, or any right against a labor and material payment bond on the job for labor, services, equipment, or material furnished through the date shown below, in consideration of the payment already received.`,
    conditional_final: `CONDITIONAL UPON RECEIPT OF FINAL PAYMENT: The claimant named below conditionally releases and waives all rights to a mechanic's lien, stop payment notice, or any right against a labor and material payment bond on the job for all labor, services, equipment, or material furnished on the job. This release is conditioned upon receipt of the final payment amount shown below.`,
    unconditional_final: `UNCONDITIONAL AND FINAL RELEASE: The claimant named below unconditionally releases and waives all rights to a mechanic's lien, stop payment notice, or any right against a labor and material payment bond on the job for all labor, services, equipment, or material furnished on the job through project completion, in consideration of the final payment already received.`,
  };

  return {
    title: titles[type],
    statute: statutes[type] || 'Applicable State Lien Law',
    body: bodies[type],
  };
}

export async function generateLienWaiver(
  input: LienWaiverInput
): Promise<{ pdfBytes: Uint8Array; pdfUrl: string }> {
  const { title, statute, body } = getWaiverTitle(
    input.waiverType,
    input.stateJurisdiction
  );

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { projectId: input.projectId });
  const page = pdf.addPage([612, 792]); // Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead \u2014 tenant logo + accent color (report-theme)
  drawBrandHeader(page, kit, { title, subtitle: statute });

  let y = height - 84;

  // Project and parties
  const fieldPairs: [string, string][] = [
    ['CLAIMANT (NAME):', input.claimantName],
    ['CLAIMANT ADDRESS:', input.claimantAddress],
    ['PROJECT NAME:', input.projectName],
    ['PROJECT ADDRESS:', input.projectAddress],
    ['OWNER:', input.ownerName],
    ['THROUGH DATE:', input.throughDate],
    ['PAYMENT AMOUNT:', fmtCurrency(input.amount)],
    ...(input.checkNumber
      ? ([['CHECK/PAYMENT NO:', input.checkNumber]] as [string, string][])
      : []),
  ];

  fieldPairs.forEach(([label, value]) => {
    page.drawText(label, {
      x: 20,
      y,
      size: 9,
      font: bold,
      color: DOC.text,
    });
    page.drawText(value, { x: 180, y, size: 9, font, color: DOC.ink });
    y -= 18;
  });

  y -= 10;
  page.drawLine({
    start: { x: 20, y },
    end: { x: width - 20, y },
    thickness: 0.5,
    color: DOC.accent,
  });
  y -= 20;

  // Waiver body text - wrap at ~90 chars
  page.drawText('WAIVER AND RELEASE:', {
    x: 20,
    y,
    size: 10,
    font: bold,
    color: DOC.ink,
  });
  y -= 15;

  const words = body.split(' ');
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).length > 88) {
      page.drawText(line.trim(), {
        x: 20,
        y,
        size: 9,
        font,
        color: DOC.text,
      });
      y -= 13;
      line = word;
    } else {
      line = line + ' ' + word;
    }
  }
  if (line.trim()) {
    page.drawText(line.trim(), {
      x: 20,
      y,
      size: 9,
      font,
      color: DOC.text,
    });
    y -= 13;
  }

  // Exceptions
  y -= 15;
  page.drawText('EXCEPTIONS (if any):', {
    x: 20,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  y -= 15;
  page.drawRectangle({
    x: 20,
    y: y - 40,
    width: width - 40,
    height: 40,
    borderColor: DOC.rule,
    borderWidth: 0.5,
  });
  y -= 60;

  // Signature block
  y -= 10;
  page.drawLine({
    start: { x: 20, y },
    end: { x: width - 20, y },
    thickness: 0.5,
    color: DOC.rule,
  });
  y -= 15;
  page.drawText('SIGNATURE:', {
    x: 20,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page.drawLine({
    start: { x: 100, y: y - 3 },
    end: { x: 350, y: y - 3 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page.drawText('TITLE:', {
    x: 360,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page.drawLine({
    start: { x: 400, y: y - 3 },
    end: { x: width - 20, y: y - 3 },
    thickness: 0.5,
    color: DOC.ink,
  });
  y -= 15;
  page.drawText('DATE:', {
    x: 20,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page.drawLine({
    start: { x: 60, y: y - 3 },
    end: { x: 200, y: y - 3 },
    thickness: 0.5,
    color: DOC.ink,
  });
  page.drawText('NOTARY (if required):', {
    x: 220,
    y,
    size: 9,
    font: bold,
    color: DOC.ink,
  });
  page.drawLine({
    start: { x: 340, y: y - 3 },
    end: { x: width - 20, y: y - 3 },
    thickness: 0.5,
    color: DOC.ink,
  });

  // Corporate footer: Page X of Y \u2022 company \u2022 generated date (statute stays in the letterhead)
  stampFooters(pdf, kit, statute);

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(
    input.projectId,
    `lien-waiver-${input.waiverType}`,
    pdfBytes,
    {
      waiverType: input.waiverType,
      claimant: input.claimantName,
      amount: input.amount,
      throughDate: input.throughDate,
    },
    undefined,
    /* A job collects one of these per subcontractor per billing period, so the
       claimant and the through-date are the whole point of the row. The waiver
       type is already the document's kind. */
    { title: `${input.claimantName} — through ${fmtDate(input.throughDate, { month: 'short', day: 'numeric', year: 'numeric' }, input.throughDate)}` },
  );

  // Save to lien_waivers table
  try {
    await import('../../supabase/admin').then(({ supabaseAdmin }) =>
      supabaseAdmin.from('lien_waivers').insert({
        project_id: input.projectId,
        waiver_type: input.waiverType,
        claimant: input.claimantName,
        claimant_address: input.claimantAddress,
        owner_name: input.ownerName,
        through_date: input.throughDate,
        amount: input.amount,
        check_number: input.checkNumber,
        signed_pdf_url: pdfUrl,
      })
    );
  } catch {
    /* ignore */
  }

  return { pdfBytes, pdfUrl };
}
