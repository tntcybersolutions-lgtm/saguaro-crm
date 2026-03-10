/**
 * scripts/verify-deployment.ts
 *
 * Pre-deployment verification script.
 * Checks every required env var, service connection, and
 * storage bucket before allowing a production deployment.
 *
 * Run: npx tsx scripts/verify-deployment.ts
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const PASS  = '✅';
const FAIL  = '❌';
const WARN  = '⚠️ ';

let exitCode = 0;

function check(label: string, value: boolean, required = true) {
  if (value) {
    console.log(`  ${PASS} ${label}`);
  } else if (required) {
    console.log(`  ${FAIL} ${label} — REQUIRED`);
    exitCode = 1;
  } else {
    console.log(`  ${WARN} ${label} — optional but recommended`);
  }
}

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_REPLY_TO',
  'SAGUARO_API_SECRET',
  'AUTOPILOT_CRON_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SANDBOX_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const OPTIONAL_ENV = [
  'COMPANY_NAME',
  'SALES_EMAIL',
  'SUPPORT_EMAIL',
  'WHITE_LABEL_CNAME_TARGET',
  'VERCEL_API_TOKEN',
  'VERCEL_PROJECT_ID',
  'ALLOWED_ORIGINS',
];

async function main() {
  console.log('\n🌵 SAGUARO CRM — Production Deployment Verification\n');
  console.log('='.repeat(55));

  // ── Environment Variables ───────────────────────────────────
  console.log('\n📋 Environment Variables (Required)\n');
  for (const key of REQUIRED_ENV) {
    check(key, !!process.env[key]);
  }

  console.log('\n📋 Environment Variables (Optional)\n');
  for (const key of OPTIONAL_ENV) {
    check(key, !!process.env[key], false);
  }

  // ── Supabase Connection ─────────────────────────────────────
  console.log('\n🗄️  Supabase Connection\n');
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (url && key) {
      const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await supabase.from('tenants').select('id').limit(1);
      check('Supabase connection', !error, true);
      check('`tenants` table exists', !error, true);

      // Check all required tables
      const tables = [
        'tenants','tenant_memberships','projects','schedule_tasks',
        'rfis','invoices','change_orders','field_issues',
        'bid_packages','bid_submissions','subcontractor_companies',
        'autopilot_alerts','autopilot_runs','bid_jackets',
        'contracts','contract_milestones','budget_line_items',
        'pay_applications','lien_waivers','insurance_certificates',
        'w9_requests','owner_approvals','preliminary_notices',
        'plans','subscriptions','project_documents',
      ];

      for (const table of tables) {
        const { error: tErr } = await supabase.from(table).select('id').limit(1);
        check(`Table: ${table}`, !tErr);
      }

      // Check storage buckets
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketNames = (buckets ?? []).map(b => b.name);
      check('Storage bucket: documents', bucketNames.includes('documents'));
      check('Storage bucket: blueprints', bucketNames.includes('blueprints'));
    } else {
      check('Supabase credentials set', false);
    }
  } catch (e) {
    check('Supabase connection', false);
    console.log(`    Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Anthropic API ───────────────────────────────────────────
  console.log('\n🤖 Anthropic / Claude API\n');
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say: OK' }],
      });
      check('Claude API reachable', msg.content.length > 0);
      check('Using claude-opus-4-6', msg.model === 'claude-opus-4-6');
    } else {
      check('Anthropic API key set', false);
    }
  } catch (e) {
    check('Claude API reachable', false);
    console.log(`    Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Resend Email ────────────────────────────────────────────
  console.log('\n📧 Resend Email Service\n');
  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.domains.list();
      check('Resend API key valid', !error);
      check('Resend verified domain', (data?.data?.length ?? 0) > 0, false);
    } else {
      check('Resend API key set', false);
    }
  } catch (e) {
    check('Resend reachable', false);
    console.log(`    Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Stripe ──────────────────────────────────────────────────
  console.log('\n💳 Stripe Billing\n');
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
      const account = await stripe.accounts.retrieve();
      check('Stripe API key valid', !!account.id);
      check('Stripe charges enabled', account.charges_enabled ?? false, false);

      // Check Stripe prices are configured
      const { data: prices } = await stripe.prices.list({ limit: 10, active: true });
      check('Stripe prices configured', prices.length > 0, false);
      check('Webhook secret set', !!process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      check('Stripe secret key set', false);
    }
  } catch (e) {
    check('Stripe connection', false);
    console.log(`    Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Puppeteer ───────────────────────────────────────────────
  console.log('\n📄 Puppeteer PDF Generation\n');
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox'] });
    const page    = await browser.newPage();
    await page.setContent('<html><body><h1>Test</h1></body></html>');
    const pdf = await page.pdf({ format: 'Letter' });
    await browser.close();
    check('Puppeteer launches', true);
    check('PDF generation works', pdf.length > 0);
  } catch (e) {
    check('Puppeteer PDF generation', false);
    console.log(`    Error: ${e instanceof Error ? e.message : String(e)}`);
    console.log('    Fix: npm install puppeteer && npx puppeteer browsers install chrome');
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log('\n' + '='.repeat(55));
  if (exitCode === 0) {
    console.log('\n✅ ALL CHECKS PASSED — Ready for production deployment\n');
  } else {
    console.log('\n❌ CHECKS FAILED — Fix issues above before deploying\n');
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Verification script error:', err);
  process.exit(1);
});
