import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { buildLineId, computeUnitPrice } from "@/lib/cart-line";
import type { CartLine, MenuAddon, MenuItem, MenuVariation } from "@/types/menu";

export interface AddItemPayload {
  item: MenuItem;
  variation: MenuVariation;
  addons: MenuAddon[];
}

interface CartState {
  items: CartLine[];
  addItem: (payload: AddItemPayload) => void;
  removeItem: (lineId: string) => void;
  increaseQty: (lineId: string) => void;
  decreaseQty: (lineId: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: ({ item, variation, addons }) => {
        const unitPrice = computeUnitPrice(variation, addons);
        const lineId = buildLineId(item.id, variation, addons);

        set((state) => {
          const existing = state.items.find((l) => l.lineId === lineId);
          if (existing) {
            return {
              items: state.items.map((l) =>
                l.lineId === lineId
                  ? { ...l, quantity: l.quantity + 1 }
                  : l,
              ),
            };
          }
          const line: CartLine = {
            lineId,
            itemId: item.id,
            name: item.name,
            image: item.image,
            isVeg: item.isVeg,
            variation,
            addons,
            quantity: 1,
            unitPrice,
          };
          return { items: [...state.items, line] };
        });
      },

      removeItem: (lineId) =>
        set((state) => ({
          items: state.items.filter((l) => l.lineId !== lineId),
        })),

      increaseQty: (lineId) =>
        set((state) => ({
          items: state.items.map((l) =>
            l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        })),

      decreaseQty: (lineId) =>
        set((state) => {
          const next = state.items
            .map((l) =>
              l.lineId === lineId ? { ...l, quantity: l.quantity - 1 } : l,
            )
            .filter((l) => l.quantity > 0);
          return { items: next };
        }),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: "khaanz-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
