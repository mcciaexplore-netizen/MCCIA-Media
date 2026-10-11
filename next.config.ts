import type { NextConfig } from 'next';

// Native `next dev` / Vercel builds do not expose Cloudflare bindings, so
// `cloudflare:workers` is aliased to a shim that reads process.env. Sites/vinext
// must keep the real built-in module so D1 and R2 remain available there.
const underVinext = process.argv.some((arg) => /vinext/i.test(arg));

const nextConfig: NextConfig = !underVinext
  ? {
      turbopack: {
        resolveAlias: {
          'cloudflare:workers': './db/cloudflare-env-shim.ts',
        },
      },
    }
  : {};

export default nextConfig;
