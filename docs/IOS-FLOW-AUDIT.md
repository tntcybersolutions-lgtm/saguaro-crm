# iOS app — real-person flow audit & fix log

The iOS app runs Capacitor in **server mode** (`capacitor.config.ts`): the
native WebView loads the hosted site live, so **the web code IS the iOS screen**
and a web fix lands on the phone with no App Store resubmit. This audit maps
what a real person does, step by step, then records what our code actually does
at each step — confirmed by reading it, not guessed — and the fix status.

Honesty rule for this doc: a line is only marked **FIXED** when the change is on
`main`; everything else is **CONFIRMED BUG** (seen in code) or **NEEDS DEVICE**
(only findable by driving the running app, which this environment cannot do).

---

## Journey A — the salesperson (Rob opens the app to work deals)

| # | What a real person does | What our app does | Status |
|---|---|---|---|
| A1 | Opens the app | Loads `/` = the **marketing homepage** ("Start free trial / Pricing"). Nothing redirects a signed-in user to the product. | **FIXED** (middleware: signed-in `/` → `/app`) |
| A2 | Expects to land on their work | Sales-only reps now route to `/app/sales` at login (P2); others to `/app` | OK |
| A3 | Sees the pipeline / what's late | `/app/sales` shows pipeline + follow-ups + profit + search | OK |
| A4 | Opens a deal | Leads → "Open deal page →" → `/app/leads/[id]` | OK |
| A5 | Moves the deal a stage | Stage button bar (one tap, stamps won/lost) | OK |
| A6 | Logs a call/note | Activity composer | OK |
| A7 | Sends the GC an update | "Send to GC" composer | OK (email send needs RESEND configured) |
| A8 | Attaches a document/photo | Deal "Files & media" (upload/download) | NEEDS DEVICE (byte path) |
| A9 | Wins it → opens the job | "Open the job →" convert | OK |

## Journey B — the field user (crew member on site)

| # | Real person | Our app | Status |
|---|---|---|---|
| B1 | Opens app | same `/` marketing bug as A1 | **FIXED** (A1) |
| B2 | Clocks in | `/app/time` → Clock In | OK (data layer) |
| B3 | Takes a site photo | `/app` photos / project photos | NEEDS DEVICE (camera + upload) |
| B4 | Writes the daily log | `/app/daily-logs` | OK (data layer) |

---

## Cross-cutting CONFIRMED BUGS (found in code, affect every screen on the phone)

1. **Documents look generic/cheap.** `app/app/documents/page.tsx` lists every
   file with one phosphor `FileText` icon and its `doc_type` text — **no real
   file-type icon, no extension badge (PDF/DOCX/XLSX/PNG), no thumbnail**. This
   is the "cheap little pdf/doc" complaint. → *Next fix: a real file-type badge
   component used wherever files are listed.*

2. **Buttons too small to tap on a phone.** ~1,300 button sites use padding
   like `3px 10px` / `4px 12px` / `5px 14px` → ~24–30px tall, under the iOS
   **44px** tap-target minimum. Reads as "buttons don't work / I keep missing
   them." → *Next fix: raise shared button styles to a 44px floor on touch.*

3. **Low-contrast text.** `#6B7280` and `#64748B` grays on the near-black
   background sit at/below ~3:1 — below the readable floor. "Colors hard to
   see." → *Next fix: replace those two tokens with a readable gray.*

---

## NEEDS DEVICE (only a driven app can confirm — not this environment)

- Which specific buttons do nothing at runtime (a wired `onClick` can still
  call a broken path).
- Whether fields "talk to each other" (forms pre-filling, saves reflecting,
  relationships joining) on each create/edit flow.
- The felt "confusing flow" beyond the entry-point fix above.

These need a **local Claude Code with a simulator/device** (this cloud box
cannot reach the app — egress is policy-blocked). The fixes above are the
code-confirmable subset; this doc is where each device-found issue gets logged
and knocked down.

---

_Fix log — append each change here as it merges:_
- 2026-10-02: Entry redirect — signed-in `/` → `/app` (middleware). Stops the
  app opening on the marketing page.
