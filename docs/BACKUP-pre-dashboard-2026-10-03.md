# Backup before the dashboard rebuild (2026-10-03)

Taken before any dashboard work started. Restore with one of the options
below.

| What | Where |
|---|---|
| Code (tag) | `backup/pre-dashboard-2026-10-03` → `main` @ `ed8ed003db9fc96e146ad0fdbe7eb9df83539b0c` |
| Code (branch) | `backup/pre-dashboard-2026-10-03-branch` (same commit) |
| Live deployment | Vercel `dpl_DyWaCT4LQYFBhBop7nDwdQg9A5y6` (`saguaro-d4ijon8vm-salty-vault.vercel.app`), production, READY, rollback candidate |
| Database | No schema or data changes were made before the rebuild. The rebuild is planned as additive only (new columns/tables, never drops). Supabase's own daily backups cover the data. |

## Restore — fastest (seconds, no code change)
Vercel → saguaro-crm → Deployments → `dpl_DyWaCT4LQYFBhBop7nDwdQg9A5y6` →
**Instant Rollback**. The live site goes back to exactly this build.

## Restore — in code (permanent)
```bash
git checkout main && git pull
git revert -m 1 <merge-commit-of-the-dashboard-PR>   # or revert each dashboard PR
git push   # Vercel redeploys main
```
Or compare any file with the backup:
`git diff backup/pre-dashboard-2026-10-03 -- app/app/page.tsx`.

## Restore — without reverting (feature flag)
The new home ships behind a flag. Turning it off returns everyone to the
current dashboard without a deploy. The flag is documented in the dashboard PR.

## Second backup — immediately before merging the role-based home
| What | Where |
|---|---|
| Code (tag) | `backup/pre-dashboard-merge-2026-10-03` → `main` @ `2dfbb1e78a8aeb7bc2ec0bf08448e0faf6a4dc31` (includes PR #40) |
| Live deployment | Vercel `dpl_86aqgEAvk4d862qeALvQZAhEcmW7` (`saguaro-2rff30ewx-salty-vault.vercel.app`) — **Instant Rollback** target |
| Database | The home and service screen add no tables or columns. New service calls are ordinary `service_tickets` rows. |

Fastest restore: Vercel → Deployments → `dpl_86aqgEAvk4d862qeALvQZAhEcmW7` → Instant Rollback.
The old dashboard also stays reachable at `/app/classic`.
