import { NextRequest, NextResponse } from 'next/server';
import { generateG704, saveDocument } from '@/lib/pdf-engine';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { contractSum, closeoutParties } from '@/lib/closeout-doc-data';
import { PUNCH_DONE } from '@/lib/project-lifecycle';

/**
 * G704 — Certificate of Substantial Completion.
 *
 * Same sourcing as the G706 (lib/closeout-doc-data). It used to read the
 * contractor from the request body (never sent, so it printed "General
 * Contractor"), the contract from contract_amount only, and stamped TODAY as
 * the date of substantial completion. The date is now the recorded
 * substantial-completion date, or a blank line to fill in.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const tenantId = g.user.tenantId;
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || '');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const db = createServerClient();

    const { data: project, error: projErr } = await db.from('projects').select('*')
      .eq('id', projectId).eq('tenant_id', tenantId).maybeSingle();
    if (projErr) throw projErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as Record<string, unknown>;

    // Every punch item still needing work, by the same status words the
    // closeout gate uses ('open' alone missed in_progress items).
    const [contract, parties, punchQ] = await Promise.all([
      contractSum(db, tenantId, projectId, p),
      closeoutParties(db, tenantId, p),
      db.from('punch_list').select('description')
        .eq('tenant_id', tenantId).eq('project_id', projectId)
        .not('status', 'in', `(${PUNCH_DONE.join(',')})`),
    ]);
    if (punchQ.error) throw punchQ.error;

    const bodyDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.completionDate || '')) ? String(body.completionDate) : '';

    const pdfBytes = await generateG704({
      projectName: String(p.name || ''),
      projectAddress: String(p.address || ''),
      ownerName: parties.ownerName,
      architectName: parties.architectName,
      gcName: parties.contractorName,
      contractDate: parties.contractDate,
      completionDate: bodyDate || parties.substantialCompletionDate,
      contractSum: contract.revised,
      punchListItems: ((punchQ.data || []) as { description?: string | null }[])
        .map((i) => String(i.description || '').trim())
        .filter(Boolean),
    });

    const pdfUrl = await saveDocument(projectId, 'g704', pdfBytes, body, tenantId);
    return NextResponse.json({ pdfUrl, contractSum: contract, success: true });
  } catch (e) {
    return apiError('documents/g704', e, 'Could not generate the G704');
  }
}
