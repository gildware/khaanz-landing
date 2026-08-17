"use client";

import {
  BikeIcon,
  ClockIcon,
  IndianRupeeIcon,
  SparklesIcon,
  TruckIcon,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useRestaurantSettings } from "@/contexts/restaurant-settings-context";
import { formatRangeLabel } from "@/lib/restaurant-hours";
import { getEstimatedDeliveryMinutes } from "@/lib/restaurant";
import { cn } from "@/lib/utils";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BikeIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card/90 px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <p className="truncate text-[10px] font-medium uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className="mt-0.5 font-heading text-base font-semibold leading-snug text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function HeroBanner() {
  const { data } = useRestaurantSettings();
  const mins = getEstimatedDeliveryMinutes();
  const pickupTime = data ? formatRangeLabel(data.pickup) : "…";
  const deliveryTime = data ? formatRangeLabel(data.delivery) : "…";

  return (
    <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-red-50/95 via-orange-50/70 to-background px-3 py-3 shadow-md sm:rounded-3xl sm:p-6 sm:shadow-lg md:p-8 lg:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 hidden size-64 rounded-full bg-primary/15 blur-2xl sm:block md:blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 hidden size-56 rounded-full bg-amber-200/40 blur-2xl sm:block md:blur-3xl" />

      <div className="relative z-10 grid items-center gap-1.5 sm:gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-8 lg:gap-12">
        <div className="min-w-0 space-y-1 sm:space-y-4">
          <span className="hidden items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary sm:inline-flex">
            <SparklesIcon className="size-3.5" />
            Crafted in-house daily
          </span>
          <h1 className="font-heading text-xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl sm:leading-[1.15] md:text-5xl">
            Hungry?{" "}
            <span className="bg-gradient-to-r from-red-600 to-red-800 bg-clip-text text-transparent">
              Order now.
            </span>
          </h1>
          <p className="max-w-xl text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-relaxed md:text-base">
            Pizzas, shawarma, momos, and chef specials — cooked fresh when you
            tap.
          </p>
          <div className="hidden flex-wrap items-center gap-2 pt-0.5 sm:flex">
            <Link
              href="#menu-section"
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full px-4",
              )}
            >
              View menu
            </Link>
          </div>
        </div>

        <div className="hidden grid-cols-2 gap-3 sm:grid">
          <StatCard icon={BikeIcon} label="Est. delivery" value={`${mins} min`} />
          <StatCard icon={IndianRupeeIcon} label="Min. order" value="₹199" />
          <StatCard icon={ClockIcon} label="Pickup" value={pickupTime} />
          <StatCard icon={TruckIcon} label="Delivery" value={deliveryTime} />
        </div>
      </div>
    </section>
  );
}
