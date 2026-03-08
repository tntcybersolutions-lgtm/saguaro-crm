/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable strict React mode (helps catch bugs)
  reactStrictMode: true,

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
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self), microphone=(self)',
          },
        ],
      },
      // CORS headers for API routes
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        ],
      },
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

  // Experimental features
  experimental: {},

  // Production specific settings
  productionBrowserSourceMaps: false, // Disable source maps in production for security
};

module.exports = nextConfig;
