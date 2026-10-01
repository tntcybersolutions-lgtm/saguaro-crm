# MUST-PASS

The definition of done for Saguaro CRM (CLAUDE.md §0). A path is DONE only when it has been driven end to end against a running build, as a real signed-in user, with the output pasted under it. Code that compiles is not done. A passing audit script is not done.

- One path per session. Report and stop.
- Anything off-path goes in `docs/FOUND.md`. Do not fix it.
- Never write PASS for something you did not drive. If you cannot verify it, write `CANNOT VERIFY: <why>`.
- Every STATUS line below starts as `NOT VERIFIED`.

## How this file was written

Written 1 Oct 2026 by reading code only. Nothing was run. The page and API names below are what the code calls today. The "Read from code" notes are suspicions from reading and are not verified findings. Each one is a thing to check while driving the path, not a bug report.

## Ordering: by how often a real user touches it

Field adoption is where construction software dies. Crews abandon software over taps and loading screens. The things touched every day are the daily log, time tracking and photos. Schedule management is the largest named cause of lost labour productivity. A path nobody walks daily can be beautiful and still not save the product, so Tier 1 comes first.

| Tier | What | Touched |
|---|---|---|
| 1 | Field: daily log, clock in/out, photos, today's schedule | daily; abandonment risk |
| 2 | Money: budget, pay app out, getting paid, change orders, lien waivers, invoices | weekly / monthly |
| 3 | Sales: lead to customer to project | less often, but it is the differentiator |
| 4 | Everything else a demo would show | demo |

Tier 3 matters commercially even though it is touched less than Tier 1. Real contractors say the incumbents' CRM and reporting are their weakest area. `docs/SALES-PLAN.md` holds the measured evidence and the plan. Tier 3 turns its phases into paths.

## Facts that apply to every Tier 1 path

- **There is no `app/field/` directory.** CLAUDE.md §4 and §7 describe `/field/` pages. They do not exist. The "mobile field app" is a Capacitor shell (`capacitor.config.ts`, `android/`, `ios/`, appId `com.saguaro.field`) that loads the deployed web app. Its `server.url` is `CAPACITOR_SERVER_URL` or `https://saguaro-crm-rho.vercel.app`, with no start path, so it opens `/`, not `/app`. Every Tier 1 path is therefore the web app at 390px.
- **There is no bottom tab bar and no quick-action bar at 390px.** `app/app/layout.tsx` has one breakpoint, 768px. Below it the desktop sidebar is hidden and a hamburger in `components/AppTopBar.tsx` opens `components/AppSidebar.tsx` as a slide-over. Inside a project, `app/app/projects/[projectId]/layout.tsx` adds a sticky bar with a "Modules" button that opens a second slide-over.
- **Tap counting rule.** Start: signed in, app open on `/app`, 390px wide. Count every tap, including nav, picker open, picker choice, field focus and save. Typing is not a tap. A OS picker counts one tap to open and one to choose. More than about six taps for a daily log is a finding.

---

# TIER 1: touched daily, abandonment risk

## 1.1 Field daily log

**Taps: 8 on the project page (shortest), 6 to 8 on the global page.** The target is 6 or fewer, so 8 is a finding. Drive both entry points and write the measured count under STATUS.

Steps, project page (the richest):
1. Hamburger. `components/AppTopBar.tsx`
2. "Projects". `components/AppSidebar.tsx`, `app/app/projects/page.tsx`
3. Tap the project card.
4. "Modules" in the sticky project bar. `app/app/projects/[projectId]/layout.tsx`
5. "Daily Logs". `app/app/projects/[projectId]/daily-logs/page.tsx`
6. "Auto-fill from today". Prefills date, crew, superintendent, phase and manpower. Calls `GET /api/projects/[projectId]/daily-logs/prefill?date=`.
7. Tap "Work performed" and type the narrative.
8. Save. Calls `POST /api/daily-logs/create` (`app/api/daily-logs/create/route.ts`).

