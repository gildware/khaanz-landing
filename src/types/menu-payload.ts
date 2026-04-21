import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuAddon, MenuCombo, MenuItem } from "@/types/menu";

/** Full menu document loaded from the database (see `readMenuPayload`). */
export interface MenuPayload {
  categories: MenuCategoryDef[];
  globalAddons: MenuAddon[];
  items: MenuItem[];
  combos: MenuCombo[];
}
