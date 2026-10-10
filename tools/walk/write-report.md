# Action walk — every Add/New, save, reload, reopen, edit, every record button, delete (demo account, iPhone WebKit)

Test records only (ZZ AUDIT). Mail goes to delivered@resend.dev, phones to 602-555-0100.

| Screen | Add/New | Create | Back after reload | Fields back | Edit pre-filled | Edit saved | Record buttons | Delete |
|---|---|---|---|---|---|---|---|---|
| projects/new (New Job form) | New Job form | saved | yes |  |  |  |  |  |
| OFFLINE · projects/:id/daily-logs | daily log with no signal | kept on the phone (shows On This Phone) | NOT TESTED — the test browser cannot reload with no signal | on the server |  | sent by itself when the signal came back | 5 tapped, **1 bad** |  |
| OFFLINE · projects/:id/punch-list | punch item with no signal | kept on the phone (shows On This Phone) | NOT TESTED — the test browser cannot reload with no signal | on the server |  | sent by itself when the signal came back | 5 tapped, **1 bad** | not on the list any more (closed/moved by a button) |
| OFFLINE · projects/:id/photos | photo with no signal | kept on the phone | NOT TESTED — the test browser cannot reload with no signal | uploaded |  | NOTHING was sent after coming back online | 5 tapped, **1 bad** |  |
| subs | no Add/New on this screen |  |  |  |  |  |  |  |
| people | + New Role | saved | NOT ON LIST after reload |  |  |  |  |  |
| people | + Invite User | saved | yes | 3/3 |  | no Edit button on the record | 6 tapped | (at the end — used by the pickers) |
| people — page buttons | 2 write buttons |  |  |  |  |  | 2 tapped |  |
| customers | New Customer | saved | yes | 4/5 |  | no Edit button on the record |  |  |
| projects/:id/directory | Add Someone | saved | yes | 4/4 | 4/4 | NOTHING SENT on save | 1 tapped, **1 bad** | (at the end — used by the pickers) |
| projects/:id/subs | Add Subcontractor | DEAD — tapping it did nothing |  |  |  |  |  |  |
| projects/:id/team | Invite Member | saved | yes | 3/4 | 2/4 | edit form did not show the saved title | 16 tapped, **7 bad** | (at the end — used by the pickers) |
| projects/:id/team | New Customer | saved | listed, but tapping it opened nothing |  |  |  |  |  |

## Details

- **projects/new (New Job form)**
  - sent: POST /api/projects/create → 200 · POST /api/autopilot/run → 200
- **OFFLINE · projects/:id/daily-logs**
  - sent: POST /api/daily-logs/create → 200
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline 1 item saved on this phone — it sends when you're back."
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online 1 item sent from this phone."
  - ERROR: airplane test took over 4 minutes on this screen
- **OFFLINE · projects/:id/punch-list**
  - sent: POST /api/punch-list/create → 200
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline 1 item saved on this phone — it sends when you're back."
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online Sending what you saved offline…"
  - ERROR: airplane test took over 4 minutes on this screen
- **OFFLINE · projects/:id/photos**
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online"
- **people**
  - save: Create Role
  - sent: POST /api/roles → 201
- **people**
  - save: Send Invite → Send Invite → Send Invite
  - sent: POST /api/team/invite → 200
  - "ROLES DEFINED 8 Permission templates in force": gone after reopening (state changed)
  - "ROLE ASSIGNMENTS 1 Users mapped to roles": gone after reopening (state changed)
  - "PENDING INVITES 4 Invites expire after 7 days": gone after reopening (state changed)
  - "CREW DIRECTORY 3 0 OSHA certified": gone after reopening (state changed)
  - "+ New Role": opened a form → saved — POST /api/roles → 201
  - "Team": record no longer on the list (an earlier button closed/moved it)
- **people — page buttons**
  - "TEAM MEMBERS 1 Platform sign-ins": went to /app/people
  - "+ Assign Role": opened a panel (nothing to save)
- **customers**
  - save: Add Customer → Add Customer → Add Customer → Add Customer
  - sent: POST /api/customers/profiles → 201
  - NOT BACK after reload: 85001
  - ERROR: could not reopen the record after editing
- **projects/:id/directory**
  - save: Add to Directory
  - sent: POST /api/projects/:id/directory → 200
  - "Add Someone": nothing happened (dead button?)
- **projects/:id/team**
  - save: Send Invitation
  - sent: PATCH /api/projects/:id → 200 · PATCH /api/projects/:id → 200 · POST /api/team/invite → 200
  - NOT BACK after reload: ‹marker› note
  - edit form EMPTY for: ‹marker›, ‹marker› note
  - "Invite Member": nothing happened (dead button?)
  - "PROJECT → ZZ AUDIT Walk Job 10100251 #2026-007": gone after reopening (state changed)
  - "OWNER → ZZ AUDIT customers 10100251 delivered@resend.dev": gone after reopening (state changed)
  - "ARCHITECT → — Design contact": gone after reopening (state changed)
  - "LEADERSHIP → 1/5 Directory roles assigned": gone after reopening (state changed)
  - "TRADES ON THE JOB → 0 No subs yet": gone after reopening (state changed)
  - "TEAM MEMBERS → 1 0 with access · 1 invited": gone after reopening (state changed)
  - "SUBCONTRACTORS → 0 Portal access": gone after reopening (state changed)
  - "FIELD LEADERSHIP → 1/5 PM · super · foreman · owner · archit": gone after reopening (state changed)
  - "New Customer": nothing happened (dead button?)
  - "Open Customers": went to /app/customers
  - "Set Project Manager": nothing happened (dead button?)
  - "Set Superintendent": nothing happened (dead button?)
  - "Set Foreman": nothing happened (dead button?)
  - "Set Architect": nothing happened (dead button?)
  - "Ascending — switch to descending": nothing happened (dead button?)
- **projects/:id/team**
  - save: Add Customer
  - sent: POST /api/customers/profiles → 201 · PATCH /api/projects/:id → 200

## Test records left behind

- people: "ZZ AUDIT people 10100251"
- customers: "ZZ AUDIT customers 10100251"
- projects/:id/team: "ZZ AUDIT team 2 10100251"
