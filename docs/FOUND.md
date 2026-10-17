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

## 2026-10-14 — found during the "no one gets emails" fix

FIXED in PR #175 (Chad: "fix all then merge"):
- Owner/architect names read `.name` off the TEXT `owner_entity` / `architect_entity` columns, so they came out blank on
  pay apps, A310/A312, closeout and the project overview. All now go through `lib/project-parties.ts`.
- Email helpers in `lib/email.ts` returned void; all now return the send result. Signature requests and W-9 requests
  report a failed email instead of saying it was sent.
- `files/share` and `radio/panic` now check Resend's answer. Panic emails read recipients from `profiles`, because
  `public.users` is stale (16 rows, 5 match a profile).

STILL OPEN:
- White-label still defaults to `*.saguarocrm.com` subdomains / `tenants.saguarocrm.com` CNAME
  (`white-label-provisioning.ts:36,38,259,306,457,572`) and `sandbox.saguarocrm.com` (`sandbox-manager*.ts`). That
  domain is not ours. Fixing it needs a decision on the white-label domain plus wildcard DNS, so it is not a code-only change.

- 2026-10-15 (Step 6): `contracts` has no cost code or budget line, so a subcontract written by hand (not from a bid award) is on Commitments but not in the budget's Committed column. Needs a cost-code/budget-line picker on the subcontract.
- 2026-10-15 (Step 6): `app/api/projects/[projectId]/purchase-orders/route.ts` GET filters by project only (project ownership is checked first, but the query itself has no `.eq('tenant_id', …)` — §3 rule).
- 2026-10-15 (Kit look): `app/app/projects/[projectId]/pay-apps/[id]/page.tsx:694` "Released to Date" is fixed at $0 — there is no retainage-release field read, so a closeout pay app that releases retainage would still show $0.
- 2026-10-15 (Schedule CPM): `app/api/schedule/[id]/route.ts:33,36` and `app/api/schedule/create/route.ts:31,35` write status `'complete'`, but the schedule page's status list, labels, badge tones and "Tasks Complete" tile only know `'completed'` (`app/app/projects/[projectId]/schedule/page.tsx` STATUSES). A task set to 100 % is saved as `complete`, so it shows a raw "complete" label and is not counted as finished. (The CPM lookahead treats both as done.)
- 2026-10-15 (Schedule CPM): `app/api/schedule/list/route.ts:20` and `app/api/schedule/[id]/route.ts:58,77` use a bare `catch {}` with a generic 500 instead of `apiError()` (§3).
- 2026-10-15 (Cash flow fix): project-context API reads `projects.contract_amount` as the original contract when `original_contract_amount` is empty, so pages using it may double-count approved change orders (same bug the cash-flow route had).
- 2026-10-15 (Submittal workflow): `app/api/submittals/[id]/route.ts:20,67,90` bare `catch {}` with a generic 500 instead of `apiError()` (§3); `app/api/submittals/[id]/review/route.ts:44-47` same.
- 2026-10-15 (Submittal workflow): `lib/job-page.sanity.test.ts` fails on main before this branch — "every tool page under the job has a row — commitments".
- 2026-10-15 (Submittal workflow): the submittals list screen's status list (`pending…revise_resubmit`) differs from the item registry's (`draft`, `approved_as_noted`, `closed` too), so a row set to `approved_as_noted` from the full page shows a raw label in the list.

## 16 Oct 2026 — the four 15 Oct entries, fixed (`fix/found-oct16`, Chad: "fix the 4 bugs in FOUND.md")

- Pay app "Released to Date" fixed at $0 → `lib/retainage.ts` reads the job's ledger (released = every drop in the held
  balance; line 7 = the prior app's line 6). Detail screen, `/api/pay-apps/[id]` GET/PUT, the G702 PDF and the owner
  portal all read it. Same class fixed: `retainage_percent || 10` turned a 0 % release app into 10 % (detail, new-app
  wizard, PDF, owner portal, project-context, cash flow); the PDF and owner portal read line 7 from `prev_payments`
  (a text column nothing fills) so the PDF printed $0 there and wrote the whole earned amount back as payment due; the
  detail Save deleted the SOV and then failed the re-insert on a null `project_id` (now insert-then-delete, job from the row).
