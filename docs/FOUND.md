# Found off-path, deliberately not fixed

Per CLAUDE.md §0 and §5: anything spotted while working a path in
`docs/MUST-PASS.md` is recorded here with its file and line, and left alone.
Every detour is individually defensible; the sum of them is why a year did not
converge. One line each, newest at the bottom.

- `app/api/leads/[id]/route.ts` — dead `const msg = "Failed"`, and returns a raw
  `'Internal server error'` instead of `apiError`, so there is no correlation id (§3).
- `app/api/portals/[...path]/route.ts:48` — the GET catch swallows the error with
  no log and no `apiError`.
- `CLAUDE.md` §7 and §8 reference `app/field/` and `app/field/more/page.tsx`,
  which do not exist in this repo; the mobile app is `D:\Saguaro-Field`.
- `app/api/clock`, `app/api/timeclock`, `app/api/timesheets` — three parallel time
  APIs; unclear which is canonical.
- `sub_portal_sessions` appears only in `lib/database.types.ts` — no live reader or
  writer since `w9-portal.ts` was deleted.
- `app/api/reports/sage/route.ts:95` told the model `lien_waivers.status` can be
  `'received'`; nothing writes it. Fixed 1 Oct as part of the waiver work.
- `app/api/photos/upload/route.ts:99,136` — upload response builds image URLs with
  `getPublicUrl()` on the PRIVATE `project-files` bucket, so the optimistic preview
  is a dead URL until a reload re-signs via `/api/photos` list (Path 3 detour).
  FIXED: the response now signs url/thumbnail_url via signFields (same mechanism
  as photos/list), so the preview is live immediately. The STORED values stay in
  public-url form — list still re-signs on read. Bucket confirmed private
  (storage.buckets.public = false for project-files/documents/photos).
- Time-API ambiguity resolved while driving Path 2: `app/app/time/page.tsx` calls
  only `/api/timeclock/{in,out,status}`. `/api/clock/{in,out}` is dead parallel code;
  `/api/timesheets/*` is the admin side. Canonical web clock = `timeclock`.
- (2 Oct, design-system Phase 0) `app/globals.css:247` forces `input, textarea, select
  { font-size: 13px !important }` app-wide. Below 16px, iOS Safari zooms on focus
  (CLAUDE.md §7). Kit fields override it; every legacy hand-rolled form still zooms.
- (2 Oct) `app/globals.css:615` / `:644` — `-webkit-text-fill-color: #FFFFFF !important`
  on inputs also paints `::placeholder`, so placeholders read like typed values on
  every legacy form. Kit fields override it.
- (2 Oct) `app/globals.css:259` `td { font-size: 13px !important; padding: 6px 12px }`
  overrides every table's own sizing — another reason tables never looked uniform.
- (2 Oct) ~many pages hardcode `#0a0a0a` / `#141416` inline instead of tokens; they
  will not pick up the lifted `--bg-base` palette until migrated onto the kit.
- (2 Oct) `app/app/layout.tsx:291` — the fixed top bar uses `left: sidebarWidth` even on
  phones where the sidebar is hidden, so at 390px the header starts ~240px in and its
  buttons run off-screen (seen on /app/bids at 390px).
- (2 Oct, Phase 2) `components/SalesOverview.tsx` — shared by /app/sales and the main
  dashboard, still on the old premium cards (fat tiles, its own donut card). Migrate it
  together with the dashboard so both screens change at once.
- (2 Oct) The floating chat widget (`components/SaguaroChatWidget.tsx`, fixed bottom-right,
  z 9999) covers right-aligned controls at the bottom of the viewport — e.g. "Upload files"
  on /app/leads/[id] when the files card sits at the fold.
- (2 Oct, audit verify) `lib/pdf-engine.ts` G706 — the "all lien waivers received" check prints as a
  plain "v" (WinAnsi has no ✓), and the footer of every generated PDF says `saguarocrm.com`
  instead of saguarocontrol.net.
- (2 Oct, audit verify) Generated PDFs (bid jacket, G706) still draw in the old gold
  `0.831 0.627 0.09` — print layouts, so not the neon screen yellow, but worth one brand decision.
