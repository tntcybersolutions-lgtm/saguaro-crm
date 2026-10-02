# Saguaro — 100% Uniformity Fix Plan (design system + functions)

**The complaint, stated correctly:** every page solves layout, cards, tables,
modals, width and actions **its own way**. Result: fat cards here, thin there;
620px modals next to 900px ones; some lists have row actions, most don't; some
pages go full width, most don't. It reads as unfinished because it has **no
enforced shared UI**.

**Root cause (verified in the code):** there is a partial kit
(`components/ui/premium.tsx`, `components/ui/shell.tsx`) but **pages also
hand-roll their own styles inline** — e.g. ~61 separate fixed-overlay modals,
each with its own width; stat "cards" built ad hoc; tables styled per page. So
a change in one place never reaches the others. Patching individual pages can
NEVER produce uniformity. The only fix is a **design system every page is
forced to use**, then migrate every page onto it.

**The honest constraint:** the cloud session has no browser (it kills any local
server, exit 144). Functional/logic work is verified by build + tsc. **Visual
design cannot be verified from the cloud** — so the owner runs **Claude Code
locally** (browser-capable) and we iterate the look live. That decision is made.

---

## Phase 0 — Foundation: tokens + canonical primitives (START HERE)

One source of truth for everything visual, in `components/ui/` + `globals.css`:

1. **Tokens** (`globals.css :root`): finalize palette (lift off pure `#0a0a0a`
   to a professional layered dark), a spacing scale (4/8/12/16/24/32), radii,
   type scale, shadows, and the status colors (`lib/status-colors.ts`). Every
   component reads tokens — no hardcoded hex in pages.
2. **Primitives** (new/consolidated, each the ONLY approved version):
   - `PageShell` — full-width page frame: consistent max-width (wide), padding,
     page header (title + subtitle + primary actions), breadcrumbs. Replaces the
     per-page `PremiumSurface`/`ModuleHero` improvisations.
   - `DataTable` — dense, competitor-style rows (not fat cards), sortable,
     with a **standard RowActions** slot.
   - `Card` / `StatTile` / `StatRow` — one compact card + one KPI tile. Kills
     the "fat card" variants.
   - `FormModal` — ONE modal (consistent width `min(1040px,94vw)`, header,
     body, sticky footer, scroll, Esc/overlay close). Replaces all ~61.
   - `Field` set — `Input`, `Select`, `Textarea`, `DatePicker`, `Label`, with
     the readable surfaces already shipped.
   - `ActionBar` + `RowActions` — the **uniform action pattern** (see Phase 3).
   - `EmptyState`, `Toolbar`/`Filters`, `Tabs`, `Badge`.
3. **Governance:** a short `REVIEW.md` rule + (optional) an ESLint/grep check in
   `prebuild` that flags new inline modals/fat cards, so pages can't regress to
   hand-rolled.

Deliverable: a `/app/_kit` showcase route rendering every primitive — the
reference the owner approves on localhost.

## Phase 1 — One canonical page (lock the look)

Rebuild **one real page** fully on the primitives as the gold standard —
recommended: **Bid Board** (`app/app/bids`) or **Intelligence**
(`app/app/intelligence`, the "fat cards" the owner flagged). Owner approves it
in the local browser. Nothing else proceeds until the template is signed off.

## Phase 2 — Migrate every page onto the system (tracked, by area)

Work area-by-area; each page: swap hand-rolled card/table/modal for the shared
primitives, put it in `PageShell` (full width), and add standard actions.
Order by traffic:
1. **Sales** — Leads, Customers, Bid Board, Intelligence
2. **Projects** — Overview + the 40 project sub-pages (phase bar already added)
3. **Financial** — invoicing, billing, pay-apps, change-orders, bills
4. **Field** — daily logs, photos, safety, punch, time, crews
5. **Company** — people, roles, settings, reports

Each migrated page is verified: `tsc` + build green, then local-Claude
screenshots at phone/tablet/desktop widths.

## Phase 3 — Uniform FUNCTIONS (no "million clicks")

Define the standard action set per entity and expose it **inline on every list
row and every detail page** via `RowActions`/`ActionBar`, wired to existing
APIs:
- Bid package: View · **Mark Won/Lost** · **Award** · **Close**
  (`/api/bid-packages/[id]/close` exists) · Duplicate · Delete
- Job/project: Open · **Close out** (`/closeout` exists) · Edit · Archive
- Lead: Open · **Move stage** · **Won/Lost** · Email · Convert
- Invoice/pay-app/CO/bill: View · **Send** · **Mark paid/approved** · Void
Every list gets create + the entity's common actions in one click. One pattern,
everywhere.

## Phase 4 — QA + polish

With a local browser, run the mobile/desktop crawler (`tools/qa-crawl.mjs`, now
with the overflow detector) at all breakpoints; fix every overflow/visual
break; final spacing/contrast pass on the approved tokens.

## Autopilot (owner decision)

**Tuck away** — move it under Intelligence/"More". It's a nice-to-have for a GC;
it should not compete with the basics (bids, schedule, daily logs, pay apps,
photos). Keep it, de-feature it.

---

## Run Claude locally (the unlock)

1. `git clone` the repo, `npm install`.
2. Copy env (Supabase URL/anon/service keys, Resend) into `.env.local`.
3. `npm run dev` → open `http://localhost:3000`.
4. Run Claude Code in the repo. It can now **see** localhost, drive the browser,
   and iterate the design system live — the thing the cloud session can't do.

## Reality on scope

This is ~100+ pages. It is a multi-session migration, not a one-shot — but it is
FINITE and mechanical once the primitives in Phase 0 are locked: after the
system exists, each page is a quick swap, and changing the system restyles the
whole app at once. That is what makes it 100%, not a patch.
