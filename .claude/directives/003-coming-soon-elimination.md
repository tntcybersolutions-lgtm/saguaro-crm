# DIRECTIVE 003 -- COMING SOON ELIMINATION

**PRIORITY**: P1 -- PRE-LAUNCH
**SCOPE**: Every stub, placeholder, and disabled feature in the codebase
**STANDING ORDERS**: CLAUDE.md applies in full

---

## PROBLEM STATEMENT

"Coming Soon" labels are unacceptable in a production application.
Every feature listed in the UI must be implemented to the maximum extent
the current stack supports. If a feature genuinely cannot be built yet
(requires hardware, third-party integration not available, etc.),
replace the label with a functional description of what will go there --
not "Coming Soon."

---

## PHASE 0 -- COMPLETE INVENTORY

```bash
# Coming Soon labels
grep -rn "Coming Soon\|coming soon\|COMING_SOON\|comingSoon" app/ \
  --include="*.tsx" --include="*.ts" | grep -v "node_modules\|.next"

# Disabled options that are features, not form state
grep -rn "disabled.*option\|<option.*disabled\|isDisabled.*true\|disabled={true}" app/ \
  --include="*.tsx" | grep -v "node_modules\|.next\|loading\|submitting\|saving\|pending\|uploading" | head -30

# TODO/FIXME in visible UI (not in comments)
grep -rn "TODO\|FIXME\|not implemented\|stub\|placeholder.*feature" app/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules\|.next\|//.*TODO\|//.*FIXME\|input.*placeholder\|aria-placeholder" | head -40

# Pages with less than 50 lines (likely stubs)
find app/field/ app/app/ -name "page.tsx" | xargs wc -l 2>/dev/null | sort -n | head -20
```

Show all output. Every result is a build target.

---

## PHASE 1 -- BUILD EACH STUB INTO A REAL FEATURE

For each result from Phase 0, open the file. Determine what the feature is
supposed to do based on:
1. The page name and route path
2. Any existing skeleton UI
3. What database table it should connect to
4. What similar features in the app already do

Then build it completely:
- Real data fetching from a real API endpoint
- Real form submission to a real API endpoint
- Loading, error, and empty states
- Dark theme (F tokens for field, BASE/CARD/BORDER for desktop)
- Mobile compliant (44px targets, 16px fonts)
- Verification loop after each file

### Common stubs and what to build:

**BIM Viewer** (`app/field/bim-viewer/page.tsx`):
- Three.js WebGL renderer for .glb/.gltf/.obj files
- File upload to Supabase Storage bucket `bim-models`
- OrbitControls for rotate/pan/zoom
- Wireframe toggle, screenshot capture, reset camera
- Table: `bim_models` (create if missing)

**AR Overlay** (`app/field/ar-overlay/page.tsx`):
- Browser camera via `getUserMedia({video:{facingMode:'environment'}})`
- Canvas overlay for drawing pins/annotations
- GPS + compass heading display
- Photo capture (video frame + canvas overlay composited)
- Permission handling with user-friendly fallback

**Drone Gallery** (`app/field/drone/page.tsx`):
- Upload .jpg/.png/.mp4/.mov to Supabase Storage `drone-media`
- Masonry photo grid with video thumbnails
- EXIF GPS extraction on upload
- Phase tagging (same 7 phases as main photos)
- Table: `drone_media` (create if missing)

**Prevailing Wage** (compliance page):
- All 51 jurisdictions enabled (50 states + DC) -- no disabled dropdown options
- Rates fetched from `prevailing_wage_rates` table
- Trade-specific rate lookup
- Certified payroll report generation

---

## PHASE 2 -- FEATURE IMPLEMENTATION RULES

### Every new page must have:
```typescript
'use client';
import { useState, useEffect } from 'react';
import { F } from '@/lib/field-tokens';  // field pages
// OR
const BASE = '#0d1117', CARD = '#161b22', BORDER = '#30363d';  // desktop pages
```

### Every new API route must have:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    // .eq('tenant_id', user.tenantId) on every query
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
```

### Every new database table must:
```sql
CREATE TABLE IF NOT EXISTS table_name (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- ... columns ...
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```
Then verify: `SELECT table_name FROM information_schema.tables WHERE table_name = 'X';`

### After each page is built:
```bash
wc -l [file]  # must be substantial, not a stub
npm run build 2>&1 | grep -E "Compiled|error" | head -5
```

---

## PHASE 3 -- FINAL SWEEP

```bash
# Zero Coming Soon
grep -rn "Coming Soon\|coming soon" app/ --include="*.tsx" \
  | grep -v "node_modules\|.next" | wc -l

# Zero disabled feature options
grep -rn "<option.*disabled" app/ --include="*.tsx" \
  | grep -v "node_modules\|loading\|submitting\|saving\|pending\|selected.*placeholder" | wc -l

# Zero TODO/FIXME in visible UI
grep -rn "TODO\|FIXME" app/ --include="*.tsx" \
  | grep -v "node_modules\|//.*TODO\|//.*FIXME" | wc -l

# Clean build
npx tsc --noEmit 2>&1
npm run build 2>&1 | tail -10
```

---

## DEFINITION OF DONE

| # | Checkpoint | Proof Required |
|---|-----------|---------------|
| 1 | Zero "Coming Soon" in any .tsx file | grep output showing 0 |
| 2 | Zero disabled dropdown options that represent features | grep output showing 0 |
| 3 | Zero TODO/FIXME in visible UI text | grep output showing 0 |
| 4 | Every former stub page now has 100+ lines of real code | wc -l output per file |
| 5 | All new tables created and verified | SQL SELECT output |
| 6 | All new API routes have auth + tenant isolation | grep verification |
| 7 | `npx tsc --noEmit` shows 0 errors | Raw terminal output |
| 8 | `npm run build` shows "Compiled successfully" | Raw terminal output |
