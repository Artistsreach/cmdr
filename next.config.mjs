/** @type {import('next').NextConfig} */
const nextConfig = {
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