- (2 Oct, audit verify) `app/api/projects/[projectId]/close/route.ts:39` `today()` uses the server
  clock — Vercel is UTC, so a job closed at 6 PM in Arizona records tomorrow's `closeout_date`.
- (2 Oct, audit verify) `components/AppSidebar.tsx` phase pill — a closed job still reads
  "Building · You won it — running the job" with "← Back to Bidding"; a lost bid that was closed
  reads "Bidding · Chasing this job". Should read Closed. The overview header also still offers
  "New Pay App" on a closed job and while bidding.
- (2 Oct, audit verify) `app/app/projects/[projectId]/takeoff/page.tsx` — on load the upload hero
  ("Drop a plan") shows for ~3–5 s before a completed takeoff's results replace it.
- ~~(3 Oct, Pass 4 drive) `app/app/invoicing/[id]/page.tsx` — the project name never resolves~~
  **Closed 4 Oct (`fix/found-items`):** resolves on `main` since the Pass 4 rewrite — the detail
  subtitle reads "Arizona Blueprint & Repro · Pima County Adult Detention Center — BAS
  Modernization" and no UUID is printed. No code change.
- (3 Oct, Pass 4 drive) Pima change orders carry `cost_impact` 0 on every row while the
  project context reports +$127,650 in approved COs — the two numbers disagree on screen.
- ~~(3 Oct, Pass 4 drive) Pay apps store `contract_sum` 0~~ **Fixed 4 Oct (`fix/found-items`):**
  the wizard's Original Contract Sum is G702 line 1 when given, and a job with no contract on
  file learns it from the first pay app. Driven on ZZ AUDIT 2: typed $10,000 → pay app
  `contract_sum` 10000, project `original_contract_amount` / `contract_amount` 10000, overview
  and Intelligence show $10,000. Still open from this entry: the rolled-forward SOV rows 7 and 9
  on Mesa Flex have blank descriptions.
- (3 Oct, Pass 4 drive) Project Daily Logs "Last Log" tile reads "11 workdays unlogged" on a
  closed job — the unlogged count should stop at closeout.
- (3 Oct, Pass 4 drive) Preview session expires mid-walk (~30–40 min): /app/billing bounced to
  /login?next= seconds after /app/invoicing rendered; on-device QA has to re-sign-in each pass.
- ~~(3 Oct, Pass 4 drive) `/app/schedule` — all 15 Pima tasks carry `pct_complete` 100 with
  `status` not_started~~ **Fixed at the writer 4 Oct (`fix/found-items`):** create and PUT keep
  the two columns agreeing (100 → complete, started → in progress, complete → 100, not started
  → 0; when both are sent and disagree the bar wins), and the inline editors send both. Driven
  on a ZZ AUDIT 2 task: progress 100 → Complete; status Not Started → 0 %; a task created at 50 % with the composer's default Not Started is stored In Progress (second build, `8173b1ea`). **The 15 stored Pima rows are not rewritten by code** — reconciliation SQL is in
  the PR description for someone with authority over that job.
- ~~(3 Oct, Pass 4 drive) `/app/intelligence` — the comparison cards show $0.00 contract~~
  **Fixed 4 Oct (`fix/found-items`):** all three contract columns were 0 on both ZZ AUDIT jobs;
  the summary now falls back to Σ `budget_lines.revised_budget`. Driven: Mesa Flex card shows
  Contract $1,166,132.84 (its budget total), ZZ AUDIT 2 shows $10,000 (seeded by its pay app).
- (3 Oct, Pass 4 drive) `/app/portals` — the StatRow's sixth tile (Last Portal Visit) wraps
  to its own row at 1280; the kit StatRow has no "max 5 per row" rule for 6-tile pages.
- (3 Oct, Pass 4 drive) `/app/takeoff` — per-division line-item tables need a horizontal
  scroll at 1280 to reach Total and % of Div; the first column is not sticky there.
- (3 Oct, Pass 4 drive) Kit DataTable row-action menus open upward near the bottom of the
  viewport and can overlap the row above (seen on /app/portals) — cosmetic.
