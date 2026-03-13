const fs = require('fs');
const path = require('path');

const colorMap = [
  ['#09111A', '#07101C'],
  ['#09111a', '#07101C'],
  ['#0f1d2b', '#0D1D2E'],
  ['#0F1D2B', '#0D1D2E'],
  ['#1e3148', '#1E3A5F'],
  ['#1E3148', '#1E3A5F'],
  ['#e8edf8', '#F0F4FF'],
  ['#E8EDF8', '#F0F4FF'],
  ['#8fa3c0', '#8BAAC8'],
  ['#8FA3C0', '#8BAAC8'],
  ['#060e17', '#060C15'],
];

function replaceAll(str, pairs) {
  for (const [from, to] of pairs) {
    str = str.split(from).join(to);
  }
  return str;
}

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      const original = fs.readFileSync(fullPath, 'utf8');
      const updated = replaceAll(original, colorMap);
      if (original !== updated) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        console.log('Updated:', fullPath);
      }
    }
  }
}

processDir('app/field');
console.log('Color replacement done.');
