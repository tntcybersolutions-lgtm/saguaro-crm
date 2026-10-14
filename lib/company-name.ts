/**
 * company-name — the name to show for a company in emails and invites.
 *
 * Invites read only the inviter's profiles.company, which is empty for most
 * people, so the email said "join your team" instead of the company's name.
 * Every company has tenants.name (16 of 19 have no company_name), so the chain
 * is: tenants.company_name → tenants.name → the inviter's profile company.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function companyDisplayName(db: SupabaseClient<any>, tenantId: string, userId?: string | null): Promise<string | null> {
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const [{ data: tenant, error: tErr }, profileRes] = await Promise.all([
    db.from('tenants').select('name, company_name').eq('id', tenantId).maybeSingle(),
    userId ? db.from('profiles').select('company').eq('id', userId).eq('tenant_id', tenantId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (tErr) console.error('[company-name] tenant read failed', tErr);
  const t = (tenant || {}) as { name?: unknown; company_name?: unknown };
  const p = (profileRes.data || {}) as { company?: unknown };
  return clean(t.company_name) || clean(t.name) || clean(p.company) || null;
}
