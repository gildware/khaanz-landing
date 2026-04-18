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
    if (category !== "all" && !categories.includes(category)) {
      setCategoryState("all");
    }
  }, [data?.categories, category]);

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
