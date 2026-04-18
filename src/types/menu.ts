export interface MenuVariation {
  id: string;
  name: string;
  price: number;
}

export interface MenuAddon {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  image: string;
  isVeg: boolean;
  variations: MenuVariation[];
  addons: MenuAddon[];
  recommended?: boolean;
  available?: boolean;
}

/** One slot in a combo — references a menu item and which variation is included */
export interface MenuComboComponent {
  itemId: string;
  variationId: string;
  /** Units of this line (each at the chosen variation’s menu price). Default 1. */
  quantity: number;
}

/** Bundle of existing menu items sold at a single combo price */
export interface MenuCombo {
  id: string;
  name: string;
  description: string;
  image: string;
  /** Offer price for the whole combo (may be below sum of component retail) */
  price: number;
  components: MenuComboComponent[];
  isVeg: boolean;
  available?: boolean;
}

export type CartAddonSelection = MenuAddon;

export interface CartItemLine {
  kind: "item";
  lineId: string;
  itemId: string;
  name: string;
  image: string;
  isVeg: boolean;
  variation: MenuVariation;
  addons: CartAddonSelection[];
  quantity: number;
  unitPrice: number;
}

export interface CartComboLine {
  kind: "combo";
  lineId: string;
  comboId: string;
  name: string;
  image: string;
  isVeg: boolean;
  quantity: number;
  unitPrice: number;
  /** Human-readable breakdown for kitchen and receipts */
  componentSummary: string;
}

export type CartLine = CartItemLine | CartComboLine;

export function isCartItemLine(line: CartLine): line is CartItemLine {
  return line.kind === "item";
}

export function isCartComboLine(line: CartLine): line is CartComboLine {
  return line.kind === "combo";
}

export interface CheckoutDetails {
  name: string;
  phone: string;
  address: string;
  landmark: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}
