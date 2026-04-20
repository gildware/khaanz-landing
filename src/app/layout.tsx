import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { CartAvailabilitySync } from "@/components/CartAvailabilitySync";
import { IOSProductionDebug } from "@/components/IOSProductionDebug";
import { ServiceWorkerUnregister } from "@/components/ServiceWorkerUnregister";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { MenuDataProvider } from "@/contexts/menu-data-context";
import { StorefrontShell } from "@/components/StorefrontShell";
import { getSiteUrl, SITE } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();
const ogTitle = `${SITE.name} — ${SITE.tagline}`;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: `${ogTitle} | Order online`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "KHAANZ",
    "Khaanz",
    "fast food",
    "restaurant",
    "order food online",
    "food delivery",
    "pickup",
    "WhatsApp order",
  ],
  authors: [{ name: SITE.name, url: siteUrl.href }],
  creator: SITE.name,
  publisher: SITE.name,
  applicationName: SITE.name,
  category: "food",
  classification: "Restaurant",
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: SITE.logoPath, sizes: "192x192", type: "image/png" },
      { url: SITE.logoPath, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: SITE.logoPath, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE.name,
  },
  formatDetection: {
    telephone: true,
    email: false,
    address: false,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: SITE.name,
    title: ogTitle,
    description: SITE.description,
    images: [
      {
        url: SITE.logoPath,
        alt: `${SITE.name} logo — ${SITE.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ogTitle,
    description: SITE.description,
    images: [SITE.logoPath],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-[100dvh] antialiased`}
      >
        <SiteJsonLd />
        <IOSProductionDebug />
        <ServiceWorkerUnregister />
        <MenuDataProvider>
          <CartAvailabilitySync />
          <StorefrontShell>{children}</StorefrontShell>
        </MenuDataProvider>
      </body>
    </html>
  );
}
