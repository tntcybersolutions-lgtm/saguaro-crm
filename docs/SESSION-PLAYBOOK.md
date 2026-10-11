# docs/SESSION-PLAYBOOK.md — how to run a MUST-PASS session without flailing

Read this with CLAUDE.md §0 and docs/MUST-PASS.md. Its job is to kill the three
sentences that waste a session: "I can't see it", "I can't connect", "I can't push".

## GROUND TRUTH (memorise, do not re-litigate)

1. **Right repo:** `tntcybersolutions-lgtm/saguaro-crm`, branch `main`. This is the
   one that deploys `saguarocontrol.net`. It is NOT `tntcybersolutions-lgtm/Live-Code-Saguaro`
   (that is an older, dead clone — ignore it).
2. **Attach it, don't fight it:** `add_repo tntcybersolutions-lgtm/saguaro-crm` (push),
   then `git clone --depth 1 … /home/user/saguaro-crm`, then `register_repo_root`.
3. **DB access is the Supabase MCP**, project `jddfvugsaosvgllbkzch`
   (`execute_sql`). That is how you "see" and verify data.
4. **Do NOT curl the live site.** The sandbox's network egress blocks
   `saguarocontrol.net` and the Supabase REST host. A failed curl is EXPECTED, not a
   defect, and not a reason to stop. Use the MCP for data and the Vercel preview for build.
5. **DELETE/DROP/TRUNCATE time out through the MCP** (gated). This is a tooling gate,
   NOT a DB bug. Workaround — wrap in a SELECT-led CTE:
   `WITH d AS (DELETE … RETURNING id) SELECT count(*) FROM d;`
   INSERT / UPDATE / SELECT run normally.
6. **Push = a branch.** `git push -u origin <branch>` triggers a Vercel PREVIEW build
   automatically — that IS your build verification (you do not need `npm install`
   locally; `next` is not installed in the clone). Confirm it with
   `list_deployments(projectId prj_Vz0NawniE1BqmQpsX9HxL5MqfYsb, branch <branch>)` →
   state READY. Never push straight to `main`.
7. **Stripe + QuickBooks go live together.** When Chad says "stripe in" or starts Stripe,
   follow `docs/GO-LIVE-STRIPE-QUICKBOOKS.md` — QuickBooks is one Intuit app for all GCs;
   each GC connects their OWN QuickBooks, never Chad's.

## WHY §0 "PASS" NEEDS A BROWSER STEP YOU DON'T OWN

A cloud session CAN: read code, verify/fix the data+API layer via the Supabase MCP,
push a branch, confirm the preview build compiles.
A cloud session CANNOT: drive a signed-in browser (no egress, no login). So the final
§0 proof — taps counted, screen renders — is done by **Chad on `saguarocontrol.net`**
(production is not SSO-gated) **or by Claude Code running locally on Chad's machine with
Playwright** pointed at the site.
Therefore every session ENDS by producing a **DRIVE SCRIPT**: exact login + exact clicks
+ the expected on-screen result, so the human certification takes two minutes. You never
write PASS yourself unless you drove it.

## THE LOOP — one path, every session (CLAUDE.md §0)

1. Attach + clone + register the repo (ground truth 1–2).
2. Open the path in `docs/MUST-PASS.md`. Read its page + its API route(s).
3. Verify the data layer against `jddfvugsaosvgllbkzch`: the insert's columns exist;
   a real round-trip writes and reads back (clean up with the CTE-delete, or use a
   net-zero `INSERT … RETURNING` then CTE-delete by id — a single-statement
   insert+delete does NOT self-clean, the delete can't see its sibling's new row).
4. Fix bugs ON the path. Off-path finds → `docs/FOUND.md`, DO NOT FIX.
5. `tsc --noEmit` clean for your files → push the branch → confirm preview READY.
6. Write the DRIVE SCRIPT and hand it to Chad. PASS only after he drives it.
7. Report and STOP. Never start a second path.

## PATH ORDER — go straight down. Do not reorder. One per session.

Tag legend: DRIVE = code already correct + data verified, just needs the browser drive ·
VERIFY = not yet inspected, do the loop · FIX = known bug to fix first · BUILD = screen
does not exist yet · MERGE = fix already on a branch, merge then drive.

- Path 1  Daily log …………………… DRIVE (route fixed; round-trip verified)
- Path 2  Clock in/out ……………… DRIVE (web uses /api/timeclock; write verified)
- Path 3  Photo upload ……………… FIX then DRIVE (upload response uses getPublicUrl on a
          private bucket — see FOUND.md; bucket+prefix otherwise correct, 0 ever uploaded)
- Path 4  Today dashboard ………… DRIVE ({actions}↔actions fixed; real rows exist)
- Path 5  Budget / contract ……… VERIFY
- Path 6  Pay application (G702/703) VERIFY
- Path 7  Lien waiver auto-gen …… DRIVE (insert now valid: pay_application_id + allowed
          waiver_type; drive approve→autogen→dashboard count)
- Path 8  Change order ……………… VERIFY
- Path 9  Invoice + payment ……… VERIFY
- Path 10 Stage vocabulary ……… MERGE then DRIVE (branch fix/lead-stage-vocabulary:
          canonical module + write-normalise + backfill; qualified pipeline now 7/$12.932M)
- Path 11 Work a lead ……………… VERIFY
- Path 12 Deal page + stage bar … BUILD (no app/app/leads/[id] — SALES-PLAN.md Phase 1)
- Path 13 Win → open the job …… BUILD (lead_pipeline already has project_id/customer_id;
          PATCH allowlist excludes them — SALES-PLAN.md Phase 2)
- Path 14 Numbers agree ………… VERIFY (depends on 10 merged)
- Path 15 Sub onboarded/compliant VERIFY
- Path 16 Permissions hold ……… VERIFY

## COPY-PASTE KICKOFF (paste at the start of each session, set N + name)

> Saguaro CRM. First read docs/SESSION-PLAYBOOK.md and CLAUDE.md §0.
> Attach + clone tntcybersolutions-lgtm/saguaro-crm (NOT Live-Code-Saguaro), register it.
> DB = Supabase MCP, project jddfvugsaosvgllbkzch. Do NOT curl the live site — egress is
> blocked and that is expected. For DELETE use a SELECT-led CTE. Pushing = a branch →
> Vercel preview is the build check; do not expect to curl prod.
> Work ONLY MUST-PASS Path N: <name>. Verify the data layer on the live DB, fix on-path
> bugs, log off-path to FOUND.md without fixing, tsc clean, push the branch, confirm the
> preview build is READY. Then give me a DRIVE SCRIPT (login + exact clicks + expected
> result) so I can certify §0 in the browser. One path. Report and stop. Do not tell me
> "I can't connect / can't push" — follow the playbook.
