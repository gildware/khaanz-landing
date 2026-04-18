"use client";

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";

import { ItemCustomizeSheet } from "@/components/ItemCustomizeSheet";
import { MenuItemImage } from "@/components/MenuItemImage";
import { QuantitySelector } from "@/components/QuantitySelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartStore } from "@/store/cartStore";
import { isCartItemLine, type MenuItem } from "@/types/menu";
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
    () =>
      items.filter(
        (l) => isCartItemLine(l) && l.itemId === item.id,
      ),
    [items, item.id],
  );

  const singleLine = linesForItem.length === 1 ? linesForItem[0] : undefined;
  const multiCount = linesForItem.reduce((s, l) => s + l.quantity, 0);

  const openSheet = () => setSheetOpen(true);

  return (
    <>
      <Card
        className="group flex cursor-pointer flex-col overflow-hidden border-border bg-card pt-0 shadow-md ring-1 ring-border/40 transition-all duration-300 hover:-translate-y-0.5 hover:ring-primary/25"
        onClick={openSheet}
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
          <MenuItemImage
            src={item.image}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 33vw"
            priority={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
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
        <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5">
          <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
            <h3 className="line-clamp-2 min-h-[2lh] break-words font-heading text-[0.9375rem] font-semibold leading-tight">
              {item.name}
            </h3>
            <p className="line-clamp-2 min-h-[2lh] break-words text-xs leading-tight text-muted-foreground">
              {item.description}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <p className="font-heading text-base font-bold text-primary tabular-nums leading-none">
              ₹{Math.min(...item.variations.map((v) => v.price))}
            </p>
            {linesForItem.length === 0 && (
              <Button
                type="button"
                size="sm"
                className="bg-cta-gradient rounded-full font-semibold text-primary-foreground shadow-md shadow-cta"
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
    <Card className="flex flex-col overflow-hidden border-border pt-0 shadow-sm">
      <Skeleton className="aspect-[4/3] w-full shrink-0 rounded-none" />
      <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5">
        <div className="h-16 space-y-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>
    </Card>
  );
}