- (3 Oct, phone walk) `components/team/AccessManager.tsx` — its people table is hand-rolled, not
  the kit DataTable, so at 393px it scrolls sideways inside the People hub instead of
  becoming cards; the Base Role column is off-screen on load.
- (3 Oct, phone walk) `components/ui/premium.tsx` FlowStrip — at 393px the arrows between steps
  wrap onto their own lines (Portals "How Portal Access Works", Submittals empty state).
- (3 Oct, phone walk) `app/app/projects/[projectId]/pay-apps/page.tsx` `.paTable` — the custom
  table (drag reorder, bulk select, LifecycleRail) is not a kit DataTable, so it scrolls
  sideways at 393px instead of becoming cards.
- (3 Oct, tap-through) `app/app/intelligence/page.tsx` live-signals ticker — the "Dismiss
  suggestion ×" control is 13 px and scrolls past off-screen; the ticker is a marquee, so
  on a phone there is no still target to tap.
- (3 Oct, tap-through) `/app/radio` console (untouched by the redesign) — Patch / Broadcast
  39 px, "Add someone" 21–31 px, deck buttons 42 px; all under the 44 px thumb target.
- (3 Oct, tap-through) Home "Review →" on a decision card is a hard navigation (full page
  load), not a client route; the sidebar and chat widget remount.
- (3 Oct, tap-through) Pima change-order row "Open Details" opens nothing visible at 393 and
  does not navigate — the detail rail is desktop-only on that page.
- (3 Oct, tap-through) `/app/leads` board at 393 is a sideways kanban: every card and its
  "Actions for …" button sit off the right edge until you scroll the strip (page not in the
  redesign).
- (3 Oct, iOS QA) `app/app/projects/[projectId]/budget/page.tsx` — "Actions ▾" is 23 px tall and
  off the right edge at 393; Add Line 39 px, Export 37 px.
- (3 Oct, iOS QA) `app/app/documents/page.tsx` — document row titles are 38 px buttons at 393.
- (3 Oct, iOS QA) `app/app/reviews/page.tsx` — star buttons 32 px, Add Review 35 px at 393.
- (3 Oct, iOS QA) `app/app/settings/page.tsx` — "Delete account" is a 20 px link at 393.
- (3 Oct, iOS QA) `app/app/time/page.tsx` — React #425 / #422 (hydration text mismatch) on every
  load; the week label is rendered server-side in UTC and client-side in local time.
- (3 Oct, iOS QA) `app/app/intelligence/page.tsx` — first paint in a fresh tab shows three
  skeleton cards and "Select Projects (0)" until the project list arrives; a reload shows the
  auto-selected three.
- (3 Oct, iOS QA) `app/app/time/page.tsx` — the entry row menu's Delete removes the shift with no
  confirm step (every other register asks first).
- ~~(3 Oct, iOS QA) `app/app/leads/[id]/page.tsx` Files & media — a file can never be removed;
  lead delete leaves the bucket objects~~ **Fixed 4 Oct (`fix/found-items`):** Remove on the file
  row (`DELETE /api/leads/[id]/media/[mediaId]`, object then index row) and lead delete clears
  `deals/<id>/` first. Driven on a test lead: Remove → "File removed."; upload again → delete lead
  → lead, `deal_media` and bucket objects all 0. The two objects left by the lead deleted on 3 Oct
  (`deals/3fbf3884…`) predate the fix and still sit in the bucket.
- ~~(3 Oct, iOS QA) Projects — no archive / delete control anywhere in the UI~~ **Fixed 4 Oct
  (`fix/found-items`):** Archive Job in the overview's Project Details (kit confirm → archive →
  portfolio, list cache dropped). Driven on a throwaway job: archived in the table, absent from
  the list.
- ~~(3 Oct, iOS QA) pay-app wizard — the Original Contract Sum typed in step 1 is not on the
  created pay app~~ **Fixed 4 Oct** — same change as the `contract_sum` entry above.

