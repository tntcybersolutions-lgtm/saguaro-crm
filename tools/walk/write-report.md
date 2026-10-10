# Action walk — every Add/New, save, reload, reopen, edit, every record button, delete (demo account, iPhone WebKit)

Test records only (ZZ AUDIT). Mail goes to delivered@resend.dev, phones to 602-555-0100.

| Screen | Add/New | Create | Back after reload | Fields back | Edit pre-filled | Edit saved | Record buttons | Delete |
|---|---|---|---|---|---|---|---|---|
| projects/new (New Job form) | New Job form | saved | yes |  |  |  |  |  |
| subs | no Add/New on this screen |  |  |  |  |  |  |  |
| people | + New Role | saved | NOT ON LIST after reload |  |  |  |  |  |
| people | + Invite User | saved | NOT ON LIST after reload |  |  |  |  |  |
| people — page buttons | 2 write buttons |  |  |  |  |  | 2 tapped, **1 bad** |  |
| customers | no Add/New on this screen |  |  |  |  |  |  |  |
| projects/:id/directory | Add Someone | saved | yes | 4/4 |  | no Edit button on the record | 3 tapped, **3 bad** | (at the end — used by the pickers) |
| projects/:id/directory — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped, **1 bad** |  |
| projects/:id/subs | Add Subcontractor |  |  |  |  |  |  |  |
| projects/:id/team | Invite Member | saved | NOT ON LIST after reload |  |  |  |  |  |
| projects/:id/team | add one | form opened (1 fields) but no Save button |  |  |  |  |  |  |
| projects/:id/crews | New Crew | saved |  |  |  |  |  |  |
| home | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| home | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| my-work | no Add/New on this screen |  |  |  |  |  |  |  |
| projects | New Project | saved | yes | 2/2 |  | no Edit button on the record | 5 tapped, **1 bad** | yes |
| time | Add Time | NOTHING SENT on save |  |  |  |  |  |  |
| time — page buttons | 0 write buttons |  |  |  |  |  |  |  |
| notifications | no Add/New on this screen |  |  |  |  |  |  |  |
| notifications — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped |  |
| documents | no Add/New on this screen |  |  |  |  |  |  |  |
| documents — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped, **1 bad** |  |
| daily-logs | New Log | NOTHING SENT on save |  |  |  |  |  |  |
| schedule | New Task | NOTHING SENT on save |  |  |  |  |  |  |
| compliance | no Add/New on this screen |  |  |  |  |  |  |  |
| takeoff | Upload Blueprint | picked a file but nothing was sent |  |  |  |  |  |  |
| takeoff — page buttons | 0 write buttons |  |  |  |  |  |  |  |
| reports | no Add/New on this screen |  |  |  |  |  |  |  |
| reports — page buttons | 0 write buttons |  |  |  |  |  |  |  |
| leads | New Lead | saved | yes | 5/5 |  | no Edit button on the record | 1 tapped, **1 bad** | NO DELETE on the record |
| sales | no Add/New on this screen |  |  |  |  |  |  |  |
| bids | New Bid Package | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| billing | no Add/New on this screen |  |  |  |  |  |  |  |
| billing/payapp | Add SOV Line | FAILED (POST /api/pay-apps/create → 500) |  |  |  |  |  |  |
| billing/payapp — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped, **1 bad** |  |
| billing/cost-control | Add Cost Code | saved | NOT ON LIST after reload |  |  |  |  |  |
| invoicing | New Invoice | saved | yes | 6/6 | 5/6 | yes | 4 tapped, **1 bad** | yes |
| catalog | Add | NOTHING SENT on save |  |  |  |  |  |  |
| certified-payroll | no Add/New on this screen |  |  |  |  |  |  |  |
| command-center | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/daily-logs | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/daily-logs | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/directory | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/directory | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/financials | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/financials | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/budget | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/budget | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/checklists | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/checklists | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/escalations | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/escalations | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/kpis | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/kpis | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/long-lead | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/long-lead | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/milestones | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/milestones | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/oac | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/oac | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/owner-updates | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/owner-updates | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/portals | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/portals | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/pre-site | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/pre-site | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/qc | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/qc | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/risks | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/risks | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/rollout | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/rollout | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/vendors | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/vendors | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| command-center/verify | Create | DEAD — tapping it did nothing |  |  |  |  |  |  |
| command-center/verify | Record Result | form opened (0 fields) but no Save button |  |  |  |  |  |  |
| document-versions | New Document | saved | yes | 3/3 |  | no Edit button on the record | 2 tapped | NO DELETE on the record |
| document-versions — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped |  |
| fleet | Add Asset | saved | yes | 3/3 | 3/3 | yes | 11 tapped, **4 bad** | NO DELETE on the record |
| intelligence | no Add/New on this screen |  |  |  |  |  |  |  |
| portals | Invite Subcontractor | form opened (4 fields) but no Save button |  |  |  |  |  |  |
| portals | Invite Client |  |  |  |  |  |  |  |
| portals | Invite First Client |  |  |  |  |  |  |  |
| portals — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped |  |
| prequalification | New Template | NOTHING SENT on save |  |  |  |  |  |  |
| prequalification — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped, **1 bad** |  |
| radio | Add someone | saved | NOT ON LIST after reload | 0/2 |  | no Edit button on the record |  |  |
| resource-planning | New Assignment | NOTHING SENT on save |  |  |  |  |  |  |
| reviews | Add Review | DEAD — tapping it did nothing |  |  |  |  |  |  |
| service | New Service Call | saved | yes | 4/4 |  | no Edit button on the record | 13 tapped, **2 bad** | NO DELETE on the record |
| settings | Upload company logo |  |  |  |  |  |  |  |
| settings — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped |  |
| signal-studio | Start Without a Project | DEAD — tapping it did nothing |  |  |  |  |  |  |
| warranty-claims | New Claim | DEAD — tapping it did nothing |  |  |  |  |  |  |
| warranty-claims | Create Claim | DEAD — tapping it did nothing |  |  |  |  |  |  |
| ask | no Add/New on this screen |  |  |  |  |  |  |  |
| projects/:id/overview | Create one | NOTHING SENT on save |  |  |  |  |  |  |
| projects/:id/overview | add one | form opened (1 fields) but no Save button |  |  |  |  |  |  |
| projects/:id/overview | Add Subs | NOTHING SENT on save |  |  |  |  |  |  |
| projects/:id/overview — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped |  |
| projects/:id/photos | Add Photos & Video | saved |  |  |  |  |  |  |
| projects/:id/files | Import from Cloud | DEAD — tapping it did nothing |  |  |  |  |  |  |
| projects/:id/files — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped, **1 bad** |  |
| projects/:id/daily-logs | Create First Log | saved |  |  |  |  |  |  |

