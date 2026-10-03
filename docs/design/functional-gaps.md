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
| **Signal Studio** | `/app/signal-studio` is **133 lines** — a project-picker shell with no dedicated `api/signal-studio` and no direct `network`/`laser` API calls from the page. The system *does* have `api/network` (21 routes) + `api/laser` (2). | Likely a **launcher** into the per-project network/signal tools, not a standalone feature. Confirm on the preview: either it routes into working project tools (fine, label as a launcher) or it's an honest gap — do **not** present it as a full studio if it isn't. |

## Rule for the redesign (§3/§8)
A present button is not a working feature. Where a control has no implementation, keep an **honest unavailable state** and record it here — never dress a stub as done. This file is updated as each module is migrated and browser-verified.
