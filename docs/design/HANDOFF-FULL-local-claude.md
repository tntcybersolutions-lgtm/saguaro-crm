# SAGUARO REDESIGN — FULL HANDOFF FOR LOCAL CLAUDE

Single source of truth. You (local Claude, on the Windows machine with a browser + the
Vercel preview) own the **rendered/visual** redesign from here. The cloud session did all
the browser-independent work; this document tells you exactly what exists, what not to
redo, how to pick it up, and the full remaining spec.

---

## 0. TL;DR — do these in order
1. `git fetch origin && git checkout redesign/obsidian-glass && git pull`
2. Rebase/merge it onto the latest `main` (see §3) and resolve conflicts keeping BOTH the
   cloud's functional changes and your visual work.
3. Run the checks (§4). They must stay green: style PASS, **0 new** tsc errors.
4. Execute Passes 3–6 (§5), verifying each screen on the Vercel preview.
5. Merge to `main` only with Chad's OK (§8).

**Do NOT redo** anything in §2 — it's done, verified, and on the branch.

---

## 1. Repo & branches
- Repo: `tntcybersolutions-lgtm/saguaro-crm` (the live Next.js app; deploys to
  `www.saguarocontrol.net`).
- **Main working branch: `redesign/obsidian-glass`** — 11 commits, 84 files, +811/−151 vs main.
- Other small cloud branches to fold in if not already merged (check `git branch -r`):
  - `fix/phase-label-prominent` — bigger/brighter Bidding/Building phase pill in `AppSidebar.tsx`
  - `fix/ios-match-prod-domain` — `capacitor.config.ts` → `www.saguarocontrol.net`
  - `fix/brand-image-fill-square` — company photo fills its square (`object-fit: cover`) in `AppSidebar.tsx`
- Shells: `app/app/layout.tsx` (global) and `app/app/projects/[projectId]/layout.tsx` (project rail).
- Flag registries: `lib/company-tools.ts`, `lib/project-tools.ts`.

---

## 2. What the cloud session already did — DONE, do not redo
Commits on `redesign/obsidian-glass` (newest first):
- `f8872dd` per-module visual spec (`docs/design/HANDOFF-visual-passes-3to6.md` — also inlined in §5)
- `36400d7` **safe-json**: `lib/safe-json.ts` + crash-proofed 4 `JSON.parse(localStorage…)` reads; removed a stray console.log
- `b3d4d2b` `docs/design/verification.md`
- `f5e2604` **D1 part 3**: eliminated native `prompt`/`confirm` app-wide (31 sites; 8 handlers made `async`)
- `6ab559a` **D1 part 2**: `window.alert` → `alertDialog` (20 sites)
- `4c8509a` **D2 part 2**: widened 7 inline page wrappers → 2200
- `9229ad7` **D2 part 1**: widened 66 `PremiumSurface` page-surface props (46 files) → 2200
- `c6e7459` **D1 part 1**: built `lib/ui/async-dialog.tsx`; converted the 6 flagged files (12 sites)
- `807ccf9` `docs/design/functional-gaps.md`
- `4eca8ca` **Pass 2 tokens**: `layout` group in `lib/design-tokens.ts` + `design-system.md`
- `a1a194b` **Pass 1**: `route-inventory.md` (218 routes) + `visual-findings.md`

**Net result already in place:**
- **No native `window.prompt/confirm/alert` anywhere** in `app/` or `components/` — all route
  through `lib/ui/async-dialog.tsx` (`textPrompt` / `confirmDialog` / `alertDialog`). Keep it that way.
- **Full-width (D2):** page surfaces widened to the 2200 standard; forms/modals/descriptions
  left constrained on purpose.
- **Tokens:** `lib/design-tokens.ts` has the `layout` group (geometry). Native fonts kept; brand
  is **NEON YELLOW `#FFE600`** via `--brand-primary`. Inter and the champagne `#ebc275` were
  rejected; the parallel `.sg-root` system was **not** mounted.
