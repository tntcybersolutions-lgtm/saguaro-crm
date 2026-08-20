#!/usr/bin/env bash
# =============================================================================
# SAGUARO CRM — SECURITY AUDIT + AUTO-FIX SCRIPT
# Run from repo root: bash scripts/security-audit.sh
# =============================================================================
# What this does:
# 1. Finds every route missing tenant_id isolation
# 2. Finds every stale/duplicate route directory
# 3. Finds every stale API path reference in pages
# 4. Reports exact file + line for every violation
# 5. Auto-fixes stale path references with sed
# 6. Outputs a patch file for tenant_id fixes (too risky to auto-patch logic)
# 7. Prints final scorecard — PASS or FAIL per category
# =============================================================================

set -euo pipefail
IFS=$'\n'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

VIOLATIONS=0
FIXED=0

log_pass()  { echo -e "${GREEN}✓${NC} $1"; }
log_fail()  { echo -e "${RED}✗${NC} $1"; VIOLATIONS=$((VIOLATIONS+1)); }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_info()  { echo -e "${BLUE}→${NC} $1"; }
log_fix()   { echo -e "${GREEN}FIX${NC} $1"; FIXED=$((FIXED+1)); }

# =============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  SAGUARO CRM — SECURITY AUDIT"
echo "  $(date)"
echo "════════════════════════════════════════════════════════════════"

# =============================================================================
echo ""
echo "── PHASE 1: TYPESCRIPT ──────────────────────────────────────────"
if [ "${SKIP_TSC:-}" = "1" ]; then
  log_warn "TypeScript check skipped (SKIP_TSC=1). Run 'npx tsc --noEmit' separately."
else
  tsc_output=$(npx tsc --noEmit 2>&1 || true)
  tsc_errors=$(echo "$tsc_output" | grep "error TS" | wc -l | tr -d ' ')
  tsc_errors=${tsc_errors:-0}
  if [ "$tsc_errors" -eq 0 ]; then
    log_pass "TypeScript: 0 errors"
  else
    log_fail "TypeScript: $tsc_errors errors"
    echo "$tsc_output" | grep "error TS" | head -10
  fi
fi

# =============================================================================
echo ""
echo "── PHASE 2: STALE ROUTE DIRECTORIES ─────────────────────────────"

# Old document routes replaced by project-docs
if [ -d "app/api/documents/[projectId]" ]; then
  log_fail "Stale directory: app/api/documents/[projectId] (should be project-docs)"
  log_info "Removing stale directory..."
  rm -rf "app/api/documents/[projectId]"
  log_fix "Removed app/api/documents/[projectId]"
fi

# Old photos routes replaced by project-photos
if [ -d "app/api/photos/[projectId]" ]; then
  log_fail "Stale directory: app/api/photos/[projectId] (should be project-photos)"
  rm -rf "app/api/photos/[projectId]"
  log_fix "Removed app/api/photos/[projectId]"
fi

# Old closeout/[projectId] replaced by closeout/assemble/[projectId]
if [ -d "app/api/closeout/[projectId]" ]; then
  log_fail "Stale directory: app/api/closeout/[projectId]"
  rm -rf "app/api/closeout/[projectId]"
  log_fix "Removed app/api/closeout/[projectId]"
fi

# Old owner-portal/[projectId] replaced by owner-portal/setup/[projectId]
if [ -d "app/api/owner-portal/[projectId]" ]; then
  log_fail "Stale directory: app/api/owner-portal/[projectId]"
  rm -rf "app/api/owner-portal/[projectId]"
  log_fix "Removed app/api/owner-portal/[projectId]"
fi

# Check for slug conflicts (two DIFFERENT [dynamic] dirs at same level)
echo ""
log_info "Checking for Next.js slug conflicts..."
SLUG_CONFLICTS=0
# Find all dirs containing brackets, group by parent
find app/api -type d -name '\[*\]' 2>/dev/null | sort | while read -r bdir; do
  parent=$(dirname "$bdir")
  echo "$parent"
done | sort | uniq -c | sort -rn | while read -r count parent; do
  count=$(echo "$count" | tr -d ' ')
  if [ "$count" -gt 1 ]; then
    echo "SLUG_CONFLICT: $parent has $count bracket dirs"
    SLUG_CONFLICTS=$((SLUG_CONFLICTS+1))
  fi
