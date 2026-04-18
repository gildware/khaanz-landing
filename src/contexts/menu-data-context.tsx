"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import useSWR, { type KeyedMutator } from "swr";

import type { MenuPayload } from "@/types/menu-payload";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load menu");
  return res.json() as Promise<MenuPayload>;
};

type MenuDataContextValue = {
  data: MenuPayload | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<MenuPayload>;
};

const MenuDataContext = createContext<MenuDataContextValue | null>(null);

export function MenuDataProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<MenuPayload>(
    "/api/menu",
    fetcher,
    {
      refreshInterval: 3000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    },
  );

  return (
    <MenuDataContext.Provider
      value={{
        data,
        error: error as Error | undefined,
        isLoading,
        mutate,
      }}
    >
      {children}
    </MenuDataContext.Provider>
  );
}

export function useMenuData(): MenuDataContextValue {
  const ctx = useContext(MenuDataContext);
  if (!ctx) {
    throw new Error("useMenuData must be used within MenuDataProvider");
  }
  return ctx;
}
