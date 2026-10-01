# Browser certification pass — the §0 PASS walkthrough

Every MUST-PASS path is verified at the **code + live-data layer** (each shipped
behind a PR that built green on Vercel and round-tripped against the live
database `jddfvugsaosvgllbkzch`). What is **not** yet done is the §0 rule: a path
is only `PASS` once it has been **driven signed-in in a real browser** and the
output seen. This document is that drive — walk it top to bottom, and for each
path flip its `STATUS:` line in `docs/MUST-PASS.md` from `NOT VERIFIED` to
`PASS — <date>, <who>` only when the **PASS** box below is literally true on
screen.

A path is **not** PASS because this file says the steps. It is PASS because you
did them and saw the result. If a step fails, that is a real find — note it in
`docs/FOUND.md`, do not write PASS.

---

## 0. Before you start

**You need two signed-in accounts** in the tenant:
- an **Admin / Owner** (sees everything) — for Paths 1–14,
- a **Salesperson** (role `Salesperson`, which resolves to `Budget:None`,
  `Pay Apps:None`, `Sales:Full`, `Admin:None`) — for Path 16.
  Assign it in **Settings → Roles & Permissions** if no user holds it yet.

**Where to drive:**
- Production: `https://saguarocontrol.net`
- or any branch preview: `https://saguaro-crm-git-<branch>-salty-vault.vercel.app`

**One project with real data.** Most paths need a project that has a contract
value, a budget, and at least one sub. Use an existing active job, or create one.

### SSL — what's needed (answer: nothing to add)

TLS is already handled and needs **no setup** for this pass:
- `saguarocontrol.net` and `www.saguarocontrol.net` are **verified** domains on
  Vercel (project `saguaro-crm`), so Vercel auto-provisions and auto-renews their
  Let's Encrypt certificates.
- Every `*.vercel.app` **preview** URL is served over valid HTTPS automatically.

So you drive every path over plain `https://` with a normal padlock — no
self-signed cert, no `--insecure`, no browser override. If a browser ever warns
about the cert on one of those hosts, that is a real incident (expired/misissued
cert), not a step to click past — capture it and stop.

> The only self-signed certificate in this operation is the **Phoenix recon rig**
> (`https://100.123.118.18:8443`, Kismet/GPS) — a *separate* system on the
> tailnet, nothing to do with the CRM or this cert pass. Don't conflate them.

**How to read each box:** DO = the clicks; PASS = what must be on screen; the
data-layer line says what was already proven in code so you know what you're
confirming visually.

---

# TIER 1 — the daily driver

### Path 1 — Write today's daily log
- **DO:** open a project → **Daily Logs** → **New** → set date = today, weather,
  crew count, a work-performed note → **Save**.
- **PASS:** the log appears in the project's list dated today with your text; a
  reload still shows it.
- Data layer: `app/api/daily-logs/create` writes verified-clean.

### Path 2 — Clock in and clock out
- **DO:** **Time** (`/app/time`) → **Clock In** (optionally pick a project) →
  confirm the running timer → **Clock Out**.
- **PASS:** after clock-in the screen shows you as on the clock with a start
  time; after clock-out a completed entry with elapsed time shows, and a reload
  agrees.
- Data layer: canonical web clock = `/api/timeclock/{in,out,status}` (not
  `/api/clock/*`, which is dead — see FOUND.md).

### Path 3 — Take a photo and attach it to a job
- **DO:** project → **Photos** → upload a photo (phone camera or a JPEG).
- **PASS:** the new photo's **thumbnail renders immediately** (no broken-image
  tile) *and* still renders after a full reload; opening it shows the full image.
- Data layer: upload response now **signs** url/thumbnail_url (private bucket) so
  the optimistic preview is live at once — the fix in PR #11. Confirm there is
  **no** broken tile before reload; that was the original defect.

### Path 4 — See what is happening today (dashboard)
- **DO:** open the dashboard (`/app`).
- **PASS:** active-project count, open items, and (as Admin) total contract value
  / monthly revenue render as real numbers — not all zeros, not a blank
  getting-started rail for a tenant that has live jobs.
- Data layer: `/api/dashboard/stats` — a failed query is an honest error, not
  eight zeros; withheld (by permission) figures are **omitted**, not shown as 0.

---

# TIER 2 — the money

### Path 5 — Set a contract and a budget
- **DO:** project → **Budget** → set/confirm the contract value → add a budget
  line (cost code + amount) → **Save**.
- **PASS:** the contract value and budget line persist and reload; totals add up.
- Data layer: `app/api/budgets/create` verified-clean.

### Path 6 — Bill the owner with a pay application
- **DO:** project → **Pay Applications** → **New** → enter work completed this
  period on a line or two → save → review the G702/G703 totals.
- **PASS:** "current payment due" = earned-less-retainage **minus previous
  certificates** (it does **not** double-count prior periods); the sheet totals
  tie out.
- Data layer: `lib/finance/payapp.ts` `computePayApp` unit-proven 10/10.