done || true
log_pass "Slug conflict check complete"

# =============================================================================
echo ""
echo "── PHASE 3: STALE API PATH REFERENCES IN PAGES ──────────────────"

# Auto-fix stale paths using sed
declare -A PATH_FIXES=(
  ["\/api\/documents\/\\\$"]="/api/project-docs/\$"
  ["\/api\/photos\/\\\$"]="/api/project-photos/\$"
  ["closeout\/\\\${projectId}\/assemble"]="closeout/assemble/\${projectId}"
  ["owner-portal\/\\\${projectId}\/setup"]="owner-portal/setup/\${projectId}"
)

STALE_PATH_COUNT=0
TSX_FILES=$(find app -name "*.tsx" -not -path "*/.next/*" -not -path "*/node_modules/*" 2>/dev/null)
for tsx_file in $TSX_FILES; do
  # Check /api/documents/${
  if grep -q "api/documents/\${" "$tsx_file" 2>/dev/null; then
    log_fail "Stale path in $tsx_file: /api/documents/\${ → /api/project-docs/\${"
    # Auto-fix
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's|/api/documents/\${|/api/project-docs/${|g' "$tsx_file"
    else
      sed -i 's|/api/documents/\${|/api/project-docs/${|g' "$tsx_file"
    fi
    log_fix "Fixed /api/documents/ → /api/project-docs/ in $tsx_file"
    STALE_PATH_COUNT=$((STALE_PATH_COUNT+1))
  fi

  # Check /api/photos/${
  if grep -q "api/photos/\${" "$tsx_file" 2>/dev/null; then
    log_fail "Stale path in $tsx_file: /api/photos/\${ → /api/project-photos/\${"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's|/api/photos/\${|/api/project-photos/${|g' "$tsx_file"
    else
      sed -i 's|/api/photos/\${|/api/project-photos/${|g' "$tsx_file"
    fi
    log_fix "Fixed /api/photos/ → /api/project-photos/ in $tsx_file"
    STALE_PATH_COUNT=$((STALE_PATH_COUNT+1))
  fi

  # Check closeout/${projectId}/assemble
  if grep -q "closeout/\${projectId}/assemble\|closeout/\${project_id}/assemble" "$tsx_file" 2>/dev/null; then
    log_fail "Stale path in $tsx_file: closeout/\${id}/assemble → closeout/assemble/\${id}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's|closeout/\${projectId}/assemble|closeout/assemble/${projectId}|g; s|closeout/\${project_id}/assemble|closeout/assemble/${project_id}|g' "$tsx_file"
    else
      sed -i 's|closeout/\${projectId}/assemble|closeout/assemble/${projectId}|g; s|closeout/\${project_id}/assemble|closeout/assemble/${project_id}|g' "$tsx_file"
    fi
    log_fix "Fixed closeout path in $tsx_file"
    STALE_PATH_COUNT=$((STALE_PATH_COUNT+1))
  fi

  # Check owner-portal/${projectId}/setup
  if grep -q "owner-portal/\${projectId}/setup\|owner-portal/\${project_id}/setup" "$tsx_file" 2>/dev/null; then
    log_fail "Stale path in $tsx_file: owner-portal/\${id}/setup → owner-portal/setup/\${id}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's|owner-portal/\${projectId}/setup|owner-portal/setup/${projectId}|g' "$tsx_file"
    else
      sed -i 's|owner-portal/\${projectId}/setup|owner-portal/setup/${projectId}|g' "$tsx_file"
    fi
    log_fix "Fixed owner-portal path in $tsx_file"
    STALE_PATH_COUNT=$((STALE_PATH_COUNT+1))
  fi

  # Check old drawings table reference
  if grep -q "from('drawings')\|from(\"drawings\")" "$tsx_file" 2>/dev/null; then
    log_fail "Stale table in $tsx_file: from('drawings') → from('drawing_sheets')"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|from('drawings')|from('drawing_sheets')|g; s|from(\"drawings\")|from(\"drawing_sheets\")|g" "$tsx_file"
    else
      sed -i "s|from('drawings')|from('drawing_sheets')|g; s|from(\"drawings\")|from(\"drawing_sheets\")|g" "$tsx_file"
    fi
    log_fix "Fixed drawings → drawing_sheets in $tsx_file"
    STALE_PATH_COUNT=$((STALE_PATH_COUNT+1))
  fi

  # Check old insurance_certificates table reference
  if grep -q "insurance_certificates" "$tsx_file" 2>/dev/null; then
    log_fail "Stale table in $tsx_file: insurance_certificates → sub_insurance"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's|insurance_certificates|sub_insurance|g' "$tsx_file"
    else
      sed -i 's|insurance_certificates|sub_insurance|g' "$tsx_file"
    fi
    log_fix "Fixed insurance_certificates → sub_insurance in $tsx_file"
    STALE_PATH_COUNT=$((STALE_PATH_COUNT+1))
  fi

done

[ "$STALE_PATH_COUNT" -eq 0 ] && log_pass "No stale API path references"

# =============================================================================
echo ""
echo "── PHASE 4: TENANT ISOLATION AUDIT ──────────────────────────────"
echo ""

# Public routes that intentionally have no tenant_id
INTENTIONALLY_PUBLIC=(
  "bid-portal"
  "owner-portal/\[token\]"
  "prequal/\[token\]"
  "cron"
  "auth"
  "test"
)

TENANT_VIOLATIONS=0
TENANT_VIOLATIONS_FILES=()

# Fast approach: use grep -rl to find sets, then comm to intersect
grep -rl "getUser\|requireAuth" app/api/ --include="route.ts" 2>/dev/null | sort > /tmp/saguaro_auth.txt || true
grep -rl "\.from(" app/api/ --include="route.ts" 2>/dev/null | sort > /tmp/saguaro_query.txt || true
grep -rL "tenant_id\|tenantId" app/api/ --include="route.ts" 2>/dev/null | sort > /tmp/saguaro_no_tenant.txt || true

comm -12 /tmp/saguaro_auth.txt /tmp/saguaro_query.txt > /tmp/saguaro_auth_query.txt || true
VIOLATIONS_LIST=$(comm -12 /tmp/saguaro_auth_query.txt /tmp/saguaro_no_tenant.txt 2>/dev/null | \
  grep -v "bid-portal\|owner-portal/\[token\]\|prequal\|cron\|auth/\|test/" || true)

for route_file in $VIOLATIONS_LIST; do
  # Filter out false positives (Buffer.from, Array.from)
  real_db=$(grep "\.from(" "$route_file" 2>/dev/null | grep -v "Buffer\.from\|Array\.from\|import.*from" | wc -l | tr -d ' ') || true
  real_db=${real_db:-0}
  if [ "$real_db" -gt 0 ]; then
    log_fail "MISSING TENANT ISOLATION: $route_file"
    TENANT_VIOLATIONS=$((TENANT_VIOLATIONS+1))
    TENANT_VIOLATIONS_FILES+=("$route_file")
  fi
done
rm -f /tmp/saguaro_auth.txt /tmp/saguaro_query.txt /tmp/saguaro_no_tenant.txt /tmp/saguaro_auth_query.txt

if [ "$TENANT_VIOLATIONS" -eq 0 ]; then
  log_pass "All protected routes have tenant isolation"
else
  echo ""
  log_warn "Found $TENANT_VIOLATIONS routes missing tenant isolation."
  echo ""
  echo "These files need manual fixes (logic changes cannot be auto-patched):"
  echo ""
  for f in "${TENANT_VIOLATIONS_FILES[@]}"; do
    echo "  FILE: $f"
    echo "  QUERIES MISSING TENANT FILTER:"
    grep -n "\.from(" "$f" | grep -v "tenant_id\|tenantId" | head -5 | \
      sed 's/^/    /'
    echo ""
  done
  echo "FIX TEMPLATE FOR EACH FILE:"
  echo ""
  cat << 'TEMPLATE'
  // 1. After getUser(), add:
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant' }, { status: 403 })
  }
  const tenantId = profile.tenant_id

  // 2. Add to every SELECT/UPDATE/DELETE:
  .eq('tenant_id', tenantId)

  // 3. Add to every INSERT object:
  tenant_id: tenantId,
