"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboardIcon,
  UtensilsCrossedIcon,
  LogOutIcon,
  SettingsIcon,
  ClipboardListIcon,
  ShoppingBagIcon,
  StoreIcon,
  LayoutGridIcon,
  WarehouseIcon,
  UsersIcon,
  IndianRupeeIcon,
  HandshakeIcon,
  Trash2Icon,
  BarChart3Icon,
  LayoutTemplateIcon,
  SmartphoneIcon,
  KeyRoundIcon,
} from "lucide-react";

import { useAdminSession } from "@/components/admin/admin-session-provider";
import { Button } from "@/components/ui/button";
import type { AdminPermission } from "@/lib/admin-permissions";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const links: {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: AdminPermission;
  /** Open in a new tab (e.g. POS fullscreen register). */
  openInNewTab?: boolean;
}[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, permission: "dashboard" },
  { href: "/admin/reports", label: "Reports", icon: BarChart3Icon, permission: "reports" },
  { href: "/admin/online-orders", label: "Online orders", icon: ShoppingBagIcon, permission: "online_orders" },
  { href: "/admin/orders", label: "Orders", icon: ClipboardListIcon, permission: "orders" },
  { href: "/admin/inventory", label: "Inventory", icon: WarehouseIcon, permission: "inventory" },
  { href: "/admin/wastage", label: "Wastage", icon: Trash2Icon, permission: "wastage" },
  { href: "/admin/vendors", label: "Vendors", icon: HandshakeIcon, permission: "vendors" },
  { href: "/admin/expenses", label: "Expenses", icon: IndianRupeeIcon, permission: "expenses" },
  { href: "/admin/floor-plan", label: "Table layout", icon: LayoutGridIcon, permission: "floor_plan" },
  { href: "/admin/pos", label: "POS", icon: StoreIcon, permission: "pos", openInNewTab: true },
  {
    href: "/admin/pos/mobile",
    label: "POS Mobile",
    icon: SmartphoneIcon,
    permission: "pos",
    openInNewTab: true,
  },
  {
    href: "/admin/menu",
    label: "Menu catalogue",
    icon: UtensilsCrossedIcon,
    permission: "menu",
  },
  { href: "/admin/home-layout", label: "Home layout", icon: LayoutTemplateIcon, permission: "home_layout" },
  { href: "/admin/payroll", label: "Payroll", icon: UsersIcon, permission: "payroll" },
  { href: "/admin/staff", label: "Staff & logins", icon: KeyRoundIcon, permission: "staff" },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon, permission: "settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, can } = useAdminSession();

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    router.push("/admin/login");
    router.refresh();
  };

  // While session loads, keep nav visible. SUPER_ADMIN always sees everything.
  // If session fails to load, still show nav so the admin UI is not blank
  // (page/API middleware still enforces permissions).
  const visibleLinks =
    loading || !user || user.role === "SUPER_ADMIN"
      ? links
      : links.filter((l) => can(l.permission));
  const label =
    user?.displayName?.trim() ||
    user?.email ||
    (loading ? "…" : "Staff");

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50">
      <div className="border-b border-border p-4">
        <Link href="/admin/dashboard" className="mb-3 block">
          <span className="relative block h-9 w-36">
            <Image
              src={SITE.logoPath}
              alt={SITE.name}
              fill
              className="object-contain object-left"
              sizes="144px"
            />
          </span>
        </Link>
        <p className="font-semibold truncate">{label}</p>
        <p className="text-muted-foreground text-xs capitalize">
          {user?.role === "SUPER_ADMIN"
            ? "Super admin"
            : user?.role === "STAFF"
              ? "Staff"
              : "Admin"}
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2 overflow-y-auto">
        {visibleLinks.map(({ href, label: linkLabel, icon: Icon, openInNewTab }) => (
          <Link
            key={href}
            href={href}
            prefetch={openInNewTab ? false : undefined}
            target={openInNewTab ? "_blank" : undefined}
            rel={openInNewTab ? "noopener noreferrer" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === href || pathname.startsWith(`${href}/`)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {linkLabel}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => void logout()}
        >
          <LogOutIcon className="size-4" />
          Log out
        </Button>
      </div>
    </aside>
  );
}
