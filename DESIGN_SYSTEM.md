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
| Muted text | `--text-tertiary` | `#A3B1C6` |
| Page title | `--title-page` | `#38BDF8` (bright cyan-blue), `--fs-title` 26px / `--fs-title-m` 22px on phones |
| Section / card heading | `--title-section` | `#7DD3FC`, `--fs-section` 16px |
| Card edge | `--border-card` + `--card-highlight` | `#3D4F68` + a 1px top highlight |
| Module accent (the page's) | `--acc` (set per route by the app shell) | one of the eight `--mod-*` hues below |
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
states are mixes of approved values (no new hex). The status values
#4ADE80 / #FBBF24 / #F87171 were confirmed by Chad on 12 Oct 2026.

| Color role | Approved value | Implemented value | Token | Main consumers |
|---|---|---|---|---|
| App background | #101722 | #101722 | `--bg-base` | app shell, pages, inputs |
| Cards / panels | #1B2636 | #1B2636 | `--bg-surface`, `--surface-modal`, `--nav-bg` | `.k-card`, `.pmSec`, modals, sidebar |
| Elevated / secondary controls | #243247 | #243247 | `--bg-surface-2`, `--surface-popover`, `--action-secondary-bg`, `--tile-bg` | secondary buttons, menus, icon tiles |
| Borders | #334155 | #334155 | `--border-default`, `--border-subtle`, `--action-secondary-border` | cards, inputs, tables, tiles |
| Strong / interactive border | — (derived) | mix #334155 72% + #94A3B8 | `--border-strong`, `--border-interactive` | hover borders, dropzone |
| Primary text | #F8FAFC | #F8FAFC | `--text-primary`, `--action-secondary-fg` | titles, values, body |
| Secondary text | #CBD5E1 | #CBD5E1 | `--text-secondary`, `--nav-fg`, `--tab-fg` | subtitles, descriptions, nav |
| Muted text | #94A3B8 → raised to #A3B1C6 (global theme pass) | #A3B1C6 (7:1 on a card) | `--text-tertiary` | labels, meta, captions, table headers |
| Page title | #38BDF8 (global theme pass) | #38BDF8 | `--title-page` | `PageShell`, `ModuleHero`, any `h1` in `.sag-app`, login |
| Section heading | #7DD3FC (global theme pass) | #7DD3FC | `--title-section` | `h2`, `.k-card-title`, `.pmSecTitle`, `.fl-sec`, sidebar group heads |
| Card edge | (global theme pass) | #3D4F68 + top highlight | `--border-card`, `--card-highlight` | `.k-card`, `.pmSec`, `.k-stats`, `.pmStrip`, `.k-callout`, `.fl-list`, `.fl-strip`, `.fl-brief` |
| Inverse text | #101722 | #101722 | `--text-inverse`, `--on-brand`, `--action-primary-fg` | text on yellow |
| Primary action | #FFE000 | #FFE000 | `--brand-primary`, `--action-primary-bg` | `.k-btn-primary`, `goldButtonStyle` |
| Primary hover / pressed | — (derived) | mix #FFE000 90% / 80% + #101722 | `--action-primary-hover`, `--action-primary-pressed` | primary buttons |
| Selected navigation / tab / control | #FFE000 + dark text | #FFE000 on #101722 | `--nav-active-*`, `--tab-selected-*`, `--selected-control-*` | sidebar, job tabs, `.k-tab`, `StagePicker` |
| Links / information | #38BDF8 | #38BDF8 | `--link`, `--info`, `--info-fg`, `--focus-ring`, `--chart-1` | links, info callouts, focus rings, charts |
| Link hover | — (derived) | mix #38BDF8 72% + #F8FAFC | `--link-hover` | links |
| Selected row | — (derived) | mix #38BDF8 10% + #1B2636 | `--selected-row-bg`, `--selected-row-indicator` | tables, lists |
| Success | #4ADE80 | #4ADE80 | `--success`, `--success-fg/bg/border` | badges, callouts, timelines |
| Warning / pending | #FBBF24 | #FBBF24 | `--warning`, `--warning-fg/bg/border` | badges, callouts |
| Error / overdue | #F87171 | #F87171 | `--danger`, `--danger-fg/bg/border`, `--action-danger-*` | badges, errors, destructive buttons |
| Disabled | — (derived) | #243247 / #94A3B8 / #334155 | `--disabled-bg/fg/border` | disabled controls |
| Module accents (global theme pass) | one hue per domain | core #38BDF8 · sales #A78BFA · precon #22D3EE · build #818CF8 · field #2DD4BF · money #F472B6 · docs #60A5FA · people #FB923C | `--mod-*`, `--acc`; `lib/ui/app-accent.ts` (`moduleAccent`, `accentForPath`, `DOMAIN_HEX` mirror) | every icon tile (`.k-tile`, `IconTile`, `SectionCard` icon, `ModuleHero` tile, stat icons, timeline dots, `IconChip`), sidebar glyphs, job tool rows |
| Documents (PDF, print, Excel, Word) | white paper | ink #0F172A, accent #0284C7 (#38BDF8 on the navy band), rules #CBD5E1, zebra #F1F5F9 | `lib/document-palette.ts` `DOC_HEX` → `report-theme` `DOC`, `print-doc` `PRINT_TOKENS`, `report-export` | every generator in `lib/document-templates`, report exports, HTML print docs |
| Status chips (`components/ui/Status`) | approved status values | draft #94A3B8 · waiting on you #38BDF8 · waiting/warn #FBBF24 · good/done #4ADE80 · bad #F87171 | `lib/status-system.ts` `TONES` | RFIs, header messages, Home |
| Chart series | — (approved values only) | #38BDF8, light blue, deep blue, #CBD5E1, green, amber, #94A3B8, #334155 | `--chart-1…5`, `components/charts/shared.tsx` | every chart |

### Global theme pass (12 Oct 2026): one system, documented exceptions

The look is set in three places only: the `:root` tokens in `app/globals.css`,
the module map in `lib/ui/app-accent.ts`, and the document palette in
`lib/document-palette.ts`. Shared components read those; pages do not set
title, heading, card-edge or tile colours. The app shell puts the page's
module hue in `--acc` (`accentForPath(pathname)` on `.main-content-area`), so
every shared tile on a page takes it with no per-page code.

Accents mark identity only. Status meaning stays green / amber / red with its
word; yellow stays the one primary action and the selected item.

**Intentional exceptions (not bypasses):**
- Customer branding: a tenant's own colour (`tenants.settings.primary_color`,
  white-label `--brand-primary`) and its previews in Settings → Branding.
