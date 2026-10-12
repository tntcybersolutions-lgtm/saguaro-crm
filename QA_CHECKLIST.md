# QA checklist — navy/slate platform pass

Rules: `DESIGN_SYSTEM.md`. Work plan: `SITE_UPDATE_PLAN.md`. This file is the
record of what has been checked, on which surface, and how. A row moves forward
only on evidence; nothing is marked verified from code alone.

## Status words

| Status | Means |
|---|---|
| Not reviewed | Nobody has looked at this screen on this surface in this pass |
| Needs review | Baseline audit ran; the page file was not changed in this pass, so the shared fixes are all it got |
| Needs correction | Reviewed; a defect is open (listed in the row) |
| Implemented | The fix is in code on the branch; not yet seen on a running build |
| Visually verified | Seen on a running build at that width (audit screenshot or a person), no open defect |
| Functionally verified | Signed in, every control clicked, a record created → saved → reopened with every field back |
| Blocked | Cannot be checked; the reason is in the row |

Web 390 means WebKit with iPhone 15 metrics at 390 px. **It is not iOS evidence.**
The iOS column needs the app itself (Capacitor shell on the simulator or a device).

## Acceptance criteria (every screen)

1. **Colour** — background, panels, raised surfaces, borders and text use the tokens
   (`#101722 / #1B2636 / #243247 / #334155`, text `#F8FAFC / #CBD5E1 / #94A3B8`).
   No page-local hex for those roles.
2. **Yellow** — only the one primary action and the selected item. Audit: at most one
   yellow-filled button outside navigation (`yFill` ≤ 1 plus selected tabs), no yellow
   text, borders or tints (`yText`, `yBorder` = 0).
3. **Links** — `#38BDF8`. **Status** — green / amber / red always beside a word.
4. **Type** — nothing under 12 px (uppercase table headers excepted at 11). Inputs 16 px
   on phones. Contrast ≥ 4.5:1 for text.
5. **One summary** — at most one row of summary figures; no figure repeated elsewhere
   on the screen.
6. **Empty / error** — one compact line plus at most one action; no tall empty panel,
   no side rail of instructions beside an empty list.
7. **Hierarchy** — top bar → page title → record → one summary → content → one primary
   action (top right; bottom of a form on phones).
8. **Shape** — radius 8 / 10 / 12; fully round only for badges and avatars.
9. **Phone** — no sideways scroll at 390 and 320; 44 × 44 targets; nothing hidden under
   the tab bar or the notch; long values truncate with the full value available.
10. **Behaviour unchanged** — every button still does what it did; create → save →
    reopen keeps every field.

## How the table is produced

`tools/probe-audit.mjs` (ops branch) signs in as the real company on production, opens
every route of a group at 390 (WebKit iPhone) and 1440 (Chromium), saves screenshots and
measures the items above. Results are encrypted to the repo key; screenshots are never
committed. "Before" = production at `8a260258` (12 Oct 2026), before this pass.
After the pass deploys, the same audit runs again and each row's Web columns move to
Visually verified or Needs correction.

## Acceptance pass — redesign round (#150–#154), 12 Oct 2026

This section records the screens this round changed. It supersedes their rows in the tables below.

**Acceptance target.** Production https://www.saguarocontrol.net at main `3007f435` (#154).
- Deployment `dpl_H8tBkcqy`: READY, holding `saguarocontrol.net` and `www.saguarocontrol.net`.
- Commits that reached production in this round:

| PR | Commit | Change |
|---|---|---|
| #151 | `c1ada85c` | Redesign merge |
| #152 | `e7f1ef65` | Acceptance fixes; role-colour migration |
| #153 | `fcbfe8ba` | Prequalification empty states; one primary on invoice |
| #154 | `3007f435` | PDF viewer chrome on the approved tokens |

