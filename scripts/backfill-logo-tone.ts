/* LOGO TONE BACKFILL — one-time, safe to re-run.
 *
 * app/api/branding/logo/route.ts now measures whether an uploaded logo is dark
 * or light and stores `logo_tone` on tenants.settings, so AppSidebar can put a
 * light plate behind a dark mark instead of rendering it invisibly on the app's
 * near-black chrome.
 *
 * Logos uploaded BEFORE that existed have no tone, so they would keep looking
 * exactly as broken as they do today until someone happened to re-upload. This
 * measures the logos already in storage and writes the field.
 *
 * Re-running is a no-op for tenants that already have a tone. --force redoes
 * them. --dry-run measures and prints without writing.
 *
 *   npx tsx scripts/backfill-logo-tone.ts [--dry-run] [--force]
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import sharp from 'sharp';

const ENV_PATH = 'D:/saguaro-web/.env.local';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
/** Below this mean luma (Rec. 709, visible pixels only) a logo needs a light plate. */
const DARK_THRESHOLD = 110;

if (!fs.existsSync(ENV_PATH)) {
  console.error(`FAIL env file not found at ${ENV_PATH}. No rows were touched.`);
  process.exit(1);
}
const env = fs.readFileSync(ENV_PATH, 'utf8');
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing. No rows were touched.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

/** Mean luma over VISIBLE pixels. Averaging transparent ones drags every
 *  transparent PNG toward black and plates logos that never needed it. */
async function toneOf(bytes: Buffer): Promise<'dark' | 'light' | null> {
  const { data, info } = await sharp(bytes, { failOn: 'none' })
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let lum = 0;
  let seen = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 32) continue;
    lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    seen++;
  }
  if (!seen) return null;
  return lum / seen < DARK_THRESHOLD ? 'dark' : 'light';
}

async function main() {
  console.log(`LOGO TONE BACKFILL${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`);

  const { data: tenants, error } = await db.from('tenants').select('id, name, settings');
  if (error) {
    console.error('FAIL could not read tenants —', error.message);
    process.exit(1);
  }

  let measured = 0;
  let skipped = 0;
  let failed = 0;
  const rows = tenants ?? [];

  for (const t of rows as { id: string; name: string; settings: Record<string, unknown> | null }[]) {
    const s = t.settings ?? {};
    const url = typeof s.logo_url === 'string' ? s.logo_url : '';
    if (!url) { skipped++; continue; }
    if (s.logo_tone && !FORCE) {
      console.log(`  = ${t.name}: already ${String(s.logo_tone)}`);
      skipped++;
      continue;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const tone = await toneOf(buf);
      if (!tone) throw new Error('no visible pixels to measure');

      console.log(
        `  ${tone === 'dark' ? '*' : ' '} ${t.name}: ${tone}` +
          (tone === 'dark' ? '  -> will get a light plate in the sidebar' : ''),
      );
      measured++;
      if (DRY_RUN) continue;

      const { error: updErr } = await db
        .from('tenants')
        .update({ settings: { ...s, logo_tone: tone }, updated_at: new Date().toISOString() } as never)
        .eq('id', t.id);
      if (updErr) throw new Error(updErr.message);
    } catch (e: unknown) {
      // An SVG sharp cannot rasterise, or an unreachable URL. Leaving the tone
      // unset is safe: the sidebar falls back to its neutral treatment.
      failed++;
      console.log(`  ! ${t.name}: could not measure — ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    `\n${failed ? 'COMPLETED WITH SKIPS' : 'PASSED'} — ${measured} measured, ${skipped} skipped, ${failed} unmeasurable, ${rows.length} tenant(s) scanned`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL', e?.message ?? e);
  process.exit(1);
});
