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

import type { AdminPermission } from "@/lib/admin-permissions";
import { hasPermission } from "@/lib/admin-permissions";

export type AdminSessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  permissions: AdminPermission[];
};

type AdminSessionContextValue = {
  user: AdminSessionUser | null;
  loading: boolean;
  can: (permission: AdminPermission) => boolean;
  refresh: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(
  null,
);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as { user: AdminSessionUser };
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      user,
      loading,
      can: (permission) =>
        hasPermission(
          user
            ? { role: user.role, permissions: user.permissions }
            : null,
          permission,
        ),
      refresh,
    }),
    [user, loading, refresh],
  );

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSession must be used within AdminSessionProvider");
  }
  return ctx;
}

/** Safe outside provider (e.g. optional gating); returns null context values. */
export function useOptionalAdminSession(): AdminSessionContextValue | null {
  return useContext(AdminSessionContext);
}
