# SAGUARO CRM -- ENGINEERING STANDING ORDERS

These directives are mandatory for every Claude Code session operating on this codebase.
Violation of any rule below is a production-level defect. No exceptions.

---

## 0. STANDING ORDERS

Read this before anything else. It outranks every section below it.

### SESSION START — MANDATORY, AUTOMATIC, NO PROMPT NEEDED

The FIRST thing you do in EVERY session, before asking the user anything and
without being told to, is:

1. Read `docs/SESSION-PLAYBOOK.md` in full. It is ground truth: the right repo,
   that the DB is the Supabase MCP (`jddfvugsaosvgllbkzch`), that egress to the
   live site is blocked BY DESIGN (never curl it, never call that a failure),
   the `DELETE`-via-SELECT-CTE workaround, and that push = a branch → the Vercel
   preview is the build check. Obey it. You are FORBIDDEN from telling the user
   "I can't see it / I can't connect / I can't push" — the playbook already
   answers each; follow it instead.
2. Open `docs/MUST-PASS.md` and select your path for this session: the FIRST
   path, top to bottom, whose `STATUS:` line is not `PASS`. That is the one you
   work. Do not ask which path. Do not reorder. Do not skip ahead.
3. Run the playbook loop on that one path, then report and STOP (one path per
   session, per below).

The user never has to paste instructions. If `docs/SESSION-PLAYBOOK.md` is
missing, that is the only thing you stop and report. Otherwise: read, select,
run.

### IF YOU CAN REACH THE RUNNING APP — a LOCAL session with a browser or the iOS Simulator

Cloud sessions CANNOT reach the live app (egress is blocked by design), so the
on-device QA is yours and yours alone. If this session has a browser,
Playwright, or Xcode, your session-start job is the **iOS QA loop**, not a
MUST-PASS path — the user should never have to drive it by hand:

1. Read `docs/IOS-DEVICE-QA.md` and run it end to end against the app: Chrome
   with iPhone-15 device emulation at https://saguarocontrol.net signed in, or
   the iOS Simulator (`npm run cap:build:ios`) for camera/GPS. Sign-in from env
   (`E2E_EMAIL` / `E2E_PASSWORD`) — never hardcode, never commit creds.
2. Tap EVERY button, link, tab and row. Create a record → save → reopen it →
   confirm every field persisted and pre-filled and that relationships updated
   (won deal → job, stage move → card moves). Ask at each screen whether a
   first-time user would know what to do.
3. Write EVERY defect into `docs/IOS-FLOW-AUDIT.md` using its Findings template
   (screen, steps, expected, actual, severity, screenshot), then commit, push a
   branch, and open a PR. The pushed findings ARE the deliverable.

You FIND on the device; the cloud session FIXES in the code. Do not stop after
one screen — walk the whole script. This block outranks the MUST-PASS selection
above whenever you can actually reach the app.

I am the engineer. I own getting Saguaro to 100% working, not to "built".

DONE means a path in `docs/MUST-PASS.md` has been driven end to end
against a running build as a real signed-in user, with the output
pasted. Code that compiles is not done. A passing audit script is
not done.

ONE PATH PER SESSION. Report and stop. Never begin a second path.

Anything I find off-path goes in `docs/FOUND.md` and I DO NOT FIX IT.

I never write PASS for something I did not drive. If I cannot verify
it, I say CANNOT VERIFY and why.

I tell Chad when he is about to spend money badly: a session running
too long, a second project in the same session, work that belongs in
a cheaper run.

### Why this section exists

The product reached 223+ pages carrying a large inventory of features that
had never run once. The dashboard's action list had never rendered a single
item (the route returned `actions`, the hook read `items`). The web time clock
never wrote a row. Lien-waiver auto-generation never inserted a row — the
insert named a column that does not exist, inside a bare `catch {}`. Each was
shipped, believed finished, and silently dead.

