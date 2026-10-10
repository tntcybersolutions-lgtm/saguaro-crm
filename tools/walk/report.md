# App walk — iPhone (WebKit), demo account

97 screens · 580 controls tapped · 0 dead · 4 covered · 2 erroring · 1 API errors

## /app/reports  (HTTP 200)
- COVERED: "Job Cost" — locator.click: Timeout 2500ms exceeded.
- COVERED: "Punch List" — locator.click: Timeout 2500ms exceeded.
- COVERED: "Bid Analysis" — locator.click: Timeout 2500ms exceeded.

## /app/billing  (HTTP 200)
- API: POST /api/billing/checkout → 503
- ERRORS after "Select Plan": POST /api/billing/checkout → 503
- ERRORS after "Select Plan": POST /api/billing/checkout → 503

## /app/prequalification  (HTTP 200)
- COVERED: "Dashboard" — <textarea placeholder="Brief description of this form…"></textarea> from <div>…</div> subtree intercepts pointer events

## Not tapped (would write data or leave)

- /app: Create · 1 pay app waiting 14+ days for a decision · Desert Vista Medical Plaza · Mark done: Drywall corner bead damaged · 4 days late confirm roof warranty registration Project task
- /app/documents: PAY APPLICATIONS → — AIA G702 / G703 · Pay Applications
- /app/takeoff: Upload Blueprint
- /app/reports: Pay App Status · Pay App Status Pay applications with amounts and status Answers: How m
- /app/billing/payapp: Save Pay Application · Generate AIA G702 / G703 (PDF)
- /app/command-center/kpis: 1 pay app waiting 14+ days for a decision · Desert Vista Medical Plaza · Mark done: Drywall corner bead damaged · 4 days late confirm roof warranty registration Project task
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
- /app/projects/:id/contracts: Purchase Order · READY TO PAPER → 0 Every award is contracted
- /app/projects/:id/bid-packages: Create Bid Package
- /app/projects/:id/closeout: Generate G704 · Generate G706
- /app/projects/:id/compliance: Request All COIs
- /app/projects/:id/payroll: Generate WH-347 · Remove · Generate WH-347 PDF
- /app/projects/:id/w9: Send W-9 Request
- /app/projects/:id/intelligence: Walk me through the 5 pending change orders - approve or push back? · What OSHA requirements apply to my site?
- /app/projects/:id/autopilot: Run Autopilot Scan
