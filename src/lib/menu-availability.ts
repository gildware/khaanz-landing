import type { MenuItem } from "@/types/menu";

/** Matches admin UI: ON when omitted or true; OFF only when explicitly false. */
export function isMenuItemAvailable(item: MenuItem): boolean {
  return item.available !== false;
}
