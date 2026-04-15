/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['admin.playtailtag.com', 'localhost:3000'],
    },
  },
};

export default nextConfig;
