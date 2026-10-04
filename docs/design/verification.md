# Verification — Saguaro CRM redesign (`redesign/obsidian-glass`)

_Pass 6 deliverable. Actual commands + results for what shipped to the branch, and the
browser status of every route the redesign touched. Nothing below is marked verified
unless it was opened on the Vercel preview, signed in, by a session with Chrome._

**Preview:** https://saguaro-crm-git-redesign-obsidian-glass-salty-vault.vercel.app
**Branch head at this write-up:** see `git log -1` on `redesign/obsidian-glass` (Pass 4 ends
at `09fff1f2`, Pass 5 at the commit that follows this file).

## Commands (run on the branch, on every commit)
- `node tools/check-style-escapes.mjs` → **clean** on every commit (one `<style>` text child in
  `app/app/radio/page.tsx` was caught and converted to `__html` before pushing).
- `npx tsc --noEmit` → **8 pre-existing errors only** (`app/api/leads/[id]/media/route.ts` ×4,
  `app/api/reviews/route.ts` ×4); **0 new** on every commit.
- `npm run build` → run by Vercel on every push; every Pass 4/5 push built **READY**
  (13 preview deployments, zero failed builds).

## How each screen was checked
Signed in on the preview in Chrome at a 1280 px viewport, then at 1440 by setting
`document.documentElement.style.zoom = 1280/1440` (valid because every kit media query is
≤ 768 px, so the zoom changes nothing a query watches). Where a route needed data, the Pima
County ADC project (`759aa973…`), ZZ AUDIT Mesa Flex (`a2aad352…`) and invoice `04b6db74…`
were used; no demo data was inserted.

**393 px (iPhone 16, DevTools device mode):** every route in the table below was opened
signed-in at 393 px after the phone frame landed (commits `03a1e234` → `2ab40244`). The
probe on each page was `document.documentElement.scrollWidth === innerWidth` (no sideways
page scroll) plus a zoomed capture of the top and of the first table. Screenshots are in
`docs/design/screenshots/phone/`.

## Phone frame (shared files — every screen gets it)
| Spec item | Where | Status |
|---|---|---|
| Top bar at 393: menu · back / page title · Sage · account; Search, Help Me, job picker, Notifications in the menu | `components/AppTopBar.tsx`, `app/app/layout.tsx`, `app/globals.css` | verified — the `<header>` carried `left: sidebarWidth` inline and began 240 px in; now starts at 0 |
| "You Are Here" and the phase strip: one line on phones, details on tap, no overlap | `components/NextStepBar.tsx`, `components/ProjectPhaseBar.tsx` | verified (open + closed captured) |
| Bottom tab bar Home · My Work · Projects · Time · More, active tab lit, safe-area padding, desktop sidebar hidden < 768 | `app/app/layout.tsx`, `app/globals.css` | verified; `--sag-tabbar-h` reserves its height for content, the bubble and the Sage panel |
| Chat bubble above the tab bar, never over rows or buttons | `components/SaguaroChatWidget.tsx`, `app/globals.css` | verified: sits 24 px above the bar, steps aside while the page scrolls, hidden under modals, row menus, the Sage panel and the radio console; pages keep 72 px under their last row |
| Inputs 16 px on phones | `app/globals.css` | verified (`.k-input` computes to 16px at 393; the 13px `!important` rule no longer wins there) |
| Tables → stacked cards (name, status, amount, one action) | `components/ui/kit.tsx` (`Column.phone`, `data-label` / `data-phone`), `app/globals.css` | verified on Invoicing, Schedule, Daily Logs, Change Orders, Bid Packages, Portals; every kit table marks its status / money columns |
| Row-action menus never off-screen | `app/globals.css` | verified — a bottom sheet above the tab bar |

Leftovers outside the kit tables (logged in `docs/FOUND.md`): the hand-rolled pay-app table
(drag reorder + bulk) and the AccessManager people table still scroll sideways at 393;
FlowStrip arrows wrap between steps.

## Phone round 3 — Chad's review of the 393 screenshots (3 Oct)
Before/after captures are in `docs/design/screenshots/phone/before-*.png` and `after-*.png`,
all taken signed-in on the preview in iPhone 16 device mode (393 × 852).

