/**
 * Public site URL for canonical links, Open Graph, and JSON-LD.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://yourdomain.com).
 */
export function getSiteUrl(): URL {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) {
    try {
      return new URL(fromEnv.endsWith("/") ? fromEnv.slice(0, -1) : fromEnv);
    } catch {
      /* fall through */
    }
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  return new URL("http://localhost:3000");
}

export const SITE = {
  name: "KHAANZ",
  tagline: "Fast food and restaurant",
  /** Default description for meta tags and structured data */
  description:
    "KHAANZ — fast food and restaurant. Browse the menu, customize dishes, and confirm your order on WhatsApp. Pickup and delivery.",
  /** Path under /public */
  logoPath: "/brand/khaanz-logo.png",
} as const;
