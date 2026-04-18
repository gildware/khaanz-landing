"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { PlusIcon } from "lucide-react";

import { ItemCustomizeSheet } from "@/components/ItemCustomizeSheet";
import { QuantitySelector } from "@/components/QuantitySelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartStore } from "@/store/cartStore";
import type { MenuItem } from "@/types/menu";
import { cn } from "@/lib/utils";

export interface MenuCardProps {
  item: MenuItem;
}

export function MenuCard({ item }: MenuCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const items = useCartStore((s) => s.items);
  const increaseQty = useCartStore((s) => s.increaseQty);
  const decreaseQty = useCartStore((s) => s.decreaseQty);

  const linesForItem = useMemo(
    () => items.filter((l) => l.itemId === item.id),
    [items, item.id],
  );

  const singleLine = linesForItem.length === 1 ? linesForItem[0] : undefined;
  const multiCount = linesForItem.reduce((s, l) => s + l.quantity, 0);

  const openSheet = () => setSheetOpen(true);

  return (
    <>
      <Card
        className="group cursor-pointer overflow-hidden border-white/10 bg-card/40 shadow-lg ring-1 ring-white/5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:ring-primary/30"
        onClick={openSheet}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 33vw"
            priority={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
          <span
            className={cn(
              "absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              item.isVeg
                ? "bg-emerald-500/90 text-white"
                : "bg-rose-600/90 text-white",
            )}
          >
            {item.isVeg ? "Veg" : "Non-Veg"}
          </span>
          {item.recommended && (
            <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              Chef pick
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 pt-2">
          <div>
            <h3 className="font-heading font-semibold leading-snug">{item.name}</h3>
            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
              {item.description}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <p className="font-heading text-lg font-bold text-primary tabular-nums">
              from ₹{Math.min(...item.variations.map((v) => v.price))}
            </p>
            {linesForItem.length === 0 && (
              <Button
                type="button"
                size="sm"
                className="bg-cta-gradient rounded-full font-semibold text-white shadow-md shadow-red-950/40"
                onClick={(e) => {
                  e.stopPropagation();
                  openSheet();
                }}
              >
                <PlusIcon className="size-4" />
                Add
              </Button>
            )}
            {linesForItem.length === 1 && singleLine && (
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <QuantitySelector
                  value={singleLine.quantity}
                  onIncrease={() => increaseQty(singleLine.lineId)}
                  onDecrease={() => decreaseQty(singleLine.lineId)}
                  min={0}
                />
              </div>
            )}
            {linesForItem.length > 1 && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-muted-foreground text-xs">
                  {multiCount} in cart
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSheet();
                  }}
                >
                  Add more
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <ItemCustomizeSheet
        item={item}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}

export function MenuCardSkeleton() {
  return (
    <Card className="overflow-hidden border-white/10">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex justify-between pt-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>
    </Card>
  );
}
