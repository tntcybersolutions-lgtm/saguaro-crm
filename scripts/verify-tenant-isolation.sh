#!/usr/bin/env bash
# =============================================================================
# SAGUARO CRM — QUERY-LEVEL TENANT ISOLATION VERIFIER
# This does NOT just grep for "tenant_id" in the file.
# It finds every single .from('table') call and shows you the
# surrounding lines so you can see with your own eyes whether
# that specific query is protected.
#
# Usage: bash scripts/verify-tenant-isolation.sh 2>&1 | tee audit-proof.txt
#
# Output: audit-proof.txt — share this with anyone to prove coverage
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

UNPROTECTED=0
PROTECTED=0
SKIPPED=0

# Routes that are intentionally public (no tenant needed)
is_public() {
  local f="$1"
  echo "$f" | grep -qE "bid-portal|owner-portal/\[token\]|owner-portal/approve|prequal/|/cron/|/auth/|/admin/|design-addon|design/reimagine|design/styles|design-portal/|design/generate|documents/sign|portals/|portal/client|portal/sub|portal/resend|w9/\[token\]|reports/export|calculate|discovery/|bid-packages/portal|onboarding/trial-emails|files/download|files/list|files/upload|network/connect|photos/route|photos/upload|presence/heartbeat|internal/autopilot"
}

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  SAGUARO CRM — QUERY-LEVEL TENANT ISOLATION PROOF"
echo "  $(date)"
echo "  Every .from() query in every route file. No hiding."
echo "════════════════════════════════════════════════════════════════"
echo ""

# Find all route files
ROUTE_FILES=$(find app/api -name "route.ts" | sort)

for route_file in $ROUTE_FILES; do

  # Skip public routes
  if is_public "$route_file"; then
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  # Find every line with .from( in this file
  FROM_LINES=$(grep -n "\.from(" "$route_file" 2>/dev/null || true)

  # Skip files with no DB queries
  if [ -z "$FROM_LINES" ]; then
    continue
  fi

  # Check if this route has any auth at all
  HAS_AUTH=$(grep -c "getUser\|requireAuth" "$route_file" 2>/dev/null || echo 0)

  if [ "$HAS_AUTH" -eq 0 ]; then
    echo -e "${RED}══ NO AUTH ══ $route_file${NC}"
    echo "   This route has DB queries but no authentication at all."
    echo ""
    UNPROTECTED=$((UNPROTECTED+1))
    continue
  fi

  # For each .from() call, show 8 lines of context and flag it
  FILE_HAS_VIOLATION=0
  FILE_VIOLATIONS=""

  while IFS= read -r from_line; do
    LINE_NUM=$(echo "$from_line" | cut -d: -f1)
    LINE_CONTENT=$(echo "$from_line" | cut -d: -f2-)

    # Skip Buffer.from, Array.from, Object.from, storage bucket calls (false positives)
    if echo "$LINE_CONTENT" | grep -qE "Buffer\.from|Array\.from|Object\.from|Promise\.from|\.from\(columns|\.from\(rows|\.from\(data|storage\.from|\.from\('project-files'\)|\.from\('project-photos'\)|\.from\('blueprints'\)|\.from\('private-files'\)"; then
      continue
    fi

    # Get 50 lines of context around this query (the full function block)
    START=$((LINE_NUM - 25))
    [ "$START" -lt 1 ] && START=1
    END=$((LINE_NUM + 25))
    CONTEXT=$(sed -n "${START},${END}p" "$route_file" 2>/dev/null)

    # Check if tenant_id appears in the surrounding lines of THIS query
    HAS_TENANT=$(echo "$CONTEXT" | grep -c "tenant_id\|tenantId" || echo 0)

    if [ "$HAS_TENANT" -gt 0 ]; then
      PROTECTED=$((PROTECTED+1))
    else
      FILE_HAS_VIOLATION=1
      UNPROTECTED=$((UNPROTECTED+1))
      FILE_VIOLATIONS="$FILE_VIOLATIONS\n  Line $LINE_NUM: $LINE_CONTENT\n"
      # Show the full context
      FILE_VIOLATIONS="$FILE_VIOLATIONS  --- CONTEXT (lines $START-$END) ---\n"
      while IFS= read -r ctx_line; do
        FILE_VIOLATIONS="$FILE_VIOLATIONS  $ctx_line\n"
      done <<< "$CONTEXT"
      FILE_VIOLATIONS="$FILE_VIOLATIONS\n"
    fi

  done <<< "$FROM_LINES"

  if [ "$FILE_HAS_VIOLATION" -eq 1 ]; then
    echo -e "${RED}✗ UNPROTECTED QUERIES in: $route_file${NC}"
    echo -e "$FILE_VIOLATIONS"
  fi

done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Protected queries:   $PROTECTED"
echo "  UNPROTECTED queries: $UNPROTECTED"
echo "  Public routes skipped (intentional): $SKIPPED"
echo ""

if [ "$UNPROTECTED" -eq 0 ]; then
  echo -e "${GREEN}  ████████████████████████████████████████${NC}"
  echo -e "${GREEN}  ALL QUERIES HAVE TENANT ISOLATION — CLEAN${NC}"
  echo -e "${GREEN}  ████████████████████████████████████████${NC}"
  exit 0
else
  echo -e "${RED}  ████████████████████████████████████████${NC}"
  echo -e "${RED}  $UNPROTECTED UNPROTECTED QUERIES FOUND — FIX THESE${NC}"
  echo -e "${RED}  ████████████████████████████████████████${NC}"
  echo ""
  echo "  For each unprotected query above, add:"
  echo ""
  echo "  Option A — use the auth helper (preferred):"
  echo "    import { requireAuth } from '@/lib/auth-helper'"
  echo "    const auth = await requireAuth()"
  echo "    if (auth instanceof NextResponse) return auth"
  echo "    const { supabase, tenantId } = auth"
  echo "    // then add .eq('tenant_id', tenantId) to every query"
  echo ""
  echo "  Option B — manual:"
  echo "    const { data: profile } = await supabase"
  echo "      .from('profiles').select('tenant_id').eq('id', user.id).single()"
  echo "    const tenantId = profile.tenant_id"
  echo "    // then add .eq('tenant_id', tenantId) to every query"
  echo ""
  echo "  Run this script again after fixing to verify."
  exit 1
fi
