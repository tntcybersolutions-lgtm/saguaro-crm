# THE MODULE PATTERN — the law every module screen follows

*Owner directive, 2026-08-24: "MATCH MIRROR THE STYLE U DID FOR MOBILE RFI WITH DESIGN.
I WANT THAT SAME PATTERN DESIGN STRUCTURE ON ALL MODULES FOR THE PLATFORM
ESPECIALLY MOBILE BUT THE WEB AND MOBILE MUST MATCH."*

**The reference implementation is `app/rfis.tsx` in the mobile repo.** When this
document and that file disagree, that file wins — read it before building.

**Why this exists:** of 95 mobile module screens, exactly **2** (`rfis.tsx`,
`punch.tsx`) carried the full kit. The other 93 are why a GC opens the app and
says it looks like a stubbed knock-off. This spec closes that gap.

---

## THE SIX LAYERS

Every module screen has all six. A module missing one is not done.

### 1. Header with identity
Module accent color · title · **live count** of the number that matters
(open RFIs, overdue items, unbilled dollars) · primary create action in the header.
- Mobile: `<ScreenHeader title count onAdd accent={moduleAccent('x').hex} />`
- Web: `<ModuleHero accentColor eyebrow title />` with the primary action in the hero.

### 2. Control row
**Filter chips carrying live counts per status**, then **sort chips** beneath.
- Render filters only when there is more than one row; sort only when > 1 row.
- Mobile: `<FilterChips options={[{value,label,count}]} />` then `<SortChips>` +
  `useSortState(screenKey)` so the choice persists per screen.
- Web: `ListToolbar` filters + the sortable `DataTable` (`tableId` persists the sort).
- Filter/sort state persists per user per screen. Never resets on navigation.

### 3. Insight band — ONE genuinely computed metric
RFIs show **open-RFI aging** (days outstanding, warmer = older). Every module gets
the equivalent: a real number computed from that module's real rows.

**HONESTY RULE — the hard one.** The insight must be derived from actual data.
If a module has no meaningful metric, render the **status/count breakdown** instead.
**Never** invent a chart, a trend line, a benchmark, or a percentage the data cannot
support. A truthful count beats a decorative graph. If fewer than 3 rows exist,
skip the band entirely rather than charting noise.

Suggested honest metrics by module family (derive, do not fabricate):
- **Aging / turnaround** (RFIs, submittals, punch, change orders, approvals):
  days outstanding per open item.
- **Money** (invoices, pay apps, budget, commitments, direct costs, contracts):
  billed vs. remaining, retainage held, overdue dollars — all `Number()`-coerced
  because money columns are TEXT in this schema.
- **Schedule** (schedule, milestones, deliveries, look-ahead): items due this week
  vs. overdue.
- **Compliance** (insurance, lien waivers, W-9, certified payroll, safety):
  current vs. expiring vs. expired counts.
- **Volume/activity** (daily logs, photos, meetings, time): entries per day over
  the last 14 days.

### 4. The row card anatomy
In this order, every module:
1. **Identifier** (`#12`) + **status pills** (status, plus Urgent / Overdue when true)
   + **row menu** (edit / archive / restore).
2. **Title**, clamped to 2 lines.
3. **Body preview**, truncated.
4. **Derived highlight box** when the module has a "resolution" concept — the RFI
   Answer box, with **author and timestamp**. (Punch: the fix. CO: the approval.)
5. **Attribution line** — ball-in-court / assignee / vendor.
6. **Footer** — the date that matters + badges (attachments, photos).
7. **"Syncing" pill** whenever the row is a pending offline write.

Web renders the same information as table columns + an expandable row or detail
panel; the *information and its order* must match, not the pixels.

### 5. Three crafted empty states — never one generic void
- **First-run**: accented medallion icon · headline · a subtitle that TEACHES what
  the module is for · primary action button · **tappable starter chips that
  pre-fill the create form** (RFIs: common questions). Starters must be real and
  module-appropriate.
- **Filtered-empty**: different icon, "Try a different filter."
- **Archived-empty**: its own copy.
- **Loading** is a skeleton, never a blank screen.
- **Error** is inline with a Retry, never a silent blank.
- **No-project** is a *picker*, never a wall telling the user to go elsewhere.

### 6. The create sheet teaches while you type
In this order:
1. **FormHeader** — accent, icon, module eyebrow, one-line subtitle saying what
   this record does.
2. **SmartCreate StatStrip — what the system ALREADY KNOWS.** The next number and
   what it follows, the current open/overdue load, the default assignee. Real
   values from real rows.
3. **AUTO chip + FieldHint** on every pre-filled value, in plain English, saying
   *why*: "Response due in 7 days — the standard turnaround. Tap the date to
   change it." The chip flips to EDITED the moment the user overrides it.
4. **FieldGroups** — labeled, icon'd sections (Request / Routing), never a flat
   wall of inputs.
5. **FormKit primitives** — `KitInput` / `KitSelect` / `PrioritySegments` /
   `DateField` with required markers, real placeholders, helper text.
6. **Voice dictation** on every long-form text field.
7. **Unsaved-work guard** (`useUnsavedGuard`) + draft autosave on every create flow.
   Every screen already has the shell's automatic gate (below); a create flow
   adds `useUnsavedGuard` for the draft autosave and its own save handler.

