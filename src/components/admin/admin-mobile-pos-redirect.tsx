"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAdminSession } from "@/components/admin/admin-session-provider";
import { isMobileView } from "@/lib/is-mobile";

/**
 * On mobile view, any admin panel / desktop POS route sends the user to POS Mobile.
 */
export function AdminMobilePosRedirect({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, can } = useAdminSession();

  useEffect(() => {
    if (loading) return;
    if (!pathname?.startsWith("/admin")) return;
    if (pathname === "/admin/login") return;
    if (pathname.startsWith("/admin/pos/mobile")) return;
    if (!isMobileView()) return;
    if (!can("pos")) return;
    router.replace("/admin/pos/mobile");
  }, [loading, pathname, can, router]);

  return children;
}
