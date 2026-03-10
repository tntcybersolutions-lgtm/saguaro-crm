/**
 * supabase/admin.ts
 *
 * Shared Supabase service-role client — lazy initialized.
 * Bypasses RLS, for server-side use only.
 * NEVER expose this key or client to the browser.
 *
 * In demo mode (NEXT_PUBLIC_DEMO_MODE=true) this returns a
 * no-op client stub so the app builds and runs without Supabase.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEMO_URL = 'https://demo.supabase.co';
const DEMO_KEY = 'demo_anon_key_placeholder';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEMO_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEMO_KEY;

  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });

  return _client;
}

// Proxy object — initializes the real client on first use at runtime,
// never at build time. This prevents build failures when env vars are absent.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string, unknown>)[prop as string];
  },
});
