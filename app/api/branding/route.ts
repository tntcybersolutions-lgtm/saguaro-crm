import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';

/** GET /api/branding — returns { company_name, logo_url } for the current tenant */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const { data } = await db
    .from('tenants')
    .select('name, settings')
    .eq('id', user.tenantId)
    .single();

  const settings = (data as any)?.settings ?? {};
  return NextResponse.json({
    company_name: settings.company_name ?? (data as any)?.name ?? '',
    logo_url: settings.logo_url ?? '',
    logo_tone: settings.logo_tone ?? 'unknown',
    logo_w: settings.logo_w ?? null,
    logo_h: settings.logo_h ?? null,
    primary_color: settings.primary_color ?? '',
  });
}

// Only persist a plain hex color (#rgb / #rrggbb); anything else is ignored so a
// stored value can never inject CSS downstream.
function safeHex(v: unknown): string | null {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) ? v.trim() : null;
}

/** PUT /api/branding — saves { company_name, logo_url } to tenants.settings */
export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const company_name  = typeof body.company_name === 'string' ? body.company_name.trim() : undefined;
  const logo_url      = typeof body.logo_url     === 'string' ? body.logo_url.trim()     : undefined;
  // primary_color: accept a valid hex, OR an empty string to clear it.
  const hasColor      = typeof body.primary_color === 'string';
  const primary_color = hasColor ? (body.primary_color.trim() === '' ? '' : safeHex(body.primary_color)) : undefined;

  const db = createServerClient();

  // Read existing settings first to merge
  const { data: existing } = await db
    .from('tenants')
    .select('settings')
    .eq('id', user.tenantId)
    .single();

  const current = (existing as any)?.settings ?? {};
  const updated  = { ...current };
  if (company_name !== undefined) updated.company_name = company_name;
  if (logo_url     !== undefined) updated.logo_url     = logo_url;
  if (primary_color !== undefined && primary_color !== null) updated.primary_color = primary_color;

  const { error } = await db
    .from('tenants')
    .update({ settings: updated, updated_at: new Date().toISOString() })
    .eq('id', user.tenantId);

  if (error) return apiError('branding', error, undefined, 500);
  return NextResponse.json({ ok: true, company_name: updated.company_name, logo_url: updated.logo_url, primary_color: updated.primary_color });
}
