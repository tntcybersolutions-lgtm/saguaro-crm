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