Steps, global page alternative: hamburger, "Daily Logs" (`app/app/daily-logs/page.tsx`, also opens with `?new=1`), "New Daily Log", project `<select>` (last-used project is prefilled, otherwise 2 taps), "Work performed", "Create". That is 6 taps with the last project prefilled and 7 to 8 without. It calls `GET /api/projects?limit=100&fields=id,name` and `POST /api/daily-logs/create`.

Pass means: the log row exists in `daily_logs` for the right tenant and project, and it reappears in the list after a reload (`GET /api/daily-logs/list`). It also means a second log for the same day returns 409 and the user sees a clear message.

Read from code, check while driving:
- The project page shows the "Daily log created" toast and closes the panel before the POST returns. It rolls back on failure. Confirm a failed save is obvious.
- The side panel is a fixed `width:480` with `flexShrink:0` (`daily-logs/page.tsx` ~614). It is wider than 390px, so check that Save is reachable.
- The global page reads `temperature_high` / `temperature_low` (`app/app/daily-logs/page.tsx` ~30, 299, 303). The create route writes `high_temp` / `low_temp`. The temperature column may always show blank.
- `daily-logs/list/route.ts` and `daily-logs/[id]/route.ts` have catches that do not log.
- There is no photo capture inside the daily-log composer (see 1.3).

STATUS: NOT VERIFIED

## 1.2 Clock in and clock out

**Taps: clock in 3 (one project) or 4 (several). Clock out 3 from cold, 1 if the user is still on the page.**

Steps:
1. Hamburger.
2. "Time Clock". `app/app/time/page.tsx`
3. Project `<select>`, only when there is more than one project (2 taps with a native picker).
4. "Clock in". Calls `POST /api/timeclock/in` (`app/api/timeclock/in/route.ts`) with `{projectId, csiDivision?, lat?, lng?, clientTime}`. Status comes from `GET /api/timeclock/status`.
5. Later: "Clock out". Calls `POST /api/timeclock/out` with `{shiftId, breakMinutes, lat?, lng?, clientTime}`.

`/api/clock/in` and `/api/clock/out` return 410 and are not part of this path.

Pass means: a `time_entries` row is written on clock in, is closed with hours on clock out, and survives a reload (status shows on the clock after refresh). This is the "web time clock never wrote a row" bug class, so look in the table, not just the toast. A second clock-in must return `alreadyOpen`, not a second row.

Read from code, check while driving:
- The project `<select value={projectId}>` has no placeholder option and state starts `''`. With several projects, the first one looks selected but "Clock in" says "Pick a project before clocking in."
- The page also reads and writes `time_entries` and `employees` directly through the browser Supabase client for the entry list and manual add. Confirm that works under RLS.
- Timesheet submission (`app/api/timesheets/create/route.ts`, `app/api/timesheets/[id]/status/route.ts`) is a separate path. It is not covered here.

STATUS: NOT VERIFIED

## 1.3 Take a photo and attach it

**Taps: about 10 to 12 from `/app`.** That is far above the target, so it is a finding.

Steps:
1. Hamburger, 2. "Projects", 3. project card, 4. "Modules", 5. "Photos". `app/app/projects/[projectId]/photos/page.tsx`
6. "Add Photo".
7. "Choose a photo from this computer". It is `<input type="file" accept="image/*">` with no `capture` attribute, so on a phone the OS shows its own chooser.
8. OS camera or library interaction, 1 to 3 taps.
9. Title field. It is required ("Give the photo a title first.").
10. Save. Calls `POST /api/photos/upload` (multipart: `projectId`, `file`, `category`, `caption`; `app/api/photos/upload/route.ts`), then `PUT /api/photos/[id]` (`app/api/photos/[id]/route.ts`) with `{title, description, album, location, taken_at, taken_by, tags}`.

URL-only path: `POST /api/photos/create`. List: `GET /api/photos/list?projectId=`.

Pass means: the file is in the storage bucket, a `photos` row exists with a thumbnail, title and album, and it shows in the grid after a reload. It also means the photo opens at full size.

