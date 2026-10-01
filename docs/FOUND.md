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
