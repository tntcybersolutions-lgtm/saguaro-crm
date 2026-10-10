# Action walk — every Add/New, save, reload, reopen, edit, every record button, delete (real account, iPhone WebKit)

Test records only (ZZ AUDIT). Mail goes to delivered@resend.dev, phones to 602-555-0100.

| Screen | Add/New | Create | Back after reload | Fields back | Edit pre-filled | Edit saved | Record buttons | Delete |
|---|---|---|---|---|---|---|---|---|
| projects/new (New Job form) | New Job form | saved | yes |  |  |  |  |  |
| OFFLINE · projects/:id/daily-logs | daily log with no signal | no Add/New button | NOT TESTED — the test browser cannot reload with no signal | GONE |  | NOTHING was sent after coming back online | 5 tapped, **1 bad** |  |
| OFFLINE · projects/:id/punch-list | punch item with no signal | kept on the phone (shows On This Phone) | NOT TESTED — the test browser cannot reload with no signal | on the server |  | sent by itself when the signal came back | 5 tapped, **1 bad** | yes |
| OFFLINE · projects/:id/photos | photo with no signal | kept on the phone | NOT TESTED — the test browser cannot reload with no signal | uploaded |  | NOTHING was sent after coming back online | 5 tapped, **1 bad** |  |
| subs | no Add/New on this screen |  |  |  |  |  |  |  |
| people | + New Role | saved | NOT ON LIST after reload |  |  |  |  |  |
| people | + Invite User | saved | yes | 3/3 | 1/3 | edit form did not show the saved title | 1 tapped | (at the end — used by the pickers) |
| people — page buttons | 2 write buttons |  |  |  |  |  | 2 tapped |  |
| customers | New Customer | saved | yes | 5/5 | 5/5 | yes | 9 tapped, **9 bad** | (at the end — used by the pickers) |
| projects/:id/directory | Add Someone | saved | yes | 4/4 | 4/4 | yes | 2 tapped, **1 bad** | (at the end — used by the pickers) |
| projects/:id/subs | Add Subcontractor | saved | yes | 5/5 | 5/5 | yes |  | (at the end — used by the pickers) |
| projects/:id/team | Invite Member | saved | yes | 2/2 | 2/2 | yes | 1 tapped | (at the end — used by the pickers) |
| projects/:id/team | New Customer | saved | yes | 2/2 | 2/2 | yes | 9 tapped, **6 bad** | (at the end — used by the pickers) |

## Details

- **projects/new (New Job form)**
  - sent: POST /api/projects/create → 200 · POST /api/autopilot/run → 200
- **OFFLINE · projects/:id/daily-logs**
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online"
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
  - save: Send Invite
  - sent: POST /api/team/invite → 200
  - edit form EMPTY for: delivered@resend.dev, ‹marker›
  - "Resend Invite": saved — POST /api/team/invite/:id → 200
- **people — page buttons**
  - "Team Members 7 Platform sign-ins": went to /app/people
  - "+ Assign Role": opened a panel (nothing to save)
- **customers**
  - save: Add Customer
  - sent: POST /api/customers/profiles → 201
  - "Overview": nothing happened (dead button?)
  - "Discovery": nothing happened (dead button?)
  - "Recommendations": nothing happened (dead button?)
  - "Designs": nothing happened (dead button?)
  - "Materials": nothing happened (dead button?)
  - "Conversations": nothing happened (dead button?)
  - "Assign to Project": error: locator.click: Timeout 4000ms exceeded.
  - "Send Email": error: locator.click: Timeout 4000ms exceeded.
  - "Saguaro": error: locator.click: Timeout 4000ms exceeded.
- **projects/:id/directory**
  - save: Add to Directory
  - sent: POST /api/projects/:id/directory → 201
  - "Add Someone": nothing happened (dead button?)
  - "Saguaro": opened https://saguarocontrol.net/
- **projects/:id/subs**
  - save: Add Subcontractor
  - sent: POST /api/projects/:id/subs → 201
- **projects/:id/team**
  - save: Send Invitation
  - sent: POST /api/team/invite → 200
  - "Resend Invite": saved — POST /api/team/invite/:id → 200
- **projects/:id/team**
  - save: Add Customer
  - sent: POST /api/customers/profiles → 201 · PATCH /api/projects/:id → 200
  - "Overview": nothing happened (dead button?)
  - "Discovery": nothing happened (dead button?)
  - "Recommendations": nothing happened (dead button?)
  - "Designs": nothing happened (dead button?)
  - "Materials": nothing happened (dead button?)
  - "Conversations": nothing happened (dead button?)
  - "Assign to Project": saved — POST /api/projects/assign → 200
  - "Send Email": opened a form → saved — POST /api/customers/:id/email → 200
  - "Saguaro": opened https://saguarocontrol.net/

## Test records left behind

- people: "ZZ AUDIT people 10101707"
