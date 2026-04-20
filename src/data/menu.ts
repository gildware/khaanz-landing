import type { MenuPayload } from "@/types/menu-payload";
import type { MenuAddon, MenuCombo, MenuItem } from "../types/menu";

export const MENU_CATEGORIES = [
  "Pizza Zone",
  "Chef Specials",
  "Momo Mania",
  "Rice Royale",
  "Tandoor Breads",
  "Crispy Bites",
  "Fries & More",
  "Noodle Hub",
  "Spicy Chinese",
  "Parathas & Rolls",
  "Mojitos",
  "Shakes",
  "Soft Drinks",
] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number];

/** Global add-ons available for every item at customization time */
export const GLOBAL_ADDONS: MenuAddon[] = [
  { id: "ga-mayo", name: "Extra Mayonnaise", price: 10 },
  { id: "ga-cheese", name: "Extra Cheese", price: 30 },
  { id: "ga-chicken", name: "Extra Chicken", price: 60 },
];

const u = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?w=800&q=80&auto=format&fit=crop`;

type MenuItemInput = Omit<MenuItem, "description" | "addons"> &
  Partial<Pick<MenuItem, "description" | "addons">>;

const ADDONS_BREADS: MenuAddon[] = [
  { id: "ia-tandoori-roti", name: "Tandoori Roti", price: 20 },
  { id: "ia-butter-tandoori-roti", name: "Butter Tandoori Roti", price: 25 },
  { id: "ia-tawa-roti", name: "Tawa Roti", price: 15 },
  { id: "ia-butter-tawa-roti", name: "Butter Tawa Roti", price: 20 },
  { id: "ia-plain-naan", name: "Plain Naan", price: 30 },
  { id: "ia-butter-naan", name: "Butter Naan", price: 40 },
  { id: "ia-butter-garlic-naan", name: "Butter Garlic Naan", price: 50 },
];

const ADDONS_SIDES: MenuAddon[] = [
  { id: "ia-salad", name: "Green Salad", price: 30 },
  { id: "ia-raita", name: "Raita", price: 25 },
  { id: "ia-extra-gravy", name: "Extra Gravy", price: 40 },
];

const ADDONS_PIZZA: MenuAddon[] = [
  { id: "ia-jalapenos", name: "Jalapeños", price: 25 },
  { id: "ia-black-olives", name: "Black Olives", price: 30 },
  { id: "ia-sweet-corn", name: "Sweet Corn", price: 25 },
  { id: "ia-extra-cheese-layer", name: "Cheese Burst Layer", price: 60 },
];

const ADDONS_MOMO: MenuAddon[] = [
  { id: "ia-spicy-chutney", name: "Extra Spicy Chutney", price: 15 },
  { id: "ia-mayo-dip", name: "Mayo Dip", price: 20 },
  { id: "ia-schezwan-dip", name: "Schezwan Dip", price: 20 },
];

const ADDONS_RICE: MenuAddon[] = [
  { id: "ia-boiled-egg", name: "Boiled Egg", price: 20 },
  { id: "ia-extra-raita", name: "Extra Raita", price: 25 },
  { id: "ia-onion-salad", name: "Onion Salad", price: 15 },
];

const ADDONS_NOODLES: MenuAddon[] = [
  { id: "ia-extra-veggies", name: "Extra Veggies", price: 25 },
  { id: "ia-extra-egg", name: "Extra Egg", price: 30 },
  { id: "ia-extra-chicken", name: "Extra Chicken", price: 60 },
];

const ADDONS_FRIES: MenuAddon[] = [
  { id: "ia-cheese-sauce", name: "Cheese Sauce", price: 30 },
  { id: "ia-peri-peri-dust", name: "Extra Peri Peri Dust", price: 15 },
  { id: "ia-ketchup", name: "Ketchup Dip", price: 10 },
];

const ADDONS_SHAKES: MenuAddon[] = [
  { id: "ia-whipped-cream", name: "Whipped Cream", price: 25 },
  { id: "ia-choco-chips", name: "Choco Chips", price: 30 },
  { id: "ia-extra-scoop", name: "Extra Ice Cream Scoop", price: 40 },
];

const ADDONS_MOJITOS: MenuAddon[] = [
  { id: "ia-extra-mint", name: "Extra Mint", price: 10 },
  { id: "ia-extra-lemon", name: "Extra Lemon", price: 10 },
  { id: "ia-extra-soda", name: "Extra Soda", price: 15 },
];

const ADDONS_SOFT_DRINKS: MenuAddon[] = [
  { id: "ia-extra-ice", name: "Extra Ice", price: 0 },
  { id: "ia-lemon-slice", name: "Lemon Slice", price: 5 },
];

function defaultDescriptionForItem(item: MenuItemInput): string {
  const n = item.name;
  switch (item.category) {
    case "Chef Specials":
      if (n.toLowerCase().includes("butter")) {
        return "Rich, creamy tomato-butter gravy with tender chicken—best with naan or roti.";
      }
      if (n.toLowerCase().includes("kadai")) {
        return "Wok-tossed chicken with capsicum, onion, and bold kadai masala—served hot.";
      }
      if (n.toLowerCase().includes("tandoori")) {
        return "Juicy, smoky tandoori chicken with a punch of spices and charred edges.";
      }
      return "House special made-to-order with aromatic spices and a satisfying, homestyle taste.";
    case "Tandoor Breads":
      if (n.toLowerCase().includes("naan")) return "Soft, fluffy naan—perfect for scooping up gravies.";
      if (n.toLowerCase().includes("roti")) return "Freshly cooked roti with a light, rustic bite.";
      return "Freshly made bread, hot off the tawa/tandoor.";
    case "Rice Royale":
      if (n.toLowerCase().includes("biryani")) {
        return "Aromatic basmati rice layered with spices—pair it with raita for the perfect bite.";
      }
      if (n.toLowerCase().includes("schezwan")) {
        return "Spicy Schezwan-style rice with wok aroma and a bold chilli-garlic kick.";
      }
      return "Wok-tossed rice with balanced seasoning and classic street-style flavour.";
    case "Pizza Zone":
      if (n.toLowerCase().includes("corn")) return "Cheesy pizza topped with sweet corn—comforting and crowd-pleasing.";
      if (n.toLowerCase().includes("veggie")) return "Loaded veggie pizza with a colourful crunch and gooey cheese pull.";
      if (n.toLowerCase().includes("chicken")) return "Hearty chicken pizza with bold seasoning and generous cheese.";
      return "Oven-baked pizza with melty cheese and a crisp, satisfying crust.";
    case "Momo Mania":
      if (n.toLowerCase().includes("tandoori")) return "Tandoori-style momos—smoky, spicy, and addictive with dip.";
      if (n.toLowerCase().includes("fried")) return "Crispy fried momos with a juicy centre—perfect with chutney.";
      return "Steamed momos with juicy filling and soft wrappers—served with dip.";
    case "Noodle Hub":
      if (n.toLowerCase().includes("schezwan")) return "Schezwan noodles with a spicy chilli-garlic punch and wok-tossed flavour.";
      return "Classic chowmein-style noodles tossed with veggies and signature sauces.";
    case "Spicy Chinese":
      if (n.toLowerCase().includes("manchurian")) return "Indo-Chinese Manchurian in bold sauce—sweet, spicy, and savoury.";
      if (n.toLowerCase().includes("chilli")) return "Classic chilli-style Indo-Chinese with capsicum, onion, and a spicy glaze.";
      return "Indo-Chinese favourite made hot and fresh with our spicy sauce.";
    case "Fries & More":
      if (n.toLowerCase().includes("peri")) return "Crispy fries dusted with peri peri masala—spicy and tangy.";
      if (n.toLowerCase().includes("honey")) return "Crispy potatoes tossed in honey chilli sauce—sweet heat in every bite.";
      return "Crispy, golden snack—perfect with dips.";
    case "Parathas & Rolls":
      if (n.toLowerCase().includes("roll")) return "Wrapped and rolled for the perfect on-the-go bite—spicy, filling, satisfying.";
      return "Stuffed paratha made fresh—crispy edges, soft centre, and full of flavour.";
    case "Shakes":
      return "Thick, creamy shake blended ice-cold—smooth, sweet, and super refreshing.";
    case "Mojitos":
      return "Refreshing cooler with minty freshness and citrus zing—served chilled.";
    case "Crispy Bites":
      if (n.toLowerCase().includes("fish")) return "Crispy fried fish with bold seasoning—great with a squeeze of lemon.";
      return "Crispy, golden fried goodness—best enjoyed hot.";
    case "Soft Drinks":
      return "Ice-cold, fizzy refreshment—perfect with spicy snacks and meals.";
    default:
      return "";
  }
}

function defaultAddonsForItem(item: MenuItemInput): MenuAddon[] {
  switch (item.category) {
    case "Chef Specials":
      return [...ADDONS_BREADS, ...ADDONS_SIDES];
    case "Momo Mania":
      return [...ADDONS_MOMO];
    case "Rice Royale":
      if (item.name.toLowerCase().includes("biryani")) {
        return [...ADDONS_RICE, { id: "ia-extra-chicken-biryani", name: "Extra Chicken", price: 60 }];
      }
      return [...ADDONS_RICE];
    case "Pizza Zone":
      return [...ADDONS_PIZZA];
    case "Parathas & Rolls":
      return [
        { id: "ia-extra-butter", name: "Extra Butter", price: 15 },
        { id: "ia-pickle", name: "Pickle", price: 10 },
        { id: "ia-raita-paratha", name: "Raita", price: 25 },
      ];
    case "Noodle Hub":
      return [...ADDONS_NOODLES];
    case "Spicy Chinese":
      return [
        { id: "ia-extra-sauce", name: "Extra Sauce", price: 25 },
        { id: "ia-extra-capsicum", name: "Extra Capsicum", price: 20 },
        { id: "ia-extra-onion", name: "Extra Onion", price: 15 },
      ];
    case "Fries & More":
      return [...ADDONS_FRIES];
    case "Shakes":
      return [...ADDONS_SHAKES];
    case "Mojitos":
      return [...ADDONS_MOJITOS];
    case "Crispy Bites":
      return [
        { id: "ia-lemon-wedge", name: "Lemon Wedge", price: 5 },
        { id: "ia-mint-mayo-dip", name: "Mint Mayo Dip", price: 20 },
        { id: "ia-spicy-dip", name: "Spicy Dip", price: 20 },
      ];
    case "Tandoor Breads":
      return [{ id: "ia-extra-butter-bread", name: "Extra Butter", price: 10 }];
    case "Soft Drinks":
      return [...ADDONS_SOFT_DRINKS];
    default:
      return [];
  }
}

const menuItemsRaw: MenuItemInput[] = [
  // Mojitos
  {
    id: "virgin-mojito",
    name: "Virgin Mojito",
    category: "Mojitos",
    image: u("photo-1513558161293-cdaf765ed2fd"),
    isVeg: true,
    variations: [{ id: "virgin-mojito", name: "Regular", price: 150 }],
  },
  {
    id: "watermelon-cooler",
    name: "Watermelon Cooler",
    category: "Mojitos",
    image: u("photo-1514362545857-3bc16c4c7d1b"),
    isVeg: true,
    variations: [{ id: "watermelon-cooler", name: "Regular", price: 150 }],
  },
  {
    id: "blue-thunder",
    name: "Blue Thunder",
    category: "Mojitos",
    image: u("photo-1513558161293-cdaf765ed2fd"),
    isVeg: true,
    variations: [{ id: "blue-thunder", name: "Regular", price: 150 }],
  },
  {
    id: "strawberry-mojito",
    name: "Strawberry Mojito",
    category: "Mojitos",
    image: u("photo-1497534446932-c925b458314e"),
    isVeg: true,
    variations: [{ id: "strawberry-mojito", name: "Regular", price: 150 }],
  },
  {
    id: "green-apple",
    name: "Green Apple",
    category: "Mojitos",
    image: u("photo-1546171753-97d7676e4602"),
    isVeg: true,
    variations: [{ id: "green-apple", name: "Regular", price: 150 }],
  },

  // Shakes
  {
    id: "mango-blast",
    name: "Mango Blast",
    category: "Shakes",
    image: u("photo-1623065422902-30a2d299bbe4"),
    isVeg: true,
    variations: [{ id: "mango-blast", name: "Regular", price: 160 }],
  },
  {
    id: "blackcurrent-blast",
    name: "Blackcurrent Blast",
    category: "Shakes",
    image: u("photo-1577805947697-89e18249d767"),
    isVeg: true,
    variations: [{ id: "blackcurrent-blast", name: "Regular", price: 160 }],
  },
  {
    id: "true-vanilla",
    name: "True Vanilla",
    category: "Shakes",
    image: u("photo-1579954115545-a95591f28bfc"),
    isVeg: true,
    variations: [{ id: "true-vanilla", name: "Regular", price: 160 }],
  },
  {
    id: "classic-chocolate",
    name: "Classic Chocolate",
    category: "Shakes",
    image: u("photo-1572490122747-3968b75cc699"),
    isVeg: true,
    variations: [{ id: "classic-chocolate", name: "Regular", price: 160 }],
  },
  {
    id: "kit-kat-milkshake",
    name: "Kit Kat Milkshake",
    category: "Shakes",
    image: u("photo-1619158403521-254fe32f5cb0"),
    isVeg: true,
    variations: [{ id: "kit-kat-milkshake", name: "Regular", price: 160 }],
  },
  {
    id: "cold-coffee",
    name: "Cold Coffee",
    category: "Shakes",
    image: u("photo-1461023058943-07fcbe16d735"),
    isVeg: true,
    variations: [{ id: "cold-coffee", name: "Regular", price: 160 }],
  },
  {
    id: "strawberry-sweetness",
    name: "Strawberry Sweetness",
    category: "Shakes",
    image: u("photo-1497534446932-c925b458314e"),
    isVeg: true,
    variations: [{ id: "strawberry-sweetness", name: "Regular", price: 160 }],
  },
  {
    id: "oreo-biscuit",
    name: "Oreo Biscuit",
    category: "Shakes",
    image: u("photo-1572490122747-3968b75cc699"),
    isVeg: true,
    variations: [{ id: "oreo-biscuit", name: "Regular", price: 160 }],
  },

  // Soft Drinks
  {
    id: "coke",
    name: "Coca-Cola",
    category: "Soft Drinks",
    image: u("photo-1551024709-8f23befc6f87"),
    isVeg: true,
    variations: [
      { id: "coke-250", name: "250 ml", price: 40 },
      { id: "coke-500", name: "500 ml", price: 70 },
    ],
  },
  {
    id: "pepsi",
    name: "Pepsi",
    category: "Soft Drinks",
    image: u("photo-1551024709-8f23befc6f87"),
    isVeg: true,
    variations: [
      { id: "pepsi-250", name: "250 ml", price: 40 },
      { id: "pepsi-500", name: "500 ml", price: 70 },
    ],
  },
  {
    id: "mountain-dew",
    name: "Mountain Dew",
    category: "Soft Drinks",
    image: u("photo-1551024709-8f23befc6f87"),
    isVeg: true,
    variations: [
      { id: "dew-250", name: "250 ml", price: 40 },
      { id: "dew-500", name: "500 ml", price: 70 },
    ],
  },

  // Momo Mania
  {
    id: "fried-chicken-momo",
    name: "Fried Chicken Momo",
    category: "Momo Mania",
    image: u("photo-1626776876729-bab4369a5a5e"),
    isVeg: false,
    variations: [{ id: "fried-chicken-momo", name: "Plate", price: 120 }],
  },
  {
    id: "steamed-chicken-momo",
    name: "Steamed Chicken Momo",
    category: "Momo Mania",
    image: u("photo-1496116218417-1a781b1c416c"),
    isVeg: false,
    variations: [{ id: "steamed-chicken-momo", name: "Plate", price: 120 }],
  },
  {
    id: "tandoori-chicken-momo",
    name: "Tandoori Chicken Momo",
    category: "Momo Mania",
    image: u("photo-1601050690597-df0568f70950"),
    isVeg: false,
    variations: [{ id: "tandoori-chicken-momo", name: "Plate", price: 160 }],
  },

  // Crispy Bites
  {
    id: "fried-chicken",
    name: "Fried Chicken",
    category: "Crispy Bites",
    image: u("photo-1626082926499-eeaf5ee27f95"),
    isVeg: false,
    variations: [
      { id: "fried-chicken-half", name: "Half", price: 250 },
      { id: "fried-chicken-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "fried-fish",
    name: "Fried Fish",
    category: "Crispy Bites",
    image: u("photo-1544943910-4c1dc44aab44"),
    isVeg: false,
    variations: [{ id: "fried-fish", name: "1 KG", price: 500 }],
  },

  // Chef Specials
  {
    id: "butter-chicken",
    name: "Butter Chicken",
    category: "Chef Specials",
    image: u("photo-1603894584373-5ac82b2ae398"),
    isVeg: false,
    variations: [
      { id: "butter-chicken-half", name: "Half", price: 300 },
      { id: "butter-chicken-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "kadai-chicken",
    name: "Kadai Chicken",
    category: "Chef Specials",
    image: u("photo-1588166524941-3bf61a9c41db"),
    isVeg: false,
    variations: [
      { id: "kadai-chicken-half", name: "Half", price: 300 },
      { id: "kadai-chicken-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "masala-chicken",
    name: "Masala Chicken",
    category: "Chef Specials",
    image: u("photo-1604908176997-125f25cc6f3d"),
    isVeg: false,
    variations: [
      { id: "masala-chicken-half", name: "Half", price: 300 },
      { id: "masala-chicken-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "special-chicken",
    name: "Special Chicken",
    category: "Chef Specials",
    image: u("photo-1603360946369-dc9bb6258143"),
    isVeg: false,
    variations: [
      { id: "special-chicken-half", name: "Half", price: 350 },
      { id: "special-chicken-full", name: "Full", price: 650 },
    ],
  },
  {
    id: "tandoori-chicken",
    name: "Tandoori Chicken",
    category: "Chef Specials",
    image: u("photo-1610057099431-d73a1c9d2f2f"),
    isVeg: false,
    variations: [
      { id: "tandoori-chicken-half", name: "Half", price: 300 },
      { id: "tandoori-chicken-full", name: "Full", price: 550 },
    ],
  },

  // Tandoor Breads
  {
    id: "plain-naan",
    name: "Plain Naan",
    category: "Tandoor Breads",
    image: u("photo-1601050690597-df0568f70950"),
    isVeg: true,
    variations: [{ id: "plain-naan", name: "Single", price: 30 }],
  },
  {
    id: "butter-naan",
    name: "Butter Naan",
    category: "Tandoor Breads",
    image: u("photo-1601050690597-df0568f70950"),
    isVeg: true,
    variations: [{ id: "butter-naan", name: "Single", price: 40 }],
  },
  {
    id: "butter-garlic-naan",
    name: "Butter Garlic Naan",
    category: "Tandoor Breads",
    image: u("photo-1626074357427-bfda8a5e1f6d"),
    isVeg: true,
    variations: [{ id: "butter-garlic-naan", name: "Single", price: 50 }],
  },
  {
    id: "tandoori-roti",
    name: "Tandoori Roti",
    category: "Tandoor Breads",
    image: u("photo-1512058564366-18510be2db19"),
    isVeg: true,
    variations: [{ id: "tandoori-roti", name: "Single", price: 20 }],
  },
  {
    id: "butter-tandoori-roti",
    name: "Butter Tandoori Roti",
    category: "Tandoor Breads",
    image: u("photo-1512058564366-18510be2db19"),
    isVeg: true,
    variations: [{ id: "butter-tandoori-roti", name: "Single", price: 25 }],
  },
  {
    id: "tawa-roti",
    name: "Tawa Roti",
    category: "Tandoor Breads",
    image: u("photo-1603360946369-dc9bb6258143"),
    isVeg: true,
    variations: [{ id: "tawa-roti", name: "Single", price: 15 }],
  },
  {
    id: "butter-tawa-roti",
    name: "Butter Tawa Roti",
    category: "Tandoor Breads",
    image: u("photo-1603360946369-dc9bb6258143"),
    isVeg: true,
    variations: [{ id: "butter-tawa-roti", name: "Single", price: 20 }],
  },

  // Rice Royale
  {
    id: "fried-chicken-biryani",
    name: "Fried Chicken Biryani",
    category: "Rice Royale",
    image: u("photo-1563379091339-03246963ba2b"),
    isVeg: false,
    variations: [
      { id: "fried-chicken-biryani-half", name: "Half", price: 100 },
      { id: "fried-chicken-biryani-full", name: "Full", price: 180 },
    ],
  },
  {
    id: "dum-chicken-biryani",
    name: "Dum Chicken Biryani",
    category: "Rice Royale",
    image: u("photo-1631515243349-e0cb75fb8d3a"),
    isVeg: false,
    variations: [
      { id: "dum-chicken-biryani-half", name: "Half", price: 100 },
      { id: "dum-chicken-biryani-full", name: "Full", price: 180 },
    ],
  },
  {
    id: "veg-fried-rice",
    name: "Veg. Fried Rice",
    category: "Rice Royale",
    image: u("photo-1512058564366-18510be2db19"),
    isVeg: true,
    variations: [
      { id: "veg-fried-rice-half", name: "Half", price: 90 },
      { id: "veg-fried-rice-full", name: "Full", price: 170 },
    ],
  },
  {
    id: "schezwan-fried-rice-veg",
    name: "Schezwan Fried Rice (V)",
    category: "Rice Royale",
    image: u("photo-1512058564366-18510be2db19"),
    isVeg: true,
    variations: [
      { id: "schezwan-fried-rice-veg-half", name: "Half", price: 100 },
      { id: "schezwan-fried-rice-veg-full", name: "Full", price: 180 },
    ],
  },
  {
    id: "chicken-fried-rice",
    name: "Chicken Fried Rice",
    category: "Rice Royale",
    image: u("photo-1603133872878-684f208fb84b"),
    isVeg: false,
    variations: [
      { id: "chicken-fried-rice-half", name: "Half", price: 120 },
      { id: "chicken-fried-rice-full", name: "Full", price: 220 },
    ],
  },
  {
    id: "schezwan-fried-rice-nonveg",
    name: "Schezwan Fried Rice (N)",
    category: "Rice Royale",
    image: u("photo-1603133872878-684f208fb84b"),
    isVeg: false,
    variations: [
      { id: "schezwan-fried-rice-nonveg-half", name: "Half", price: 130 },
      { id: "schezwan-fried-rice-nonveg-full", name: "Full", price: 240 },
    ],
  },
  {
    id: "egg-fried-rice",
    name: "Egg Fried Rice",
    category: "Rice Royale",
    image: u("photo-1603133872878-684f208fb84b"),
    isVeg: false,
    variations: [
      { id: "egg-fried-rice-half", name: "Half", price: 110 },
      { id: "egg-fried-rice-full", name: "Full", price: 200 },
    ],
  },

  // Pizza Zone
  {
    id: "cheesy-bliss-pizza",
    name: "Cheesy Bliss Pizza",
    category: "Pizza Zone",
    image: u("photo-1513104890138-7c749354f784"),
    isVeg: true,
    variations: [
      { id: "cheesy-bliss-pizza-small", name: "Small", price: 180 },
      { id: "cheesy-bliss-pizza-large", name: "Large", price: 400 },
    ],
  },
  {
    id: "cheesy-corn-burst",
    name: "Cheesy Corn Burst",
    category: "Pizza Zone",
    image: u("photo-1513104890138-7c749354f784"),
    isVeg: true,
    variations: [
      { id: "cheesy-corn-burst-small", name: "Small", price: 200 },
      { id: "cheesy-corn-burst-large", name: "Large", price: 450 },
    ],
  },
  {
    id: "veggie-supreme",
    name: "Veggie Supreme",
    category: "Pizza Zone",
    image: u("photo-1571407970349-bc81e7e96d47"),
    isVeg: true,
    variations: [
      { id: "veggie-supreme-small", name: "Small", price: 250 },
      { id: "veggie-supreme-large", name: "Large", price: 550 },
    ],
  },
  {
    id: "chicken-feast-pizza",
    name: "Chicken Feast Pizza",
    category: "Pizza Zone",
    image: u("photo-1628840042765-356cda07504e"),
    isVeg: false,
    variations: [
      { id: "chicken-feast-pizza-small", name: "Small", price: 280 },
      { id: "chicken-feast-pizza-large", name: "Large", price: 600 },
    ],
  },
  {
    id: "chicken-royale-pizza",
    name: "Chicken Royale Pizza",
    category: "Pizza Zone",
    image: u("photo-1628840042765-356cda07504e"),
    isVeg: false,
    variations: [
      { id: "chicken-royale-pizza-small", name: "Small", price: 350 },
      { id: "chicken-royale-pizza-large", name: "Large", price: 650 },
    ],
  },
  {
    id: "veg-royale-pizza",
    name: "Veg Royale Pizza",
    category: "Pizza Zone",
    image: u("photo-1571407970349-bc81e7e96d47"),
    isVeg: true,
    variations: [
      { id: "veg-royale-pizza-small", name: "Small", price: 280 },
      { id: "veg-royale-pizza-large", name: "Large", price: 600 },
    ],
  },

  // Parathas & Rolls
  {
    id: "chicken-paratha",
    name: "Chicken Paratha",
    category: "Parathas & Rolls",
    image: u("photo-1626132647523-66e0f9d7d5dd"),
    isVeg: false,
    variations: [{ id: "chicken-paratha", name: "Single", price: 150 }],
  },
  {
    id: "cheese-paratha",
    name: "Cheese Paratha",
    category: "Parathas & Rolls",
    image: u("photo-1626132647523-66e0f9d7d5dd"),
    isVeg: true,
    variations: [{ id: "cheese-paratha", name: "Single", price: 120 }],
  },
  {
    id: "aloo-paratha",
    name: "Aloo Paratha",
    category: "Parathas & Rolls",
    image: u("photo-1512058564366-18510be2db19"),
    isVeg: true,
    variations: [{ id: "aloo-paratha", name: "Single", price: 80 }],
  },
  {
    id: "egg-roll",
    name: "Egg Roll",
    category: "Parathas & Rolls",
    image: u("photo-1529692236671-f1f6cf9683ba"),
    isVeg: false,
    variations: [{ id: "egg-roll", name: "Single", price: 70 }],
  },
  {
    id: "chicken-roll",
    name: "Chicken Roll",
    category: "Parathas & Rolls",
    image: u("photo-1529692236671-f1f6cf9683ba"),
    isVeg: false,
    variations: [{ id: "chicken-roll", name: "Single", price: 150 }],
  },
  {
    id: "egg-chicken-roll",
    name: "Egg + Chicken Roll",
    category: "Parathas & Rolls",
    image: u("photo-1529692236671-f1f6cf9683ba"),
    isVeg: false,
    variations: [{ id: "egg-chicken-roll", name: "Single", price: 170 }],
  },

  // Noodle Hub
  {
    id: "veg-chowmein",
    name: "Veg. Chowmein",
    category: "Noodle Hub",
    image: u("photo-1612929633738-8fe44f7ec841"),
    isVeg: true,
    variations: [
      { id: "veg-chowmein-half", name: "Half", price: 90 },
      { id: "veg-chowmein-full", name: "Full", price: 170 },
    ],
  },
  {
    id: "veg-schezwan-noodles",
    name: "Veg Schezwan Noodles",
    category: "Noodle Hub",
    image: u("photo-1612929633738-8fe44f7ec841"),
    isVeg: true,
    variations: [
      { id: "veg-schezwan-noodles-half", name: "Half", price: 100 },
      { id: "veg-schezwan-noodles-full", name: "Full", price: 180 },
    ],
  },
  {
    id: "egg-chowmein",
    name: "Egg Chowmein",
    category: "Noodle Hub",
    image: u("photo-1617093727343-374954b7b0d6"),
    isVeg: false,
    variations: [
      { id: "egg-chowmein-half", name: "Half", price: 110 },
      { id: "egg-chowmein-full", name: "Full", price: 200 },
    ],
  },
  {
    id: "chicken-chowmein",
    name: "Chicken Chowmein",
    category: "Noodle Hub",
    image: u("photo-1617093727343-374954b7b0d6"),
    isVeg: false,
    variations: [
      { id: "chicken-chowmein-half", name: "Half", price: 120 },
      { id: "chicken-chowmein-full", name: "Full", price: 220 },
    ],
  },
  {
    id: "chicken-schezwan-noodles",
    name: "Chicken Schezwan Noodles",
    category: "Noodle Hub",
    image: u("photo-1617093727343-374954b7b0d6"),
    isVeg: false,
    variations: [
      { id: "chicken-schezwan-noodles-half", name: "Half", price: 140 },
      { id: "chicken-schezwan-noodles-full", name: "Full", price: 250 },
    ],
  },

  // Spicy Chinese
  {
    id: "egg-chilli",
    name: "Egg Chilli",
    category: "Spicy Chinese",
    image: u("photo-1599487488170-d11ec9c172f0"),
    isVeg: false,
    variations: [
      { id: "egg-chilli-half", name: "Half", price: 150 },
      { id: "egg-chilli-full", name: "Full", price: 280 },
    ],
  },
  {
    id: "egg-manchurian",
    name: "Egg Manchurian",
    category: "Spicy Chinese",
    image: u("photo-1599487488170-d11ec9c172f0"),
    isVeg: false,
    variations: [
      { id: "egg-manchurian-half", name: "Half", price: 180 },
      { id: "egg-manchurian-full", name: "Full", price: 320 },
    ],
  },
  {
    id: "chilli-chicken",
    name: "Chilli Chicken",
    category: "Spicy Chinese",
    image: u("photo-1599487488170-d11ec9c172f0"),
    isVeg: false,
    variations: [
      { id: "chilli-chicken-half", name: "Half", price: 280 },
      { id: "chilli-chicken-full", name: "Full", price: 520 },
    ],
  },
  {
    id: "chicken-kanti",
    name: "Chicken Kanti",
    category: "Spicy Chinese",
    image: u("photo-1599487488170-d11ec9c172f0"),
    isVeg: false,
    variations: [
      { id: "chicken-kanti-half", name: "Half", price: 300 },
      { id: "chicken-kanti-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "crispy-chilli-chicken",
    name: "Crispy Chilli Chicken",
    category: "Spicy Chinese",
    image: u("photo-1599487488170-d11ec9c172f0"),
    isVeg: false,
    variations: [
      { id: "crispy-chilli-chicken-half", name: "Half", price: 300 },
      { id: "crispy-chilli-chicken-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "chicken-manchurian",
    name: "Chicken Manchurian",
    category: "Spicy Chinese",
    image: u("photo-1599487488170-d11ec9c172f0"),
    isVeg: false,
    variations: [
      { id: "chicken-manchurian-half", name: "Half", price: 300 },
      { id: "chicken-manchurian-full", name: "Full", price: 550 },
    ],
  },
  {
    id: "fish-chilli",
    name: "Fish Chilli",
    category: "Spicy Chinese",
    image: u("photo-1544943910-4c1dc44aab44"),
    isVeg: false,
    variations: [
      { id: "fish-chilli-half", name: "Half", price: 280 },
      { id: "fish-chilli-full", name: "Full", price: 520 },
    ],
  },

  // Fries & More
  {
    id: "french-fries",
    name: "French Fries",
    category: "Fries & More",
    image: u("photo-1573080496219-bb080dd4f877"),
    isVeg: true,
    variations: [
      { id: "french-fries-half", name: "Half", price: 70 },
      { id: "french-fries-full", name: "Full", price: 120 },
    ],
  },
  {
    id: "peri-peri-fries",
    name: "Peri Peri Fries",
    category: "Fries & More",
    image: u("photo-1573080496219-bb080dd4f877"),
    isVeg: true,
    variations: [
      { id: "peri-peri-fries-half", name: "Half", price: 80 },
      { id: "peri-peri-fries-full", name: "Full", price: 140 },
    ],
  },
  {
    id: "chilli-potato",
    name: "Chilli Potato",
    category: "Fries & More",
    image: u("photo-1606755962773-d324e0a13086"),
    isVeg: true,
    variations: [
      { id: "chilli-potato-half", name: "Half", price: 100 },
      { id: "chilli-potato-full", name: "Full", price: 180 },
    ],
  },
  {
    id: "honey-chilli-potato",
    name: "Honey Chilli Potato",
    category: "Fries & More",
    image: u("photo-1606755962773-d324e0a13086"),
    isVeg: true,
    variations: [
      { id: "honey-chilli-potato-half", name: "Half", price: 120 },
      { id: "honey-chilli-potato-full", name: "Full", price: 220 },
    ],
  },
];

export const menuItems: MenuItem[] = menuItemsRaw.map((item) => ({
  ...item,
  description: item.description ?? defaultDescriptionForItem(item),
  addons: item.addons ?? defaultAddonsForItem(item),
}));


const defaultCombos: MenuCombo[] = [
  {
    id: "combo-veg-feast",
    name: "Veg Feast Combo",
    description: "Margherita Small + Fries Half + Cold Coffee",
    image: u("photo-1574071318508-1cdbab80d002"),
    price: 449,
    isVeg: true,
    available: true,
    components: [
      { itemId: "margherita-classic", variationId: "mg-small", quantity: 1 },
      { itemId: "french-fries", variationId: "ff-half", quantity: 1 },
      { itemId: "cold-coffee", variationId: "ccf-reg", quantity: 1 },
    ],
  },
  {
    id: "combo-momo-shake",
    name: "Momo & Shake",
    description: "Veg Steam Momos 8pc + Oreo Biscuit Shake",
    image: u("photo-1525755662778-bafe5cb41721"),
    price: 229,
    isVeg: true,
    available: true,
    components: [
      { itemId: "veg-steam-momo", variationId: "vsm-8", quantity: 1 },
      { itemId: "oreo-biscuit-shake", variationId: "obs-reg", quantity: 1 },
    ],
  },
  {
    id: "combo-nonveg-binge",
    name: "Non-Veg Binge",
    description: "Chicken Royale Large + Peri Peri Fries Full",
    image: u("photo-1628840042765-356cda07504e"),
    price: 699,
    isVeg: false,
    available: true,
    components: [
      { itemId: "chicken-royale-pizza", variationId: "cr-large", quantity: 1 },
      { itemId: "peri-peri-fries", variationId: "ppf-full", quantity: 1 },
    ],
  },
  {
    id: "combo-cheesy-mojito",
    name: "Cheesy & Mojito",
    description: "Cheesy Bliss Large + Green Apple Mojito",
    image: u("photo-1513104890138-7c749354f784"),
    price: 479,
    isVeg: true,
    available: true,
    components: [
      { itemId: "cheesy-bliss-pizza", variationId: "cb-large", quantity: 1 },
      { itemId: "green-mojito", variationId: "gam-reg", quantity: 1 },
    ],
  },
  {
    id: "combo-naan-biryani",
    name: "Naan & Biryani",
    description: "2× Butter Naan + Veg Dum Biryani Half",
    image: u("photo-1601050690597-df0568f70950"),
    price: 165,
    isVeg: true,
    available: true,
    components: [
      { itemId: "butter-naan", variationId: "bn-1", quantity: 2 },
      { itemId: "veg-dum-biryani", variationId: "vdb-half", quantity: 1 },
    ],
  },
  {
    id: "combo-double-fries",
    name: "Double Fries Deal",
    description: "2× French Fries Full",
    image: u("photo-1573080496219-bb080dd4f877"),
    price: 199,
    isVeg: true,
    available: true,
    components: [
      { itemId: "french-fries", variationId: "ff-full", quantity: 2 },
    ],
  },
  {
    id: "combo-margherita-virgin",
    name: "Pizza & Mojito Lite",
    description: "Margherita Small + Virgin Mojito",
    image: u("photo-1574071318508-1cdbab80d002"),
    price: 299,
    isVeg: true,
    available: true,
    components: [
      { itemId: "margherita-classic", variationId: "mg-small", quantity: 1 },
      { itemId: "virgin-mojito", variationId: "vm-reg", quantity: 1 },
    ],
  },
  {
    id: "combo-roll-peri",
    name: "Roll & Peri Fries",
    description: "Chicken Egg Roll + Peri Peri Fries Half",
    image: u("photo-1529692236671-f1f6cf9683ba"),
    price: 169,
    isVeg: false,
    available: true,
    components: [
      { itemId: "egg-chicken-roll", variationId: "cer-1", quantity: 1 },
      { itemId: "peri-peri-fries", variationId: "ppf-half", quantity: 1 },
    ],
  },
  {
    id: "combo-butter-chicken-breads",
    name: "Butter Chicken Meal",
    description: "Butter Chicken Half + Garlic Naan + Butter Naan",
    image: u("photo-1603894584373-5ac82b2ae398"),
    price: 369,
    isVeg: false,
    available: true,
    components: [
      { itemId: "butter-chicken", variationId: "bc-half", quantity: 1 },
      { itemId: "garlic-naan", variationId: "gn-1", quantity: 1 },
      { itemId: "butter-naan", variationId: "bn-1", quantity: 1 },
    ],
  },
  {
    id: "combo-chicken-momo-coffee",
    name: "Chicken Momos & Coffee",
    description: "Chicken Steam Momos 12pc + Cold Coffee",
    image: u("photo-1496116218417-1a781b1c416c"),
    price: 299,
    isVeg: false,
    available: true,
    components: [
      { itemId: "chicken-steam-momo", variationId: "csm-12", quantity: 1 },
      { itemId: "cold-coffee", variationId: "ccf-reg", quantity: 1 },
    ],
  },
  {
    id: "combo-indo-chinese",
    name: "Indo-Chinese Spread",
    description: "Chicken Chowmein Full + Chilli Chicken Half",
    image: u("photo-1617093727343-374954b7b0d6"),
    price: 449,
    isVeg: false,
    available: true,
    components: [
      { itemId: "chicken-chowmein", variationId: "cc-full", quantity: 1 },
      { itemId: "chilli-chicken", variationId: "chc-half", quantity: 1 },
    ],
  },
  {
    id: "combo-paratha-coffee",
    name: "Paratha & Coffee",
    description: "Paneer Paratha + Cold Coffee",
    image: u("photo-1606491956689-2eae86667875"),
    price: 219,
    isVeg: true,
    available: true,
    components: [
      { itemId: "paneer-paratha", variationId: "pp-1", quantity: 1 },
      { itemId: "cold-coffee", variationId: "ccf-reg", quantity: 1 },
    ],
  },
  {
    id: "combo-fried-fries",
    name: "Fried Chicken & Fries",
    description: "Fried Chicken Half + French Fries Full",
    image: u("photo-1626082926499-eeaf5ee27f95"),
    price: 329,
    isVeg: false,
    available: true,
    components: [
      { itemId: "fried-chicken", variationId: "fc-half", quantity: 1 },
      { itemId: "french-fries", variationId: "ff-full", quantity: 1 },
    ],
  },
];

export function getDefaultMenuPayload(): MenuPayload {
  return {
    categories: [...MENU_CATEGORIES],
    globalAddons: structuredClone(GLOBAL_ADDONS),
    items: structuredClone(menuItems),
    combos: structuredClone(defaultCombos),
  };
}

export function getItemById(
  items: MenuItem[],
  id: string,
): MenuItem | undefined {
  return items.find((i) => i.id === id);
}

export function getAddonsForItem(
  item: MenuItem,
  globalAddons: MenuAddon[],
): MenuAddon[] {
  return [...item.addons, ...globalAddons];
}
