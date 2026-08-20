import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateContractSummary } from '@/lib/pdf-engine';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    if (!body.contract_id) {
      return NextResponse.json({ error: 'Missing required field: contract_id' }, { status: 400 });
    }

    const db = createServerClient();

    // Fetch contract with tenant isolation
    const { data: contract, error: cErr } = await db
      .from('contracts')
      .select('*')
      .eq('id', body.contract_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (cErr || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Fetch project info
    const { data: project } = await db
      .from('projects')
      .select('name, project_number')
      .eq('id', contract.project_id)
      .eq('tenant_id', user.tenantId)
      .single();

    // Fetch tenant/company name
    const { data: tenant } = await db
      .from('tenants')
      .select('company_name')
      .eq('id', user.tenantId)
      .single();

    const pdfBytes = await generateContractSummary({
      contract,
      projectName: project?.name || '',
      projectNumber: project?.project_number || '',
      companyName: tenant?.company_name || '',
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="contract-${contract.contract_number || contract.id}.pdf"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