None of that was a coding failure. It was a definition-of-done failure: breadth
was built and the paths were never walked. §0 is the correction, and it is why
"log it, don't fix it" in §5 now overrides the instinct to clean up what you
pass on the way. Every detour is individually defensible; the sum of them is
why a year did not converge.

### ONE APP — iOS IS THE WEB APP. NEVER A SECOND CODEBASE.

iOS and desktop are the same product on the same database for the same users,
so they are the same code. The iPhone app is this repo's Capacitor shell
(`capacitor.config.ts`, `ios/`) in server mode, loading
`https://www.saguarocontrol.net/app` under the existing TestFlight bundle id
`net.saguarocontrol.field`. Every web deploy is the iOS update.

- Build every phone screen HERE, as the responsive web app. Never in
  `D:/Saguaro-Field`, `saguaro-mobile`, Expo/React Native, or any other repo —
  those are retired; the iPhone drifted to a different app once because of them.
- Never point the shell at a bundled copy, a `*.vercel.app` alias or another
  domain. `tools/check-ios-mirror.mjs` fails the iOS CI job if the bundle id,
  the live URL or server mode changes.
- Native-only work (plugins, permissions, icons, signing) stays in `ios/` and
  `.github/workflows/ios.yml`, and ships to TestFlight from that workflow.

---

## IDENTITY

- **Application**: Saguaro CRM -- construction management platform with mobile field app
- **Stack**: Next.js 14 App Router, TypeScript strict, Supabase (PostgreSQL), Vercel
- **Supabase Project**: `jddfvugsaosvgllbkzch` (us-east-1, ACTIVE_HEALTHY)
- **Pages**: 223+ (as of 2026-04-11)
- **Theme**: Dark only. No light mode. No white card backgrounds.

---

## 1. EXECUTION PROTOCOL

You are an engineer, not an assistant. You write code, run commands, verify results.

- Do not explain what you are about to do before doing it.
- Do not summarize what you just did after doing it.
- Do not ask permission to continue between steps.
- Execute. Verify. Execute again.
- Show raw terminal output as proof, not prose descriptions.

---

## 2. VERIFICATION LOOP (MANDATORY)

After **every file** you create or modify, run this exact sequence:

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | grep -E "Compiled|error|Error" | head -5
```

- If either command shows new errors introduced by your code: **STOP**.
- Fix the error. Re-run both commands. Confirm clean output.
- Only then proceed to the next file.
- Pre-existing errors in files you did not touch are noted but not blocking.
- Skipping this loop invalidates all subsequent work in the session.

---

## 3. AUTH & DATA ISOLATION PATTERN

Every server-side API route uses this exact pattern. No variations.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('table_name')
      .select('*')
      .eq('tenant_id', user.tenantId)  // MANDATORY on every query
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    // Logs the real error with a correlation id; returns a message safe to show.
    return apiError('table_name', e);
  }
}
```

### getUser() returns:
```typescript
{ id: string; tenantId: string; email: string } | null
```

### Rules:
- `getUser(req)` called **before** any database operation. No exceptions.
- `user.tenantId` used in `.eq('tenant_id', user.tenantId)` on **every** Supabase query.
- `tenant_id` is never taken from the request body. Always from the authenticated user.
- The only exception to auth: token-based public endpoints (e.g., `/api/network/connect/[token]`) which use the service role client and validate via the token itself.

### HTTP Status Codes:
| Code | When |
|------|------|
| 400 | Missing required field -- name the field in the error message |
| 401 | No user / invalid token |
| 403 | User lacks role permission |
| 404 | Record not found |
| 409 | Duplicate / conflict -- include the conflicting record |
| 500 | Catch block -- `return apiError('scope', e)`. NEVER `e.message` |

### Forbidden Patterns:
- `catch {}` or `catch { /* handle */ }` -- empty catches are bugs
- `{ error: e.message }` in any response. A Postgres error names the table, the
  column and the constraint -- that is a schema map for anyone poking the API.
  Use `apiError()` from `lib/api-error.ts`: it logs the real error server-side
  with a short correlation id and returns a message written for a GC. The id
  comes back as `ref`, so support can find the exact failure in the logs.
  Our OWN error classes (UnsupportedImageError, ReportRunError) may return
  their message -- those are our words, not the database's.
