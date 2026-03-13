const fs = require('fs');
const path = require('path');

// New SVG back button content (replaces the text "← Back")
// Also update backBtn/bkBtn style constants for proper tap target

const BACK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>`;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Replace the backBtn style constant - fix tap target and flex display
  content = content.replace(
    /const backBtn: React\.CSSProperties = \{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '[^']*', display: 'block' \};/g,
    `const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };`
  );

  // Also handle the bkBtn variant in more/page.tsx
  content = content.replace(
    /const bkBtn: React\.CSSProperties = \{ background: 'none', border: 'none', color: DIM, fontSize: 14, cursor: 'pointer', padding: '[^']*', display: 'block' \};/g,
    `const bkBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };`
  );

  // Replace ← Back text in buttons
  content = content.replace(/>← Back to Drawings<\/button>/g, `>${BACK_SVG}<\/button>`);
  content = content.replace(/>← Back to list<\/button>/g, `>${BACK_SVG}<\/button>`);
  content = content.replace(/>← Back<\/button>/g, `>${BACK_SVG}<\/button>`);

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed back buttons:', filePath);
  }
}

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.tsx')) {
      processFile(fullPath);
    }
  }
}

processDir('app/field');
console.log('Back button fix done.');
