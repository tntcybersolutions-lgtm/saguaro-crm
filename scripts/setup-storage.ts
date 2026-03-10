/**
 * scripts/setup-storage.ts
 *
 * Creates all required Supabase Storage buckets with correct policies.
 * Run once on initial deployment.
 *
 * Run: npx tsx scripts/setup-storage.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BUCKETS = [
  {
    name:    'documents',
    public:  false,
    description: 'Pay applications, lien waivers, bonds, closeout docs',
    fileSizeLimit: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
  {
    name:    'blueprints',
    public:  false,
    description: 'Blueprint/plan uploads for AI takeoff',
    fileSizeLimit: 100 * 1024 * 1024, // 100MB — blueprints can be large
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff'],
  },
  {
    name:    'project-photos',
    public:  false,
    description: 'Field photos, daily log images, safety incident photos',
    fileSizeLimit: 20 * 1024 * 1024,  // 20MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4'],
  },
  {
    name:    'signatures',
    public:  false,
    description: 'E-signature images for lien waivers, W-9, contracts',
    fileSizeLimit: 2 * 1024 * 1024,   // 2MB
    allowedMimeTypes: ['image/png', 'image/jpeg'],
  },
];

async function setupStorage() {
  console.log('🗄️  Setting up Supabase Storage buckets...\n');

  for (const bucket of BUCKETS) {
    const { data: existing } = await supabase.storage.getBucket(bucket.name);

    if (existing) {
      console.log(`  ⏩ ${bucket.name} — already exists, skipping`);
      continue;
    }

    const { data, error } = await supabase.storage.createBucket(bucket.name, {
      public:           bucket.public,
      fileSizeLimit:    bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
    });

    if (error) {
      console.error(`  ❌ ${bucket.name} — ${error.message}`);
    } else {
      console.log(`  ✅ ${bucket.name} — created (${(bucket.fileSizeLimit / 1024 / 1024).toFixed(0)}MB limit)`);
    }
  }

  console.log('\n✅ Storage setup complete\n');
  console.log('Storage bucket summary:');
  console.log('  documents       — PDFs (G702, lien waivers, bonds)');
  console.log('  blueprints      — Blueprint uploads for AI takeoff');
  console.log('  project-photos  — Field photos and daily logs');
  console.log('  signatures      — E-signature images');
}

setupStorage().catch(err => {
  console.error('Storage setup failed:', err);
  process.exit(1);
});
