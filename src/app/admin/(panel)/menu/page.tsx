"use client";

import { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MenuCatalogAddonsPanel } from "@/components/admin/menu-catalog/addons-panel";
import { MenuCatalogCategoriesPanel } from "@/components/admin/menu-catalog/categories-panel";
import { MenuCatalogCombosPanel } from "@/components/admin/menu-catalog/combos-panel";
import { MenuCatalogItemsPanel } from "@/components/admin/menu-catalog/items-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MENU_CATALOG_TABS = ["categories", "items", "combos", "addons"] as const;
type MenuCatalogTab = (typeof MENU_CATALOG_TABS)[number];

function parseTab(v: string | null): MenuCatalogTab {
  if (v && MENU_CATALOG_TABS.includes(v as MenuCatalogTab)) {
    return v as MenuCatalogTab;
  }
  return "categories";
}

function MenuCatalogPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = useMemo(() => parseTab(tabParam), [tabParam]);

  const setTab = useCallback(
    (next: string) => {
      const value = parseTab(next);
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", value);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Menu catalogue</h1>
        <p className="text-muted-foreground text-sm">
          Categories, dishes, combos, and add-ons in one place.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full gap-6">
        <TabsList
          variant="line"
          className="h-auto min-h-9 w-full flex-wrap justify-start gap-0"
        >
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="items">Menu items</TabsTrigger>
          <TabsTrigger value="combos">Combos</TabsTrigger>
          <TabsTrigger value="addons">Add-ons</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-6">
          <MenuCatalogCategoriesPanel />
        </TabsContent>
        <TabsContent value="items" className="space-y-6">
          <MenuCatalogItemsPanel />
        </TabsContent>
        <TabsContent value="combos" className="space-y-6">
          <MenuCatalogCombosPanel />
        </TabsContent>
        <TabsContent value="addons" className="space-y-6">
          <MenuCatalogAddonsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminMenuCatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground text-sm">Loading menu…</div>
      }
    >
      <MenuCatalogPageContent />
    </Suspense>
  );
}
