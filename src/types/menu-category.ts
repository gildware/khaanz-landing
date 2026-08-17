/** One top-level menu category (tabs, grouping, admin). */
export interface MenuCategoryDef {
  name: string;
  /** Public URL or `/public` path */
  image: string;
  /** Key from `CATEGORY_ICON_OPTIONS` / `category-icons` map */
  icon: string;
  /** When true, all items in this category are not for sale. */
  notForSale?: boolean;
  /** When false, hidden from the customer website. Omitted/true = visible. */
  available?: boolean;
}
