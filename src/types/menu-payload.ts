import type { MenuAddon, MenuCombo, MenuItem } from "@/types/menu";

/** Full menu document persisted to data/menu.json */
export interface MenuPayload {
  categories: string[];
  globalAddons: MenuAddon[];
  items: MenuItem[];
  combos: MenuCombo[];
}
