"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  LayersIcon,
  UtensilsCrossedIcon,
  PlusSquareIcon,
  LogOutIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/admin/categories", label: "Categories", icon: LayersIcon },
  { href: "/admin/items", label: "Menu items", icon: UtensilsCrossedIcon },
  { href: "/admin/addons", label: "Add-ons", icon: PlusSquareIcon },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50">
      <div className="border-b border-border p-4">
        <p className="font-semibold">Khaanz Admin</p>
        <p className="text-muted-foreground text-xs">Menu & catalogue</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
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
