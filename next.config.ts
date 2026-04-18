import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * PWA is **off by default** (reliable on iOS / WhatsApp in-app browser).
 * Set `NEXT_PUBLIC_ENABLE_PWA=true` on Vercel only if you want install + offline.
 *
 * Remove legacy `DISABLE_PWA` — it is ignored. Do not set NEXT_PUBLIC_ENABLE_PWA unless you want PWA.
 */
const pwaEnabled = process.env.NEXT_PUBLIC_ENABLE_PWA === "true";

const withPWA = withPWAInit({
  dest: "public",
  disable: !pwaEnabled,
  register: pwaEnabled,
  fallbacks: pwaEnabled
    ? {
        document: "/offline",
      }
    : undefined,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default pwaEnabled ? withPWA(nextConfig) : nextConfig;
