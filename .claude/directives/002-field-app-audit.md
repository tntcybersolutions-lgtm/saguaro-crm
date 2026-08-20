# DIRECTIVE 002 -- COMPLETE FIELD APP PRODUCTION AUDIT

**PRIORITY**: P0 -- PRE-LAUNCH VERIFICATION
**SCOPE**: Every page under `/field/` and `/app/projects/`
**STANDING ORDERS**: CLAUDE.md applies in full

---

## PROBLEM STATEMENT

Production deployment requires every page to render, every form to save,
every button to execute, every API call to hit a real endpoint.
No blank screens. No silent failures. No dead links. Binary PASS/FAIL per page.

---

## PHASE 0 -- COMPLETE INVENTORY

```bash
# Total page count
find app/field/ -name "page.tsx" | sort | wc -l
find app/field/ -name "page.tsx" | sort

# Project-scoped pages
find app/app/projects/ -name "page.tsx" | sort

# Current errors
npx tsc --noEmit 2>&1
npm run build 2>&1 | tail -5

# Stubs and placeholders in visible UI
grep -rn "Coming Soon\|coming soon\|TODO\|FIXME\|not implemented\|placeholder.*feature" \
  app/field/ app/app/ --include="*.tsx" \
  | grep -v "node_modules\|//.*$\|input.*placeholder\|aria-placeholder" | head -40
```

Show every line. This is the complete work list.

---

## PHASE 1 -- PAGE-BY-PAGE AUDIT

Open **every** page file. For each page, verify and fix:

### Data Fetching
- [ ] `fetch()` or `useEffect()` calls a real API endpoint that exists under `app/api/`
- [ ] Fetch includes authentication headers (session cookie propagated automatically in Next.js)
- [ ] Loading state renders while fetch is in-flight (spinner or skeleton, not blank)
- [ ] Error state renders on fetch failure (error message, not blank screen or console-only error)
- [ ] Empty state renders when API returns 0 records (icon + message, not blank)

### Forms
- [ ] Every `<input name="X">` or form state key matches the API route's expected column name
- [ ] Required fields validated client-side before submission (disabled button or inline error)
- [ ] Submit button shows loading state and is disabled during in-flight request
- [ ] Success confirmation renders after successful submit (toast, banner, or redirect)
- [ ] Error message renders if submit returns 4xx/5xx (not swallowed silently)
- [ ] Double-submit prevented (button disabled, no duplicate POST)

### Buttons and Actions
- [ ] Every `onClick` handler executes real logic (not `console.log` or `() => {}`)
- [ ] Destructive actions (delete, remove, revoke) have a `confirm()` dialog first
- [ ] No `href="#"` on elements that should do something

### Navigation
- [ ] Back/close returns to the correct previous page
- [ ] All `Link href` values point to pages that exist (`app/[path]/page.tsx` file exists)
- [ ] No broken dynamic routes (params match route segment names)

### Mobile Compliance
- [ ] All `<input>` and `<textarea>` elements: `fontSize >= 16` (prevents iOS auto-zoom)
- [ ] All buttons and interactive elements: `minHeight >= 44px` (Apple HIG)
- [ ] No horizontal overflow on 320px viewport width
- [ ] Content does not extend behind bottom navigation bar
- [ ] `touchAction: 'none'` on any canvas elements that handle touch events

### Output format per page:
```
PAGE: /field/daily-log (app/field/daily-log/page.tsx)
  LINES: 847
  [PASS] Loading state: spinner at line 142
  [PASS] Error state: error card at line 156
  [FAIL] Submit button not disabled during request -- FIXED: added saving state
  [PASS] All 14 form fields match API POST /api/daily-logs schema
  [PASS] Empty state: "No logs for this date" message
  STATUS: PASS (after fix)
```

---

## PHASE 2 -- DEAD LINK DETECTION

```bash
# Extract every internal href in the field app
grep -rn 'href="/field/' app/ --include="*.tsx" \
  | grep -v node_modules \
  | sed 's/.*href="\([^"]*\)".*/\1/' \
  | sed 's/?.*//' \
  | sort -u

# Extract every internal href in the desktop app
grep -rn 'href="/app/' app/ --include="*.tsx" \
  | grep -v node_modules \
  | sed 's/.*href="\([^"]*\)".*/\1/' \
  | sed 's/?.*//' \
  | sort -u
```

