# Action walk — every Add/New, save, reload, reopen, edit, every record button, delete (demo account, iPhone WebKit)

Test records only (ZZ AUDIT). Mail goes to delivered@resend.dev, phones to 602-555-0100.

| Screen | Add/New | Create | Back after reload | Fields back | Edit pre-filled | Edit saved | Record buttons | Delete |
|---|---|---|---|---|---|---|---|---|
| projects/new (New Job form) | New Job form | saved | yes |  |  |  |  |  |
| OFFLINE · projects/:id/daily-logs | daily log with no signal | kept on the phone (shows On This Phone) | NOT TESTED — the test browser cannot reload with no signal | on the server |  | sent by itself when the signal came back | 5 tapped, **1 bad** | not on the list any more (closed/moved by a button) |
| OFFLINE · projects/:id/punch-list | punch item with no signal | kept on the phone (shows On This Phone) | NOT TESTED — the test browser cannot reload with no signal | on the server |  | sent by itself when the signal came back | 5 tapped, **1 bad** | not on the list any more (closed/moved by a button) |
| OFFLINE · projects/:id/photos | photo with no signal | kept on the phone | NOT TESTED — the test browser cannot reload with no signal | uploaded |  | NOTHING was sent after coming back online | 5 tapped, **1 bad** |  |
| subs | no Add/New on this screen |  |  |  |  |  |  |  |
| people | no Add/New on this screen |  |  |  |  |  |  |  |
| customers | New Customer | NOTHING SENT on save |  |  |  |  |  |  |
| projects/:id/directory | Add Someone | saved | yes | 4/4 | 4/4 | yes | 1 tapped, **1 bad** | (at the end — used by the pickers) |
| projects/:id/subs | Add Subcontractor | DEAD — tapping it did nothing |  |  |  |  |  |  |
| projects/:id/team | Invite Member | saved | yes | 3/4 | 2/4 | edit form did not show the saved title |  |  |
| projects/:id/team | New Customer | saved | NOT ON LIST after reload |  |  |  |  |  |

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
  - sent: POST /api/punch-list/create → 200 · POST /api/punch-list/create → 200
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline 1 item saved on this phone — it sends when you're back."
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online Sending what you saved offline…"
- **OFFLINE · projects/:id/photos**
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online"
- **customers**
  - save: Add Customer → Add Customer
- **projects/:id/directory**
  - save: Add to Directory
  - sent: POST /api/projects/:id/directory → 200
  - "Add Someone": nothing happened (dead button?)
- **projects/:id/team**
  - save: Send Invitation → Invite Member → Invite Member
  - sent: POST /api/team/invite → 200 · PATCH /api/projects/:id → 200 · PATCH /api/projects/:id → 200
  - NOT BACK after reload: ‹marker› note
  - edit form EMPTY for: ‹marker›, ‹marker› note
  - ERROR: could not reopen the record after editing
- **projects/:id/team**
  - save: Add Customer
  - sent: POST /api/customers/profiles → 201 · PATCH /api/projects/:id → 200

## Test records left behind

- projects/:id/team: "ZZ AUDIT team 10101424"
- projects/:id/team: "ZZ AUDIT team 2 10101424"
