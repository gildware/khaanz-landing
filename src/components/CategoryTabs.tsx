"use client";

import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useMenuData } from "@/contexts/menu-data-context";
import { isComboAvailable, COMBOS_TAB_ID } from "@/lib/menu-combos";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import { CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const ALL = "all" as const;

export function CategoryTabs() {
  const { category, setCategory } = useMenuExplore();
  const { data } = useMenuData();

  const categoriesWithStock = useMemo(() => {
    const list = data?.categories ?? [];
    const items = data?.items ?? [];
    return list.filter((cat) =>
      items.some((i) => i.category === cat.name && isMenuItemAvailable(i)),
    );
  }, [data?.categories, data?.items]);

  const hasCombos = useMemo(() => {
    const combos = data?.combos ?? [];
    const items = data?.items ?? [];
    return combos.some((c) => isComboAvailable(c, items));
  }, [data?.combos, data?.items]);

  const chips: {
    id: string | typeof ALL;
    label: string;
    iconKey?: string;
  }[] = [
    { id: ALL, label: "All" },
    ...(hasCombos ? [{ id: COMBOS_TAB_ID, label: "Combos" }] : []),
    ...categoriesWithStock.map((c) => ({
      id: c.name,
      label: c.name,
      iconKey: c.icon,
    })),
  ];

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setCategory(c.id)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
            category === c.id
              ? "border-primary bg-primary/20 text-primary shadow-md shadow-primary/10"
              : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >
          {c.iconKey ? (
            <CategoryIcon
              iconKey={c.iconKey}
              className="mr-1.5 inline size-4 shrink-0 opacity-80"
            />
          ) : null}
          {c.label}
        </button>
      ))}
    </div>
  );
}
