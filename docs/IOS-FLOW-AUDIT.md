# iOS app — real-person flow audit & fix log

The iOS app runs Capacitor in **server mode** (`capacitor.config.ts`): the
native WebView loads the hosted site live, so **the web code IS the iOS screen**
and a web fix lands on the phone with no App Store resubmit. This audit maps
what a real person does, step by step, then records what our code actually does
at each step — confirmed by reading it, not guessed — and the fix status.

Honesty rule for this doc: a line is only marked **FIXED** when the change is on
`main`; everything else is **CONFIRMED BUG** (seen in code) or **NEEDS DEVICE**
(only findable by driving the running app, which this environment cannot do).

---

## Journey A — the salesperson (Rob opens the app to work deals)

| # | What a real person does | What our app does | Status |
|---|---|---|---|
| A1 | Opens the app | Loads `/` = the **marketing homepage** ("Start free trial / Pricing"). Nothing redirects a signed-in user to the product. | **FIXED** (middleware: signed-in `/` → `/app`) |
| A2 | Expects to land on their work | Sales-only reps now route to `/app/sales` at login (P2); others to `/app` | OK |
| A3 | Sees the pipeline / what's late | `/app/sales` shows pipeline + follow-ups + profit + search | OK |
| A4 | Opens a deal | Leads → "Open deal page →" → `/app/leads/[id]` | OK |
| A5 | Moves the deal a stage | Stage button bar (one tap, stamps won/lost) | OK |
| A6 | Logs a call/note | Activity composer | OK |
| A7 | Sends the GC an update | "Send to GC" composer | OK (email send needs RESEND configured) |
| A8 | Attaches a document/photo | Deal "Files & media" (upload/download) | NEEDS DEVICE (byte path) |
| A9 | Wins it → opens the job | "Open the job →" convert | OK |

## Journey B — the field user (crew member on site)

| # | Real person | Our app | Status |
|---|---|---|---|
| B1 | Opens app | same `/` marketing bug as A1 | **FIXED** (A1) |
| B2 | Clocks in | `/app/time` → Clock In | OK (data layer) |
| B3 | Takes a site photo | `/app` photos / project photos | NEEDS DEVICE (camera + upload) |
| B4 | Writes the daily log | `/app/daily-logs` | OK (data layer) |

---

## Cross-cutting CONFIRMED BUGS (found in code, affect every screen on the phone)

1. **Documents look generic/cheap.** `app/app/documents/page.tsx` lists every
   file with one phosphor `FileText` icon and its `doc_type` text — **no real
   file-type icon, no extension badge (PDF/DOCX/XLSX/PNG), no thumbnail**. This
   is the "cheap little pdf/doc" complaint. → *Next fix: a real file-type badge
   component used wherever files are listed.*

2. **Buttons too small to tap on a phone.** ~1,300 button sites use padding
   like `3px 10px` / `4px 12px` / `5px 14px` → ~24–30px tall, under the iOS
   **44px** tap-target minimum. Reads as "buttons don't work / I keep missing
   them." → *Next fix: raise shared button styles to a 44px floor on touch.*

3. **Low-contrast text.** `#6B7280` and `#64748B` grays on the near-black
   background sit at/below ~3:1 — below the readable floor. "Colors hard to
   see." → *Next fix: replace those two tokens with a readable gray.*

---

## NEEDS DEVICE (only a driven app can confirm — not this environment)

- Which specific buttons do nothing at runtime (a wired `onClick` can still
  call a broken path).
- Whether fields "talk to each other" (forms pre-filling, saves reflecting,
  relationships joining) on each create/edit flow.
- The felt "confusing flow" beyond the entry-point fix above.

These need a **local Claude Code with a simulator/device** (this cloud box
cannot reach the app — egress is policy-blocked). The fixes above are the
code-confirmable subset; this doc is where each device-found issue gets logged
and knocked down.

---

## Automated crawler — `tools/qa-crawl.mjs`

A Playwright crawl that walks every `/app` screen in a real browser, flags render
crashes, uncaught exceptions, real console errors (DB noise filtered), and
**dead buttons** (a click that changes nothing — no nav, DOM, or request). Run it
wherever the browser can reach a working DB for true findings:

