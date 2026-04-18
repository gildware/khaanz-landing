"use client";

import { useEffect } from "react";

import { useMenuData } from "@/contexts/menu-data-context";
import { isComboAvailable } from "@/lib/menu-combos";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import { isCartComboLine, isCartItemLine } from "@/types/menu";
import { useCartStore } from "@/store/cartStore";

/** Drops cart lines for items that are off-menu or marked unavailable when menu data loads or changes. */
export function CartAvailabilitySync() {
  const { data } = useMenuData();
  const rawItems = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);

  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!data?.items) return;
    const byId = new Map(data.items.map((i) => [i.id, i]));
    const combos = data.combos ?? [];
    for (const line of rawItems) {
      if (isCartItemLine(line)) {
        const item = byId.get(line.itemId);
        if (!item || !isMenuItemAvailable(item)) {
          removeItem(line.lineId);
        }
        continue;
      }
      if (isCartComboLine(line)) {
        const combo = combos.find((c) => c.id === line.comboId);
        if (!combo || !isComboAvailable(combo, data.items)) {
          removeItem(line.lineId);
        }
      }
    }
  }, [data?.items, data?.combos, rawItems, removeItem]);

  return null;
}
