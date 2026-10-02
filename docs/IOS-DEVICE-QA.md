# iOS device QA — drive it like a real person

**Purpose:** this is the click-through the cloud session cannot do. A **local
Claude Code (or a person) with a browser** runs it against the running app,
taps **every** button, checks that **fields talk to each other**, and judges
the **flow** — then logs each defect into `docs/IOS-FLOW-AUDIT.md` so it gets
fixed. The point is to find what static code reading cannot: a button that's
wired but does the wrong thing, a form that doesn't pre-fill, a save that
doesn't stick, a screen a new user can't make sense of.

---

## Setup (pick one)

- **Truest:** Xcode iOS Simulator running the Capacitor app (`npm run cap:build:ios`,
  then run in Simulator). This is the real native shell (camera, geo, push).
- **Fastest, ~identical UI:** the app is server-mode, so a **mobile-emulated
  Chromium** (DevTools device toolbar → iPhone 15, or Playwright
  `devices['iPhone 15']`) against the live site reproduces the same screens.
  Use this for buttons/fields/flow; use the Simulator only for camera/photo/GPS.
- **URL:** production `https://saguarocontrol.net` or a PR preview.
- **Creds:** sign in as a real account; for the permissions check also have a
  **Salesperson** login. Never hardcode — read from env (`E2E_EMAIL` /
  `E2E_PASSWORD`).

## How to run it (the rule for every screen)

For each screen below: 
1. **Tap every button, link, tab, and row.** For each, record one of:
   `works` · `dead` (nothing happens) · `wrong` (does the wrong thing) ·
   `hard-to-tap` (too small/misses).
2. **Fields-talk check:** create or edit something, **save**, then **reopen
   it** — confirm every field persisted and pre-fills, and that dependent
   fields/relationships updated (e.g. a won deal shows up as a job; a stage
   change moves the card).
3. **Flow check:** at the top of each screen ask *"if I'd never seen this,
   would I know what to do next?"* Note anything confusing.
4. **Screenshot** anything you mark `dead`/`wrong`/confusing.

Log every non-`works` result in the **Findings** table at the bottom and copy
it into `docs/IOS-FLOW-AUDIT.md`.

---

## Screen-by-screen script

### 0. App open (the thing that was just fixed)
- Launch the app signed-in. **Expect:** lands in `/app` (or `/app/sales` for a
  sales rep), NOT the marketing page. If you see "Start free trial" → FAIL.
- Signed out: expect the login screen (or marketing with a clear Sign in).

### 1. Login
- Enter email + password → **Sign in**. Expect to land in the app.
- Wrong password → a clear error, not a dead button or a silent spinner.

### 2. Home / dashboard (`/app`, and `/app/sales` for a rep)
- Tap every tile/card/quick-action. Do they each go somewhere real?
- Numbers present (not all zero, not blank)? Pipeline/follow-ups load?
- Universal search box: type a known company → results appear → tap one → lands
  on the right record.

### 3. Leads board (`/app/leads`)
- Create a lead: tap **New**, fill company/contact/value/stage, **Save**.
  Reopen it → every field pre-fills? (fields-talk)
- Open the lead → **Open deal page →**.

### 4. Deal page (`/app/leads/[id]`)
- **Stage bar:** tap each stage. Does the header chip change and stick on
  reload? Move to **Won** → does the "Open the job →" button appear?
- **Send to GC:** compose + send → does it log on the activity list? (if email
  isn't configured it should say so, not fake success)
- **Files & media:** **Upload** a photo, a PDF, a doc. Does it list? Does
  **Download** return the same file? (up = down) — Simulator/real device for
  camera.
- **Activity:** add a note → appears immediately?
- **Convert/Won → job:** tap it → lands on the new project? Re-tap → same job,
  no duplicate?

### 5. Documents (`/app/documents`)
- Do files show a **real type (PDF/DOCX/XLSX) with an extension/icon**, or a
  generic look? (known complaint — expect generic until fixed)
- Tap a document → does it open/preview? Tap generate actions → do they work?

### 6. Jobs / projects (`/app/projects` → a project)
- Open a project. Walk its tabs (budget, daily logs, photos, pay apps, change
  orders, invoices). Tap the primary button on each — create one item, reopen,
  confirm it saved.

### 7. Field basics
- **Time clock** (`/app/time`): Clock In → running timer? Clock Out → entry
  saved?
- **Daily log**: create today's → saves + lists?
- **Photo**: capture/upload on a project → thumbnail shows immediately (no
  broken image) and survives reload?

### 8. Reviews (`/app/reviews`)
- Add a review (stars + name + text) → average updates, review lists?

### 9. Reps & permissions (`/app/people`)
- Add a rep / assign a role. Then sign in as that **Salesperson**: the nav
  hides what they can't see; the dashboard shows no contract value/revenue.

### 10. General, every screen
- Buttons big enough to hit with a thumb? (flag any you keep missing)
- Text readable (no grey-on-black you have to squint at)?
- Back/nav always obvious? Any dead-end screens?

---

## Findings template (copy each into IOS-FLOW-AUDIT.md)

```
### Finding: <short title>
- Screen: <path, e.g. /app/leads/[id]>
- What I did: <taps/typing>
- Expected: <...>
- Actual: <dead / wrong / didn't save / confusing>
- Severity: blocker | major | minor
- Screenshot: <attach>
```

When findings land here, the cloud session fixes each in its own PR and marks
it FIXED in `IOS-FLOW-AUDIT.md`.
