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
 * Storefront combos rail — below hero / recommended, above the main menu grid.
 */
export function HomeCombosSection() {
  const { searchQuery } = useMenuExplore();
  const { data, isLoading } = useMenuData();
  const items = data?.items ?? [];
  const combos = data?.combos ?? [];
  const q = searchQuery;

  const visible = useMemo(
    () =>
      combos.filter(
        (c) =>
          c.available !== false &&
          isComboAvailable(c, items) &&
          matchesComboSearch(c, q),
      ),
    [combos, items, q],
  );

  if (isLoading && !data) return null;
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="home-combos-heading">
      <div className="px-1">
        <h2
          id="home-combos-heading"
          className="font-heading text-xl font-bold tracking-tight"
        >
          Combos
        </h2>
        <p className="text-muted-foreground text-sm">
          Bundle deals — tap to view what&apos;s included
        </p>
      </div>
      <div
        className="no-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
        role="list"
        aria-label="Menu combos"
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
