import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import { signStoredUrl } from '@/lib/storage-signing';
import { CONTRACT_FORMS, type ContractKind } from '@/lib/document-templates/contract-fields';

/**
 * Every generation of a contract, newest first, with what changed since the one
 * before it.
 *
 * A GC re-papers a subcontract three times while a scope argument settles, and
 * then cannot say which copy the sub actually holds. Comparing two PDFs by eye
 * does not answer that. Every generator now records the field values it printed
 * in `data_snapshot.fields`, so the answer is a data diff: retainage 10% → 5%,
 * two exclusions added, completion pushed three weeks.
 *
 * Versions before this shipped have no `fields` and are listed with no diff
 * rather than a wrong one.
 */

/** Which generated_documents.doc_type each contract kind writes. */
const DOC_TYPE: Record<ContractKind, string> = {
  subcontract: 'subcontract',
  'change-order': 'g701',
  'purchase-order': 'purchase_order',
  'prime-contract': 'a101',
};

export interface FieldChange {
  key: string;
  label: string;
  from: string;
  to: string;
  kind: 'added' | 'removed' | 'changed';
}

/** Human labels, so a diff reads "Retainage %" and not "retainagePct". */
function labelsFor(kind: ContractKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of CONTRACT_FORMS[kind].fields) out[f.key] = f.label;
  return out;
}

/** A value as it would read on the page, so the comparison matches the paper. */
function show(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(String).join('; ');
  return String(v);
}

export function diffFields(
  older: Record<string, unknown> | null,
  newer: Record<string, unknown> | null,
  labels: Record<string, string>,
): FieldChange[] {
  if (!older || !newer) return [];
  const keys = Array.from(new Set([...Object.keys(older), ...Object.keys(newer)]));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const from = show(older[key]);
    const to = show(newer[key]);
    if (from === to) continue;
    changes.push({
      key,
      label: labels[key] || key,
      from,
      to,
      kind: !from ? 'added' : !to ? 'removed' : 'changed',
    });
  }
  /* Fields the form knows about first and in form order, so the diff reads in
     the same sequence as the screen that produced it. */
  const order = Object.keys(labels);
  return changes.sort((a, b) => {
    const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
    if (ai === bi) return a.label.localeCompare(b.label);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const kind = (searchParams.get('kind') || '') as ContractKind;

  if (!projectId) return apiFail('projectId is required', 400);
  if (!DOC_TYPE[kind]) return apiFail('Unknown contract kind', 400);

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('generated_documents')
      .select('id, pdf_url, data_snapshot, created_at')
      .eq('tenant_id', g.user.tenantId)
      .eq('project_id', projectId)
      .eq('doc_type', DOC_TYPE[kind])
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) throw error;

    const labels = labelsFor(kind);
    const rows = data || [];

    /* Newest first for reading; each version is compared against the one
       generated before it, which is the next row down. */
    const versions = await Promise.all(
      rows.map(async (row: any, i: number) => {
        const previous = rows[i + 1];
        const snap = (row.data_snapshot ?? {}) as Record<string, unknown>;
        const prevSnap = (previous?.data_snapshot ?? {}) as Record<string, unknown>;
        const fields = (snap.fields ?? null) as Record<string, unknown> | null;
        const prevFields = (prevSnap.fields ?? null) as Record<string, unknown> | null;
        return {
          id: row.id,
          version: rows.length - i,
          createdAt: row.created_at,
          pdfUrl: await signStoredUrl('documents', row.pdf_url),
          fields,
          /* No diff on the first version, and none against a version generated
             before field recording existed. */
          changes: previous ? diffFields(prevFields, fields, labels) : [],
          comparable: Boolean(fields && prevFields),
        };
      }),
    );

    return NextResponse.json({ versions });
  } catch (err) {
    return apiError('contracts/versions', err, 'Could not load the contract history.');
  }
}
