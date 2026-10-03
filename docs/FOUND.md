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
- (3 Oct, Path 1) `package.json` prebuild — `npm run build` fails locally: HEATMAP ENGINE DRIFT, `lib/heatmap/interfloor.ts` was edited in this repo (7cb3f4fb, #31) instead of the canonical `D:\Saguaro-Field\lib\heatmap`; build only runs with `SAGUARO_PEER_DIR=/nonexistent`.
- (3 Oct, Path 1) `npx tsc --noEmit` — 8 pre-existing errors: `app/api/leads/[id]/media/route.ts:33,69` (`deal_media`) and `app/api/reviews/route.ts:23,58` (`customer_reviews`) — tables missing from the generated Supabase types.
- (3 Oct, Path 1) `app/app/daily-logs/page.tsx:253` — a same-day duplicate save gets the server's 409 ("already exists… open it") but the page throws a generic "Failed to create daily log" and drops `existingLogId`.
- (3 Oct, Path 1) `app/app/daily-logs/page.tsx:383,452` — "This Month" and the modal's gap banner still use the UTC date (`toISOString`), so after 5 pm Arizona the gap is computed against tomorrow.
- (3 Oct, Path 1) `app/api/daily-logs/create/route.ts:47` — server fallback `log_date` is the UTC day when the client sends none (mobile/API callers).
- (3 Oct, Path 1) `app/api/daily-logs/list/route.ts:20`, `app/api/daily-logs/[id]/route.ts:19,54,73` — catches with no variable, nothing logged, not `apiError()` (§3).
- (3 Oct, Path 1) `app/api/daily-logs/list/route.ts` + `[id]` GET use `getUser` only (no `requirePermission`), while create/edit/delete gate on Projects — read is unscoped by role.
