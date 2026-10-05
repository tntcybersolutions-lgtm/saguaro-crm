# The demo must-pass list

The definition of done for Saguaro. A path is PASS only when it has been driven
end to end against a running build as a real signed-in user, with the output
pasted. Compiling is not done. A green audit script is not done. See CLAUDE.md §0.

**Ordered by how often a real user touches it, not by product-tour order.**
Industry research into why construction software fails is blunt about this:
adoption dies in the field, not the office. Crews abandon software over taps and
loading screens — *"if entering a daily report takes twelve taps and five loading
screens, crews stop using it."* The features touched every single day are the
daily log, time tracking and photos; inadequate schedule management is the single
largest named cause of lost labour productivity (~7 in 10 tradespeople). A path
nobody walks daily can be beautiful and still not save the product.

So the ordering is deliberate: Tier 1 is where a customer quits, Tier 2 is where
they get paid, Tier 3 is where Saguaro wins the deal.

## Two structural facts, established 1 Oct 2026 by reading the repo

1. **There is no `app/field/` in this repo.** CLAUDE.md §7 and §8 both reference
   it (`app/field/more/page.tsx`) and it does not exist. The mobile app is a
   separate repo, `D:\Saguaro-Field`. So the Tier 1 paths below are the WEB
   surfaces, and the mobile equivalents must be driven separately in that repo.
   Any nightly pointed at `saguaro-crm` cannot test the phone app at all.
2. **There are three parallel time APIs**: `app/api/clock`, `app/api/timeclock`,
   `app/api/timesheets`. Path 2 has to establish which one the web page actually
   calls before anything about the clock can be called verified. The web clock
   has previously been found to never write a row.

---

# TIER 1 — touched daily. This is where a customer quits.

For each Tier 1 path, **count the taps from app open to saved at 390px wide and
record the number.** More than about six taps for a daily log is a finding, not
an opinion. Tap counts below say MEASURE because nobody has driven them yet —
writing a number here without driving it would be the exact dishonesty §0 exists
to stop.

### Path 1 — Write today's daily log
- Open `app/app/daily-logs/page.tsx` (572 lines)
- Pick a project, enter crew / weather / work done, save
- Reopen and confirm it persisted with today's practice date, not a UTC date
- API: `app/api/daily-logs`
- Taps at 390px: MEASURE
- Code walk 5 Oct 2026 (no runtime; no .env.local):
  - Page `app/app/daily-logs/page.tsx` exists — CODE-VERIFIED
  - `POST /api/daily-logs/create` exists; client sends `projectId, logDate, weather, temperatureHigh/Low, crewCount, workPerformed, ...`, route reads both spellings — CODE-VERIFIED
  - Route auth (`requirePermission` Projects/Edit), `assertProjectInTenant`, `tenant_id` stamped from session — CODE-VERIFIED
  - Every inserted column exists in `daily_logs` (checked against information_schema on `jddfvugsaosvgllbkzch`) — CODE-VERIFIED
  - `GET /api/daily-logs/list` auth + `tenant_id` filter; returns `logs`, client reads `data.logs` — CODE-VERIFIED
  - `GET /api/projects?fields=id,name` returns `projects`, client reads `d.projects` — CODE-VERIFIED
  - Date: client default is local wall-clock (`localToday`), displayed at local noon — CODE-VERIFIED
  - Reopen: `/app/daily-logs/[id]` reads `GET /api/daily-logs/[id]` key `log`, route returns `log` — CODE-VERIFIED
  - Link hrefs (`/app/daily-logs/[id]`, `/app/projects/[projectId]/daily-logs`) resolve to page.tsx — CODE-VERIFIED
  - Save, persistence after reopen, NWS auto-weather stamp, tap count — NEEDS-LIVE-RUN
- STATUS: CODE-VERIFIED — AWAITING LIVE RUN

### Path 2 — Clock in and clock out
- Open `app/app/time/page.tsx` (474 lines), clock in, clock out
- **First establish which of `app/api/clock`, `app/api/timeclock`,
  `app/api/timesheets` the page actually calls.** Then confirm a row really
  landed in the table that page reads back — this clock has been found before
  reporting success while writing nothing.
- Confirm the entry appears for an admin reviewing timesheets
- Taps at 390px: MEASURE
- STATUS: NOT VERIFIED

### Path 3 — Take a photo and attach it to a job
- Per-project photos: `app/app/projects/[projectId]/photos`
- Upload, confirm it renders in the gallery, confirm it survives a reload
- API: `app/api/photos/route.ts` and the Supabase Storage bucket
- Taps at 390px: MEASURE
- STATUS: NOT VERIFIED

### Path 4 — See what is happening today
- `app/app/page.tsx` dashboard: the action list must show real rows
- `app/app/schedule/page.tsx` (782 lines): today's work is visible
- API: `app/api/dashboard/today`, `app/api/dashboard/stats`, `app/api/schedule`
- **Regression guard:** the dashboard action list returned `{actions}` while the
  hook read `items`, so it rendered empty from the day it shipped. Assert the
  response key the client reads is the key the route returns.
