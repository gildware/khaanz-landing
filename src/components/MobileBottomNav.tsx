"use client";

import { HomeIcon, LayoutGridIcon, ShoppingCartIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartTotals } from "@/hooks/use-cart-totals";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const { totalItems } = useCartTotals();

  if (
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/success") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  const scrollToMenu = () => {
    const el = document.getElementById("menu-section");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2 py-2">
        <Link
          href="/"
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors",
            pathname === "/"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HomeIcon className="size-5" />
          Home
        </Link>
        <button
          type="button"
          onClick={scrollToMenu}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <LayoutGridIcon className="size-5" />
          Menu
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className={cn(
            "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors",
            totalItems > 0 ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ShoppingCartIcon className="size-5" />
          Cart
          {totalItems > 0 && (
            <span className="absolute top-1 right-[calc(50%-1.25rem)] flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
