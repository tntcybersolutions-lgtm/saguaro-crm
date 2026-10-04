# Functional Gaps — Saguaro CRM

_Pass 1/6 deliverable (§12 #5). Records modules that are **present but thin/stub** vs. real, from routes + backing APIs + implementation size. This is a code-level presence audit; whether every control works end-to-end still needs signed-in, browser verification (noted per module)._

## Promoted modules — real (route + backing API + substantial implementation)
| Module | Page lines | Backing API | Status |
|---|---|---|---|
| My Work | 378 | yes | real |
| Crews | 679 | yes | real |
| Radio | 5150 | yes | real (large) |
| Takeoff Studio | 2608 | yes | real |
| Bids / Bid Board | 823 | yes | real |
| Documents | 967 | yes | real |
| T&M Tickets | 1069 | `api/tm-tickets` (4) | real |
| Schedule | 850 | yes | real |
| RFIs | 765 | yes | real |
| Daily Logs | 903 | yes | real |
| Inspections | 428 | yes | real |
| Permits | 427 | yes | real |
| Change Orders | 687 | yes | real |
| Invoicing | 645 | `api/invoices` (10) | real |
| Pay Apps | 513 | yes | real |
| Autopilot | 279 | yes | real |
| Reports | 358 | yes | real |

## Flagged — present but thin (verify, don't assume)
| Module | Finding | Action |
|---|---|---|
| **Signal Studio** | **Confirmed on the preview (3 Oct):** `/app/signal-studio` is a project picker that routes into `components/signal-studio/Designer.tsx` — the wireless coverage (heat-map) designer that calls the `api/network` / `api/laser` routes. It is a real tool with a launcher in front of it, not a stub. | Pass 4 relabeled the page "Wireless coverage designer" and kept the launcher honest: pick a project or start without one; the Designer renders unchanged. No standalone "studio" is claimed. |

## Rule for the redesign (§3/§8)
A present button is not a working feature. Where a control has no implementation, keep an **honest unavailable state** and record it here — never dress a stub as done. This file is updated as each module is migrated and browser-verified.

## Pass 4 — what was migrated and what could not be exercised (3 Oct)
Every module in the Pass 4 order is on the kit (see `verification.md` for the per-route table).
Controls that exist but could **not** be driven on the preview because the tenant holds no
records for them — they are migrated, not verified:

| Module | Unexercised controls | Why |
|---|---|---|
| Crews, T&M Tickets | detail workspace, row actions | zero crews / tickets on any project |
| Permits, Inspections, Submittals | register table, detail rail, Advance / Ball-in-Court, re-inspection | zero records on any project |
| Document Versions | register, History / Compare / Upload / Check Out / Access dialogs, overlay | zero documents |
| Autopilot | alert register, Acknowledge / Dismiss | every check clear |
| Reports | Sage results table, exports | not run — spends Sage credits |
| Bid Packages | wizard submit | would create a real package |

Honest unavailable states are in place for each (empty states name the action that creates
the first record). Nothing is dressed as done.
