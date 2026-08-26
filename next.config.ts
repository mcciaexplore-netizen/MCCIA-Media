import type { NextConfig } from 'next';

// Native Next/Vercel builds do not expose Cloudflare bindings. Sites/vinext
// must keep the real built-in module so D1 and R2 remain available at runtime.
const nextConfig: NextConfig = process.env.VERCEL
  ? {
      turbopack: {
        resolveAlias: {
          'cloudflare:workers': './db/cloudflare-env-shim.ts',
        },
      },
    }
  : {};

export default nextConfig;
