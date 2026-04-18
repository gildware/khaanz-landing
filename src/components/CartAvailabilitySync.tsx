"use client";

import { useLayoutEffect } from "react";

import { useMenuData } from "@/contexts/menu-data-context";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import { useCartStore } from "@/store/cartStore";

/** Drops cart lines for items that are off-menu or marked unavailable when menu data loads or changes. */
export function CartAvailabilitySync() {
  const { data } = useMenuData();
  const rawItems = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);

  useLayoutEffect(() => {
    if (!data?.items) return;
    const byId = new Map(data.items.map((i) => [i.id, i]));
    for (const line of rawItems) {
      const item = byId.get(line.itemId);
      if (!item || !isMenuItemAvailable(item)) {
        removeItem(line.lineId);
      }
    }
  }, [data?.items, rawItems, removeItem]);

  return null;
}
