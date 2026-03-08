# Phase 1 Cheatsheet - Quick Reference

## Offline Sync API

```typescript
import {
  initOfflineSync,      // void - Initialize on app load
  queueOperation,       // Queue a CRUD operation
  syncQueue,            // Manually trigger sync
  getSyncStatus,        // Get { isOnline, queued, syncing, lastSyncTime }
  startAutoSync,        // Start auto-sync polling
} from '@/lib/offlineSync';

// Initialize
await initOfflineSync();

// Queue operation
await queueOperation({
  entity: 'invoice',        // 'rfi', 'invoice', 'task', 'issue', 'time_entry'
  action: 'create',         // 'create' | 'update' | 'delete'
  data: { /* fields */ },
  timestamp: Date.now(),
});

// Manual sync
await syncQueue(authToken);

// Check status
const status = await getSyncStatus();
console.log(`${status.queued} operations pending`);
```

---

## QuickBooks Integration

```typescript
import { getAuthUrl, QBClient, syncInvoicesToSaguaro } from '@/lib/quickbooksClient';

// Start OAuth
const authUrl = getAuthUrl(randomState);
window.open(authUrl);  // Opens popup

// After user authorizes, create client
const qb = new QBClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID,
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
  accessToken,   // From callback
  realmId,       // QB company ID
});

// Fetch QB data
const invoices = await qb.getInvoices();
const expenses = await qb.getExpenses();
const coa = await qb.getChartOfAccounts();

// Create bill
await qb.createBillFromInvoice({ invoiceId, amount, vendorId });

// Sync QB → Saguaro
await qb.syncInvoicesToSaguaro(supabaseClient);
```

---

## Custom Reports

```typescript
import {
  generateReport,
  exportToCSV,
  exportToPDF,
  createTemplate,
} from '@/lib/reportBuilder';

// Generate report
const data = await generateReport(
  'invoices',              // Entity: invoices, rfis, tasks, projects
  ['id', 'total', 'status'],  // Fields to include
  [
    { field: 'total', operator: 'gt', value: 1000 },  // Filters
    { field: 'status', operator: 'eq', value: 'pending' },
  ],
  'total:desc',            // Sort by
  'status'                 // Group by (optional)
);

// Export
const csv = await exportToCSV(data, fields, 'Report Name');
const html = await exportToPDF(data, fields, 'Report Name');

// Save template
await createTemplate({
  owner_id: userId,
  name: 'Overdue Invoices',
  source_entity: 'invoices',
  fields: [...],
  filters: [...],
  is_public: false,
});

// Operators: eq, gt, lt, gte, lte, ilike, between
```

---

## Alerts & Business Logic

```typescript
import {
  sendSlackAlert,
  sendTeamsAlert,
  checkAndAlert,
} from '@/lib/alertService';

// Send to Slack
await sendSlackAlert({
  webhookUrl: 'https://hooks.slack.com/services/...',
  channel: 'alerts',
  title: '⚠️ Overdue RFI',
  description: 'RFI-001 due 5 days ago',
  color: '#ef4444',     // Red = critical
  severity: 'critical', // info, warning, critical
  projectId: 'proj-id',
  entityId: 'entity-id',
});

// Send to Teams
await sendTeamsAlert({
  webhookUrl: 'https://outlook.webhook.office.com/...',
  title: '⚠️ Unpaid Invoice',
  description: 'Payment due',
  severity: 'warning',
  projectId: 'proj-id',
  entityId: 'entity-id',
});

// Auto-check specific alerts
await checkAndAlert(projectId, 'overdue_rfis', supabaseClient);
// Checks: open RFIs with due_date < now()
// Also supports: unpaid_invoices, delayed_tasks
```

---

## Predictive Budget Forecasting

```typescript
import { forecastBudget, rankProjectsByRisk } from '@/lib/predictiveAnalytics';

// Single project forecast
const forecast = forecastBudget(costEntries, contractValue);
console.log(forecast);
// {
//   finalCost: 115000,
//   variance: 15000,
//   variancePercent: 15,
//   riskScore: 62.5,         // 0-100
//   riskLevel: 'high',       // critical, high, medium, low
//   confidenceInterval: [114500, 115500]
// }

// Rank all projects
const ranked = rankProjectsByRisk(allProjects, allCostEntries);
// Returns sorted by riskScore descending
```

---

## React Components Usage

### OfflineSyncStatus
```tsx
import OfflineSyncStatus from '@/components/OfflineSyncStatus';

export default function DashboardHeader() {
  return (
    <div>
      <OfflineSyncStatus />
      {/* Shows: "Online" or "Offline - 3 pending" */}
      {/* Updates every 2 seconds */}
    </div>
  );
}
```

### ReportBuilder
```tsx
import ReportBuilder from '@/components/ReportBuilder';

export default function ReportsPage() {
  return <ReportBuilder />;
  // Full interactive report builder
  // Includes: entity select, field picker, filters, sort, export
}
```

### ProjectPhotoManager
```tsx
import ProjectPhotoManager from '@/components/ProjectPhotoManager';

<ProjectPhotoManager
  projectId="proj-123"
  linkedEntity="rfi"
  linkedEntityId="rfi-456"
  onPhotosLoaded={(photos) => setSitePhotos(photos)}
/>
```

