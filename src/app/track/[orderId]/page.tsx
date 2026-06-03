"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  Loader2Icon,
  PackageIcon,
  ReceiptIcon,
} from "lucide-react";

import { Header } from "@/components/Header";
import { formatMinorToRupee } from "@/components/orders/format-order-money";
import { OrderLineView } from "@/components/orders/order-line-view";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderStatusTimeline } from "@/components/orders/order-status-timeline";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatIstDateTimeLong } from "@/lib/ist-dates";
import { fulfillmentLabelFromKey } from "@/lib/pos-print";
import { cn } from "@/lib/utils";

type OrderLine = {
  sortIndex: number;
  payload: unknown;
};

type OrderDetail = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  scheduleMode: string;
  scheduledAt: string | null;
  totalMinor: number;
  deliveryChargeMinor: number;
  discountMinor: number;
  currency: string;
  createdAt: string;
  lines: OrderLine[];
};

function BillRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 text-sm",
        emphasis && "font-semibold text-base",
      )}
    >
      <span className={emphasis ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function TrackOrderPage() {
  const params = useParams();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    void fetch(`/api/orders/${orderId}`)
      .then(async (r) => {
        if (!r.ok) {
          setError(r.status === 404 ? "Order not found." : "Could not load order.");
          return;
        }
        setData((await r.json()) as OrderDetail);
      })
      .catch(() => setError("Could not load order."));
  }, [orderId]);

  const subtotalMinor = useMemo(() => {
    if (!data) return 0;
    return (
      data.totalMinor - data.deliveryChargeMinor + data.discountMinor
    );
  }, [data]);

  const lines = data?.lines ?? [];
  const displayRef = data?.orderRef ?? data?.id ?? orderId;

  return (
    <div className="min-h-[100dvh] pb-12">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/my-orders"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "mb-4 -ml-2 gap-1.5 text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowLeftIcon className="size-4" />
            My orders
          </Link>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <ReceiptIcon className="size-7 shrink-0 text-primary" />
            Order details
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track progress and review everything in your order.
          </p>
        </div>

        {!data && !error ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              Loading order…
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card className="border-destructive/40 shadow-sm">
            <CardContent className="py-10 text-center">
              <p className="text-destructive text-sm font-medium">{error}</p>
              <Link
                href="/my-orders"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-4 rounded-full",
                )}
              >
                Back to my orders
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {data ? (
          <div className="space-y-4">
            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <CardDescription className="text-xs font-medium uppercase tracking-wide">
                      Order ID
                    </CardDescription>
                    <CardTitle className="font-mono text-lg break-all">
                      {displayRef}
                    </CardTitle>
                  </div>
                  <OrderStatusBadge
                    status={data.status}
                    label={data.statusLabel}
                    className="shrink-0"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <OrderStatusTimeline
                  status={data.status}
                  fulfillment={data.fulfillment}
                />
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium uppercase tracking-wide">
                    Placed on
                  </CardDescription>
                  <CardTitle className="text-base font-medium leading-snug">
                    {formatIstDateTimeLong(new Date(data.createdAt))}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium uppercase tracking-wide">
                    Fulfillment
                  </CardDescription>
                  <CardTitle className="text-base font-medium">
                    {fulfillmentLabelFromKey(data.fulfillment)}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {data.scheduleMode === "scheduled" && data.scheduledAt ? (
              <Card className="border-primary/25 bg-primary/5 shadow-sm">
                <CardContent className="flex items-start gap-3 py-4">
                  <CalendarClockIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Scheduled for
                    </p>
                    <p className="mt-0.5 font-medium">
                      {formatIstDateTimeLong(new Date(data.scheduledAt))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="shadow-sm">
              <CardHeader className="border-b border-border/70 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageIcon className="size-4 text-primary" />
                  Items ({lines.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {lines.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No line items on this order.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((line) => (
                      <li key={line.sortIndex}>
                        <OrderLineView payload={line.payload} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="border-b border-border/70 pb-3">
                <CardTitle className="text-base">Bill summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <BillRow
                  label="Subtotal"
                  value={formatMinorToRupee(subtotalMinor)}
                />
                {data.deliveryChargeMinor > 0 ? (
                  <BillRow
                    label="Delivery fee"
                    value={formatMinorToRupee(data.deliveryChargeMinor)}
                  />
                ) : null}
                {data.discountMinor > 0 ? (
                  <BillRow
                    label="Discount"
                    value={`−${formatMinorToRupee(data.discountMinor)}`}
                  />
                ) : null}
                <Separator />
                <BillRow
                  label="Total"
                  value={`${formatMinorToRupee(data.totalMinor)} ${data.currency}`}
                  emphasis
                />
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/my-orders"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "rounded-full px-8",
                )}
              >
                All orders
              </Link>
              <Link
                href="/"
                className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}
              >
                Back to menu
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
