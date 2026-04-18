import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Khaanz — Order Fresh",
    short_name: "Khaanz",
    description: "Order delicious food for delivery. Mobile-first restaurant ordering.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#b91c1c",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