| # | Item | Fix | Verified on build |
|---|---|---|---|
| 1 | Daily-log composer defaulted to tomorrow after 5 pm (UTC date) | `localToday()` (Intl `en-CA`) replaces every `toISOString()` date on both daily-log pages: default date, Copy Yesterday, gap count, this-month count. Ported from `path/daily-log-2`. | `174f91b7` — composer opened at 17:56 local on Oct 3 shows **10/03/2026** (`after-daily-log-date-local.png`; before: `before-daily-log-date-utc.png`) |
| 2 | "Modules / Pima County…" bar drew over the open menu drawer | The old module bar is gone on phones (its own `display:flex !important` in the project layout was beating the global hide — removed in `2ab40244`). | `2ab40244` — drawer open over a project page shows only the drawer (`after-menu-drawer-no-bar.png`) |
| 3 | Round button half off the right edge on every screen | **Not the app.** The DOM at that point is `<vercel-live-feedback>`: the Vercel Toolbar's comment handle that Vercel injects on every preview deployment for a signed-in Vercel user. There is no element of ours there (`elementsFromPoint` and a scan for fixed elements near the edge both find nothing). It never ships to production. To hide it on previews, turn off the Vercel Toolbar for this project in the Vercel dashboard (Project → Settings → Comments / Toolbar), or dismiss it from the toolbar's own menu; both are account settings, so not changed from this session. | n/a |
| 4 | Chat bubble covered the "8 of 8" count and drew over the open drawer | No floating launcher on phones at all; the top-bar **Sage** button opens the same chat (`saguaro:open-chat`). | `174f91b7` — Daily Logs "8 of 8" and Invoicing "11 of 11" fully visible, no bubble (`after-invoicing-no-bubble.png`; before: `before-bubble-over-count.png`) |
| 5 | One job, three statuses (Closed / "every stage done, Building 6 of 6" / "Field step 4 of 7") | Both bars read the project status through the same `isClosedStatus()`; a closed job shows **Closed job** in the phase bar and "You Are Here" no longer renders inside a project at all. | `174f91b7` — Pima: drawer badge Closed, phase bar "Field · Closed job", sheet "ALL DONE → Open the closeout record" (`after-phase-sheet-open.png`) |
| 6 | "You Are Here" opened was cramped and showed sales text on Radio and Invoicing | Bar only renders on sales routes (`/app/sales`, `/leads`, `/customers`, `/bids`, `/bid-intelligence`) and the build journey; open layout re-flowed (label + chevron, then the full-width step and explanation, then the stage line, then the button). | `174f91b7` — Leads open (`after-leads-yah-open.png`); Radio and Invoicing have no bar |
| 7 | Project pages stacked three bars plus breadcrumbs above the title | One bar: **Modules** + current phase + next step, tapping it opens the phase sheet with the NEXT STEP link and the seven phases. Breadcrumbs hidden on phones. | `2ab40244` — title at y=117, first log card on the first screen (`after-one-bar-per-job.png`; before: `before-three-bars-yah-open.png`) |
| 8 | Home "All Jobs" dropdown ran off the right edge | `.hv2-select` takes the full row on phones. | `174f91b7` — select right edge at 377 px of 393 (`after-home-all-jobs.png`; before: `before-home-all-jobs.png`) |

### Tap-every-button at 393 — what was driven, what was not
Driven by hand (JS `.click()` in device mode, every opener closed again, nothing submitted):
- **Shell:** menu drawer → Search opens the command palette and Escape closes palette and drawer;
  Help Me, job picker, Notifications and Sage AI Expert all present and on-screen; tab bar
  Home / My Work / Projects / Time / More; top-bar Sage opens the chat; account button.
- **Project Daily Logs:** Modules (opens the project drawer), the phase bar (opens the sheet),
  Blank Log and Copy Yesterday (composer, 16 px inputs, fits), the four stat tiles (filter),
  Clear, row "More actions" (bottom sheet). Auto-Fill Today not tapped (writes a log).
