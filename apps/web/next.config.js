/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ksai-exam/ui", "@ksai-exam/types"],
  eslint: {
    // Allow production builds to successfully complete even if ESLint errors are present
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds to successfully complete even if TypeScript errors are present
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://13.53.207.48/api/v1',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  images: {
    domains: ['localhost', 'your-domain.com', 'your-ec2-domain.com'],
    unoptimized: true, // For better compatibility
  },
  // Enable React strict mode
  reactStrictMode: true,
  // Optimize for production
  productionBrowserSourceMaps: false,
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
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
            key: 'Content-Security-Policy',
            value: "upgrade-insecure-requests; connect-src 'self' https: wss: ws:; default-src 'self' https: data: blob:; script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:;",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig;