import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID || '';
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET || '';
const QB_REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI || '';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

/* ------------------------------------------------------------------ */
/*  GET  /api/integrations/quickbooks/callback                        */
/*  OAuth2 callback — exchanges code for tokens, saves to DB          */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  const state = url.searchParams.get('state'); // contains tenantId
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      new URL('/app/integrations?error=quickbooks_denied', req.url),
    );
  }

  if (!code || !realmId) {
    return NextResponse.redirect(
      new URL('/app/integrations?error=missing_params', req.url),
    );
  }

  try {
    const basicAuth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: QB_REDIRECT_URI,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('QuickBooks token exchange failed:', errBody);
      return NextResponse.redirect(
        new URL('/app/integrations?error=token_exchange_failed', req.url),
      );
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const db = createServerClient();

    // Decode tenant ID from state param, or fall back to cookie-based auth
    let tenantId = state || '';

    if (!tenantId) {
      const user = await getUser(req);
      if (!user) {
        return NextResponse.redirect(
          new URL('/app/integrations?error=auth_required', req.url),
        );
      }
      tenantId = user.tenantId;
    }

    // Upsert integration record
    const { data: existing } = await db
      .from('integrations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider', 'quickbooks')
      .maybeSingle();

    if (existing) {
      await db
        .from('integrations')
        .update({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          realm_id: realmId,
          status: 'active',
          settings: {
            sync_invoices: true,
            sync_bills: true,
            sync_customers: true,
            sync_vendors: true,
            sync_direction: 'bidirectional',
            sync_frequency: 'manual',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await db.from('integrations').insert({
        tenant_id: tenantId,
        provider: 'quickbooks',
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        realm_id: realmId,
        status: 'active',
        settings: {
          sync_invoices: true,
          sync_bills: true,
          sync_customers: true,
          sync_vendors: true,
          sync_direction: 'bidirectional',
          sync_frequency: 'manual',
        },
      });
    }

    return NextResponse.redirect(
      new URL('/app/integrations?success=quickbooks_connected', req.url),
    );
  } catch (err) {
    console.error('QuickBooks callback error:', err);
    return NextResponse.redirect(
      new URL('/app/integrations?error=internal_error', req.url),
    );
  }
}
