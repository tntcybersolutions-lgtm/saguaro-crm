# Design System — Saguaro CRM (Obsidian Glass, neon-on-black)

_Pass 2 deliverable (§12). The single source of truth for tokens, the layout contract, and component usage. Reconciles `saguaro-visual-tokens.reference.css` **into the existing system** rather than mounting a parallel one (§3/§9)._

## Source of truth
- **Tokens:** `lib/design-tokens.ts` (`colors`, `brand`, `space`, `font`, `radius`, `shadow`, `sidebar`, `breakpoint`, `z`, and the new **`layout`**). Status colors: `lib/status-colors.ts`. White-label brand resolves through `--brand-primary` in `globals.css`.
- **Components:** the `components/ui` kit (`PageShell`, `DataTable`, `FormModal`, `Field`, `Toolbar`, `Tabs`, `StatRow`, `Badge`, `Button`, `EmptyState`, …) + `AppSidebar`.

## Two conflicts with the reference CSS — resolved
1. **Font.** Reference defaulted to **Inter**. We keep the **native system stack** (`font.family`), per the owner's "no AI fonts" rule and the existing `globals.css`. Inter is **not** introduced.
2. **Accent.** Reference used champagne `#ebc275`. We keep **NEON YELLOW `#FFE600`** via `--brand-primary` (owner decision 2026-10-02). The champagne is **not** adopted.
3. **No parallel system.** The `.sg-root` / `.sg-layout` scaffold is **not** mounted. Its good *values* are folded into `design-tokens.ts`; components keep using the kit.

## Layout contract (`layout` tokens)
- Page gutter `clamp(16px,1.67vw,32px)` (16 on mobile); section gap 24 (16 mobile).
- Topbar 60px; rail 256px expanded / 72px collapsed (sidebar migrates to these when the shell is touched).
- Controls 40px desktop / 44px touch; **data rows 44px** default, 36px compact.
- **Forms:** editable field groups 640–800px (`formMaxWidth` 760) — never full-bleed. Reading text `75ch`. Detail rail 320–384px.
- **Full-width rule:** app workspace uses `width:100%` + `max-width:none`; every shrinking flex/grid child gets `min-width:0`. No inherited marketing max-width. `100vw` is banned inside the sidebar layout.

## Width by page type (§4)
Tables / reports / lists / schedules → full workspace. Drawings / takeoff / maps → full width **and** height, rails overlay when tight. Detail pages → flexible main + 320–384px rail (collapses first). Forms → full-width page, constrained field column. Login / public → intentional max-width keeps.

## Exceptions (intentional max-width allowed)
Public marketing pages, login/signup/reset, onboarding — these keep a centered composition. The **app** (`/app/**`) does not.

## Non-negotiable guardrails (all passes)
Preserve auth, RLS, tenant isolation, roles, approve-to-share separation, payment math. No fabricated records/metrics. Honest unavailable/empty/error states — a present button is not a working feature. One sidebar mounted at a time. No `window.prompt/confirm` for business editing on migrated screens.