## Details

- **projects/new (New Job form)**
  - sent: POST /api/projects/create → 200 · POST /api/autopilot/run → 200
- **people**
  - save: Create Role
  - sent: POST /api/roles → 201
- **people**
  - save: Send Invite
  - sent: POST /api/team/invite → 200
- **people — page buttons**
  - "TEAM MEMBERS 1 Platform sign-ins": went to /app/people
  - "+ Assign Role": nothing happened (dead button?)
- **projects/:id/directory**
  - save: Add to Directory
  - sent: POST /api/projects/:id/directory → 200
  - "Add Someone": nothing happened (dead button?)
  - "delivered@resend.dev": nothing happened (dead button?)
  - "6025550100": nothing happened (dead button?)
- **projects/:id/directory — page buttons**
  - "delivered@resend.dev": nothing happened (dead button?)
- **projects/:id/subs**
  - ERROR: locator.click: Timeout 5000ms exceeded.
- **projects/:id/team**
  - save: Send Invitation
  - sent: PATCH /api/projects/:id → 200
- **projects/:id/crews**
  - save: Create Crew
  - sent: POST /api/projects/:id/crews → 200
  - ERROR: page.goto: Timeout 45000ms exceeded.
- **projects**
  - save: Create & Add Drawings →
  - sent: POST /api/projects/create → 200 · POST /api/autopilot/run → 200
  - "Open Takeoff": went to /app/projects/:id/takeoff
  - "Measure the Drawings": went to /app/projects/:id/takeoff
  - "All 4 steps": nothing happened (dead button?)
  - "BID PRICE Not priced No takeoff on this job yet": gone after reopening (state changed)
  - "PROPOSAL None yet No proposal sent on this job": record no longer on the list (an earlier button closed/moved it)
