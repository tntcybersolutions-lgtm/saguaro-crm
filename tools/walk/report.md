# App walk — iPhone (WebKit), demo account

96 screens · 536 controls tapped · 1 dead · 2 covered · 2 erroring · 22 API errors

## /app/billing  (HTTP 200)
- API: POST /api/billing/checkout → 503
- ERRORS after "Select Plan": POST /api/billing/checkout → 503
- ERRORS after "Select Plan": POST /api/billing/checkout → 503

## /app/radio  (HTTP 200)
- DEAD: "Hold — Panic" <button>  `<button class="k-btn k-btn-danger rdPanic" type="button" title="Hold to send a panic alarm to every channel member" data-walk="5"><svg xmlns="http://www.w3.org/`
- COVERED: "Broadcast" — <div>Channels</div> from <div role="dialog" aria-modal="true" aria-label="BROADCAST — 0/8 CHANNELS">…</div> subtree intercepts pointer events

## /app/settings  (HTTP 200)
- LOAD: TypeError: Load failed
- API: GET /api/projects/list → 500
- API: GET /api/projects → 500
- API: GET /api/branding/tenant → 500

## /app/projects/:id/overview  (HTTP 200)
- API: GET /api/branding/tenant → 500
- API: GET /api/projects/list → 500
- API: GET /api/projects/:id → 404
- API: GET /api/projects → 500
- API: GET /api/project-context → 404
- COVERED: "Preconstruction" — <div></div> intercepts pointer events

## /app/projects/:id/photos  (HTTP 200)
- API: GET /api/projects → 500
- API: GET /api/projects/:id/sub-media → 404
- API: GET /api/projects/:id → 404
- API: GET /api/branding/tenant → 500
- API: GET /api/projects/list → 500
- API: GET /api/photos/list → 500
- API: GET /api/project-context → 404

## /app/projects/:id/files  (HTTP 200)
- API: GET /api/projects → 500
- API: GET /api/projects/list → 500
- API: GET /api/projects/:id/folders → 404
- API: GET /api/projects/:id/files → 500
- API: GET /api/projects/:id → 404
- API: GET /api/branding/tenant → 500

## Not tapped (would write data or leave)

- /app: Create · 1 pay app waiting for your decision · Desert Vista Medical Plaza · Mark done: Drywall corner bead damaged · 4 days late confirm roof warranty registration Project task
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
- /app/projects/:id/safety: Generate JHA
- /app/projects/:id/team: Invite Member
- /app/projects/:id/invoices: TOTAL BILLED → $3,730,000 Project billed to date (pay apps)
- /app/projects/:id/contracts: Purchase Order
- /app/projects/:id/purchase-orders: New Purchase Order
- /app/projects/:id/proposal: Start v1.0 at $28,400
- /app/projects/:id/bid-packages: Create Bid Package
- /app/projects/:id/closeout: Generate G704 · Generate G706
- /app/projects/:id/compliance: Request All COIs
- /app/projects/:id/payroll: Generate WH-347 · Remove · Generate WH-347 PDF
- /app/projects/:id/w9: Send W-9 Request · Request W-9
- /app/projects/:id/intelligence: What OSHA requirements apply to my site?
- /app/projects/:id/autopilot: Run Autopilot Scan
