# App walk — iPhone (WebKit), demo account

96 screens · 573 controls tapped · 2 dead · 4 covered · 3 erroring · 2 API errors

## /app/schedule  (HTTP 200)
- COVERED: "Sort by" — <input value="" id=":r2:" class="k-input" placeholder="Phase 1, Rough-in, etc."/> from <div class="k-overlay">…</div> subtree intercepts pointer events
- COVERED: "Ascending — switch to descending" — <input value="" id=":r2:" class="k-input" placeholder="Phase 1, Rough-in, etc."/> from <div class="k-overlay">…</div> subtree intercepts pointer events

## /app/billing  (HTTP 200)
- API: POST /api/billing/checkout → 503
- ERRORS after "Select Plan": POST /api/billing/checkout → 503
- ERRORS after "Select Plan": POST /api/billing/checkout → 503

## /app/document-versions  (HTTP 200)
- COVERED: "New Document" — <div class="k-input" aria-live="polite">…</div> from <div class="k-overlay">…</div> subtree intercepts pointer events

## /app/radio  (HTTP 200)
- DEAD: "Hold — Panic" <button>  `<button class="k-btn k-btn-danger rdPanic" type="button" title="Hold to send a panic alarm to every channel member" data-walk="5"><svg xmlns="http://www.w3.org/`

## /app/settings  (HTTP 200)
- LOAD: TypeError: Load failed

## /app/projects/:id/overview  (HTTP 200)
- COVERED: "Open project modules" — <div>…</div> from <aside>…</aside> subtree intercepts pointer events

## /app/projects/:id/drawings  (HTTP 200)
- DEAD: "Sheet" <button>  `<button type="button" role="tab" class="k-tab" aria-selected="true" data-walk="12">Sheet</button>`

## /app/projects/:id/closeout  (HTTP 200)
- API: POST /api/projects/:id/close → 409
- ERRORS after "Close Project": POST /api/projects/:id/close → 409

## Not tapped (would write data or leave)

- /app: Create · 1 pay app waiting for your decision · Desert Vista Medical Plaza · Mark done: Drywall corner bead damaged
- /app/documents: Pay Applications
- /app/takeoff: Upload Blueprint
- /app/reports: Pay App Status · Pay App Status Pay applications with amounts and status Answers: How m
- /app/billing/payapp: % COMPLETE → 0%
- /app/document-versions: Bulk Upload
- /app/portals: Invite Subcontractor · Invite Client
- /app/prequalification: Send Prequal Form
- /app/settings: Upload company logo · Save Branding · Subscription & Plan Manage your plan, upgrade, view invoices · Guided Onboarding Book a hands-on setup session with a Saguaro special · Contact Support Send us a message — we respond within 48 hours · Sign Out · Delete account
- /app/warranty-claims: Create Claim
- /app/projects/:id/files: Import from Cloud · Trash
- /app/projects/:id/pay-apps: New Pay Application
- /app/projects/:id/lien-waivers: + Generate Waiver · Generate All
- /app/projects/:id/drawings: Upload First Sheet
- /app/projects/:id/safety: Generate JHA
- /app/projects/:id/team: Invite Member
- /app/projects/:id/budget: Cost to Complete $412,000.00
- /app/projects/:id/cash-flow: Generate Projection · COLLECTED → $2,574,000 6 pay apps
- /app/projects/:id/contracts: Purchase Order · READY TO PAPER → 0 Every award is contracted
- /app/projects/:id/proposal: Start v1.0 at $28,400
- /app/projects/:id/bid-packages: Create Bid Package
- /app/projects/:id/closeout: Generate G704 · Generate G706 · 2 unfinalized pay applications
- /app/projects/:id/compliance: Request All COIs
- /app/projects/:id/payroll: Generate WH-347 · Remove · Generate WH-347 PDF
- /app/projects/:id/w9: Send W-9 Request
- /app/projects/:id/intelligence: What OSHA requirements apply to my site?
- /app/projects/:id/autopilot: Run Autopilot Scan
