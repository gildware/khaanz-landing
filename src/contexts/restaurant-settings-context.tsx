"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import useSWR, { type KeyedMutator } from "swr";

import type { PublicRestaurantSettings } from "@/types/restaurant-settings";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json() as Promise<PublicRestaurantSettings>;
};

type Value = {
  data: PublicRestaurantSettings | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<PublicRestaurantSettings>;
};

const RestaurantSettingsContext = createContext<Value | null>(null);

export function RestaurantSettingsProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<PublicRestaurantSettings>(
    "/api/settings",
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  return (
    <RestaurantSettingsContext.Provider
      value={{
        data,
        error: error as Error | undefined,
        isLoading,
        mutate,
      }}
    >
      {children}
    </RestaurantSettingsContext.Provider>
  );
}

export function useRestaurantSettings(): Value {
  const ctx = useContext(RestaurantSettingsContext);
  if (!ctx) {
    throw new Error(
      "useRestaurantSettings must be used within RestaurantSettingsProvider",
    );
  }
  return ctx;
}
