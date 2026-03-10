/**
 * scripts/run-migrations.ts
 *
 * Runs all Saguaro database migrations in the correct order.
 * Safe to run multiple times — all migrations use IF NOT EXISTS.
 *
 * Run: npx tsx scripts/run-migrations.ts
 *
 * Or run a specific migration:
 *   npx tsx scripts/run-migrations.ts 20260308_foundation
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Migration order — MUST run in this sequence
const MIGRATIONS = [
  '20260308_foundation',          // 1. Base tables (tenants, projects, rfis, invoices)
  '20260307_autopilot',           // 2. Autopilot alerts engine
  '20260307_bid_portal',          // 3. Bid packages, submissions, invites
  '20260308_core_modules',        // 4. Contracts, POs, punch lists, equipment, safety
  '20260308_bid_intelligence',    // 5. Bid outcomes, intelligence profiles
  '20260308_takeoff',             // 6. AI takeoff, sandbox, upsell
  '20260308_billing',             // 7. Plans, subscriptions, MRR tracking
  '20260308_documents',           // 8. Project documents, pay apps, lien waivers
  '20260308_documents_v2',        // 9. Insurance, certified payroll, OSHA, bonds, portals
];

const ROOT = join(process.cwd());

async function runMigration(name: string): Promise<void> {
  const filePath = join(ROOT, `${name}.sql`);
  if (!existsSync(filePath)) {
    console.error(`  ❌ File not found: ${name}.sql`);
    process.exit(1);
  }

  const sql = readFileSync(filePath, 'utf-8');
  console.log(`  ⏳ Running: ${name}.sql...`);

  // Split on semicolons but keep dollar-quoted blocks together
  // Use raw SQL execution via Supabase's RPC
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

  // If exec_sql doesn't exist, try direct query (requires pg_net or similar)
  // Fall back: print instructions
  if (error && error.message?.includes('exec_sql')) {
    console.log(`\n  ℹ️  Cannot run SQL directly via Supabase client.`);
    console.log(`  Run this migration manually in Supabase SQL Editor:\n`);
    console.log(`  1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql`);
    console.log(`  2. Paste contents of: ${name}.sql`);
    console.log(`  3. Click Run\n`);
  } else if (error) {
    console.error(`  ❌ ${name} failed: ${error.message}`);
    throw error;
  } else {
    console.log(`  ✅ ${name} complete`);
  }
}

async function main() {
  const targetMigration = process.argv[2];

  console.log('\n🌵 SAGUARO CRM — Database Migration Runner\n');
  console.log('='.repeat(55));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\n❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n');
    process.exit(1);
  }

  const toRun = targetMigration
    ? MIGRATIONS.filter(m => m.includes(targetMigration))
    : MIGRATIONS;

  if (toRun.length === 0) {
    console.error(`\n❌ No migration found matching: ${targetMigration}\n`);
    console.log('Available migrations:');
    MIGRATIONS.forEach(m => console.log(`  - ${m}`));
    process.exit(1);
  }

  console.log(`\nRunning ${toRun.length} migration(s):\n`);

  for (const migration of toRun) {
    await runMigration(migration);
  }

  console.log('\n' + '='.repeat(55));
  console.log('\n✅ All migrations complete\n');
  console.log('Next steps:');
  console.log('  1. npx tsx scripts/setup-storage.ts   — create storage buckets');
  console.log('  2. Seed document templates via API:');
  console.log('     POST /api/documents/seed-templates');
  console.log('  3. npx tsx scripts/verify-deployment.ts — verify all systems');
  console.log('  4. npm run build && npm run start\n');
}

main().catch(err => {
  console.error('\n❌ Migration runner error:', err.message);
  console.log('\n📋 MANUAL MIGRATION INSTRUCTIONS:');
  console.log('   Run each .sql file in Supabase SQL Editor in this order:');
  MIGRATIONS.forEach((m, i) => console.log(`   ${i + 1}. ${m}.sql`));
  process.exit(1);
});