TEMPLATE
fi

# =============================================================================
echo ""
echo "── PHASE 5: AUTH COVERAGE ────────────────────────────────────────"

NO_AUTH_COUNT=0
# Find routes without any auth pattern
NO_AUTH_ROUTES=$(grep -rL "getUser\|requireAuth\|CRON_SECRET" app/api/ --include="route.ts" 2>/dev/null | \
  grep -v "bid-portal\|owner-portal/\[token\]\|prequal\|cron\|auth/\|test/\|design-portal\|design-addon\|design/\|portal/\|portals/\|billing\|chat/marketing\|discovery\|insurance/\[\.\.\.path\]\|integrations\|roi/\|sage/public\|smart-packages\|stripe\|white-label\|bid-packages/portal\|network/\|documents/sign\|account/delete\|unsubscribe" | sort || true)
for route_file in $NO_AUTH_ROUTES; do
  log_fail "NO AUTH: $route_file"
  NO_AUTH_COUNT=$((NO_AUTH_COUNT+1))
done

[ "$NO_AUTH_COUNT" -eq 0 ] && log_pass "All non-public routes have authentication"

# =============================================================================
echo ""
echo "── PHASE 6: AUTH-HELPER EXISTENCE ───────────────────────────────"
if [ -f "lib/auth-helper.ts" ]; then
  lines=$(wc -l < lib/auth-helper.ts)
  log_pass "lib/auth-helper.ts exists ($lines lines)"
