"use client";

import { useMenuData } from "@/contexts/menu-data-context";

export default function AdminDashboardPage() {
  const { data } = useMenuData();

  const categories = data?.categories ?? [];
  const items = data?.items ?? [];
  const addons = data?.globalAddons ?? [];
  const combos = data?.combos ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Menu is stored in <code className="text-xs">data/menu.json</code> and
          served via <code className="text-xs">/api/menu</code>. The storefront
          refreshes every few seconds.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Categories</p>
          <p className="font-semibold text-3xl tabular-nums">
            {categories.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Menu items</p>
          <p className="font-semibold text-3xl tabular-nums">{items.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Combos</p>
          <p className="font-semibold text-3xl tabular-nums">{combos.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Global add-ons</p>
          <p className="font-semibold text-3xl tabular-nums">{addons.length}</p>
        </div>
      </div>
    </div>
  );
}