**Attach to a daily log is not built.** No photo route or page carries a `daily_log_id`, and the daily-log composer has no photo UI. "Take and attach photos" is only half grounded. The attach half **needs to be built**. Until then, verify capture, upload and view, and write `CANNOT VERIFY: attach to daily log has no screen`.

Read from code, check while driving:
- Upload writes `category` and `caption`. The follow-up PUT writes `album` and `title`. The grid groups on `album`. If the PUT fails, the photo is stored untitled and un-albumed, and the user only sees a toast.
- `@capacitor/camera` is installed (`lib/native.ts`) but the photos page does not use it.
- The only `photos`-like table in `supabase/migrations` is `project_photos`, which lacks title/album/tags. Check the live schema.
- No offline capture, and the page does not send GPS.

STATUS: NOT VERIFIED

## 1.4 See today's schedule

**Taps: no direct answer exists.** Hamburger then "Schedule" is 2 taps for the unfiltered list or Gantt. For one project it is 5 taps.

There is **no "today" view anywhere.** Three places come close and none answers it:
- `app/app/schedule/page.tsx` calls `GET /api/schedule/list`, which returns the whole tenant (limit 1000). Today is only a dashed marker on the Gantt.
- `app/app/projects/[projectId]/schedule/page.tsx` calls `GET /api/schedule/list?projectId=` and has the same marker but no filter.
- The home "Today's Priority Actions" card (`GET /api/dashboard/today`) and My Work (`app/app/my-work/page.tsx`, `GET /api/my-work`) contain no schedule tasks.

The "see today's schedule" screen **needs to be built.** What can be driven today is:
1. Hamburger, 2. "Schedule". `app/app/schedule/page.tsx`
3. Find today on the list or Gantt by eye.
4. Create a task, `POST /api/schedule/create` (`app/api/schedule/create/route.ts`), and confirm it appears after a reload.

Pass means: the user can see what is happening on site today in at most 3 taps. This cannot pass today, because that screen does not exist. Write `CANNOT VERIFY: no today view`. Drive the create-and-list part and record it.

Read from code, check while driving:
- The create page sends snake_case dates plus camelCase `projectId`. Check the create route accepts them.
- `schedule/list/route.ts` has a catch that returns `{tasks:[]}` with a 500.

STATUS: NOT VERIFIED

---

# TIER 2: the money, touched weekly or monthly

All project pages are under `app/app/projects/[projectId]/`, written `P/` below.

## 2.1 Budget

Steps:
1. Hamburger, "Projects", project, "Modules", "Budget". `P/budget/page.tsx`. It calls `GET /api/projects/[projectId]/budget` (`app/api/projects/[projectId]/budget/route.ts`).
2. Add a line with cost code, description and original budget. `POST` to the same route.
3. Edit the original budget. `PATCH {id, original_budget}`. Delete is `PATCH {id, _delete:true}`.
4. Export. `POST /api/reports/generate`.

Pass means: a new line persists after a reload, and the totals add up by hand (original + approved changes = revised; committed, actual and projected are shown).

Read from code, check while driving:
- The page types its lines with `approved_cos`, `committed_cost`, `actual_cost` and `forecast_cost`. The table and the route whitelist use `approved_changes`, `committed`, `actual` and `projected`. `load()` does no mapping, so those columns may read 0 for every line. This is the same bug class as `actions` vs `items`.
- `PATCH` writes only `original_budget`. `revised_budget` may go stale.
- `approved_changes` has no UI. No trigger writes it (see 2.4).
- `/api/budgets/*`, `/api/cost-codes/*` and `/api/cost-control` are not used by this page.

STATUS: NOT VERIFIED

## 2.2 Pay application out

Steps:
1. "Pay Applications". `P/pay-apps/page.tsx`, `GET /api/pay-apps/list?projectId=`
2. "New". `P/pay-apps/new/page.tsx`. Context from `GET /api/pay-apps/create?projectId=`. Step 1 is the period, step 2 is the schedule of values (G703).
3. Save draft or submit. `POST /api/pay-apps/create` (`app/api/pay-apps/create/route.ts`), then `POST /api/pay-apps/[id]/submit` (`app/api/pay-apps/[id]/submit/route.ts`). Submit issues the owner-portal token.
4. Detail. `P/pay-apps/[id]/page.tsx`, `GET /api/pay-apps/[id]`. Approve and certify are `POST /api/pay-apps/[id]/approve` and `/certify`.
5. PDF. `POST /api/documents/pay-application`.

