export const meta = {
  name: 'light-flip-audit-new',
  description: 'Audit the 39 newly-flipped shell/homepage/network/design/field files',
  phases: [{ title: 'Audit' }],
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    files: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        file: { type: 'string' },
        issues: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['dark-bg', 'low-contrast-text', 'dark-asset', 'dark-gradient', 'other'] },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            snippet: { type: 'string' }, suggestedFix: { type: 'string' }, why: { type: 'string' },
          }, required: ['kind', 'severity', 'snippet', 'suggestedFix', 'why'],
        } },
      }, required: ['file', 'issues'],
    } },
  }, required: ['files'],
}

const ROOT = 'C:/Users/Public/saguaro-deploy/'
const REL = [
  'app/field/page.tsx', 'app/field/layout.tsx', 'app/field/forms/page.tsx', 'app/field/drone/page.tsx',
  'app/field/trade-guide/page.tsx', 'app/portals/client/page.tsx', 'app/portals/owner/page.tsx',
  'app/portals/sub/page.tsx', 'app/portals/subcontractor/page.tsx', 'app/portals/w9/page.tsx',
  'app/portals/sign/page.tsx', 'app/portals/page.tsx', 'app/app/projects/[projectId]/network/config/page.tsx',
  'components/SaguaroChatWidget.tsx', 'components/field/SwipeAction.tsx',
  'app/app/compliance/lien-deadlines/page.tsx', 'app/app/compliance/prevailing-wage/page.tsx',
  'app/app/customers/page.tsx', 'app/app/intelligence/command-center/page.tsx',
  'app/app/projects/[projectId]/network/cables/page.tsx', 'app/app/projects/[projectId]/network/devices/page.tsx',
  'app/app/projects/[projectId]/network/firewall/page.tsx', 'app/app/projects/[projectId]/network/page.tsx',
  'app/app/projects/[projectId]/network/reports/page.tsx', 'app/app/projects/[projectId]/network/vlans/page.tsx',
  'app/app/projects/[projectId]/network/wizard/page.tsx', 'app/design/discover/page.tsx',
  'app/design/materials/page.tsx', 'app/design/packages/page.tsx', 'app/design/roi/page.tsx',
  'app/design/sage/page.tsx', 'app/field/bim-viewer/page.tsx', 'app/field/escalations/page.tsx',
  'app/field/laser/page.tsx', 'app/field/leaderboard/page.tsx', 'app/field/safety-talks/page.tsx',
  'app/field/saved-views/page.tsx', 'app/page.tsx', 'components/field/VoiceMemoButton.tsx',
]
const files = REL.map(r => ROOT + r)
const BATCH = 8
const batches = []
for (let i = 0; i < files.length; i += BATCH) batches.push(files.slice(i, i + BATCH))
log(`Auditing ${files.length} newly-flipped files in ${batches.length} batches`)

function prompt(batch) {
  return `These React/Next.js files were just converted from a DARK theme to Apple LIGHT by codemods. Find ONLY residual issues the codemods missed.
Correct light palette: page #F2F2F7, cards #FFFFFF, border #E5E5EA, primary text #1C1C1E, dim text #6E6E73, gold #C8881C. Accent colors (red/green/blue/purple/amber) are fine on light — do NOT flag them. Tooltips, photo-overlay buttons, and modal/sheet backdrops are allowed to stay dark.

Read each file fully:
${batch.map(f => `- ${f}`).join('\n')}

Report a finding ONLY for genuine problems on a light theme:
- dark-bg: a surface/section/hero still dark (any color form: rgb/rgba low values, hsl, named, dark hex, dark gradient stop).
- low-contrast-text: text/icon that is near-white or too-pale to read on a light surface (incl. white text on a white/light fill). White text on a saturated accent button is fine.
- dark-asset: an <img>/logo/svg that assumes a dark bg (mixBlendMode screen, white logo) now washed/invisible on light.
- dark-gradient / other.

Give the EXACT offending substring (snippet, <=120 chars, copyable) and a suggestedFix substring using the light palette. Empty issues array if a file is clean. Be precise; avoid false positives. Return all files in the batch.`
}

const results = await parallel(batches.map((b, i) =>
  () => agent(prompt(b), { label: `audit:${i + 1}`, phase: 'Audit', schema: SCHEMA })))

const byFile = []; let total = 0
for (const r of results.filter(Boolean)) for (const f of (r.files || [])) if (f.issues?.length) { byFile.push(f); total += f.issues.length }
log(`Done: ${byFile.length} files with issues, ${total} findings`)
return { filesWithIssues: byFile, totalIssues: total }