---

## WHAT THE APP SHELL GIVES EVERY SCREEN — never rebuild per page

*Owner directive, 2026-10-11: "a back button easy for users to go back to prior
screen and add gates asking … save and exit or discard … fully site wide."*

- **Back** — the top bar (`components/AppTopBar.tsx`) shows a lit "‹ <where>"
  pill on every screen that has somewhere to go back to. It returns to the
  screen the user was actually on (`lib/navHistory.ts`); on the first screen of
  a tab it goes up to the parent screen. Pages do not add their own Back.
- **Unsaved-changes gate** — `components/AutoUnsavedGuard.tsx`, mounted once in
  `app/app/layout.tsx`. Any field the user changes inside a `<form>`, a dialog,
  a `.k-modal` or a `[data-guard]` block arms it; leaving by any link, the
  sidebar, a bottom tab or Back asks **Discard · Keep editing · Save and exit**
  (`components/UnsavedGuardModal.tsx`). Save and exit presses the form's own
  Save button and leaves only when the save succeeds. Closing or reloading the
  tab gets the browser's own prompt. Search boxes, filters, sort, menus, Sage
  and ⌘K never arm it. Rules (`lib/autoGuard.ts`): wrap custom editable areas
  in `data-guard`; mark a field that saves itself or is not work `data-no-guard`;
  name the save button "Save …" (or Create / Update / Submit …) so the gate can
  find it. A page's own `useUnsavedGuard` answers first when it is dirty.
- **App-shell navigation** that moves on a click handler (not a `<Link>`) uses
  `useGuardedRouter()` from `lib/navGuard.ts` so the gate can ask first.
- **Photos & video from anywhere** — `components/media/QuickMedia.tsx`: the
  camera in the middle of the phone's bottom tabs, Photos in the desktop top
  bar, ⌘K ("photo", "video"), files dropped on any page, or `?media=1` on any
  link open one sheet — Take Photo · Record Video · Choose — with **Send to**
  any job (the one you are in, else the last one used). A page never adds its
  own camera button for this; a page with its own drop zone just calls
  `preventDefault()` in its drag handlers and the shell stands aside. The job's
  Photos page viewer has **Send to Another Job** (`POST /api/media/move`).

---

## TEXT IS PEARL WHITE — every screen, every level

*Owner directive, 2026-10-11: "the dark grey font … dark, can't read, hard to
see, not alive — full site, not hunt and peck."*

- Text uses three tokens and nothing else: `--text-primary` (#FAF8F2, body and
  headings), `--text-secondary` (#E8E4D9, supporting lines, hints, labels) and
  `--text-tertiary` (#D2CDBF, the smallest captions). All three are pearl white —
  at least 11:1 on the page black. `--text-disabled` is only for disabled
  controls. (`--c-text*`, `--sg-text*` and `lib/design-tokens.ts` mirror them.)
- Hierarchy comes from **size and weight**, not from fading the colour. A line
  is never "less important" by being grey.
- A page never hard-codes a grey (`#6b7280`, `#8b949e`, `#A3ACBB`, `#D4D4D8`, …)
  or a faded `rgba(255,255,255,<0.6)` as a text colour, and a `DIM` / `MUTED`
  constant is `var(--text-secondary)`. `tools/check-design-system.mjs` rule 4
  fails the build on one — portals included, no baseline.
- Exceptions are only where grey on white is the right call: print / PDF /
  email layouts and pages that paint a white page. HTML written into a print
  window keeps hex colours — CSS variables do not exist there — and so does a
  colour drawn on a canvas or stored with a record (`paletteHex` in
  `lib/design-tokens.ts` is the hex mirror for those).
- A colour held in a variable is faded with
  `color-mix(in srgb, ${X} 25%, transparent)`, never a hex alpha glued on
  (`${DIM}40` is `var(--text-secondary)40` — invalid, the browser drops it).
  Rule 5 of the same gate fails the build on one.

## PAGE HEADER BUTTONS ON A PHONE — never cut off

- A page's header buttons (`ModuleHero` `actions`) wrap onto a second line
  under the title when they do not fit at 390px. They never scroll sideways
  out of sight: a primary button half off the edge reads as missing.
  `.pmHeadActs` in `app/globals.css` does this for every page — a page does not
  restyle its own header row.

---

## MODULE IDENTITY
One accent per module from `lib/module-identity.ts` (mirrored byte-identical on
both repos), threaded through header, medallion, chips, field groups, and pills.
Accents live on chips/badges/eyebrows — never on body text or large fills.

## WEB ↔ MOBILE PARITY
"Match" means **same anatomy, same information, same order, same accent, same
counts, same auto-fill explanations, same starter actions** — expressed through
each platform's kit (`components/ui/premium.tsx` on web, `components/FormKit` +
`SmartCreate` + `FilterChips` + `SortChips` on mobile). A GC moving from laptop to
phone must recognize one product. Pixel-identical is not the goal; recognizable
sameness is.

## WHAT "DONE" MEANS FOR A MODULE
All six layers present · every save reports honestly (never a fake success) ·
every record lands on the ACTIVE project · offline writes show a Syncing pill ·
`tsc` clean · `npm run audit` 0 new · and the insight band is computed from real
rows or absent. Anything less is not done, and must be reported as not done.
