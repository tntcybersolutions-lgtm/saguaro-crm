# Saguaro CRM — Actual Code Bundle Map
## Copy/Paste batches by folder for Replit

This is the code bundle map for organizing the CRM into paste-ready batches.
Use it to paste files into Replit in a clean order without breaking imports.

---

# Batch 01 — Root foundation

Paste these first.

## /app
- app/layout.tsx
- app/globals.css

## /lib
- lib/supabaseClient.ts
- lib/supabaseAdmin.ts
- lib/useTenantRole.ts
- lib/serverAuth.ts
- lib/audit.ts

## root
- middleware.ts

Why this batch first:
- layout
- styles
- Supabase clients
- role resolution
- audit helper
- auth middleware

Run after paste:

```bash
npm run dev
```

---

# Batch 02 — Shared components

## /components
- components/AppShell.tsx
- components/PageHeader.tsx
- components/EmptyState.tsx
- components/ProjectSidebar.tsx
- components/AutopilotPanel.tsx
- components/MobileFieldShell.tsx

Why this batch second:
All feature pages depend on these layout and navigation components.

Run after paste:

```bash
npm run dev
```

---

# Batch 03 — Public setup + auth routes

## /app
- app/setup/page.tsx
- app/api/provision-tenant/route.ts

## /app/[tenantSlug]
- app/[tenantSlug]/page.tsx
- app/[tenantSlug]/login/page.tsx
- app/[tenantSlug]/logout/page.tsx
- app/[tenantSlug]/request-access/page.tsx
- app/[tenantSlug]/request-invite/[token]/page.tsx

Purpose:
- first tenant creation
- login
- logout
- access request flow
- invite acceptance flow

Run after paste:

```bash
npm run dev
```

Then test:
- /setup
- /<tenantSlug>/login

---

# Batch 04 — Main app shell pages

## /app/[tenantSlug]/app
- app/[tenantSlug]/app/page.tsx
- app/[tenantSlug]/app/projects/page.tsx
- app/[tenantSlug]/app/reports/page.tsx
- app/[tenantSlug]/app/admin/page.tsx
- app/[tenantSlug]/app/admin/invites/page.tsx
- app/[tenantSlug]/app/admin/audit/page.tsx
- app/[tenantSlug]/app/onboarding/page.tsx

Purpose:
- tenant dashboard
- project admin page
- reports
- admin
- invites
- audit logs
- onboarding wizard

Run after paste:

```bash
npm run dev
```

Then test:
- /<tenantSlug>/app
- /<tenantSlug>/app/projects
- /<tenantSlug>/app/admin

---

# Batch 05 — Project home + autopilot

## /app/[tenantSlug]/app/projects/[projectId]
- app/[tenantSlug]/app/projects/[projectId]/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/autopilot/page.tsx

Purpose:
- live project home
- summary cards
- live counts
- autopilot dashboard

Run after paste:

```bash
npm run dev
```

Then test:
- /<tenantSlug>/app/projects/<projectId>
- /<tenantSlug>/app/projects/<projectId>/autopilot

---

# Batch 06 — Document modules

## Drawings
- app/[tenantSlug]/app/projects/[projectId]/drawings/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/drawings/[drawingId]/page.tsx

## Photos
- app/[tenantSlug]/app/projects/[projectId]/photos/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/photos/[photoId]/page.tsx

## Files
- app/[tenantSlug]/app/projects/[projectId]/files/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/files/[fileId]/page.tsx

Purpose:
- uploads
- storage-backed assets
- sharing toggles
- detail pages

Run after paste:

```bash
npm run dev
```

Then test:
- uploads
- signed URL open
- sharing toggles

---

# Batch 07 — Communication + finance modules

## RFIs
- app/[tenantSlug]/app/projects/[projectId]/rfis/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/rfis/[rfiId]/page.tsx

## Invoices
- app/[tenantSlug]/app/projects/[projectId]/invoices/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/invoices/[invoiceId]/page.tsx

## Change Orders
- app/[tenantSlug]/app/projects/[projectId]/change-orders/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/change-orders/[changeOrderId]/page.tsx

Purpose:
- RFI workflow
- invoice visibility and aging
- change order pipeline

Run after paste:

```bash
npm run dev
```

---

# Batch 08 — Bid management modules

## Bid Packages
- app/[tenantSlug]/app/projects/[projectId]/bid-packages/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/bid-packages/[bidPackageId]/page.tsx

Purpose:
- bid package list
- detail view
- share to subs
- subcontractor submission flow
- award flow

Run after paste:

```bash
npm run dev
```

---

# Batch 09 — Schedule + permitting modules

## Schedule
- app/[tenantSlug]/app/projects/[projectId]/schedule/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/schedule/[taskId]/page.tsx