- **time**
  - save: Log Time → Log Time → Log Time → Log Time
- **time — page buttons**
  - ERROR: page.goto: Timeout 45000ms exceeded.
- **notifications — page buttons**
  - "MONEY EVENTS → 0 Pay apps + change orders": could not tap: locator.click: Timeout 4000ms exceeded.
- **documents — page buttons**
  - "Pay Applications": nothing happened (dead button?)
- **daily-logs**
  - save: Create Log → Create Log → Create Log → Create Log
- **schedule**
  - save: Create Task → Create Task → Create Task → Create Task
- **takeoff — page buttons**
  - ERROR: page.goto: Timeout 45000ms exceeded.
- **reports — page buttons**
  - ERROR: page.goto: Timeout 45000ms exceeded.
- **leads**
  - save: Create Lead → Create Lead → Create Lead → Create Lead
  - sent: POST /api/leads → 201
  - "Create Lead": nothing happened (dead button?)
- **billing/payapp**
  - save: Save Pay Application
  - sent: POST /api/pay-apps/create → 500
- **billing/payapp — page buttons**
  - "% COMPLETE → 0%": nothing happened (dead button?)
- **billing/cost-control**
  - save: Save Cost Report
  - sent: POST /api/cost-control/reports → 200
- **invoicing**
  - save: Create Invoice
  - sent: POST /api/invoices/create → 200
  - edit form EMPTY for: ZZ AUDIT Walk Job 10100057
  - "Generate PDF": opened a panel (no form to save)
  - "Send to Vendor": saved — POST /api/invoices/:id/send → 200
  - "More actions": nothing happened (dead button?)
  - "All Invoices": went to /app/invoicing
- **catalog**
  - save: Create Purchase Order → Create Purchase Order → Create Purchase Order → Create Purchase Order
- **document-versions**
  - save: Create Document
  - sent: POST /api/documents/versions/upload-url → 200 · PUT supabase/storage/v1/object/upload/sign/documents/:id/document-control/new/1791595219535-ZZ%20AUDIT%20document.pdf → 200
  - "Download": opened a panel (no form to save)
  - "Submit": saved — POST /api/documents/versions/approve → 200
- **document-versions — page buttons**
  - "Bulk Upload": opened a form → saved — POST /api/documents/versions/upload-url → 200 · PUT supabase/storage/v1/object/upload/sign/documents/:id/document-control/new/1791595256958-ZZ%20AUDIT%20document.pdf → 200 · POST /api/documents/versions → 200
- **fleet**
  - save: Add Asset
  - sent: POST supabase/rest/v1/fleet_assets → 201
  - "GPS Integration": nothing happened (dead button?)
  - "Report": opened about:blank
  - "Add Asset": nothing happened (dead button?)
  - "ASSETS → 1 1 vehicle · 0 equipment": gone after reopening (state changed)
  - "MAINT. OVERDUE → 0 All caught up": gone after reopening (state changed)
  - "DUE SOON → 0 Within 500 mi or 14 days": gone after reopening (state changed)
  - "DOCS EXPIRED → 0 Registrations & insurance current": gone after reopening (state changed)
  - "EXPIRING → 0 Docs inside the 30-day window": gone after reopening (state changed)
  - "MAINT. COST → $0 Across 0 service records": gone after reopening (state changed)
  - "+ Log Service": nothing happened (dead button?)
  - "+ Add Doc": nothing happened (dead button?)
- **portals**
  - ERROR: locator.click: Timeout 5000ms exceeded.
- **portals**
  - ERROR: locator.click: Timeout 5000ms exceeded.