- **Daily Logs (company):** New Log, stat tiles, Clear, row menu.
- **Daily Log detail:** Edit Report Info / Work Performed / Delays / Materials & Visitors open
  their inline editors; Cancel closes them. Add Safety Note / Equipment / Notes not tapped.
- **Punch List:** Modules, phase bar, stat tiles, Clear, row menu — and, by mistake, the row
  checkboxes (see the incident below).
- **Photos:** empty state; Add Photo / Add First Photo not tapped (file picker).
- **Time, Crews, T&M, Change Orders:** controls listed read-only (all 44 px, none off-screen,
  no sideways scroll); openers not tapped — see below.

**Incident:** the first automated pass tapped the four completed punch-list checkboxes on Pima
("Reopen …") before the skip list covered that verb, which set four real items back to
`open`: *Campus overview graphics — pod labels transposed*, *CHW differential pressure sensor
reading offset*, *Panel DDC-B2 missing engraved nameplate*, *Duct transition at AHU-7 not
sealed*. The restore (`UPDATE punch_list SET status='completed'` for those four ids) was
blocked by the session's permission classifier, as was every scripted tap after it. They
still need to be marked complete again (one tap each on the punch list, or the UPDATE above).

**Not driven (classifier stopped scripted taps after the incident):** the openers and row
menus on Time, Crews, T&M, Change Orders, Pay Apps (+ new), Invoicing (+ detail), Billing,
Permits, Inspections, Submittals, Projects, My Work, Schedule, Reports, Autopilot,
Intelligence, People, Settings, Branding, Portals, Takeoff, Document Versions, Signal
Studio, Radio, Bid Packages. Each was opened at 393 with no sideways scroll in the earlier
walk; their buttons have not been tapped on a phone frame.

### Found by the taps and fixed (`2ab40244` +1)
- Punch-list row checkbox was a 24 px target → 44 px hit area on phones (`.plCheck::after`).
- Menu-drawer Help Me (36 px) and job picker (34 px) → 44 px minimum for every drawer tool.

## iOS QA run — IOS-DEVICE-QA.md driven in Chrome iPhone 16 device mode (3 Oct, evening)

Preview `redesign/obsidian-glass`, signed in, 393 × 852. Desktop twin taken at a 1440 layout in a
second tab. Create / edit / delete only on **ZZ AUDIT 2 Fix Check** and on records I created;
real jobs opened and cancelled. Every test record was removed afterwards (lead, daily log, punch item, permit, change order,
review, time entry). Screenshots: `docs/design/screenshots/phone/393-*.png` beside
`docs/design/screenshots/desktop/1440-*.jpg` (same name = same screen).

