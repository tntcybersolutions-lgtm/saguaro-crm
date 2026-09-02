#!/usr/bin/env node
/* One-shot: drop backdrop-filter from the sites audit-render-cost flags as
   per-row or behind-opaque. The surface color stays exactly as it was — only
   the compositing layer goes. Line numbers come from the audit run. */
const fs = require('fs');

const TARGETS = {
  'components/signal-studio/Designer.tsx': [2340],
  'app/design/roi/page.tsx': [534, 535],
  'app/field/bim-viewer/page.tsx': [616],
  'app/field/drone/page.tsx': [826],
  'app/field/escalations/page.tsx': [269, 270],
  'app/field/laser/page.tsx': [634],
  'app/field/saved-views/page.tsx': [387, 388],
  'app/portals/client/page.tsx': [49],
  'app/portals/sub/page.tsx': [49],
  'app/portals/w9/page.tsx': [17],
  'app/portals/page.tsx': [24],
};

/* A declaration is `key: <value>,` where the value may hold a ternary with
   quoted strings. Stop at the comma that is not inside quotes or parens. */
function stripDecl(line) {
  let out = line;
  for (;;) {
    const m = out.match(/(?:Webkit)?[bB]ackdropFilter\s*:/);
    if (!m) break;
    let i = m.index + m[0].length;
    let depth = 0, q = null;
    while (i < out.length) {
      const c = out[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; }
      else if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { i++; break; }
      else if ((c === '}' || c === '\n') && depth === 0) break;
      i++;
    }
    out = out.slice(0, m.index) + out.slice(i);
    out = out.replace(/\s+$/, (t) => (/\r/.test(t) ? '\r' : ''));
    out = out.replace(/(\S)\s{2,}/g, '$1 ');
  }
  return out;
}

let removed = 0;
for (const [file, lines] of Object.entries(TARGETS)) {
  const src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const arr = src.split(/\r?\n/);
  const drop = new Set();
  for (const ln of lines) {
    const before = arr[ln - 1];
    if (before === undefined || !/backdropFilter/i.test(before)) {
      console.log(`  MISS  ${file}:${ln}  no backdropFilter on that line`);
      continue;
    }
    const after = stripDecl(before);
    /* If the declaration was the whole line, drop the line rather than leave
       an empty one behind. */
    if (!after.trim()) drop.add(ln - 1);
    else arr[ln - 1] = after;
    removed++;
  }
  const next = arr.filter((_, i) => !drop.has(i)).join(eol);
  fs.writeFileSync(file, next);
  console.log(`  ok    ${file}  (${lines.length} site${lines.length > 1 ? 's' : ''})`);
}
console.log(`\n  declarations removed: ${removed}`);
