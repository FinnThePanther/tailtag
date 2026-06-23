/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['admin.playtailtag.com', 'localhost:3000'],
    },
  },
  webpack(config) {
    config.infrastructureLogging = {
      ...(config.infrastructureLogging ?? {}),
      level: 'error',
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules\/require-in-the-middle\/index\.js/,
        message:
          /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      },
      {
        module: /node_modules\/@supabase\/(supabase-js|realtime-js)\//,
        message:
          /A Node\.js API is used \(process\.versions? at line: \d+\) which is not supported in the Edge Runtime/,
      },
    ];

    return config;
  },
};

export default nextConfig;
