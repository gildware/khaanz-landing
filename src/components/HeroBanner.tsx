import { SparklesIcon } from "lucide-react";

import { getEstimatedDeliveryMinutes } from "@/lib/restaurant";

export function HeroBanner() {
  const mins = getEstimatedDeliveryMinutes();
  return (
    <section className="relative overflow-hidden rounded-3xl border border-red-950/30 bg-gradient-to-br from-black via-zinc-950 to-zinc-900 p-6 shadow-2xl md:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-red-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-red-950/40 blur-3xl" />
      <div className="relative z-10 max-w-xl space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary text-xs font-semibold uppercase tracking-wider">
          <SparklesIcon className="size-3.5" />
          Crafted in-house daily
        </span>
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight md:text-5xl">
          Bold flavours,
          <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            {" "}
            delivered warm.
          </span>
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed md:text-base">
          Wood-fired pizzas, sizzling Chinese, and chef specials — order on the
          web and we will fire up your meal for WhatsApp confirmation.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Est. delivery
            </p>
            <p className="font-heading font-semibold tabular-nums">{mins} min</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              Min. order
            </p>
            <p className="font-heading font-semibold">₹199</p>
          </div>
        </div>
      </div>
    </section>
  );
}
