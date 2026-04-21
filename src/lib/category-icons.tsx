"use client";

import type { LucideIcon } from "lucide-react";
import {
  Beef,
  Candy,
  ChefHat,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Flame,
  GlassWater,
  IceCream2,
  LeafyGreen,
  Martini,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Sparkles,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";

/** Whitelist: `Category.icon` in DB must be one of these keys. */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  "utensils-crossed": UtensilsCrossed,
  pizza: Pizza,
  sparkles: Sparkles,
  soup: Soup,
  wheat: Wheat,
  flame: Flame,
  cookie: Cookie,
  sandwich: Sandwich,
  salad: Salad,
  "ice-cream": IceCream2,
  coffee: Coffee,
  "cup-soda": CupSoda,
  "glass-water": GlassWater,
  croissant: Croissant,
  beef: Beef,
  candy: Candy,
  "chef-hat": ChefHat,
  "leafy-green": LeafyGreen,
  martini: Martini,
};

export const CATEGORY_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "utensils-crossed", label: "General" },
  { value: "pizza", label: "Pizza" },
  { value: "sparkles", label: "Specials" },
  { value: "soup", label: "Dumplings / soup" },
  { value: "wheat", label: "Rice / grains" },
  { value: "flame", label: "Tandoor / spicy" },
  { value: "cookie", label: "Snacks" },
  { value: "sandwich", label: "Fries / sides" },
  { value: "salad", label: "Salad / fresh" },
  { value: "ice-cream", label: "Shakes / dessert" },
  { value: "coffee", label: "Coffee / café" },
  { value: "cup-soda", label: "Soft drinks" },
  { value: "glass-water", label: "Cold drinks" },
  { value: "croissant", label: "Breads / bakery" },
  { value: "beef", label: "Meat" },
  { value: "candy", label: "Sweet" },
  { value: "chef-hat", label: "Chef" },
  { value: "leafy-green", label: "Veg / greens" },
  { value: "martini", label: "Bar / cocktails" },
];

export function CategoryIcon({
  iconKey,
  className,
}: {
  iconKey: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICON_MAP[iconKey] ?? UtensilsCrossed;
  return <Icon className={className} aria-hidden />;
}