- **Robustness:** `lib/safe-json.ts` for storage reads; storage-connector `test`/`saveConfig`
  now error-handled (no silent failure on non-JSON responses). *(commit `ef5b854`)*
- **Security:** full API permission/tenant-isolation audit of all **713** routes — **clean**,
  no cross-tenant IDOR and no unauthenticated mutations. See `security-audit-api.md`. *(commit `bfc3f1b`)*
- **Docs (8):** `docs/design/{route-inventory,visual-findings,design-system,functional-gaps,verification,security-audit-api}.md`
  + the two handoffs (`HANDOFF-visual-passes-3to6.md`, this file).

Branch total: **86 files, +1062/−153** vs main. Every commit: style guard PASS, 0 new tsc
errors (8 pre-existing in `leads/[id]/media` + `api/reviews/route` are not ours).

---

## 3. Picking it up (rebase onto current main)
Main has moved since the branch base. Rebase and resolve, keeping both sides:
```
git checkout redesign/obsidian-glass && git pull
git fetch origin main
git rebase origin/main        # or: git merge origin/main
```
Likely conflict files (you edited them too in the dashboard/design-system work):
`AppSidebar.tsx`, `lib/design-tokens.ts`, the bids/leads pages, and any prompt-converted module
pages. **Resolution rule:** keep the cloud's functional changes (async-dialog calls, the
`layout` tokens, safe-json, widened max-widths) AND your visual changes — they're in different
regions and both are wanted. If a module page shows `(await confirmDialog({…}))`, that's the
cloud's D1 work — keep it; its handler is already `async`.

---

## 4. Verify (must stay green on every commit)
```
node tools/check-style-escapes.mjs      # must print nothing / PASS (no <style> with quotes)
npx tsc --noEmit                         # only the 8 known pre-existing errors; 0 new
npm run build                            # full production build (the real gate; needs env on Vercel)
```
Preview: every push to the branch builds a Vercel preview — open it to verify the look at
390 / 768 / 1440 / 1920 / 2560, light + dark, keyboard + focus.

---

## 5. THE WORK — Passes 3–6

### Global rules (every screen)
- Use the `components/ui` kit: `PageShell`, `DataTable`, `FormModal`, `Field`, `Input`,
  `Textarea`, `Select`, `Toolbar`, `Tabs`, `StatRow`, `Badge`, `Button`, `EmptyState`,
  `RowActions`, `Menu`, `Toast`/`useToast`. Tokens from `lib/design-tokens.ts`
  (`layout`, `colors`, `font`, `radius`, `shadow`, `z`). Status colors: `lib/status-colors.ts`.
- Native system font; `#FFE600` via `--brand-primary`; no `.sg-root`.
- One global sidebar at a time; the project rail is workflow groups, never a 2nd global nav.
- Full-width workspace (`width:100%`, `max-width:none`, `min-width:0` on shrinking flex/grid
  children). Forms stay `layout.formMaxWidth` (760); reading `75ch`; detail rail 320–384px.
- Page anatomy: context/breadcrumb → title + ONE filled primary action → optional `Tabs` →
  compact `StatRow` (each metric opens filtered records) → `Toolbar` → workspace →
  totals/pagination. Infrequent actions go in `RowActions` overflow, not equal-weight buttons.
- Distinct **loading / empty / error / forbidden** states. Empty history ≠ a trend;
  a failed query ≠ zero. No fabricated records/metrics/charts. A button with no implementation
  → honest unavailable state, and log it in `functional-gaps.md`.
- Preserve auth, RLS, tenant isolation, roles, approve-to-share separation, payment math.
  No `window.*` dialogs (use the async-dialog helpers). No truncation on money amounts.

### Pass 3 — four reference screens FIRST (prove the pattern, then mass-migrate)
1. **Dashboard / project home** (`/app`, `/app/dashboard`, project `overview`): action-first —
   ≤4 prioritized `StatRow` metrics, an assigned-work list, a portfolio surface, a compact
   recent-activity/risk area. Kill the wall of equal-weight module cards. Each metric discloses
   scope and opens the relevant filtered records.
