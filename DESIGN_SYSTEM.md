# Saguaro design system — navy / slate

The approved visual reference (owner, 12 Oct 2026) applied to the whole product:
the web app, the client / sub / owner portals and the iOS app (which is the web
app in a Capacitor shell). This file is the rule; the code below implements it.
Where an older spec disagrees (`docs/visual-system-spec.md`,
`docs/DESIGN-SYSTEM-FIX-PLAN.md`, `docs/module-pattern-spec.md` — the neon /
jet-black era), **this file wins**. Copy rules stay in `docs/COPY-STYLE.md`.

## 1. Tokens — `app/globals.css` `:root` (the only source of colour)

| Role | Token | Value |
|---|---|---|
| Page background | `--bg-base` | `#101722` |
| Panels / cards | `--bg-surface` | `#1B2636` |
| Raised surfaces, secondary controls | `--bg-surface-2` | `#243247` |
| Control hover / row hover | `--bg-hover` / `--bg-row-hover` | `#2B3B53` / `#202C3E` |
| Inputs | `--bg-input` | `#101722` |
| Borders | `--border-default` / `--border-subtle` / `--border-strong` | `#334155` / `#334155` / `#475569` |
| Primary text | `--text-primary` | `#F8FAFC` |
| Secondary text | `--text-secondary` | `#CBD5E1` |
| Muted text | `--text-tertiary` | `#94A3B8` |
| Primary action, selected navigation | `--brand-primary` + `--on-brand` | `#FFE000` on `#101722` |
| Informational links | `--link` / `--link-hover` | `#38BDF8` / `#7DD3FC` |
| Status | `--success` / `--warning` / `--danger` / `--info` | `#4ADE80` / `#FBBF24` / `#F87171` / `#38BDF8` |

`lib/design-tokens.ts` and `lib/status-colors.ts` mirror these for TypeScript.
No page defines its own hex. `tools/check-design-system.mjs` fails the build if
raw hex grows past its baseline.

**Yellow is two things only:** the one primary action on a screen and the
selected item (nav, tab, segment, row). Never a number, label, icon, heading,
border or tint. Figures use `figureColor()` (`components/ui/premium.tsx`),
which renders a yellow accent as white. Status colour always sits beside a
word (badge text, label) — never colour alone.

### Colour roles (implemented in `app/globals.css` `:root`)

Approved values come from Chad's directive of 12 Oct 2026. Hover and pressed
states are mixes of approved values (no new hex). Status hues were approved by
name (green / amber / red); their exact values are awaiting confirmation.

| Color role | Approved value | Implemented value | Token | Main consumers |
|---|---|---|---|---|
| App background | #101722 | #101722 | `--bg-base` | app shell, pages, inputs |
| Cards / panels | #1B2636 | #1B2636 | `--bg-surface`, `--surface-modal`, `--nav-bg` | `.k-card`, `.pmSec`, modals, sidebar |
| Elevated / secondary controls | #243247 | #243247 | `--bg-surface-2`, `--surface-popover`, `--action-secondary-bg`, `--tile-bg` | secondary buttons, menus, icon tiles |
| Borders | #334155 | #334155 | `--border-default`, `--border-subtle`, `--action-secondary-border` | cards, inputs, tables, tiles |
| Strong / interactive border | — (derived) | mix #334155 72% + #94A3B8 | `--border-strong`, `--border-interactive` | hover borders, dropzone |
| Primary text | #F8FAFC | #F8FAFC | `--text-primary`, `--action-secondary-fg` | titles, values, body |
| Secondary text | #CBD5E1 | #CBD5E1 | `--text-secondary`, `--nav-fg`, `--tab-fg` | subtitles, descriptions, nav |
| Muted text | #94A3B8 | #94A3B8 | `--text-tertiary`, `--disabled-fg` | labels, meta, captions |
| Inverse text | #101722 | #101722 | `--text-inverse`, `--on-brand`, `--action-primary-fg` | text on yellow |
| Primary action | #FFE000 | #FFE000 | `--brand-primary`, `--action-primary-bg` | `.k-btn-primary`, `goldButtonStyle` |
| Primary hover / pressed | — (derived) | mix #FFE000 90% / 80% + #101722 | `--action-primary-hover`, `--action-primary-pressed` | primary buttons |
| Selected navigation / tab / control | #FFE000 + dark text | #FFE000 on #101722 | `--nav-active-*`, `--tab-selected-*`, `--selected-control-*` | sidebar, job tabs, `.k-tab`, `StagePicker` |
| Links / information | #38BDF8 | #38BDF8 | `--link`, `--info`, `--info-fg`, `--focus-ring`, `--chart-1` | links, info callouts, focus rings, charts |
| Link hover | — (derived) | mix #38BDF8 72% + #F8FAFC | `--link-hover` | links |
| Selected row | — (derived) | mix #38BDF8 10% + #1B2636 | `--selected-row-bg`, `--selected-row-indicator` | tables, lists |
| Success | green (name) | #4ADE80 | `--success`, `--success-fg/bg/border` | badges, callouts, timelines |
| Warning / pending | amber (name) | #FBBF24 | `--warning`, `--warning-fg/bg/border` | badges, callouts |
| Error / overdue | red (name) | #F87171 | `--danger`, `--danger-fg/bg/border`, `--action-danger-*` | badges, errors, destructive buttons |
| Disabled | — (derived) | #243247 / #94A3B8 / #334155 | `--disabled-bg/fg/border` | disabled controls |
| Chart series | — (approved values only) | #38BDF8, light blue, deep blue, #CBD5E1, green, amber, #94A3B8, #334155 | `--chart-1…5`, `components/charts/shared.tsx` | every chart |

