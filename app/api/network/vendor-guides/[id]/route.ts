import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = createServerClient();
    // Allow access to both this tenant's rows and the shared (NULL tenant_id) seed library.
    const { data, error } = await db
      .from('network_vendor_guides')
      .select('*')
      .eq('id', id)
      .or(`tenant_id.is.null,tenant_id.eq.${user.tenantId}`)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Guide not found' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message || 'Internal server error' }, { status: 500 });
  }
}