- Contract double-count → `lib/job-contract.ts originalContract`: original columns first, then prime, then a REVISED
  column (`revised_contract_value`, `contract_amount` — the CO trigger adds to it) less approved COs, then
  `contract_value`, then the accepted proposal. Used by the job summary (`/api/projects/[projectId]`: Pima read
  $2,667,300 → $2,539,650), project-context (Camelback / Desert Vista read a $0 original), owner portal, cash flow,
  Sage's project context, the G701 and the A101.
- Schedule `complete` vs `completed` → `lib/schedule-status.ts`; every writer (`/api/schedule/create`, `/api/schedule/[id]`,
  `/api/projects/[projectId]/schedule/[taskId]`) stores `completed`; job schedule, company schedule, task detail,
  project-context and the job summary read both. The 3 stored `complete` rows (Sonoran Ridge) were set to `completed`.
- Swallowed errors in the schedule routes → `apiError` with a ref (list, [id] PUT/DELETE, [taskId] PATCH); the job
  schedule shows the ref when the list fails. Also pay-apps/[id] and owner-portal GET.
- ~~294 other `catch {}` blocks across ~200 API routes still return a bare 500 with nothing logged~~ **Fixed 16 Oct
  (`fix/all-swallowed-errors`, Chad: "fix all fully"):** 457 catch blocks in 329 route files now return `apiError`
  (real error logged with a ref; any fields a screen reads on failure, e.g. `tasks: []`, kept via apiError's new
  `extra`). Raw `e.message` no longer reaches a response from these. `lib/api-response serverError` goes through
  apiError too. The 4 streaming endpoints (Sage chat, discovery chat, design generate) keep their text reply and now log.
  Left on purpose: ~112 comment-only catches that are best-effort by design (JSON body parse, optional weather, etc.).
- Dead code noted: `lib/document-templates/g702-generator.ts` (imported nowhere) still reads `contract_amount` as line 1.
- 16 Oct (Chad: "fix the drift on words NO OVERLAP"): every dropdown in the app (Chrome/Edge customizable select)
  let a long chosen value run past the field — schedule Predecessor names ran over the Progress bar. Fixed once in
  `app/globals.css` (clip at the content box); verified live on /app/schedule.

## 16 Oct 2026 — My Day (Chad: "go bigger on my day… any user's role… chronological… custom picker… visually amazing")

Built, not a defect fix: /app/my-work is now **My Day** (nav label renamed). One board in the order a workday runs —
start of day (date, on-time ring, late / today / this week / $ at stake / waiting-on numbers that filter, the live
clock), today's agenda (meetings on an hour timeline with a now line; inspections and job starts in an Anytime lane),
carried over, today's work, waiting on others, before you leave (daily log, clock out, first thing tomorrow), the
next-two-weeks runway (a stacked bar per day; tap to filter) and job heat. Customize sheet: reorder (drag or arrows),
show/hide, density, agenda hours, runway length, group-by, dollars, company vs my jobs — saved per person in
`user_preferences.custom_settings.myDay` (`/api/my-day/prefs`), role defaults until they touch it.
Files: lib/my-day.ts, lib/my-day-prefs.ts (+ sanity test), components/my-work/MyDayBoard.tsx, MyDayCustomize.tsx,
MyWorkView.tsx, /api/my-work (+ jobs, agenda, roles, ?view=mine).

## 16 Oct 2026 — Platform polish pass 1 (Chad: "start at home, every page… no cards… polish the nav")

- **Home said "All clear" while My Day said 3 late, 2 waiting.** Home's alert line counted its own queue; My Day
  counts `/api/my-work`. Home now reads My Day's list for late / due today / waiting (`lib/home/day-ticker.ts`,
  + sanity test), keeps its own photos-to-review and done-today, and shows the line on every Home view (was owner
  only). Words match My Day: late · due today · waiting · to review · done today.
