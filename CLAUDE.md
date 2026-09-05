# SAGUARO CRM -- ENGINEERING STANDING ORDERS

These directives are mandatory for every Claude Code session operating on this codebase.
Violation of any rule below is a production-level defect. No exceptions.

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

- If either command shows **any** error: **STOP**.
- Fix the error. Re-run both commands. Confirm clean output.
- Only then proceed to the next file.
- Skipping this loop invalidates all subsequent work in the session.

### 2.1 FIX EVERY ERROR YOU SEE — YOURS OR NOT (MANDATORY)

There is no such thing as "a pre-existing error, not blocking." If `tsc`, the
build, the console, or a test surfaces an error during your session, **you fix
it in that same pass**. You do not note it and move on. You do not leave it for
later. You do not file it as tech debt.

- Errors in files you did not touch: **fix them**.
- Errors that predate your session by months: **fix them**.
- Errors that look unrelated to your directive: **fix them**.
- If a fix is genuinely out of scope, it is still fixed first, then flagged in
  your final message — never left in the tree.

A session that ends with a known error still in the app is a failed session,
regardless of what else got built. `npx tsc --noEmit` and `npm run build` must
both come back clean before you report done.

Corollary: a broken build outranks every feature directive. If you discover the
app does not build, stop the directive, fix the build, then resume.

### 2.2 NO STUBS. EVER. (MANDATORY)

Everything you create is finished on the first pass. The user should never have
to ask twice for the same thing to be completed.

Banned outright:
- Placeholder components that render a title and nothing else
- Functions that `return null`, `return []`, or `return {}` to satisfy a type
- `// implement later`, `// wire this up`, `// placeholder`, `throw new Error('not implemented')`
- Buttons with no handler, forms with no submit, tabs with no panel
- An icon/text/token map covering only the two names you happened to need
- Copying a design token file and filling half the values

If a component takes props, every prop works. If a page has five tabs, all five
render real data. If a helper is exported, it is complete for its whole input
domain, not just the current caller. If you cannot finish something in this pass,
you do not create it at all — you say so in your final message instead.

When you fix a list of defects, work the list **in order, all the way down**.
Do not stop after the first item and report back for permission to continue.

---

## 3. AUTH & DATA ISOLATION PATTERN

Every server-side API route uses this exact pattern. No variations.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
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
| 500 | Catch block -- include `e.message` |

### Forbidden Patterns:
- `catch {}` or `catch { /* handle */ }` -- empty catches are bugs
- `return NextResponse.json([])` inside a catch block -- masks errors as success
- Hardcoded UUIDs anywhere in the codebase
- `req.body.tenant_id` -- tenant_id must come from getUser()

---

## 4. DARK THEME ENFORCEMENT

All pages in `/app/` and `/field/` use the dark theme. No exceptions.

### Design Tokens (field pages):
```typescript
import { F } from '@/lib/field-tokens';
// F.dark = '#0d1117'      -- page background
// F.raised = '#0D1D2E'    -- cards, panels
// F.card = 'rgba(13,29,46,.85)' -- glass card overlay
// F.border = '#1E3A5F'    -- primary border
// F.text = '#F0F4FF'      -- primary text
// F.dim = '#8BAAC8'       -- secondary text
// F.gold = '#C8960F'      -- brand accent
// F.green = '#22C55E'     -- success
// F.red = '#EF4444'       -- error/destructive
// F.blue = '#3B82F6'      -- info/links
// F.amber = '#F59E0B'     -- warning
```

### Desktop app pages (when not using F tokens):
```typescript
const BASE = '#0d1117';
const CARD = '#161b22';
const BORDER = '#30363d';  // or '#1E3A5F' for navy variant
const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
```

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
| Zero routes without auth guard | Manual review of every route file |
| Zero queries without tenant_id filter | `grep -rn "\.from(" app/api/ -A5 \| grep -v tenant_id` |
| Zero white backgrounds in dark pages | `grep -rn "#ffffff\|bg-white" app/app/ app/field/` |
| Zero dead href links | Verify every Link href resolves to an existing page.tsx |
| Zero form fields mismatched with API | Compare client form keys to API insert/update columns |
| Zero hardcoded UUIDs | `grep -rn "[0-9a-f]\{8\}-[0-9a-f]\{4\}" app/ --include="*.ts"` |

If you discover any violation while working on something else: fix it, log it, continue.

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
