/* Puts an auth guard on the Stripe billing handlers.
 *
 *   node scripts/fix-billing-auth.js
 *
 * Every handler except the webhook took tenantId straight from the request
 * body or query string with no authentication at all, so any caller could:
 *   cancelHandler          cancel any tenant's subscription
 *   changePlanHandler      change any tenant's plan
 *   billingPortalHandler   open a Stripe portal session for any tenant, which
 *                          exposes their payment methods and invoice history
 *   getSubscriptionHandler read any tenant's subscription
 *   createCheckoutHandler  start a checkout against any tenant
 *
 * webhookHandler stays public on purpose — it verifies the Stripe signature
 * with s.webhooks.constructEvent, which is the correct guard for that one.
 */

const fs = require('fs');

const FILE = 'stripe-billing.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// This file is CRLF. Every pattern below is written with \n and normalised to
// whatever the file actually uses — a bare \n matches nothing here, and does so
// silently, which reads as "already clean" rather than as a failure.
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const nl = (t) => t.split('\n').join(EOL);

const edits = [];

// 1. import the auth helper
if (!s.includes("from './lib/supabase-server'")) {
  edits.push([
    "import { supabaseAdmin } from './supabase/admin';",
    "import { supabaseAdmin } from './supabase/admin';\nimport { getUser } from './lib/supabase-server';",
    'import getUser',
  ]);
}

// 2. shared guard, next to the other response helpers
if (!s.includes('async function requireTenant')) {
  edits.push([
    "function err(msg: string, status = 400) {\n  return NextResponse.json({ error: msg }, { status });\n}",
    "function err(msg: string, status = 400) {\n" +
    "  return NextResponse.json({ error: msg }, { status });\n" +
    "}\n" +
    "\n" +
    "/**\n" +
    " * Resolves the caller's tenant from their session.\n" +
    " *\n" +
    " * These handlers previously read tenantId out of the request body or query\n" +
    " * string with no authentication, so anyone could act on anyone's billing.\n" +
    " * The webhook is the one legitimate exception and does not use this.\n" +
    " */\n" +
    "async function requireTenant(request: NextRequest): Promise<string | NextResponse> {\n" +
    "  const user = await getUser(request);\n" +
    "  if (!user) return err('Unauthorized', 401);\n" +
    "  return user.tenantId;\n" +
    "}",
    'requireTenant() helper',
  ]);
}

const GUARD =
  "  const tenant = await requireTenant(request);\n" +
  "  if (typeof tenant !== 'string') return tenant;\n";

// 3. each handler takes the tenant from the session instead of the request
edits.push(
  [
    "  const tenantId = String(body.tenantId ?? '');\n",
    GUARD + "  const tenantId = tenant;\n",
    'createCheckoutHandler',
  ],
  [
    "  const tenantId = String(body?.tenantId ?? '');\n  if (!tenantId) return err('tenantId required');\n",
    GUARD + "  const tenantId = tenant;\n",
    'billingPortalHandler / cancelHandler',
  ],
  [
    "  const tenantId    = String(body?.tenantId    ?? '');\n",
    GUARD + "  const tenantId    = tenant;\n",
    'changePlanHandler',
  ],
  [
    "  const tenantId = request.nextUrl.searchParams.get('tenantId');\n  if (!tenantId) return err('tenantId required');\n",
    GUARD + "  const tenantId = tenant;\n",
    'getSubscriptionHandler',
  ],
  // 4. the surviving !tenantId checks are dead once the guard has returned
  [
    "if (!tenantId || !newPlanId) return err('tenantId and newPlanId are required');",
    "if (!newPlanId) return err('newPlanId is required');",
    'changePlanHandler dead guard',
  ],
  [
    "if (!planId || !tenantId || !email) {\n    return err('planId, tenantId, and email are required');",
    "if (!planId || !email) {\n    return err('planId and email are required');",
    'createCheckoutHandler dead guard',
  ],
);

let applied = 0;
let missed = 0;
for (const [rawFind, rawRepl, label] of edits) {
  const find = nl(rawFind);
  const repl = nl(rawRepl);
  const n = s.split(find).length - 1;
  if (n === 0) { missed++; console.log(`  MISS  ${label}`); continue; }
  s = s.split(find).join(repl);
  applied += n;
  console.log(`  ${n}x    ${label}`);
}

if (missed) {
  console.error(`\n${missed} edit(s) did not match — not writing. Fix the patterns first.`);
  process.exit(1);
}
if (s === before) { console.log('\nno changes'); process.exit(1); }

fs.writeFileSync(FILE, s);
console.log(`\n${applied} edit(s) written to ${FILE}`);
console.log('webhookHandler left public — it verifies the Stripe signature');
