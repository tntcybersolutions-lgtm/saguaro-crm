# Phase 1 Integration Guide

## Overview

Phase 1 delivers offline sync, QuickBooks integration, custom reports, and predictive budget alerts. All services are production-ready with real data connections and zero placeholder code.

## Table of Contents
1. [Database Setup](#database-setup)
2. [Environment Variables](#environment-variables)
3. [Services & Libraries](#services--libraries)
4. [API Endpoints](#api-endpoints)
5. [React Components](#react-components)
6. [Integration Examples](#integration-examples)
7. [Troubleshooting](#troubleshooting)

---

## Database Setup

### Run Migrations

Execute [supabase/migrations/003_add_feature_tables.sql](supabase/migrations/003_add_feature_tables.sql) in Supabase SQL Editor:

```sql
-- Tables created:
-- - sync_log (offline sync audit trail)
-- - report_templates (saved report definitions)
-- - alert_configs (Slack/Teams webhooks)
-- - alert_logs (alert history)
-- - project_photos (before/after photos, GPS tagging)
-- - time_entries (geofencing prep for Phase 3)
-- - cost_entries (budget forecasting data)
```

All tables have RLS (Row Level Security) enabled to restrict access by user/project.

---

## Environment Variables

Add to `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...  # Server-only

# QuickBooks OAuth
QUICKBOOKS_CLIENT_ID=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef...
QUICKBOOKS_CLIENT_SECRET=[secret from QB app settings]
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback
# Production: QUICKBOOKS_REDIRECT_URI=https://yourdomain.com/api/integrations/quickbooks/callback

# Optional: Storage for photos
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=project-photos
```

### Getting QB Credentials

1. Go to [developer.intuit.com](https://developer.intuit.com)
2. Create app → Select "Accounting"
3. Settings → App credentials → Copy Client ID & Secret
4. Redirect URL → Add your `QUICKBOOKS_REDIRECT_URI`

---

## Services & Libraries

### 1. Offline Sync (`lib/offlineSync.ts`)

**Purpose**: Queue operations when offline, auto-sync when reconnected

**Key Methods**:
```typescript
import {
  initOfflineSync,      // Initialize IndexedDB on app load
  queueOperation,       // Queue a create/update/delete
  syncQueue,            // Manually trigger sync
  getSyncStatus,        // Get queued count + online status
  startAutoSync,        // Start 30s polling + event listeners
} from '@/lib/offlineSync';

// Initialize (call once on app load)
await initOfflineSync();

// Queue an operation
await queueOperation({
  entity: 'invoice',    // Maps to 'invoices' table
  action: 'create',     // 'create' | 'update' | 'delete'
  data: {
    invoice_number: 'INV-001',
    total: 1500.00,
    status: 'draft',
  },
  timestamp: Date.now(),
});

// Manual sync (or auto-syncs every 30s after reconnect)
const result = await syncQueue(authToken);
// result: { synced: 5, failed: 0, conflicts: 1 }
```

**Conflict Resolution**: Server timestamp > Local = Server wins, local op retried

**Storage**: Browser IndexedDB (limit ~50MB, survives page refresh)

---

### 2. QuickBooks Client (`lib/quickbooksClient.ts`)

**Purpose**: OAuth2 auth flow and real QB API integration

**Key Methods**:
```typescript
import { QBClient } from '@/lib/quickbooksClient';

const qb = new QBClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID,
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
  accessToken: '[token from session]',
  realmId: '[QB company ID]',
});

// Get real QB data
const invoices = await qb.getInvoices();      // Real API call
const expenses = await qb.getExpenses();      // Real API call
const coa = await qb.getChartOfAccounts();    // Real API call

// Create bill from Saguaro invoice
await qb.createBillFromInvoice({
  invoiceId: 'uuid',
  amount: 1500.00,
  vendorId: 'qb-vendor-123',
});

// Bidirectional sync
await qb.syncInvoicesToSaguaro(supabaseClient);
```

**Real APIs Used**:
- `oauth.platform.intuit.com/oauth2/tokens` - Token exchange
- `api.intuit.com/v2/company/{realmId}/query` - QB Queries
- `api.intuit.com/v2/company/{realmId}/batch` - QB Mutations

**Token Refresh**: Automatic (checks expiry before each request, refreshes if < 5 min remaining)

---

### 3. Report Builder (`lib/reportBuilder.ts`)

**Purpose**: Dynamic report generation with filtering, sorting, exports

**Key Methods**:
```typescript
import {
  generateReport,
  exportToCSV,
  exportToPDF,
  createTemplate,
  getTemplate,
} from '@/lib/reportBuilder';

// Generate report from any entity
const data = await generateReport(
  'invoices',           // source entity
  ['id', 'total', 'status', 'due_date'],  // fields
  [
    { field: 'status', operator: 'eq', value: 'pending' },
    { field: 'due_date', operator: 'lt', value: '2025-01-01' },
  ],                    // filters
  'total:desc',         // sort
  'status'              // group by
);

// Export to CSV
const csv = await exportToCSV(data, fields, 'Q4 Invoices');
// Returns CSV string, download manually

// Export to PDF
const html = await exportToPDF(data, fields, 'Q4 Invoices');
// Returns HTML string, display or download

// Save template for reuse
await createTemplate({
  owner_id: 'user-uuid',
  name: 'Overdue Invoices',
  source_entity: 'invoices',
  fields: [...],
  filters: [...],
  is_public: false,
});
```

**Supported Entities**: `invoices`, `rfis`, `tasks`, `projects`

**Supported Operators**: `eq`, `gt`, `lt`, `gte`, `lte`, `ilike`, `between`

---

### 4. Alert Service (`lib/alertService.ts`)

**Purpose**: Send alerts to Slack/Teams for business events

**Key Methods**:
```typescript
import {
  sendSlackAlert,
  sendTeamsAlert,
  checkAndAlert,
} from '@/lib/alertService';

// Send to Slack
await sendSlackAlert({
  webhookUrl: 'https://hooks.slack.com/services/...',
  channel: 'project-alerts',
  title: '⚠️ Overdue RFI',
  description: 'RFI-001 due 5 days ago',
  color: '#ef4444',
  severity: 'critical',
  projectId: 'proj-123',
  entityId: 'rfi-456',
});

// Send to Teams
await sendTeamsAlert({
  webhookUrl: 'https://outlook.webhook.office.com/...',
  title: '⚠️ Overdue Invoice',
  description: 'INV-001 payment due 3 days ago',
  severity: 'warning',
  projectId: 'proj-123',
  entityId: 'inv-789',
});

// Auto-check and alert for business events
await checkAndAlert(projectId, 'overdue_rfis', supabaseClient);
// Queries open RFIs, checks due_date < now(), sends alert if >0 days overdue
```

**Alert Types**:
- Overdue RFIs (7+ days → critical, 1-7 days → warning)
- Unpaid invoices (past due date)
- Delayed tasks (planned_finish < now() AND status = in_progress)
- Budget variance (project cost > contract value)

---

### 5. Predictive Analytics (`lib/predictiveAnalytics.ts`)

**Purpose**: Budget forecasting and risk scoring

**Key Methods**:
```typescript
import { forecastBudget, rankProjectsByRisk } from '@/lib/predictiveAnalytics';

// Forecast for single project
const forecast = forecastBudget(costEntries, contractValue);
// Returns: { finalCost, variance, variancePercent, riskScore, riskLevel, confidenceInterval }

// Example output:
// {
//   finalCost: 115000,           // Projected total cost
//   variance: 15000,             // Over budget
//   variancePercent: 15,         // 15% over contract
//   riskScore: 62.5,             // 0-100 scale
//   riskLevel: 'high',           // critical | high | medium | low
//   confidenceInterval: [114500, 115500]  // ±500
// }

// Rank all projects by risk
const ranked = rankProjectsByRisk(allProjects, costEntries);
// Returns: [{ projectId, riskScore, riskLevel, forecast }, ...]
```

**Algorithm**: Linear regression on historical costs
- Burnrate = slope of cost vs. time
- Final = burnrate × totalDays + intercept
- Risk = abs(variance%) × 1.5

---

## API Endpoints

### POST `/api/sync`

Receives offline operations, performs CRUD, handles conflicts

**Request**:
```json
{
  "id": "uuid",
  "entity": "rfi",           // Maps to table: rfis
  "action": "create",        // create | update | delete
  "data": { /* fields */ },
  "timestamp": 1704067200000
}
```

**Response**:
```json
{
  "success": true,
  "id": "entity-uuid",
  "synced": true
}
```

**Conflict Response (409)**:
```json
{
  "status": "conflict",
  "serverData": { /* latest from server */ },
  "serverTimestamp": 1704067300000
}
```

---

### POST/GET `/api/reports/templates`

Manage saved report definitions

**POST** - Create template:
```json
{
  "name": "Overdue Invoices",
  "source_entity": "invoices",
  "fields": ["id", "invoice_number", "total", "due_date"],
  "filters": [{ "field": "status", "operator": "eq", "value": "pending" }],
  "is_public": false
}
```

**GET** - Retrieve (filters: `owner_id=user OR is_public=true`)

**DELETE** - Delete template (403 if not owner)

---

### POST/GET `/api/alerts/config`

Configure webhook integrations

**POST** - Add webhook:
```json
{
  "projectId": "proj-uuid",
  "type": "slack",
  "webhookUrl": "https://hooks.slack.com/services/...",
  "channel": "project-alerts"
}
```

Validates webhook with test POST before storing.

**GET** - Retrieve configurations for project

---

### POST/GET `/api/alerts/log`

Log sent alerts (audit trail)

**POST** - Record alert:
```json
{
  "projectId": "proj-uuid",
  "entity": "invoice",
  "entity_id": "inv-123",
  "severity": "critical",
  "title": "Overdue Invoice",
  "description": "Payment due 5 days ago"
}
```

**GET** - Query alerts: `?projectId=...&limit=50&severity=critical`

---

### POST `/api/integrations/quickbooks/callback`

OAuth2 callback handler (invoked by QB after user authorizes)

**Request**:
```json
{
  "code": "auth-code-from-QB",
  "realmId": "QB-company-id",
  "state": "random-state-token"
}
```

**Response**:
```json
{
  "accessToken": "token",
  "refreshToken": "token",
  "expiresIn": 3600,
  "realmId": "QB-company-id"
}
```

---

### POST `/api/integrations/quickbooks/sync`

Sync QB data and check budget alerts

**Request**:
```json
{
  "projectId": "proj-uuid",
  "accessToken": "qb-token",
  "realmId": "QB-company-id"
}
```

**Response**:
```json
{
  "success": true,
  "synced": {
    "invoices": 15,
    "expenses": 8,
    "chartOfAccounts": 120
  }
}
```

---

## React Components

### OfflineSyncStatus

Displays online/offline status + queued operations count

```tsx
import OfflineSyncStatus from '@/components/OfflineSyncStatus';

<OfflineSyncStatus />
// Renders: "Online" or "Offline - 3 pending"
// Polling interval: 2 seconds
// Auto-syncs when reconnected
```

---

### ReportBuilder

Interactive UI for creating and exporting custom reports

```tsx
import ReportBuilder from '@/components/ReportBuilder';

<ReportBuilder />
// Features:
// - Entity selection (invoices, rfis, tasks, projects)
// - Field multi-select checkboxes
// - Dynamic filter builder (add/remove)
// - Sort by dropdown
// - CSV/PDF export buttons
// - Live results table (first 50 rows)
```

---

### ProjectPhotoManager

Upload, organize, and link photos to project entities

```tsx
import ProjectPhotoManager from '@/components/ProjectPhotoManager';

<ProjectPhotoManager
  projectId="proj-uuid"
  linkedEntity="rfi"           // Optional: link to RFI
  linkedEntityId="rfi-456"     // Optional: link to RFI-456
  onPhotosLoaded={(photos) => console.log(photos)}
/>
// Features:
// - Multi-file upload
// - Optional GPS tagging
// - Photo captions
// - Delete photos
// - Displays in grid layout
```

---

### AlertConfigManager

Set up Slack and Teams integrations

```tsx
import AlertConfigManager from '@/components/AlertConfigManager';

<AlertConfigManager projectId="proj-uuid" token={authToken} />
// Features:
// - Add Slack/Teams webhooks
// - Toggle active status
// - Delete configurations
// - Webhook validation
// - Info box for alert types
```

---

### QuickBooksIntegration

OAuth2 auth flow and QB data sync

```tsx
import QuickBooksIntegration from '@/components/QuickBooksIntegration';

<QuickBooksIntegration
  projectId="proj-uuid"
  onSyncComplete={() => console.log('QB sync done')}
/>
// Features:
// - "Connect QuickBooks" button (opens OAuth popup)
// - "Sync Now" button (pulls QB data)
// - "Disconnect" button (clears token)
// - Auto-handles OAuth callback
// - Stores token in sessionStorage
```

---

## Integration Examples

### Example 1: Queue Offline Invoice Creation

```typescript
// User is offline, fills out invoice form
const handleCreateInvoice = async (formData) => {
  await queueOperation({
    entity: 'invoice',
    action: 'create',
    data: formData,
    timestamp: Date.now(),
  });

  // UI shows: "Offline - 1 pending"
  // When online: auto-syncs to server
};
```

---

### Example 2: Generate Weekly Overdue Report

```typescript
// Dashboard page
const { data: overdue } = await generateReport(
  'invoices',
  ['invoice_number', 'total', 'due_date', 'days_overdue'],
  [
    { field: 'status', operator: 'eq', value: 'pending' },
    { field: 'due_date', operator: 'lt', value: new Date().toISOString() },
  ],
  'due_date:asc'
);

// Email to project manager
const csv = await exportToCSV(overdue, [...fields], 'Weekly Overdue');
sendEmail({ to: 'pm@company.com', attachment: csv });
```

---

### Example 3: Link QB Invoice to Saguaro

```typescript
// User syncs QB data
const response = await fetch('/api/integrations/quickbooks/sync', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ projectId, accessToken, realmId }),
});

const { synced } = await response.json();
console.log(`Synced ${synced.invoices} invoices from QB`);
```

---

### Example 4: Alert on Budget Overrun

```typescript
// Daily cron job
const { data: projects } = await supabase.from('projects').select('*');

for (const proj of projects) {
  const { data: costs } = await supabase
    .from('cost_entries')
    .select('*')
    .eq('project_id', proj.id);

  const forecast = forecastBudget(costs, proj.value);

  if (forecast.riskScore >= 75) {
    await sendSlackAlert({
      webhookUrl: '[webhook]',
      title: `🚨 CRITICAL: ${proj.name} Budget Alert`,
      description: `${forecast.variancePercent.toFixed(1)}% OVER BUDGET`,
      color: '#ef4444',
      severity: 'critical',
    });
  }
}
```

---

### Example 5: Photo Grid on RFI Detail Page

```tsx
// rfi/[id].tsx
import ProjectPhotoManager from '@/components/ProjectPhotoManager';

export default function RFIDetailPage({ params }) {
  return (
    <div>
      <h1>RFI {params.id}</h1>
      {/* ... RFI details ... */}
      <ProjectPhotoManager
        projectId={rfi.project_id}
        linkedEntity="rfi"
        linkedEntityId={params.id}
      />
    </div>
  );
}
```

---

## Troubleshooting

### Offline Sync Not Working

**Symptom**: Data not syncing after reconnect

**Solutions**:
1. Check browser console for IndexedDB errors
2. Ensure `initOfflineSync()` called on app load
3. Verify network connection: `navigator.onLine`
4. Check `/api/sync` endpoint responds with 200
5. Run `await getSyncStatus()` to inspect queued operations

---

### QB OAuth Loop / Won't Redirect

**Symptom**: OAuth popup doesn't close or redirect URL error

**Solutions**:
1. Verify `QUICKBOOKS_REDIRECT_URI` matches QB app settings exactly
2. Ensure environment variables loaded: `echo $QUICKBOOKS_CLIENT_ID`
3. Check browser console for CORS errors
4. QBOAuthCallback component must be on page (`QuickBooksIntegration` includes it)
5. For localhost: use `http://localhost:3000`, not `127.0.0.1`

---

### Webhook Validation Fails

**Symptom**: "Invalid webhook URL" error

**Solutions**:
1. Verify Slack/Teams webhook URL is correct (copy from settings again)
2. Webhook must be publicly accessible (not blocked by firewall)
3. Server makes test POST request - check Slack/Teams app received it
4. Check network tab in DevTools for 403/404 responses

---

### Report Takes Too Long

**Symptom**: "Generating report..." spinner stuck

**Solutions**:
1. Reduce date range or add more filters
2. Check Supabase tables have proper indexes (created_at, status, due_date)
3. Pagination: Report builder limits display to 50 rows  
4. Large exports (>10k rows): Use API directly with pagination

---

### Photos Not Uploading

**Symptom**: "Upload failed" or permission denied

**Solutions**:
1. Ensure `project-photos` bucket exists in Supabase Storage
2. Check RLS policies allow insert by authenticated users
3. File size limit: adjust SQL `max_file_size` setting
4. Browser storage permission: Allow camera/location access

---

## Next Steps (Phase 2)

- Slack/Teams Bot incoming events
- Photo OCR for notes extraction
- Enhanced predictive features (schedule variance)
- Reseller portal integration

---

## Support

For issues or questions:
1. Check logs in browser DevTools (F12)
2. View Supabase logs: Dashboard → Logs
3. Check environment variables loaded: inspect window.__ENV
4. Test API endpoints directly: `curl -H "Authorization: Bearer $TOKEN" https://localhost:3000/api/sync`

