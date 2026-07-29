"use client";

import { Suspense } from "react";
import { ScrollTextIcon } from "lucide-react";
import Link from "next/link";

import { useAdminSession } from "@/components/admin/admin-session-provider";
import { MenuCatalogAddonsPanel } from "@/components/admin/menu-catalog/addons-panel";
import { MenuCatalogCategoriesPanel } from "@/components/admin/menu-catalog/categories-panel";
import { MenuCatalogCombosPanel } from "@/components/admin/menu-catalog/combos-panel";
import { MenuCatalogItemsPanel } from "@/components/admin/menu-catalog/items-panel";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermittedTabs } from "@/hooks/use-permitted-tabs";
import { cn } from "@/lib/utils";

function MenuCatalogPageContent() {
  const { can } = useAdminSession();
  const { activeTab, setActiveTab, canTab } = usePermittedTabs({
    pagePath: "/admin/menu",
    defaultTab: "categories",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Menu catalogue</h1>
          <p className="text-muted-foreground text-sm">
            Categories, dishes, combos, and add-ons in one place.
          </p>
        </div>
        {can("menu.board") ? (
          <Link
            href="/admin/menu-board"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center")}
          >
            <ScrollTextIcon className="mr-2 size-4" aria-hidden />
            View menu board
          </Link>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-6">
        <TabsList
          variant="line"
          className="h-auto min-h-9 w-full flex-wrap justify-start gap-0"
        >
          {canTab("categories") ? (
            <TabsTrigger value="categories">Categories</TabsTrigger>
          ) : null}
          {canTab("items") ? (
            <TabsTrigger value="items">Menu items</TabsTrigger>
          ) : null}
          {canTab("combos") ? (
            <TabsTrigger value="combos">Combos</TabsTrigger>
          ) : null}
          {canTab("addons") ? (
            <TabsTrigger value="addons">Add-ons</TabsTrigger>
          ) : null}
        </TabsList>

        {canTab("categories") ? (
          <TabsContent value="categories" className="space-y-6">
            <MenuCatalogCategoriesPanel />
          </TabsContent>
        ) : null}
        {canTab("items") ? (
          <TabsContent value="items" className="space-y-6">
            <MenuCatalogItemsPanel />
          </TabsContent>
        ) : null}
        {canTab("combos") ? (
          <TabsContent value="combos" className="space-y-6">
            <MenuCatalogCombosPanel />
          </TabsContent>
        ) : null}
        {canTab("addons") ? (
          <TabsContent value="addons" className="space-y-6">
            <MenuCatalogAddonsPanel />
          </TabsContent>
        ) : null}
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
