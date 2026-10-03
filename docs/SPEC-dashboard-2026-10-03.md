# Saguaro Dashboard Build Specification

Claude implementation handoff • October 3 2026

> **For the session that picks this up:** start in a fresh session. Begin with
> Phase 1 (audit and inventory) only and report before building. The spec
> below is the owner's text, saved as supplied.
>
> State as of saving (local session, 2026-10-03): `main` is at `ed8ed003`
> (PRs #37, #38, #39 live). The existing dashboard is `app/app/page.tsx` plus
> its components, and the design tokens are in `app/globals.css` and
> `docs/COPY-STYLE.md`. Two of the spec's assumptions are out of date:
> - The brand is now **neon yellow `#FFE600` on jet black** (owner decision
>   2026-10-02, COPY-STYLE §6–§7), not the gold tokens proposed in §12.
>   Follow COPY-STYLE.
> - The live `/app` has been verified signed in on the preview build only.

Build a working home page that tells a GC, salesperson, or dispatcher what to do next within ten seconds and lets them begin that action without hunting through the sidebar. This specification defines the required experience, data behavior, implementation sequence, and evidence for acceptance. A visual redesign alone is not completion.

Primary application: https://www.saguarocontrol.net/app

Screenshot preview: https://saguaro-crm-git-fix-found-leftovers-salty-vault.vercel.app/app

Evidence: two supplied desktop screenshots and current official competitor documentation reviewed in the preceding comparison. The live URL could not be retrieved through the research tool. Existing code, APIs, live records, permissions, and click behavior have not been inspected. Requirements below are a target design, not claims about what is already implemented.

## 1 Instructions to Claude

Inspect the existing repository, application routes, database schema, permissions, dashboard queries, and component system first. Implement within the existing product. Preserve unrelated work and existing business workflows. Do not create a disconnected mockup, replace the application with a new scaffold, or invent route names and backend capabilities.

Produce an implementation inventory identifying existing, partial, and missing capabilities. Reuse working modules. Where a dashboard requirement lacks underlying data or workflow, implement the necessary vertical slice or clearly identify the blocker. Do not represent a decorative card as a working feature.

Deliver one shared dashboard framework with Operations, Sales, Service, Owner, and Field views. Give each user a useful default based on actual role and permissions. Let users with multiple responsibilities switch views. Switching a view must never grant access to additional records or financial data.

Do not add fabricated metrics, sample jobs, fake activity, invented AI insights, or placeholder records to production. Seeded fixtures are allowed only in isolated test/demo environments and must be labeled there.

## 2 Problems to correct from the supplied screen

Narrow centered content leaves large unused desktop margins while text and controls appear very small. Confirm browser zoom at 100 percent before diagnosing exact CSS dimensions.

Bidding guidance, greeting, activity strips, live signals, and payment onboarding compete above the work queue.

Compliance requests dominate Priority Actions without a visible cross-functional schedule or job-risk view.

Pipeline, win rate, win/loss, and pipeline composition consume substantial space; win rate is repeated.

A generic Past Due label refers to follow-ups and could be mistaken for overdue receivables.

Company portfolio context and a particular project's onboarding journey are mixed.

Schedule, field work, project health, and service dispatch are not surfaced in the visible dashboard.

A long sidebar exposes many modules at once without organizing the home experience around the user's immediate job.

Retain useful foundations: Priority Actions, Follow-ups, Search, Activity, existing operational modules, and the black/gold/white brand. Reorganize them rather than deleting working capabilities.

## 3 Product boundaries and context

Company home aggregates only authorized work across accessible jobs. Project home is explicitly scoped to one selected project. Personal work contains assignments to the current user. Team work requires permission to view the team's records. Never silently mix these scopes.

The header must show the current dashboard view, job scope, assignment scope, date window, search, and one quick-create menu. A selected project must remain obvious in the title and filters. Changing filters updates metrics, queues, schedules, and drilldowns consistently. Preserve filters when opening and returning from a record.

Determine the default view from existing role configuration. If ambiguous, ask once which work area the user wants to start in and save the preference. Do not force every new user to build their own dashboard. Owners can switch among all permitted work areas; a field user gets only authorized field information.

## 4 Exact desktop composition

Use the available app content area with 24px outer padding and 20–24px gaps. Target a practical maximum content width near 1600px on large displays rather than the narrow centered column in the screenshot. Use the existing sidebar, improving its hierarchy and readability. At a 1440px viewport, target a sidebar around 224px and use the remaining width effectively; verify rather than hard-code around one screenshot.

Header: compact dashboard title, view selector, All jobs or selected job, My work or Team work, date controls, search, and quick create. Keep the greeting to a short optional line. No hero-sized welcome banner.

Summary row: four compact clickable metrics specific to the current role. Each metric shows a precise label, count or amount, scope/time basis, and data state. Every metric opens the exact filtered records behind it.

Primary row: approximately two thirds width for Needs attention and one third for Today's schedule. Show roughly five actionable queue rows and five upcoming schedule entries at common laptop heights. Critical actions must be visible without scrolling at 1366 × 768 and 1440 × 900 at 100 percent zoom. Do not shrink text to force every widget above the fold.

Next section: a full-width Active jobs table for Operations, a work-focused lead/proposal table for Sales, or a dispatch/work-order board for Service. Owner and Field variants are defined below.

Lower sections: role-relevant billing, procurement, capacity, communication, and recent activity. Historical charts and the activity feed must not displace urgent work. Collapse onboarding after completion; provide setup assistance separately when needed.

## 5 Operations home for GCs and project managers

Four metrics: Overdue tasks, Jobs at risk, Approvals waiting, and Overdue receivables if financially authorized. For users without financial access, replace the last with Upcoming milestones. Do not expose unauthorized totals through cards.

Needs attention combines assigned overdue work, schedule blockers, RFIs/submittals awaiting response, inspections/permits, approvals, material delays, and compliance issues that actually affect work or payment. Each row includes job, responsible person, due date, consequence, and a specific action.

Today's schedule shows crews, site visits, inspections, deliveries, and milestone-related work. Include start/end or appointment window, job, assigned people, location, and conflict status. Provide Today and Next 7 days without requiring a trip through the sidebar.

Active jobs columns: Job, PM, Phase, Next milestone, Due date, Schedule status, Main blocker, and Forecast margin when available and authorized. Optional columns include original/revised contract, forecast completion, and budget variance. Sort by risk or nearest milestone; offer saved column settings. Use a detail drawer for secondary information instead of a 20-column default table.

Quick-create options: Task, Daily log, RFI, Field issue, Change order, and Project where permitted. Reuse existing creation flows and prefill the selected job. Never guess a project when scope is All jobs.

Construction readiness must surface expiring COIs, missing documents, unsigned commitments, procurement deadlines, and subcontractor confirmations when relevant. Group repeated compliance items so dozens of W-9 reminders do not bury a blocked inspection or today's work.

## 6 Sales and estimating home

Four metrics: Leads awaiting first contact, Follow-ups overdue, Estimates due, and Proposals awaiting decision. Keep pipeline value and win rate available below the action area with clear period and calculation labels.

Primary queue: newly assigned leads without first contact, promised callbacks, estimates approaching due date, proposal follow-ups, stale opportunities, and approvals needed to send a proposal. Show customer, opportunity/job, owner, last meaningful contact, next action, and deadline. Do not label an opportunity stale solely because nobody edited a record; use meaningful activity and configured thresholds.

Today's schedule shows calls, site visits, measurements, and proposal meetings. The lead/proposal table exposes stage, age in stage, amount, owner, next activity, and decision date. Optional Kanban supports existing stage-transition rules and validations.

Actions: Assign lead, Open customer, Log call, Schedule follow-up, Prepare estimate, Review proposal, and Open proposal. A click on Log call records activity; it must not falsely claim a phone call occurred. External messages use the existing review/send flow.

When an opportunity is won, launch a controlled handoff carrying approved customer, scope, estimate, files, and commitments into job setup. Prevent duplicate projects on repeated submissions. Show required missing information rather than creating an incomplete job silently.

## 7 Service and dispatch home

Four metrics: Unassigned calls, Visits today, Overdue response or arrival commitments, and Completed work ready to invoice. Distinguish contractual SLA violations from internal service targets; do not invent SLA clocks for customers without configured policies.

Lead with dispatch: unassigned work beside a technician day schedule. Each work order shows customer/site, issue, priority, appointment window, assigned technician, status, and the next action. Show access instructions to authorized staff. Distinguish warranty/callback work from billable visits.

Required statuses, mapped to existing equivalents: New, Triaged, Scheduled, En route, On site, Paused/Waiting, Completed, and Closed. Keep billing status separate. A job can be operationally complete and still unbilled. Waiting requires a reason such as parts, customer access, or approval.

Actions: Create service call, Assign technician, Reschedule, Open work order, Start visit, Add notes/photos, Complete visit, and Prepare invoice where authorized. Completion captures the existing required checklist, time/materials, resolution, and customer acknowledgment where applicable. Do not require payment to claim the physical work is complete.

Detect overlapping appointments including configured travel buffers. Do not imply live GPS or accurate ETA without a working integration and appropriate data. Map and route features are secondary; a reliable list and schedule ship first.

Include callbacks, parts awaited, warranty aging, promised customer updates, and overdue unbilled work. If a service module is absent, build the work-order data model, assignment workflow, visit recording, and billing linkage as part of this scope. A dispatch-looking widget alone does not satisfy this requirement.

## 8 Owner and field home views

Owner home: Jobs at risk, Overdue receivables, Ready-to-bill value, and Decisions awaiting me. Main work areas are financial/operational exceptions and approvals. Supporting views include forecast margin, signed backlog, qualified pipeline, capacity, and collections. Keep cash balance distinct from receivables and backlog; show cash only when reliable bank/accounting data exists.

Field home: My next assignment followed by today's assigned work. Show job address, contact, access details, task scope, latest authorized drawings, checklist, and relevant hazards/notes. Actions: Navigate, Clock in, Add photo, Daily log, Report issue, and Complete task as supported by the product. Clearly display offline/sync status if offline functionality exists. Do not add a decorative offline badge without actual persistence and synchronization.

Client and subcontractor portals remain separate experiences. Internal draft and Pending Share Review material must not become visible externally simply because it appears in a dashboard. Preserve established explicit sharing approval rules.

## 9 Action queue contract and behavior

Every row answers: What needs action? Which job/customer? Who owns it? When is it due? Why does it matter? What can I do now?

Required fields in the application view model: stable item ID, tenant, source type and ID, title, job/customer references, accountable owner or Unassigned, due timestamp and timezone, severity, status, concise impact reason, action type, authorized destination/action, source update time, and permitted operations. These are logical fields; map them to the real schema rather than adding duplicate tables blindly.

Use deterministic priority rules before AI. Recommended ordering: critical operational/safety issue or active service breach; work blocking today's execution; overdue personal action; due today; due within seven days; informational. Within a tier sort by relevant deadline, then business impact when known, then oldest creation time. Unassigned urgent work must surface to the responsible manager. Avoid asserting causality when dependencies are not recorded.

Show the reason for urgency, such as “Inspection overdue; recorded prerequisite for framing.” Missing data should say “Deadline not set” or “Impact not recorded.” Never invent schedule or financial impact to make a row look smarter.

Deduplicate by source record and action. Group bulk compliance work into an expandable count with a meaningful deadline. Keep a pinned critical item visible even when large volumes of lower-priority work exist. Support All, Mine, Overdue, Due today, Waiting on others, and Unassigned as permitted.

Clicking an item opens its actual record in a drawer or contextual page with the next action exposed. Preserve dashboard state on return. Complete, assign, approve, or reschedule only through authorized mutations with validation, confirmation where required by the workflow, audit history, and clear success/error feedback. Review approval details before committing an approval; never bulk-approve sensitive changes from a summary count.

Snooze is allowed only where product rules permit, requires a wake date, and does not change the underlying due date or hide mandatory critical issues. Delegation changes accountability visibly. After a successful mutation, refresh affected cards, queue rows, and schedule without duplicating records.

## 10 Metric definitions and trustworthy data

Overdue tasks: open actionable tasks whose due time has passed, excluding completed/cancelled items, within current scope. Date-only tasks become overdue after the tenant's defined local working-day boundary.

Jobs at risk: distinct active jobs meeting documented risk rules. A job with three risks counts once. Show the reasons and distinguish manually flagged from calculated risk. Missing data is Unknown, not On track.

Approvals waiting: actionable pending approvals in the user's authorized approval scope. Show count and oldest age. Count records requiring decisions rather than every historical workflow step.

Overdue receivables: remaining balance on posted/sent collectible invoices past due, accounting for payments and credits and excluding voided/draft invoices. Use the real accounting source and currency rules; do not sum different currencies without explicit conversion policy.

Ready to bill: authorized completed work or approved billing milestones eligible for invoicing but not already invoiced. Show blockers separately and prevent double counting progress billings and change orders.

Forecast margin: (forecast revenue minus forecast final cost) divided by forecast revenue, where revenue is positive. Forecast final cost should combine actual cost and remaining forecast consistently; do not double count commitments already represented in those figures. If no trustworthy forecast exists, show unavailable. Contract value is not profit.

Signed backlog: contracted remaining work according to a documented revenue/progress basis. Pipeline is unsigned opportunities. Weighted pipeline requires actual configured stage probabilities and must be labeled weighted. Win rate must state period, eligible cohort, and won/(won+lost) definition; open opportunities are not losses.

Every summary and its drilldown must reconcile using the same scope and filters. Expose last refresh time and source health. Differentiate real zero, unavailable, loading, permission-restricted, stale, and failed states. Never replace failed queries with zeros.

## 11 Data access and backend implementation

Inventory current resources for tasks, jobs, milestones, assignments, RFIs, submittals, inspections, approvals, invoices, leads, proposals, work orders, messages, and user preferences. Map each dashboard widget to its source and owner. Document gaps before rendering misleading cards.

Provide a dashboard aggregation layer using the application's existing conventions. A proposed response shape is context, capabilities, metrics, actionQueue, schedule, workTable, freshness, and per-section errors. Proposed names are not claims that these endpoints already exist. Include pagination/cursors for growing lists and explicit supported filters.

Enforce tenant isolation and role/project permissions on the server and database access layer. Never rely on hiding frontend cards. Validate requested view and project scope. Counts, search suggestions, and aggregated totals must not leak unauthorized records. Customer and subcontractor sharing constraints apply to queries as well as detail pages.

Keep ranking and financial calculations in reusable tested services so home, reports, and drilldowns agree. Use cache keys containing tenant, user/capabilities, scope, filters, and view. Invalidate relevant caches after mutations. Use existing realtime support where available or reasonable refresh on focus and periodic updates; show freshness honestly.

Use timezone-aware deadlines, stable IDs, indexed filters, and bounded queries. Add migrations only for genuinely missing concepts. Make mutations idempotent where retry could duplicate work. Handle stale-record conflicts with a refresh/review message rather than overwriting a newer change.

For a missing service model, define tenant-scoped work orders, appointment/assignment records, status history, waiting reasons, visit notes, time/materials, and invoice linkage. Reuse existing customer/job entities. Confirm migration and backfill rules before connecting production records.

## 12 Visual system and responsive behavior

Preserve black, gold, and white. Proposed starting tokens: page #101113, surface #191B1F, elevated surface #22252A, primary text #F5F5F5, secondary text #B7BDC7, border #383D45, gold #E5B93F. Verify actual contrast after implementation. Use dark text on filled gold buttons. Reserve red, amber, and green for meaningful states with text/icons, not decoration. Avoid introducing blue as the brand accent.

> *Superseded by owner decision 2026-10-02: neon yellow `#FFE600` on jet
> black with glass surfaces — see `docs/COPY-STYLE.md` §6–§7.*

Use 14–16px body text, 12–13px secondary labels, and 24–28px page titles. Never rely on 9–10px operational text. Provide comfortable row height and visible focus. Aim for 44px touch targets on mobile. Offer compact desktop density without making text microscopic.

Remove ticker/marquee behavior from important alerts. Avoid excessive glow, nested bordered cards, and large charts that communicate only two values. Use tables for work records, small sparklines for meaningful trends, and charts only where a decision benefits.

Below approximately 1100px use a single primary column with schedule following the queue. On mobile, prioritize the next action, today's work, then summaries; collapse navigation into an accessible drawer. Tables become useful compact records or offer labeled horizontal scrolling. Do not hide required actions behind hover. Respect reduced motion and keyboard navigation. Use accessible status announcements without continuously reading activity updates.

Simplify navigation with role-aware sections, favorites, and All tools. Dashboard, My work, and relevant jobs/work orders remain easy to reach. Do not remove existing routes or rename established workflows casually. One context selector controls job scope; do not create competing selectors with inconsistent state.

## 13 Sage and communication

Sage may summarize real exceptions, explain why a job is flagged, and draft a next step. Each assertion must link to the source records and reflect current permissions. The deterministic dashboard still works when AI is unavailable.

Do not display fabricated risk percentages or monetary exposure. Distinguish a recorded blocker from an AI suggestion. Drafting a reminder is different from sending it. Financial approvals, customer communication, and assignments follow existing authorization and review flows. Show audit trails for actual changes.

Unanswered messages, promised callbacks, and customer decisions can join role-specific queues only when their source status is reliable. Do not equate unread with unanswered. Avoid duplicating a single customer request as a message, task, and risk without linking/grouping the records.

## 14 Empty and failure states

No assigned work: show “No assigned work due today” with access to upcoming work, not celebratory claims about the whole company.

No schedule: show “Nothing scheduled in this view” with a permitted scheduling action.

Accounting disconnected: show the connection issue and permission-appropriate resolution; do not show zero receivables.

Partial outage: keep functioning sections usable and label the failing section with retry and last-known timestamp.

No permission: omit restricted metrics or explain unavailable access without exposing amounts or names.

New tenant: offer a compact setup checklist separate from the daily queue. Onboarding should disappear from primary space when completed.

## 15 Build sequence and completion gates

Phase 1 — Audit and design mapping. Inventory real routes, permissions, data sources, role defaults, dashboard widgets, and service capability. Capture existing baseline behavior and screenshots. Produce a requirement-to-source-to-action matrix.

Phase 2 — Shared shell and action infrastructure. Implement readable responsive layout, role/scope controls, shared queue, ranking, drilldowns, data states, and quick-create integration. Verify tenant isolation and correct navigation first.

Phase 3 — Working Operations and Sales slices. Connect real schedule, jobs, blockers, approvals, leads, estimates, and follow-ups. Verify mutations and aggregate reconciliation. Replace duplicate charts and permanently prominent onboarding.

Phase 4 — Working Service and Field slices. Connect or implement work orders, technician assignment, appointment conflicts, visit completion, and billing readiness. Ensure field users can operate on mobile with correct permissions.

Phase 5 — Owner finance and secondary signals. Connect trustworthy financial summaries, capacity, procurement/compliance exceptions, communication, and evidence-backed Sage summaries.

Phase 6 — Acceptance and release. Run workflow, permission, accessibility, performance, and ten-second usability tests. Release through the project's actual deployment workflow with a rollback path. Do not claim the live URL changed without deployment evidence and a live verification.

Use a feature flag or equivalent controlled rollout for the replacement home if supported. Preserve a recovery path to the existing dashboard during validation. Avoid destructive data migrations. No phase may be called complete if its buttons are nonfunctional or its data is fabricated.

## 16 Acceptance test matrix

Operations scenario: seed an isolated fixture with a blocked inspection today, an overdue RFI, and many lower-priority document requests. The user identifies the urgent operational blocker within ten seconds and opens its actionable record directly. Compliance volume must not bury it.

Sales scenario: a new lead awaits first contact and a proposal follow-up is overdue. The user identifies the correct next contact within ten seconds, opens the actual customer/opportunity, records the follow-up, and sees the dashboard update.

Service scenario: an urgent unassigned call and an overlapping technician appointment exist. The dispatcher sees the unassigned call immediately, assigns an eligible technician without a hidden conflict, and opens the work order without sidebar hunting.

Owner scenario: receivables include partial payment, credits, and voided invoices. The overdue total matches its filtered invoice list and excludes invalid balances. Unauthorized users cannot retrieve the total through the API.

Field scenario: the technician opens the app on a 390px-wide screen and immediately sees the next job, address, scope, and primary action. Completing a task updates the queue and does not imply invoicing or payment.

Scope scenario: changing project, team, date, and view updates all related sections and drilldowns. Returning from an item preserves the chosen scope. Cross-tenant and unauthorized-project access tests fail safely.

Failure scenario: one data source fails. Other sections remain usable; the failed card reports unavailable rather than zero. A retried mutation does not create duplicate tasks, appointments, projects, or invoices.

Accessibility scenario: use keyboard only to change view, open the highest-priority item, complete a permitted task, and return. Focus remains visible and restores correctly. Validate contrast and mobile touch targets.

Responsive scenario: inspect 1366 × 768, 1440 × 900, 1920 × 1080, and 390 × 844 at normal scale. No clipped labels, tiny text, obstructed primary actions, or unexplained empty margins. Critical queue content stays above the fold on desktop.

Performance targets: on an agreed representative device/network and realistic tenant dataset, useful primary content should appear within about 2.5 seconds at the 75th percentile, ordinary interactions should respond within 200ms where feasible, and the dashboard must not wait for AI or historical reports. Measure results, disclose conditions, and investigate regressions. Avoid unbounded queries and heavy initial chart bundles.

## 17 The ten second usability gate

Run moderated tasks with at least three representative users for each primary role: Operations, Sales, and Service. Use unfamiliar but realistic seeded records with a clearly defined next action, not instructions that reveal which button to press. Record first-time results separately from repeat attempts.

Start timing when the home is usable. Ask “What needs your attention next, and how would you begin?” The user must name the correct task/job, explain the visible urgency, and reach its actionable record within ten seconds without using the sidebar or receiving coaching. Track loading time separately so slow loading is not concealed.

Proposed release threshold: at least eight of nine primary-role participants pass, with at least two of three passing within each role. This is a practical acceptance gate, not proof of universal usability. Investigate every failure, revise the layout or wording, and retest with fresh participants where possible.

Automated tests and screenshots cannot establish that humans understand the page in ten seconds. If real users are unavailable, report that the usability gate is unverified rather than claiming success. Do not claim “best in market” from a design review alone.

## 18 Required handoff and completion evidence

- Changed files and explanation of how they map to each requirement.
- Data-source and permission matrix for every widget and action.
- Screenshots of all five role views at desktop and mobile sizes.
- Short recordings of the Operations, Sales, and Service next-action flows.
- Automated test results for ranking, scope, permissions, calculations, and mutations.
- Financial card and drilldown reconciliation examples from controlled test data.
- Measured performance conditions/results and usability observations.
- Explicit list of unavailable integrations, missing data, and unverified requirements.
- Deployment URL and commit/version if deployed, verification results, and rollback procedure.

Definition of done: the dashboard is implemented in the existing app; it uses authorized real data; each role has a coherent default; its primary actions work; the acceptance checks pass; and any unverified human usability claim is clearly disclosed. A build passing or a polished screenshot is insufficient.

## 19 Competitor evidence and design rationale

Procore's July 2026 release notes confirm Home and Project Overview became generally available on July 21. Its Project Overview documentation describes open items, project information, quick creation, insights, and recent activity. These support action-oriented, permission-aware company/project workspaces. Do not assume every older Procore home widget remains in the newer experience.

- https://support.procore.com/product-releases/weekly-release-notes/july-2026
- https://support.procore.com/products/online/user-guide/project-level/project-overview/tutorials/about-the-project-overview

JobTread's official dashboard page describes customizable dashboards, company/PM/estimator-sales/financial examples, Kanban, and configurable reports. This supports role-specific defaults and record-based drilldowns, not a claim that every suggested Saguaro widget ships by default in JobTread.

- https://www.jobtread.com/features/reporting-and-dashboards

Buildertrend's current job-management documentation describes configurable job lists, PM and date fields, project status, and financial summaries. Its task and scheduling documentation supports assigned daily work and schedule visibility. Warranty support alone does not prove full dispatch capability.

- https://buildertrend.com/help-article/job-management/
- https://helpcenter.buildertrend.net/s/article/Tasks-Overview
- https://helpcenter.buildertrend.net/s/article/Schedule-Overview

The requirements in this document are Saguaro product recommendations informed by those sources and the supplied screenshot. They are not a claim that competitor interfaces were tested inside authenticated customer accounts. Public marketing pages are not the template for a signed-in operational dashboard.

## 20 Live Saguaro research and implementation corrections

Primary target updated by the user: https://www.saguarocontrol.net/app. The earlier Vercel preview remains screenshot context; do not assume both deployments are identical. On October 3 2026, direct browser navigation to the production /app route redirected to /login?next=%2Fapp. The signed-in dashboard and its controls therefore remain unverified in this review. No sign-in credentials were supplied or entered.

Public pages reviewed: https://www.saguarocontrol.net/ ; https://www.saguarocontrol.net/features ; https://www.saguarocontrol.net/get-the-app ; https://www.saguarocontrol.net/how-it-works . Public descriptions are product claims, not end-to-end verification.

The homepage advertises My Work as a cross-project assignment queue, Crews with a live map and dispatch, and field T&M tickets. It also promotes radio, Signal Studio, and Takeoff Studio. Reuse and verify the existing My Work queue, crew assignments, and ticket-to-billing workflows before building replacements. The current screenshot's lack of dispatch does not prove dispatch is absent from the application.

The features page describes Sage grounded in project data, RFI/change-order workflows, pay applications, punch/inspection tools, compliance, portals, and financial reporting. The new dashboard should bring actionable exceptions from these modules into role-specific home views. Preserve each source workflow and its permissions.

The public workflow page describes connected stages from project/plans through estimating, field work, financials, portals, and closeout. Audit those transitions against actual implementation: estimate won to project, field ticket to billing, RFI response to reviewed change order, and closeout task to completion. Surface broken handoffs as implementation issues rather than masking them with dashboard summaries.

Public messaging also needs reconciliation during the build: features and workflow pages describe iPhone and Android access, while the field-app page specifically presents an iPhone/iPad TestFlight beta. Clarify native versus browser availability and beta versus production status. The homepage feature/pricing presentation and the features page's broad all-modules statement should match actual plan entitlements. Dashboard visibility must follow verified entitlements, never marketing copy alone.

The homepage includes an app.saguaro.build example label while the user identifies saguarocontrol.net/app as the live destination. Verify intended domains and replace stale example labels where appropriate. Do not redirect or change domains without checking existing configuration.

Final audit matrix must classify every promoted module as verified working, partially working, present but not surfaced, or unavailable. This avoids unnecessary rebuilding and prevents public promises from being mistaken for tested functionality. Signed-in validation is still required before declaring the ten-second experience complete.
