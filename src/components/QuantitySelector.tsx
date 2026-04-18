"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QuantitySelectorProps {
  value: number;
  onIncrease: () => void;
  onDecrease: () => void;
  min?: number;
  size?: "sm" | "md";
  className?: string;
}

export function QuantitySelector({
  value,
  onIncrease,
  onDecrease,
  min = 1,
  size = "md",
  className,
}: QuantitySelectorProps) {
  const btn =
    size === "sm" ? ("icon-xs" as const) : ("icon-sm" as const);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 p-0.5",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size={btn}
        className="rounded-full text-primary hover:bg-primary/20"
        onClick={onDecrease}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <span
        className={cn(
          "min-w-[1.5rem] text-center font-semibold tabular-nums",
          size === "sm" ? "text-xs" : "text-sm",
        )}
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size={btn}
        className="rounded-full text-primary hover:bg-primary/20"
        onClick={onIncrease}
        aria-label="Increase quantity"
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}