Pass means: a `pay_applications` row and its schedule-of-values rows exist, the G702 math is right by hand, the status reaches `submitted`, and the PDF opens.

There is **no in-app "send to owner" screen.** Submit only issues the token and fires the email trigger. Check what the owner actually receives.

Read from code, check while driving:
- Submit, approve, certify and paid do not check the current status, so steps can be skipped or repeated.
- `pay-app-workflow.ts` at the repo root is mostly shadowed by the routes above. Only `record-payment` is reachable (through `app/api/pay-apps/[...path]/route.ts`), and no UI calls it.

STATUS: NOT VERIFIED

## 2.3 Getting paid

Steps (pay app):
1. Open a certified pay app. `P/pay-apps/[id]/page.tsx`
2. "Mark Paid". `POST /api/pay-apps/[id]/paid` (`app/api/pay-apps/[id]/paid/route.ts`). It sets `status='paid'` and `payment_received_at` and adds the amount to the prime contract's `paid_amount`. Unsigned blocking waivers return 409.

Steps (invoice): `app/app/invoicing/[id]/page.tsx`, change the status dropdown to Paid, `PATCH /api/invoices/[id]/update`.

Pass means: the pay app shows paid, the contract's `paid_amount` moved by the right amount, and the unconditional waivers were created (see 2.5).

**A payment-entry screen is not built.** No amount, date, check number or method is captured. `payment_amount` and `check_number` are never written, and `/api/pay-apps/[id]/record-payment` exists but nothing calls it. Recording a real payment **needs to be built**. Marking an invoice paid by status dropdown has no side effects, and `contracts.invoiced_amount` is never incremented anywhere.

Read from code, check while driving:
- The whole `paid/route.ts` handler sits in a bare `catch {}`. A failed waiver insert gives an opaque 500 after the pay app is already marked paid and the contract already incremented (no transaction).
- The UI never sends `overrideWaivers`, so a blocked payment cannot be overridden.

STATUS: NOT VERIFIED

## 2.4 Change orders

Steps:
1. "Change Orders". `P/change-orders/page.tsx`, `GET /api/change-orders/list?projectId=`
2. Create. `POST /api/change-orders/create` (auto-numbers `co_number`, status `pending`).
3. Approve. `POST /api/change-orders/[id]/approve`. Reject is `/reject`. The cascade is `onChangeOrderApproved` in `lib/triggers.ts` (~656-755).
4. Next pay app. Approved COs flow into `pay-apps/create` as `change_orders_total`.

Pass means: after approval, `projects.contract_amount` and the prime contract's `approved_changes` both moved by `cost_impact`, and the CO shows on the next pay app. Check the numbers in the database, not on screen.

There is no separate "submit" step or route for a CO.

Read from code, check while driving:
- Approving does not check the current status. Approving twice double-counts `contract_amount`.
- The cascade is in a try/catch that only logs, so the API can return success when the cascade failed.
- The cascade does not touch `budget_lines.approved_changes` or `revised_budget`, so the budget (2.1) will not show the CO.

STATUS: NOT VERIFIED

## 2.5 Lien waivers

Steps:
1. "Lien Waivers". `P/lien-waivers/page.tsx`, `GET /api/lien-waivers/list?projectId=`
2. Manual: create one. `POST /api/lien-waivers/generate` (`app/api/lien-waivers/generate/route.ts`).
3. Auto: approve a pay app (2.2). `onPayAppApproved` (`lib/triggers.ts` ~182) inserts a `conditional_progress` waiver per sub and emails the sub a link to `/portals/lien-waiver/[token]`.
4. Auto: mark the pay app paid (2.3). `paid/route.ts` inserts `unconditional_progress` waivers.
5. Sub signs through the portal, `app/api/portals/[...path]/route.ts` (`/api/portals/sub/:token/lien-waiver`). `app/api/lien-waivers/[id]/sign/route.ts` exists but no screen calls it.

