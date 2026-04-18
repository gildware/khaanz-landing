"use client";

import { useState } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useMenuData } from "@/contexts/menu-data-context";
import { ItemCustomizeSheet } from "@/components/ItemCustomizeSheet";
import { MenuItemImage } from "@/components/MenuItemImage";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import type { MenuItem } from "@/types/menu";
import { cn } from "@/lib/utils";

export function FeaturedDishesCarousel() {
  const { data } = useMenuData();
  const featured = (data?.items ?? []).filter(
    (i) => i.recommended && isMenuItemAvailable(i),
  );
  const [active, setActive] = useState<MenuItem | null>(null);
  const [open, setOpen] = useState(false);

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
      <Carousel
        opts={{ align: "start", loop: true }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {featured.map((item) => (
            <CarouselItem
              key={item.id}
              className="basis-[85%] pl-2 sm:basis-1/2 md:basis-1/3 md:pl-4 lg:basis-1/4"
            >
              <button
                type="button"
                onClick={() => {
                  setActive(item);
                  setOpen(true);
                }}
                className={cn(
                  "group relative w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-md ring-1 ring-border/40 transition-all hover:-translate-y-1 hover:ring-primary/25",
                )}
              >
                <div className="relative aspect-[5/4] w-full">
                  <MenuItemImage
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="280px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                  <div className="absolute right-2 bottom-2 left-2">
                    <p className="line-clamp-2 font-heading font-semibold text-white drop-shadow">
                      {item.name}
                    </p>
                    <p className="text-white/90 text-xs tabular-nums">
                      ₹{Math.min(...item.variations.map((v) => v.price))}
                    </p>
                  </div>
                </div>
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden sm:flex -left-2 border-border bg-background/80" />
        <CarouselNext className="hidden sm:flex -right-2 border-border bg-background/80" />
      </Carousel>

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
