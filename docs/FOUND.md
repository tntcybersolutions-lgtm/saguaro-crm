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
- `app/api/daily-logs/list/route.ts:21` — catch block silently eats the DB error (returns 500 with `source:'error'` but logs nothing server-side; violates §5 zero-empty-catch). Off-path, not fixed.
- `app/api/daily-logs/[id]/route.ts:19,32,73` — GET, PUT, DELETE all use bare `catch {}` returning a raw string `'Internal server error'` with no `apiError` and no correlation id (§3, §5).
- `app/api/leads/[id]/media/route.ts:33,69` — references table `deal_media` which is not in `lib/database.types.ts`, causing TS2769 type errors. Pre-existing, not in daily-logs path.
- `app/api/reviews/route.ts:23,58` — references table `customer_reviews` which is not in `lib/database.types.ts`, causing TS2769 type errors. Pre-existing, not in daily-logs path.
