# Visual Passes 3–6 — per-module spec for local Claude

**Base:** branch `redesign/obsidian-glass` (pull it). It already has: the design docs
(`docs/design/*`), the `layout` tokens in `lib/design-tokens.ts`, D1 (all native
dialogs → `lib/ui/async-dialog.tsx`), D2 (page surfaces widened), and crash-proof
localStorage. **Build each pass on this branch, verify on its Vercel preview, one owner.**

**Global rules (every screen):**
- Use the `components/ui` kit (`PageShell`, `DataTable`, `FormModal`, `Field`, `Toolbar`,
  `Tabs`, `StatRow`, `Badge`, `Button`, `EmptyState`, `RowActions`) + `lib/design-tokens`
  (`layout`, `colors`, `font`, `radius`). Native fonts, `#FFE600`, no `.sg-root`.
- One global sidebar at a time; project rail = workflow groups, not a 2nd global nav.
- Full-width workspace (`width:100%`, `max-width:none`, `min-width:0` on shrinking
  children); forms stay `layout.formMaxWidth` (760); reading `75ch`; detail rail 320–384.
- Every page: context/breadcrumb → title + ONE primary action → optional tabs → compact
  `StatRow` → `Toolbar` → workspace → totals/pagination. One filled primary action; infrequent
  actions in `RowActions` overflow, not equal-weight buttons.
- Distinct loading / empty / error / forbidden states. No fake data. A present button that
  does nothing → honest unavailable state + log it in `functional-gaps.md`.
- Preserve auth/RLS/roles/approve-to-share/payment math. No `window.*` dialogs (done — keep it that way).
- Verify at 390 / 768 / 1440 / 1920 / 2560; light + dark; keyboard + focus.

## Pass 3 — four reference screens first (prove the pattern, then mass-migrate)
1. **Dashboard / project home** (`/app`, `/app/dashboard`, project overview): action-first —
   ≤4 prioritized `StatRow` metrics (each opens filtered records), an assigned-work list, a
   portfolio surface, a compact recent-activity/risk area. No wall of equal cards.
2. **Dense table + detail** (RFIs `/app/projects/[id]/rfis` or invoices): `DataTable` list
   (pinned id, right-aligned amounts, `Badge` status) → detail workspace + 320–384 rail.
3. **Bid leveling** (`/app/bids/leveling`, `/app/projects/[id]/bid-packages/[id]`): scope rows ×
   bidder columns, scope pinned left, totals pinned bottom; submitted values immutable vs
   internal adjustments vs normalized; lowest ≠ recommended; subs never see competitor bids.
4. **Drawings / canvas** (`/app/projects/[id]/drawings`): sheet dominant, compact revision rail,
   collapsible metadata; preserve the existing viewer/measurement behavior.

## Pass 4 — module families (match to real routes in `docs/design/route-inventory.md`)
| Module | Routes | Target |
|---|---|---|
| Public/auth | `/`, `/login`, `/signup`, `/accept-invite`, onboarding | unified logo/CTA; forms keep intentional max-width; validation/error/loading states; real visuals only |
| Dashboard/My Work | `/app`, `/app/my-work` | action-first (Pass 3 #1); metrics disclose scope |
| Projects | `/app/projects`, `/app/projects/[id]/overview` | portfolio `DataTable` fills workspace; home = milestones/exceptions/files, not tool tiles |
| Bid pkgs/jackets | `/app/bids`, `/app/projects/[id]/bid-packages/[id]` | tabs: Overview/Scope/Documents/Bidders/Responses/Activity; progressive create form; unissued ≠ issued |
| Bid leveling | `/app/bids/leveling` | Pass 3 #3 |
| Drawings/doc-versions | `/app/projects/[id]/drawings`, `/app/document-versions` | Pass 3 #4 |
| Takeoff/Signal Studio | `/app/takeoff`, `/app/projects/[id]/takeoff`, `/app/signal-studio` | canvas-first full width+height, collapsible tool panels; **Signal Studio is a 133-line launcher — confirm it routes to the real network/laser tools, label honestly** |
| Files/submittals | `/app/documents`, `/app/projects/[id]/submittals` | document register (name/type/rev/date/owner/actions); viewer not a download+cards page; upload/failed/replace states |
| Photos | `/app/projects/[id]/photos` | real thumbnails, consistent aspect, full-screen viewer; refresh expiring URLs via existing access control |
| RFIs | `/app/projects/[id]/rfis` | Pass 3 #2; overdue/in-review/answered/closed distinct; keep the `'T12:00:00'` date convention (no UTC shift) |
| Schedule/Gantt | `/app/schedule`, `/app/projects/[id]/schedule` | pinned task column, today marker; don't claim critical-path/drag unless implemented |
| Financials | `/app/invoicing`, `/app/billing`, `/app/projects/[id]/pay-apps` | aligned currency/precision/sign; no truncation on amounts; approval/record stay explicit |
| Change orders | `/app/projects/[id]/change-orders` | original/revised coherent; preserve negative deductive COs; sharing ≠ approval |
| Permits/inspections | `/app/projects/[id]/permits`, `/inspections` | scheduled/passed/failed/reinspection per data model; never auto-pass |
| Daily logs/issues | `/app/daily-logs`, `/app/projects/[id]/daily-logs`, punch-list | date feed; internal comments hidden from external roles |
| Crews/T&M | `/app/projects/[id]/crews`, `/app/time`, tm-tickets | map/list split; live only with a timestamp |
| Radio | `/app/radio` | PTT + channel + real connection state; never fake transmission |
| Autopilot/alerts | `/app/autopilot`, `/app/intelligence` | evidence-and-action inbox; AI summaries labeled; no autonomous authority; errors ≠ All Clear |
| Reports | `/app/reports`, `/app/reports-builder` | shared header + scope controls; every number same scope; exports real or documented gap |
| Admin | `/app/people`, `/app/roles-permissions`, `/app/settings`, branding | Admin section w/ secondary nav (not 7 global links); branding live preview + saved state |
| Portals | `/app/client-portal`, `/app/sub-portal`, `/app/portals` | same tokens, reduced density per role; subs never see internal controls/competitor bids |
| Mobile | all | one mobile shell, bottom nav (4–5 + More), safe-area, 44–48px targets; no desktop sidebar in phone layout |

## Pass 5 — mobile / a11y / performance
Keyboard + focus restoration, contrast on real (incl. glass) backgrounds, 320px reflow,
light/dark, long data, Capacitor iOS WebView + safe areas. Reduce effects before readability.

## Pass 6 — evidence
Update `docs/design/verification.md` + `functional-gaps.md` with before/after screenshots,
per-route status (verified/blocked/out-of-scope), command results, regressions. No "done"
for any untested route. Nothing to `main` without approval.