**How it was checked.** `tools/probe-accept.mjs` (ops branch) runs in GitHub Actions, signed in as the Saguaro Control CI user.
- **Web 1440:** Chromium at 1440 × 900.
- **Web 390:** WebKit with iPhone 15 metrics (393 × 659 CSS px). This is a mobile-width browser, **not iOS**.
- **Evidence:** screenshots and measurements are in the encrypted bundles on `ops/testflight` (`tools/probe/`). The repo is public, so no plaintext screenshots are committed.

| Run | Production commit | Scope | Result |
|---|---|---|---|
| 38296866595 | `c1ada85c` | Full pass, all screens | 38 checks: 35 pass, 3 fail (fixed in #152, see below) |
| 38301121840 | `e7f1ef65` | Deal, Compliance, Prequalification, invoice, pay app, People | 16 of 17 checks. Then stopped: the script did not close the PDF viewer before Edit SOV (script defect) |
| 38303416134 | `e7f1ef65` | Deal, invoice, pay app, People | 27 of 28 pass. The fail was the script comparing the pay app before the PDF step. Found the invoice two-primary defect (fixed in #153) |
| 38304786629 | `fcbfe8ba` | Prequalification, invoice, pay app | 19 / 19 pass |
| 38306130583 | `3007f435` | Invoice, pay app (PDF viewer re-check after #154) | 19 / 19 pass |
| 38308490581 | `3007f435` | Home, My Work, Jobs, job page, daily log (re-checked because #152 changed shared tabs, pills, status box and chips) | 24 / 24 pass. One low-contrast reading on Jobs at 1440 is the row under the resting pointer in its hover colour; the title is readable in the screenshot |

**Per screen.**
- Visual columns: "Visually verified" means seen in the run's screenshot with the measured checks passing on that commit. The measured checks are:
  - no sideways scroll;
  - no text under 12px;
  - no low contrast;
  - no cut-off text;
  - one yellow primary;
  - selected states are solid yellow;
  - status pill beside the title;
  - no overlapping overlays.
- Functional column: what was actually clicked.

| Screen | Route | Last checked on | Web 1440 | Web 390 (mobile browser) | Functional | iOS native app |
|---|---|---|---|---|---|---|
| Home | `/app` | `3007f435` (run 38308490581) | Visually verified | Visually verified | Brief shows as the alert card; a row opens its record. No tab row shows with this company's data. One yellow primary ("Remind bidders") | Not verified (iOS run blocked at WKWebView attach) |
| My Work | `/app/my-work` | `3007f435` (run 38308490581) | Visually verified | Visually verified | A tab switches in place and lights yellow. The 4 yellow "Remind" buttons are swipe-only actions behind rows, not visible | Not verified (iOS run blocked at WKWebView attach) |
| Jobs | `/app/projects` | `3007f435` (run 38308490581) | Visually verified | Visually verified | At both widths: Building filter selects and narrows; search narrows; row opens the job. Shared states: primary `#FFE000`/`#101722`, hover, focus ring `#38BDF8`, selected chip | Not verified (iOS run blocked at WKWebView attach) |
| Job page | `/app/projects/[id]/overview` | `3007f435` (run 38308490581) | Visually verified | Visually verified | Tool tiles, numbered steps, Details opens in place, a tile opens its tool. Archive asks first and Cancel keeps the job | Not verified (iOS run blocked at WKWebView attach) |
| Deal page | `/app/leads/[id]` | `e7f1ef65` (run 38303416134) | Visually verified | Visually verified | **Functionally verified** on a ZZ AUDIT test lead. Created; stage move, activity add and Edit Deal each saved, reopened and read back. One status line per save; "No date set" when Next Action has no date. Delete: Cancel kept the record, Confirm removed it (API 404). Code unchanged since `e7f1ef65` | Not verified (iOS run blocked at WKWebView attach) |
| Command Center | `/app/command-center` | — | **Blocked** | **Blocked** | **Blocked** (see below) | **Blocked** |
| Compliance | `/app/compliance` | `e7f1ef65` (run 38301121840) | Visually verified | Visually verified | 26 status pills, all ≥ 12px. Selected filter chip solid yellow; a chip click selects it. Code unchanged since `e7f1ef65` | Not verified (iOS run blocked at WKWebView attach) |
| Prequalification | `/app/prequalification` | `fcbfe8ba` (run 38304786629) | Visually verified | Visually verified | No white text on yellow. All four empty cards use the shared empty line (14px, left). Tabs fit at 390. Page unchanged since `fcbfe8ba` | Not verified (iOS run blocked at WKWebView attach) |
| Invoice detail | `/app/invoicing/[id]` | `3007f435` (run 38306130583) | Visually verified | Visually verified | On a ZZ AUDIT draft invoice: Edit opens and Cancel changes nothing (API read-back). PDF produced (200) and shown in the viewer, which closes with Escape. Exactly one yellow primary (Send to Vendor), not pressed because it emails the vendor | Not verified (iOS run blocked at WKWebView attach) |
| Pay app detail | `/app/projects/[id]/pay-apps/[id]` | `3007f435` (run 38306130583) | Visually verified | Visually verified | On a ZZ AUDIT draft pay app: G702/G703 PDF produced (200) and the viewer closes. Edit SOV opens edit mode and Cancel leaves the record unchanged (API read-back). Exactly one yellow primary (Submit to Owner), not pressed because it emails the owner | Not verified (iOS run blocked at WKWebView attach) |
| Daily log | `/app/daily-logs/[id]` | `3007f435` (run 38308490581) | Visually verified | Visually verified | Read-only (no edits made) | Not verified (iOS run blocked at WKWebView attach) |
| People & Access roles | `/app/people?view=roles` | `e7f1ef65` (run 38303416134) | Visually verified | Visually verified | Role dots use the approved values. The one off-palette dot is a company's own custom role (`#3B82F6`), kept on purpose. Data: see the migration note | Not verified (iOS run blocked at WKWebView attach) |

**Defects found by this pass and fixed in shared code.**
- **#152:**
  - two status lines per save (`lib/ui/status.ts`);
  - 11px status pills (`components/ui/Status.tsx`);
  - slate/yellow filter chips (`.k-chip`);
  - cramped tabs on phones (`.fl-tabs`);
  - Prequalification: white-on-yellow buttons and chart in action yellow;
  - deal "Scheduled" shown with no date;
  - built-in role colours migrated.
- **#153:**
  - Prequalification: two empty styles; now kit `EmptyState`;
  - Prequalification: a grid that overflowed at 320px;
  - invoice Document card had a second yellow primary.
- **#154:** PDF viewer chrome was off-palette (`components/PdfViewer.tsx`):
  - the selected Fit toggle showed yellow text in a yellow outline;
  - Close had a red tint;
  - text and surfaces were old hex values.

**Data handling.** Every write used disposable ZZ AUDIT test data. No customer record was created, changed or deleted.
- **Test leads.** Each was named "ZZ AUDIT Accept <6 digits>", created by the script and deleted through the app.
  - 855789 (run 38296866595): deleted through the Delete dialog.
  - 146925: left behind when run 38301121840 stopped early. It was deleted through the app's DELETE at the start of run 38303416134 (200, then 404).
  - 412263 (run 38303416134): deleted through the Delete dialog (404 afterwards).
  - The native iOS run makes and deletes one more (see iOS).
- **Invoice "Audit Customer 903279 · ZZ AUDIT Job 903279" (draft).**
  - Edit was opened and cancelled; the record was unchanged by API read-back.
  - Generate PDF was pressed, which stores the PDF link on that test invoice.
  - Send to Vendor was never pressed.
- **Pay App #1 on "ZZ AUDIT Mesa Flex Office" (draft).**
  - G702/G703 PDF was generated, which stores the PDF links on that test pay app.
  - Edit SOV was opened and cancelled; the record was unchanged by API read-back.
  - Submit to Owner was never pressed.
- **Job page:** the Archive dialog on the ZZ AUDIT Walk Job was opened and **cancelled**; nothing was archived.
- **Daily log:** opened read-only.

**Role colours (migration `20261012d_role_colors_approved`).** Read back on 12 Oct 2026:
- 97 built-in role rows moved from the two legacy seed palettes to the approved colours.
- 0 legacy defaults remain.
- 0 custom roles were touched; 4 custom roles were kept as their companies set them.
- Every changed row is in `role_color_backup_20261012`. `20261012d_role_colors_approved.rollback.sql` restores a row only while it still holds the migrated colour.

**Command Center: blocked.**
- The screen opens only for a company with the `command_center` entitlement. The CI test company does not have it.
- The one production company that has it is a customer account, so it was not used. No production entitlement was changed for testing.
- **Needed:** either (a) a test login for a company that has the entitlement, or (b) Chad's OK to turn the flag on for the Saguaro Control CI company for one run and off after.

**iOS (native app): not verified for signed-in screens.** The app launches and shows the sign-in screen; the signed-in screens could not be driven.

The native app was driven with Appium 2.11.5 and the XCUITest driver 7.27.1, in `ios-evidence.yml` on a macos-14 runner. Any "iPhone probe" WebKit result above is a mobile-width browser, not iOS.

**Binary under test.** The Capacitor shell, built inside each run (not the TestFlight binary):
- Built from `main` at `3007f435`, Debug configuration, for the simulator.
- Bundle id `net.saguarocontrol.field`, in server mode, so it loads https://www.saguarocontrol.net, which serves `3007f435`.
- Simulator: iOS 17.0, 1179 × 2556 screen (iPhone 15 class).

**Native runs.**

| Run | Stage reached | Stopped at | Kind |
|---|---|---|---|
| 38299459065 | App driven for 16 min | Result lost: the commit step's `git pull --rebase` refused a dirty checkout, and there was no artifact | Infrastructure (workflow). Fixed: autostash, plus an encrypted artifact |
| 38304786580 | Appium session requested | Node `fetch` gave up after its built-in 300 s timeout while WebDriverAgent was still building (request 20:37:28, failure 20:42:52) | Infrastructure (test script). Fixed: `node:http` |
| 38306192979 | Session created (iOS 17.0). App launched; its WebView loaded the live sign-in page | Attaching to the app's WKWebView. Appium listed only `NATIVE_APP` for the whole 90 s wait (ending 21:01:46), so it could not sign in and open the routes | Infrastructure (WebView inspection), not an app failure. Not retried, as instructed |

**Seen natively (run 38306192979).** App launch and the sign-in screen, both screenshotted:
- Navy background, slate card, yellow Sign In, blue links.
- Status bar, Dynamic Island and home indicator are clear of content.

**Not seen natively.** Every signed-in screen in the table above.

**Test data.** The iOS run wrote nothing; its test-lead step comes after the WebView attach, which never happened.

**Likely cause (not proven).** Either:
- the WKWebView in this Debug build is not exposed to Web Inspector (`isInspectable`), or
- Appium's remote debugger does not connect on this runner.

**To finish iOS.** Either:
- a person runs the TestFlight build on a device and records the iOS column, or
- the next iOS evidence run confirms the WebView is inspectable in the shell build before driving routes.

**Not verified in this pass.**
- Command Center (blocked, above).
- Customer-facing actions on invoice and pay app (Send to Vendor, Submit to Owner): they email real recipients and were deliberately not pressed.
- Creating a new invoice or pay app: the existing ZZ AUDIT drafts were used, so create → save → reopen was not run on these two.
- The native iOS column, except where a row above says otherwise.
- Screens outside this round's list keep their rows in the tables below.

## Customer portals (23 routes)

Token routes need a live token per portal; the audit only mints a client-portal token
today. Rows below are **Not reviewed** until each has a token or a login.

| Route | Web 1440 | Web 390 | iOS | Functional |
|---|---|---|---|---|
| `/franchise-portal/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/owner-portal/approve/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/bid/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/client` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/client/[token]` | Implemented (dashboard colours) | Implemented | Not reviewed | Not reviewed |
| `/portals/client/login` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/drawing-review/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/invoice/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/lead/[key]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/owner` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/owner/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/radio/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/sign` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/sign/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/sub` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/sub/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/sub/login` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/subcontractor` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/subcontractor/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/w9` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/portals/w9/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |
| `/prequal/[token]` | Not reviewed | Not reviewed | Not reviewed | Not reviewed |

## Public, sign-in and onboarding

Marketing pages are out of scope for this pass (`SITE_UPDATE_PLAN.md`). Sign-in,
sign-up, password reset, invite acceptance and onboarding steps 1–4 are in scope;
their audit group (`public`) has not run yet — **Not reviewed**.

## Signed-in app — job (`project`) and company groups

"Before" columns are the baseline findings. Status columns are as of the last commit
that touched this file.

**State on 12 Oct 2026 (PR #151):** batches 7–11 changed shared components that
every row below renders (list kit, kit, premium, tokens, palette). Those changes
are merged or open in #151 but were **not re-audited** — Chad asked for fixes,
not more audit rounds — so no row was promoted past *Implemented* by them. The
job page (`/overview`), Jobs list, Home and the deal page were rendered locally
with the real components at 390 and 1440 (no sideways scroll); that is not a
signed-in check, so their Web columns stay *Implemented*. iOS stays *Not
reviewed*: the signed-in simulator pass is blocked (safaridriver would not
create a session on the macOS runner).

| Group | Route | Before — 1440 | Before — 390 (WebKit iPhone) | Page changed in this pass | Web 1440 | Web 390 | iOS | Functional |
|---|---|---|---|---|---|---|---|---|
| project | `/app/projects/[projectId]/autopilot` | 2 yellow buttons, <12px ×7, cut-off ×3 | 2 yellow buttons, <12px ×7, cut-off ×7 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/bid-packages` | <12px ×12 | <12px ×12 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/bid-packages/[bidPackageId]` | no data | no data | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/bid-packages/[bidPackageId]/jacket` | no data | no data | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/bid-packages/[bidPackageId]/leveling` | no data | no data | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/bills` | 2 yellow buttons, yellow text ×5, <12px ×25 | 2 yellow buttons, yellow text ×5, <12px ×25, cut-off ×6, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/budget` | <12px ×34 | <12px ×34 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/cash-flow` | 4 yellow buttons, yellow text ×4, <12px ×26 | 4 yellow buttons, yellow text ×4, <12px ×26, cut-off ×5 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/change-orders` | yellow text ×4, <12px ×10 | yellow text ×4, <12px ×10 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/closeout` | yellow text ×9, <12px ×24, cut-off ×1 | yellow text ×7, <12px ×15, cut-off ×6, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/compliance` | 2 yellow buttons, <12px ×2, cut-off ×1 | 2 yellow buttons, <12px ×2, cut-off ×6 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/contracts` | 2 yellow buttons, yellow text ×4, <12px ×20, cut-off ×2 | 2 yellow buttons, yellow text ×4, <12px ×20, cut-off ×11, targets<44 ×5 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/contracts/new/subcontract` | yellow text ×14, <12px ×21 | yellow text ×14, <12px ×21, targets<44 ×12 | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/crews` | <12px ×2 | <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/daily-logs` | <12px ×2 | <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/directory` | yellow text ×1, <12px ×3 | yellow text ×1, <12px ×3 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/drawings` | <12px ×2 | <12px ×2, targets<44 ×2 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/estimate` | <12px ×11, cut-off ×1, oversized empty | <12px ×11, cut-off ×8, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/files` | yellow text ×2, <12px ×7, oversized empty | yellow text ×2, <12px ×7, cut-off ×8, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/inspections` | yellow text ×2, <12px ×12 | yellow text ×2, <12px ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/insurance` | 2 yellow buttons, <12px ×2 | 2 yellow buttons, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/intelligence` | yellow text ×10, <12px ×26, low contrast ×1 | yellow text ×10, <12px ×26, low contrast ×1, cut-off ×3, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/invoices` | 2 yellow buttons, <12px ×3, oversized empty | 2 yellow buttons, <12px ×3, cut-off ×5, oversized empty, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/lien-waivers` | 2 yellow buttons, yellow text ×1, <12px ×10, oversized empty | 2 yellow buttons, yellow text ×1, <12px ×10, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/messages` | yellow text ×3, <12px ×2 | yellow text ×3, <12px ×2, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network` | <12px ×12, cut-off ×3 | <12px ×11, cut-off ×8, targets<44 ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/cables` | 2 yellow buttons, yellow text ×1, <12px ×2 | 2 yellow buttons, yellow text ×1, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/config` | yellow text ×1, <12px ×8 | yellow text ×1, <12px ×8 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/devices` | 2 yellow buttons, yellow text ×5, <12px ×10 | 2 yellow buttons, yellow text ×5, <12px ×10, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/firewall` | 2 yellow buttons, yellow text ×6, <12px ×10 | 2 yellow buttons, yellow text ×6, <12px ×10 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/reports` | yellow text ×13, <12px ×28 | yellow text ×13, <12px ×28, cut-off ×5 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/vlans` | 2 yellow buttons, <12px ×2 | 2 yellow buttons, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/wifi` | 4 yellow buttons, yellow text ×2, <12px ×2 | 4 yellow buttons, yellow text ×2, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/network/wizard` | <12px ×2 | <12px ×2, targets<44 ×12 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/overview` | yellow text ×1, <12px ×2, oversized empty | yellow text ×1, <12px ×2, cut-off ×1, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/pay-apps` | <12px ×10, oversized empty | <12px ×10 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/pay-apps/[payAppId]` | <12px ×14 | <12px ×14, targets<44 ×4 | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/pay-apps/new` | <12px ×13 | clean | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/payroll` | 2 yellow buttons, yellow text ×11, <12px ×2, cut-off ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/permits` | <12px ×2 | clean | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/photos` | <12px ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/proposal` | 2 yellow buttons, <12px ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/punch-list` | <12px ×2 | clean | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/purchase-orders` | 2 yellow buttons, yellow text ×1, <12px ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/rfis` | <12px ×2 | clean | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/safety` | 4 yellow buttons, yellow text ×6, <12px ×10, cut-off ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/schedule` | 2 yellow buttons, yellow text ×6, <12px ×16, cut-off ×4 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/selections` | 2 yellow buttons, yellow text ×4, <12px ×19, cut-off ×1 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/specs` | 3 yellow buttons, yellow text ×2, <12px ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/submittals` | yellow text ×4, <12px ×10 | clean | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/subs` | 2 yellow buttons, yellow text ×4, <12px ×10 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/takeoff` | yellow text ×2, <12px ×10, low contrast ×1 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/takeoff/estimate` | 3 yellow buttons, yellow text ×2, <12px ×5 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/team` | 2 yellow buttons, yellow text ×7, <12px ×10, cut-off ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/timesheets` | 2 yellow buttons, yellow text ×7, <12px ×20, low contrast ×1, cut-off ×1 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/tm-tickets` | yellow text ×4, <12px ×10 | clean | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/todos` | 2 yellow buttons, <12px ×2 | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/app/projects/[projectId]/w9` | 2 yellow buttons, <12px ×10, oversized empty | clean | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| project | `/portals/client/[clientToken]` | yellow text ×4, <12px ×14 | clean | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/approval-workflows` | <12px ×7, low contrast ×3 | <12px ×7, low contrast ×3 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/ask` | yellow text ×1, <12px ×17, cut-off ×1 | yellow text ×1, <12px ×17 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/autopilot` | <12px ×9 | <12px ×9 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/bid-intelligence` | 2 yellow buttons, yellow text ×4, <12px ×10 | 2 yellow buttons, yellow text ×4, <12px ×10 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/bids` | <12px ×2 | <12px ×2, targets<44 ×3 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/bids/leveling` | <12px ×2 | <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/bids/score` | <12px ×2 | <12px ×2, targets<44 ×3 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/billing` | <12px ×2 | <12px ×2, targets<44 ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/billing/cost-control` | <12px ×10 | <12px ×10, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/billing/payapp` | 2 yellow buttons, yellow text ×2, <12px ×2 | 2 yellow buttons, yellow text ×2, <12px ×2, targets<44 ×6 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/catalog` | yellow text ×669, <12px ×2013, low contrast ×223 | yellow text ×669, <12px ×2009, low contrast ×223, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/certified-payroll` | yellow text ×14, <12px ×16 | yellow text ×14, <12px ×16, cut-off ×36, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/classic` | 4 yellow buttons, yellow text ×35, <12px ×225 | 4 yellow buttons, yellow text ×31, <12px ×216, cut-off ×6, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/client-portal` | yellow text ×2, <12px ×6, low contrast ×2 | yellow text ×2, <12px ×6, low contrast ×2, cut-off ×7, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/budget` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/checklists` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/daily-logs` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/directory` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/escalations` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/financials` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/kpis` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/long-lead` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/milestones` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/oac` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/owner-updates` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/portals` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/pre-site` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/qc` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/risks` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/rollout` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/vendors` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/command-center/verify` | yellow text ×4, <12px ×21, cut-off ×6, oversized empty | yellow text ×4, <12px ×15, cut-off ×12, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/compliance` | yellow text ×1, <12px ×32, low contrast ×15, cut-off ×1 | yellow text ×1, <12px ×32, low contrast ×15, cut-off ×9, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/compliance/lien-deadlines` | 2 yellow buttons, yellow text ×1, <12px ×2 | 2 yellow buttons, yellow text ×1, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/compliance/prevailing-wage` | yellow text ×25, <12px ×4 | yellow text ×25, <12px ×4 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/custom-fields` | 3 yellow buttons, yellow text ×1, <12px ×2 | 3 yellow buttons, yellow text ×1, <12px ×2, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/customers` | 2 yellow buttons, yellow text ×7, <12px ×17 | 2 yellow buttons, yellow text ×7, <12px ×17, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/daily-logs` | <12px ×3 | <12px ×3 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/daily-logs/[dailyLogId]` | <12px ×2, cut-off ×2 | <12px ×2, cut-off ×2 | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/dashboard-config` | 2 yellow buttons, yellow text ×2, <12px ×31, cut-off ×2 | 2 yellow buttons, yellow text ×2, <12px ×31, cut-off ×6, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/document-versions` | <12px ×2 | <12px ×2, oversized empty | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/documents` | 2 yellow buttons, yellow text ×20, <12px ×217, low contrast ×50, cut-off ×16 | 2 yellow buttons, yellow text ×20, <12px ×217, low contrast ×50, cut-off ×4 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/fleet` | 2 yellow buttons, yellow text ×1, <12px ×2, cut-off ×2 | 2 yellow buttons, yellow text ×1, <12px ×2, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/integrations` | 3 yellow buttons, yellow text ×4, <12px ×6, low contrast ×1 | 3 yellow buttons, yellow text ×4, <12px ×6, low contrast ×1, cut-off ×4, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/integrations/api-docs` | yellow text ×2, <12px ×2, low contrast ×1 | yellow text ×2, <12px ×2, low contrast ×1, cut-off ×5 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/integrations/quickbooks` | yellow text ×1, <12px ×2 | yellow text ×1, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/intelligence` | yellow text ×24, <12px ×28 | yellow text ×20, <12px ×18 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/intelligence/command-center` | yellow text ×19, <12px ×166, cut-off ×4 | yellow text ×19, <12px ×166, cut-off ×4 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/invoicing` | <12px ×2 | <12px ×2, oversized empty | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/invoicing/[invoiceId]` | no data | no data | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/kit` | <12px ×2 | <12px ×2, targets<44 ×4 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/leads` | <12px ×2, cut-off ×3 | <12px ×2, targets<44 ×4 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/leads/[leadId]` | no data | no data | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/my-work` | 4 yellow buttons, <12px ×2 | 4 yellow buttons, <12px ×2, cut-off ×11 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/notification-settings` | 2 yellow buttons, yellow text ×6, <12px ×14, low contrast ×3 | 2 yellow buttons, yellow text ×6, <12px ×14, low contrast ×3, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/notifications` | 4 yellow buttons, yellow text ×45, <12px ×62, cut-off ×2 | 4 yellow buttons, yellow text ×45, <12px ×62, cut-off ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/people` | yellow text ×24, <12px ×28, low contrast ×8 | yellow text ×24, <12px ×28, low contrast ×8 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/portals` | yellow text ×4, <12px ×10 | yellow text ×4, <12px ×10, cut-off ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/prequalification` | yellow text ×2, <12px ×2 | yellow text ×2, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/projects` | <12px ×2 | <12px ×2, cut-off ×4 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/projects/new` | yellow text ×5, <12px ×60 | yellow text ×5, <12px ×60, cut-off ×4, targets<44 ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/radio` | yellow text ×3, <12px ×33, low contrast ×2 | yellow text ×3, <12px ×30, cut-off ×1, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/reports` | yellow text ×12, <12px ×2 | yellow text ×12, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/reports-builder` | 2 yellow buttons, <12px ×6 | 2 yellow buttons, <12px ×6, cut-off ×7, targets<44 ×16 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/reports/builder` | 2 yellow buttons, <12px ×6 | 2 yellow buttons, <12px ×6, cut-off ×7, targets<44 ×16 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/reports/showcase` | 3 yellow buttons, yellow text ×2, <12px ×12, cut-off ×2 | 2 yellow buttons, yellow text ×2, <12px ×12 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/resource-planning` | yellow text ×2, <12px ×14, cut-off ×1 | yellow text ×2, <12px ×14, targets<44 ×4 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/reviews` | <12px ×3 | <12px ×3, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/roles-permissions` | yellow text ×24, <12px ×28, low contrast ×8 | yellow text ×24, <12px ×28, low contrast ×8 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/sales` | yellow text ×2, <12px ×2 | yellow text ×2, <12px ×2 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/schedule` | <12px ×2, cut-off ×15 | <12px ×2, cut-off ×15, targets<44 ×6 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/schedule/[scheduleId]` | no data | no data | n/a | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/service` | <12px ×2 | <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings` | yellow text ×2, <12px ×2 | yellow text ×2, <12px ×2, cut-off ×1, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings/branding` | <12px ×3, low contrast ×1 | <12px ×3, low contrast ×1, targets<44 ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings/calendar` | <12px ×2 | <12px ×2 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/settings/delete-account` | yellow text ×1, <12px ×2 | yellow text ×1, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings/import` | <12px ×2 | <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings/integrations-hub` | 3 yellow buttons, yellow text ×2, <12px ×2 | 3 yellow buttons, yellow text ×2, <12px ×2, cut-off ×3, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings/payments` | <12px ×2 | <12px ×2 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/settings/platform-integrations` | <12px ×2 | <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/settings/storage` | yellow text ×3, <12px ×5 | yellow text ×3, <12px ×5, cut-off ×5 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/signal-studio` | <12px ×2 | <12px ×2, cut-off ×18 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/sub-portal` | yellow text ×2, <12px ×2 | yellow text ×2, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/subs` | <12px ×22, low contrast ×12 | <12px ×22, low contrast ×12, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/takeoff` | yellow text ×3, <12px ×2, cut-off ×5 | yellow text ×3, <12px ×2, cut-off ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/takeoff/assemblies` | 2 yellow buttons, yellow text ×1, <12px ×2 | 2 yellow buttons, yellow text ×1, <12px ×2, targets<44 ×1 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/takeoff/measured` | yellow text ×5, <12px ×30, low contrast ×3 | yellow text ×5, <12px ×27, low contrast ×3 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/takeoff/rates` | yellow text ×1, <12px ×124, cut-off ×1 | yellow text ×1, <12px ×124 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
| company | `/app/time` | <12px ×10 | <12px ×10 | shared only | Needs review | Needs review | Not reviewed | Not reviewed |
| company | `/app/warranty-claims` | yellow text ×1, <12px ×2 | yellow text ×1, <12px ×2 | yes | Implemented | Implemented | Not reviewed | Not reviewed |
