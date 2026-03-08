# Saguaro CRM — Replit Master Package

## What this package is
This is the organized handoff for the **Saguaro white-label construction CRM** built for:
- multi-tenant use
- internal / client / subcontractor roles
- Procore-style project operations
- white-label resale
- mobile field use
- production upgrade path

It is structured for **Replit + Next.js App Router + Supabase**.

---

## Stack
- Next.js (App Router, TypeScript)
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Replit hosting

---

## Required environment variables
Set these in Replit Secrets:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Install commands
Run in Replit shell:

```bash
npx create-next-app@latest saguaro-crm --ts --app --eslint
cd saguaro-crm
npm install @supabase/supabase-js
npm run dev
```

Setup answers:
- TypeScript: yes
- App Router: yes
- ESLint: yes
- Tailwind: no
- src dir: no
- alias: yes (`@/*`)

---

## Paste/build order

### 1) Foundation
Paste these first:
- `/app/layout.tsx`
- `/app/globals.css`
- `/lib/supabaseClient.ts`
- `/lib/supabaseAdmin.ts`
- `/lib/useTenantRole.ts`
- `/lib/serverAuth.ts`
- `/lib/audit.ts`
- `/middleware.ts`

### 2) Shared UI
- `/components/AppShell.tsx`
- `/components/PageHeader.tsx`
- `/components/EmptyState.tsx`
- `/components/ProjectSidebar.tsx`
- `/components/AutopilotPanel.tsx`
- `/components/MobileFieldShell.tsx`

### 3) Public/auth/setup routes
- `/app/setup/page.tsx`
- `/app/api/provision-tenant/route.ts`
- `/app/[tenantSlug]/page.tsx`
- `/app/[tenantSlug]/login/page.tsx`
- `/app/[tenantSlug]/logout/page.tsx`
- `/app/[tenantSlug]/request-access/page.tsx`
- `/app/[tenantSlug]/request-invite/[token]/page.tsx`

### 4) Main app routes
- `/app/[tenantSlug]/app/page.tsx`
- `/app/[tenantSlug]/app/projects/page.tsx`
- `/app/[tenantSlug]/app/admin/page.tsx`
- `/app/[tenantSlug]/app/admin/invites/page.tsx`
- `/app/[tenantSlug]/app/admin/audit/page.tsx`
- `/app/[tenantSlug]/app/reports/page.tsx`
- `/app/[tenantSlug]/app/onboarding/page.tsx`

### 5) Project hub + modules
- `/app/[tenantSlug]/app/projects/[projectId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/autopilot/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/drawings/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/drawings/[drawingId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/photos/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/photos/[photoId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/rfis/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/rfis/[rfiId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/files/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/files/[fileId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/invoices/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/invoices/[invoiceId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/change-orders/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/change-orders/[changeOrderId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/bid-packages/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/bid-packages/[bidPackageId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/schedule/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/schedule/[taskId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/permits/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/permits/[permitId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/inspections/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/inspections/[inspectionId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/daily-logs/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/daily-logs/[logId]/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/field-issues/page.tsx`
- `/app/[tenantSlug]/app/projects/[projectId]/field-issues/[issueId]/page.tsx`

### 6) Mobile field routes
- `/app/[tenantSlug]/mobile/[projectId]/page.tsx`
- `/app/[tenantSlug]/mobile/[projectId]/photos/page.tsx`
- `/app/[tenantSlug]/mobile/[projectId]/daily-logs/page.tsx`
- `/app/[tenantSlug]/mobile/[projectId]/field-issues/page.tsx`
- `/app/[tenantSlug]/mobile/[projectId]/schedule/page.tsx`
- `/app/[tenantSlug]/mobile/[projectId]/inspections/page.tsx`

Run `npm run dev` after each batch.

---

## Repo file tree

```text
app/
  layout.tsx
  globals.css
  setup/page.tsx
  api/provision-tenant/route.ts

  [tenantSlug]/
    page.tsx
    login/page.tsx
    logout/page.tsx
    request-access/page.tsx
    request-invite/[token]/page.tsx

    app/
      page.tsx
      projects/page.tsx
      admin/page.tsx
      admin/invites/page.tsx
      admin/audit/page.tsx
      reports/page.tsx
      onboarding/page.tsx

      projects/[projectId]/
        page.tsx
        autopilot/page.tsx

        drawings/page.tsx
        drawings/[drawingId]/page.tsx

        photos/page.tsx
        photos/[photoId]/page.tsx

        rfis/page.tsx
        rfis/[rfiId]/page.tsx

        files/page.tsx
        files/[fileId]/page.tsx

        invoices/page.tsx
        invoices/[invoiceId]/page.tsx

        change-orders/page.tsx
        change-orders/[changeOrderId]/page.tsx

        bid-packages/page.tsx
        bid-packages/[bidPackageId]/page.tsx

        schedule/page.tsx
        schedule/[taskId]/page.tsx

        permits/page.tsx
        permits/[permitId]/page.tsx

        inspections/page.tsx
        inspections/[inspectionId]/page.tsx

        daily-logs/page.tsx
        daily-logs/[logId]/page.tsx

        field-issues/page.tsx
        field-issues/[issueId]/page.tsx

    mobile/
      [projectId]/
        page.tsx
        photos/page.tsx
        daily-logs/page.tsx
        field-issues/page.tsx
        schedule/page.tsx
        inspections/page.tsx

components/
  AppShell.tsx
  PageHeader.tsx
  EmptyState.tsx
  ProjectSidebar.tsx
  AutopilotPanel.tsx
  MobileFieldShell.tsx

lib/
  supabaseClient.ts
  supabaseAdmin.ts
  useTenantRole.ts
  serverAuth.ts
  audit.ts

middleware.ts
```

