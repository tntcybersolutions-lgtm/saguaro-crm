# Action walk — every Add/New, save, reload, reopen, edit, every record button, delete (demo account, iPhone WebKit)

Test records only (ZZ AUDIT). Mail goes to delivered@resend.dev, phones to 602-555-0100.

| Screen | Add/New | Create | Back after reload | Fields back | Edit pre-filled | Edit saved | Record buttons | Delete |
|---|---|---|---|---|---|---|---|---|
| projects/new (New Job form) | New Job form | saved | yes |  |  |  |  |  |
| OFFLINE · projects/:id/daily-logs | daily log with no signal | kept on the phone (shows On This Phone) | yes — still there after an offline reload | GONE |  | sent by itself when the signal came back | 5 tapped, **1 bad** |  |
| OFFLINE · projects/:id/punch-list | punch item with no signal | kept on the phone (shows On This Phone) | yes — still there after an offline reload | GONE |  | sent by itself when the signal came back | 5 tapped, **1 bad** |  |
| OFFLINE · projects/:id/photos | photo with no signal | the file picker did not open | still waiting after an offline reload | uploaded |  | NOTHING was sent after coming back online | 5 tapped, **1 bad** |  |
| subs | no Add/New on this screen |  |  |  |  |  |  |  |
| people | no Add/New on this screen |  |  |  |  |  |  |  |
| people — page buttons | 1 write buttons |  |  |  |  |  | 1 tapped |  |
| customers | no Add/New on this screen |  |  |  |  |  |  |  |
| projects/:id/directory | Add Someone | saved | yes | 4/4 |  | no Edit button on the record |  |  |
| projects/:id/subs | Add Subcontractor |  |  |  |  |  |  |  |
| projects/:id/team | Invite Member | NOTHING SENT on save |  |  |  |  |  |  |

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
- **OFFLINE · projects/:id/punch-list**
  - sent: POST /api/punch-list/create → 200 · POST /api/punch-list/create → 200
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline 2 items saved on this phone — they send when you're back."
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online Sending what you saved offline…"
- **OFFLINE · projects/:id/photos**
  - "the offline worker controls the page": yes
  - "offline bar shows": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "bar counts it": yes — "You're offline Photos, daily logs and punch items you add are saved on this phone and send"
  - "reload offline": failed: page.reload: WebKit encountered an internal error
  - "back-online bar shows": yes — "Back online"
- **people — page buttons**
  - "TEAM MEMBERS 1 Platform sign-ins": went to /app/people
- **projects/:id/directory**
  - save: Add to Directory
  - sent: POST /api/projects/:id/directory → 200
  - ERROR: could not reopen the record after editing
- **projects/:id/subs**
  - ERROR: locator.click: Timeout 5000ms exceeded.
- **projects/:id/team**
  - save: Send Invitation → Send Invitation → Send Invitation → Send Invitation

## Test records left behind

- projects/:id/directory: "ZZ AUDIT directory 10100216"