- STATUS: NOT VERIFIED

---

# TIER 2 — the money. Weekly or monthly, and non-negotiable.

### Path 5 — Set a contract and a budget
- `app/app/projects/[projectId]/budget`, API `app/api/budgets`
- Confirm `project_id` vs `projectId` is accepted either way (four endpoints were
  normalised for this; the regression must not come back)
- STATUS: NOT VERIFIED

### Path 6 — Bill the owner with a pay application
- `app/app/projects/[projectId]/pay-apps`, API `app/api/pay-apps`
- G702/G703 builds from live project data; earned-to-date must not sum a column
  that is already cumulative
- STATUS: NOT VERIFIED

### Path 7 — Get a lien waiver signed
- `app/app/projects/[projectId]/lien-waivers`, API `app/api/lien-waivers`
- Approve a pay app and confirm waivers are AUTO-GENERATED. This insert had never
  once succeeded: it named `pay_app_id` (no such column) with waiver_type
  `conditional_partial` (rejected by the check constraint), inside a bare `catch {}`
- Confirm the pending count reaches the dashboard Today feed
- STATUS: NOT VERIFIED

### Path 8 — Raise and approve a change order
- `app/app/projects/[projectId]/change-orders`, API `app/api/change-orders/route.ts`
- STATUS: NOT VERIFIED

### Path 9 — Invoice and record payment
- `app/app/projects/[projectId]/invoices` and `app/app/invoicing`,
  API `app/api/invoices`
- STATUS: NOT VERIFIED

---

# TIER 3 — the sales side. The differentiator.

Real contractors say the incumbents are weakest exactly here: *"BuilderTrend is
very robust but the reporting and CRM is terrible. Same is true of Procore and
the other full-feature options."* Touched less often than Tier 1, worth more
commercially. The full plan with measured evidence is in `docs/SALES-PLAN.md` —
these paths are its phases, not a new invention.

### Path 10 — One stage vocabulary (Phase 0, blocks every path below)
- The pipeline is split across two spellings: `negotiation` AND `Negotiation`,
  `proposal` AND `Proposal`, plus `qualified` and `new`. 5 of 10 rows lowercase.
- Measured: the qualified pipeline counts **3 deals / $9,512,000** where the rows
  say **7 deals / $12,932,000**. $3.42M invisible.
- Three readers each wrong a different way — `app/app/leads/page.tsx`,
  `app/api/sales/overview/route.ts:83`, `app/api/sales-journey/route.ts:35`
- Fix: one canonical `LEAD_STAGES` + `normaliseStage()` in a leaf module, all
  three importing it, plus an additive backfill
- STATUS: NOT VERIFIED

### Path 11 — Take a lead in and work it
- `app/app/leads/page.tsx` (1,562 lines): create a lead, log activity, set a next
  action date, confirm it reaches My Work
- API: `app/api/leads`, `app/api/leads/[id]`
- STATUS: NOT VERIFIED

### Path 12 — Move a deal through the stages
- **NEEDS BUILDING: there is no `app/app/leads/[id]`.** Every lead is a modal on
  the board. This is the deal page with the stage button bar — Phase 1 of
  SALES-PLAN.md. Reference design: `claude.ai/artifact/DYYauoJHUMFhC3T1hnqodJ`
- STATUS: NOT VERIFIED — SCREEN DOES NOT EXIST

### Path 13 — Win it and open the job
- **NEEDS BUILDING.** `lead_pipeline` already HAS `project_id` and `customer_id`;
  the PATCH allowlist excludes them and its comment checks for
  `converted_project_id`, a column that does not exist. So a won lead can never be
  linked to its job. Phase 2 of SALES-PLAN.md.
- One button: create the customer, open the project, carry name / value / type /
  location across, write both ids, hand off to the gold build journey
- STATUS: NOT VERIFIED — HANDOFF NOT WIRED

### Path 14 — The numbers agree everywhere
- Board, `SalesOverview.byStage` and the sales-journey signal all read ONE
  function; a harness proves the three agree against live rows. Phase 3.
- STATUS: NOT VERIFIED

---

# TIER 4 — shown in a demo, not touched daily

### Path 15 — A subcontractor is onboarded and compliant
- `app/app/subs`, `app/app/compliance`, `app/app/prequalification`
- Insurance, W-9, prequal; the sub portal token path at
  `app/api/portals/[...path]`
- STATUS: NOT VERIFIED

### Path 16 — Permissions hold for a non-admin
- Assign a real Salesperson role and confirm the rail hides what they cannot
  open AND no endpoint leaks what the rail hid
- Regression guard: `/api/dashboard/stats` served total contract value and
  monthly revenue to every signed-in user regardless of permission
- STATUS: NOT VERIFIED