2. **Dense table + detail** (RFIs `/app/projects/[id]/rfis`, or invoices): `DataTable` list
   (pinned identifier, right-aligned amounts with tabular numerals, `Badge` status) → detail
   workspace + 320–384px metadata/action rail.
3. **Bid leveling** (`/app/bids/leveling`, `/app/projects/[id]/bid-packages/[id]`): scope rows ×
   bidder columns; scope pinned left, totals pinned bottom. Separate submitted (immutable) vs
   internal adjustments vs normalized totals. Lowest price ≠ recommended. **Subs never see
   competitor bids or internal leveling.**
4. **Drawings / canvas** (`/app/projects/[id]/drawings`): sheet is the dominant surface; compact
   revision rail; collapsible metadata. Preserve the existing viewer/measurement behavior.

Validate all four against these rules on the preview before mass migration. Don't wait for
another prompt once they pass.

### Pass 4 — every module family (match to `docs/design/route-inventory.md`)
| Module | Routes | Target |
|---|---|---|
| Public/auth | `/`, `/login`, `/signup`, `/accept-invite`, onboarding | unified logo/CTA; forms keep intentional max-width; validation/error/loading/success states; real visuals only |
| Dashboard/My Work | `/app`, `/app/my-work` | Pass 3 #1; metrics disclose scope + open records |
| Projects | `/app/projects`, `/app/projects/[id]/overview` | portfolio `DataTable` fills workspace; home = milestones/exceptions/upcoming/files, not oversized tool tiles |
| Bid pkgs/jackets | `/app/bids`, `/app/projects/[id]/bid-packages/[id]` | tabs Overview/Scope/Documents/Bidders/Responses/Activity; progressive create form; unissued ≠ issued |
| Bid leveling | `/app/bids/leveling` | Pass 3 #3 |
| Drawings/doc-versions | `/app/projects/[id]/drawings`, `/app/document-versions` | Pass 3 #4 |
| Takeoff/Signal Studio | `/app/takeoff`, `/app/projects/[id]/takeoff`, `/app/signal-studio` | canvas-first, full width+height, collapsible tool panels. **Signal Studio is a 133-line launcher — confirm it routes into the real network/laser tools; label honestly, don't present a studio that isn't there** |
| Files/submittals | `/app/documents`, `/app/projects/[id]/submittals` | document register (name/type/rev/date/owner/actions); open in a viewer, not a download+giant-cards page; upload/failed/replace states |
| Photos | `/app/projects/[id]/photos` | real thumbnails, consistent aspect ratio, full-screen keyboard-accessible viewer; refresh expiring authorized URLs via existing access control — never publicize private media |
| RFIs | `/app/projects/[id]/rfis` | Pass 3 #2; overdue/in-review/answered/closed distinct (not a rainbow); keep the `'T12:00:00'` date convention — no UTC shift |
| Schedule/Gantt | `/app/schedule`, `/app/projects/[id]/schedule` | pinned task-name column, today marker, dependency connectors; don't claim critical-path/drag/dependency-validation unless implemented |
| Financials | `/app/invoicing`, `/app/billing`, `/app/projects/[id]/pay-apps` | aligned currency/precision/sign; no truncation on amounts; approval/record-payment stay explicit existing workflows |
| Change orders | `/app/projects/[id]/change-orders` | original/revised coherent, no invented baseline; preserve negative deductive COs; sharing ≠ approval (separate controls/labels) |
| Permits/inspections | `/app/projects/[id]/permits`, `/inspections` | scheduled/completed/passed/failed/reinspection per data model; never auto-mark passed |
| Daily logs/issues | `/app/daily-logs`, `/app/projects/[id]/daily-logs`, punch-list | date-organized feed; internal commentary hidden from external roles |
| Crews/time/T&M | `/app/projects/[id]/crews`, `/app/time`, tm-tickets | map/list split, dated entries, ticket totals, signature status; "live" only with a timestamp |
| Radio | `/app/radio` | PTT + channel identity + real connection state; never fake an active transmission/translation |
| Autopilot/alerts | `/app/autopilot`, `/app/intelligence` | evidence-and-action inbox (severity/record/reason/time/status/next-action); AI summaries labeled as AI; no autonomous authority to pay/award/publish; errors ≠ All Clear |
| Reports | `/app/reports`, `/app/reports-builder` | shared header + date/project/scope controls; every number same scope; last-refresh shown; exports real or documented gap (no dead button) |
| Admin | `/app/people`, `/app/roles-permissions`, `/app/settings`, branding | Admin section with secondary nav (not 7 permanent global links); branding live preview + saved/unsaved state, must not reset unrelated config |
| Portals | `/app/client-portal`, `/app/sub-portal`, `/app/portals` | same tokens, reduced density per role; subs never see internal controls/competitor bids |
| Mobile | all | one mobile shell; bottom nav 4–5 + More; safe-area padding; 44–48px touch targets; visible active tab; no desktop sidebar inside the phone layout |