### Concept building blocks (kit)

`PageShell` takes `badge` (status pill beside the title) and `meta` (icon + text
facts). `Card` takes `icon` (tile beside the title). `ItemRow` / `ItemList`
(icon tile, title, description, value / action / chevron), `Callout` (the alert
card: status icon, one line, actions), `StagePicker` (ordered stages, the
current one solid yellow), `Timeline` (icon dots with a connector). Toasts post
into the status box inside the app — one notification system.

## 2. Type, spacing, shape, depth

- **Type scale:** page title 22/700 · section title 16/700 · body 14 · labels
  and secondary 13 · captions and meta 12 (the floor). Uppercase table headers
  are the one exception: 11/700, tracking .05em. Inputs are 16px on phones.
- **Spacing:** 4-pt grid (`--sp-*`). Page gutter 24px desktop, 16px phone.
- **Radius:** 8 controls · 10 buttons/tabs · 12 cards. Fully round (999) only for
  status badges and avatars — never for tabs, toggles or filters.
- **Depth:** cards sit on `--shadow-sm` (hairline drop + soft wide shadow) with a
  1px border. No glows, no gradients behind content, no glass (blur) on data;
  blur is reserved for overlays such as sheets and menus.

## 3. Components — use these, do not hand-roll

| Need | Component | File |
|---|---|---|
| Page frame + header | `PageShell` (kit) or `PremiumSurface` + `ModuleHero` (premium) | `components/ui/kit.tsx`, `components/ui/premium.tsx` |
| Buttons | `Button` variants `primary / secondary / ghost / danger` (`.k-btn-*`); premium pages use `goldButtonStyle` for the one primary and `secondaryButtonStyle` for every other action (an empty state's button that repeats the header's is secondary) | kit / premium |
| Card / section | `Card` (`.k-card`) or `SectionCard` (`.pmSec`); `flush` for a table | kit / premium |
| Summary figures | `StatRow` (kit) or `StatStrip` / `StatCard` (premium) — one summary per screen, never repeated | kit / premium |
| Tables | `DataTable` (`.k-table`); phones stack rows, a lone "…" stays in the corner, labelled actions get their own line | kit |
| Tabs / segmented | `.k-tabs` / `.k-tab` (segmented, yellow selected) | globals |
| Status | `Badge` with a tone from `lib/status-colors.ts` | kit |
| Empty / error | `EmptyState` (kit) or `PremiumEmpty` — one compact line + action | kit / premium |
| Upload | `FileDropzone` — one compact row | `components/FileDropzone.tsx` |
| System-filled value | `AutoChip` — quiet "· auto-filled" text | premium |
| How-it-works strip | `FlowStrip` / `FlowSteps` — only in empty states | premium |

Disabled primary = slate with muted text (globals), never faded yellow.

## 4. Page hierarchy (every screen)

1. Where am I — the top bar (job picker or company) + page title.
2. Which record — the job / customer name in the subtitle or picker.
3. What matters — at most one compact summary row, then the working content.
4. What next — one yellow primary action, top right (bottom of a form on phones).

## 5. Mobile and iOS

44 × 44 targets; 16px inputs; safe areas (`env(safe-area-inset-*)`); the fixed
tab bar must never cover content; dense tables stack into labelled rows. iOS = the live site in the Capacitor shell
(`capacitor.config.ts`, `ios/`): launch screen navy, splash image jet black with
the logo (owner's call), status bar dark. Desktop screenshots are not iOS evidence.

## 6. Gates

`npx tsc --noEmit` · `npx eslint` · `npm run check:design-system` ·
`npm run check:style-escapes`. Visual coverage is tracked in `QA_CHECKLIST.md`;
the work plan in `SITE_UPDATE_PLAN.md`.
