# Bid jacket end to end — every way a GC adds documents (live app, demo company)

Run 38061182499 · 20 of 25 checks passed · test job archived after the run.

| Check | Result |
|---|---|
| start a job | ✅ |
| files page: upload | ✅ |
| drawings page: sheet upload | ✅ |
| specs page: add section | ✅ |
| specs page: attach file | ✅ |
| takeoff: start | ✅ |
| takeoff: blueprint uploaded | ✅ |
| create bid package (wizard) | ✅ |
| jacket Add Document (drawing) | ✅ |
| jacket Add Document (attachment) | ✅ |
| jacket opens | ✅ |
| files-page plan (A-201) is in Drawings | ❌ found in: nowhere |
| drawings-page sheet (E-101) is in Drawings | ✅ |
| takeoff plan set is in Drawings | ✅ |
| spec section (26 05 00) is in Specifications | ❌ found in: nowhere |
| jacket-added drawing (E-401) is in Drawings | ❌ found in: attachments |
| jacket-added other file is in Attachments | ✅ |
| Instructions to bidders filled | ✅ |
| Scope filled | ✅ |
| Bid form has the 3 lines in order | ✅ |
| Insurance reads as entered (no raw JSON) | ✅ |
| Bond required shows | ✅ |
| nothing required is missing | ❌ {"complete":5,"total":6,"missing":["Specifications"]} |
| run completed | ❌ page.waitForSelector: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('text=Drawings') to be visible
    64 × locator resolved to 2 elements. Proceeding with the first one: <option value="drawing">Drawings</option>
 |
| no page errors | ✅ |

## The new jacket, divider by divider

| Divider | Count | What is in it |
|---|---|---|
| Invitation & Instructions * | 2 | Instructions to Bidders |
| Scope of Work * | 1 | Scope Narrative |
| Drawings * | 2 | E-101 — ZZ AUDIT 182499 Power Plan; ZZ AUDIT 182499 PLAN SET — ZZ AUDIT 182499 Plan Set |
| Specifications * | 0 |  |
| Bid Form * | 3 |  |
| Insurance & Bonding * | 1 | Insurance Requirements |
| Addenda | 0 |  |
| Attachments | 2 | ZZ AUDIT 182499 E-401 Panel Schedules.pdf; ZZ AUDIT 182499 Site Logistics Plan.pdf |
| Correspondence | 0 |  |

## Every existing package in the demo company (0)

| Job | Package | invitation | scope | drawings | specs | bidform | requirements | addenda | attachments | Missing |
|---|---|---|---|---|---|---|---|---|---|---|

Screens: tools/walk/jacket-shots/