| Script step | Result | Phone / desktop pair |
|---|---|---|
| 0. App open signed-in | lands on `/app` (Owner Home), not marketing | `393-home.png` / `1440-home.jpg` |
| 1. Login error path | **not driven** — this session never submits the login form | — |
| 2. Home tiles, Create, Today / Next 7, role segments, Needs-Attention filters | all work; "Review →" is a full page load (FOUND) | same |
| 2. Universal search by company name | **was broken** — the palette listed only navigation and quick actions; now a "Jobs & Leads" section (`0f829574`). | — |
| 3. Leads: New Lead → Create → reopen | every field pre-filled (company, contact, email, stage Qualified, $12,345) | `393-leads-board.png` / `1440-leads-board.jpg` |
| 4. Deal page: stage bar | Proposal stuck after reload; Won shows "Open the Job"; activity note logged; "Email the GC" composer opens and cancels | `393-deal-page.png`, `393-deal-page-won.png` / `1440-deal-page.jpg` |
| 4. Files & media upload / download | **not driven** (file picker; camera is a device check) | — |
| 4. Convert Won → job | **not driven** — would create a real project | — |
| 5. Documents | real PDF badges, Preview / Download per row, Library tabs; row titles are 38 px (FOUND) | `393-documents.png` / `1440-documents.jpg` |
| 6. ZZ AUDIT 2 project tabs | Daily log create → edit → delete; punch item create → complete → reopen → delete; permit create → delete (Delete was missing, added `d57afcde`); change order create → **Analyze Risk (AI)** → delete. Budget and photos opened (photo upload is a file picker). | `393-zz2-budget.png` / `1440-zz2-budget.jpg`, `393-zz2-change-order-risk.png` / `1440-zz2-change-order-risk.jpg` |
| 6. Pima registers | Daily Logs, Punch List, Pay Apps (cards at 393 since `3aa2ee69`), Permits | `393-pima-*.png` / `1440-pima-*.jpg` |
| 7. Time clock | Clock In **hung on "Clocking in…"** while the location prompt sat unanswered — fixed (`85084bb1`, 8 s hard race). On the fixed build: Clock In → POST 201, timer running, entry "On the Clock" for ZZ AUDIT 2; Clock Out → entry 8:09–8:10 PM pending. React #425/#422 hydration errors on load (FOUND). | `393-time.png` / — (the desktop tab froze twice on this page while the prompt was pending) |
| 7. Daily log create | works (see 6) | — |
| 7. Photo capture | **not driven** — camera | — |
| 8. Reviews | Add Review → 4.0 / 5, listed. No way to remove one — added Remove + DELETE route (`85084bb1`, `0828ee20`, `80268fe6`); removal verified at 393. | `393-reviews.png` / `1440-reviews.jpg` |
| 9. Reps & permissions | tabs Roles / Permission Matrix / Assignments / Compare / Audit / Directory all switch; **salesperson sign-in not driven** (no second account in env) | `393-people.png` / `1440-people.jpg` |
| 10. Shell | drawer tools (Search → palette, Help Me toggle, Notifications, Sage), tab bar, Sage chat opens from the top bar and closes | `393-sage-chat.png`, `393-notifications.png` / `1440-notifications.jpg` |

Also paired: Schedule, Portals, Settings, Reports, Intelligence (`393-*` / `1440-*`). Colors
match in every pair: black base, yellow card titles and edges, orange / green / grey status
pills, orange section headings, neon stat figures. The phone shell reads the same tokens as
desktop since `292f4dbf`.

### Session drop — root cause and fix
Three sign-outs in one evening: 556 API routes call `getUser(req)` with no response object, so
the first API call after the one-hour access token expired rotated the refresh token server-side
and never wrote the new pair back; the browser kept replaying the revoked token, every call went
401 and the next navigation bounced to `/login`. The iOS WebView loads this same site, so real
phones were logged out an hour in. Fixed in `middleware.ts` (`a79ea02a`): `/api/*` refreshes
once, stores the new cookies and hands the route the fresh token. The expiry path itself was
reasoned from code, not driven (it needs an hour); the normal path was driven after the change.

### Not verified
- Camera (photo capture), GPS accuracy, the notch and home-bar safe-area spacing — Chrome cannot
  show them; check on the real iPhone after merging.
- Login error path (form never submitted), Files & media upload/download, Won → job conversion,
  salesperson login, Send-to-GC actual send, pay-app wizard submit, Sage report runs.
- The one-hour token-expiry path end to end.

## Pass 4 — per-route status

