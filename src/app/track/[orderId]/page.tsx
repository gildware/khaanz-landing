"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Header } from "@/components/Header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OrderDetail = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  scheduleMode: string;
  scheduledAt: string | null;
  totalMinor: number;
  currency: string;
  createdAt: string;
};

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

  return (
    <div className="min-h-[100dvh] pb-12">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-heading text-2xl font-bold">Order status</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Anyone with this link can view status (keep the link private).
        </p>

        <div className="mt-8 rounded-2xl border bg-card p-6">
          {!data && !error && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              Loading…
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
          {data && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Order ID</dt>
                <dd className="font-mono text-sm break-all">
                  {data.orderRef ?? data.id}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold">{data.statusLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Placed</dt>
                <dd>{new Date(data.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd>
                  ₹{(data.totalMinor / 100).toFixed(2)} {data.currency}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fulfillment</dt>
                <dd className="capitalize">{data.fulfillment}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/my-orders"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "rounded-full px-8",
            )}
          >
            My orders
          </Link>
          <Link
            href="/"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}
          >
            Back to menu
          </Link>
        </div>
      </main>
    </div>
  );
}
