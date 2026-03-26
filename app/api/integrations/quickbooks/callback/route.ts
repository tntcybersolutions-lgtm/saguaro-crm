import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const QB_CLIENT_ID     = process.env.QB_CLIENT_ID ?? '';
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET ?? '';
const QB_REDIRECT_URI  = process.env.QB_REDIRECT_URI ?? '';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code    = searchParams.get('code') ?? '';
  const realmId = searchParams.get('realmId') ?? '';
  const error   = searchParams.get('error');

  if (error || !code || !realmId) {
    return NextResponse.redirect(
      new URL('/app/settings/integrations?qb=error', req.url)
    );
  }

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: QB_REDIRECT_URI,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL('/app/settings/integrations?qb=error', req.url)
    );
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await getSupabase().from('integrations').upsert({
    provider: 'quickbooks',
    meta: {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      realm_id:      realmId,
    },
  }, { onConflict: 'provider' });

  return NextResponse.redirect(
    new URL('/app/settings/integrations?qb=connected', req.url)
  );
}
