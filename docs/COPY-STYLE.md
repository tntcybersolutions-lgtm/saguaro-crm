# Saguaro copy style — one standard, app-wide

Owner decision (2026-10-02): **Title Case** for everything a person clicks or
scans, **no forced ALL CAPS** anywhere except real acronyms, and **brighter
status colors**. Every screen follows this file. When it is silent, match the
nearest existing kit screen (`app/app/bids/page.tsx`).

## 1. Which case where

| Text | Case | Example |
|---|---|---|
| Buttons, link-buttons, menu items, nav items, tabs | Title Case | `New Bid Package`, `We Won It →`, `Back to Bidding` |
| Page titles, card / section titles, modal titles | Title Case | `Proposals & Contract Amounts` |
| Form field labels, table column headers, KPI / stat labels | Title Case | `Original Contract`, `Bid Due`, `Billed to Date` |
| Status pills, badges, chips, phase pills | Title Case | `Bidding`, `Out for Bid`, `Under Contract` |
| Body text, subtitles, descriptions, hints, helper text, placeholders, empty-state text, toasts, errors, confirmations | Sentence case | `Every package has a bid.` |

### Title Case rules
- Capitalize every word **except** these, unless it is the first or last word:
  `a an the and but or nor for so yet as at by for in of off on per to up via vs from into onto over with`.
- Hyphenated words capitalize each part: `Sign-In`, `Follow-Up`, `Lump-Sum`.
- Keep acronyms and units exactly: AI, AIA, CSI, G702, G703, G704, G706, G707, W-9, COI, RFI, RFIs, CO, COs, SOV, GC, PM, PDF, CSV, XLS, SF, LF, CY, EA, LS, NWS, OSHA, QA, ROI, HVAC, MEP, TI, ID, URL, API, SMS, iOS, CRM, KPI, YTD, ETA, PO, POs, T&M, NTP, EMR, DOT, ADA, LEED, MBE, WBE, DBE.
- Product / brand names keep their spelling: Saguaro, Sage, Procore, QuickBooks, Supabase.

### Sentence case rules
- First word capitalized, then normal grammar. Proper nouns and acronyms keep their case.
- A full sentence ends with a period. A question ends with `?`. Labels, buttons and titles never end with a period.

## 2. No forced capitals
- Remove `textTransform: 'uppercase'` (inline styles) and `text-transform: uppercase` (CSS) from UI text.
- Rewrite hard-coded ALL-CAPS display strings to the case from §1 (e.g. `'ORIGINAL CONTRACT'` → `'Original Contract'`, `'YOU ARE HERE'` → `'You Are Here'`).
- When caps are removed, drop the wide letter-spacing that went with them (anything above `0.02em` / `0.3px`) back to `normal` or `-0.01em`.
- Acronyms (§1) stay uppercase because they are uppercase words, not styled caps.

## 3. Punctuation and formatting
- Loading / in-progress: the ellipsis character `…`, never `...` (`Saving…`, `Loading…`).
- Navigation arrows: one space before, `→` / `←` (`Open the Job →`, `← Back`). Don't mix with `>` or `»`.
- Dashes in sentences: spaced em dash ` — `. Ranges: en dash `–` (`Oct 2–9`).
- Money `$1,234,567`; percentages `10%` (no space); counts `3 of 12`.
- No double spaces, no stray leading/trailing spaces, no `!!`, no emoji in UI text.
- US English spelling (color, canceled, organization, license).
- Fix obvious typos and grammar while you are there.

## 4. Never change (correctness beats consistency)
- Any string that is also a **value**: compared in code (`=== 'Won'`), stored in the DB, sent to an API, used as an id, key, route, query param, enum, status or stage value, `data-tour` / `data-testid`, or matched by tests or tours.
  If a constant array is both the label and the stored value (e.g. lead `STAGES = ['New', 'Won', …]`), leave the values and only change display text that is separate from them.
- AI prompt text (`lib/sage-prompts*.ts`, prompts inside API routes) and anything sent to a model.
- Legal document body text (AIA forms, lien waiver language, contracts, terms/privacy) — only fix clear typos.
- Email subject/body templates unless the change is purely case/typo.
When unsure, leave it and list it in your report.

## 5. Colors (status pills, badges, buttons)
- The six status colors live in `lib/status-colors.ts` and render through the kit `Badge` / `.k-badge` and the premium `Pill`. They are tuned brighter for the dark theme: stronger foreground, more opaque fill, clearer border. Every pill in the app reads from those tokens — no hand-picked status hex values on pages.
- The project phase pill uses the same palette: **Bidding** = Lead blue, **Building** = Ongoing green.

## 6. Background and surfaces — jet black + glass (owner decision 2026-10-02)
The warm brown/amber backdrop behind text (animated aurora blobs, amber radial
glows, gold-tinted page gradients) made words hard to read. The look is now:
- **Page background: jet black** `#000000` (`--bg-base`). No brown, amber or
  gold tint, no animated aurora behind content. A very faint cool sheen at the
  top of the page is allowed; nothing warm.
- **Cards / panels / modals: glass.** Translucent white over black with blur:
  `background: rgba(255,255,255,0.045)`, `backdrop-filter: blur(16px) saturate(140%)`,
  `border: 1px solid rgba(255,255,255,0.09)`, a 1px top highlight
  `inset 0 1px 0 rgba(255,255,255,0.06)`. Raised surfaces (inputs, table header,
  menus) a step brighter: `rgba(255,255,255,0.07)`.
