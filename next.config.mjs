/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'inrveiaulksfmzsbyzqj.supabase.co',
        pathname: '/storage/v1/object/public/images/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent bundling optional/native packages that are not available in the Vercel environment
      // and are not needed at runtime for our API handlers.
      const externals = [
        'playwright',
        'playwright-core',
        'electron',
        'chromium-bidi',
      ];

      // Preserve any existing externals array/function
      if (Array.isArray(config.externals)) {
        config.externals = [...config.externals, ...externals];
      } else if (typeof config.externals === 'function') {
        const origExternals = config.externals;
        config.externals = async (ctx, req, cb) => {
          if (externals.includes(req)) return cb(null, 'commonjs ' + req);
          return origExternals(ctx, req, cb);
        };
      } else {
        config.externals = externals;
      }

      // Ensure webpack doesn't try to polyfill/resolve these in server bundle
      config.resolve = config.resolve || {};
      // Alias 'playwright' to 'playwright-core' to satisfy imports without bundling browsers
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        playwright: 'playwright-core',
      };
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        electron: false,
        'chromium-bidi': false,
      };
    }
    return config;
  },
};

export default nextConfig;
