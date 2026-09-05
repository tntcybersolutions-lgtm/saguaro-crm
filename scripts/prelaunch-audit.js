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
  ].join('|'),
);

// Global tables that are not tenant-scoped.
const GLOBAL_TABLE = /^(tenants|profiles|users|subscriptions|plans|states|state_.*|lien_waiver_templates|auth\.|storage\.)$/;

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
    const guarded = /getUser\s*\(/.test(src) || /requireAuth\s*\(/.test(src);
    if (handlers && !guarded && !isPublic) {
      add("P0", "unauthenticated-route", f, 1, `${handlers} handler(s), no getUser() guard`);
    }

    if (!isPublic) {
      for (const m of src.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g)) {
        const table = m[1];
        if (GLOBAL_TABLE.test(table)) continue;
        const stmt = statementAt(src, m.index);
        if (/tenant_id/.test(stmt)) continue;

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
    for (const m of src.matchAll(/(background|backgroundColor)\s*:\s*['"`](#fff(fff)?|white|#FAFBFC|#F8F9FA)['"`]/gi))
      add("P2", "light-theme-leak", f, lineOf(src, m.index), m[0].slice(0, 46));
    for (const m of src.matchAll(/className=["'][^"']*\bbg-white\b/g))
      add("P2", "light-theme-leak", f, lineOf(src, m.index), "bg-white class");
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
