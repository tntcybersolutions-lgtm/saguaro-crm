# Full Audit & Enhancement Plan — Saguaro CRM

## ✅ COMPLETED: Runtime Error Fix
- **File**: `app/app/projects/[projectId]/invoices/page.tsx`
- **Issue**: Missing React fragment wrapper around `<table>` + `{menuId && ...}` overlay div inside ternary expression — caused TS1005 "`)` expected" compile error and runtime crash
- **Fix**: Wrapped both elements in `<>...</>` fragment

## ✅ COMPLETED: TypeScript Full Check
- Ran `npx tsc --noEmit` — **zero errors** after the invoices fix

---

## Phase 1: Performance — Fix Slow Button Response

### Problem Analysis
1. **App layout makes 3 sequential fetch calls on every mount** (`/api/auth/me`, `/api/projects`, `/api/auth/refresh`) — these block rendering
2. **Dashboard makes 4 parallel SWR calls** with aggressive refresh intervals (15s stats, 30s projects, 30s RFIs, 60s today) — causes constant re-renders
3. **No `loading.tsx` files exist** — Next.js can't show instant loading skeletons during route transitions, so every navigation feels frozen
4. **SWR refreshInterval on dashboard stats is 15 seconds** — too aggressive, causes frequent re-renders
5. **Realtime subscriptions on dashboard** subscribe to 5 tables simultaneously — redundant with SWR polling

### Fixes
1. **Add `loading.tsx` files** for key routes:
   - `app/app/loading.tsx` — skeleton for main app shell
   - `app/app/projects/[projectId]/loading.tsx` — skeleton for project pages
   - `app/field/loading.tsx` — skeleton for field app

2. **Optimize SWR intervals**:
   - Dashboard stats: 15s → 60s (realtime covers urgent changes)
   - Projects list: 30s → 60s
   - RFIs: 30s → 60s
   - Today items: keep 60s

3. **Deduplicate layout fetches**:
   - The layout fetches `/api/auth/me` and `/api/auth/refresh` separately — merge into one call
   - Move project list fetch from layout into a shared SWR hook (already exists in `useProjects`)

---

## Phase 2: Auth/Login Enhancement

### Current State
- Basic login form with inline styles
- Uses `autoComplete="email"` and `autoComplete="current-password"` (good — browser autofill already works)
- No "Remember me" checkbox
- No show/hide password toggle
- No password strength indicator on signup
- Form has no animation/polish

### Enhancements
1. **Add "Remember me" checkbox** — when checked, extends cookie maxAge from session to 30 days
2. **Add show/hide password toggle** — eye icon button
3. **Add smooth focus animations** — gold border glow on focus
4. **Add keyboard Enter shortcut indicator** — "Press Enter to sign in"
5. **Add proper `name` attributes** on inputs — ensures browser password managers detect and save credentials correctly
6. **Add `autocomplete` attributes** properly — `username` on email, `current-password` on password
7. **Add a subtle loading spinner** on the sign-in button instead of just text change

---

## Phase 3: Remaining Fixes

1. **Add ErrorBoundary** wrapping in app layout — the component exists but isn't used anywhere
2. **Close dropdown menus on outside click** — the invoices page has this but verify other money pages do too
3. **Add `key` prop fix** — verify no React key warnings in lists

---

## Files to Modify
1. `app/app/projects/[projectId]/invoices/page.tsx` — ✅ DONE
2. `app/login/page.tsx` — auth enhancement
3. `lib/hooks/useDashboard.ts` — SWR interval optimization
4. `app/app/loading.tsx` — NEW file
5. `app/app/projects/[projectId]/loading.tsx` — NEW file
6. `app/field/loading.tsx` — NEW file
7. `app/app/layout.tsx` — add ErrorBoundary, optimize fetches