- **Text stays high-contrast:** primary `#FFFFFF`, secondary `#D7DEE8`,
  tertiary `#A9B4C4`. Never put body text directly on a colored glow.
- **Brand neon yellow (formerly gold) is for the one primary action and the brand mark only**, not for
  backgrounds, borders of every card, or glows.
- Pages must not hard-code their own page background (`#0a0a0a`, `#0d1117`,
  `#141416`, amber gradients…). Use the tokens (`var(--bg-base)`,
  `var(--bg-surface)`, `var(--bg-surface-2)`) or the kit `Card` / `.k-card`.

## 7. Palette — jet black + glass + neon yellow (owner decision 2026-10-02)
One palette, uniform end to end. The values live in `app/globals.css` `:root`
(CSS), `lib/design-tokens.ts` (`colors`) and `lib/status-colors.ts` (status).
Pages reference the TOKEN, never the hex. Neon yellow **replaces gold** everywhere.

### Brand (white-label override point — `--gold*` aliases track these)
| Token | Value | Use |
|---|---|---|
| `--brand-primary` | `#FFE600` | The one primary action, active nav, focus ring, brand mark |
| `--brand-primary-strong` | `#FFF04A` | Top of the primary-button gradient, hover |
| `--brand-primary-hover` | `#E6CF00` | Bottom of the gradient, pressed |
| `--brand-primary-08` / `-12` / `-18` / `-25` / `-35` | `rgba(255,230,0,.08/.12/.18/.25/.35)` | Tints, rings, active-row wash |
| `--on-brand` | `#0A0A00` | Text and icons drawn ON a yellow fill — never white |

### Surfaces (§6)
| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#000000` | Page background (jet black) |
| `--bg-surface` | `rgba(255,255,255,0.045)` | Glass card / panel / modal (with `--glass-blur`) |
| `--bg-surface-2` | `rgba(255,255,255,0.07)` | Raised glass: inputs, table header, secondary buttons |
| `--bg-elevated` | `rgba(22,24,29,0.92)` | Floating menus, popovers, toasts (near-opaque glass) |
| `--bg-solid` / `--bg-solid-2` | `#0E0F12` / `#15171C` | Opaque stand-ins where glass cannot show through (sticky cells, native `<select>` lists, canvas) |
| `--glass-blur` | `blur(16px) saturate(140%)` | `backdrop-filter` for every glass surface |
| `--glass-border` | `rgba(255,255,255,0.09)` | Glass edge |
| `--glass-highlight` | `inset 0 1px 0 rgba(255,255,255,0.06)` | 1px lit top edge |
| `--border-subtle` / `-default` / `-strong` | `rgba(255,255,255,.08/.12/.22)` | Hairlines |

`lib/design-tokens.ts`: `colors.dark #000000`, `darkAlt / raised / surface #0E0F12`,
`raisedAlt #15171C`, `glass var(--bg-surface)`, `glass2 var(--bg-surface-2)`,
`onGold var(--on-brand)`.

### Text
| Token | Value |
|---|---|
| `--text-primary` | `#FFFFFF` |
| `--text-secondary` | `#D7DEE8` |
| `--text-tertiary` | `#A9B4C4` |
| `--text-disabled` | `#7A8597` |

### Status — six meanings, one bright neon-on-black family (`lib/status-colors.ts`)
Every pill/badge: fill = hue at 16%, border = hue at 50%, text = the hue.
| Kind | Label | Color | CSS |
|---|---|---|---|
| `overdue` | Overdue | `#FF4D5E` red | `--status-overdue` |
| `lead` | Lead | `#3DA9FF` blue | `--status-lead` |
| `under_contract` | Under Contract | `#FFC53D` amber (deliberately not the lemon brand yellow) | `--status-under-contract` |
| `ongoing` | Ongoing | `#2EE59D` green | `--status-ongoing` |
| `completed` | Completed | `#FF8A3D` orange | `--status-completed` |
| `closed` | Closed | `#A3ACBB` grey | `--status-closed` |

Phase pill: **Bidding** = `lead` blue, **Building** = `ongoing` green.

### Semantic (same family)
| Token | Value |
|---|---|
| `--success` | `#2EE59D` |
| `--danger` | `#FF4D5E` |
| `--warning` | `#FFC53D` |
| `--info` | `#3DA9FF` (blue — never the brand yellow) |

### Buttons
- **Primary**: neon yellow fill (`--brand-primary`, gradient `-strong → base → -hover`), text `--on-brand`. One per screen.
- **Secondary / ghost**: glass (`--bg-surface-2` + `--glass-blur`), white text, `--glass-border`.
- **Danger**: status red — fill `rgba(255,77,94,.14)`, border `rgba(255,77,94,.45)`, text `#FF4D5E`.

Kit classes (`.k-btn-*`, `.k-badge`), the premium `Pill` / `GoldButton` /
`GhostButton` / `DangerButton`, and `components/ui/shell.tsx` `T` all read
this palette. No warm radial glows, animated aurora blobs or blueprint grids
behind text: the shared `Aurora` is now a single faint cool sheen.