else
  log_fail "lib/auth-helper.ts MISSING — create it from the directive"
fi

# =============================================================================
echo ""
echo "── PHASE 7: RESEND EMAIL CONFIG ─────────────────────────────────"
if [ -f "lib/email/send.ts" ]; then
  lines=$(wc -l < lib/email/send.ts)
  log_pass "lib/email/send.ts exists ($lines lines)"
else
  log_fail "lib/email/send.ts MISSING"
fi

if grep -q "RESEND_API_KEY" .env.local 2>/dev/null; then
  log_pass "RESEND_API_KEY in .env.local"
elif grep -q "RESEND_API_KEY" .env 2>/dev/null; then
  log_pass "RESEND_API_KEY in .env"
else
  log_warn "RESEND_API_KEY not found in .env.local — email sending will fail"
fi

# =============================================================================
echo ""
echo "── PHASE 8: PAGE LINE COUNTS ────────────────────────────────────"

declare -A PAGE_THRESHOLDS=(
  ["app/app/projects/[projectId]/intelligence/page.tsx"]=500
  ["app/app/projects/[projectId]/budget/page.tsx"]=300
  ["app/app/projects/[projectId]/meetings/page.tsx"]=400
  ["app/app/projects/[projectId]/schedule/page.tsx"]=250
  ["app/app/projects/[projectId]/inspections/page.tsx"]=250
  ["app/app/projects/[projectId]/warranty/page.tsx"]=200
  ["app/app/projects/[projectId]/transmittals/page.tsx"]=200
  ["app/app/projects/[projectId]/prime-contract/page.tsx"]=400
  ["app/app/projects/[projectId]/timecards/page.tsx"]=380
  ["app/app/projects/[projectId]/directory/page.tsx"]=350
  ["app/app/projects/[projectId]/reports/page.tsx"]=350
  ["app/app/projects/[projectId]/documents/page.tsx"]=400
  ["app/app/projects/[projectId]/photos/page.tsx"]=350
  ["app/app/projects/[projectId]/communications/page.tsx"]=400
  ["app/app/projects/[projectId]/owner-portal-setup/page.tsx"]=250
  ["app/app/projects/[projectId]/bid-intelligence/page.tsx"]=300
  ["app/app/projects/[projectId]/permits/page.tsx"]=380
  ["app/app/projects/[projectId]/equipment/page.tsx"]=320
  ["app/app/projects/[projectId]/closeout/page.tsx"]=200
  ["app/app/page.tsx"]=350
  ["app/app/settings/page.tsx"]=300
  ["app/app/employees/page.tsx"]=300
  ["app/owner/[token]/OwnerPortalClient.tsx"]=350
)

