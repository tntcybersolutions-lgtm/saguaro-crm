# Visual Findings — Saguaro CRM

_Pass 1 deliverable (§12). **Observed defects** (measured from source) separated from **recommendations**. Not a pixel audit — rendered-screen verification happens on the preview._

## Baseline (so redesign regressions are distinguishable)
- `tsc --noEmit`: **8 pre-existing errors** (in `app/api/leads/[id]/media`, `app/api/reviews/route`) — not redesign-caused.
- `node tools/check-style-escapes.mjs`: **PASS**.
- 218 user-facing routes; 2 shells; flag registries `company-tools.ts` / `project-tools.ts`.

## Observed defects (measured)
| # | Defect | Evidence | Spec |
|---|---|---|---|
| D1 | Browser `prompt`/`confirm`/`alert` used for business editing | **6 files** incl. `change-orders`, `inspections`, `command-center/budget`, `schedule`, `daily-logs/[id]` | §6 forbids |
| D2 | Fixed `maxWidth` wrappers inside the app workspace | **142 files** under `app/app` | §4 full-width contract |
| D3 | `100vw` used inside the sidebar layout | **4 files** | §4 (causes horizontal overflow) |
| D4 | Hardcoded hex colors instead of tokens (drift) | `#0A0A00`×325, `#FFFFFF`×248, `#CBD5E1`×220, `#3dd68c`×113, `#EF4444`×86, `#22C55E`×81 … | §3/§9 one token source |
| D5 | Two shells mount a sidebar (`app/app/layout.tsx`, `projects/[projectId]/layout.tsx`) — confirm only one renders at a time | layout owners | §4 one global sidebar |

## Recommendations (addressed in later passes)
- **Pass 2:** collapse hardcoded colors onto `lib/design-tokens.ts` (keep native fonts + `#FFE600`); establish the full-width contract (`min-width:0`, `max-width:none`) and remove app-workspace `maxWidth` wrappers (D2) and `100vw` (D3).
- **Pass 4:** replace the 6 prompt/confirm edit flows (D1) with `FormModal`/drawers that keep cancel + error + unsaved-guard behavior.
- **Verify (Pass 1 follow-up):** confirm D5 renders a single sidebar per viewport; the nested project rail must be workflow groups, not a second global nav.
