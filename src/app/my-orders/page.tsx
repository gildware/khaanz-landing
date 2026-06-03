"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronRightIcon,
  ClipboardListIcon,
  Loader2Icon,
  PackageIcon,
  RefreshCwIcon,
  StoreIcon,
  TruckIcon,
} from "lucide-react";

import {
  DataTableToolbar,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import { Header } from "@/components/Header";
import { formatMinorToRupee } from "@/components/orders/format-order-money";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatIstDateTimeLong } from "@/lib/ist-dates";
import { fulfillmentLabelFromKey } from "@/lib/pos-print";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
};

function FulfillmentIcon({ fulfillment }: { fulfillment: string }) {
  if (fulfillment === "delivery") {
    return <TruckIcon className="size-4 shrink-0 text-primary" aria-hidden />;
  }
  if (fulfillment === "dine_in") {
    return <StoreIcon className="size-4 shrink-0 text-primary" aria-hidden />;
  }
  return <PackageIcon className="size-4 shrink-0 text-primary" aria-hidden />;
}

export default function MyOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("date-desc");

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

  const statusOptions = useMemo(() => {
    const labels = new Set(orders.map((o) => o.statusLabel));
    return [
      { value: "all", label: "All statuses" },
      ...[...labels].sort((a, b) => a.localeCompare(b)).map((l) => ({
        value: l,
        label: l,
      })),
    ];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) => {
      if (statusFilter !== "all" && o.statusLabel !== statusFilter) return false;
      if (!q) return true;
      const hay = `${o.orderRef ?? ""} ${o.statusLabel} ${o.fulfillment}`.toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return a.createdAt.localeCompare(b.createdAt);
        case "total-desc":
          return b.totalMinor - a.totalMinor;
        case "total-asc":
          return a.totalMinor - b.totalMinor;
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return list;
  }, [orders, search, statusFilter, sort]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-[100dvh] pb-12">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              <ClipboardListIcon className="size-7 shrink-0 text-primary" />
              My orders
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              View past orders, track status, and open full receipts.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border bg-card px-6 py-12 text-muted-foreground shadow-sm">
            <Loader2Icon className="size-5 animate-spin" />
            Loading your orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center shadow-sm">
            <PackageIcon className="mx-auto size-10 text-muted-foreground/70" />
            <p className="mt-4 font-medium">No orders yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              When you place an order, it will show up here.
            </p>
            <Link
              href="/"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-6 rounded-full px-8",
              )}
            >
              Browse the menu
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <DataTableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search order ID, status…"
              sort={sort}
              onSortChange={setSort}
              sortOptions={[
                { value: "date-desc", label: "Newest first" },
                { value: "date-asc", label: "Oldest first" },
                { value: "total-desc", label: "Total (high–low)" },
                { value: "total-asc", label: "Total (low–high)" },
              ]}
              filteredCount={filteredOrders.length}
              totalCount={orders.length}
              showStatusFilter={false}
            >
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Status</Label>
                <SearchableSelect
                  triggerClassName={selectControlClassName}
                  options={statusOptions}
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  placeholder="Status"
                  searchPlaceholder="Search…"
                />
              </div>
            </DataTableToolbar>

            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-muted-foreground text-sm">
                No orders match your search or filters.
              </div>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  {filteredOrders.length}{" "}
                  {filteredOrders.length === 1 ? "order" : "orders"}
                  {filteredOrders.length !== orders.length
                    ? ` (of ${orders.length})`
                    : null}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredOrders.map((o) => (
                    <article
                      key={o.id}
                      className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex gap-3 border-b border-border/70 p-4">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold tracking-tight">
                              {o.orderRef ?? "—"}
                            </span>
                            <OrderStatusBadge
                              status={o.status}
                              label={o.statusLabel}
                            />
                          </div>
                          <p className="text-muted-foreground text-xs leading-snug">
                            {formatIstDateTimeLong(new Date(o.createdAt))}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-lg tabular-nums">
                            {formatMinorToRupee(o.totalMinor)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {o.currency}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 px-4 py-3 text-sm">
                        <FulfillmentIcon fulfillment={o.fulfillment} />
                        <span className="font-medium">
                          {fulfillmentLabelFromKey(o.fulfillment)}
                        </span>
                      </div>

                      <div className="mt-auto border-t border-border/70 p-3">
                        <Link
                          href={`/track/${encodeURIComponent(o.orderRef ?? o.id)}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-9 w-full justify-between gap-2 rounded-xl px-4 font-medium",
                          )}
                        >
                          View order details
                          <ChevronRightIcon className="size-4 shrink-0 opacity-60" />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
