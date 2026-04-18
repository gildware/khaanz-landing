"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import useSWR, { type KeyedMutator } from "swr";

import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json() as Promise<RestaurantSettingsPayload>;
};

type Value = {
  data: RestaurantSettingsPayload | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<RestaurantSettingsPayload>;
};

const RestaurantSettingsContext = createContext<Value | null>(null);

export function RestaurantSettingsProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<RestaurantSettingsPayload>(
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
