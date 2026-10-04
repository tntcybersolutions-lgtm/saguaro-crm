# Neon glass — route-by-route coverage

Branch `redesign/neon-glass` (from `main`). Palette: `docs/design/reference/COLORS.png`.
Target treatment: `docs/design/reference/IOS-NEW-IMAGES.png`.

Status words: **DRIVEN** = opened on the preview as a signed-in user at the stated
width and screenshotted. **BUILT** = code pushed, preview green, not yet opened.
**CANNOT VERIFY** = says why.

## Shared system (M1, commit d696e179)

| Piece | Where | Status |
|---|---|---|
| Tokens (`--surface-card #0E0F12`, `--surface-raised #15171C`, `--grad-primary`, glows, radii, `--shadow-card`) | `app/globals.css` NEON GLASS block | BUILT |
| `--status-completed` → `#2CFF7A` (was blue) | `app/globals.css` | BUILT |
| App heading scale scoped to `.sag-app` (marketing `.mkt-page` no longer overridden) | `app/globals.css`, `app/app/layout.tsx` | BUILT |
| Glossy primary button (gradient, sharp inset highlight, warm shadow) | `.k-btn-primary` | BUILT |
| Layered card with yellow→orange top edge | `.k-card`, `.hv2-card` | BUILT |
| Stat tile with icon plate and `data-tone` edge | `.k-stat`, `StatTile` in `components/ui/kit.tsx` | BUILT |
| Pill tabs, raised inputs, raised table header, menu, modal, toast, empty state | kit classes | BUILT |
| Floating dark bottom nav, luminous yellow active item | `.sag-tabbar`, `.sag-tab[data-active]` | BUILT |

## Project overview shell (M2, commit a7ddd111)

| Piece | Where | Status |
|---|---|---|
| Compact sidebar identity row (36px thumbnail + company name; full photo stays in Settings → Branding) | `components/AppSidebar.tsx` | DRIVEN 393 + 1280 |
| Phase pill, "We Won It" and numbered steps removed from the rail | `components/AppSidebar.tsx` | BUILT |
| Top bar: one page title instead of a breadcrumb trail; search no longer forced to 220px | `components/AppTopBar.tsx` | DRIVEN 393 + 1280 |
| ProjectNav: Overview · Preconstruction · Execution · Field · Financials · Docs & Comms · Closeout; neutral inactive, yellow selected; ResizeObserver overflow → "More" menu; phone scroll row + Modules | `components/project/ProjectNav.tsx` via `components/ProjectPhaseBar.tsx` | DRIVEN 393 + 1280 |
| NextAction: phase badge, real progress (steps done / total from `lib/project-phase`), next required action, ONE primary button, "Open Takeoff" secondary in bidding, expandable checklist, phase switch inside the list | `components/project/NextAction.tsx` | DRIVEN 393 + 1280 |
| "You Are Here" banner hidden inside jobs (NextStepBar returns null) and the first-payment rail removed from the overview | `components/NextStepBar.tsx`, overview page | DRIVEN 393 + 1280 |
| ProjectHeader: name once, compact status badge, address through `lib/format-address.ts` (no "Mesa, AZ 85210, AZ"), honest date line ("No end date set"), aligned actions | `components/project/ProjectHeader.tsx` | DRIVEN 393 + 1280 |
| Metric grid 4 / 2 / 1 on `.k-stat`, tabular numerals, muted "Not set / None yet / Couldn't load" | overview page + `.pj-metrics` | DRIVEN 393 + 1280 |
| Old phone module bar + phase-summary CSS removed | project layout, `app/globals.css` | DRIVEN 393 + 1280 |

Before (main, phone 393): `docs/design/screenshots/before/393-project-overview.png`.
After: `docs/design/screenshots/after/393-project-overview*.png`, `after/1280-project-overview*.jpg`.

Fixes found while driving (commit after a7ddd111):
- "Open Takeoff" appeared twice on one screen (header primary + NextAction secondary). The header's quick action is now the secondary button; NextAction holds the page's ONE primary.
- Phone content stopped 56px short of the floating tab bar (the old `--sag-tabbar-h` inside the phone media query won); it is 84px + safe-area now, so the last card and the footer clear the bar.

## Dashboard (M3)

| Piece | Where | Status |
|---|---|---|
| Metric cards on `.k-stat` / `.pj-metrics` (no per-card neon glow, muted missing states) | `components/home/HomeV2.tsx` | DRIVEN 393 + 1280 |
| Cards layered like `.k-card`; glossy primary button; pill segmented control; raised select and menu; title 28/24, sections 18 | `components/home/HomeV2.tsx` CSS | DRIVEN 393 + 1280 |

After: `docs/design/screenshots/after/393-dashboard*.png`, `after/1280-dashboard*.jpg`. Phone: the five view pills wrap to two rows at 393 (Operations · Sales · Service · Owner / Field) — readable, logged for the mobile-controls pass.

## Sorting + mobile sort controls (M4, commits 42c2319a + M4b)

| Piece | Where | Status |
|---|---|---|
| Shared sort kit: `useSort`, `SortTh` (click to cycle asc → desc → off, aria-sort, caret), `SortBar` (phone-only Sort select + asc/desc toggle, 44px targets) over the stable comparator in `components/ui/premium` (empties sink both ways, ties keep source order) | `components/ui/sort.tsx` | BUILT |
| DataTable shows the SortBar on phones (its header row becomes cards there) — covers projects list, leads and every other DataTable screen (27) | `components/ui/kit.tsx` | BUILT |
| Full-dataset guarantee: lists are fetched whole and filtered client-side (only two API routes paginate: client-portal messages and project activity, neither a sortable table), so every sort covers every filtered row | audit of `.range(` in `app/api` | BUILT |
| Hand-rolled tables now sort by every meaningful column: customers (Score desc default), subs, project invoices (column click overrides the toolbar order), pay-app register (drag reorder pauses while a sort is active), project team members + subs, estimate CSI rollup (incl. Budget/Variance when present), schedule task list, warranty claims, prequalification submissions, compliance | the page files | BUILT |
| Already sorted before this pass (toolbar sort): bills, lien waivers, insurance certificates | — | BUILT |
| Not sortable by design: bid-package line-item editor, budget line editor (rows are edited by index), pay-app continuation sheet | — | n/a |

## Not yet started

Projects list, pipeline/deals, leads, estimates, takeoff, bid packages, proposals,
subs/team, schedule, daily logs, punch list, photos, RFIs, submittals, change
orders, pay apps, lien waivers, invoices, time clock, reports, settings, every
form/modal/drawer, loading/empty/error states, native iOS shell (status bar, safe areas, sheets, keyboard, reduced
motion/transparency).

## Verification log

- 2026-10-04 — M2 preview `saguaro-crm-git-redesign-neon-glass-salty-vault.vercel.app` built green (dpl_6LVDQ1THNCGGgqx5U1dBL8HNregt). Opening the overview at 393 redirected to `/login` (the preview host has no session). CANNOT VERIFY until a signed-in session exists on that host; the login form is never submitted by the agent.
- 2026-10-04 — M3 pushed (e8fb30b7); preview building (dpl_n9qfg7qFX3hvR4QBZ9kgT3A8ibSK). Phone tab still on `/login` for the neon-glass host — unchanged: CANNOT VERIFY until signed in.
- 2026-10-04 — Chad signed in on the neon-glass host. Overview and dashboard DRIVEN at 393 (iPhone 16 device mode) and at 1280×529 (the desktop window would not resize past 1280 on this display; 1440 is listed under Not verified). Two fixes found and pushed (see M2).