- ~~(4 Oct, marketing) `app/globals.css:250-253` — the app-wide `h1 { font-size: 18px !important }`
  / `h2 { 15px !important }` / `h3 { 13.5px !important }` beat the `.mkt-page h1/h2/h3` scale at
  `app/globals.css:825-847` (no `!important` there), so every page that opts into `mkt-page`
  (roi-calculator, blog, intelligence, features, careers, api-docs, compare, switch-from-procore)
  renders its headline at 18 px. `/get-the-app` is fixed locally on `marketing/phone-screens`.~~ FIXED by neon-glass M1: the app heading
  scale is scoped to `.sag-app`, so marketing headings are no longer overridden.
- ~~(4 Oct) `app/globals.css` `--status-completed` is `#FF8A00` (orange) but
  `lib/status-colors.ts` `completed` is `#2CFF7A` (green) — two answers for one status.~~ FIXED by neon-glass M1:
  `--status-completed` is green.
- ~~(4 Oct, neon-glass walk) `app/app/projects/[projectId]/takeoff/page.tsx` on ZZ AUDIT 2 Fix Check — the
  takeoff hero showed "ZZ AUDIT — Mesa Flex Office".~~ FIXED on redesign/neon-glass (Chad: "FIX IT"): the
  hero was printing `project_name_detected` — the title the AI read off the drawings — as if it were the
  job. It now names the job from project context and shows the drawing title beneath, labelled, only
  when it differs.
- ~~(5 Oct, polish walk) ZZ AUDIT 2 Fix Check — `/takeoff` complete but `/estimate` says "No Takeoff Data
  Yet".~~ FIXED on redesign/neon-glass (Chad: "FIX ESTIMATE AND TAKEOFF READING"): `/api/takeoffs/latest`
  answers `{ data }` but the estimate page read `data.takeoff`, so EVERY estimate was empty; the route also
  only read `takeoff_materials` (measured takeoffs write `takeoff_line_items`) and named the field
  `takeoff_materials` while readers expect `materials`. Page reads `data.data`, route falls back to line
  items like `/api/takeoff/[id]` and returns `materials`.
- (5 Oct, platform migration) `scripts/sync-heatmap-engine.mjs --check` (in `prebuild`) still treats
  D:\Saguaro-Field as the canonical heatmap engine. That repo is retired (dead-repo note, EAS paused), so
  a local `npm run build` fails on "HEATMAP ENGINE DRIFT" whenever the dead copy differs; Vercel passes
  because the folder does not exist there. The canonical source should be this repo now. Not fixed
  (off-path); local builds use `npx next build` after running the gates by hand.
- ~~(10 Oct, walk-2 form fixes) `app/app/time/page.tsx:394` `saveLeave` inserts a `time_entries` row
  with no `project_id`, which is NOT NULL — Log PTO / Sick can never save~~ **Fixed 10 Oct
  (`fix/found-pto-portal-insurance`, 64432119):** it also wrote the GENERATED `total_hours`. The dialog
  asks for the Job (no schema change), hours go in `hours_worked` only so leave never posts to job cost,
  errors show in the dialog. Not driven on a device yet.
- ~~(10 Oct) `/portals/sub/[token]` for a sub invited by an email not on the roster: every portal module
  queries `sub_id=eq.null` → PostgREST 400; the portal opens empty~~ **Fixed 10 Oct
  (`fix/found-pto-portal-insurance`, c21ef164):** `lib/sub-portal-scope` — sub-owned sections read
  empty and refuse filing with a reason (403); radio uses the session as the member identity. Not
  driven on a device yet.
- ~~(10 Oct) `lib/triggers.ts:756` selects `subcontractors(name, email)`; the column is `company_name`,
  so `onInsuranceExpiring` never finds the sub and the COI-expiring email never goes~~ **Fixed 10 Oct
  (`fix/found-pto-portal-insurance`, b81145ab):** select names live columns only, failed reads are
  logged (trigger and cron). No email sent or observed from this session.
- (10 Oct) `/app/customers` has no way to create a customer — nothing in the UI posts to
  `/api/customers/profiles` except the project Ownership card's new inline form.
