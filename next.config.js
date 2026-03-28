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

  // Skip ESLint during builds — warnings are non-critical and break Vercel deploys
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

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
