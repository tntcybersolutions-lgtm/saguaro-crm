#!/usr/bin/env node
/**
 * Keep public/wasm/web-ifc.wasm in step with the installed web-ifc package.
 *
 * The 3D Models viewer loads the IFC parser's WebAssembly from /wasm/ (see
 * components/models/model-engine.ts → SetWasmPath('/wasm/', true)). The JS
 * glue and the .wasm must come from the same web-ifc version or Init fails
 * with a cryptic import error, so prebuild copies it from node_modules every
 * time. The copy is also committed so `next dev` works without a build.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The .wasm and the browser glue (loaded as a plain <script>, never bundled —
// bundling the 5.7 MB glue ran the Vercel build out of memory).
const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'web-ifc', 'package.json'), 'utf8'));
for (const file of ['web-ifc.wasm', 'web-ifc-api-iife.js']) {
  const src = join(root, 'node_modules', 'web-ifc', file);
  const dest = join(root, 'public', 'wasm', file);
  if (!existsSync(src)) {
    console.error(`copy-web-ifc-wasm: node_modules/web-ifc/${file} is missing — run npm install`);
    process.exit(1);
  }
  mkdirSync(dirname(dest), { recursive: true });
  const same = existsSync(dest) && Buffer.compare(readFileSync(src), readFileSync(dest)) === 0;
  if (!same) copyFileSync(src, dest);
  console.log(`copy-web-ifc-wasm: web-ifc ${version} ${same ? 'already current' : 'copied'} → public/wasm/${file}`);
}
