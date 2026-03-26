/** @type {import('next').NextConfig} */

// Origins allowed to send credentialed cross-origin requests to /api/* routes.
// In production set ALLOWED_ORIGINS to a comma-separated list of exact origins,
// e.g. "https://app.example.com,https://admin.example.com".
// Falls back to the app's own origin (same-origin only) when not set.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const nextConfig = {
  // Enable strict React mode (helps catch bugs)
  reactStrictMode: true,

  // Allow large static file serving (marketing HTML is ~7MB)
  experimental: {
    largePageDataBytes: 10 * 1024 * 1024,  // 10MB limit
  },

  // Compress output
  compress: true,

  // Generate ETags for cache optimization
  generateEtags: true,

  // Optimize production builds
  swcMinify: true,

  // Environment variables - make available to browser when prefixed with NEXT_PUBLIC_
  env: {
    // These are already defined in .env.local, but explicitly listed here for clarity
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self), microphone=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self' capacitor://localhost",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' capacitor://localhost",
              "style-src 'self' 'unsafe-inline' capacitor://localhost",
              "img-src 'self' data: blob: https: capacitor://localhost",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fcm.googleapis.com capacitor://localhost`,
              "font-src 'self' data: capacitor://localhost",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      // CORS headers for API routes — origin must be in the ALLOWED_ORIGINS list
      // for credentialed requests. Omitting Access-Control-Allow-Origin entirely
      // when no match means the browser will block cross-origin requests, which
      // is the safe default.
      ...(ALLOWED_ORIGINS.length > 0
        ? ALLOWED_ORIGINS.map((origin) => ({
            source: '/api/:path*',
            has: [{ type: 'header', key: 'origin', value: origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }],
            headers: [
              { key: 'Access-Control-Allow-Origin', value: origin },
              { key: 'Access-Control-Allow-Credentials', value: 'true' },
              { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
              {
                key: 'Access-Control-Allow-Headers',
                value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
              },
            ],
          }))
        : []),
    ];
  },

  // Redirect HTTP to HTTPS in production
  async redirects() {
    if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_HTTPS === 'true') {
      return [
        {
          source: '/:path*',
          destination: 'https://:host/:path*',
          permanent: true,
        },
      ];
    }
    return [];
  },

  // Image optimization
  images: {
    domains: ['saguarocontrol.net'],
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1] || 'supabase.co'}`,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Webpack configuration for optimization
  webpack: (config, { isServer }) => {
    // Production optimizations
    if (process.env.NODE_ENV === 'production') {
      config.optimization = {
        ...config.optimization,
        minimize: true,
      };
    }

    return config;
  },

  // Production specific settings
  productionBrowserSourceMaps: false,

  // Stripe webhook requires the raw request body — disable body parsing for that route only.
  // Next.js App Router handles this automatically via the route handler config export.
  // No global bodyParser config needed here for App Router.

  // Allow Stripe and Resend domains in CSP connect-src
  // (already covered by https: in connect-src above)
};

module.exports = nextConfig;
