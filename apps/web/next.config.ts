import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverActions: {
    allowedOrigins: ['localhost:4000'],
  },
};

export default nextConfig;
