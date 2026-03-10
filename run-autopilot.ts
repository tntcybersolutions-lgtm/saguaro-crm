import { runAutopilot } from './engine';
import { supabaseAdmin } from './supabase/admin';

const CONCURRENCY = 5;

async function runAllTenants(tenantIds: string[]) {
  const results: unknown[] = [];

  for (let i = 0; i < tenantIds.length; i += CONCURRENCY) {
    const batch = tenantIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((tenantId) => runAutopilot({ tenantId })),
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
        console.log(JSON.stringify(outcome.value, null, 2));
      } else {
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        console.error(`Tenant run failed: ${msg}`);
      }
    }
  }

  return results;
}

async function fetchAllTenantIds(): Promise<string[]> {
  const allIds: string[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const page = data ?? [];
    allIds.push(...page.map((t: { id: string }) => t.id));
    if (page.length < PAGE) break;
    from += PAGE;
  }

  return allIds;
}

async function main() {
  const tenantId = process.argv[2] ?? null;
  const projectId = process.argv[3] ?? null;

  if (tenantId) {
    const result = await runAutopilot({ tenantId, projectId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const tenantIds = await fetchAllTenantIds();
  await runAllTenants(tenantIds);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