### AlertConfigManager
```tsx
import AlertConfigManager from '@/components/AlertConfigManager';

<AlertConfigManager projectId="proj-123" token={authToken} />
// Manage Slack/Teams webhooks
```

### QuickBooksIntegration
```tsx
import QuickBooksIntegration from '@/components/QuickBooksIntegration';

<QuickBooksIntegration
  projectId="proj-123"
  onSyncComplete={() => toast('QB sync complete')}
/>
```

### useQuickBooks Hook
```tsx
import { useQuickBooks } from '@/hooks/useQuickBooks';

export default function ProjectFinance() {
  const {
    isAuthenticating,
    isAuthenticated,
    isSyncing,
    error,
    startAuthentication,
    syncData,
    logout,
  } = useQuickBooks();

  return (
    <button onClick={startAuthentication}>
      {isAuthenticating ? '...' : 'Connect QB'}
    </button>
  );
}
```

---

## API Routes Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sync` | Queue offline operation |
| GET | `/api/reports/templates` | Get report templates |
| POST | `/api/reports/templates` | Create template |
| POST | `/api/alerts/config` | Add webhook |
| GET | `/api/alerts/config` | Get webhooks |
| POST | `/api/alerts/log` | Log alert |
| GET | `/api/alerts/log` | Query alerts |
| POST | `/api/integrations/quickbooks/callback` | OAuth callback |
| POST | `/api/integrations/quickbooks/sync` | Sync QB data |

---

## Common Patterns

### Initialize App
```typescript
// In app.tsx or root layout
useEffect(() => {
  initOfflineSync();
  startAutoSync();
}, []);
```

### Queue + Show Status
```typescript
const handleSaveOffline = async (data) => {
  await queueOperation({
    entity: 'invoice',
    action: 'create',
    data,
    timestamp: Date.now(),
  });
  // Component renders OfflineSyncStatus automatically
};
```

### Generate + Download
```typescript
const handleExportReport = async () => {
  const data = await generateReport(...);
  const csv = await exportToCSV(data, fields, 'report.csv');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report.csv';
  a.click();
};
```

### Send Alert
```typescript
const { data: configs } = await supabase
  .from('alert_configs')
  .select('*')
  .eq('project_id', projectId)
  .eq('is_active', true);

for (const config of configs) {
  if (config.type === 'slack') {
    await sendSlackAlert({
      webhookUrl: config.webhook_url,
      title: 'Alert Title',
      severity: 'critical',
    });
  }
}
```

### Dashboard Summary
```tsx
export default function ProjectDashboard() {
  const { data: costs } = await supabase
    .from('cost_entries')
    .select('*')
    .eq('project_id', projectId);

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  const forecast = forecastBudget(costs, project.value);

  return (
    <div>
      <h2>Budget Forecast</h2>
      <p>Projected: ${forecast.finalCost.toLocaleString()}</p>
      <p>Risk: {forecast.riskLevel}</p>
      <OfflineSyncStatus />
    </div>
  );
}
```

---

## Error Handling Template

```typescript
const handleAction = async () => {
  setLoading(true);
  setError(null);

  try {
    const result = await someServiceCall();
    // Success
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    setError(message);
    toast.error(message);
  } finally {
    setLoading(false);
  }
};
```

---

## Testing Checklist

- [ ] Create invoice offline, verify queued in IndexedDB
- [ ] Go online, verify invoice syncs to DB
- [ ] Create QB app in developer.intuit.com
- [ ] Test OAuth flow (connect → authorize → sync)
- [ ] Generate report with filters
- [ ] Export to CSV
- [ ] Export to PDF
- [ ] Add Slack webhook
- [ ] Verify test alert posted
- [ ] Calculate budget forecast on sample project
- [ ] Verify risk level correct

---

## Environment Variables Needed

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# QuickBooks
QUICKBOOKS_CLIENT_ID=ABC...
QUICKBOOKS_CLIENT_SECRET=xyz...
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback
# Production: https://yourdomain.com/api/integrations/quickbooks/callback

# Optional
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=project-photos
```

---

## Troubleshooting One-Liners

```typescript
// Check if online
console.log(navigator.onLine);

// View IndexedDB
// DevTools → Application → IndexedDB → saguaro → syncQueue

// Test API endpoint
fetch('/api/sync', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ entity: 'invoice', action: 'create', data: {} }),
})

// Check Supabase RLS
supabase.from('invoices').select('*') // Should fail if no RLS

// Verify QB token
console.log(sessionStorage.getItem('qb_access_token'))

// Manual sync
const { syncQueue } = await import('@/lib/offlineSync');
await syncQueue(token);
```

---

## File Locations Quick Ref

| Type | Path |
|------|------|
| Services | `lib/{name}.ts` |
| API Routes | `src/app/api/{feature}/route.ts` |
| Components | `src/components/{Name}.tsx` |
| Hooks | `src/hooks/use{Name}.ts` |
| Database | `supabase/migrations/{###}_*.sql` |
| Docs | `PHASE_1_*.md` |

---

## Success Criteria

✅ All services callable with real data (no mocks)
✅ All components render without errors
✅ Offline queue persists after page refresh
✅ QB OAuth flow completes (code → token)
✅ Report builder generates data correctly
✅ Alerts post to Slack/Teams webhooks
✅ Budget forecast calculates risk score
✅ Photos upload to Supabase Storage
✅ All API endpoints return expected responses
✅ TypeScript strict mode passes

