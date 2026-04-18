import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  buildComboLineId,
  buildLineId,
  computeUnitPrice,
  migrateCartLine,
} from "@/lib/cart-line";
import { formatComboComponentSummary, isComboAvailable } from "@/lib/menu-combos";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import type {
  CartComboLine,
  CartLine,
  MenuAddon,
  MenuCombo,
  MenuItem,
  MenuVariation,
} from "@/types/menu";

export interface AddItemPayload {
  item: MenuItem;
  variation: MenuVariation;
  addons: MenuAddon[];
}

interface CartState {
  items: CartLine[];
  addItem: (payload: AddItemPayload) => void;
  addCombo: (combo: MenuCombo, menuItems: MenuItem[]) => void;
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
        if (!isMenuItemAvailable(item)) return;
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
            kind: "item",
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

      addCombo: (combo, menuItems) => {
        if (!isComboAvailable(combo, menuItems)) return;
        const lineId = buildComboLineId(combo.id);
        const componentSummary = formatComboComponentSummary(combo, menuItems);

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
          const line: CartComboLine = {
            kind: "combo",
            lineId,
            comboId: combo.id,
            name: combo.name,
            image: combo.image,
            isVeg: combo.isVeg,
            quantity: 1,
            unitPrice: combo.price,
            componentSummary,
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
      merge: (persistedState, currentState) => {
        const p = persistedState as Partial<CartState> | undefined;
        return {
          ...currentState,
          ...p,
          items: (p?.items ?? currentState.items).map(migrateCartLine),
        };
      },
    },
  ),
);
