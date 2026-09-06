/* Pre-launch defect sweep. No dependencies — node scripts/prelaunch-audit.js
 *
 * Ranked by what it costs when a GC hits it:
 *
 *   P0  cross-tenant WRITE   update/delete/upsert with no tenant_id in the chain.
 *                            One tenant can mutate another tenant's rows.
 *   P0  unauthenticated      API route with no getUser(), and not a known-public one.
 *   P1  cross-tenant READ    select with no tenant_id in the chain — data leak.
 *   P1  dead link            href with no matching route -> 404.
 *   P1  silent failure       empty catch: the click does nothing and says nothing.
 *   P2  hardcoded UUID / light-theme leak.
 *
 * Accuracy notes: the tenant check reads the whole statement containing .from(),
 * not a fixed character window, so a long chain that filters late still passes.
 * Routes that are public by design (auth, webhooks, cron, [token], portals) are
 * exempt from the auth check — verified against app/api/auth/logout/route.ts,
 * which legitimately has no guard.
 *
 * Usage: node scripts/prelaunch-audit.js [P0|P1|P2] [--json] [--all]
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP  = path.join(ROOT, "app");
const SKIP = /node_modules|\.next|dist-electron|[/\\]out[/\\]|[/\\]android[/\\]|[/\\]ios[/\\]/;

// Public by design. CLAUDE.md §3: "token-based public endpoints which use the
// service role client and validate via the token itself."
//
// The second group was each read by hand on 2026-09-05 and confirmed to gate on
// a token or OAuth state, with every write keyed to the row that token resolved
// to — not to a caller-supplied id:
//   documents/sign/*          .eq('token') -> request.signature_id / request.id
//   unsubscribe               HMAC token carries the email (lib/signed-token)
//   account/delete/confirm    HMAC token carries the email
//   prequal/[id]/submit       token + state
//   integrations/quickbooks   OAuth state + realmId
// Anything added here must be verified the same way, not assumed.
const PUBLIC_ROUTE = new RegExp(
  [
    '[/\\\\]api[/\\\\](auth|webhooks?|cron|public|health|og|stripe|revalidate)[/\\\\]',
    '\\[token\\]',
    '[/\\\\]portals?[/\\\\]',
    '[/\\\\]connect[/\\\\]',
    '[/\\\\]api[/\\\\]documents[/\\\\]sign[/\\\\]',
    '[/\\\\]api[/\\\\]unsubscribe[/\\\\]',
    '[/\\\\]api[/\\\\]account[/\\\\]delete[/\\\\]',
    '[/\\\\]api[/\\\\]prequal[/\\\\]',
    '[/\\\\]api[/\\\\]integrations[/\\\\]quickbooks[/\\\\]',
    // Read on 2026-09-05 and confirmed genuinely public:
    //   leads/[...path]       inbound contact / demo / referral forms
    //   chat/marketing        marketing chatbot
    //   sage/public           public chatbot, capped at 20 messages
    //   network/subnet-calc   pure computation, touches no table
    //   roi/calculate         reads roi_configs, which has no tenant_id column
    //   smart-packages        4 rows, tenant_id NULL — global catalog
    //   discovery/questions   30 rows, tenant_id NULL — global catalog
    //   sandbox/[...path]     trial signup; its lifecycle branch guards itself
    //   design-addon          feature disabled, every method returns 503
    '[/\\\\]api[/\\\\]leads[/\\\\]',
    '[/\\\\]api[/\\\\]chat[/\\\\]marketing[/\\\\]',
    '[/\\\\]api[/\\\\]sage[/\\\\]public[/\\\\]',
    '[/\\\\]api[/\\\\]network[/\\\\]subnet-calc[/\\\\]',
    '[/\\\\]api[/\\\\]roi[/\\\\]',
    '[/\\\\]api[/\\\\]smart-packages[/\\\\]',
    '[/\\\\]api[/\\\\]discovery[/\\\\]',
    '[/\\\\]api[/\\\\]sandbox[/\\\\]',
    '[/\\\\]api[/\\\\]design-addon[/\\\\]',
  ].join('|'),
);

// Global tables that are not tenant-scoped.
const GLOBAL_TABLE = /^(tenants|profiles|users|subscriptions|plans|states|state_.*|lien_waiver_templates|auth\.|storage\.)$/;

// Tables that genuinely have no tenant_id column — verified against
// information_schema, and shared with the codemods so the two cannot drift.
// A child row such as daily_log_crew is reached through its parent, and the
// parent lookup is what carries the tenant filter.
const { NO_TENANT_COLUMN, NOT_IN_DB } = require('./lib/tenant-codemod');

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(APP).concat(walk(path.join(ROOT, "components")));
const rel  = f => path.relative(ROOT, f).split(path.sep).join("/");
const read = f => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const lineOf = (src, i) => src.slice(0, i).split("\n").length;

const findings = [];
const add = (p, cat, file, line, msg) => findings.push({ p, cat, file: rel(file), line, msg });

// Return the full statement starting at idx — scan to the ';' that closes it,
// tracking bracket depth so nested object literals don't end it early.
function statementAt(src, idx) {
  let depth = 0;
  for (let i = idx; i < src.length && i < idx + 4000; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ";" && depth <= 0) return src.slice(idx, i + 1);
    else if (c === "\n" && depth <= 0 && i > idx + 10) {
      const nxt = src.slice(i + 1, i + 60).trim();
      if (!nxt.startsWith(".")) return src.slice(idx, i);   // chain ended without ;
    }
  }
  return src.slice(idx, idx + 4000);
}

// ---------- guard detection ----------
// A guard must be CALLED, not merely mentioned. lib/supabase-server.ts defines
// getUser and lib/auth-helper.ts defines requireAuth, so matching the bare name
// would mark every file that imports a Supabase client as authenticated — a
// false negative that hides exactly the holes this script exists to find.
const hasGuard = (src) =>
  /await\s+getUser\s*\(/.test(src) ||
  /await\s+requireAuth\s*\(/.test(src) ||
  // app/api/[...path] resolves the caller itself via a bearer token
  /await\s+tenantFromToken\s*\(/.test(src) ||
  /await\s+\w+\.auth\.getUser\s*\(/.test(src) ||
  // scheduled jobs authenticate with a shared secret, not a session
  (/CRON_SECRET|SAGUARO_API_SECRET/.test(src) && /401/.test(src));

// Never treat the definition sites as evidence of a guard.
const GUARD_DEFINITION = /[/\\]lib[/\\](supabase-server|auth-helper)(\.tsx?)?$/;

/**
 * True when a module this file imports performs the guard instead. One level
 * deep, local paths only — enough for the dispatcher pattern
 * (app/api/billing/[...path] -> stripe-billing.ts) without walking the graph.
 */
