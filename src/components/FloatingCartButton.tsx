"use client";

import { ShoppingBagIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function FloatingCartButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const { totalItems, totalAmount } = useCartTotals();

  if (
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/success") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  if (totalItems === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-30 flex justify-center md:bottom-8",
        className,
      )}
    >
      <Button
        type="button"
        onClick={() => setCartOpen(true)}
        className={cn(
          "bg-cta-gradient pointer-events-auto h-12 gap-3 rounded-full px-6 font-semibold text-primary-foreground shadow-2xl shadow-cta transition-transform hover:scale-[1.02] active:scale-[0.98]",
        )}
      >
        <ShoppingBagIcon className="size-5" />
        <span>View cart · ₹{totalAmount}</span>
        <span className="rounded-full bg-primary-foreground/25 px-2 py-0.5 text-xs text-primary-foreground">
          {totalItems} items
        </span>
      </Button>
    </div>
  );
}
