import { runAutopilot } from './engine';
import { supabaseAdmin } from './supabase/admin';

async function main() {
  const tenantId = process.argv[2] ?? null;
  const projectId = process.argv[3] ?? null;

  if (tenantId) {
    const result = await runAutopilot({ tenantId, projectId });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { data: tenants, error } = await supabaseAdmin.from('tenants').select('id');
  if (error) throw error;

  for (const tenant of tenants ?? []) {
    const result = await runAutopilot({ tenantId: tenant.id });
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
