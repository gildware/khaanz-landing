"use client";

import { useMemo } from "react";

import { MenuCard, MenuCardSkeleton } from "@/components/MenuCard";
import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useMenuData } from "@/contexts/menu-data-context";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import type { MenuItem } from "@/types/menu";

function matchesSearch(item: MenuItem, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    item.name.toLowerCase().includes(s) ||
    item.description.toLowerCase().includes(s) ||
    item.category.toLowerCase().includes(s)
  );
}

export function MenuGrid() {
  const { category, searchQuery } = useMenuExplore();
  const { data } = useMenuData();

  const menuItems = useMemo(
    () => (data?.items ?? []).filter(isMenuItemAvailable),
    [data?.items],
  );
  const categories = useMemo(() => data?.categories ?? [], [data?.categories]);

  const q = searchQuery.trim().toLowerCase();

  const groupedByCategory = useMemo(() => {
    if (category !== "all") return null;

    const rows: { name: string; items: MenuItem[] }[] = [];

    for (const catName of categories) {
      const itemsInCat = menuItems.filter(
        (item) => item.category === catName && matchesSearch(item, q),
      );
      if (itemsInCat.length > 0) {
        rows.push({ name: catName, items: itemsInCat });
      }
    }

    return rows;
  }, [category, categories, menuItems, q]);

  const filteredSingleCategory = useMemo(() => {
    if (category === "all") return null;
    return menuItems.filter((item) => {
      if (item.category !== category) return false;
      return matchesSearch(item, q);
    });
  }, [category, menuItems, q]);

  /** All tab: one horizontal strip per category */
  if (category === "all" && groupedByCategory) {
    if (groupedByCategory.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <p className="font-medium text-muted-foreground">
            No dishes match your filters.
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            Try another category or clear search.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-10">
        {groupedByCategory.map((row, idx) => (
          <section key={row.name} aria-labelledby={`menu-cat-${idx}`}>
            <h3
              id={`menu-cat-${idx}`}
              className="mb-3 px-1 font-heading text-lg font-semibold tracking-tight"
            >
              {row.name}
            </h3>
            <div className="no-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {row.items.map((item) => (
                <div
                  key={item.id}
                  className="w-[min(46vw,200px)] shrink-0 sm:w-[200px]"
                >
                  <MenuCard item={item} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  /** Single category: existing grid */
  const filtered = filteredSingleCategory ?? [];

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <p className="font-medium text-muted-foreground">
          No dishes match your filters.
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          Try another category or clear search.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 items-start gap-3 sm:gap-4 lg:grid-cols-3">
      {filtered.map((item) => (
        <MenuCard key={item.id} item={item} />
      ))}
    </div>
  );
}

export function MenuGridSkeletonBlock() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
          <div className="no-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
            {Array.from({ length: 4 }).map((__, i) => (
              <div
                key={i}
                className="w-[min(46vw,200px)] shrink-0 sm:w-[200px]"
              >
                <MenuCardSkeleton />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
