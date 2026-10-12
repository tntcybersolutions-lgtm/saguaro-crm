# Site update plan — navy/slate redesign, platform-wide

Rules: `DESIGN_SYSTEM.md`. Verification: `QA_CHECKLIST.md`. Status as of the
last commit that touched this file.

## Scope

Every signed-in screen (`/app/**`, 151 routes), the customer-facing portals
(`/portals/**`, `/prequal`, `/owner-portal`, `/franchise-portal`, 23 routes), sign-in
and onboarding, and the iOS app (the same routes inside the Capacitor shell).

**Excluded from this pass (tracked, not changed):** public marketing pages
(`/`, `/features`, `/pricing`, `/compare/*`, `/industry/*`, `/local/*`, `/blog`,
`/design/*`, `/sandbox`, …), emails and generated PDFs. They keep their own
styling until a separate pass.

## Architecture (what renders a screen)

| Layer | Source | Consumers |
|---|---|---|
| Tokens | `app/globals.css` `:root`; `lib/design-tokens.ts`; `lib/status-colors.ts` | everything |
| App shell | `app/app/layout.tsx`, `components/AppSidebar.tsx`, `components/AppTopBar.tsx`, phone tab bar (globals) | all `/app/**` |
| Job shell | `app/app/projects/[projectId]/layout.tsx` (phase tabs) | 58 job routes |
| Page system A — kit | `components/ui/kit.tsx` (`PageShell`, `Card`, `StatRow`, `DataTable`, `Button`, `EmptyState`) | 41 pages |
| Page system B — premium | `components/ui/premium.tsx` (`PremiumSurface`, `ModuleHero`, `SectionCard`, `StatStrip`, `StatCard`, `PremiumEmpty`, `FlowStrip`) | 94 pages |
| Page system C — cinematic | `components/ui/cinematic.tsx` | 0 pages after batch 1 (Budget moved to premium) |
| Shared widgets | `FileDropzone`, `ListToolbar`, `HeaderProjectPicker`, home widgets | many |

A and B render the same tokens and classes; both are allowed (§3 of the design
system). Hand-rolled inline styles remain inside many pages — the batches below
migrate their colour and type to tokens.

## Batches

| # | Batch | Status |
|---|---|---|
| 1 | Foundation + shared components: card depth (`--shadow-sm`), rounded tabs instead of pills, slate disabled primary, `figureColor()` for every figure, quiet `AutoChip`, readable `FlowStrip`/`FlowSteps`, compact `FileDropzone`, slate outline/gold badge variants | Merged (#146) |
| 2 | Yellow migration (183 files): decorative icons → secondary, yellow text → white (links → blue), yellow tints/borders → slate; ternaries (selected states) untouched | Merged (#146), diff reviewed |
| 3 | Type floor (206 files): inline 8–11.5px → 12, 12.5 → 13, 13.5 → 14 | Merged (#146) |
| 4 | Page structure: Budget moved from cinematic to premium (title, stats, table, empty/error states); Files & Media de-duplicated (one summary, compact upload, one helper line, compact empty state) | Merged (#146) |
| 5 | Per-screen fixes from the job and company audits: one yellow button per screen (repeated primaries demoted to the slate `secondaryButtonStyle` on 24 job screens and 11 company screens); one summary per screen (21 screens merged from two figure rows into one `StatStrip`); job tab row in one place on every job page (the redundant "‹ Job" link removed — the Overview tab goes back); compact empty states (Pay Apps, Inspections, Budget); AI Takeoff upload screen rebuilt on the page pattern; Home / My Work / 28 other `<style>` blocks: yellow text → links blue, icons slate, figures white; client portal dashboard, Intelligence and Messages chat de-yellowed | Merged (#146) |
| 6 | Verification: after-audit on every route at 390 (WebKit iPhone) and 1440; public + portal groups; iOS simulator evidence | After-audit run 12 Oct on production (171 routes): yellow text 1,219 → 111, text under 12px 4,315 → 1,004, screens with two yellow buttons 44 → 15, sideways scroll 0. iOS simulator: app shell launch + sign-in captured; signed-in Safari pass in progress |
| 7 | Fixes from the after-audit (#147): shared `.pmSplit` (rails stack on phones), phone summary labels wrap, status amber vs brand yellow, sign-in/onboarding links and solid buttons, People/Catalog/Schedule/Selections secondary actions | Merged |
| 8 | Sweep (#148): phone form fields 44px / 16px in app and portals, 73 gradient fills solid, last 30 sub-12px sizes, data-driven yellow text, unread dots, type tags | Merged (#148) |
| 9 | Charts: shared palette never uses the action yellow; Classic dashboard; Notification Settings contrast (the non-approved violet/pink/teal/orange series it introduced were replaced in batch 10) | Merged (#149) |
| 10 | Concept building blocks (#150): one semantic theme in `:root` (actions with hover/pressed, nav/tab/selection, status fg/bg/border, disabled, chart series, focus); toasts post into the status box; kit `PageShell` badge/meta, `IconTile`, `ItemRow`, `Callout`, `StagePicker`, `Timeline`; DetailList icon facts with mailto/tel; premium headers with icon tiles; deal page rebuilt | Merged (#150) |
| 11 | List kit + approved palette only (#151): flat `Brief` as the alert card, icon rows, two-column tool tiles; job page, Jobs list, Home rows; status pills beside invoice / pay app / daily log titles; in-app module accents from `lib/ui/app-accent.ts`; status chips, confirm dialog, 191 off-palette `rgba()`, 50 yellow focus outlines, decorative yellow, 55 invalid `${colour}NN` alpha suffixes → `color-mix()`; Command Center tool tiles | Open (#151) |

## Audit tooling

`tools/probe-audit.mjs` (ops branch `ops/testflight`): signs in as the real
company, visits every route of a group (`project`, `company`, `public`) at 390 and
1440, screenshots it and measures yellow on non-actions, text under 12px,
contrast under 4.5:1, cut-off text with no full value, pills, nested boxes,
oversized empties, error text, sideways scroll and targets under 44px. Results
are encrypted to the repo key.
