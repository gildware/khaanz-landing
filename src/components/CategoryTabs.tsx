"use client";

import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useMenuData } from "@/contexts/menu-data-context";
import { cn } from "@/lib/utils";

const ALL = "all" as const;

export function CategoryTabs() {
  const { category, setCategory } = useMenuExplore();
  const { data } = useMenuData();
  const list = data?.categories ?? [];

  const chips: { id: string | typeof ALL; label: string }[] = [
    { id: ALL, label: "All" },
    ...list.map((c) => ({ id: c, label: c })),
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
              : "border-white/10 bg-card/40 text-muted-foreground hover:border-white/20 hover:text-foreground",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
