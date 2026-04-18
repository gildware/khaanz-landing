"use client";

import { SparklesIcon } from "lucide-react";

import { useRestaurantSettings } from "@/contexts/restaurant-settings-context";
import { formatRangeLabel } from "@/lib/restaurant-hours";
import { getEstimatedDeliveryMinutes } from "@/lib/restaurant";

const statBoxClass =
  "rounded-2xl border border-border bg-card/90 px-4 py-2 shadow-sm backdrop-blur-sm";

export function HeroBanner() {
  const { data } = useRestaurantSettings();
  const mins = getEstimatedDeliveryMinutes();
  const pickupTime = data ? formatRangeLabel(data.pickup) : "…";
  const deliveryTime = data ? formatRangeLabel(data.delivery) : "…";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-red-50/95 via-orange-50/70 to-background p-6 shadow-lg md:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative z-10 space-y-4">
        <div className="max-w-xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-primary text-xs font-semibold uppercase tracking-wider">
            <SparklesIcon className="size-3.5" />
            Crafted in-house daily
          </span>
          <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            Bold flavours,
            <span className="bg-gradient-to-r from-red-600 to-red-800 bg-clip-text text-transparent">
              {" "}
              delivered warm.
            </span>
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed md:text-base">
            Wood-fired pizzas, sizzling Chinese, and chef specials — order on the
            web and we will fire up your meal for WhatsApp confirmation.
          </p>
        </div>
        <div className="flex min-w-0 flex-nowrap items-stretch gap-2 overflow-x-auto pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
          <div className={`shrink-0 ${statBoxClass}`}>
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Est. delivery
            </p>
            <p className="font-heading font-semibold tabular-nums text-foreground">
              {mins} min
            </p>
          </div>
          <div className={`shrink-0 ${statBoxClass}`}>
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Min. order
            </p>
            <p className="font-heading font-semibold text-foreground">₹199</p>
          </div>
          <div className={`shrink-0 ${statBoxClass}`}>
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Pickup time
            </p>
            <p className="font-heading font-semibold tabular-nums text-foreground">
              {pickupTime}
            </p>
          </div>
          <div className={`shrink-0 ${statBoxClass}`}>
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Delivery time
            </p>
            <p className="font-heading font-semibold tabular-nums text-foreground">
              {deliveryTime}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
