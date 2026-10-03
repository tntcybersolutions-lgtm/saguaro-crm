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

**390 px:** **blocked.** Desktop Chrome will not size a window below ~500 px and the extension
cannot drive DevTools device emulation; `resize_window` reports success and the viewport stays
1280. Every page carries its own `@media (max-width: 640px)` block (44 px targets, 48 px rows,
single-column grids) and the kit's `.k-stats`, `.k-toolbar` and `.k-table-wrap` reflow, but
none of that has been **seen** at 390 or 320. It needs DevTools device mode (Ctrl+Shift+M,
iPhone 15) or the iOS Simulator before any of it can be marked verified.

## Pass 4 — per-route status

| Route | Commit | 1280 | 1440 | 390 | Notes |
|---|---|---|---|---|---|
| `/app/daily-logs`, `/app/daily-logs/[id]`, `/app/projects/[id]/daily-logs` | 6fe9f605 | verified | verified | blocked | Saved edits keep the log open (was: closed). |
| `/app/projects/[id]/punch-list`, `/photos` | 77866f39, abfafaf8 | verified | verified | blocked | Opened record scrolls into view on stacked layouts. |
| `/app/time`, `/app/projects/[id]/crews`, `/tm-tickets` | 5a9742f4 | verified (lists) | verified | blocked | Crews / T&M detail workspaces **not verified** — no records exist. Auto-open-on-empty composers removed. |
| `/app/projects/[id]/change-orders`, `/pay-apps`, `/pay-apps/[id]`, `/pay-apps/new` | 775736f8 | verified | verified | blocked | Pay apps keep drag reorder, bulk actions, LifecycleRail, NudgeRing. |
| `/app/invoicing`, `/app/invoicing/[id]`, `/app/billing` | 4d7ec40f | verified | verified | blocked | `billing/payapp` and `billing/cost-control` calculators left as-is (out of scope). |
| `/app/projects/[id]/permits`, `/inspections`, `/submittals` | f4eae95c | verified (empty states + composers) | verified | blocked | Tables, detail rails, Advance / Ball-in-Court **not verified** — zero records on every project. |
| `/app/projects`, `/app/my-work`, `/app/schedule` | 4535d57a | verified | verified | blocked | Schedule verified with 15 live tasks, composer and timeline. |
| `/app/reports`, `/app/autopilot`, `/app/intelligence` | 8f46a143 | verified | verified | blocked | Sage results table **not run** (spends Sage credits); Autopilot table **not verified** (all checks clear). |
| `/app/people`, `/app/settings`, `/app/settings/branding`, `/app/portals` | 5f8255bc | verified | — | blocked | Portals verified with 2 client + 4 sub sessions incl. the row-action menu. |
| `/app/takeoff`, `/app/document-versions`, `/app/signal-studio` | 342a2e40 | verified | verified | blocked | Takeoff opened a real analysis (11,400 SF). Document Versions table + dialogs **not verified** — zero documents. |
| `/app/radio` (header only) | 09fff1f2 | verified | — | blocked | Console untouched; channel, meter and dial render live. |
| `/login`, `/signup` | 09fff1f2 | verified (visual) | — | blocked | Neither form was submitted. |
| `/app/projects/[id]/bid-packages` | 09fff1f2 | verified | — | blocked | 5 live packages; wizard **not submitted** (would create a real package). |
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
  48 px rows, stacked grids); tables sit in `.k-table-wrap` (horizontal scroll, sticky first
  column where it matters). **Not browser-verified at 390 / 320** — see above.
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
See `docs/FOUND.md` (3 Oct entries) and `functional-gaps.md`. The biggest: nothing has been
seen at phone width; detail workspaces on four modules have no records to open.

## Rollback
All work is isolated on `redesign/obsidian-glass`; nothing merged to `main`. Revert = close the
PR and drop the branch. Each module is its own commit and independently revertable.
