#!/usr/bin/env node
/**
 * Bundle the 3D Models engine (three.js + loaders + components/models/model-engine.ts)
 * into public/vendor/model-engine.js with esbuild.
 *
 * Why: putting three.js and its loaders through Next's webpack build pushed the
 * Vercel build box past its memory limit (the build worker was SIGKILLed while
 * compiling). esbuild bundles the same code in under a second with a small
 * fraction of the memory. ModelViewer loads the result at runtime with
 * import(/* webpackIgnore: true *\/ '/vendor/model-engine.js') and only imports
 * TYPES from model-engine.ts, so webpack never sees three's examples.
 *
 * Runs in prebuild. The output is also committed so `next dev` works without a
 * build; prebuild regenerates it every time so it never goes stale.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'public', 'vendor', 'model-engine.js');

try {
  const result = await build({
    entryPoints: [join(root, 'components', 'models', 'model-engine.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020', 'safari15'],
    minify: true,
    legalComments: 'none',
    alias: { '@': root },
    // Type-only import; must never be bundled (the IFC parser loads as /wasm/web-ifc-api-iife.js).
    external: ['web-ifc'],
    metafile: true,
    logLevel: 'warning',
  });
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  console.log(`build-model-engine: public/vendor/model-engine.js ${(bytes / 1024).toFixed(0)} KB`);
} catch (err) {
  console.error('build-model-engine: esbuild failed', err);
  process.exit(1);
}