function importsGuard(file, src) {
  const dir = path.dirname(file);
  for (const m of src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+|@\/[^'"]+)['"]/g)) {
    const spec = m[1];
    const base = spec.startsWith('@/')
      ? path.join(ROOT, spec.slice(2))
      : path.resolve(dir, spec);
    if (GUARD_DEFINITION.test(base)) continue;
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const p = base + ext;
      if (!fs.existsSync(p)) continue;
      try {
        if (hasGuard(fs.readFileSync(p, 'utf8'))) return true;
      } catch { /* unreadable module — treat as unguarded */ }
      break;
    }
  }
  return false;
}

// ---------- route table ----------
const routes = new Set();
for (const f of files) {
  const b = path.basename(f);
  if (b !== "page.tsx" && b !== "route.ts") continue;
  let r = "/" + path.relative(APP, path.dirname(f)).split(path.sep).join("/");
  r = r.replace(/\/\([^/]+\)/g, "");
  routes.add(r === "/." || r === "" ? "/" : r);
}
function routeExists(href) {
  if (routes.has(href)) return true;
  const parts = href.split("/").filter(Boolean);
  for (const r of routes) {
    const rp = r.split("/").filter(Boolean);
    if (rp.includes("[...slug]") || r.includes("[...")) {
      if (href.startsWith(r.split("[...")[0])) return true;
      continue;
    }
    if (rp.length !== parts.length) continue;
    if (rp.every((seg, i) => seg.startsWith("[") || seg === parts[i])) return true;
  }
  return false;
}

