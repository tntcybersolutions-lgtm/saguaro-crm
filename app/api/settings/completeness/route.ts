import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Settings completeness scorer.
 * Returns a weighted 0-100 score over the 10 fields required to generate
 * professional documents (G702, contracts, lien waivers, COs, letters).
 *
 * Score < 50  → red (critical)
 * Score 50-84 → gold (warning)
 * Score >= 85 → ok (banner hidden)
 */
const FIELD_WEIGHTS: Array<{ key: string; weight: number; label: string }> = [
  { key: 'company_name',     weight: 15, label: 'Company Name' },
  { key: 'company_address',  weight: 10, label: 'Company Address' },
  { key: 'company_city',     weight: 5,  label: 'Company City' },
  { key: 'company_state',    weight: 5,  label: 'Company State' },
  { key: 'company_zip',      weight: 5,  label: 'Company Zip' },
  { key: 'company_phone',    weight: 10, label: 'Company Phone' },
  { key: 'company_email',    weight: 10, label: 'Company Email' },
  { key: 'license_number',   weight: 15, label: 'License Number' },
  { key: 'signature_name',   weight: 15, label: 'Signature Name' },
  { key: 'signature_title',  weight: 10, label: 'Signature Title' },
];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (error && (error as { code?: string }).code !== 'PGRST116') {
      throw error;
    }

    const row: Record<string, unknown> = (data as Record<string, unknown>) || {};
    let score = 0;
    const missing: Array<{ key: string; label: string; weight: number }> = [];
    const present: string[] = [];

    for (const f of FIELD_WEIGHTS) {
      const v = row[f.key];
      const filled = typeof v === 'string' ? v.trim().length > 0 : v != null;
      if (filled) {
        score += f.weight;
        present.push(f.key);
      } else {
        missing.push({ key: f.key, label: f.label, weight: f.weight });
      }
    }

    const status: 'red' | 'gold' | 'ok' =
      score < 50 ? 'red' : score < 85 ? 'gold' : 'ok';

    // Persist summary back to tenant_settings for the banner + dashboard.
    // Uses upsert with partial patch; ignore errors silently.
    try {
      await db
        .from('tenant_settings')
        .upsert(
          {
            tenant_id: user.tenantId,
            completeness_pct: score,
            settings_complete: score >= 85,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' },
        );
    } catch { /* best-effort cache update */ }

    return NextResponse.json({
      score,
      status,
      missing,
      present,
      total: 100,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
