import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { createSafeLocalStorage } from "@/lib/safe-local-storage";

import {
  buildComboLineId,
  buildLineId,
  computeUnitPrice,
  migrateCartLine,
} from "@/lib/cart-line";
import { formatComboComponentSummary, isComboAvailable } from "@/lib/menu-combos";
import { isMenuItemAvailable, isMenuItemOrderable } from "@/lib/menu-availability";
import { trackAddToCart } from "@/lib/meta-pixel";
import {
  isCartComboLine,
  isCartItemLine,
  type CartAddonWithQty,
  type CartComboLine,
  type CartLine,
  type MenuCombo,
  type MenuItem,
  type MenuVariation,
} from "@/types/menu";

export interface AddItemPayload {
  item: MenuItem;
  variation: MenuVariation;
  addons: CartAddonWithQty[];
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

function contentIdForLine(line: CartLine): string {
  if (isCartComboLine(line)) return line.comboId;
  if (isCartItemLine(line)) return line.itemId;
  return line.lineId;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: ({ item, variation, addons }) => {
        if (!isMenuItemAvailable(item) || item.notForSale === true) return;
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
        trackAddToCart({
          contentId: item.id,
          contentName: item.name,
          value: unitPrice,
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
        trackAddToCart({
          contentId: combo.id,
          contentName: combo.name,
          value: combo.price,
        });
      },

      removeItem: (lineId) =>
        set((state) => ({
          items: state.items.filter((l) => l.lineId !== lineId),
        })),

      increaseQty: (lineId) => {
        const line = get().items.find((l) => l.lineId === lineId);
        if (!line) return;
        set((state) => ({
          items: state.items.map((l) =>
            l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        }));
        trackAddToCart({
          contentId: contentIdForLine(line),
          contentName: line.name,
          value: line.unitPrice,
        });
      },

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
      storage: createJSONStorage(createSafeLocalStorage),
      /** Avoid SSR HTML vs client mismatch: rehydrate after mount in `CartAvailabilitySync`. */
      skipHydration: true,
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