```
npm i -D playwright            # one-time (Chromium already on CI/most machines)
npm run dev                    # app on http://localhost:3000 (or set QA_BASE)
node tools/qa-crawl.mjs        # prints findings as Markdown — paste below
```

**In-sandbox run 2026-10-02 (DB unreachable — render + wiring only):**
- ✅ All 16 crawled screens RENDER without a crash / Next error overlay.
- ⚠️ `/app/documents` + `/app/reviews` logged React "Maximum update depth
  exceeded" — but only under the blocked-DB retry storm; likely a fetch-retry
  artifact, UNCONFIRMED as a prod bug. Re-run with the DB up to confirm before
  fixing.
- ⚠️ Dead-button candidates (Home / Choose a job / Help me / Sage / documents
  tabs) are mostly the chat widget (renders in a portal) or tabs showing empty
  content because the DB is offline — treat as UNVERIFIED until a DB-up run.
- The DB-dependent truth (data saving, fields persisting, real flow) needs the
  crawl run against a reachable DB — it cannot be judged from the sandbox.

_Fix log — append each change here as it merges:_
- 2026-10-02: Entry redirect — signed-in `/` → `/app` (middleware). Stops the
  app opening on the marketing page.
- 2026-10-02: Documents + deal media show real file-type badges (PDF/DOCX/…).
- 2026-10-02: Added `tools/qa-crawl.mjs` — in-browser screen crawler (above).

---

## Driven findings — Chrome iPhone 16 device mode on the `redesign/obsidian-glass` preview (3 Oct 2026)

