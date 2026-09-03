import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signFields } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/insurance/list?project_id=...  -> { certificates: [...] }
// Lists the tenant's COIs / insurance certificates for a project.
// Tenant-scoped. Guards null user -> [] 200 so a logged-out / loading page never errors.
//
// Reads the `insurance_certificates` table (real columns: id, project_id, tenant_id,
// sub_name, sub_id, policy_type, carrier, policy_number, effective_date, expiry_date,
// coverage_amount, pdf_url, status, last_checked_at, created_at).
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ certificates: [] }, { status: 200 });
  try {
    const projectId =
      req.nextUrl.searchParams.get('project_id') ??
      req.nextUrl.searchParams.get('projectId') ??
      undefined;

    const db = createServerClient();
    let q = db
      .from('insurance_certificates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);

    const { data, error } = await q;
    if (error) throw error;

    // 'project-files' bucket is private — sign COI PDF URLs on read.
    return NextResponse.json({ certificates: await signFields(data || [], ['pdf_url', 'coi_url', 'certificate_url']) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('insurance/list', e);
  }
}
