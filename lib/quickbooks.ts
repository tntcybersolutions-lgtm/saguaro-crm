import OAuthClient from 'intuit-oauth';

export function getQBOClient() {
  return new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID!,
    clientSecret: process.env.QBO_CLIENT_SECRET!,
    environment: (process.env.QBO_ENVIRONMENT || 'production') as 'sandbox' | 'production',
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/quickbooks/callback`,
  });
}

export function getAuthUri() {
  const client = getQBOClient();
  return client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: 'saguaro-qbo-connect',
  });
}

export async function refreshTokenIfNeeded(connection: {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  realm_id: string;
}) {
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);
  // Still valid (with 5 min buffer)
  if (now < new Date(expiresAt.getTime() - 5 * 60 * 1000)) {
    return connection;
  }
  const client = getQBOClient();
  client.setToken({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
  } as Parameters<typeof client.setToken>[0]);
  const refreshed = await client.refreshUsingToken(connection.refresh_token);
  return {
    ...connection,
    access_token: refreshed.getJson().access_token as string,
    refresh_token: refreshed.getJson().refresh_token as string,
    token_expires_at: new Date(
      Date.now() + (refreshed.getJson().expires_in as number) * 1000,
    ).toISOString(),
  };
}
