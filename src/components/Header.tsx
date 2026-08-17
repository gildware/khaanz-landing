"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SearchIcon, ShoppingBagIcon, UserRoundIcon, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SITE } from "@/lib/site";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMenuExplore } from "@/contexts/menu-explore-context";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [customerIn, setCustomerIn] = useState(false);
  const [customerName, setCustomerName] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/customer/me", { credentials: "include" })
      .then(
        (r) =>
          r.json() as Promise<{ loggedIn?: boolean; displayName?: string | null }>,
      )
      .then((d) => {
        const loggedIn = d.loggedIn === true;
        setCustomerIn(loggedIn);
        setCustomerName(
          loggedIn ? ((d.displayName ?? "").trim() || null) : null,
        );
      })
      .catch(() => {
        setCustomerIn(false);
        setCustomerName(null);
      });
  }, [pathname]);

  const { searchQuery, setSearchQuery, setCategory } = useMenuExplore();
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const { totalItems } = useCartTotals();

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    setCategory("all");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label={`${SITE.name} — home`}
        >
          <span className="relative block h-8 w-[5.75rem] shrink-0 sm:h-10 sm:w-[8.25rem] md:h-11 md:w-[9.5rem]">
            <Image
              src={SITE.logoPath}
              alt={`${SITE.name} — ${SITE.tagline}`}
              fill
              priority
              sizes="(max-width: 640px) 92px, (max-width: 768px) 132px, 152px"
              className="object-contain object-left"
            />
          </span>
        </Link>

        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground sm:left-3" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search dishes…"
            aria-label="Search menu"
            className="h-9 rounded-full border-border bg-muted/40 pr-9 pl-8 text-sm sm:h-10 sm:pl-10 md:h-11"
          />
          {searchQuery ? (
            <button
              type="button"
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {customerIn ? (
            <Link
              href="/my-orders"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "rounded-full text-muted-foreground md:h-9 md:w-auto md:gap-1.5 md:px-2.5",
              )}
              aria-label={customerName ? `Hi, ${customerName}` : "My orders"}
            >
              <UserRoundIcon className="size-4" />
              <span className="hidden md:inline">
                {customerName ? `Hi, ${customerName}` : "My orders"}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth/phone?next=/"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "rounded-full text-muted-foreground md:h-9 md:w-auto md:gap-1.5 md:px-2.5",
              )}
              aria-label="Sign in"
            >
              <UserRoundIcon className="size-4" />
              <span className="hidden md:inline">Sign in</span>
            </Link>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative rounded-full md:size-9"
            data-cart-target="header"
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
    </header>
  );
}
