# Marketing Audit + Product Demo Video — plan & shot list

Two parts: (1) what to clean up/enhance on the public marketing side, and (2) the full
end-to-end product demo **video** local Claude records in the logged-in app, to feature
**big on the homepage** so every visitor watches the system run a real job start to finish.

---

## PART 1 — Marketing site audit (production `saguarocontrol.net`, read live)

### Fixed already (cloud)
- **Stale demo domain** `app.saguaro.build/takeoff` in the hero mockup + getting-started tour →
  now `saguarocontrol.net/app/takeoff`. (commit `61379b3`)

### Strengths (keep)
- Strong, specific hero: "Run the job. Talk to the crew. Price the work. One platform." The
  radio + Signal Studio + takeoff angle is differentiated and honest.
- Pricing is clean and correct: **$499 / $750 / Call for Quote**, 30-day trial, no SOC 2 claims,
  "no credit card." Competitor columns anonymized on purpose with an honest disclaimer.
- US English throughout; real module names; "shows you its receipts" ledger angle is good.

### Cleanup / enhance (hand to local Claude, verify on preview)
1. **HERO VIDEO (the big one — Part 2).** Today the hero shows a *static* animated takeoff
   table. Replace/augment with the real product demo video (autoplay-muted loop as hero, with a
   prominent "▶ Watch the 3-min overview" that opens the full video). This is the #1 enhancement.
2. **Comparison table** ("How Saguaro Compares"): confirm the ✓/✗ marks actually render in both
   themes and at 390px — the scrape returned empty cells; verify they're not invisible.
3. **"Try the Radio" / `#radio-demo`**: the hero links to `#radio-demo` but there's no clear
   on-page radio demo section — either build a real inline demo or point the CTA to `/get-the-app`.
4. **Repeated line** "Every feature/module ships with automated live proof" appears twice and is
   vague — cut one, or make it concrete (link to a live status/proof page).
5. **Consistency pass** across the 37 public pages (`app/*/page.tsx`): one hero style, one CTA
   style ("Start Free Trial"), one footer, same logo treatment, same section rhythm. Audit
   `features`, `pricing`, `how-it-works`, `security`, `compare`, `product`, `industry`,
   `switch-from-procore`, `get-the-app`, `takeoff`, `bids`, `roi-calculator`.
6. **Public = marketing max-width is fine** (unlike the app). Keep hero compositions full-bleed,
   text columns readable (~65–80ch).

---

## PART 2 — The product demo VIDEO

**Goal:** one high-quality overview video, ~**2:30–3:30**, showing the full GC lifecycle on real
data, including a **hand-off between two users**, ending at closeout. Feature it on the homepage.

### Setup before recording
- **Two test users** in a demo tenant (not Chad's live prod tenant — use a demo/sandbox tenant or
  the `claude.qa` account + a second), with real roles:
  - **User A — Estimator/Salesperson** (does takeoff, Signal Studio, bid).
  - **User B — Project Manager/Superintendent** (takes over, runs field → closeout).
  - This showcases roles/permissions + assignment/handoff — a real differentiator.
- Seed ONE realistic demo project with a blueprint to upload (no fake financials in prod — use a
  demo tenant). Clean browser, no personal data, 1920×1080 (record at 2× / 4K if possible).
- Hide dev tools; full-screen the app; cursor-highlight on; smooth, deliberate clicks.

### Shot list (scene · what to show · on-screen caption)
1. **Sign in** (0:00–0:12) — land on `saguarocontrol.net`, click Start/Log in, sign in as **User A**.
   Dashboard loads. _Caption: "One login. The whole job."_
2. **Start the job** (0:12–0:30) — New Project → fill the real form (name, address, type). Project
   home opens on the **Bidding** phase. _Caption: "Every job starts in Bidding."_
3. **Takeoff** (0:30–1:05) — open Takeoff Studio, **upload the blueprint**, watch the AI measure →
   the priced line-item table builds (concrete, rebar, CMU, steel… → total). Open one figure to
   show its **receipt** (what it measured + catalog line). _Caption: "Blueprint in. Priced bid out."_
4. **Signal Studio / heatmap** (1:05–1:45) — open Signal Studio on the floor plan, run coverage so
   the **RF heatmap** renders, **place access points / devices**, click a device to show its
   **details + coverage radius**, show a dead-zone close. _Caption: "Design the network before anyone pulls cable."_
5. **Bid jacket → win** (1:45–2:05) — package the bid (scope + quantities + price), then on the
   Bid Board hit **"We won it →"** so the project flips **Bidding → Building**. _Caption: "Win it — the product switches to build mode."_
6. **HAND-OFF** (2:05–2:25) — User A **assigns the job / invites** User B (PM) and signs out.
   **Sign in as User B** — their dashboard shows the job in **My Work**. _Caption: "Hand the won job to the team — nothing re-entered."_
7. **Run the field** (2:25–3:00) — as User B: a **Daily Log** auto-filling from clock-ins/weather,
   the **live crew map**, a **T&M ticket signed on glass**, a **photo** with GPS, answer an **RFI**.
   _Caption: "The field runs itself into the record."_
8. **Money** (3:00–3:15) — a **pay app (G702/G703)** building from live data; a **change order**.
   _Caption: "The pay app builds itself."_
9. **Closeout** (3:15–3:30) — punch list cleared, closeout docs, **mark the job Closed**; dashboard
   shows it move to Complete. _Caption: "From blueprint to closeout — one platform."_
   End card: logo + "Start your free trial — saguarocontrol.net".

### Production specs
- 1080p min (4K preferred), 30/60fps, MP4 (H.264) + a WebM fallback; a poster frame (hero still).
- Snappy pacing, subtle zoom on key moments, on-screen captions (above), light background music,
  optional short VO. Keep each scene tight — no dead clicks.
- Chapters matching the 9 scenes (for a YouTube/embedded player with a scrubber).

### Homepage embed (make it big)
- **Hero:** a muted, autoplay, looped highlights cut as the hero visual, with a bright
  **"▶ Watch the full 3-min overview"** button that opens the full video (lightbox/modal or a
  dedicated `/demo` section). Respect `prefers-reduced-motion` (show the poster, not autoplay).
- **Hosting:** the file is large — don't commit it to the repo. Use the existing media-storage/
  streaming infra (Supabase storage + signed URL, or a CDN/host) so it streams smoothly; lazy-load
  below-the-fold; `poster` attribute for instant paint. A `/demo` page can hold the full chaptered version.
- **A/B-safe:** keep the current animated takeoff widget as the poster/fallback so the page never
  looks empty while the video loads.

### Acceptance
Records cleanly start→finish with the hand-off; no fake financials in a prod tenant; plays on the
homepage at 1440 + 390, light + dark, muted-autoplay with reduced-motion fallback; poster paints
instantly; file streamed, not committed.
