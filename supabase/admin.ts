/**
 * supabase/admin.ts
 *
 * Shared Supabase service-role client.
 * Uses the SERVICE_ROLE key — bypasses RLS, for server-side use only.
 * NEVER expose this key or this client to the browser.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

export const supabaseAdmin = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
});
