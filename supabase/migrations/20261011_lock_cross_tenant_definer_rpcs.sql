-- Applied to production 2026-10-11 (Supabase MCP apply_migration
-- "lock_cross_tenant_definer_rpcs").
--
-- These SECURITY DEFINER functions take a user / record id and check no tenant.
-- Only the server (service role) calls them — lib/sage-intelligence-v6.ts and
-- app/api/fleet/ingest/route.ts, both through createServerClient(). A signed-in
-- user could otherwise call them through /rest/v1/rpc with the public anon key
-- and change another user's Sage profile (any column via p_extra) or another
-- company's fleet ping counters.
revoke execute on function public.increment_sage_profile_counter(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.increment_fleet_ping(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_sage_profile_counter(uuid, text, jsonb) to service_role;
grant execute on function public.increment_fleet_ping(uuid, integer, timestamptz) to service_role;
