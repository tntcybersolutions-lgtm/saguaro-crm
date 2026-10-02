# Competitor gap audit — the sales-rep role

**Scope:** what a *salesperson* at a GC/specialty contractor gets in the market
leaders vs. what Saguaro gives them today. Focused on the sales/CRM half
("winning the work"), not the build half.

**Method & honesty note:** the Saguaro column is from reading this codebase
(Oct 2026). The competitor columns are from general product knowledge of
JobTread, Procore, and Buildertrend as of early 2026 — this container has no
outbound web access to re-verify their current feature lists, so treat specific
competitor claims as "last known," not freshly scraped. Where unsure, it says so.

---

## The one-line read

Saguaro's sales side is **more complete than it looks** — a lot shipped but sat
unsurfaced (the nav split, the deal page, profit). After this sales-workspace
work the rep now has a real home, a stage-bar deal page, profit, follow-ups,
and send-to-GC. The remaining true gaps vs the leaders are **universal search**,
**customer reviews/reputation**, **a unified media/doc hub for the rep**, and
**e-sign on proposals** — plus polish on mobile capture.

---

## Feature-by-feature

| Capability | JobTread | Procore | Buildertrend | **Saguaro today** | Gap? |
|---|---|---|---|---|---|
| Rep lands on a sales dashboard | ✅ | ~ (PM-centric) | ✅ | ✅ `/app/sales` (new) | closed |
| Visual pipeline / stage board | ✅ | ✅ (CRM add-on) | ✅ | ✅ leads board + deal page stage bar | closed |
| Per-deal page w/ one-click stage move | ✅ | ✅ | ✅ | ✅ (new) | closed |
| Win → create job w/o re-keying | ✅ | ✅ | ✅ | ✅ convert handoff (Path 13) | closed |
| Follow-up/task reminders at a glance | ✅ | ✅ | ✅ | ✅ overdue/today/week | closed |
| Profit / margin per job | ✅ | ✅ | ✅ | ✅ booked-profit panel (new) | closed |
| Estimating / takeoff | ✅ | ✅ | ✅ | ✅ Takeoff Studio | closed |
| Proposals / bid docs | ✅ | ✅ | ✅ | ✅ proposal + bid packages | closed |
| **E-signature on proposals** | ✅ | ✅ | ✅ | ⚠️ PDF + send, no in-app e-sign | **gap** |
| Email/message the GC/owner from the deal | ✅ | ✅ | ✅ | ✅ Send-to-GC (new) | closed |
| Client/owner portal | ✅ | ✅ | ✅ | ✅ client + sub portals | closed |
| Document management + PDF view | ✅ | ✅ (strong) | ✅ | ✅ docs + PDF viewers | closed |
| **Universal search across everything** | ✅ | ✅ (strong) | ~ | ⚠️ ⌘K nav only, no content search | **gap** |
| **Customer reviews / reputation** | ✅ (reviews + referrals) | ~ | ✅ (reviews) | ❌ none | **gap** |
| Photo/file capture on mobile | ✅ | ✅ | ✅ | ✅ photos + files (Capacitor app) | ~ polish |
| **Unified media/doc hub for the rep** | ✅ | ✅ | ✅ | ⚠️ scattered per-project | **gap** |
| Reporting (win rate, revenue, activity) | ✅ | ✅ | ✅ | ✅ `/app/reports` + sales overview | closed |
| Add reps + role permissions | ✅ | ✅ (granular) | ✅ | ✅ AccessManager (RBAC) | closed |
| Bid/win-probability scoring | ~ | ~ | ❌ | ✅ Bid Intelligence | **ahead** |
| Lien waivers / compliance | ~ | ✅ | ~ | ✅ full | at/ahead |
| Franchise/multi-site rollout (Command Center) | ❌ | ~ | ❌ | ✅ | **ahead** |

Legend: ✅ has it · ~ partial/add-on/uncertain · ❌ absent · ⚠️ Saguaro partial.

---

## The real gaps to close (priority order)

1. **Universal content search.** The leaders let a rep type a name and find the
   lead, the job, the customer, the document, the photo — anywhere. Saguaro has
   a ⌘K palette that navigates and per-scope search endpoints, but no single
   cross-entity search. *Build: a `/api/search` that spans lead_pipeline,
   projects, customer_profiles, documents, photos (tenant-scoped, permission-
   aware) + a top-bar result UI.*

2. **Customer reviews / reputation.** Fully absent, and it's table stakes for
   JobTread/Buildertrend on the sales side (reviews drive referrals). *Build: a
   `reviews` table + capture + display, tied to customer/project.*

3. **Unified media/doc hub for the rep.** Capture + storage exist but are
   scattered per project. A rep wants one place to take/upload photos, files,
   docs, and videos against a deal/job and find them — with symmetric
   download ("up = down"). *Build: a media view that lists + uploads + downloads
   against a deal/job, reusing FileDropzone + the signed-URL storage layer.*

4. **E-signature on proposals.** PDFs can be generated and sent, but signing is
   out-of-band. The leaders close in-app. *Later: an e-sign step on proposals.*

## Where Saguaro is already ahead

Bid win-probability scoring, the franchise Command Center, and depth on lien
waivers / compliance exceed what the mainstream sales tools offer — worth
leaning on in positioning.

---

_Next actions from this audit are tracked as the sales-workspace build: universal
search, reviews, and the media/doc hub are queued in that order._
