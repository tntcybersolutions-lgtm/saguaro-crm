import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/** GET /api/branding/tenant — returns full tenant branding including primary_color */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();

  const { data, error } = await db
    .from('tenants')
    .select('name, settings')
    .eq('id', user.tenantId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tenant = data as any;
  const settings = tenant?.settings ?? {};

  return NextResponse.json({
    name: settings.company_name ?? tenant?.name ?? '',
    logo_url: settings.logo_url ?? '',
    primary_color: settings.primary_color ?? '',
    custom_css: settings.custom_css ?? '',
    settings,
  });
}
