import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuAddon, MenuCombo, MenuItem } from "@/types/menu";

/**
 * KHAANZ brand menu (fried-chicken / burgers / combos), transcribed from the
 * printed menu board. This is the single source of truth used both by:
 *  - `src/data/menu.ts` (bundled defaults, applied when seeding an empty DB), and
 *  - `scripts/seed-khaanz-menu.ts` (idempotent additive upsert for existing
 *    local + production databases).
 *
 * Pricing notes:
 *  - À la carte prices come straight from the board (Crispy Chicken, Wings,
 *    Strips, Popcorn, Zinger Burger, Tandoori Burger).
 *  - Fries, Cold Drinks and the generic "Burger" referenced inside combos are
 *    intentionally NOT sold à la carte (no standalone price). They are only
 *    described inside each combo's `description`; combo `components` reference
 *    the real à la carte items so combos stay "available" and produce a
 *    sensible kitchen breakdown.
 */

export const KHAANZ_CATEGORIES: MenuCategoryDef[] = [
  { name: "Signature Chicken", image: "/menu/crispy-chicken.jpg", icon: "beef" },
  { name: "Burgers", image: "/menu/zinger-burger.jpg", icon: "sandwich" },
];

/** Upsell modifier from the board: "Make it a Meal +₹69 (Fries + Drink)". */
export const KHAANZ_GLOBAL_ADDONS: MenuAddon[] = [
  { id: "khaanz-make-it-a-meal", name: "Make it a Meal (Fries + Drink)", price: 69 },
];

export const KHAANZ_ITEMS: MenuItem[] = [
  // ----- Signature Chicken -----
  {
    id: "khaanz-crispy-chicken",
    name: "Crispy Chicken",
    category: "Signature Chicken",
    description: "Our signature crunchy fried chicken — golden, juicy and loaded with flavour.",
    image: "/menu/crispy-chicken.jpg",
    isVeg: false,
    recommended: true,
    available: true,
    variations: [
      { id: "khaanz-crispy-chicken-2", name: "2 Pcs", price: 169 },
      { id: "khaanz-crispy-chicken-4", name: "4 Pcs", price: 319 },
      { id: "khaanz-crispy-chicken-8", name: "8 Pcs", price: 599 },
    ],
    addons: [],
  },
  {
    id: "khaanz-wings",
    name: "Wings",
    category: "Signature Chicken",
    description: "Crispy fried chicken wings tossed in our signature spice mix.",
    image: "/menu/wings.jpg",
    isVeg: false,
    available: true,
    variations: [
      { id: "khaanz-wings-4", name: "4 Pcs", price: 119 },
      { id: "khaanz-wings-6", name: "6 Pcs", price: 169 },
      { id: "khaanz-wings-8", name: "8 Pcs", price: 219 },
    ],
    addons: [],
  },
  {
    id: "khaanz-strips",
    name: "Strips",
    category: "Signature Chicken",
    description: "Tender boneless chicken strips with a crunchy golden coating.",
    image: "/menu/strips.jpg",
    isVeg: false,
    available: true,
    variations: [
      { id: "khaanz-strips-4", name: "4 Pcs", price: 159 },
      { id: "khaanz-strips-6", name: "6 Pcs", price: 229 },
      { id: "khaanz-strips-8", name: "8 Pcs", price: 279 },
    ],
    addons: [],
  },
  {
    id: "khaanz-popcorn",
    name: "Popcorn Chicken",
    category: "Signature Chicken",
    description: "Bite-sized crispy popcorn chicken — perfectly poppable.",
    image: "/menu/popcorn-chicken.jpg",
    isVeg: false,
    available: true,
    variations: [
      { id: "khaanz-popcorn-regular", name: "Regular", price: 110 },
      { id: "khaanz-popcorn-large", name: "Large", price: 199 },
    ],
    addons: [],
  },

  // ----- Burgers -----
  {
    id: "khaanz-zinger-burger",
    name: "Zinger Burger",
    category: "Burgers",
    description: "Extra crunch. Extra juicy. Our bestselling crispy chicken burger.",
    image: "/menu/zinger-burger.jpg",
    isVeg: false,
    recommended: true,
    available: true,
    variations: [{ id: "khaanz-zinger-burger-single", name: "Single", price: 149 }],
    addons: [],
  },
  {
    id: "khaanz-tandoori-burger",
    name: "Tandoori Burger",
    category: "Burgers",
    description: "Smoky. Spicy. Irresistible. A tandoori-spiced crispy chicken burger.",
    image: "/menu/tandoori-burger.jpg",
    isVeg: false,
    available: true,
    variations: [{ id: "khaanz-tandoori-burger-single", name: "Single", price: 169 }],
    addons: [],
  },
];

