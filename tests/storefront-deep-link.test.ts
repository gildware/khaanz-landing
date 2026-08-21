import assert from "node:assert/strict";
import test from "node:test";

import { COMBOS_TAB_ID } from "../src/lib/menu-combos";
import { resolveStorefrontDeepLink } from "../src/lib/storefront-deep-link";
import type { MenuCategoryDef } from "../src/types/menu-category";
import type { MenuCombo, MenuItem } from "../src/types/menu";

function cat(name: string, available = true): MenuCategoryDef {
  return {
    name,
    image: "/x.jpg",
    icon: "utensils-crossed",
    available,
  };
}

function item(
  id: string,
  name: string,
  category: string,
  extra: Partial<MenuItem> = {},
): MenuItem {
  return {
    id,
    name,
    category,
    description: "",
    image: "/x.jpg",
    isVeg: false,
    variations: [{ id: `${id}-reg`, name: "Regular", price: 100 }],
    addons: [],
    available: true,
    ...extra,
  };
}

const categories = [
  cat("Momo Mania"),
  cat("Pizza Zone"),
  cat("Burgers"),
  cat("Parathas & Rolls"),
  cat("Chef Specials"),
  cat("Signature Chicken"),
  cat("Shawarma"),
];

const items: MenuItem[] = [
  item("steamed-chicken-momo", "Steamed Chicken Momo", "Momo Mania"),
  item("khaanz-zinger-burger", "Zinger Burger", "Burgers"),
  item("chicken-roll", "Chicken Roll", "Parathas & Rolls"),
  item("item-mserom13", "Chicken Shawarma", "Shawarma"),
  item("kadai-chicken", "Kadai Chicken", "Chef Specials"),
  item("khaanz-popcorn", "Popcorn Chicken", "Signature Chicken"),
  item("hidden-momo", "Hidden Momo", "Momo Mania", { available: false }),
];

const combos: MenuCombo[] = [
  {
    id: "combo-indo-chinese",
    name: "Indo Chinese",
    description: "",
    image: "/x.jpg",
    price: 199,
    isVeg: false,
    components: [
      {
        itemId: "steamed-chicken-momo",
        variationId: "steamed-chicken-momo-reg",
        quantity: 1,
      },
    ],
  },
];

const base = { items, categories, combos };

test("opens the item by canonical id", () => {
  const r = resolveStorefrontDeepLink({
    ...base,
    itemParam: "steamed-chicken-momo",
    categoryParam: null,
  });
  assert.equal(r.item?.id, "steamed-chicken-momo");
  assert.equal(r.category, "Momo Mania");
});

test("opens the item by display name", () => {
  const r = resolveStorefrontDeepLink({
    ...base,
    itemParam: "Zinger Burger",
    categoryParam: null,
  });
  assert.equal(r.item?.id, "khaanz-zinger-burger");
});

test("resolves campaign aliases to the advertised dish", () => {
  const cases: Array<[string, string]> = [
    ["momo", "steamed-chicken-momo"],
    ["zinger", "khaanz-zinger-burger"],
    ["shawarma", "item-mserom13"],
    ["chicken-shawarma", "item-mserom13"],
    ["kadia-chicken", "kadai-chicken"],
    ["popcorn", "khaanz-popcorn"],
  ];
  for (const [param, id] of cases) {
    const r = resolveStorefrontDeepLink({
      ...base,
      itemParam: param,
      categoryParam: null,
    });
    assert.equal(r.item?.id, id, param);
  }
});

test("falls back to the category when the item is hidden", () => {
  const r = resolveStorefrontDeepLink({
    ...base,
    itemParam: "hidden-momo",
    categoryParam: null,
  });
  assert.equal(r.item, null);
  assert.equal(r.category, "Momo Mania");
});

test("selects a category by name or slug", () => {
  const byName = resolveStorefrontDeepLink({
    ...base,
    itemParam: null,
    categoryParam: "Pizza Zone",
  });
  assert.equal(byName.item, null);
  assert.equal(byName.category, "Pizza Zone");

  const byAlias = resolveStorefrontDeepLink({
    ...base,
    itemParam: null,
    categoryParam: "pizza",
  });
  assert.equal(byAlias.category, "Pizza Zone");

  const parathas = resolveStorefrontDeepLink({
    ...base,
    itemParam: null,
    categoryParam: "parathas",
  });
  assert.equal(parathas.category, "Parathas & Rolls");
});

test("selects the combos tab", () => {
  const r = resolveStorefrontDeepLink({
    ...base,
    itemParam: null,
    categoryParam: "combos",
  });
  assert.equal(r.category, COMBOS_TAB_ID);
});

test("ignores unknown params", () => {
  const r = resolveStorefrontDeepLink({
    ...base,
    itemParam: "not-a-dish",
    categoryParam: "not-a-category",
  });
  assert.equal(r.item, null);
  assert.equal(r.category, null);
});