- Drawing, markup and takeoff canvases (`components/drawings/*`,
  `app/app/takeoff/measured/*`, `components/signal-studio/Designer.tsx`,
  `components/PhotoEditor.tsx`, `components/heatmap/*`, `components/ui/CrewMap.tsx`):
  annotation and map colours the user picks or that carry meaning.
- Charts (`components/charts/*`): series colours from `--chart-*` / `CHART`.
- CSS masks (`#000` in `mask-image`), video and media backgrounds, signature
  pads and QR codes (white for contrast), print documents (white paper).
- Role colours stored per company (`role_definitions.color`) are hex by design.
- `lib/pdf-engine.ts` (the older WH-347 / lien-waiver engine) holds embedded
  binary and keeps its 22 colour literals; the newer generators in
  `lib/document-templates/` replace it.
- Hand-built record names, figures and error lines stay `--text-primary`:
  they are content, not headings.

### Concept building blocks (kit)

`PageShell` takes `badge` (status pill beside the title) and `meta` (icon + text
facts). `Card` takes `icon` (tile beside the title). `ItemRow` / `ItemList`
(icon tile, title, description, value / action / chevron), `Callout` (the alert
card: status icon, one line, actions), `StagePicker` (ordered stages, the
current one solid yellow), `Timeline` (icon dots with a connector). Toasts post
into the status box inside the app — one notification system.

### List kit (`components/ui/flat.tsx`)

`Brief` is the concept's alert card (status circle, sentence, one yellow
action; `tone` and `icon` props). `Row` draws an icon tile; a status `dot`
becomes that colour's status icon. `ToolRow` + `FlatList grid` is the
two-column "More project tools" tile grid. `RowAction` primary/ghost use the
action tokens with hover, pressed, focus and disabled states.

### Rules this round (12 Oct 2026)

- Yellow is for the primary action and the selected item only: never a
  progress bar, marker, count badge, chat bubble, toast or focus ring.
  Progress bars use `--chart-1`; focus rings use `--focus-ring`.
- `lib/module-identity.ts` is a byte mirror of the marketing site and keeps
  its marketing hues there; in-app code imports `moduleAccent` from
  `lib/ui/app-accent.ts` (the domain map; `lib/ui/app-accent.sanity.test.ts`
  checks it mirrors the `--mod-*` tokens and assigns every module).
- `rgba()` colours count as colours: only approved RGB values (and black /
  white for shadows and overlays) in app code.
- A colour with an alpha suffix is `color-mix(in srgb, <colour> N%,
  transparent)`, never `${colour}NN`: the suffix is invalid CSS when the
  colour is a variable, and the browser drops the declaration.
- `!important`: `app/globals.css` carries 158 from earlier rounds, mostly to
  beat inline styles. None were added this round. The phone rule that sets
  inputs to 16px is a deliberate exception: it has to beat inline font sizes so
  iOS never zooms into a field. Reducing the rest means moving those inline
  styles into classes, screen by screen.

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