- (11 Oct, probe of #129) Client portal footer reads "NaN days remaining" when the project has no
  end date — `app/portals/client/[token]/page.tsx` Project Timeline footer. Not fixed (off-path).
- (11 Oct, probe of #129) Client portal floating quick-action bar (Dashboard / Messages / Approvals,
  `app/portals/client/[token]/page.tsx` ~line 2290) is fixed over the content on a phone and covers
  cards as you scroll. Not fixed (off-path).
- (11 Oct) `app/page.tsx:107` calls `useState` inside a callback (react-hooks/rules-of-hooks
  error on main). Builds pass because lint does not gate the build. Not fixed (off-path).

## 11 Oct 2026 — every open entry above, closed (`fix/all-errors`, Chad: "fix all errors")

Fixed in this change:
- `app/page.tsx:107` hook inside a callback → state hoisted to the component; `lib/storage-providers/types.ts:47`
  broken eslint-disable comment → fixed. `eslint app components lib`: 0 errors.
- Client portal "NaN days remaining" → a job with no start/end date reads "No end date yet" / "—".
- Client portal floating Dashboard/Messages/Approvals bar → removed; it repeated the sticky tab bar and covered cards.
- Change-order money read five ways → one reader, `lib/change-order-amount.ts` (`coAmount`/`coTotal`):
  CO register, overview, project context, pay-app create (G702 line 2 missed COs stored in `amount`), contract prefill,
  G701 (prior-CO sum string-concatenated TEXT `cost_impact`), proposal accept, closeout, triggers. Pima's $0 rows vs
  +$127,650 were this.
- Daily-log "N workdays unlogged" on a closed job → stops at the closeout date (`lib/daily-log-gap.ts`, shared by the
  project register, its New Log banner and the company page; project context now carries `closeout_date`).
- `/app/time` React #425/#422 → today's week label waits for the client; Delete now asks first.
- Placeholders read like typed values (`-webkit-text-fill-color`) → own fill, `--text-disabled`, like the kit.
- Rolled-forward SOV lines with no description (Mesa Flex 7, 9) → a G703 line reads its cost code or "Line N", never blank.
- Phone tap targets under 44px (radio console, budget Actions, document titles, settings Delete account, …) → one
  rule in the shell: every button / role=button / select in `.main-content-area` is ≥44px on a phone; icon-only ≥44 wide.
- `/app/leads` board sideways at 393 → phones open on List (stacked cards); Board is one tap away.
- AccessManager people table sideways at 393 → `k-stack` (stacked cards, same rules as DataTable); any hand-built
  table opts in with `class="k-stack"` + `data-label`.
- FlowStrip arrows wrapping onto their own lines at 393 → steps stack as a numbered list on a phone.
- Intelligence ticker: 13px × on a marquee → on touch the strip stands still and swipes; Dismiss is 44px.
  "Select Projects (0)" while loading → no count until the list arrives.
- `/app/takeoff` division tables at 1280: first column not pinned → every DataTable pins its first column when it scrolls.
- `prebuild` failed locally on drift against the retired Saguaro-Field copy → the two sync checks are retired; this
  repo is the canonical heatmap/takeoff engine.
- Email "from" fallbacks still said saguarocrm.com → saguarocontrol.net.

Already fixed on main before this change (checked, no code needed): leads/[id] apiError; portals/[...path] catch;
`/api/clock` (410 tombstone, no DB); iOS 16px inputs; phone top bar `left`; PDF footer domain + [X] waiver check;
closeout date from the user's clock; sidebar phase pill on a closed job; takeoff "Drop a plan" flash; chat launcher
(clears the page end, hides on scroll and under modals); Portals 6-tile row (flat strip, auto-fit); Pay Apps table
(own phone cards); Home "Review →" (Home rebuilt, all client links); CO "Open Details" at 393 (detail scrolls into
view); reviews stars (44px); `/app/customers` (New Customer form).

Not code errors — left as they are, on purpose: data-model notes (`sub_portal_sessions` in types only); design debt
already tracked by the design-system baseline (hex literals, `td` density, SalesOverview); PDF brand gold (a brand
decision); DataTable menus opening upward near the bottom (that is the correct behaviour); the Vercel *preview*
session timeout (preview deployments only). CLAUDE.md §7/§8 still name `app/field/` and `lib/field-tokens.ts`,
which do not exist — Chad's standing orders, not edited here.
