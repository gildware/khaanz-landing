import type { OrderStatus } from "@prisma/client";
import { CheckIcon } from "lucide-react";

import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import { cn } from "@/lib/utils";

import { isOrderStatus } from "./order-status-badge";

const DELIVERY_STEPS: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const PICKUP_STEPS: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "DELIVERED",
];

type OrderStatusTimelineProps = {
  status: string;
  fulfillment: string;
};

export function OrderStatusTimeline({ status, fulfillment }: OrderStatusTimelineProps) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-950 dark:text-red-50">
        This order was cancelled. Contact the restaurant if you have questions.
      </div>
    );
  }

  const steps =
    fulfillment === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const current = isOrderStatus(status) ? status : "PENDING";
  const currentIndex = Math.max(0, steps.indexOf(current));

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:justify-between">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const upcoming = index > currentIndex;
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step}
            className={cn(
              "relative flex min-w-0 flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center",
              !isLast &&
                "pb-6 sm:pb-0 sm:after:absolute sm:after:top-4 sm:after:left-[calc(50%+1.25rem)] sm:after:h-0.5 sm:after:w-[calc(100%-2.5rem)] sm:after:bg-border sm:after:content-['']",
              !isLast &&
                done &&
                "sm:after:bg-primary/50",
            )}
          >
            {!isLast ? (
              <span
                className={cn(
                  "absolute top-4 left-[1.125rem] h-[calc(100%-1rem)] w-0.5 sm:hidden",
                  done ? "bg-primary/50" : "bg-border",
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active &&
                  "border-primary bg-primary/15 text-primary ring-4 ring-primary/20",
                upcoming && "border-border bg-muted text-muted-foreground",
              )}
            >
              {done ? (
                <CheckIcon className="size-4" aria-hidden />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 pt-0.5 sm:pt-0">
              <p
                className={cn(
                  "text-sm font-medium leading-tight",
                  active && "text-foreground",
                  (done || upcoming) && !active && "text-muted-foreground",
                )}
              >
                {ORDER_STATUS_LABEL[step]}
              </p>
              {active ? (
                <p className="text-primary mt-0.5 text-xs font-medium">
                  Current step
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
