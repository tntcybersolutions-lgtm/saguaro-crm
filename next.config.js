/** @type {import('next').NextConfig} */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  /* Production builds keep webpack's cache in memory only.
     The memory log (tools/build-memory.mjs) showed the build worker restoring
     the persistent cache that Vercel carries between deployments: 2.3 GB of
     raw cache buffers outside the JS heap, plus their decoded copies inside
     it, before compiling anything. Heap 3.4 GB + buffers 2.3 GB + native code
     reached the 8 GB box limit at about a minute and the worker was SIGKILLed.
     Without the disk cache the compiler never loads or re-serializes those
     buffers. The output is identical; only reuse between builds is lost.
     `next dev` keeps its normal cache. */
  webpack: (config, { dev }) => {
    if (!dev && config.cache) {
      config.cache = Object.freeze({ type: 'memory' });
    }
    return config;
  },
  experimental: {
    largePageDataBytes: 10 * 1024 * 1024,
    // A custom `webpack` function above turns Next's separate build worker off
    // by default; keep it on so the server, edge and client compilers each run
    // in a fresh process that frees its memory when it finishes.
    webpackBuildWorker: true,
    // 258 files import icons from the @phosphor-icons/react barrel (~9,000
    // modules). Without this every chunk drags the whole barrel through
    // webpack, which is what put the Vercel build box at its memory ceiling.
    // Rewrites each named import to its own file; runtime output is identical.
    optimizePackageImports: ['@phosphor-icons/react'],
    // pdfjs-dist's legacy build is a Node-native lib (used server-side by
    // /api/heatmap/parse-vector). Keep it external so it's require()'d at
    // runtime instead of bundled — avoids webpack mangling its in-process
    // worker + dynamic imports. Client-side pdfjs usage is unaffected.
    //
    // The rest are server-only libraries (API routes and lib/ helpers; none is
    // imported by a client component except xlsx, whose browser bundle is
    // unaffected). Left external they are require()'d from node_modules at run
    // time, exactly as plain Node would load them, instead of being parsed,
    // bundled and minified by webpack into the server build for every route
    // that reaches them — about 1,400 modules and 10 MB of source the server
    // compiler no longer holds in memory. Vercel's file tracing ships them
    // with each function, as it already does for pdfjs-dist, sharp and
    // @aws-sdk/client-s3 (external by default).
    serverComponentsExternalPackages: [
      'pdfjs-dist',
      '@anthropic-ai/sdk',
      '@aws-sdk/s3-request-presigner',
      'docx',
      'exceljs',
      'heic-convert',
      'pdf-lib',
      'posthog-node',
      'resend',
      'stripe',
      'web-push',
      'xlsx',
    ],
  },
  compress: true,
  generateEtags: true,
  swcMinify: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The web PWA "field app" page is retired in favor of the one native iOS app
      // (TestFlight). Point the old marketing URLs at the canonical app page.
      { source: '/field-app', destination: '/get-the-app', permanent: false },
      { source: '/field/install', destination: '/get-the-app', permanent: false },
      // AI Design Studio retired — not an offering. Send any old/indexed links home.
      { source: '/design', destination: '/', permanent: false },
      { source: '/design/:path*', destination: '/', permanent: false },
      // The legacy static marketing page quoted a different pricing model
      // ($449 "monthly", a 14-day trial, an annual license + 18% renewal).
      // Nothing links to it; send it to the one real price list.
      { source: '/marketing.html', destination: '/pricing', permanent: false },
      { source: '/api/marketing', destination: '/pricing', permanent: false },
      // Links already sitting in people's inboxes pointed at pages that never
      // existed. Send them somewhere real instead of a 404.
      { source: '/app/settings/team', destination: '/app/people?tab=access', permanent: false },
      { source: '/app/projects/:projectId/documents', destination: '/app/projects/:projectId/files', permanent: false },
      { source: '/portals/lien-waiver/:token', destination: '/portals/sub/login', permanent: false },
      { source: '/portals/sub/:id/lien-waiver', destination: '/portals/sub/login', permanent: false },
      { source: '/app/insurance', destination: '/app/compliance', permanent: false },
      /* The project index used to redirect() inside a server component, which
         answered HTTP 200 carrying <meta http-equiv="refresh" content="1;...">
         — a one-second blank frame on every entry into a job. Next degrades
         redirect() to a meta refresh once the shell has flushed, and this
         segment has a loading.tsx that always flushes first, so no amount of
         segment config fixes it. Redirecting here happens at the edge, before
         any React runs, and answers a real 307.

         The pattern excludes `new`. :projectId is a wildcard and it matched
         the literal segment in /app/projects/new, so every "New Project" and
         "Create your first project" button in the app bounced to
         /app/projects/new/overview, which resolves to the [projectId] shell
         with an id of "new", asks the API for a project called new, and shows
         "Couldn't load project — Request failed (404)". The form was
         unreachable from anywhere in the product. Any future non-id segment
         added beside app/app/projects/new/ has to be added here too. */
      {
        source: '/app/projects/:projectId((?!new$)[^/]+)',
        destination: '/app/projects/:projectId/overview',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
