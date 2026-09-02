export const meta = {
  name: 'light-flip-audit',
  description: 'Audit flipped pages for residual dark-theme issues after dark->light codemod',
  phases: [{ title: 'Audit', detail: 'parallel readers over batches of flipped files' }],
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['dark-bg', 'low-contrast-text', 'dark-asset', 'dark-gradient', 'other'] },
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                snippet: { type: 'string', description: 'exact offending code substring, <=120 chars' },
                suggestedFix: { type: 'string', description: 'exact replacement substring for the snippet' },
                why: { type: 'string', description: 'one short clause' },
              },
              required: ['kind', 'severity', 'snippet', 'suggestedFix', 'why'],
            },
          },
        },
        required: ['file', 'issues'],
      },
    },
  },
  required: ['files'],
}

const ROOT = 'C:/Users/Public/saguaro-deploy/'
const REL = ["app/app/approval-workflows/page.tsx","app/app/autopilot/page.tsx","app/app/bids/page.tsx","app/app/bids/score/page.tsx","app/app/billing/page.tsx","app/app/certified-payroll/page.tsx","app/app/client-portal/page.tsx","app/app/compliance/page.tsx","app/app/custom-fields/page.tsx","app/app/dashboard-config/page.tsx","app/app/document-versions/page.tsx","app/app/documents/page.tsx","app/app/estimate-builder/page.tsx","app/app/integrations/api-docs/page.tsx","app/app/integrations/page.tsx","app/app/integrations/quickbooks/page.tsx","app/app/intelligence/page.tsx","app/app/leads/page.tsx","app/app/loading.tsx","app/app/notification-settings/page.tsx","app/app/notifications/page.tsx","app/app/portals/page.tsx","app/app/prequalification/page.tsx","app/app/projects/[projectId]/bid-packages/[id]/page.tsx","app/app/projects/[projectId]/bid-packages/page.tsx","app/app/projects/[projectId]/bills/page.tsx","app/app/projects/[projectId]/budget/page.tsx","app/app/projects/[projectId]/cash-flow/loading.tsx","app/app/projects/[projectId]/cash-flow/page.tsx","app/app/projects/[projectId]/change-orders/page.tsx","app/app/projects/[projectId]/contracts/page.tsx","app/app/projects/[projectId]/daily-logs/page.tsx","app/app/projects/[projectId]/drawings/page.tsx","app/app/projects/[projectId]/inspections/page.tsx","app/app/projects/[projectId]/insurance/page.tsx","app/app/projects/[projectId]/intelligence/page.tsx","app/app/projects/[projectId]/invoices/page.tsx","app/app/projects/[projectId]/layout.tsx","app/app/projects/[projectId]/lien-waivers/page.tsx","app/app/projects/[projectId]/loading.tsx","app/app/projects/[projectId]/network/wifi/page.tsx","app/app/projects/[projectId]/overview/page.tsx","app/app/projects/[projectId]/pay-apps/[id]/page.tsx","app/app/projects/[projectId]/pay-apps/new/page.tsx","app/app/projects/[projectId]/pay-apps/page.tsx","app/app/projects/[projectId]/payroll/page.tsx","app/app/projects/[projectId]/photos/page.tsx","app/app/projects/[projectId]/proposal/page.tsx","app/app/projects/[projectId]/punch-list/page.tsx","app/app/projects/[projectId]/schedule/page.tsx","app/app/projects/[projectId]/selections/page.tsx","app/app/projects/[projectId]/submittals/page.tsx","app/app/projects/[projectId]/subs/page.tsx","app/app/projects/[projectId]/takeoff/estimate/loading.tsx","app/app/projects/[projectId]/takeoff/estimate/page.tsx","app/app/projects/[projectId]/team/page.tsx","app/app/projects/new/page.tsx","app/app/reports-builder/page.tsx","app/app/reports/page.tsx","app/app/resource-planning/page.tsx","app/app/roles-permissions/page.tsx","app/app/settings/page.tsx","app/app/sub-portal/page.tsx","app/app/takeoff/assemblies/loading.tsx","app/app/takeoff/assemblies/page.tsx","app/app/warranty-claims/page.tsx","app/bids/page.tsx","app/compare/page.tsx","app/compare/procore/page.tsx","app/field-app/page.tsx","app/field/activity/page.tsx","app/field/ar-overlay/page.tsx","app/field/bids/page.tsx","app/field/budget/page.tsx","app/field/change-orders/page.tsx","app/field/chat/page.tsx","app/field/clock/page.tsx","app/field/closeout/page.tsx","app/field/commissioning/page.tsx","app/field/contacts/page.tsx","app/field/contracts/page.tsx","app/field/coordination/page.tsx","app/field/correspondence/page.tsx","app/field/crew-map/page.tsx","app/field/daily-log/page.tsx","app/field/deliveries/page.tsx","app/field/delivery/page.tsx","app/field/directory/page.tsx","app/field/docs/page.tsx","app/field/drawings/page.tsx","app/field/equipment/page.tsx","app/field/favorites/page.tsx","app/field/floor-plan/page.tsx","app/field/incidents/page.tsx","app/field/inspect/page.tsx","app/field/install/page.tsx","app/field/invoices/page.tsx","app/field/loading.tsx","app/field/log/page.tsx","app/field/meetings/page.tsx","app/field/more/notifications/page.tsx","app/field/more/page.tsx","app/field/notifications/page.tsx","app/field/observations/page.tsx","app/field/permits/page.tsx","app/field/photos/page.tsx","app/field/prequalification/page.tsx","app/field/punch-list/page.tsx","app/field/punch/page.tsx","app/field/purchase-orders/page.tsx","app/field/qr/page.tsx","app/field/resource-planning/page.tsx","app/field/rfi/page.tsx","app/field/rfis/page.tsx","app/field/room-progress/page.tsx","app/field/safety/page.tsx","app/field/sage/page.tsx","app/field/schedule/page.tsx","app/field/search/page.tsx","app/field/selections/page.tsx","app/field/specs/page.tsx","app/field/submittals/page.tsx","app/field/timesheets/page.tsx","app/field/tm-tickets/page.tsx","app/field/todos/page.tsx","app/field/warranty-claims/page.tsx","app/field/waste/page.tsx","app/forgot-password/page.tsx","app/get-the-app/page.tsx","app/how-to-get-started/page.tsx","app/industry/page.tsx","app/intelligence/page.tsx","app/layout.tsx","app/login/page.tsx","app/onboarding/step-1/page.tsx","app/onboarding/step-2/page.tsx","app/onboarding/step-3/page.tsx","app/onboarding/step-4/page.tsx","app/owner-portal/approve/[token]/page.tsx","app/portals/client/[token]/page.tsx","app/portals/client/login/page.tsx","app/portals/owner/[token]/page.tsx","app/portals/sub/[token]/page.tsx","app/portals/sub/login/page.tsx","app/portals/w9/[token]/page.tsx","app/privacy/page.tsx","app/reports/page.tsx","app/reset-password/page.tsx","app/roi-calculator/page.tsx","app/sandbox/page.tsx","app/security/page.tsx","app/signup/page.tsx","app/sla/page.tsx","app/switch-from-procore/page.tsx","app/terms/page.tsx","app/welcome/page.tsx","components/AuditTimeline.tsx","components/BidPackageWizard.tsx","components/BulkActionBar.tsx","components/CityLandingPage.tsx","components/CommandPalette.tsx","components/CompetitorComparePage.tsx","components/DragHandle.tsx","components/ESignatureFlow.tsx","components/ErrorBoundary.tsx","components/GlobalShortcuts.tsx","components/IndustryLandingPage.tsx","components/MarketingNav.tsx","components/NotificationBell.tsx","components/NotificationCenter.tsx","components/PhotoEditor.tsx","components/PresenceIndicator.tsx","components/ProjectSwitcher.tsx","components/SageV6Chat.tsx","components/SaguaroDatePicker.tsx","components/SignaturePad.tsx","components/ThemeToggle.tsx","components/field/OfflineSyncStatus.tsx","components/field/PhotoAnnotator.tsx","components/field/PhotoEditor.tsx","components/field/SearchFilter.tsx","components/field/VoiceToLog.tsx","components/ui/BottomSheet.tsx"]
const files = REL.slice(80).map(r => ROOT + r)
const BATCH = 8
const batches = []
for (let i = 0; i < files.length; i += BATCH) batches.push(files.slice(i, i + BATCH))
log(`Auditing ${files.length} files in ${batches.length} batches`)

