import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  const logo = SITE.logoPath;
  return {
    name: "KHAANZ — Fast food and restaurant",
    short_name: "KHAANZ",
    description:
      "Order fresh fast food at KHAANZ. Browse the menu and confirm on WhatsApp.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#1a1f2b",
    orientation: "portrait-primary",
    icons: [
      {
        src: logo,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: logo,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