Signed in, 393 × 852, every route in `docs/design/verification.md` tapped. Create / edit /
delete only on **ZZ AUDIT 2 Fix Check**; real jobs opened and cancelled. Each line says
whether it was fixed on the branch (PR #42) and the commit.

### Finding: punch-list checkbox is a 24 px target
- Screen: /app/projects/[id]/punch-list
- What I did: tapped the row checkbox ("Mark … complete" / "Reopen …")
- Expected: a 44 px thumb target
- Actual: hard-to-tap — 24 px box; an automated pass hit four at once
- Severity: minor
- Status: **FIXED on branch** `745e5863` (44 px hit area via `::after`)

### Finding: menu-drawer tools under 44 px
- Screen: every screen (More → drawer)
- What I did: measured Help Me (36 px) and the job picker (34 px)
- Expected: 44 px
- Actual: hard-to-tap
- Severity: minor
- Status: **FIXED on branch** `745e5863`

### Finding: pay-app row menu off the right edge
- Screen: /app/projects/[id]/pay-apps
- What I did: looked for the row "More actions" button at 393
- Expected: on screen, like every kit table (card per row)
- Actual: wrong — the hand-rolled table scrolls sideways; the menu button starts at x > 393
- Severity: major
- Status: **FIXED on branch** `3aa2ee69` (card layout under 768 px; drag handle + bulk box stay)

### Finding: "You Are Here" toggle is 36 px
- Screen: /app/leads (and every sales route)
- What I did: tapped "Show the next step"
- Expected: 44 px
- Actual: hard-to-tap
- Severity: minor
- Status: **FIXED on branch** `3aa2ee69`

### Finding: a permit can never be deleted
- Screen: /app/projects/[id]/permits
- What I did: created ZZ-TAP-TEST-1 on ZZ AUDIT 2, then looked for Delete in the row, the
  detail rail and the menu
- Expected: a Delete on the row menu (DELETE /api/permits/[id] exists and is tenant-scoped)
- Actual: wrong — no row menu at all, no delete anywhere; the test permit is still in the table
- Severity: major
- Status: **FIXED on branch** `d57afcde` (row menu: Open Details · Delete with confirm).
  The test record `ZZ-TAP-TEST-1` (permit `7b25b849…`) still has to be deleted once the
  preview is signed in again.

### Finding: Daily Logs register squeezed at 1440 (desktop)
- Screen: /app/daily-logs at 1440
- What I did: loaded the register with 11 logs
- Expected: columns fit, or the table scrolls
- Actual: wrong — nine columns needed ~1,230 px in 1,146; the Date cell painted over the
  Project name ("nter — BA…")
- Severity: major
- Status: **FIXED on branch** `3aa2ee69` (Weather and Temp columns moved out of the register;
  they stay in the detail and the phone card). Invoicing (Amount column dropped, Total kept)
  and Schedule (task / predecessor clamps) tightened in the same commit.

### Fields-talk results (ZZ AUDIT 2 Fix Check, 393)
- Daily log: Blank Log → Create → row listed → opened → Edit Log → superintendent changed →
  Save Changes ("Log updated.", value shown) → row menu Delete → confirm ("Log deleted.").
  **works**
- Punch item: Add Item → listed ("Item added.") → checkbox Mark complete → label flips to
  Reopen → tap → flips back → row menu Delete → confirm ("Item deleted."). **works**
- Permit: Add Permit → Save Permit → listed. **works** — but see "a permit can never be
  deleted" above.

### Still to drive (preview session expired mid-run)
IOS-DEVICE-QA.md sections 1 (login error path), 3–4 (lead create → deal page → stage bar →
won → job), 5 (documents), 7 (time clock, photo), 8 (reviews), 9 (salesperson login) and the
1440 pass on the remaining routes. Camera, GPS, notch and home-bar spacing cannot be checked
in Chrome at all.

### Finding: sessions die an hour after sign-in (phones too)
- Screen: every screen
- What I did: kept the preview open; three times in one evening every API call went 401 and the next tap bounced to /login
- Expected: silent refresh
- Actual: wrong — routes call getUser(req) with no response, so the rotated refresh token was never stored
- Severity: blocker
- Status: **FIXED on branch** `a79ea02a` (middleware refreshes on /api/* and forwards the fresh token)

### Finding: Clock In hangs on "Clocking in…"
- Screen: /app/time
- What I did: picked ZZ AUDIT 2, tapped Clock In while the location prompt was unanswered
- Expected: a shift within a few seconds, with or without GPS
- Actual: dead — the browser's geolocation timeout never starts until permission is answered; the button stayed on "Clocking in…" indefinitely
- Severity: blocker
- Status: **FIXED on branch** `85084bb1` (8 s hard race; the shift is stamped without GPS). Driven after the fix: POST 201, timer, entry listed, Clock Out.

### Finding: universal search finds no records
- Screen: ⌘K palette / drawer Search
- What I did: typed "Pima"
- Expected: the Pima jobs
- Actual: wrong — only "New Punch Item" and "Autopilot" (static actions)
- Severity: major
- Status: **FIXED on branch** `0f829574` (Jobs & Leads section)

### Finding: Change Orders crashes after Analyze Risk (AI)
- Screen: /app/projects/[id]/change-orders
- What I did: Analyze Risk on the ZZ AUDIT 2 test change order
- Expected: the risk panel
- Actual: wrong — "Cannot read properties of undefined (reading 'tone')": the model answers lowercase, the tone map was keyed uppercase
- Severity: blocker
- Status: **FIXED on branch** `41d6e092`; panel driven at 393 and 1440 ("High Risk", 25 %)

### Finding: a review can never be removed
- Screen: /app/reviews
- Status: **FIXED on branch** `85084bb1` + `0828ee20` + `80268fe6` (Remove with confirm, tenant-scoped DELETE, average refreshes)

### Finding: small targets on pages outside the redesign (logged in FOUND, not fixed)
- /app/projects/[id]/budget: "Actions ▾" 23 px and off the right edge; Add Line 39 px, Export 37 px
- /app/documents: document row titles 38 px
- /app/people (AccessManager): Invite User 35 px, Assign Role 33 / 29 px, Remove 29 px off-screen in the hand-rolled table
- /app/reviews: star buttons 32 px, Add Review 35 px
- /app/settings: "Delete account" is a 20 px link
- /app/time: React #425 / #422 hydration errors on load (dates rendered server-side in UTC, client local)

### Driven and clean (no finding)
Home, Leads board, deal page (stage bar, Won → "Open the Job", activity), Documents, ZZ AUDIT 2
daily log / punch / permit / change order CRUD, Pima registers, Reviews add, People tabs,
Settings, Notifications, Sage chat open/close, Intelligence, Portals, Schedule, Reports.

