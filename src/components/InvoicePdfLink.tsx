"use client";

import type { ReactNode } from "react";

import { buildSameOriginUrl } from "@/lib/public-site-url";
import { cn } from "@/lib/utils";

export function InvoicePdfLink({
  orderId,
  className,
  children,
}: {
  orderId: string;
  className?: string;
  children: ReactNode;
}) {
  const href = buildSameOriginUrl(`/api/orders/${orderId}/invoice`);
  return (
    <a
      href={href}
      className={cn("font-medium text-primary underline underline-offset-4", className)}
    >
      {children}
    </a>
  );
}
