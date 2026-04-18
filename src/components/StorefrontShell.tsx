"use client";

import { usePathname } from "next/navigation";

import { CartDrawer } from "@/components/CartDrawer";
import { FloatingCartButton } from "@/components/FloatingCartButton";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { MenuExploreProvider } from "@/contexts/menu-explore-context";
import { RestaurantSettingsProvider } from "@/contexts/restaurant-settings-context";
import { Providers } from "@/components/providers";

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  if (isAdmin) {
    return <Providers>{children}</Providers>;
  }

  return (
    <Providers>
      <RestaurantSettingsProvider>
        <MenuExploreProvider>
          {children}
          <CartDrawer />
          <FloatingCartButton />
          <MobileBottomNav />
        </MenuExploreProvider>
      </RestaurantSettingsProvider>
    </Providers>
  );
}
