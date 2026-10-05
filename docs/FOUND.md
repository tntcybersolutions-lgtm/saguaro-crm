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
- (3 Oct, Pass 4 drive) `app/app/invoicing/[id]/page.tsx` — the project name never resolves
  (lookup via `/api/projects?limit=200&fields=id,name` predates the rewrite); the header
  falls back to "· Project" and the Details rail prints the raw project UUID.
- (3 Oct, Pass 4 drive) Pima change orders carry `cost_impact` 0 on every row while the
  project context reports +$127,650 in approved COs — the two numbers disagree on screen.
- (3 Oct, Pass 4 drive) Pay apps store `contract_sum` 0 (`contract_sum_to_date` is right), and
  the rolled-forward SOV rows 7 and 9 on Mesa Flex have blank descriptions.
- (3 Oct, Pass 4 drive) Project Daily Logs "Last Log" tile reads "11 workdays unlogged" on a
  closed job — the unlogged count should stop at closeout.
- (3 Oct, Pass 4 drive) Preview session expires mid-walk (~30–40 min): /app/billing bounced to
  /login?next= seconds after /app/invoicing rendered; on-device QA has to re-sign-in each pass.
- (3 Oct, Pass 4 drive) `/app/schedule` — all 15 Pima tasks carry `pct_complete` 100 with
  `status` not_started, so every bar reads full while Complete says 0 and Overdue says 15.
  The data disagree with themselves; one of the two writers is wrong.
- (3 Oct, Pass 4 drive) `/app/intelligence` — the comparison cards show $0.00 contract /
  billed / invoiced for ZZ AUDIT 2 Fix Check and ZZ AUDIT Mesa Flex Office although the
  projects page carries contracts for them; the summary API returns zeros, not nulls.
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
- (3 Oct, iOS QA) `app/app/leads/[id]/page.tsx` Files & media — a file can be uploaded and
  downloaded but never removed; deleting the lead (`DELETE /api/leads/[id]`) removes the lead and
  its activities and leaves the storage objects under `project-files/deals/<id>/` behind.
- (3 Oct, iOS QA) Projects — no archive / delete control anywhere in the UI; `DELETE
  /api/projects/[projectId]` (archive) exists and works.
- (3 Oct, iOS QA) `app/app/projects/[projectId]/pay-apps/new/page.tsx` — the Original Contract
  Sum typed in step 1 is not on the created pay app (detail shows $0.00 original); same root as the
  `contract_sum` 0 entry above.

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