For each extracted path, verify the page file exists:
```bash
# Test each path -- this will print DEAD LINK for any missing page
for path in $(grep -rn 'href="/field/' app/ --include="*.tsx" | grep -v node_modules | sed 's/.*href="\([^"]*\)".*/\1/' | sed 's/?.*//' | sort -u); do
  # Strip dynamic segments for existence check
  clean=$(echo "$path" | sed 's/\[.*\]/[param]/')
  [ -f "app${path}/page.tsx" ] || echo "DEAD LINK: $path"
done
```

Every dead link must be resolved:
- If the page should exist: create a functional page (not a stub)
- If the href is wrong: fix it to point to the correct existing route
- Zero dead links is the requirement

---

## PHASE 3 -- PORTAL VERIFICATION

### Client Portal (`/portals/client/[token]/...`)
- [ ] Token validation rejects expired tokens (redirect to `/portals/expired`)
- [ ] Token validation rejects invalid tokens (same redirect)
- [ ] All sub-pages render without null reference crashes
- [ ] Rate limiting enforced on API calls

### Subcontractor Portal (`/portals/sub/[token]/...`)
- [ ] Token auth validates and extracts vendor context
- [ ] COI upload saves to correct Supabase Storage bucket
- [ ] All sub-pages render with vendor-scoped data

### Owner Portal (`/portals/owner/[token]/...`)
- [ ] G702 pay app renders with real calculation data
- [ ] Approve/reject button writes status change to database
- [ ] PDF download returns `Content-Type: application/pdf`

### W-9 Portal (`/portals/w9/[token]`)
- [ ] TIN/SSN field encrypted before database write
- [ ] Both draw and type signature modes functional
- [ ] PDF generated with all form data populated

### E-Sign Portal (`/sign/[token]`)
- [ ] Canvas signature capture works on touch and mouse
- [ ] IP address + user agent logged on completion
- [ ] Expiry enforced (reject access after expiry date)
- [ ] On complete: source record status updated to 'signed'

---

## PHASE 4 -- OFFLINE SYNC VERIFICATION

Read `lib/offline-queue.ts` and verify each mechanism exists with actual code:

- [ ] Retry backoff schedule: delays increase on failure (show the delay array or formula)
- [ ] Retry counter increments per failed attempt (show the increment code)
- [ ] Dead queue: after max retries, item moves to dead_queue (show the condition + move code)
- [ ] TTL purge: old items cleaned up on init (show the purge logic)
- [ ] Storage guard: checks available quota before enqueue (show the check)
- [ ] File reconstruction: base64 data restored on replay (show the reconstruction code)

---

## PHASE 5 -- FINAL VERIFICATION

```bash
npx tsc --noEmit 2>&1
npm run build 2>&1 | tail -10

# Zero Coming Soon
grep -rn "Coming Soon\|coming soon" app/field/ app/app/ --include="*.tsx" \
  | grep -v "node_modules\|//" | wc -l

# Zero dead links (automated check)
grep -rn 'href="/field/' app/ --include="*.tsx" | grep -v node_modules \
  | sed 's/.*href="\([^"]*\)".*/\1/' | sed 's/?.*//' | sort -u \
  | while read path; do
    [ -f "app${path}/page.tsx" ] || echo "DEAD: $path"
  done

# Page count
find app/field/ -name "page.tsx" | wc -l
find app/app/ -name "page.tsx" | wc -l
```

---

## DEFINITION OF DONE

| # | Checkpoint | Proof Required |
|---|-----------|---------------|
| 1 | All field pages audited with PASS status | Per-page audit log |
| 2 | All desktop project pages audited with PASS status | Per-page audit log |
| 3 | All 5 portals verified functional | Per-portal checklist |
| 4 | Zero dead href links | Dead link check output showing 0 |
| 5 | Zero "Coming Soon" in visible UI | grep output showing 0 |
| 6 | Offline sync mechanisms confirmed with code excerpts | 6 code snippets shown |
| 7 | `npx tsc --noEmit` shows 0 errors | Raw terminal output |
| 8 | `npm run build` shows "Compiled successfully" | Raw terminal output |
