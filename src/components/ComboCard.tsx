"use client";

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { MenuItemImage } from "@/components/MenuItemImage";
import { QuantitySelector } from "@/components/QuantitySelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useMenuData } from "@/contexts/menu-data-context";
import { buildComboLineId } from "@/lib/cart-line";
import {
  computeComboRetailTotal,
  formatComboComponentSummary,
  isComboAvailable,
} from "@/lib/menu-combos";
import { useCartStore } from "@/store/cartStore";
import { isCartComboLine } from "@/types/menu";
import type { MenuCombo } from "@/types/menu";
import { cn } from "@/lib/utils";

export interface ComboCardProps {
  combo: MenuCombo;
}

export function ComboCard({ combo }: ComboCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data } = useMenuData();
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const addCombo = useCartStore((s) => s.addCombo);
  const cartItems = useCartStore((s) => s.items);
  const increaseQty = useCartStore((s) => s.increaseQty);
  const decreaseQty = useCartStore((s) => s.decreaseQty);

  const ok = useMemo(() => isComboAvailable(combo, items), [combo, items]);
  const summary = useMemo(
    () => formatComboComponentSummary(combo, items),
    [combo, items],
  );
  const retailTotal = useMemo(
    () => computeComboRetailTotal(combo, items),
    [combo, items],
  );

  const lineId = buildComboLineId(combo.id);
  const comboLine = useMemo(
    () => cartItems.find((l) => isCartComboLine(l) && l.comboId === combo.id),
    [cartItems, combo.id],
  );

  const openSheet = () => setSheetOpen(true);

  return (
    <>
      <Card
        className={cn(
          "group flex cursor-pointer flex-col overflow-hidden border-border bg-card pt-0 shadow-md ring-1 ring-border/40 transition-all duration-300 hover:-translate-y-0.5 hover:ring-primary/25",
          !ok && "opacity-60",
        )}
        onClick={ok ? openSheet : undefined}
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
          <MenuItemImage
            src={combo.image}
            alt={combo.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 33vw"
            priority={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <span
            className={cn(
              "absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              combo.isVeg
                ? "bg-emerald-500/90 text-white"
                : "bg-rose-600/90 text-white",
            )}
          >
            {combo.isVeg ? "Veg" : "Non-Veg"}
          </span>
          <span className="absolute top-2 right-2 rounded-full bg-amber-500/95 px-2 py-0.5 text-[10px] font-bold text-white">
            Combo
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5">
          <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
            <h3 className="line-clamp-2 min-h-[2lh] break-words font-heading text-[0.9375rem] font-semibold leading-tight">
              {combo.name}
            </h3>
            <p className="line-clamp-2 min-h-[2lh] break-words text-xs leading-tight text-muted-foreground">
              {combo.description}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 pt-0.5">
            <div className="@container min-w-0">
              <div className="flex min-w-0 flex-col gap-0.5 leading-none @min-[10.5rem]:flex-row @min-[10.5rem]:flex-nowrap @min-[10.5rem]:items-baseline @min-[10.5rem]:gap-1.5">
                {retailTotal > 0 && retailTotal !== combo.price && (
                  <span className="text-muted-foreground text-sm line-through tabular-nums">
                    ₹{retailTotal}
                  </span>
                )}
                <p className="font-heading text-base font-bold text-primary tabular-nums">
                  ₹{combo.price}
                </p>
              </div>
            </div>
            {!ok ? (
              <span className="text-muted-foreground shrink-0 text-xs justify-self-end">
                Unavailable
              </span>
            ) : !comboLine ? (
              <Button
                type="button"
                size="sm"
                className="bg-cta-gradient shrink-0 justify-self-end rounded-full font-semibold text-primary-foreground shadow-md shadow-cta"
                onClick={(e) => {
                  e.stopPropagation();
                  openSheet();
                }}
              >
                <PlusIcon className="size-4" />
                Add
              </Button>
            ) : (
              <div
                className="shrink-0 justify-self-end"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <QuantitySelector
                  value={comboLine.quantity}
                  onIncrease={() => increaseQty(lineId)}
                  onDecrease={() => decreaseQty(lineId)}
                  min={0}
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] rounded-t-3xl border-t border-border bg-popover/95 p-0 backdrop-blur-xl"
        >
          <SheetHeader className="border-b border-border/70 p-4 pb-2">
            <SheetTitle className="text-left font-heading text-lg">
              {combo.name}
            </SheetTitle>
          </SheetHeader>
          <div className="flex gap-3 border-b border-border/70 p-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-border">
              <MenuItemImage
                src={combo.image}
                alt=""
                fill
                className="object-cover"
                sizes="96px"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-muted-foreground text-sm">{combo.description}</p>
              <div className="@container min-w-0">
                <div className="flex min-w-0 flex-col gap-0.5 leading-none @min-[14rem]:flex-row @min-[14rem]:flex-nowrap @min-[14rem]:items-baseline @min-[14rem]:gap-2">
                  {retailTotal > 0 && retailTotal !== combo.price && (
                    <span className="text-muted-foreground text-lg line-through tabular-nums">
                      ₹{retailTotal}
                    </span>
                  )}
                  <p className="font-heading text-xl font-bold text-primary tabular-nums">
                    ₹{combo.price}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="max-h-[42vh] space-y-3 overflow-y-auto p-4">
            <p className="font-medium text-sm">Includes</p>
            <ul className="space-y-2 text-sm">
              {summary.split(" + ").map((part, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  {part}
                </li>
              ))}
            </ul>
          </div>
          <Separator />
          <SheetFooter className="p-4">
            <Button
              type="button"
              className="bg-cta-gradient h-12 w-full rounded-full font-semibold text-primary-foreground shadow-lg shadow-cta"
              disabled={!ok}
              onClick={() => {
                if (!ok) {
                  toast.error("This combo is not available right now.");
                  return;
                }
                addCombo(combo, items);
                toast.success(`${combo.name} added to cart`, {
                  description: `Combo · ₹${combo.price}`,
                });
                setSheetOpen(false);
              }}
            >
              Add combo · ₹{combo.price}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