| Route | Commit | 1280 | 1440 | 390 | Notes |
|---|---|---|---|---|---|
| `/app/daily-logs`, `/app/daily-logs/[id]`, `/app/projects/[id]/daily-logs` | 6fe9f605 | verified | verified | verified | Saved edits keep the log open (was: closed). |
| `/app/projects/[id]/punch-list`, `/photos` | 77866f39, abfafaf8 | verified | verified | verified | Opened record scrolls into view on stacked layouts. |
| `/app/time`, `/app/projects/[id]/crews`, `/tm-tickets` | 5a9742f4 | verified (lists) | verified | verified | Crews / T&M detail workspaces **not verified** — no records exist. Auto-open-on-empty composers removed. |
| `/app/projects/[id]/change-orders`, `/pay-apps`, `/pay-apps/[id]`, `/pay-apps/new` | 775736f8 | verified | verified | verified | Pay apps keep drag reorder, bulk actions, LifecycleRail, NudgeRing. |
| `/app/invoicing`, `/app/invoicing/[id]`, `/app/billing` | 4d7ec40f | verified | verified | verified | `billing/payapp` and `billing/cost-control` calculators left as-is (out of scope). |
| `/app/projects/[id]/permits`, `/inspections`, `/submittals` | f4eae95c | verified (empty states + composers) | verified | verified | Tables, detail rails, Advance / Ball-in-Court **not verified** — zero records on every project. |
| `/app/projects`, `/app/my-work`, `/app/schedule` | 4535d57a | verified | verified | verified | Schedule verified with 15 live tasks, composer and timeline. |
| `/app/reports`, `/app/autopilot`, `/app/intelligence` | 8f46a143 | verified | verified | verified | Sage results table **not run** (spends Sage credits); Autopilot table **not verified** (all checks clear). |
| `/app/people`, `/app/settings`, `/app/settings/branding`, `/app/portals` | 5f8255bc | verified | — | verified | Portals verified with 2 client + 4 sub sessions incl. the row-action menu. |
| `/app/takeoff`, `/app/document-versions`, `/app/signal-studio` | 342a2e40 | verified | verified | verified | Takeoff opened a real analysis (11,400 SF). Document Versions table + dialogs **not verified** — zero documents. |
| `/app/radio` (header only) | 09fff1f2 | verified | — | verified | Console untouched; channel, meter and dial render live. |
| `/login`, `/signup` | 09fff1f2 | verified (visual) | — | verified | Neither form was submitted. |
| `/app/projects/[id]/bid-packages` | 09fff1f2 | verified | — | verified | 5 live packages; wizard **not submitted** (would create a real package). |
| Kit: `app/globals.css` | 06764c50 | verified | — | — | Secondary buttons lost backdrop blur — stacked blur made Chrome skip painting their labels. |

## Pass 5 — mobile / a11y / performance
- **Performance:** removed `backdrop-filter` from `.k-stat` (per tile), `.k-input` / `.k-textarea` /
  `select.k-select` (per field) and `.k-table th` (per header cell). Cards, modals, menus and
  toasts keep theirs. Measured only by inspection: a schedule page with 15 rows went from
  ~20 blur layers to 2.
- **Keyboard / focus:** every kit control already carries the `:focus-visible` brand ring
  (`app/globals.css:705`); every custom control added in Pass 4 (segmented toggles, chips,
  project rows, recent-analysis rows) is a real `<button>` with the same ring. Composers are
  `FormModal`, which traps focus and closes on Escape.
- **Reduced motion:** the global `prefers-reduced-motion` rule collapses every transition and
  the takeoff scan-line animation.
- **Reflow:** every rewritten page has a `@media (max-width: 640px)` block (44 px targets,
  48 px rows, stacked grids); kit tables become cards under 768 px. Verified at 393 px on
  every route; 320 px not yet seen.
- **Light mode:** not done. `CLAUDE.md` mandates dark only; the handoff's light-mode line
  conflicts with it and was not acted on.
- **Capacitor / safe areas:** `viewportFit: 'cover'` and `env(safe-area-inset-top)` are already
  on the shell; not re-verified on a device this pass.

## Measured regressions / behavior changes (deliberate, reported)
- Saved edits on Daily Logs, Punch List and Crews keep the record open instead of closing it.
- Composers that auto-opened on an empty list (T&M, Change Orders, Submittals) no longer do.
- Schedule tasks at 100% but status `not_started` read as full bars with "0 complete" — data,
  not layout; logged in `docs/FOUND.md`.
- Stat rows with six tiles wrap the sixth tile to its own row at 1280 (Portals, Document
  Versions, Bid Packages); logged in `docs/FOUND.md`.

## Remaining gaps
See `docs/FOUND.md` (3 Oct entries) and `functional-gaps.md`. The biggest: detail workspaces
on four modules have no records to open; 320 px and a real device (Capacitor WebView) are
still unverified.

## Rollback
All work is isolated on `redesign/obsidian-glass`; nothing merged to `main`. Revert = close the
PR and drop the branch. Each module is its own commit and independently revertable.