/**
 * Combos. `price` is the fixed offer price from the board and `description` is
 * the exact printed contents. `components` reference real à la carte items so
 * each combo resolves as "available"; where the board lists piece counts that
 * don't match an à la carte variation (e.g. 3 Wings, 6 Pc Chicken), the closest
 * variation/quantity is used — the printed `description` remains the source of
 * truth for what the customer receives.
 */
export const KHAANZ_COMBOS: MenuCombo[] = [
  {
    id: "khaanz-student-box",
    name: "KHAANZ Student Box",
    description: "2 Pc Crispy Chicken, Fries, Popcorn & Drink",
    image: "/menu/combo-student-box.jpg",
    price: 299,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-2", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-regular", quantity: 1 },
    ],
  },
  {
    id: "khaanz-solo-meal",
    name: "Solo Meal",
    description: "Burger + Fries + Drink",
    image: "/menu/combo-solo-meal.jpg",
    price: 199,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-zinger-burger", variationId: "khaanz-zinger-burger-single", quantity: 1 },
    ],
  },
  {
    id: "khaanz-duo-meal",
    name: "Duo Meal",
    description: "4 Pc Chicken + Fries + Popcorn + 2 Drinks",
    image: "/menu/combo-duo-meal.jpg",
    price: 449,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-4", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-regular", quantity: 1 },
    ],
  },
  {
    id: "khaanz-zinger-meal",
    name: "Zinger Meal",
    description: "2 Zinger Burgers, 4 Wings, 1 Large Fries & 2 Cold Drinks",
    image: "/menu/combo-zinger-meal.jpg",
    price: 549,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-zinger-burger", variationId: "khaanz-zinger-burger-single", quantity: 2 },
      { itemId: "khaanz-wings", variationId: "khaanz-wings-4", quantity: 1 },
    ],
  },
  {
    id: "khaanz-chicken-bucket",
    name: "Chicken Bucket",
    description: "6 Pc Signature Chicken, 4 Strips, 1 Popcorn & 2 Cold Drinks",
    image: "/menu/combo-chicken-bucket.jpg",
    price: 749,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-4", quantity: 1 },
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-2", quantity: 1 },
      { itemId: "khaanz-strips", variationId: "khaanz-strips-4", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-regular", quantity: 1 },
    ],
  },
  {
    id: "khaanz-variety-box",
    name: "Variety Box",
    description: "2 Pc Chicken (Any), 3 Strips, 3 Wings, 1 Popcorn & 2 Cold Drinks",
    image: "/menu/combo-variety-box.jpg",
    price: 499,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-2", quantity: 1 },
      { itemId: "khaanz-strips", variationId: "khaanz-strips-4", quantity: 1 },
      { itemId: "khaanz-wings", variationId: "khaanz-wings-4", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-regular", quantity: 1 },
    ],
  },
  {
    id: "khaanz-all-in-one-box",
    name: "All In One Box",
    description: "2 Pc Chicken (Any), 2 Strips, 2 Wings, 1 Burger, 1 Medium Fries, 1 Popcorn & 2 Cold Drinks",
    image: "/menu/combo-all-in-one-box.jpg",
    price: 629,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-2", quantity: 1 },
      { itemId: "khaanz-strips", variationId: "khaanz-strips-4", quantity: 1 },
      { itemId: "khaanz-wings", variationId: "khaanz-wings-4", quantity: 1 },
      { itemId: "khaanz-zinger-burger", variationId: "khaanz-zinger-burger-single", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-regular", quantity: 1 },
    ],
  },
  {
    id: "khaanz-family-feast",
    name: "Family Feast",
    description: "8 Pc Chicken, 6 Strips, 6 Wings, 1 Large Popcorn, 2 Medium Fries & 4 Cold Drinks",
    image: "/menu/combo-family-feast.jpg",
    price: 1249,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-8", quantity: 1 },
      { itemId: "khaanz-strips", variationId: "khaanz-strips-6", quantity: 1 },
      { itemId: "khaanz-wings", variationId: "khaanz-wings-6", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-large", quantity: 1 },
    ],
  },
  {
    id: "khaanz-jumbo-party-meal",
    name: "Jumbo Party Meal",
    description: "12 Pc Chicken, 6 Strips, 6 Wings, 2 Medium Popcorn, 2 Medium Fries & 5 Cold Drinks",
    image: "/menu/combo-jumbo-party-meal.jpg",
    price: 1599,
    isVeg: false,
    available: true,
    components: [
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-8", quantity: 1 },
      { itemId: "khaanz-crispy-chicken", variationId: "khaanz-crispy-chicken-4", quantity: 1 },
      { itemId: "khaanz-strips", variationId: "khaanz-strips-6", quantity: 1 },
      { itemId: "khaanz-wings", variationId: "khaanz-wings-6", quantity: 1 },
      { itemId: "khaanz-popcorn", variationId: "khaanz-popcorn-regular", quantity: 2 },
    ],
  },
];
