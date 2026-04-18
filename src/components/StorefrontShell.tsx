"use client";

import { usePathname } from "next/navigation";

import { CartDrawer } from "@/components/CartDrawer";
import { FloatingCartButton } from "@/components/FloatingCartButton";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { MenuExploreProvider } from "@/contexts/menu-explore-context";
import { RestaurantSettingsProvider } from "@/contexts/restaurant-settings-context";
import { Providers } from "@/components/providers";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  if (isAdmin) {
    return (
      <Providers>
        <RootErrorBoundary>{children}</RootErrorBoundary>
      </Providers>
    );
  }

  return (
    <Providers>
      <RootErrorBoundary>
        <RestaurantSettingsProvider>
          <MenuExploreProvider>
            {children}
            <CartDrawer />
            <FloatingCartButton />
            <MobileBottomNav />
          </MenuExploreProvider>
        </RestaurantSettingsProvider>
      </RootErrorBoundary>
    </Providers>
  );
}
