#!/usr/bin/env node
/**
 * tag-tour-anchors — put a data-tour on every control a walkthrough points at.
 *
 * Matching a control by its visible text is fragile in exactly the way that
 * bites in production: the Takeoff Studio drop zone is a <div>, so "Drop
 * blueprints here" found nothing; most buttons here wrap an icon plus a label,
 * so the text sits on a child of the thing you actually want to ring.
 *
 * Given a label and the file it lives in, this walks back to the enclosing
 * <button> / <Link> / <a> / <Btn> and injects the attribute there. Run once;
 * it is idempotent and skips anything already tagged.
 *
 * Dry run by default. --apply to write.
 */

const fs = require('fs');

const APPLY = process.argv.includes('--apply');

/* file, the visible label to find, the data-tour value to attach */
const TARGETS = [
  ['app/app/takeoff/page.tsx', 'Start Analysis', 'run-takeoff'],
  ['app/app/projects/[projectId]/takeoff/page.tsx', 'Start AI Analysis', 'run-takeoff'],
  ['app/app/bids/page.tsx', 'Score a Bid', 'score-bid'],
  ['app/app/daily-logs/page.tsx', 'New Log', 'new-daily-log'],
  ['app/app/schedule/page.tsx', 'New Task', 'new-task'],
  ['app/app/projects/[projectId]/rfis/page.tsx', 'Create RFI', 'create-rfi'],
  ['app/app/fleet/page.tsx', 'Add asset', 'add-asset'],
  ['app/app/projects/[projectId]/pay-apps/page.tsx', 'New Pay Application', 'new-pay-app'],
  ['app/app/invoicing/page.tsx', 'New Invoice', 'new-invoice'],
  ['app/app/portals/page.tsx', 'Invite Client', 'invite-client'],
  ['app/app/autopilot/page.tsx', 'Run Scan Now', 'run-scan'],
];

/* Tags that can carry the anchor, innermost-first when walking back. */
const OPENERS = /<(button|Link|a|Btn|GoldButton|GhostButton)(?=[\s>])/g;

function tagFor(src, textIdx) {
  /* Nearest opening tag before the label that is not already closed. */
  let best = -1;
  let m;
  OPENERS.lastIndex = 0;
  while ((m = OPENERS.exec(src)) !== null) {
    if (m.index >= textIdx) break;
    best = m.index;
  }
  return best;
}

let changed = 0;
const report = [];

for (const [file, label, tour] of TARGETS) {
  if (!fs.existsSync(file)) { report.push(`  MISSING FILE  ${file}`); continue; }
  let src = fs.readFileSync(file, 'utf8');

  if (src.includes(`data-tour="${tour}"`)) { report.push(`  already tagged  ${tour}  ${file}`); continue; }

  const textIdx = src.indexOf(label);
  if (textIdx < 0) { report.push(`  LABEL NOT FOUND  "${label}"  ${file}`); continue; }

  const open = tagFor(src, textIdx);
  if (open < 0) { report.push(`  NO ENCLOSING CONTROL  "${label}"  ${file}`); continue; }

  const tagName = (src.slice(open).match(/^<([A-Za-z][\w.]*)/) || [])[1];
  const insertAt = open + 1 + (tagName ? tagName.length : 0);
  src = src.slice(0, insertAt) + ` data-tour="${tour}"` + src.slice(insertAt);

  const line = src.slice(0, open).split('\n').length;
  report.push(`  tagged <${tagName}> data-tour="${tour}"  ${file}:${line}`);
  changed++;
  if (APPLY) fs.writeFileSync(file, src, 'utf8');
}

console.log(APPLY ? 'APPLIED' : 'DRY RUN — nothing written (pass --apply)');
console.log('');
report.forEach((r) => console.log(r));
console.log('');
console.log(`  ${changed} of ${TARGETS.length} tagged`);