- **Boxed cards, app-wide (Chad's hard rule: no cards).** Fixed at the shared source, so every page that uses them
  changes at once: kit `Card` (.k-card), `StatRow` (.k-stats), premium `SectionCard` (.pmSec), `StatStrip`
  (.pmStrip), `StatCard` (.pmFigIn), `Callout` (.k-callout), flat `Brief` / `NumberStrip` / `FlatList` / tool grid
  (components/ui/flat.tsx), Home's finance figures and panels (HomeFinance) and the alert line (AlertTicker).
  Sections are a title over a hairline; number strips are one scoreboard row with hairlines; a callout or brief is a
  rail. Trays inside dialogs and pickers (`SectionCard tray`) keep their surface.
- **Nav polish (Chad: "looks nice now, don't break — polish a bit").** Rail scrollbar: no arrow buttons or grey
  gutter, thin thumb on hover. Rows: label lights with the row, pressed state, keyboard ring; the selected pill has a
  machined top edge. Brand row unboxed. Top bar: every control the same 36px height and 10px corners (back, job
  picker, search, Photos, Help Me, Sage); search reads as a search field and is wider on big screens; hover and
  focus states on all of them.
- **Every-page sweep 1 (desktop, 138 page loads, 120 screens):** 0 sideways scroll, 0 error text, 0 white
  backgrounds, 0 "Coming Soon". Fixed what it found: boxed Jobs table (/app/projects), client-portal user and
  activity stat cards → scoreboard strips, its empty-state line ran 262px past its cell, Document Library box,
  Intelligence insight cards → rails, network report cards → sections, "Current Payment Due" box (company pay
  apps), Reviews form box; 20px punch checkboxes and the 11px "dismiss suggestion" ✕ now have 44px tap areas.
  Kept on purpose: kanban cards (Leads board), dashboard-setup widgets, photo thumbnails, the drawing sheet, chat
  bubbles, the Settings logo drop zone. Job phase tabs: same machined selected pill as the rail.
  The franchise Command Center pages redirect for this company (gated, not broken).

## 16 Oct 2026 — MUST-PASS follow-ups (fix/mustpass-followups) — found, NOT fixed

- `lib/document-templates/g702-generator.ts:322` — dead (nothing imports it); inserts a pay_applications row with
  no tenant_id inside `catch { /* DB may not have table yet */ }`. Delete the module.
- `pay-app-workflow.ts` `ownerApproveGetHandler` / `ownerApprovePostHandler` / `submitPayAppHandler` /
  `recordPaymentHandler` — no longer routed (the catch-all now sends submit / record-payment through
  lib/pay-app-status); they write `status` directly and use the unused `owner_approvals` table. Delete them.
- `app/api/pay-apps/[id]/route.ts` DELETE hard-deletes a pay application while every reader filters `deleted_at`;
  should soft-delete like lien waivers now do.
- `app/api/compliance/lien-deadlines/route.ts:37` — gated on Safety: Edit, like prequalification was; lien
  deadlines are sub/compliance work (Projects).
- `app/app/kit/page.tsx` — the design-system reference page renders sample bids ("Mesa Logistics Center",
  "Copper State Dev.") and is reachable at /app/kit by any signed-in user. Gate it to platform owners or remove.
- `app/api/dashboard/widget-metrics/route.ts` `guard()` returns the fallback on ANY error with nothing logged, so a
  broken widget reads as "no data".

## 16 Oct 2026 — Related Items (feat/related-items) — found, NOT fixed

- `photo_entity_links` (0 rows; `app/api/projects/[projectId]/photos/*`) is a third photo-to-record link table
  beside `related_items` and `photos.punch_list_item_id`. Fold it into `related_items` or drop it.
- `item_links` (0 rows) has no reader or writer left — `/api/items/:tool/:id/links` was replaced by
  `/api/related-items`, and the migration copied its rows. Drop the table once the PR is live.
- No detail screen exists for invoices, safety incidents or commitments' own `commitments` table; their
  Related Items links open the list page (`lib/related-items.ts` `href`).
## 16 Oct 2026 — Search everything (feat/search-everything) — found, NOT fixed

- `customer_profiles` has no index on `tenant_id` (every other searched table has one). 19 rows today, so search
  is unaffected; add `CREATE INDEX IF NOT EXISTS idx_customer_profiles_tenant ON customer_profiles(tenant_id)`
  before it grows.
- `drawing_sheets` (0 rows) and `punch_list_items` (0 rows) duplicate `drawings` / `punch_list`. The project
  screens read `drawings` / `punch_list` (so search does), but `app/api/dashboard/metrics`, `reports/summary`,
  `intelligence/summary`, `drawings/review-link` and `portal/drawing-review` still reference the empty tables —
  check whether their counts read zero. Pick one table per record.
- Legacy `documents` (no tenant_id, no project_id) cannot be searched safely; job files live in `project_files`.
## 16 Oct 2026 — role-aware RLS (fix/role-rls) — found, NOT fixed

- `public.app_user_role()` maps every profiles.role it does not recognize (e.g. 'Salesperson', 'Project Manager')
  to `'admin'`, so the older `rbac_*` restrictive policies (bills, budgets, invoices, CO, pay apps, role_definitions,
  api_keys…) treated a Salesperson as an admin. The new `role_gate_*` policies close that on the 51 tables they
  cover; anything still relying on `app_user_role()` alone (daily_logs, rfis, photos, punch_list_items, drawing_sheets,
  integrations, tenant_settings, custom_field_definitions, approval_workflows…) still has the hole.
- `resource_assignments.hourly_rate / cost_rate` — person-level rates readable tenant-wide over REST; not gated.
- `proposals`, `proposal_lines`, `bids`, `bid_submissions`, `bid_packages` — money columns with tenant-only policies
  (Sales/Projects data; every current role that can reach them already holds the matching category).
- `user_role_assignments` SELECT is tenant-wide: every member can list who holds which role (no write path exists).
- `rbac.permission_level_for` and lib/permissions.ts both ignore `user_role_assignments.project_id` unless a
  project is asked about — and a user whose ONLY grants are project-scoped falls to memberDefault (View on
  everything) everywhere else. App Store Review (member, PM on one project) therefore reads every job's money.
  That is the TS rule, mirrored exactly; it should probably be None, not View, for a scoped-only user.

## 16 Oct 2026 — list tools (feat/list-tools) — found, NOT fixed

- `app/api/items/[tool]/[id]/route.ts` PATCH — for `change_orders`, setting `status: 'approved'` only stamps
  `approved_at`; it does not run `applyChangeOrderMoney` (lib/change-order-cascade) the way
  `POST /api/change-orders/[id]/approve` does. The record page's status field can therefore approve a CO
  without moving the contract. List bulk approve uses the approve route, not this one.
- `app/api/selections/[id]/route.ts` PUT / DELETE — `getUser` only, no `requirePermission`; any signed-in seat
  can change or delete an owner selection. No bulk actions were wired to it for that reason.
- `app/api/purchase-orders/[id]/status/route.ts` — writes any `status` string with no transition check and no
  `approved_at` / `delivered_at` stamps (the items route stamps them). The PO screen enforces the one-step rule
  client-side only; bulk mirrors that rule.
- `/api/auth/permissions` returns the global map only (no projectId), so a person whose Edit grant is
  project-scoped sees no bulk bar on that project's lists (fails closed; the routes would accept them).
## 16 Oct 2026 — empty-state actions (feat/empty-states-add) — found, NOT fixed

- `components/EmptyState.tsx` (boxed 72px-medallion card + `EmptyInvoices`…`EmptySubmittals` variants) has no importer — dead code that breaks the flat / no-card rule if anyone reaches for it. Delete it.
- `components/ui/PremiumEmpty.tsx` (the `actionLabel` / `GradientButton` version) has no importer either; every `PremiumEmpty` comes from `components/ui/premium.tsx`. Delete it.
- DESIGN_SYSTEM.md §3 says an empty state's button that repeats the header's is the slate secondary; the empty-state `primary` is yellow by request, so an empty list can show two yellow buttons (header + list). If Chad wants the old rule back it is one line: `variant="primary"` → `"secondary"` in `components/ui/empty-actions.tsx`.
- Project tool pages still with no `?new=1` deep link (the job page sends their empty rows to the list instead): specs, files, photos, safety, budget, change-orders, lien-waivers, purchase-orders, invoices, bills, timesheets, tm-tickets, crews, selections.

## 16 Oct 2026 — legacy role checks replaced (fix/rls-legacy-role-checks)

Closed from the entry above: `app_user_role()` no longer decides anything that matters — every table that used it
(daily_logs, rfis, photos, punch_list_items, drawing_sheets, deliveries, field_issues, project_files,
safety_incidents, voice_memos, entity_comments, integrations, tenant_settings, custom_field_definitions,
approval_workflows, crew_locations, geofence_events, presence_sessions) now has `role_gate_*` policies on
`rbac.has_permission`, and `resource_assignments` rates, proposals/proposal_lines and bids/bid_submissions/bid_packages
are gated too (20261016g + h, APPLIED LIVE). Found on the way, NOT fixed:

- 20261016i (drop the 90 legacy `rbac_*` policies and `app_user_role()` itself) is committed but NOT applied — the
  SQL runner holds DROP statements for approval. Harmless meanwhile: the legacy policies are RESTRICTIVE and every
  stored profiles.role passes them; their role_gate twins do the real work. After applying it, regenerate
  `lib/database.types.ts` (it still lists `app_user_role`).
- `app/api/projects/all/resource-planning/route.ts` (GET/POST) and `[id]/route.ts` have no permission check and hand
  `hourly_rate` (= `cost_rate`) to every member; the per-project route needs Projects: Edit even to read.
- List routes with no category check, so the server shows what the database now refuses over REST:
  `app/api/rfis/list/route.ts` (a Salesperson has RFIs: None), `app/api/bids/list/route.ts`,
  `app/api/voice-memos/list|create`, `app/api/presence/*`, `app/api/field/crew-locations/route.ts` GET (everyone's GPS).
- Stored Foreman and Superintendent roles have Projects: View, so they cannot create a daily log anywhere
  (`/api/daily-logs/create` needs Projects: Edit; the database now agrees). Probably a role-definition fix.
- `crew_locations_ins`, `geofence_events_ins`, `presence_sessions_ins3` check only the tenant, not
  `user_id = auth.uid()` — any member can insert a location/presence row in someone else's name over REST.
- Proposals are gated by Documents (what `/api/proposals/create`, `/upload` and `/api/projects/[id]/proposals` check),
  so a Subcontractor (Documents: View) can read proposal amounts — in the app and over REST alike. If proposal money
  should be Sales or Budget, the routes and `role_gate_*_proposals` have to move together.
- Pre-existing advisor noise on the rewritten own-row policies: `crew_locations_*`, `geofence_events_*`,
  `presence_sessions_*3` call `auth.uid()` unwrapped (auth_rls_initplan) — wrap in `(SELECT auth.uid())`.
- `proposal_signatures` / `proposal_signature_events` (20261016p, merged while this branch was open) are readable
  tenant-wide with no role gate — signer names, emails and IPs; gate them with Documents like `proposals`.

## 16-17 Oct 2026 — permission + change-order follow-ups (fix/perm-and-co-followups)

Closed from the three entries above: the record page / approvals inbox / catch-all / command-center CO paths
(all through lib/change-order-status now), `selections/[id]` PUT/DELETE, the PO status route (lib/purchase-order-status),
resource-planning rates (Budget or Admin view only), the unguarded list routes (rfis, bids, voice memos, presence,
crew GPS and ~35 more), the Foreman/Superintendent templates (20261017b, applied), proposals following Documents and
the ungated proposal_signatures / _events (20261017c, applied). Found on the way, NOT fixed:

- 20261016i is STILL not applied: the SQL runner cancelled `apply_migration` twice. Pending: the DO block that drops
  the 90 `rbac_(ins|upd|del)_*` policies, and `DROP FUNCTION IF EXISTS public.app_user_role();`.
- 20261017d (built-in Subcontractor template: Sales: None) is committed, NOT applied — held for a yes. The 3 oldest
  tenants' Subcontractor rows have no Sales key, inherit Sales: View from Projects, and so still read proposal and bid
  dollars and signer details. Proven in the rolled-back proof: with it a Subcontractor sees 0 of each.
- `app/api/project-context/route.ts` (Projects: View) returns budget lines, original / revised contract, pay-app
  billed-to-date and each sub's contract amount. Only the proposal amounts are gated now; the rest is Budget money.
- `app/api/projects/[projectId]/route.ts` GET (now Projects: View) returns contract sum to date and budget health.
- Count-only aggregates with no category check (no record content): `dashboard/metrics`, `widgets/summary`,
  `projects/list`, `company-tools`, `franchise/op-kpis`; `projects/map` hands back photo thumbnails per job.
- `bid_history` (`/api/bids/[id]`, `/api/bids/score`) stays on Projects; its amounts are not under the Sales-or-Budget
  rule the `bids` table now has.
- `approvals/decision` needs Documents: Full for every module before the module's own check; COs now also need
  Change Orders: Full and POs Budget: Full, invoices still only Documents: Full.
- Readers that count a CO as approved only when `status === 'approved'` (cash flow, reports, the CO page tiles…)
  do not see the command-center posting statuses `schedule_updated` / `budget_updated`; lib/job-contract,
  lib/change-order-cascade and the commitment trigger do (CO_APPROVED_STATUSES). No live CO uses them today.
- Desert Vista Medical Plaza: three contract figures disagree (original_contract_value 8,200,000, contract_value
  8,450,000, revised_contract_value 8,478,400, contract_amount 0) and approved CO #1 ($28,400) is on no budget line.
  The next CO touch rewrites revised to 8,228,400 (lib/job-contract picks original_contract_value). Needs a ruling
  on which figure is the original.
- `projects/[projectId]/resource-planning/[id]` PATCH allows `trade` and `certifications`, which are not columns —
  a body with either fails.
- `public/push-sw.js` (fetch handler, `isData`) caches `/api` GETs network-first (served only when the network
  fails, wiped on sign-out). The offline-field brief said "never cache /api"; left as is because removing it takes
  away offline reading on every screen opened before (punch list, RFIs, drawings, daily-log lists). Needs a ruling.
- `public/sw.js` ("Saguaro Field v7", precaches `/field/*`) is registered by nothing — `/field` does not exist; dead file.
- Offline badges ("Waiting for Signal") use `Badge tone="gold"` — yellow on a label, against DESIGN_SYSTEM §4
  (`app/app/daily-logs/page.tsx:470`, `app/app/projects/[projectId]/daily-logs/page.tsx:584`,
  `components/media/OnThisPhone.tsx:78`, `app/app/projects/[projectId]/punch-list/page.tsx:497`).
- Videos kept on the phone (`/api/files/record`) carry no client id yet — a lost answer can still file a video twice.

## 17 Oct 2026 — permissions per job (feat/project-permissions) — found, NOT fixed

- `lib/job-page.sanity.test.ts` fails on main before this branch: "every tool page
  under the job has a row — commitments, meetings" (the tools registry lacks rows for
  those two pages). Not in `test:sanity`, so nothing runs it.
- Line-item tables with no `project_id` (`change_order_line_items`,
  `invoice_line_items`, `pay_application_lines`, `proposal_lines`,
  `cash_flow_line_items`, `portal_sub_pay_app_line_items`) keep the company-role
  RLS gate; a job role does not reach them from the browser. The server routes that
  read them are guarded by the parent's job through `requirePermission`.
- Cross-job list routes (`/api/rfis/list`, `/api/daily-logs/list`, the dashboard
  rollups) still read with the company role and service client: a person with
  "No access" on one job can see that job's rows in a company-wide list. Project
  pickers (`/api/projects`, `/api/projects/list`) already drop the job.
- `app/api/roles/assignments/[id]/route.ts` PATCH can move a grant onto a job where
  the person already has one; the new one-job-row index turns that into a 500
  instead of a 409.
- A PATCH that moves a record to another job (`project_id` in the body) is checked
  against the job the record is on now, not the one it is moving to.
- FIXED (fix/offline-leftovers): "Waiting for Signal" badges now use the amber `pending` Badge tone; videos carry
  the phone's client id (`project_files.client_id`, migration 20261017f) and are filed once.
- `lib/status-colors.ts` `under_contract` is #E8FF2A (neon yellow-green) — every `Badge tone="under_contract"`
  (e.g. `app/app/settings/page.tsx:475` "Trial") paints a yellow label, against DESIGN_SYSTEM §4. The comment
  above STATUS_COLORS says under contract is blue. Needs a ruling on the color.
- `--title-section` is `var(--c-yellow-hi)` (`app/globals.css:217`): every Card / section heading is yellow text,
  against DESIGN_SYSTEM §4 ("yellow never labels"). Needs a ruling.
