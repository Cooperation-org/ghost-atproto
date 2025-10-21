import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/bridge',
  assetPrefix: '/bridge',
  webpack: (config, { isServer }) => {
    // Add polyfills for crypto APIs
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
      };
    }
    return config;
  },
  // Add polyfills for browser APIs
  experimental: {
    esmExternals: 'loose',
  },
  // Ensure static assets are properly served
  trailingSlash: false,
  // Optimize static file serving
  images: {
    unoptimized: true, // Disable Next.js image optimization for better compatibility
  },
};

export default nextConfig;
