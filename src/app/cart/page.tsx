"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2Icon } from "lucide-react";

import { Header } from "@/components/Header";
import { QuantitySelector } from "@/components/QuantitySelector";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useCartStore } from "@/store/cartStore";
import { cn } from "@/lib/utils";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const increaseQty = useCartStore((s) => s.increaseQty);
  const decreaseQty = useCartStore((s) => s.decreaseQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const { totalAmount } = useCartTotals();

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <Header />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
        <h1 className="font-heading text-2xl font-bold">Cart</h1>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center">
            <p className="text-muted-foreground">Nothing here yet.</p>
            <Link
              href="/"
              className={cn(
                buttonVariants({ className: "mt-4 rounded-full" }),
              )}
            >
              Browse menu
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {items.map((line) => (
                <li
                  key={line.lineId}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-card/40 p-3 backdrop-blur-sm"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                    <Image
                      src={line.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{line.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {line.variation.name}
                      {line.addons.length > 0 &&
                        ` · ${line.addons.map((a) => a.name).join(", ")}`}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QuantitySelector
                        value={line.quantity}
                        onIncrease={() => increaseQty(line.lineId)}
                        onDecrease={() => decreaseQty(line.lineId)}
                        min={0}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(line.lineId)}
                        aria-label="Remove"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums">
                    ₹{line.unitPrice * line.quantity}
                  </div>
                </li>
              ))}
            </ul>
            <Separator className="bg-white/10" />
            <div className="flex items-center justify-between text-lg">
              <span className="text-muted-foreground">Total</span>
              <span className="font-heading text-2xl font-bold text-primary tabular-nums">
                ₹{totalAmount}
              </span>
            </div>
            <Link
              href="/checkout"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-cta-gradient flex h-12 w-full items-center justify-center rounded-full font-semibold text-white shadow-lg shadow-red-950/40",
              )}
            >
              Go to checkout
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
