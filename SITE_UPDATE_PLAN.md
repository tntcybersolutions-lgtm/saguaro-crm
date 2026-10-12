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
| 1 | Foundation + shared components: card depth (`--shadow-sm`), rounded tabs instead of pills, slate disabled primary, `figureColor()` for every figure, quiet `AutoChip`, readable `FlowStrip`/`FlowSteps`, compact `FileDropzone`, slate outline/gold badge variants | Implemented |
| 2 | Yellow migration (183 files): decorative icons → secondary, yellow text → white (links → blue), yellow tints/borders → slate; ternaries (selected states) untouched | Implemented, diff reviewed |
| 3 | Type floor (206 files): inline 8–11.5px → 12, 12.5 → 13, 13.5 → 14 | Implemented |
| 4 | Page structure: Budget moved from cinematic to premium (title, stats, table, empty/error states); Files & Media de-duplicated (one summary, compact upload, one helper line, compact empty state) | Implemented |
| 5 | Per-screen fixes from the job and company audits: one yellow button per screen (repeated primaries demoted to the slate `secondaryButtonStyle` on 24 job screens and 11 company screens); one summary per screen (21 screens merged from two figure rows into one `StatStrip`); job tab row in one place on every job page (the redundant "‹ Job" link removed — the Overview tab goes back); compact empty states (Pay Apps, Inspections, Budget); AI Takeoff upload screen rebuilt on the page pattern; Home / My Work / 28 other `<style>` blocks: yellow text → links blue, icons slate, figures white; client portal dashboard, Intelligence and Messages chat de-yellowed | Implemented |
| 6 | Verification: after-audit on every route at 390 (WebKit iPhone) and 1440; public + portal groups; iOS simulator evidence | Pending — job and company baselines done |

## Audit tooling

`tools/probe-audit.mjs` (ops branch `ops/testflight`): signs in as the real
company, visits every route of a group (`project`, `company`, `public`) at 390 and
1440, screenshots it and measures yellow on non-actions, text under 12px,
contrast under 4.5:1, cut-off text with no full value, pills, nested boxes,
oversized empties, error text, sideways scroll and targets under 44px. Results
are encrypted to the repo key.
