import type { NextConfig } from "next";
import path from "node:path";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "1",
  register: true,
  cacheOnFrontEndNav: true, // recently viewed spaces stay readable offline
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: { document: "/offline" },
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Listing photos: cache-first, they never change at a given URL.
        urlPattern: ({ url }) => url.hostname === "res.cloudinary.com" || url.pathname.startsWith("/uploads/"),
        handler: "CacheFirst",
        options: { cacheName: "listing-media", expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 } },
      },
      {
        // Space detail pages: network first, fall back to the last copy when offline.
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/spaces/"),
        handler: "NetworkFirst",
        options: { cacheName: "spaces", networkTimeoutSeconds: 4, expiration: { maxEntries: 60, maxAgeSeconds: 14 * 24 * 3600 } },
      },
    ],
  },
});

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the project root so stray package-lock.json files in parent folders don't confuse tracing.
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Local upload stand-in: files added after the build aren't in the static /public snapshot.
  // Rewrites run after the filesystem check, so files present at build time are still served directly.
  async rewrites() {
    return [{ source: "/uploads/:name", destination: "/api/uploads/local/:name" }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