### Pass 5 — mobile / a11y / performance
Keyboard + focus restoration, contrast on real (incl. glass) backgrounds, non-text/focus
contrast, 320px reflow, light + dark, long data, Capacitor iOS WebView + safe areas. Reduce
expensive effects before readability. Avoid per-cell backdrop filters / blur animations.

### Pass 6 — evidence
Update `docs/design/verification.md` + `functional-gaps.md`: before/after screenshots,
per-route status (verified / blocked / out-of-scope with reason), actual command results,
measured regressions, remaining gaps, preview URL, rollback approach. No route marked "done"
until browser-verified. Nothing to `main` without approval.

---

## 6. Guardrails (non-negotiable, every pass)
- Don't replace APIs, rename DB columns, disable RLS, change payment math, or put service keys
  in browser code. Don't insert demo/fake data. Don't auto-publish or widen share scope.
- Hiding a control is not authorization — server guards stay. Salesperson wall (Admin:None →
  Company section hidden + 403) is live and verified; don't regress it.
- US English only. No AI fonts. One icon set; no emoji as operational status.

## 7. Key files reference
- `lib/ui/async-dialog.tsx` — `textPrompt({title,label,defaultValue,multiline,type,required})`,
  `confirmDialog({title,message,confirmLabel,danger})`, `alertDialog({title,message})`. All
  promise-based, styled, ESC/backdrop/focus, SSR-safe. Use these instead of `window.*`.
- `lib/design-tokens.ts` — `colors`, `brand`, `space`, `font`, `radius`, `shadow`, `sidebar`,
  `breakpoint`, `z`, **`layout`** (gutter, topbarHeight, navWidth/Collapsed, controlHeight,
  rowHeight/Compact, formMaxWidth 760, readingMaxWidth 75ch, detailRailMin/Max).
- `lib/safe-json.ts` — `safeJsonParse(raw, fallback)` for storage reads.
- `components/ui/kit.tsx` + `components/ui/premium.tsx` — the shared components.
- `components/AppSidebar.tsx` — global + project rail (permission-gated via `usePermissions`).

## 8. Merge process
PR `redesign/obsidian-glass` → `main` (after Chad reviews the preview). Vercel deploys prod on
merge. Fold in the three small `fix/*` branches too (they may already be merged — check). The
cloud session CANNOT merge (harness blocks main pushes; its GitHub tools are scoped elsewhere),
so merging is yours or Chad's.

## 9. Coordination with the cloud session
The cloud session keeps doing browser-independent work on this same branch (more functional
defects: unguarded `fetch` error handling, remaining `JSON.parse`, dead buttons). To avoid
clobbering: it works in `lib/`, API routes, and non-visual logic; you own the visual/JSX. If
you're about to edit a file heavily, say so and it'll stay out of that file. Pull before large
edits. Nothing merges to `main` without Chad's go.
