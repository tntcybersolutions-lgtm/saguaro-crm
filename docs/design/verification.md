# Verification — Saguaro CRM redesign (`redesign/obsidian-glass`)

_Pass deliverable (§12 #4). Actual commands + results for what shipped to the branch. Pixel/interaction verification of each screen is pending on the Vercel preview (cloud session has no browser) — noted per item._

## Commands (run on the branch, repeatedly)
- `node tools/check-style-escapes.mjs` → **PASS** on every commit.
- `npx tsc --noEmit` → **8 pre-existing errors only** (leads/[id]/media, api/reviews/route); **0 new** on every commit.

## Shipped & code-verified
| Area | Result | Browser check |
|---|---|---|
| **D1 — native dialogs removed** | **~62 call sites across ~29 files** converted to `lib/ui/async-dialog.tsx` (`textPrompt`/`confirmDialog`/`alertDialog`). 0 `window.prompt/confirm/alert` or bare `confirm/prompt/alert` remain in `app/` or `components/`. 8 handlers made `async`; behavior preserved (cancel = no-op, typed-REMOVE + required reasons enforced; destructive actions styled danger). | Open each dialog on preview to confirm wording/focus |
| **D2 — full-width contract** | 46 files / 66 `PremiumSurface` page-surface props + 7 inline page wrappers widened 1100–1400 → 2200. Forms/modals/descriptions left constrained per §4. | Confirm pages fill workspace at 1440/1920; forms stay narrow |
| **D3 — 100vw** | Re-classified as a **false positive** — the 4 hits are correct `min(.., calc(100vw − gutter))` popovers. No change. | n/a |
| **Pass 2 tokens** | `lib/design-tokens.ts` `layout` group added (gutter/topbar/rail/control+row heights/form+reading/detail-rail). Native font + `#FFE600` kept; Inter/champagne/`.sg-root` rejected. | n/a |

## Not yet done (needs preview/browser — Passes 3–6)
Reference-screen redesigns, per-module visual migration, mobile/a11y/perf sweep, before/after screenshots. These require rendered verification and overlap local Claude's active dashboard/sidebar rebuild, so they proceed on preview with coordination.

## Rollback
All work is isolated on `redesign/obsidian-glass`; nothing merged to `main`. Revert = drop the branch. Each commit is independently revertable.
