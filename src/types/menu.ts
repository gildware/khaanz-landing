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

export type CartAddonSelection = MenuAddon;

export interface CartLine {
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

export interface CheckoutDetails {
  name: string;
  phone: string;
  address: string;
  landmark: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}
