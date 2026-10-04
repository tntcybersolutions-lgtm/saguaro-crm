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
signed-in at 393 px after the phone frame landed (commits `03a1e234` → `d36a0ae8`). The
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
