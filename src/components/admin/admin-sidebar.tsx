"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenIcon,
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
  CalendarDaysIcon,
  HistoryIcon,
  LayoutTemplateIcon,
  SmartphoneIcon,
  KeyRoundIcon,
  WalletIcon,
  ScrollTextIcon,
  PackageSearchIcon,
} from "lucide-react";

import { useAdminSession } from "@/components/admin/admin-session-provider";
import { Button } from "@/components/ui/button";
import type { AdminPermission } from "@/lib/admin-permissions";
import { permittedTabsForPage } from "@/lib/admin-permissions";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const links: {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: AdminPermission;
  /** Page with `?tab=` sections: also show when any of its tabs is permitted. */
  tabHub?: boolean;
  /** Open in a new tab (e.g. POS fullscreen register). */
  openInNewTab?: boolean;
}[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, permission: "dashboard" },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: BarChart3Icon,
    permission: "reports.overview",
    tabHub: true,
  },
  { href: "/admin/daily-report", label: "Daily report", icon: CalendarDaysIcon, permission: "reports.daily_report" },
  {
    href: "/admin/previous-sales",
    label: "Previous day sales",
    icon: HistoryIcon,
    permission: "reports.previous_sales",
  },
  { href: "/admin/cash", label: "Money available", icon: WalletIcon, permission: "reports.cash" },
  { href: "/admin/online-orders", label: "Online orders", icon: ShoppingBagIcon, permission: "online_orders" },
  { href: "/admin/orders", label: "Orders", icon: ClipboardListIcon, permission: "orders" },
  { href: "/admin/inventory", label: "Inventory", icon: WarehouseIcon, permission: "inventory.overview", tabHub: true },
  {
    href: "/admin/stock-usage",
    label: "Stock usage",
    icon: PackageSearchIcon,
    permission: "inventory.stock_usage",
  },
  { href: "/admin/recipes", label: "Recipe book", icon: BookOpenIcon, permission: "inventory.recipe_book" },
  { href: "/admin/wastage", label: "Wastage", icon: Trash2Icon, permission: "wastage.overview", tabHub: true },
  { href: "/admin/vendors", label: "Vendors", icon: HandshakeIcon, permission: "vendors.overview", tabHub: true },
  { href: "/admin/expenses", label: "Expenses", icon: IndianRupeeIcon, permission: "expenses.business", tabHub: true },
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
    permission: "menu.categories",
    tabHub: true,
  },
  {
    href: "/admin/menu-board",
    label: "Menu board",
    icon: ScrollTextIcon,
    permission: "menu.board",
    openInNewTab: true,
  },
  { href: "/admin/home-layout", label: "Home layout", icon: LayoutTemplateIcon, permission: "home_layout" },
  { href: "/admin/payroll", label: "Payroll", icon: UsersIcon, permission: "payroll.employees", tabHub: true },
  { href: "/admin/staff", label: "Staff & logins", icon: KeyRoundIcon, permission: "staff" },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon, permission: "settings.general", tabHub: true },
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

  // Exact permission per link, so a sibling page like Daily report never
  // unlocks Previous day sales. Tab hubs additionally open on any allowed tab.
  const visibleLinks = user
    ? links.filter((l) => {
        if (can(l.permission)) return true;
        if (!l.tabHub) return false;
        const tabs = permittedTabsForPage(
          { role: user.role, permissions: user.permissions },
          l.href,
        );
        return Boolean(tabs?.length);
      })
    : [];
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
