import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@tiptap/react$': path.resolve(__dirname, 'src/lib/tiptapReactShim.js'),
    };

    return config;
  },
};

export default nextConfig;
