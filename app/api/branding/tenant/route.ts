import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
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
    return apiError('branding/tenant', error, undefined, 500);
  }

  const tenant = data as any;
  const settings = tenant?.settings ?? {};

  // White-label (app-chrome reskin) is gated to the design add-on tier.
  let whiteLabelEnabled = false;
  try {
    const { data: addon } = await db
      .from('design_addon_subscriptions')
      .select('white_label_enabled, status')
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    whiteLabelEnabled = !!(addon as any)?.white_label_enabled && (addon as any)?.status !== 'canceled';
  } catch {
    whiteLabelEnabled = false;
  }

  return NextResponse.json({
    name: settings.company_name ?? tenant?.name ?? '',
    logo_url: settings.logo_url ?? '',
    // Measured at upload; the sidebar uses it to decide whether a dark logo
    // needs a light plate to be visible on near-black chrome.
    logo_tone: settings.logo_tone ?? 'unknown',
    logo_w: settings.logo_w ?? null,
    logo_h: settings.logo_h ?? null,
    primary_color: settings.primary_color ?? '',
    white_label_enabled: whiteLabelEnabled,
    settings,
  });
}