function prompt(batch) {
  return `You are auditing React/Next.js page files that were just converted from a DARK theme to an Apple LIGHT theme by a hex-replacement codemod. Your job: find ONLY the residual issues the codemod missed.

The CORRECT Apple light palette is:
- page background #F2F2F7, cards/panels #FFFFFF, hairline border #E5E5EA
- primary text #1C1C1E, secondary/dim text #6E6E73, faint #AEAEB2
- brand gold #C8881C; accent colors (red #FF3B30, green #34C759, blue #007AFF, purple #AF52DE, amber #FF9500) are FINE on light — do NOT flag them.

Read each of these files in full:
${batch.map(f => `- ${f}`).join('\n')}

Report a finding ONLY for genuine problems that remain after the flip:
1. kind "dark-bg": a background/surface still dark via a color form the hex codemod could miss — rgb()/rgba() with low values, hsl() with low lightness, named colors ('black','#000','#111'), or a dark hex not in the standard set. Inline style backgrounds, gradients, or sticky-bar scrims.
2. kind "low-contrast-text": text/icon color that is now hard to read on a LIGHT surface — near-white (#fff, #F2F2F7, #e8edf8-like), pale grays lighter than #AEAEB2, or white text on a white/very-light fill. (White text on a saturated accent button like blue/green/red is FINE — do not flag.)
3. kind "dark-asset": an <img>/logo/inline <svg> that visibly assumes a dark background — e.g. a white/light-stroke logo or wordmark, white SVG fill/stroke meant for dark, that would now be invisible/washed on a light header. Flag with the asset reference.
4. kind "dark-gradient": a gradient whose stops are still dark navy producing a dark band on a light page.
5. kind "other": anything else clearly still dark/broken for a light theme.

For each finding give: the EXACT offending substring (snippet, <=120 chars, copyable), and a suggestedFix (the exact replacement substring) using the light palette above. Keep snippet uniquely matchable.

Do NOT flag: accent colors on light, dark text (#1C1C1E/#000-ish) used as TEXT (correct on light), gold #C8881C, rgba shadows like rgba(0,0,0,.x) (shadows are fine), or anything already light. If a file is clean, return it with an empty issues array. Be precise — false positives cost more than misses here. Return all files in the batch.`
}

const results = await parallel(
  batches.map((b, idx) => () => agent(prompt(b), { label: `audit:${idx + 1}`, phase: 'Audit', schema: SCHEMA }))
)

const byFile = []
let totalIssues = 0
for (const r of results.filter(Boolean)) {
  for (const f of (r.files || [])) {
    if (f.issues && f.issues.length) { byFile.push(f); totalIssues += f.issues.length }
  }
}
log(`Audit complete: ${byFile.length} files with issues, ${totalIssues} total findings`)
return { filesWithIssues: byFile, totalIssues }
