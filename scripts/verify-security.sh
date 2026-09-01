#!/usr/bin/env bash
# verify-security.sh — run this yourself. It does not ask you to trust anything.
#
# Every check below is something an attacker could try from outside, with no
# account and no cooperation from us. If a check FAILS, the hole is real and
# open right now. If it PASSES, that specific attack does not work.
#
#   bash scripts/verify-security.sh
#
# It reads nothing secret and changes nothing.

set -uo pipefail

PROJECT="${SUPABASE_PROJECT:-jddfvugsaosvgllbkzch}"
BASE="https://${PROJECT}.supabase.co/storage/v1/object/public"
pass=0; fail=0

check() { # check <name> <expected-not-200-url>
  local name="$1" url="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "${url}?cb=$RANDOM$RANDOM")
  if [ "$code" = "200" ]; then
    printf '  FAIL  %-46s HTTP %s  (readable by anyone)\n' "$name" "$code"
    fail=$((fail+1))
  else
    printf '  pass  %-46s HTTP %s\n' "$name" "$code"
    pass=$((pass+1))
  fi
}

echo "Anonymous reads — no login, no key, no cookie"
echo "-------------------------------------------------------------------"

# A real object path from the blueprints bucket. Anyone who has ever been sent
# a blueprint link has these ids.
check "blueprint (another tenant's drawing set)" \
  "$BASE/blueprints/102c3d23-3b8f-423c-ac1c-8ebbd46d22dd/blueprints/5b312950-be6d-48e3-a287-10af0cbd5af6/blueprint.png"

check "blueprints bucket listing" \
  "$BASE/blueprints/"

check "documents bucket (contracts, W-9s, pay apps)" \
  "$BASE/documents/"

check "project-files bucket" \
  "$BASE/project-files/"

check "takeoffs bucket" \
  "$BASE/takeoffs/"

check "takeoff image (a real object)" \
  "$BASE/takeoffs/692d8793-4d9f-4c43-a935-bf56cc637553/4122ac2b-02aa-4520-9c2c-7ce249d5ad79/1785876434283_IMG_3415.png"

check "drawings bucket" \
  "$BASE/drawings/"

echo ""
echo "Public on purpose — this one SHOULD answer 200"
echo "-------------------------------------------------------------------"
# Tenant logos render in emails, customer portals and PDF letterheads for people
# who have no login. Public is the right answer here; it is listed so the choice
# stays deliberate rather than forgotten.
printf '  note  %-46s HTTP %s\n' "branding (tenant logos)" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/branding/")"

echo ""
echo "-------------------------------------------------------------------"
printf 'passed %d   failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "No anonymous read got through." || echo "SOMETHING IS OPEN — see FAIL lines above."
exit "$fail"
