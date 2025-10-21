import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NODE_ENV === 'production' ? '/bridge' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/bridge' : '',
};

export default nextConfig;
