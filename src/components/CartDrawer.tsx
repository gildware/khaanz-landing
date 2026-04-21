"use client";

import Link from "next/link";
import { Trash2Icon } from "lucide-react";

import { MenuItemImage } from "@/components/MenuItemImage";
import { QuantitySelector } from "@/components/QuantitySelector";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";
import { useCartStore } from "@/store/cartStore";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function CartDrawer() {
  const open = useUIStore((s) => s.cartOpen);
  const setOpen = useUIStore((s) => s.setCartOpen);
  const items = useCartStore((s) => s.items);
  const increaseQty = useCartStore((s) => s.increaseQty);
  const decreaseQty = useCartStore((s) => s.decreaseQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const { totalAmount } = useCartTotals();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="flex max-h-[88dvh] flex-col rounded-t-3xl border-t border-border bg-popover/95 p-0 backdrop-blur-xl"
      >
        <SheetHeader className="border-b border-border/70 px-4 py-3 text-left">
          <SheetTitle className="font-heading text-lg">Your order</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <EmptyCartInline />
          ) : (
            <ul className="space-y-4">
              {items.map((line) => (
                <li
                  key={line.lineId}
                  className="flex gap-3 rounded-2xl border border-border bg-muted/20 p-3"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                    {isCartOpenLine(line) ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground font-medium">
                        Open
                      </div>
                    ) : (
                      <MenuItemImage
                        src={line.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{line.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {isCartComboLine(line) ? (
                        <>
                          Combo · {line.componentSummary}
                        </>
                      ) : isCartOpenLine(line) ? (
                        <>Open item</>
                      ) : isCartItemLine(line) ? (
                        <>
                          {line.variation.name}
                          {line.addons.some((a) => a.quantity > 0) &&
                            ` · + ${line.addons
                              .filter((a) => a.quantity > 0)
                              .map((a) => `${a.name}×${a.quantity}`)
                              .join(", ")}`}
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 font-semibold text-primary text-sm tabular-nums">
                      ₹{line.unitPrice} each
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QuantitySelector
                        size="sm"
                        value={line.quantity}
                        onIncrease={() => increaseQty(line.lineId)}
                        onDecrease={() => decreaseQty(line.lineId)}
                        min={0}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(line.lineId)}
                        aria-label="Remove item"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="shrink-0 self-start font-semibold tabular-nums">
                    ₹{line.unitPrice * line.quantity}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <>
            <Separator className="bg-border" />
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-center justify-between text-lg">
                <span className="text-muted-foreground">Grand total</span>
                <span className="font-heading text-2xl font-bold text-primary tabular-nums">
                  ₹{totalAmount}
                </span>
              </div>
              <Link
                href="/checkout"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-cta-gradient h-12 w-full rounded-full border-0 font-semibold text-lg text-primary-foreground shadow-lg shadow-cta",
                )}
                onClick={() => setOpen(false)}
              >
                Proceed to checkout
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyCartInline() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex size-24 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border">
        <svg
          className="size-12 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          aria-hidden
        >
          <path d="M6 7h15l-1.5 9h-12z" />
          <path d="M6 7 5 3H2" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </svg>
      </div>
      <p className="font-heading font-semibold">Your cart is empty</p>
      <p className="mt-1 max-w-xs text-muted-foreground text-sm">
        Add something delicious — chefs are standing by.
      </p>
    </div>
  );
}
