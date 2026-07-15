"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useMenuData } from "@/contexts/menu-data-context";
import { getAddonsForItem } from "@/data/menu";
import { computeUnitPrice } from "@/lib/cart-line";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import { useCartStore } from "@/store/cartStore";
import type { MenuItem, MenuVariation } from "@/types/menu";
import { MenuItemImage } from "@/components/MenuItemImage";
import { cn } from "@/lib/utils";

export interface ItemCustomizeSheetProps {
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemCustomizeSheet({
  item,
  open,
  onOpenChange,
}: ItemCustomizeSheetProps) {
  const addItem = useCartStore((s) => s.addItem);
  const { data: menuData } = useMenuData();

  // Keep last item while the sheet closes so Root is not unmounted mid-open
  // (abrupt unmount can leave Base UI's inert backdrop blocking all clicks).
  const [cachedItem, setCachedItem] = useState<MenuItem | null>(item);
  const [variation, setVariation] = useState<MenuVariation | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (item) setCachedItem(item);
  }, [item]);

  const addons = useMemo(() => {
    if (!cachedItem || !menuData) return [];
    return getAddonsForItem(cachedItem, menuData.globalAddons);
  }, [cachedItem, menuData]);

  useEffect(() => {
    if (cachedItem && cachedItem.variations.length > 0) {
      setVariation(cachedItem.variations[0]!);
    } else {
      setVariation(null);
    }
    setSelectedAddonIds(new Set());
  }, [cachedItem]);

  const selectedAddons = useMemo(() => {
    return addons.filter((a) => selectedAddonIds.has(a.id));
  }, [addons, selectedAddonIds]);

  const unitPrice =
    variation != null
      ? computeUnitPrice(
          variation,
          selectedAddons.map((a) => ({ ...a, quantity: 1 })),
        )
      : 0;

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (!cachedItem || !variation) return;
    if (!isMenuItemAvailable(cachedItem)) {
      toast.error("This item is not available to order right now.");
      return;
    }
    const addonsWithQty = selectedAddons.map((a) => ({ ...a, quantity: 1 }));
    addItem({ item: cachedItem, variation, addons: addonsWithQty });
    toast.success(`${cachedItem.name} added to cart`, {
      description: `${variation.name} · ₹${unitPrice}`,
    });
    onOpenChange(false);
  };

  if (!cachedItem) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-3xl border-t border-border bg-popover/95 p-0 backdrop-blur-xl">
        <SheetHeader className="border-b border-border/70 p-4 pb-2">
          <SheetTitle className="text-left font-heading text-lg">
            Customize
          </SheetTitle>
        </SheetHeader>
        <div className="flex gap-3 border-b border-border/70 p-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-border">
            <MenuItemImage
              src={cachedItem.image}
              alt=""
              fill
              className="object-cover"
              sizes="96px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading font-semibold leading-tight">{cachedItem.name}</p>
            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
              {cachedItem.description}
            </p>
            <span
              className={cn(
                "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                cachedItem.isVeg
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400",
              )}
            >
              {cachedItem.isVeg ? "Veg" : "Non-Veg"}
            </span>
          </div>
        </div>

        <div className="max-h-[42dvh] overflow-y-auto">
          <div className="space-y-4 p-4">
            <div>
              <p className="mb-2 font-medium text-sm">Size / Portion</p>
              <div className="flex flex-wrap gap-2">
                {cachedItem.variations.map((v) => (
                  <Button
                    key={v.id}
                    type="button"
                    variant={variation?.id === v.id ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setVariation(v)}
                  >
                    {v.name} · ₹{v.price}
                  </Button>
                ))}
              </div>
            </div>

            {addons.length > 0 && (
              <>
                <Separator className="bg-border" />
                <div>
                  <p className="mb-2 font-medium text-sm">Add-ons</p>
                  <div className="space-y-3">
                    {addons.map((a) => (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/35"
                      >
                        <Checkbox
                          checked={selectedAddonIds.has(a.id)}
                          onCheckedChange={() => toggleAddon(a.id)}
                        />
                        <span className="flex-1 text-sm">{a.name}</span>
                        <span className="text-muted-foreground text-sm">
                          +₹{a.price}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border bg-background/80 p-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs">Item total</p>
              <p className="font-heading text-xl font-bold text-primary tabular-nums">
                ₹{unitPrice}
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="bg-cta-gradient min-w-[10rem] rounded-full font-semibold text-primary-foreground shadow-lg shadow-cta"
              onClick={handleAdd}
              disabled={!variation || !isMenuItemAvailable(cachedItem)}
            >
              Add to cart
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
