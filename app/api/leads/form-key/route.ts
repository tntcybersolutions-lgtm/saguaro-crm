import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { embedFormHtml } from '@/lib/lead-intake';

export const runtime = 'nodejs';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.saguarocontrol.net').replace(/\/$/, '');

/**
 * /api/leads/form-key — the company's public "request a quote" form
 * (lib/lead-intake). GET reads it; POST turns it on, or with { rotate: true }
 * replaces the key so the old link and pasted forms stop working.
 * The key lives in tenants.settings.lead_form_key (no schema change).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(key: string | null, company: string) {
  if (!key) return { key: null, url: null, embedHtml: null, company };
  return {
    key,
    url: `${APP_URL}/portals/lead/${key}`,
    embedHtml: embedFormHtml(`${APP_URL}/api/portal/lead/${key}`, company),
    company,
  };
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Sales', 'View');
  if (!g.ok) return g.res;
  try {
    const { data, error } = await g.db.from('tenants').select('name, company_name, settings').eq('id', g.user.tenantId).maybeSingle();
    if (error) throw error;
    const settings = (data?.settings || {}) as Record<string, unknown>;
    return NextResponse.json(shape(typeof settings.lead_form_key === 'string' ? settings.lead_form_key : null, String(data?.company_name || data?.name || 'Our team')));
  } catch (e) {
    return apiError('leads/form-key', e, 'Could not load the website form.');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  try {
    const { data, error } = await g.db.from('tenants').select('name, company_name, settings').eq('id', g.user.tenantId).maybeSingle();
    if (error) throw error;
    const settings = ((data?.settings || {}) as Record<string, unknown>);
    const company = String(data?.company_name || data?.name || 'Our team');
    const existing = typeof settings.lead_form_key === 'string' ? settings.lead_form_key : null;
    if (existing && body.rotate !== true) return NextResponse.json(shape(existing, company));
    const key = randomBytes(18).toString('hex'); // 36 chars, [a-f0-9]
    const { error: uErr } = await g.db.from('tenants').update({ settings: { ...settings, lead_form_key: key } }).eq('id', g.user.tenantId);
    if (uErr) throw uErr;
    return NextResponse.json(shape(key, company));
  } catch (e) {
    return apiError('leads/form-key', e, 'Could not set up the website form.');
  }
}
