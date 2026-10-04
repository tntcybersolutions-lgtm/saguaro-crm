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
| Compact sidebar identity row (36px thumbnail + company name; full photo stays in Settings → Branding) | `components/AppSidebar.tsx` | BUILT |
| Phase pill, "We Won It" and numbered steps removed from the rail | `components/AppSidebar.tsx` | BUILT |
| Top bar: one page title instead of a breadcrumb trail; search no longer forced to 220px | `components/AppTopBar.tsx` | BUILT |
| ProjectNav: Overview · Preconstruction · Execution · Field · Financials · Docs & Comms · Closeout; neutral inactive, yellow selected; ResizeObserver overflow → "More" menu; phone scroll row + Modules | `components/project/ProjectNav.tsx` via `components/ProjectPhaseBar.tsx` | BUILT |
| NextAction: phase badge, real progress (steps done / total from `lib/project-phase`), next required action, ONE primary button, "Open Takeoff" secondary in bidding, expandable checklist, phase switch inside the list | `components/project/NextAction.tsx` | BUILT |
| "You Are Here" banner hidden inside jobs (NextStepBar returns null) and the first-payment rail removed from the overview | `components/NextStepBar.tsx`, overview page | BUILT |
| ProjectHeader: name once, compact status badge, address through `lib/format-address.ts` (no "Mesa, AZ 85210, AZ"), honest date line ("No end date set"), aligned actions | `components/project/ProjectHeader.tsx` | BUILT |
| Metric grid 4 / 2 / 1 on `.k-stat`, tabular numerals, muted "Not set / None yet / Couldn't load" | overview page + `.pj-metrics` | BUILT |
| Old phone module bar + phase-summary CSS removed | project layout, `app/globals.css` | BUILT |

Before (main, phone 393): `docs/design/screenshots/before/393-project-overview.png`.

## Dashboard (M3)

| Piece | Where | Status |
|---|---|---|
| Metric cards on `.k-stat` / `.pj-metrics` (no per-card neon glow, muted missing states) | `components/home/HomeV2.tsx` | BUILT |
| Cards layered like `.k-card`; glossy primary button; pill segmented control; raised select and menu; title 28/24, sections 18 | `components/home/HomeV2.tsx` CSS | BUILT |

## Not yet started

Projects list, pipeline/deals, leads, estimates, takeoff, bid packages, proposals,
subs/team, schedule, daily logs, punch list, photos, RFIs, submittals, change
orders, pay apps, lien waivers, invoices, time clock, reports, settings, every
form/modal/drawer, loading/empty/error states, sorting parity + mobile sort
controls, native iOS shell (status bar, safe areas, sheets, keyboard, reduced
motion/transparency).

## Verification log

- 2026-10-04 — M2 preview `saguaro-crm-git-redesign-neon-glass-salty-vault.vercel.app` built green (dpl_6LVDQ1THNCGGgqx5U1dBL8HNregt). Opening the overview at 393 redirected to `/login` (the preview host has no session). CANNOT VERIFY until a signed-in session exists on that host; the login form is never submitted by the agent.
- 2026-10-04 — M3 pushed (e8fb30b7); preview building (dpl_n9qfg7qFX3hvR4QBZ9kgT3A8ibSK). Phone tab still on `/login` for the neon-glass host — unchanged: CANNOT VERIFY until signed in.