---

## Database SQL rollout order

### SQL Batch 1 — Core
Create or confirm:
- `tenants`
- `tenant_settings`
- `tenant_memberships`
- `projects`
- `activity_events`

Also helper functions:
- `is_member(uuid)`
- `is_internal(uuid)`
- `current_role(uuid)`
- `set_updated_at()`

### SQL Batch 2 — Core tool modules
Create:
- `drawings`
- `photos`
- `rfis`
- `files`
- `invoices`
- `change_orders`
- `bid_packages`
- `bid_submissions`
- storage buckets + storage RLS

### SQL Batch 3 — Production upgrade
Create:
- `autopilot_alerts`
- `project_health_scores`
- `subcontractor_companies`
- `subcontractor_invites`
- `bid_submission_items`
- `bid_leveling_sessions`
- `bid_leveling_rows`
- `schedule_tasks`
- `schedule_dependencies`
- `permits`
- `inspections`
- `daily_logs`
- `field_issues`

### SQL Batch 4 — Gap closer
Create:
- `audit_logs`
- `tenant_invites`
- `tenant_onboarding`
- add archive fields to `projects`

### SQL Batch 5 — Optional
Create:
- `access_requests`

---

## Storage buckets
Create these in Supabase Storage:
- `project-files`
- `project-photos`

Recommended object paths:
- `tenant/{tenant_id}/project/{project_id}/files/...`
- `tenant/{tenant_id}/project/{project_id}/photos/...`
- `tenant/{tenant_id}/project/{project_id}/drawings/...`

---

## Roles
Supported roles:
- `internal`
- `client`
- `subcontractor`

Role visibility:
- internal: everything
- client: project-facing items only
- subcontractor: packages, shared files, shared drawings, selected project items

---

## Core features already organized in the build
- tenant-based routing: `/{tenantSlug}`
- role-aware app shell
- white-label branding
- invite-based onboarding
- access requests
- membership management
- reports hub
- autopilot panel
- drawings
- photos
- RFIs
- files
- invoices
- change orders
- bid packages
- subcontractor bid submission
- schedule
- permits
- inspections
- daily logs
- field issues
- mobile field shell
- audit logging foundation
- project create/edit/archive
- tenant onboarding checklist

---

## Global navigation
Main app nav:
- Dashboard
- Projects
- Reports
- Onboarding
- Admin
- Invites
- Audit Logs

Project nav:
- Drawings
- Photos
- RFIs
- Files
- Invoices
- Change Orders
- Bid Packages
- Autopilot
- Schedule
- Permits
- Inspections
- Daily Logs
- Field Issues
- Bid Leveling
- Autopilot Alerts

Mobile nav:
- Home
- Photos
- Logs
- Issues
- Schedule
- Inspect

---

## Production-ready gaps still remaining
These are the main items still left before full client launch:

### Security / auth hardening
- full SSR session middleware validation everywhere
- password reset flow
- email verification
- rate limiting
- storage delete/replace/versioning controls

### Workflow hardening
- strict status transition rules
- unique numbering generators
- soft-delete/archive patterns beyond projects
- bid award lock rules

### Missing UI to finish
- Autopilot Alerts page
- Bid Leveling list/detail UI
- timeline / Gantt visualization
- mobile create/edit polish for all field modules
- company/contact directory
- addenda / revision history

### Reporting / export
- CSV export
- PDF reports
- executive portfolio dashboard
- project health score viewer

### AI layer
- actual alert generation jobs
- rule engine
- health score calculation jobs
- digest notifications

### DevOps
- staging environment
- error monitoring
- DB migration discipline
- backups
- uptime alerts
- performance review

---

## Recommended release sequence

### Beta launch
Must finish before first external tenant:
1. SSR auth hardening
2. invite flow tested
3. audit log viewer active
4. project management pages working
5. reports working
6. mobile shell working
7. storage policies verified
8. QA on all project modules

### Production launch
Then finish:
1. bid leveling UI
2. autopilot alerts UI + job logic
3. schedule visualization
4. exports
5. monitoring
6. onboarding polish
7. subscription/billing if resale is immediate

---

## First live boot checklist

1. Add Replit secrets
2. Run install commands
3. Paste foundation files
4. Run app
5. Run SQL batches in order
6. Create storage buckets
7. Open `/setup`
8. Create first tenant
9. Open `/{tenantSlug}/login`
10. Create or log in first internal user
11. Open `/{tenantSlug}/app`
12. Create first project
13. Test modules one by one:
   - files
   - photos
   - drawings
   - RFIs
   - invoices
   - change orders
   - bid packages
   - schedule
   - permits
   - inspections
   - daily logs
   - field issues
14. Test admin:
   - invites
   - onboarding
   - audit logs
15. Test mobile:
   - `/{tenantSlug}/mobile/{projectId}`

---

## Most important next build step
The strongest next implementation step is:

**Autopilot Alerts page + Bid Leveling list/detail UI**

That is the most valuable unfinished production feature gap.

