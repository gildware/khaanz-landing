"use client";

import { ClockIcon } from "lucide-react";

import { isRestaurantOpen } from "@/lib/restaurant";
import { cn } from "@/lib/utils";

export function OpenClosedBanner() {
  const open = isRestaurantOpen();
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-center text-sm",
        open
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/35 bg-red-950/40 text-red-100",
      )}
    >
      <ClockIcon className="size-4 shrink-0" />
      {open ? (
        <span>
          We are <strong>open</strong> — ordering until 11:00 PM local time.
        </span>
      ) : (
        <span>
          We are <strong>closed</strong> right now. See you at 11:00 AM.
        </span>
      )}
    </div>
  );
}