Pass means: a `lien_waivers` row exists after each of steps 2, 3 and 4, with the right type and amount, and signing in the portal flips it to signed. **Look in the table.** This is the "auto-generation never inserted a row" bug class.

There is no manual "send" button for a waiver. Sending happens only inside the approval trigger.

Read from code, check while driving:
- The manual page sends `conditional_partial` / `unconditional_partial`. The live type CHECK reportedly allows only `conditional_progress`, `unconditional_progress`, `conditional_final`, `unconditional_final` (the CHECK is not in repo SQL). The generate route does not check the insert error, returns `waiver: null, success: true`, and has a bare `catch {}`. The manual path may write no row while looking like it worked.
- `lib/document-templates/lien-waiver-generator.ts` ~288-302 inserts `claimant` and `claimant_address`, which are not columns, omits `tenant_id`, and sits in a bare catch. `pay-app-workflow.ts` ~143-165 and ~470-492 insert four non-existent columns. Both look dead, but confirm nothing live calls them.
- The active insert in `lib/triggers.ts` ~182 uses real column names and checks its error.

STATUS: NOT VERIFIED

## 2.6 Invoices

Steps:
1. "Client Invoices". `P/invoices/page.tsx`, `GET /api/projects/[projectId]/invoices`. Global list is `app/app/invoicing/page.tsx` (`GET /api/invoices/list`).
2. Create. `POST /api/invoices/create`. Total is `amount + tax`, status `draft`.
3. "Send" (drafts only). `POST /api/invoices/[id]/send`. It emails `vendor_email`, sets `sent` only when the email goes out, 502 on failure, 400 when there is no email.
4. PDF. `POST /api/invoices/[id]/pdf`.

Pass means: the invoice row exists, the total is right, the email is actually delivered (check the inbox or the Resend log), and the status moves to `sent`.

Read from code, check while driving:
- The `invoices` table is vendor-shaped (`vendor_name`, `vendor_email`). Client billing reuses `vendor_name` as the bill-to. It is not linked to a pay app, and no caller fills `lien_waivers.invoice_id`.
- Sent to paid is only the manual status edit described in 2.3.

STATUS: NOT VERIFIED

---

# TIER 3: the sales side, the differentiator

Source: `docs/SALES-PLAN.md`, which has measured evidence from the live `lead_pipeline` table. This tier turns its phases into paths. The commercial case: real contractors say the incumbents' CRM and reporting are their weakest area, so this tier matters even though it is touched less often than Tier 1.