// ---------- scans ----------
for (const f of files) {
  const src = read(f);
  const isApi     = /[/\\]api[/\\]/.test(f) && path.basename(f) === "route.ts";
  const isDark    = /[/\\]app[/\\](app|field)[/\\]/.test(f);
  const isPortal  = /[/\\](portals?|sign|w9|owner-portal|sub-portal|bid-portal|prequal)[/\\]/.test(f);
  const isPublic  = PUBLIC_ROUTE.test(f);

  if (isApi) {
    const handlers = (src.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g) || []).length;
    // Two valid guards in this codebase: getUser(req) from lib/supabase-server,
    // and requireAuth() from lib/auth-helper (which also resolves tenant_id
    // from profiles and returns a 401 NextResponse the caller returns).
    //
    // Several routes are thin dispatchers that delegate straight to a module —
    // app/api/billing/[...path] -> stripe-billing.ts, for instance — so the
    // guard lives one file away. Follow local imports one level before calling
    // a route unauthenticated.
    const guarded = hasGuard(src) || importsGuard(f, src);

    // A route whose every handler just returns 503 is switched off — the Design
    // Studio group is like this. It holds no data and needs no guard today, but
    // it will need one the moment it is re-enabled. Reported at P2 rather than
    // exempted, so removing the 503 puts it straight back on the P0 list.
    const bodies = src.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g) || [];
    const disabled = bodies.length > 0 &&
      (src.match(/status:\s*503/g) || []).length >= bodies.length;

    if (handlers && !guarded && !isPublic) {
      if (disabled) {
        add("P2", "disabled-route-needs-guard-when-revived", f, 1,
            `${handlers} handler(s) return 503; add a guard before re-enabling`);
      } else {
        add("P0", "unauthenticated-route", f, 1, `${handlers} handler(s), no auth guard`);
      }
    }

    if (!isPublic) {
      for (const m of src.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g)) {
        const table = m[1];
        if (GLOBAL_TABLE.test(table)) continue;
        if (NO_TENANT_COLUMN.has(table)) continue;
        // Absent from the database entirely — a different and worse problem,
        // but not a tenancy one. Reported separately so it is not lost.
        if (NOT_IN_DB.has(table)) {
          add("P1", "table-not-in-database", f, lineOf(src, m.index),
              `${table}: no such table in the public schema`);
          continue;
        }
        // supabase.storage.from('bucket') is object storage, not a table.
        // Buckets are namespaced by object path, so a tenant column does not
        // exist and a filter here would be meaningless.
        if (/\.storage\s*$/.test(src.slice(Math.max(0, m.index - 40), m.index).replace(/\s+$/, ''))) continue;
        const stmt = statementAt(src, m.index);
        if (/tenant_id/.test(stmt)) continue;

        // A query keyed to the caller's own identity is scoped more tightly
        // than a tenant filter would be. app/api/sub-portal/me does this: a
        // subcontractor may work for several general contractors, so their own
        // user id — not a tenant — is the correct key.
        if (/\.eq\(\s*['"`](user_id|created_by|owner_id|auth_user_id)['"`]\s*,\s*user\.id/.test(stmt)) continue;
        if (/\.eq\(\s*['"`]email['"`]\s*,\s*user\.email/.test(stmt)) continue;

        // The payload is often a variable built earlier — e.g.
        //   const inviteRows = subs.map(s => ({ tenant_id: tenantId, ... }));
        //   ...upsert(inviteRows, { onConflict: ... })
        // so tenant_id never appears in the statement itself. Resolve one level
        // by looking at how that identifier was assigned.
        const payloadVar = /\.(insert|upsert|update)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(stmt);
        if (payloadVar) {
          const decl = new RegExp(
            `(?:const|let|var)\\s+${payloadVar[2]}\\b[\\s\\S]{0,1200}?tenant_id`,
          );
          if (decl.test(src)) continue;
        }

        const isWrite = /\.(update|delete|upsert)\s*\(/.test(stmt);
        const isInsert = /\.insert\s*\(/.test(stmt);
        if (isWrite) {
          add("P0", "cross-tenant-write", f, lineOf(src, m.index),
              `${table}: ${(stmt.match(/\.(update|delete|upsert)/) || [""])[0]} with no tenant_id filter`);
        } else if (isInsert) {
          add("P1", "insert-without-tenant", f, lineOf(src, m.index),
              `${table}: insert payload has no tenant_id`);
        } else {
          add("P1", "cross-tenant-read", f, lineOf(src, m.index),
              `${table}: select with no tenant_id filter`);
        }
      }
    }
  }

  for (const m of src.matchAll(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g))
    add("P1", "silent-failure", f, lineOf(src, m.index), "empty catch — failure swallowed");

  for (const m of src.matchAll(/href=["'](\/[^"'`${}\s]*)["']/g)) {
    const href = (m[1].split("?")[0].split("#")[0].replace(/\/$/, "")) || "/";
    if (/\.(pdf|png|jpg|jpeg|svg|ico|xml|txt|webmanifest|json|csv|zip)$/i.test(href)) continue;
    if (href.startsWith("/api/")) continue;
    if (!routeExists(href)) add("P1", "dead-link", f, lineOf(src, m.index), `href="${href}" -> 404`);
  }

  for (const m of src.matchAll(/['"`][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"`]/g)) {
    // BLE GATT service UUIDs are a spec constant, not a tenant id
    if (/0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb/.test(m[0])) continue;
    add("P2", "hardcoded-uuid", f, lineOf(src, m.index), m[0].slice(0, 42));
  }

  if (isDark && !isPortal) {
    // White is correct in several places and flagging them trains people to
    // ignore the report. Verified by reading all 25 hits on 2026-09-05:
    //   toggle knobs   a small absolutely-positioned circle sliding on a
    //                  coloured track — 19 of the 25
    //   QR containers  CLAUDE.md section 4 allows white behind a QR code
    //   PDF iframes    the embedded document renders its own page
    //   print layouts  e.g. the WH-347 Department of Labor payroll form, which
    //                  is shown exactly as it prints and has a window.print()
    const printLayout = /window\.print|@media\s+print|WH-?347/.test(src);

    const legitimate = (idx) => {
      const near = src.slice(Math.max(0, idx - 320), idx + 320);
      // a knob: small fixed box, rounded, positioned over a track
      if (/borderRadius/.test(near) && /position:\s*['"`]absolute/.test(near)
          && /\bwidth:\s*(?:1[0-9]|2[0-9]|3[0-2])\b/.test(near)) return true;
      if (/<canvas|QRCode|qr_data|qrRef|wifi_qr/i.test(near)) return true;
      if (/<iframe/i.test(near)) return true;
      return printLayout;
    };

    for (const m of src.matchAll(/(background|backgroundColor)\s*:\s*['"`](#fff(fff)?|white|#FAFBFC|#F8F9FA)['"`]/gi)) {
      if (legitimate(m.index)) continue;
      add("P2", "light-theme-leak", f, lineOf(src, m.index), m[0].slice(0, 46));
    }
    for (const m of src.matchAll(/className=["'][^"']*\bbg-white\b/g)) {
      if (legitimate(m.index)) continue;
      add("P2", "light-theme-leak", f, lineOf(src, m.index), "bg-white class");
    }
  }
}

// ---------- report ----------
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(findings, null, 2)); process.exit(0);
}
const only = (process.argv.find(a => /^P[012]$/i.test(a)) || "").toUpperCase();
const all  = process.argv.includes("--all");
const shown = only ? findings.filter(f => f.p === only) : findings;

console.log(`scanned ${files.length} files · ${routes.size} routes\n`);
const byCat = {};
for (const f of shown) (byCat[f.p + "  " + f.cat] ||= []).push(f);

for (const key of Object.keys(byCat).sort()) {
  const list = byCat[key];
  console.log(`${key}  (${list.length})`);
  const lim = all ? list.length : 10;
  for (const f of list.slice(0, lim)) console.log(`    ${f.file}:${f.line}  ${f.msg}`);
  if (list.length > lim) console.log(`    ... ${list.length - lim} more (--all to list)`);
  console.log("");
}
const c = p => findings.filter(f => f.p === p).length;
console.log(`TOTAL  P0 ${c("P0")}   P1 ${c("P1")}   P2 ${c("P2")}`);
console.log(`files with a P0: ${new Set(findings.filter(f=>f.p==="P0").map(f=>f.file)).size}`);
