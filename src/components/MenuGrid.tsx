"use client";

import { useMemo } from "react";

import { ComboCard } from "@/components/ComboCard";
import { MenuCard, MenuCardSkeleton } from "@/components/MenuCard";
import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useMenuData } from "@/contexts/menu-data-context";
import { COMBOS_TAB_ID, isComboAvailable } from "@/lib/menu-combos";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import type { MenuCombo, MenuItem } from "@/types/menu";

function matchesSearch(item: MenuItem, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    item.name.toLowerCase().includes(s) ||
    item.description.toLowerCase().includes(s) ||
    item.category.toLowerCase().includes(s)
  );
}

function matchesComboSearch(combo: MenuCombo, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    combo.name.toLowerCase().includes(s) ||
    combo.description.toLowerCase().includes(s)
  );
}

export function MenuGrid() {
  const { category, searchQuery } = useMenuExplore();
  const { data } = useMenuData();

  const menuItems = useMemo(
    () => (data?.items ?? []).filter(isMenuItemAvailable),
    [data?.items],
  );
  const combos = useMemo(() => data?.combos ?? [], [data?.combos]);
  const categories = useMemo(() => data?.categories ?? [], [data?.categories]);

  const q = searchQuery.trim().toLowerCase();

  const visibleCombos = useMemo(() => {
    const items = data?.items ?? [];
    return combos.filter(
      (c) => isComboAvailable(c, items) && matchesComboSearch(c, q),
    );
  }, [combos, data?.items, q]);

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

  if (category === COMBOS_TAB_ID) {
    if (visibleCombos.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <p className="font-medium text-muted-foreground">
            No combos match your filters.
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            Try another category or clear search.
          </p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-4 lg:grid-cols-3">
        {visibleCombos.map((c) => (
          <ComboCard key={c.id} combo={c} />
        ))}
      </div>
    );
  }

  if (category === "all" && groupedByCategory) {
    const hasAnyRows =
      groupedByCategory.length > 0 || visibleCombos.length > 0;
    if (!hasAnyRows) {
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
        {visibleCombos.length > 0 && (
          <section aria-labelledby="menu-combos-heading">
            <h3
              id="menu-combos-heading"
              className="mb-3 px-1 font-heading text-lg font-semibold tracking-tight"
            >
              Combos
            </h3>
            <div className="no-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {visibleCombos.map((c) => (
                <div
                  key={c.id}
                  className="w-[min(calc((100vw-2.5rem)/2.35),200px)] shrink-0 sm:w-[200px]"
                >
                  <ComboCard combo={c} />
                </div>
              ))}
            </div>
          </section>
        )}
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
                  className="w-[min(calc((100vw-2.5rem)/2.35),200px)] shrink-0 sm:w-[200px]"
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
                className="w-[min(calc((100vw-2.5rem)/2.35),200px)] shrink-0 sm:w-[200px]"
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