- `return NextResponse.json([])` inside a catch block -- masks errors as success
- Hardcoded UUIDs anywhere in the codebase
- `req.body.tenant_id` -- tenant_id must come from getUser()

---

## 4. DESIGN SYSTEM (navy / slate) — DARK ONLY

`DESIGN_SYSTEM.md` is the rule for colour, type, spacing, depth and components;
`SITE_UPDATE_PLAN.md` is the platform-wide work plan and status;
`QA_CHECKLIST.md` is the per-route verification record. Read them before any UI
change and keep them current.

- Colours come only from the `app/globals.css` tokens (`--bg-base` #101722,
  `--bg-surface` #1B2636, `--bg-surface-2` #243247, `--border-default` #334155,
  `--text-primary/secondary/tertiary`, `--brand-primary` #FFE000, `--link`
  #38BDF8, `--success/--warning/--danger`). No new hex in pages.
- Yellow = the one primary action and the selected item. Never numbers, labels,
  icons, borders or tints.
- Text floor 12px (captions); labels 13; body 14; inputs 16 on phones.
- Fix the shared source (token, kit/premium component, layout), then every
  consumer. No per-page copies, no CSS override layers.

### Banned in dark-themed pages:
- `#ffffff`, `#fff`, `bg-white`, `background: white`
- `#FAFBFC`, `#F8F9FA`, `#E2E5EA` -- light mode grays
- Any `background-color` value with lightness > 30%

### Legitimate exceptions (white allowed):
- QR code canvases (white background for contrast)
- Customer-facing portals: `/portals/`, `/sign/`, `/w9/`
- Print/PDF generation layouts
- Canvas fill for signature pads
- SVG icon fill/stroke colors

---

## 5. ZERO TOLERANCE RULES

Every item below is a bug. Not a polish item. Not tech debt. A bug.

| Rule | How to detect |
|------|--------------|
| Zero TypeScript errors from your code | `npx tsc --noEmit` |
| Zero "Coming Soon" in visible UI | `grep -rn "Coming Soon" app/ --include="*.tsx"` |
| Zero TODO/FIXME in visible UI text | `grep -rn "TODO\|FIXME" app/ --include="*.tsx"` |
| Zero empty catch blocks | `grep -rn "catch" app/api/ -A2 \| grep "{}"` |
| Zero raw error text in responses | `grep -rnE "error:\s*(e\|err\|error)\??\.message" app/api --include=route.ts` |
| Zero routes without auth guard | Manual review of every route file |
| Zero queries without tenant_id filter | `grep -rn "\.from(" app/api/ -A5 \| grep -v tenant_id` |
| Zero white backgrounds in dark pages | `grep -rn "#ffffff\|bg-white" app/app/ app/field/` |
| Zero dead href links | Verify every Link href resolves to an existing page.tsx |
| Zero form fields mismatched with API | Compare client form keys to API insert/update columns |
| Zero hardcoded UUIDs | `grep -rn "[0-9a-f]\{8\}-[0-9a-f]\{4\}" app/ --include="*.ts"` |

If you discover any violation while working on something else: **log it in
`docs/FOUND.md` with the file and line number, and do NOT fix it.** It is not
your path. Fixing it is what turns a one-path session into a four-hour sprawl —
see §0.

---

## 6. DEFINITION OF DONE

A task is not complete until every checkpoint has **raw terminal proof** attached.

- `wc -l` for line count requirements
- `grep -n` for feature verification (function names, imports, patterns)
- `npx tsc --noEmit` output showing 0 new errors
- `npm run build` output showing "Compiled successfully"
- SQL `SELECT` output confirming table/column existence

"I built it" is not proof. Terminal output is proof.

---

## 7. MOBILE FIELD APP CONSTRAINTS

All pages under `/field/` must be mobile-first:

- All touch targets: minimum 44px height (Apple HIG)
- All text inputs: minimum `fontSize: 16` (prevents iOS zoom on focus)
- No horizontal overflow on any viewport width down to 320px
- `max-width: 480px` with `margin: 0 auto` for content centering
- Viewport safe areas respected for notch/home indicator devices
- Offline queue: IndexedDB-based, syncs when connectivity returns

---

## 8. KEY FILE LOCATIONS

| Purpose | Path |
|---------|------|
| Supabase server helpers | `lib/supabase-server.ts` |
| Field design tokens | `lib/field-tokens.ts` |
| Desktop design tokens | `lib/design-tokens.ts` |
| App sidebar navigation | `components/AppSidebar.tsx` |
| App shell layout | `app/app/layout.tsx` |
| Field More page (quick links) | `app/field/more/page.tsx` |
| Sage AI system prompts | `lib/sage-prompts-v6.ts` |
| Sage chat route | `app/api/sage/chat/route.ts` |
| Offline sync queue | `lib/offline-queue.ts` |
| Notification system | `app/api/notifications/route.ts` |

---

## 9. DATABASE CONVENTIONS

- All tables have: `id UUID PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`
- Most tables have: `created_by UUID REFERENCES auth.users(id)`, `updated_at TIMESTAMPTZ`
- Soft delete preferred: `is_active BOOLEAN DEFAULT true` or `status TEXT`
- Column names: snake_case. No camelCase in the database.
- When creating new tables: `CREATE TABLE IF NOT EXISTS` to be idempotent
- When adding columns: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Always verify table exists after creation with `SELECT table_name FROM information_schema.tables`

---

## 10. NEXT.JS 14 APP ROUTER RULES

- Dynamic route params are async in Next.js 14: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params;`
- `useSearchParams()` requires Suspense boundary in client components
- Server components cannot use hooks. Client components need `'use client'` directive.
- API routes export named functions: `GET`, `POST`, `PUT`, `DELETE`
- Supabase `.then().catch()` chains on insert/update builders don't compile. Use `.then(() => {}, () => {})` pattern instead.

---

## 11. WHEN TO USE WHAT

| Task | Tool |
|------|------|
| Create new DB table | `mcp__b7dbd50f...execute_sql` with Supabase project ID |
| Check table schema | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'X'` |
| Verify table exists | `SELECT table_name FROM information_schema.tables WHERE table_name = 'X'` |
| QR code generation | `import('qrcode').then(QRCode => QRCode.toCanvas(...))` (dynamic import for client) |
| File download | `new Blob([content]) -> URL.createObjectURL -> anchor.click()` |
| Deep links | iOS WiFi: `App-prefs:root=WIFI`, Android: intent URI |

---

## 12. EXISTING INFRASTRUCTURE (DO NOT REBUILD)

These systems exist and work. Use them, don't recreate them:

- **Auth**: `getUser()` from `@/lib/supabase-server` -- handles JWT, cookies, refresh
- **Notifications**: `POST /api/notifications` with `{ type, title, body, link, user_id }`
- **Field tokens**: `F` object from `@/lib/field-tokens` -- all colors, radii, shadows
- **Sage AI**: System prompt in `lib/sage-prompts-v6.ts`, chat route at `/api/sage/chat`
- **Offline queue**: `lib/offline-queue.ts` with IndexedDB, retry backoff, dead queue
- **Photo upload**: `POST /api/photos/create` with Supabase Storage bucket

---

## 13. SESSION SCOPE RULES

- One directive per session. Do not combine directives.
- Read the target files before writing. Understand what exists before proposing changes.
- If a file already implements 80%+ of what's needed, enhance it. Don't rewrite from scratch.
- If you find a bug in adjacent code while working, fix it and note it.
- Do not stop between features within a directive. Build everything, then verify everything.
- Do not create README.md, docs/, or documentation files unless explicitly requested.
