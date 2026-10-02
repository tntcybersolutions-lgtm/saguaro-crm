# Handoff spec — de-feature "Score a Bid" + tuck away Autopilot

**For:** local Claude (visual pages). **Owner of backend:** cloud Claude (done).
**Branch:** `claude/finish-crm-app-McOeo`. **PULL FIRST** — cloud already added a
Close button in `app/app/bids/page.tsx` and role-seeding in `lib/default-roles.ts` +
`app/api/auth/signup/route.ts`. Don't revert those.

Rule for both tasks: **de-feature, don't delete.** Keep the code + API routes so it's
restorable. Hide/demote the entry points and fix the surrounding copy so the page stays
coherent. US English only. No AI-fluff wording. Match the existing premium UI kit
(`PremiumSurface`, `ModuleHero`, `SectionCard`, `goldButtonStyle`, etc).

---

## TASK 1 — De-feature "Score a Bid" (file: `app/app/bids/page.tsx`)

The whole Bid Center is currently framed around AI scoring. De-featuring the button
alone leaves incoherent copy. Reframe the page around **bid packages** (the real,
useful workflow GCs already use), and demote scoring to a quiet secondary tool.

1. **Header (`ModuleHero`, ~line 462–473):**
   - Change `subtitle` from `"AI-scored opportunities and active bid packages"` →
     `"Active bid packages, invites, and awards — all in one board"`.
   - Remove the primary gold **"Score a Bid"** button (`data-tour="score-bid"`, ~line 471).
   - Keep the **"Bid Intelligence"** link.
   - Make the new primary action real and useful — a **"New Bid Package"** gold button.
     Packages are created inside a project, so route it to the project picker or
     `/app/projects` (whatever the existing "create package" flow uses). If there's no
     global create flow, route to `/app/projects` with a tooltip "Open a project to start
     a package."

2. **Empty states that currently push scoring:**
   - Active-tab empty state (~line 527): drop the **"Score a Bid First"** button; keep
     **"Go to Projects"** as the single CTA.
   - History-tab empty state (~line 696–699): rewrite the copy — it currently says
     "Every scored bid lands here…". Change to speak about **recorded bid outcomes**:
     e.g. `"Bid outcomes land here. Record a win or loss on any package and your win
     rate, average margin, and pursued value build themselves."` Replace the
     **"Score a Bid"** button with **"Refresh"** only (keep the existing refresh button).

3. **Keep but tuck away the Score tool itself:**
   - Leave `showScore` state, the Score modal (~line 811+), and the `?tab=score` URL
     param working. No visible button triggers it anymore, but `/app/bids?tab=score`
     still opens it (line 123 already keys off `tabParam === 'score'`). That's the
     "tucked away, restorable" outcome.
   - Optionally add ONE low-key text link inside **Bid Intelligence** (`/app/bid-intelligence`)
     labeled "Score an opportunity (beta)" → `/app/bids?tab=score`, so it lives with the
     other AI tools rather than as a top-level CTA.

4. **Acceptance:** Bid Center header reads as a package board, no gold "Score a Bid"
   button anywhere on `/app/bids`, no empty-state copy mentions "scored bids," the
   modal still opens via `/app/bids?tab=score`, page compiles (`npx tsc --noEmit`,
   `node tools/check-style-escapes.mjs`).

---

## TASK 2 — Tuck away Autopilot (nav/placement)

Autopilot stays functional but moves out of top-level prominence into the Intelligence
area, so GCs aren't led into it by default.

Files that reference it:
- `app/app/autopilot/page.tsx` (standalone top-level page)
- `app/app/projects/[projectId]/autopilot/page.tsx` (per-project)
- `app/app/projects/[projectId]/layout.tsx` + `overview/page.tsx` (nav entries / cards)
- `app/app/settings/page.tsx` (toggle)

Do:
1. Remove Autopilot from the **primary** project phase nav / top-level sidebar. Keep the
   routes alive (don't delete the pages).
2. Surface it instead under **Intelligence** (wherever Bid Intelligence lives) as a
   secondary entry — one card or link, clearly labeled, not a default landing spot.
3. Any dashboard/overview Autopilot card: demote to a small secondary tile or move it
   under an "Intelligence" group, not a hero card.
4. Leave the settings toggle so a tenant can still enable/disable it.
5. **Acceptance:** no top-level/phase-nav Autopilot entry; it's reachable only from the
   Intelligence section and its direct URL; routes still resolve; compiles clean.

---

## When done
Commit to `claude/finish-crm-app-McOeo`, push. Cloud Claude's 2 commits (role-seeding +
Bid Close) are already on it. Then the branch merges to `main` → Vercel prod.
