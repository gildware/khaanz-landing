"use client";

import { useMemo } from "react";

import { ComboCard } from "@/components/ComboCard";
import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useMenuData } from "@/contexts/menu-data-context";
import { isComboAvailable } from "@/lib/menu-combos";
import type { MenuCombo } from "@/types/menu";

function matchesComboSearch(combo: MenuCombo, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    combo.name.toLowerCase().includes(s) ||
    combo.description.toLowerCase().includes(s)
  );
}

/**
 * Storefront rail for combos marked "recommended" in the home-layout admin.
 */
export function RecommendedCombosSection() {
  const { searchQuery } = useMenuExplore();
  const { data, isLoading } = useMenuData();
  const q = searchQuery;

  const visible = useMemo(() => {
    const items = data?.items ?? [];
    const combos = data?.combos ?? [];
    return combos.filter(
      (c) =>
        c.recommended &&
        c.available !== false &&
        isComboAvailable(c, items) &&
        matchesComboSearch(c, q),
    );
  }, [data?.items, data?.combos, q]);

  if (isLoading && !data) return null;
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="recommended-combos-heading">
      <div className="px-1">
        <h2
          id="recommended-combos-heading"
          className="font-heading text-xl font-bold tracking-tight"
        >
          Recommended Combos
        </h2>
        <p className="text-muted-foreground text-sm">
          Hand-picked bundle deals
        </p>
      </div>
      <div
        className="no-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
        role="list"
        aria-label="Recommended combos"
      >
        {visible.map((c) => (
          <div
            key={c.id}
            role="listitem"
            className="w-[min(calc((100vw-2.5rem)/2.35),200px)] shrink-0 sm:w-[200px]"
          >
            <ComboCard combo={c} />
          </div>
        ))}
      </div>
    </section>
  );
}
