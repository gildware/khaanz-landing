import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { MenuDataProvider } from "@/contexts/menu-data-context";
import { StorefrontShell } from "@/components/StorefrontShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Khaanz — Order fresh food",
  description:
    "Mobile-first restaurant ordering. Browse the menu, customize dishes, and send your order on WhatsApp.",
  applicationName: "Khaanz",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Khaanz",
  },
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#b91c1c",
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
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-[100dvh] antialiased`}
      >
        <MenuDataProvider>
          <StorefrontShell>{children}</StorefrontShell>
        </MenuDataProvider>
      </body>
    </html>
  );
}