- **portals — page buttons**
  - "Generate Portal Link": could not tap: locator.click: Timeout 4000ms exceeded.
- **prequalification**
  - save: Save Template → Save Template → Save Template → Save Template
- **prequalification — page buttons**
  - "Send Prequal Form": nothing happened (dead button?)
- **radio**
  - save: Send message → Send → Add someone → Add someone
  - sent: POST /api/radio/messages → 201
  - NOT BACK after reload: ‹marker›, ‹marker› note
  - ERROR: could not reopen the record after editing
- **resource-planning**
  - save: Create Assignment → Create Assignment → Create Assignment → Create Assignment
- **service**
  - save: Create Call
  - sent: POST /api/service-tickets → 201
  - "Service Home": went to /app
  - "New Service Call": went to /app/service
  - "Open": went to /app/service
  - "Unassigned": went to /app/service
  - "Today": went to /app/service
  - "Waiting": went to /app/service
  - "Completed": went to /app/service
  - "All": went to /app/service
  - "ZZ AUDIT projects 10100057": nothing happened (dead button?)
  - "Save Schedule": saved — PATCH /api/service-tickets/:id → 200
  - "Triaged": saved — PATCH /api/service-tickets/:id → 200
  - "Scheduled": nothing happened (dead button?)
  - "Closed": saved — PATCH /api/service-tickets/:id → 200
- **settings**
  - ERROR: locator.click: Timeout 5000ms exceeded.
- **settings — page buttons**
  - "Save Branding": saved — PUT /api/branding → 200
- **projects/:id/overview**
  - save: Create Bid Package → Next → Next → Next
- **projects/:id/overview**
  - save: Invite Member → Send Invitation → Send Invitation → Send Invitation
- **projects/:id/overview — page buttons**
  - "Pay Apps": went to /app/projects/:id/pay-apps
- **projects/:id/photos**
  - save: Record Video
  - sent: POST /api/photos/upload-url → 200 · POST /api/files/upload-url → 200 · PUT supabase/storage/v1/object/upload/sign/project-files/:id/projects/:id/photo-staging/1791595788504-lp14en-ZZ%20AUDIT%20phone%20photo.jpg → 200 · PUT supabase/storage/v1/object/upload/sign/project-files/:id/projects/:id/files/1791595789140-ZZ%20AUDIT%20clip.mp4 → 200 · POST /api/files/upload-url → 200 · PUT supabase/storage/v1/object/upload/sign/project-files/:id/projects/:id/files/1791595789733-ZZ%20AUDIT%20clip-poster.jpg → 200 · POST /api/files/record → 200 · POST /api/photos/upload-url → 200
  - ERROR: page.goto: Timeout 45000ms exceeded.
- **projects/:id/files — page buttons**
  - "ADDED THIS WEEK → 2 Last upload Oct 10, 2026": nothing happened (dead button?)
- **projects/:id/daily-logs**
  - save: Create Log
  - sent: POST /api/daily-logs/create → 200
  - ERROR: page.goto: Timeout 45000ms exceeded.

## Test records left behind

- people: "ZZ AUDIT people 10100057"
- people: "ZZ AUDIT people 2 10100057"
- projects/:id/team: "ZZ AUDIT team 10100057"
- projects/:id/crews: "ZZ AUDIT crews 10100057"
- takeoff: uploaded test file "ZZ AUDIT …" (left on the test job, archived with it)
- leads: "ZZ AUDIT leads 10100057"
- billing/cost-control: "ZZ AUDIT billing cost control 10100057"
- document-versions: "ZZ AUDIT document versions 10100057"
- document-versions: "Bulk Upload" changed company data (test values only)
- fleet: "ZZ AUDIT fleet 10100057"
- radio: "ZZ AUDIT radio 10100057"
- service: "ZZ AUDIT service 10100057"
- settings: "Save Branding" changed company data (test values only)
- projects/:id/photos: "ZZ AUDIT photos 10100057"
- projects/:id/daily-logs: "ZZ AUDIT daily logs 10100057"
