"use client";

import { useState } from "react";

import { ItemCustomizeSheet } from "@/components/ItemCustomizeSheet";
import { MenuItemImage } from "@/components/MenuItemImage";
import { useMenuData } from "@/contexts/menu-data-context";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import type { MenuItem } from "@/types/menu";

/**
 * Native horizontal scroll (no Embla). Embla has caused WebKit crashes on iOS / in-app browsers.
 */
export function FeaturedDishesCarousel() {
  const { data } = useMenuData();
  const featured = (data?.items ?? []).filter(
    (i) => i.recommended && isMenuItemAvailable(i),
  );
  const [active, setActive] = useState<MenuItem | null>(null);
  const [open, setOpen] = useState(false);

  if (featured.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">
            Recommended
          </h2>
          <p className="text-muted-foreground text-sm">Crowd favourites tonight</p>
        </div>
      </div>
      <div
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
        role="list"
        aria-label="Recommended dishes"
      >
        {featured.map((item) => (
          <div
            key={item.id}
            role="listitem"
            className="w-[min(calc((100vw-2.5rem)/2.35),200px)] shrink-0 snap-start sm:w-[200px]"
          >
            <button
              type="button"
              onClick={() => {
                setActive(item);
                setOpen(true);
              }}
              className="group relative w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-md ring-1 ring-border/40 transition-all hover:-translate-y-1 hover:ring-primary/25"
            >
              <div className="relative aspect-[5/4] w-full">
                <MenuItemImage
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 45vw, 200px"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                <div className="absolute right-2 bottom-2 left-2">
                  <p className="line-clamp-2 font-heading font-semibold text-white drop-shadow">
                    {item.name}
                  </p>
                  <p className="text-white/90 text-xs tabular-nums">
                    ₹
                    {item.variations.length > 0
                      ? Math.min(...item.variations.map((v) => v.price))
                      : 0}
                  </p>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      <ItemCustomizeSheet
        item={active}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setActive(null);
        }}
      />
    </section>
  );
}