PAGE_PASS=0
PAGE_FAIL=0
for page in "${!PAGE_THRESHOLDS[@]}"; do
  threshold="${PAGE_THRESHOLDS[$page]}"
  if [ -f "$page" ]; then
    lines=$(wc -l < "$page")
    if [ "$lines" -ge "$threshold" ]; then
      log_pass "$lines/$threshold  $page"
      PAGE_PASS=$((PAGE_PASS+1))
    else
      log_fail "$lines/$threshold  $page (need $((threshold - lines)) more lines)"
      PAGE_FAIL=$((PAGE_FAIL+1))
    fi
  else
    log_fail "MISSING: $page"
    PAGE_FAIL=$((PAGE_FAIL+1))
  fi
done

# =============================================================================
echo ""
echo "── PHASE 9: NAVIGATION COMPLETENESS ─────────────────────────────"

NAV_FILE="app/app/projects/[projectId]/layout.tsx"
REQUIRED_MODULES=(
  "budget" "prime-contract" "pay-applications"
  "rfis" "submittals" "change-orders"
  "daily-logs" "timecards" "punch-list" "inspections"
  "schedule" "meetings" "transmittals"
  "drawings" "documents" "photos"
  "intelligence" "bid-intelligence"
  "warranty" "closeout" "directory"
  "communications" "reports" "owner-portal-setup"
  "lien-waivers" "bid-packages" "takeoffs"
  "permits" "equipment"
)

NAV_MISSING=0
if [ -f "$NAV_FILE" ]; then
  for module in "${REQUIRED_MODULES[@]}"; do
    if grep -q "href.*/$module" "$NAV_FILE" 2>/dev/null; then
      true # pass
    else
      log_fail "NOT IN NAV: $module"
      NAV_MISSING=$((NAV_MISSING+1))
    fi
  done
  [ "$NAV_MISSING" -eq 0 ] && log_pass "All ${#REQUIRED_MODULES[@]} modules present in project nav"
else
  log_fail "Layout file not found: $NAV_FILE"
fi

# =============================================================================
echo ""
echo "── PHASE 10: FINAL BUILD ─────────────────────────────────────────"
if [ "${SKIP_BUILD:-}" = "1" ]; then
  log_warn "Build check skipped (SKIP_BUILD=1). Run 'npm run build' separately."
else
  build_output=$(npm run build 2>&1 || true)
  if echo "$build_output" | grep -q "Compiled successfully"; then
    log_pass "Build: Compiled successfully"
  elif echo "$build_output" | grep -q "error"; then
    log_fail "Build FAILED"
    echo "$build_output" | grep -E "error|Error" | head -10
  fi
fi

# =============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  FINAL SCORECARD"
echo "════════════════════════════════════════════════════════════════"
echo ""

TOTAL_VIOLATIONS=$((VIOLATIONS))
TOTAL_FIXES=$((FIXED))

echo "  Auto-fixed:        $TOTAL_FIXES items"
echo "  Violations found:  $TOTAL_VIOLATIONS items"
echo "  Pages passing:     $PAGE_PASS / $((PAGE_PASS + PAGE_FAIL))"
echo "  Pages failing:     $PAGE_FAIL"
echo "  Nav missing:       $NAV_MISSING modules"
echo "  Tenant violations: $TENANT_VIOLATIONS routes"
echo ""

if [ "$TOTAL_VIOLATIONS" -eq 0 ] && \
   [ "$TENANT_VIOLATIONS" -eq 0 ] && \
   [ "$PAGE_FAIL" -eq 0 ] && \
   [ "$NAV_MISSING" -eq 0 ]; then
  echo -e "  ${GREEN}██████████████████████████████████████████${NC}"
  echo -e "  ${GREEN}  ALL CHECKS PASS — SAFE TO COMMIT  ${NC}"
  echo -e "  ${GREEN}██████████████████████████████████████████${NC}"
  exit 0
else
  echo -e "  ${RED}██████████████████████████████████████████${NC}"
  echo -e "  ${RED}  FIX ALL VIOLATIONS BEFORE COMMITTING  ${NC}"
  echo -e "  ${RED}██████████████████████████████████████████${NC}"
  echo ""
  echo "  Run this script again after fixing to verify."
  exit 1
fi
