import { useMemo } from "react";

import { useCartStore } from "@/store/cartStore";

export function useCartTotals() {
  const items = useCartStore((s) => s.items);
  return useMemo(() => {
    const totalItems = items.reduce((sum, l) => sum + l.quantity, 0);
    const totalAmount = items.reduce(
      (sum, l) => sum + l.unitPrice * l.quantity,
      0,
    );
    return { totalItems, totalAmount, lines: items };
  }, [items]);
}
