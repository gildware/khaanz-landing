"use client";

import { SearchIcon, ShoppingBagIcon, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SITE } from "@/lib/site";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function Header() {
  const { searchQuery, setSearchQuery, setCategory } = useMenuExplore();
  const searchOpen = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const { totalItems } = useCartTotals();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          aria-label={`${SITE.name} — home`}
        >
          <span className="relative block h-10 w-[8.5rem] shrink-0 sm:h-11 sm:w-[9.5rem]">
            <Image
              src={SITE.logoPath}
              alt={`${SITE.name} — ${SITE.tagline}`}
              fill
              priority
              sizes="(max-width: 640px) 140px, 160px"
              className="object-contain object-left"
            />
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
          <Button
            type="button"
            variant={searchOpen ? "secondary" : "ghost"}
            size="icon-sm"
            className="rounded-full"
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Search menu"
          >
            {searchOpen ? <XIcon className="size-4" /> : <SearchIcon className="size-4" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative rounded-full"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            <ShoppingBagIcon className="size-5" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/70 px-4 py-3">
            <div className="relative mx-auto max-w-6xl">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCategory("all");
                }}
                placeholder="Search dishes, ingredients…"
                className="h-11 rounded-full border-border bg-muted/30 pl-10"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