## Permits
- app/[tenantSlug]/app/projects/[projectId]/permits/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/permits/[permitId]/page.tsx

## Inspections
- app/[tenantSlug]/app/projects/[projectId]/inspections/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/inspections/[inspectionId]/page.tsx

Purpose:
- task tracking
- dependencies
- permit tracking
- inspection tracking

Run after paste:

```bash
npm run dev
```

---

# Batch 10 — Field reporting modules

## Daily Logs
- app/[tenantSlug]/app/projects/[projectId]/daily-logs/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/daily-logs/[logId]/page.tsx

## Field Issues
- app/[tenantSlug]/app/projects/[projectId]/field-issues/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/field-issues/[issueId]/page.tsx

Purpose:
- daily field reporting
- issues / punch / blockers
- mobile-friendly data structure

Run after paste:

```bash
npm run dev
```

---

# Batch 11 — Mobile shell

## /app/[tenantSlug]/mobile/[projectId]
- app/[tenantSlug]/mobile/[projectId]/page.tsx

## /components
- components/MobileFieldShell.tsx

Purpose:
This gets mobile navigation online first before adding all mobile child pages.

Run after paste:

```bash
npm run dev
```

Test:
- /<tenantSlug>/mobile/<projectId>

---

# Batch 12 — Mobile field pages

## Mobile Photos
- app/[tenantSlug]/mobile/[projectId]/photos/page.tsx

## Mobile Daily Logs
- app/[tenantSlug]/mobile/[projectId]/daily-logs/page.tsx

## Mobile Field Issues
- app/[tenantSlug]/mobile/[projectId]/field-issues/page.tsx

## Mobile Schedule
- app/[tenantSlug]/mobile/[projectId]/schedule/page.tsx

## Mobile Inspections
- app/[tenantSlug]/mobile/[projectId]/inspections/page.tsx

Purpose:
This batch completes the mobile field experience.

Run after paste:

```bash
npm run dev
```

---

# Batch 13 — SQL-only rollout bundle map

Use these in Supabase SQL editor.

## SQL Bundle A — Core
- tenants
- tenant_settings
- tenant_memberships
- projects
- activity_events
- helper functions
- base RLS

## SQL Bundle B — Core modules
- drawings
- photos
- rfis
- files
- invoices
- change_orders
- bid_packages
- bid_submissions
- storage bucket policies

## SQL Bundle C — Production upgrade
- autopilot_alerts
- project_health_scores
- subcontractor_companies
- subcontractor_invites
- bid_submission_items
- bid_leveling_sessions
- bid_leveling_rows
- schedule_tasks
- schedule_dependencies
- permits
- inspections
- daily_logs
- field_issues

## SQL Bundle D — Production gap closer
- audit_logs
- tenant_invites
- tenant_onboarding
- project archive fields

## SQL Bundle E — Optional
- access_requests

---

# Batch 14 — Replit verification order

After all batches are pasted, verify in this order:

## Auth + tenant
- /setup
- create tenant
- login works
- invite acceptance works

## Admin
- admin page
- onboarding page
- invites page
- audit page

## Project
- create project
- open project
- project summary counts

## File modules
- upload drawings
- upload files
- upload photos

## Workflow modules
- create RFI
- create invoice
- create change order
- create bid package
- submit sub bid
- award bid

## Production modules
- create schedule tasks
- add dependency
- create permit
- create inspection
- create daily log
- create field issue

## Mobile
- mobile project home
- mobile photos
- mobile logs
- mobile issues
- mobile schedule
- mobile inspections

---

# Batch 15 — Missing files not yet implemented in full UI

These are the biggest remaining pages not fully bundled yet:

## Still to build
- app/[tenantSlug]/app/projects/[projectId]/autopilot-alerts/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/bid-leveling/page.tsx
- app/[tenantSlug]/app/projects/[projectId]/bid-leveling/[sessionId]/page.tsx

## Still recommended later
- company/contact directory
- addenda module
- drawing revision compare
- true Gantt visualization
- CSV/PDF exports
- AI alert job runner

---

# Folder-by-folder cheat sheet

## /app
Framework routes only.

## /components
Anything reused across more than one page.

## /lib
Supabase, auth, role, audit helpers only.

## /app/[tenantSlug]/app
Desktop/internal portal.

## /app/[tenantSlug]/mobile
Field portal.

---

# Best copy/paste strategy inside Replit

Do not paste randomly.
Use this pattern:

1. create missing folders first
2. paste one batch only
3. save all files
4. run npm run dev
5. fix compile issues immediately
6. move to next batch

This keeps the build stable.

---

# Strongest next unfinished code batch

Once this bundle map is followed, the next code bundle to generate is:

Autopilot Alerts + Bid Leveling UI batch

That is the highest-value unfinished production feature set.
