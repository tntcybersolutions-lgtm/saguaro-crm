# DIRECTIVE 001 -- SCHEMA AUDIT AND DATA INTEGRITY REPAIR

**PRIORITY**: P0 -- SILENT DATA LOSS IN PRODUCTION
**SCOPE**: Every API route that writes to Supabase
**STANDING ORDERS**: CLAUDE.md applies in full

---

## PROBLEM STATEMENT

If application code writes to a column that does not exist in the database,
Supabase silently drops that field. The record saves without error, but the
data is lost. This is a production data loss bug that is invisible unless
you compare code columns to database columns line by line.

---

## PHASE 0 -- ESTABLISH GROUND TRUTH

Run every command. Show complete raw output. Do not skip any.

```bash
# Every API route that writes to the database
grep -rn "\.insert\|\.update\|\.upsert" app/api/ --include="*.ts" -l | sort

# Current error state
npx tsc --noEmit 2>&1
npm run build 2>&1 | tail -10

# Known mismatches from previous work
grep -rn "wifi_password\|security_type\|password.*network" app/api/network/ --include="*.ts" | head -10
```

Do not write a single line of code until this output is shown.

---

## PHASE 1 -- SYSTEMATIC TABLE-BY-TABLE AUDIT

For **every file** returned by the Phase 0 grep:

### Step A: Extract column names from code
Read the `.insert({...})` or `.update({...})` call. List every key being written.

### Step B: Get actual database columns
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '[TABLE]'
ORDER BY ordinal_position;
```

### Step C: Compare line by line
For each column in the code:
- **EXISTS in DB with correct type**: PASS
- **EXISTS in DB with wrong type**: fix the code or alter the column
- **DOES NOT EXIST in DB**: this is a data loss bug. Either:
  - The column name in code is wrong (typo, renamed) -- fix the code
  - The column genuinely needs to exist -- `ALTER TABLE ADD COLUMN IF NOT EXISTS`

### Step D: Verify fix
After each fix, run the verification loop (tsc + build).

### Step E: Document the finding
Output format per table:
```
TABLE: daily_logs
  [MATCH] id, tenant_id, project_id, created_by, created_at
  [MATCH] date, weather, temperature_high, temperature_low
  [MISMATCH] Code writes 'crew_count' but column is 'crew_size' -- FIXED: renamed in code
  [MISSING] Code writes 'wind_speed' but column does not exist -- FIXED: added column
  STATUS: CLEAN
```

### Tables to audit (minimum set -- audit every table you encounter):
```
daily_logs, drawings, rfis, change_orders, photos, punch_list,
timesheets, contracts, pay_applications, lien_waivers,
bid_packages, takeoffs, submittals, safety_incidents,
inspections, schedule_of_values, document_signatures,
notifications, profiles, projects,
network_connections, network_access_tokens, network_access_log
```

---

## PHASE 2 -- API ROUTE HARDENING

Open every file under `app/api/` and enforce these rules:

### Auth Guard
```typescript
const user = await getUser(req);
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```
Must appear before any `db.from(...)` call. No exceptions except documented public endpoints.

### Tenant Isolation
Every `db.from('table').select/insert/update/delete` must include:
```typescript
.eq('tenant_id', user.tenantId)
```
On inserts, `tenant_id: user.tenantId` must be in the payload.

### Error Handling
```typescript
try {
  // ... database operations
} catch (e: any) {
  return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
}
```
No empty catch blocks. No catch blocks that return 200.

### Find violating patterns:
```bash
# Empty catches
grep -rn "catch\s*{" app/api/ --include="*.ts" -A1 | grep -B1 "}" | head -20

# Catches that mask errors as success
grep -rn "catch" app/api/ --include="*.ts" -A3 | grep -B2 "NextResponse.json(\[\])" | head -20

# Missing tenant_id on inserts
grep -rn "\.insert(" app/api/ --include="*.ts" -A10 | grep -v "tenant_id" | head -20
```

Every result from these greps is a bug. Fix all of them.

### Input Validation
Required fields must be checked before any database write:
```typescript
if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
```
Name the missing field in the error message.

---

## PHASE 3 -- DARK THEME ENFORCEMENT

```bash
# White backgrounds in dark-themed pages
grep -rn "#ffffff\|#FFFFFF\|bg-white\|background:\s*white" app/app/ app/field/ --include="*.tsx" \
  | grep -v "node_modules\|.next\|portal\|sign\|w9\|canvas\|ctx\.\|color:\|fill:\|pdf\|print\|qr\|QR\|svg"

# Light-mode gray backgrounds
grep -rn "E2E5EA\|e2e5ea\|FAFBFC\|fafbfc\|F8F9FA\|f8f9fa\|EEF0F3\|eef0f3" app/app/ app/field/ --include="*.tsx" \
  | grep -v "node_modules\|.next"
```

Every result that is not a legitimate exception (QR canvas, portal, print layout)
must be replaced:
- Page backgrounds: `#0d1117` or `F.dark`
- Card backgrounds: `#161b22` or `F.raised`
- Border colors: `#30363d` or `#1E3A5F` or `F.border`

---

## PHASE 4 -- FINAL VERIFICATION

```bash
npx tsc --noEmit 2>&1
npm run build 2>&1 | tail -15

# Proof: no empty catches
grep -rn "catch\s*{" app/api/ --include="*.ts" -A1 | grep -c "}" 

# Proof: no white backgrounds
grep -rn "#ffffff" app/app/ app/field/ --include="*.tsx" | grep -v "node_modules\|color:\|fill:\|portal\|canvas\|qr\|print\|svg" | wc -l

# Proof: no masked errors
grep -rn "return NextResponse.json(\[\])" app/api/ --include="*.ts" | grep -v "error\|Error" | wc -l
```

---

## DEFINITION OF DONE

| # | Checkpoint | Proof Required |
|---|-----------|---------------|
| 1 | `npx tsc --noEmit` shows 0 errors | Raw terminal output |
| 2 | `npm run build` shows "Compiled successfully" | Raw terminal output |
| 3 | Every audited table shows MATCH or FIXED | Per-table audit log |
| 4 | Zero empty catch blocks | grep output showing count = 0 |
| 5 | Zero white backgrounds in dark pages | grep output showing count = 0 |
| 6 | Zero routes missing auth guard | grep output |
| 7 | All column fixes applied via ALTER TABLE | SQL execution output |
