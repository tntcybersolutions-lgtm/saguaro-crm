# The CRM sales side — the plan

The sales half of Saguaro, taken to working. Written 1 Oct 2026 after reading
the code; every number here was measured against the live `lead_pipeline` table,
not estimated.

The goal is a **deal page with a stage button bar** — open one lead, see the
stages as buttons, see where it sits, one obvious next action, and at the end a
button that turns it into a customer and a job without retyping anything.
Reference design: `https://claude.ai/artifact/DYYauoJHUMFhC3T1hnqodJ` (a mockup,
not working software).

## What already exists — do not rebuild it

- `lib/project-phase.ts` — the whole stepped model, for JOBS: phase
  (`bidding` / `building`) → ordered steps → step numbers in the nav →
  `stepsDone()` → `currentStep()`. This is the pattern to mirror, not reinvent.
- `components/SalesJourneyRail.tsx` + `lib/sales-journey.ts` — a sales rail
  already exists, 6 steps, deliberately BLUE where the build journey is GOLD.
- `app/app/leads/page.tsx` — a 7-stage kanban: New, Contacted, Qualified,
  Proposal, Negotiation, Won, Lost.
- `app/api/sales/overview` + `components/SalesOverview.tsx` — the dashboard
  panel for a salesperson.

**What does not exist: any per-deal page.** There is no `app/app/leads/[id]`.
Every lead is a modal on a board, so there is nothing to walk into.

## Phase 0 — one stage vocabulary. DO THIS FIRST.

The pipeline is split across two spellings of the same stage. Measured:

```
10 leads: 5 Title Case, 5 lowercase
distinct stages: Contacted | Lost | negotiation | Negotiation | new |
                 proposal | Proposal | qualified | Won

qualified pipeline counted today:  3 deals / $9,512,000
what it should be:                 7 deals / $12,932,000
```

**$3,420,000 of pipeline is invisible.** Three readers, three different wrong
answers on the same rows:

| file | filter | effect |
|---|---|---|
| `app/app/leads/page.tsx` | `if (byStage[l.stage])` | the 5 lowercase leads are dropped from the board AND every stage count |
| `app/api/sales/overview/route.ts:83` | raw `String(l.stage)` as the key | renders DUPLICATE columns for the same stage |
| `app/api/sales-journey/route.ts:35` | `.in('stage', ['Qualified',…])` | Postgres `IN` is case-sensitive, so lowercase rows never count |

Fix: one canonical `LEAD_STAGES` + `normaliseStage()` in a leaf module with no
server imports (the same reason `lib/permission-categories.ts` exists), all
three readers importing it, and an additive backfill so stored values are
consistent. Nothing else in this plan shows a correct number until this lands.

## Phase 1 — the deal page and its button flow

New `app/app/leads/[id]`: stage buttons across the top in order, the current one
lit with "you are here", completed ones ticked, one primary next action per
stage, activity beneath. Mirror the shape of `lib/project-phase.ts` so sales and
jobs feel like one product. Blue, per the rail's existing convention.

No step is ever locked or forward-only — same rule the build rail already states.

## Phase 2 — the handoff, which is the whole point

`lead_pipeline` already has **`project_id` and `customer_id`** columns. The PATCH
allowlist in `app/api/leads/[id]/route.ts` excludes them, and its comment says
`converted_project_id … intentionally dropped` — it is checking for a column
name that does not exist while the real one sits beside it. So a won lead can
never be linked to its job through the API.

Wire Won → create the customer, open the job, carry name / value / project type /
location across, write both ids, hand off to the gold build journey.

JobTread's own pitch is "a won lead flows straight into an estimate and then a
job, with no re-entering data". That chain is what this phase buys.

## Phase 3 — numbers that match

Board, `SalesOverview.byStage` and the sales-journey signal all read ONE
function, with a harness that proves the three agree against live rows.

## Open decision: an Estimate stage?

JobTread's reference pipeline is New → Contacted/qualifying → **Estimate in
progress** → Proposal sent → Won/Lost. So they DO have Estimate as a stage, and
they do NOT have Negotiation. They also let each contractor define their own
stages, so there is no canonical answer — only what matches how Saguaro's
customers sell.

Saguaro's seven have Negotiation and no Estimate, with pricing living on the bid
board. The argument for adding Estimate: pricing is genuinely a phase a deal
sits in for weeks, and "stuck in estimating" is exactly the state that goes
quiet and never gets chased. Chad's call — it changes the button bar, so decide
before Phase 1 is built.

## Smaller things found while reading, not yet fixed

- `app/api/leads/[id]/route.ts` — dead `const msg = "Failed"`, and it returns a
  raw `'Internal server error'` instead of `apiError`, so there is no
  correlation id. Against §3.
- `app/api/portals/[...path]/route.ts` — the GET catch swallows the error with no
  log and no `apiError`.
