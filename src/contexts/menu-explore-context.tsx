"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useMenuData } from "@/contexts/menu-data-context";
import { COMBOS_TAB_ID, isComboAvailable } from "@/lib/menu-combos";
import { isMenuItemAvailable } from "@/lib/menu-availability";

type MenuExploreContextValue = {
  category: string | "all";
  setCategory: (c: string | "all") => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  clearFilters: () => void;
};

const MenuExploreContext = createContext<MenuExploreContextValue | null>(null);

export function MenuExploreProvider({ children }: { children: ReactNode }) {
  const { data } = useMenuData();

  const [category, setCategoryState] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const categories = data?.categories ?? [];
    const items = data?.items ?? [];
    const combos = data?.combos ?? [];
    if (
      category !== "all" &&
      category !== COMBOS_TAB_ID &&
      !categories.some((c) => c.name === category)
    ) {
      setCategoryState("all");
      return;
    }
    if (category === COMBOS_TAB_ID) {
      const hasAvailable = combos.some((c) => isComboAvailable(c, items));
      if (!hasAvailable) {
        setCategoryState("all");
      }
      return;
    }
    if (category !== "all") {
      const hasAvailable = items.some(
        (i) => i.category === category && isMenuItemAvailable(i),
      );
      if (!hasAvailable) {
        setCategoryState("all");
      }
    }
  }, [data?.categories, data?.combos, data?.items, category]);

  const setCategory = useCallback((c: string | "all") => {
    setCategoryState(c);
  }, []);

  const clearFilters = useCallback(() => {
    setCategoryState("all");
    setSearchQuery("");
  }, []);

  const value = useMemo(
    () => ({
      category,
      setCategory,
      searchQuery,
      setSearchQuery,
      clearFilters,
    }),
    [category, setCategory, searchQuery, clearFilters],
  );

  return (
    <MenuExploreContext.Provider value={value}>
      {children}
    </MenuExploreContext.Provider>
  );
}

export function useMenuExplore() {
  const ctx = useContext(MenuExploreContext);
  if (!ctx) {
    throw new Error("useMenuExplore must be used within MenuExploreProvider");
  }
  return ctx;
}
