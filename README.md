# Autopilot AI Engine

This bundle includes:

- `supabase/migrations/20260307_autopilot.sql`
- `src/lib/supabase/admin.ts`
- `src/lib/autopilot/engine.ts`
- `src/app/api/internal/autopilot/run/route.ts`
- `scripts/run-autopilot.ts`

## What it does

- scans overdue RFIs
- scans unpaid invoices
- scans schedule slippage
- scans unresolved field issues
- writes/upserts alerts into `autopilot_alerts`
- auto-resolves stale alerts when a risk condition clears
- writes run history into `autopilot_runs`
- creates project-level rollup alerts when risk concentration increases

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTOPILOT_CRON_SECRET`

## Run manually

```bash
npx tsx scripts/run-autopilot.ts <tenant-id> [project-id]
```

## HTTP trigger

```bash
curl -X POST "https://your-app.example.com/api/internal/autopilot/run" \
  -H "Authorization: Bearer $AUTOPILOT_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"<tenant-id>","projectId":"<project-id-optional>"}'
```

## Important mapping note

The engine assumes canonical tables named:

- `rfis`
- `invoices`
- `schedule_tasks`
- `field_issues`
- `tenants` (only for the optional CLI all-tenant loop)

If your schema uses different names or column labels, only the four source queries and the row field mappings in `engine.ts` need to be adjusted.

## Previewing the UI and running accessibility audit

To preview the `saguaro-preview.html` and run a quick accessibility audit locally:

1. Serve the directory (or open the file directly). Example using a simple static server:

```bash
# from the project root
npx http-server -c-1 .
# open http://localhost:8080/saguaro-preview.html
```

2. Run the accessibility audit (requires Node):

```bash
npm install
npm run a11y
```

This project includes a small audit script at `tools/a11y-check.js` that uses `axe-core` + `jsdom` to report violations for `saguaro-preview.html`.

3. Files added for the site navigation and a11y checks:

- `assets/css/site-nav.css` — navigation styles
- `assets/js/site-nav.js` — nav loader and keyboard wiring
- `fragments/site-nav.html` — nav fragment loaded into pages
- `tools/a11y-check.js`, `package.json` — accessibility audit tooling

## Responsive Design & Device Optimization

The preview is fully optimized for all devices and screen sizes:

**Device Support:**
- ✓ Small phones (up to 568px) — portrait + landscape
- ✓ Tablets & medium phones (569–880px) — iPad, Galaxy Tab, larger phones
- ✓ iPad & tablets (768–1024px) — iPad Air, Galaxy Tab S
- ✓ Desktops (881px+) — with full sidebar navigation
- ✓ Large desktops (1200px+) — 4-column grid layouts
- ✓ Landscape orientation — optimized for landscape phones/tablets
- ✓ High DPI / Retina screens (2x+ pixel density)
- ✓ iOS Safari — font-size fixes, input handling, touch target sizing
- ✓ Android WebView — full-width mobile layout, proper padding
- ✓ Print mode — removes navigation, sets black text on white

**Responsive Features:**
- Touch-friendly targets: 44–48px minimum on touch devices
- Sidebar hides on tablets & phones (hamburger menu takes over)
- Flexible grid layouts: 4 columns → 2 columns → 1 column as needed
- Font sizes scale with viewport
- Topbar wraps and reflows on small screens
- Tables remain scrollable on narrow screens
- Form inputs sized for comfortable mobile interaction

**Test on multiple devices:**

```bash
# Chrome DevTools: Ctrl+Shift+M (or Cmd+Shift+M on Mac) to toggle device mode
# Then select from presets: iPhone, iPad, Pixel, Galaxy Tab, etc.
```

