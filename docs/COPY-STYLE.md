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
- **Gold is for the one primary action and the brand mark only**, not for
  backgrounds, borders of every card, or glows.
- Pages must not hard-code their own page background (`#0a0a0a`, `#0d1117`,
  `#141416`, amber gradients…). Use the tokens (`var(--bg-base)`,
  `var(--bg-surface)`, `var(--bg-surface-2)`) or the kit `Card` / `.k-card`.