**Grounding summary.** The kanban board, activity log, My Work follow-ups, sales overview and sales rail exist. **There is no deal page** (`app/app/leads/[id]` does not exist; the plan's Phase 1). **Nothing turns a Won lead into a customer or a project** (Phase 2). Those steps are marked NEEDS TO BE BUILT below, and they cannot pass until they are.

Stage vocabulary today (`app/app/leads/page.tsx:20`): New, Contacted, Qualified, Proposal, Negotiation, Won, Lost. Open decision from the plan: whether to add an Estimate stage. Not decided, so paths below use the seven.

## 3.0 Precondition for all of Tier 3: one stage vocabulary (SALES-PLAN Phase 0)

The plan measured 5 Title Case and 5 lowercase stages in the live table, with about $3.4M of pipeline invisible. Nothing in 3.1 to 3.7 shows a correct number until this is fixed. Before driving any Tier 3 path, query `SELECT stage, count(*) FROM lead_pipeline GROUP BY 1` and paste the result. If mixed case remains, every count below is wrong and must say so.

## 3.1 Lead intake

Steps (manual, exists):
1. "Leads". `components/AppSidebar.tsx`, `app/app/leads/page.tsx`
2. New lead modal. Fields: company, contact, email, phone, source, estimated value, stage, project type, notes, next action date (default today + 3 days).
3. Save. `POST /api/leads` (`app/api/leads/route.ts`). The route maps `contact_email` to `email` and `contact_phone` to `phone`, and defaults stage to `New`. Tags are dropped.

Pass means: the new lead is a `lead_pipeline` row for the right tenant and is on the board in the New column after a reload.

**Public intake is not built.** `app/contact/page.tsx:152` posts to `/api/leads/contact`, which inserts into a different table, `leads`, in `sandbox-manager-route.ts` (that is Saguaro's own marketing leads). Nothing writes a contractor's web form, email or webhook into `lead_pipeline`. `app/api/integrations/zapier/route.ts` does not reference leads. Public lead capture **needs to be built.** Verify manual intake only and write `CANNOT VERIFY: no public intake`.

Read from code: `POST /api/leads` returns a raw `'Internal server error'` and has a dead `const msg = "Failed"`. That is a known item already in the plan.

STATUS: NOT VERIFIED

## 3.2 Work a lead and set the next action

Steps:
1. Open a lead on the board. The detail panel is in `app/app/leads/page.tsx`.
2. Log a call. `POST /api/leads/[id]/activities` (`app/api/leads/[id]/activities/route.ts`) with `{activity_type, description, scheduled_at}`.
3. Set the next action date in the edit modal. `PATCH /api/leads/[id]` (`app/api/leads/[id]/route.ts`).
4. Open My Work. `app/app/my-work/page.tsx`, `GET /api/my-work`. The lead should appear under overdue, today or upcoming (14-day horizon).

Pass means: the activity is a `lead_activities` row, and a lead with a next-action date shows in My Work in the right bucket for the right user.

Read from code, check while driving:
- **There is no UI for the next-action text.** `next_action` is allowlisted in the PATCH but nothing sets it, so My Work shows the default "Follow up". The sales overview skips leads whose `next_action` is empty (`app/api/sales/overview/route.ts`), so those leads may not appear there. Setting next action text and date together **needs to be built.**
- Logging an activity does not set `next_action` or `next_action_date`.
- The My Work query excludes Won/Lost with a case-sensitive filter, so lowercase `won`/`lost` rows would leak in.
- `POST` on activities is gated on `Projects/Edit`, not `Sales`.

STATUS: NOT VERIFIED

## 3.3 Stage movement

Steps:
1. On the board, use a card's move menu (or the detail panel's "Move to Stage" buttons, or the stage dropdown in the edit modal). There is no drag and drop.
2. `PATCH /api/leads/[id]` with `{stage}` (`moveToStage`, `app/app/leads/page.tsx:328`).
3. Reload. The card is in the new column and the column counts match.

The plan's deal page with a stage button bar (Phase 1, `app/app/leads/[id]`) is **not built** and **needs to be built**. Drive the board until it exists.

Pass means: for every one of the seven stages, move a lead in and out, reload, and see the card and the count agree. Then compare the same stage count on the board, in `GET /api/sales/overview` (`byStage`) and in `GET /api/sales-journey` (`qualified`). They must agree (this is Phase 3).

Read from code, check while driving:
- Stage is stored as any string without validation.
- The board drops any lead whose stage does not match exactly (`byStage[l.stage]`).
- The overview keys `byStage` on the raw string, which gives duplicate columns, and the journey uses a case-sensitive `IN`.
- Moving to Won or Lost does not set `won_at` or `lost_at`. The overview decides open, won and lost from those columns, so the board and overview can disagree.

STATUS: NOT VERIFIED

## 3.4 Win it

Steps:
1. Move a lead to Won. `moveToStage` opens `components/bids/MarkOutcomeModal.tsx`, mounted at `app/app/leads/page.tsx:1548`.
2. Save the outcome. `POST /api/bids/outcome` (`app/api/bids/outcome/route.ts`). It records the bid history outcome and learner only. It does not touch `lead_pipeline`.

Pass means: the lead is Won, `won_at` is set, and the lead is linked to a customer and a project (`lead_pipeline.customer_id` and `project_id`), with name, value, project type and location carried across without retyping (SALES-PLAN Phase 2).

**The Won handoff is not built.** No screen, route or action creates a customer or a project from a lead. `PATCH /api/leads/[id]` excludes `project_id` and `customer_id` from its allowlist (a comment there refers to a column named `converted_project_id`, which does not exist). `project-auto-creator.ts` and `award-cascade.ts` at the repo root are for bid awards, handle no lead, and nothing imports them. This path **needs to be built** and cannot pass until then. Write `CANNOT VERIFY: Won handoff does not exist`.

STATUS: NOT VERIFIED

## 3.5 Customer created

Steps (what exists):
1. "Customers". `app/app/customers/page.tsx`, `GET /api/customers/profiles`. It lists customers.
2. API: `POST /api/customers` (`app/api/customers/route.ts`) inserts into `customer_profiles` (and `app/api/customers/profiles/route.ts` has a POST).

**No screen creates a customer.** `app/app/customers/page.tsx` has no add form, and no page calls `fetch('/api/customers')`. The API is there and the UI is not, so this **needs to be built** (a form, and the Won button in 3.4). Drive the API as a signed-in user to prove the insert, and write that the UI part is `CANNOT VERIFY`.

Pass means: a `customer_profiles` row exists for the right tenant and is listed on the Customers page after a reload. The customers status vocabulary (lead, qualified, proposal, customer, lost) is separate from the lead stages.

STATUS: NOT VERIFIED

## 3.6 Project opened

Steps (what exists):
1. From the Customers page, "assign to project". `POST /api/projects/create` with `{customer_id, name, ownerName, ownerEmail}` (`app/api/projects/create/route.ts`). The route reads `customer_id` and writes `projects.customer_id`.
2. Or "Win it and open the job" in the sales rail. It links to `app/app/projects/new/page.tsx`, which posts to `POST /api/projects/create`, then `POST /api/autopilot/run`, then redirects to `/app/projects/[id]/overview`.

`app/app/projects/new/page.tsx` accepts no prefill from a lead or a customer (it reads no search params), so the rail step opens a blank form. Carrying lead data across **needs to be built** (part of 3.4).

Pass means: the project row exists, its `customer_id` is set, the phase is right (`bidding` or `building`, `lib/project-phase.ts`), and the user lands on the project's journey. Also confirm `lead_pipeline.project_id` is set when it came from a lead. That part cannot pass today.

Read from code: the rail's last step ticks when ANY project exists (`projects > 0`), not when a lead is Won.

STATUS: NOT VERIFIED

## 3.7 Sales numbers match

Steps:
1. Dashboard home. `app/app/page.tsx`. The sales overview panel is `components/SalesOverview.tsx` (`GET /api/sales/overview`, shown when the user can sell). The rail is `components/SalesJourneyRail.tsx` (`GET /api/sales-journey`).
2. Compare to the board and to a direct SQL count of `lead_pipeline`.

Pass means: open count, pipeline value, weighted value and per-stage counts match the SQL, and the rail ticks agree with the rows (lead, worked, qualified, customer, priced, won; `lib/sales-journey.ts`). Paste the SQL and the three outputs side by side.

STATUS: NOT VERIFIED

---

# TIER 4: everything else a demo would show

## 4.1 Sign in
`app/login/page.tsx` calls `POST /api/auth/token` then `/api/auth/session`. Signup is `app/signup/page.tsx` (`POST /api/auth/signup`). Onboarding is `app/onboarding/step-1` to `step-4/page.tsx` (`POST /api/onboarding/company`, `POST /api/projects/create`, `POST /api/team/invite`). Pass: a new account reaches `/app` with its own tenant, and a second tenant cannot see its data.
STATUS: NOT VERIFIED

## 4.2 Dashboard home and the action list
`app/app/page.tsx` with `useDashboardStats()` and `useTodayItems()` (`lib/hooks/useDashboard.ts`). Routes: `GET /api/dashboard/today` returns `{actions, source}`, `GET /api/dashboard/stats` returns `{stats, source}`. The hook now reads `actions` first. The code comment says the old `items` mismatch was fixed, but the action list has a history of never rendering, so drive it with real data (an overdue RFI, an expiring insurance, an approved pay app) and see items on screen. The list is office items and holds no schedule tasks (see 1.4).
STATUS: NOT VERIFIED

## 4.3 Create a project
`app/app/projects/new/page.tsx`, `POST /api/projects/create` (returns `{projectId, project, success}`), `POST /api/autopilot/run`, then redirect to `/app/projects/[id]/overview`. Pass: the row exists, the overview opens, and the project list (`app/app/projects/page.tsx`) shows it.
STATUS: NOT VERIFIED

## 4.4 RFIs
`P/rfis/page.tsx`: `GET /api/rfis/list?projectId=`, `POST /api/rfis/create`, `POST /api/rfis/[id]/answer`, `PATCH /api/rfis/[id]`. Pass: create, answer, and see the status change after a reload.
STATUS: NOT VERIFIED

## 4.5 Submittals
`P/submittals/page.tsx`: `GET /api/submittals/list?projectId=`, `POST /api/submittals/create`, `PATCH /api/submittals/[id]`. Pass: create and move one through its statuses.
STATUS: NOT VERIFIED

## 4.6 Punch list
`P/punch-list/page.tsx`: `GET /api/punch-list/list?projectId=` (returns `{items}`), `POST /api/punch-list/create`, `PATCH /api/punch-list/[id]`. Pass: create an item, close it, and see it counted.
STATUS: NOT VERIFIED

## 4.7 Takeoff
`app/app/takeoff/page.tsx` (company) and `P/takeoff/page.tsx` (project). Calls: `GET /api/takeoff`, `POST /api/takeoff/create`, `/api/takeoff/[id]/upload-url`, a PUT to the signed URL, then `/upload-complete`. Pass: upload a drawing, take off a quantity, and see it persist. Response keys were not traced when this file was written.
STATUS: NOT VERIFIED

## 4.8 Bid packages
`P/bid-packages/page.tsx` and `[id]`: `GET /api/bid-packages/list?projectId=`, `POST /api/bid-packages/create`, `suggest-subs`, `invite-subs`. Company bid board is `app/app/bids/page.tsx`. Pass: create a package, invite a sub, and see the invite recorded. Response keys were not traced when this file was written.
STATUS: NOT VERIFIED

## 4.9 Client / owner portal
Admin: `app/app/client-portal/page.tsx` (`/api/client-portal/users`, `/messages`, `/activity`) and `app/app/portals/page.tsx` (`/api/portal/*/sessions`, `/revoke`, `/resend-invite`). Public side: `app/portals/{client,owner,sub,...}` and `app/owner-portal/approve/[token]`. Pass: invite a client, open the link in a private window, and approve something that then shows approved in the app. Response keys were not traced when this file was written.
STATUS: NOT VERIFIED

## 4.10 Ask Sage and reports
`app/app/ask/page.tsx` calls `POST /api/sage/ask-docs` (`{projectId, question}` returns `{answer, citations, searched}`). Reports: `app/app/reports/page.tsx` (`POST /api/reports/export`). The in-app chat in `app/app/layout.tsx` calls `POST /api/ai/chat`. **`app/api/sage/chat/route.ts` has no caller.** CLAUDE.md §8 names it as the Sage chat route, but no screen uses it. Pass: ask a question about a real uploaded document and get a cited answer; export one report and open the file.
STATUS: NOT VERIFIED

---

## Summary

| Tier | Paths | Needs building (at least in part) |
|---|---|---|
| 1 | 4 (1.1 to 1.4) | 1.3 attach to daily log; 1.4 today view |
| 2 | 6 (2.1 to 2.6) | 2.3 payment entry |
| 3 | 8 (3.0 to 3.7) | deal page; 3.1 public intake; 3.2 next-action text; 3.4 Won handoff; 3.5 customer form; 3.6 lead prefill |
| 4 | 10 (4.1 to 4.10) | none known |