### Path 7 — Get a lien waiver signed
- **DO:** project → **Lien Waivers** → create a waiver for a sub/period → send /
  mark signed per the UI.
- **PASS:** the waiver shows its correct state transition and persists; no
  phantom `received` status (that model hint was removed — see FOUND.md).

### Path 8 — Raise and approve a change order
- **DO:** project → **Change Orders** → **New** → title + cost impact → save →
  then approve it.
- **PASS:** the CO saves with an auto-assigned CO number and appears in the list;
  approving flips its status. If a save fails, you get a **real error with a
  correlation id** (not a silent "Internal server error").
- Data layer: PR #5 — killed the bare catch; a DB trigger owns `co_number`.

### Path 9 — Invoice and record payment
- **DO:** **Invoicing** (or project → Invoices) → **New invoice** (vendor,
  amount, tax) → save → open it → **Record payment** (amount, method, check #).
- **PASS:** invoice `total` = amount + tax (server-computed, never a stale/zero
  client total); after recording payment the status reads **paid** and persists.
- Data layer: PR #7 — both handlers fail honestly with a correlation id; money
  is server-canonical.

---

# TIER 3 — the sales side

### Path 10 — One stage vocabulary
- **DO:** on the leads board, note the pipeline-by-stage counts/values; move a
  lead between stages a couple of times.
- **PASS:** a lead typed as e.g. lowercase from an import still lands in the right
  stage column; qualified-pipeline totals look whole (no deals silently missing).
- Data layer: `lib/lead-stages.ts` normalises on write; unit-proven 12/12.

### Path 11 — Take a lead in and work it
- **DO:** **Leads** → **New lead** (company, contact, value, stage) → save → edit
  it (change a field, move its stage) → optionally delete a throwaway one.
- **PASS:** create, edit, stage-move, and delete all persist and reload; a failed
  write surfaces a real error (not generic "Internal server error").
- Data layer: PR #6 — all three write handlers honest.

### Path 12 — Move a deal through the stages  *(the new screen — drive carefully)*
- **DO:** **Leads** → open a lead → **"Open deal page →"** (lands on
  `/app/leads/<id>`) → use the **stage button bar**: tap New→Contacted→…; log an
  activity (type + note + **Add**); move it to **Won**.
- **PASS:** each stage tap updates the header chip and sticks on reload (the URL
  is shareable); the activity appears in the timeline immediately; at **Won** an
  **"Open the job →"** button appears.
- Data layer: PR #10 — `GET /api/leads/[id]` (404 cross-tenant), stage PATCH
  stamps `won_at`/`lost_at`; `Proposal→Won→Proposal` round-trip proven.

### Path 13 — Win it and open the job
- **DO:** on a **Won** deal page, click **"Open the job →"**.
- **PASS:** it lands on `/app/projects/<id>` for a newly-created project (customer
  created, contract_value carried over); clicking it again on an
  already-converted deal opens the **same** job (no duplicate).
- Data layer: PR #4 — idempotent win→job handoff.

### Path 14 — The numbers agree everywhere
- **DO:** compare the **qualified pipeline** figure across three surfaces for the
  same tenant: the **leads board** pipeline-by-stage, the **sales overview**
  (SalesOverview), and the **sales-journey rail** "qualified" signal.
- **PASS:** the three show the **same** qualified count/value — they don't
  disagree.
- Data layer: PR #9 — one `summariseByStage` + one `QUALIFIED_STAGES`; harness
  `npm run test:pipeline` → 4/4.

---

# TIER 4 — the demo surface

### Path 15 — A subcontractor is onboarded and compliant
- **DO:** **Subs** → **New sub** (company, trade, email) → open it → set W-9 on
  file, insurance expiry, license expiry → save → (if used) score a
  prequalification submission.
- **PASS:** the sub saves and its compliance fields persist; a failed save
  surfaces a real error with a correlation id (not a silent 500 or a false
  "saved").
- Data layer: PR #8 — all seven handlers across subs + prequal fail honestly.

### Path 16 — Permissions hold for a non-admin
- **DO:** sign in as the **Salesperson** account. Look at the left nav and the
  dashboard.
- **PASS:**
  - the rail **hides** what they can't open (no Budget / Pay Apps / Admin), and
  - the dashboard shows **no** total contract value and **no** monthly revenue
    (those tiles are absent, not `$0`), and
  - hitting a money endpoint directly returns nothing financial (no leak of what
    the rail hid). Then sign back in as Admin and confirm those tiles **are**
    there.
- Data layer: Path 16 verified — `Salesperson` resolves to `Budget:None`, the
  dashboard omits withheld figures, `requirePermission` enforces tenant isolation
  (cross-tenant project → 404).

---

## When you're done

For each path that passed on screen, edit its `STATUS:` line in
`docs/MUST-PASS.md` to `PASS — <YYYY-MM-DD>, <your name / "local Playwright">`.
Anything that didn't pass goes in `docs/FOUND.md` with what you saw — never a
PASS you didn't witness.
