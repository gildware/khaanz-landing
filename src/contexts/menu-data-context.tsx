"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  const { data, error, isLoading, mutate } = useSWR<MenuPayload>(
    "/api/menu",
    fetcher,
    {
      // Storefront polls for menu changes; admin edits locally and saves explicitly.
      refreshInterval: isAdminRoute ? 0 : 60_000,
      revalidateOnFocus: !isAdminRoute,
      dedupingInterval: 5000,
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
