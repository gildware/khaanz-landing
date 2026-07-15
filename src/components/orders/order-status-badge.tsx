import type { OrderStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function orderStatusBadgeClassName(status: string): string {
  switch (status) {
    case "PENDING":
      return "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-50";
    case "ACCEPTED":
      return "border-sky-600/40 bg-sky-500/14 text-sky-950 dark:border-sky-400/35 dark:bg-sky-400/12 dark:text-sky-50";
    case "PREPARING":
      return "border-violet-600/40 bg-violet-500/14 text-violet-950 dark:border-violet-400/35 dark:bg-violet-400/12 dark:text-violet-50";
    case "OUT_FOR_DELIVERY":
      return "border-cyan-600/40 bg-cyan-500/14 text-cyan-950 dark:border-cyan-400/35 dark:bg-cyan-400/12 dark:text-cyan-50";
    case "DELIVERED":
      return "border-emerald-600/40 bg-emerald-500/14 text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-400/12 dark:text-emerald-50";
    case "TABLE_CLEARED":
      return "border-stone-500/40 bg-stone-500/12 text-stone-950 dark:border-stone-400/35 dark:bg-stone-400/12 dark:text-stone-50";
    case "CANCELLED":
      return "border-red-600/45 bg-red-500/12 text-red-950 dark:border-red-400/40 dark:bg-red-500/18 dark:text-red-50";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

type OrderStatusBadgeProps = {
  status: string;
  label: string;
  className?: string;
};

export function OrderStatusBadge({ status, label, className }: OrderStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full font-medium",
        orderStatusBadgeClassName(status),
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (
    value === "PENDING" ||
    value === "ACCEPTED" ||
    value === "PREPARING" ||
    value === "OUT_FOR_DELIVERY" ||
    value === "DELIVERED" ||
    value === "TABLE_CLEARED" ||
    value === "CANCELLED"
  );
}
