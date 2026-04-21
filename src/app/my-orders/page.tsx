"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { Header } from "@/components/Header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderRow = {
  id: string;
  orderRef: string | null;
  statusLabel: string;
  fulfillment: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
};

export default function MyOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer/orders", { credentials: "include" });
      if (res.status === 401) {
        router.push("/auth/phone?next=/my-orders");
        return;
      }
      if (!res.ok) {
        toast.error("Could not load orders");
        return;
      }
      const data = (await res.json()) as { orders: OrderRow[] };
      setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-[100dvh] pb-12">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-heading text-2xl font-bold">My orders</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            Loading…
          </div>
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground">
            No orders yet.{" "}
            <Link href="/" className="text-primary underline">
              Browse the menu
            </Link>
          </p>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(o.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {o.orderRef ?? "—"}
                    </TableCell>
                    <TableCell>{o.statusLabel}</TableCell>
                    <TableCell className="capitalize">{o.fulfillment}</TableCell>
                    <TableCell>
                      ₹{(o.totalMinor / 100).toFixed(2)} {o.currency}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/track/${encodeURIComponent(o.orderRef ?? o.id)}`}
                        className={cn(
                          buttonVariants({ variant: "link", size: "sm" }),
                          "h-auto p-0",
                        )}
                      >
                        Details
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
