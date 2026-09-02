import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { encryptSecret, decryptSecret } from '@/lib/crypto-secrets';
import { exchangeCode, isOAuthProvider } from '@/lib/storage-providers/oauth';
import { makeProvider, ctxFromParts } from '@/lib/storage-providers/registry';
import { PROVIDER_META, type ProviderId } from '@/lib/storage-providers/types';
import { tryWrite } from '@/lib/db-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const SETTINGS = '/app/settings/storage';

/**
 * OAuth redirect target. Validates the encrypted state (carries the tenant),
 * exchanges the code for tokens, verifies the connection, and persists a
 * connector. No user session here — trust comes from the signed state.
 */
export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const origin = new URL(req.url).origin;
  const url = new URL(req.url);
  const provider = params.provider as ProviderId;
  const back = (q: string) => NextResponse.redirect(`${origin}${SETTINGS}?${q}`, 302);

  const err = url.searchParams.get('error');
  if (err) return back(`error=${encodeURIComponent(url.searchParams.get('error_description') || err)}`);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  if (!code || !stateRaw || !isOAuthProvider(provider)) return back('error=Invalid+OAuth+response');

  const state = decryptSecret<{ t: string; u: string; p: string; ts: number }>(decodeURIComponent(stateRaw));
  if (!state || state.p !== provider || Date.now() - state.ts > 10 * 60 * 1000) return back('error=Login+link+expired,+try+again');
  const tenantId = state.t;

  try {
    const secret = await exchangeCode(provider, code, origin);
    // Verify + get an account label before storing.
    let account = '';
    try { const p = await makeProvider(ctxFromParts(provider, tenantId, {}, secret)); const t = await p.test(); account = t.account || ''; } catch { /* store anyway; test() route can re-check */ }

    const admin = createServerClient() as any;
    await tryWrite(admin.from('storage_connectors').insert({
      tenant_id: tenantId, provider, status: 'connected',
      display_name: `${PROVIDER_META[provider].label}${account ? ` — ${account}` : ''}`,
      config: {}, secret_enc: encryptSecret(secret), created_by: state.u,
      last_verified_at: new Date().toISOString(),
    }), 'storage_connectors insert');
    return back(`connected=${provider}`);
  } catch (e: any) {
    return back(`error=${encodeURIComponent(e?.message || 'Could not complete sign-in')}`);
  }
}
