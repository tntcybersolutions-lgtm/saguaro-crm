# API Security Audit — permission & tenant isolation

_Deep targeted audit (cloud session). Scope: all **713** `app/api/**/route.ts` files, two
highest-severity classes. Method: static scan → manual review of every flagged candidate.
**Result: no cross-tenant IDOR or unauthenticated-mutation vulnerabilities found.**_

## Class 1 — cross-tenant IDOR (service-role query by id, no tenant scope)
Scan flagged 8 routes; all verified safe:
| Route | Why safe |
|---|---|
| `platform/integrations/[app]` | `getUser` + `isPlatformAdmin(user.email)` gate |
| `branding/logo`, `branding` | scoped to `user.tenantId` (the `.eq('id', user.tenantId)` IS the tenant) |
| `owner-portal/approve/[token]`, `portals/[...path]`, `documents/sign/complete` | token-capability; derived records never take user-supplied ids |
| `portal/sub/lookup`, `portal/client/lookup` | token/session; explicit "never return the token" comment |

## Class 2 — mutation (POST/PUT/PATCH/DELETE) with no auth
Scan flagged 17; all verified safe:
- **Deprecated stubs:** `clock/in`, `clock/out` → `return gone()` (410), no logic.
- **Public by design:** `leads/[...path]` (contact/demo/referral forms), `roi/calculate`,
  `network/subnet-calc`, `chat/marketing`, `sage/public`, `smart-packages/customize-public`,
  `discovery/recommend`, `design/reimagine`, `customers/geo`, `chat/sage-notes`.
- **Portal-session auth:** `portal/client/{payments,summary,messages}` via `getPortalSession`
  + `PORTAL_PERMS` + `.eq('tenant_id', session.tenant_id)`.
- **Auth inside delegated handlers:** `white-label/[...path]` (`getUser` + 401, 404-not-403
  anti-enumeration), `insurance/[...path]` (`getUser` + 401, tenant from **session not body** —
  a documented fix of a prior vuln).

## Evidence of existing hardening (good signs)
- `insurance-tracker.ts`: comments document a past "tenantId from the body, no auth" vuln,
  now session-scoped.
- `white-label-provisioning.ts`: 404 instead of 403 to prevent tenant-id enumeration.
- Role/permission layer (`lib/permissions.ts`) + the Salesperson wall are enforced and verified.

## Recommendation
No fix required. Optional hardening for later: a single automated test that asserts every
mutating `route.ts` references an auth primitive (`getUser`/`requirePermission`/`getPortalSession`/
token/`isPlatformAdmin`) or is on an explicit public-allowlist — to catch regressions as new
routes are added.
