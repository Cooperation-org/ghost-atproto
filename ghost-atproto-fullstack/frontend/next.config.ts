import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/bridge',
  assetPrefix: '/bridge',
  // Fix workspace root detection to prevent lockfile warnings
  outputFileTracingRoot: __dirname,
  webpack: (config, { isServer }) => {
    // Add polyfills for crypto APIs
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
      };
    }
    return config;
  },
  // Ensure static assets are properly served
  trailingSlash: false,
  // Optimize static file serving
  images: {
    unoptimized: true, // Disable Next.js image optimization for better compatibility
  },
};

export default nextConfig;
