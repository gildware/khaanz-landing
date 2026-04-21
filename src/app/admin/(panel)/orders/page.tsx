"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import type { OrderStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_MS = 30_000;

type StatusFilter = "all" | OrderStatus;

const ORDER_STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PENDING", label: ORDER_STATUS_LABEL.PENDING },
  { id: "ACCEPTED", label: ORDER_STATUS_LABEL.ACCEPTED },
  { id: "PREPARING", label: ORDER_STATUS_LABEL.PREPARING },
  { id: "OUT_FOR_DELIVERY", label: ORDER_STATUS_LABEL.OUT_FOR_DELIVERY },
  { id: "DELIVERED", label: ORDER_STATUS_LABEL.DELIVERED },
  { id: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED },
];

type OrderRow = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
  customerPhone: string;
  customerName: string | null;
  lines: { sortIndex: number; payload: unknown }[];
};

type AdminOrderDetail = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  scheduleMode: string;
  scheduledAt: string | null;
  address: string;
  landmark: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  totalMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  customerPhone: string;
  customerName: string | null;
  lines: { sortIndex: number; payload: unknown }[];
};

/** Distinct colors per workflow status (incl. delivered = served for dine-in). */
function orderStatusBadgeClassName(status: string): string {
  switch (status as OrderStatus) {
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
    case "CANCELLED":
      return "border-red-600/45 bg-red-500/12 text-red-950 dark:border-red-400/40 dark:bg-red-500/18 dark:text-red-50";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function nextStep(
  status: string,
  fulfillment: string,
): { nextStatus: string; label: string } | null {
  switch (status) {
    case "PENDING":
      return { nextStatus: "ACCEPTED", label: "Accept order" };
    case "ACCEPTED":
      return { nextStatus: "PREPARING", label: "Mark preparing" };
    case "PREPARING":
      return {
        nextStatus: "OUT_FOR_DELIVERY",
        label:
          fulfillment === "delivery"
            ? "Mark out for delivery"
            : fulfillment === "dine_in"
              ? "Mark ready to serve"
              : "Mark ready for pickup",
      };
    case "OUT_FOR_DELIVERY":
      return {
        nextStatus: "DELIVERED",
        label: fulfillment === "dine_in" ? "Mark served" : "Mark delivered",
      };
    default:
      return null;
  }
}

export default function AdminOrdersPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (silent) setRefreshing(true);
    else setInitialLoad(true);
    try {
      const res = await fetch("/api/admin/orders", { credentials: "include" });
      if (!res.ok) {
        toast.error("Could not load orders");
        return;
      }
      const data = (await res.json()) as { orders: OrderRow[] };
      setOrders(data.orders);
    } finally {
      if (silent) setRefreshing(false);
      else setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  const setStatus = async (orderId: string, status: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Update failed");
        return;
      }
      toast.success("Order updated");
      await load({ silent: true });
      if (detail?.id === orderId) {
        void fetchOrderDetail(orderId);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  async function fetchOrderDetail(orderId: string) {
    setDetailLoading(true);
    setDetailError(false);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as
        | AdminOrderDetail
        | { error?: string };
      if (!res.ok || !("id" in j)) {
        toast.error("error" in j && j.error ? j.error : "Could not load order");
        setDetail(null);
        setDetailError(true);
        return;
      }
      setDetail(j);
    } finally {
      setDetailLoading(false);
    }
  }

  function openDetails(orderId: string) {
    setDetail(null);
    setDetailError(false);
    setDetailOpen(true);
    void fetchOrderDetail(orderId);
  }

  const statusCounts = useMemo(() => {
    const byStatus: Partial<Record<OrderStatus, number>> = {};
    for (const o of orders) {
      byStatus[o.status as OrderStatus] =
        (byStatus[o.status as OrderStatus] ?? 0) + 1;
    }
    return { total: orders.length, byStatus };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  if (initialLoad) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading orders…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Orders</h1>
          <p className="text-muted-foreground text-sm">
            Advance status one step at a time, or cancel. Customers get a
            WhatsApp update when Cloud API is configured.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={(v) => setAutoRefresh(v === true)}
            />
            <Label htmlFor="auto-refresh" className="text-sm font-normal">
              Auto-refresh (30s)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            {refreshing && (
              <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load({ silent: true })}
            >
              Refresh now
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ORDER_STATUS_TABS.map((tab) => {
          const count =
            tab.id === "all"
              ? statusCounts.total
              : (statusCounts.byStatus[tab.id] ?? 0);
          const active = statusFilter === tab.id;
          return (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
              <span
                className={
                  active
                    ? "ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs tabular-nums"
                    : "ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground"
                }
              >
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-muted-foreground text-sm">
            No orders yet.
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-muted-foreground text-sm">
            No orders in this status.
          </div>
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map((o) => {
              const step = nextStep(o.status, o.fulfillment);
              const busy = updatingId === o.id;
              const rupee = (o.totalMinor / 100).toFixed(2);
              const canCancel =
                o.status !== "CANCELLED" && o.status !== "DELIVERED";
              const lines = o.lines ?? [];
              return (
                <article
                  key={o.id}
                  className="flex max-h-[600px] min-h-[480px] w-full flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-sm ring-1 ring-border/50"
                >
                  <div className="flex shrink-0 gap-3 border-b border-border/70 pb-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold tracking-tight">
                          {o.orderRef ?? "—"}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            orderStatusBadgeClassName(o.status),
                          )}
                        >
                          {o.statusLabel}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {new Date(o.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="font-semibold text-lg tabular-nums">
                          ₹{rupee}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {o.currency}
                        </p>
                      </div>
                      <div className="flex max-w-[14rem] flex-wrap justify-end gap-1.5 sm:max-w-[18rem]">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 shrink-0 px-2 text-xs"
                          disabled={busy}
                          onClick={() => openDetails(o.id)}
                        >
                          Details
                        </Button>
                        {step && (
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="h-8 shrink-0 px-2 text-center text-xs leading-tight"
                            disabled={busy}
                            onClick={() =>
                              void setStatus(o.id, step.nextStatus)
                            }
                          >
                            {busy ? "…" : step.label}
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 px-2 text-xs"
                            disabled={busy}
                            onClick={() => void setStatus(o.id, "CANCELLED")}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid shrink-0 gap-3 border-b border-border/70 py-3 sm:grid-cols-2">
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        Customer
                      </p>
                      <p className="mt-0.5 font-medium">
                        {o.customerName ?? "—"}
                      </p>
                      <p className="font-mono text-muted-foreground text-xs">
                        {o.customerPhone}
                      </p>
                    </div>
                    <div className="text-sm capitalize">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        Fulfillment
                      </p>
                      <p className="mt-0.5 font-medium">{o.fulfillment}</p>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-2 py-3">
                    <h2 className="shrink-0 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                      Items ({lines.length})
                    </h2>
                    {lines.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No line items on this order.
                      </p>
                    ) : (
                      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                        {lines.map((line) => (
                          <li key={line.sortIndex}>
                            <OrderLineView payload={line.payload} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                </article>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetail(null);
            setDetailError(false);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg max-h-[min(90dvh,720px)] flex flex-col gap-0 p-0"
          showCloseButton
        >
          <DialogHeader className="p-4 pb-2 shrink-0">
            <DialogTitle>Order details</DialogTitle>
            <DialogDescription>
              Full line items and delivery information.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 overflow-y-auto flex-1 min-h-0 pb-4 space-y-4">
            {detailLoading && (
              <div className="flex items-center gap-2 text-muted-foreground py-6">
                <Loader2Icon className="size-5 animate-spin" />
                Loading…
              </div>
            )}
            {!detailLoading && detailError && (
              <p className="text-muted-foreground text-sm py-4">
                Could not load this order.
              </p>
            )}
            {!detailLoading && detail && (
              <>
                <div className="space-y-1 text-sm">
                  {detail.orderRef ? (
                    <div>
                      <span className="text-muted-foreground">Order ID: </span>
                      <span className="font-mono font-medium">
                        {detail.orderRef}
                      </span>
                    </div>
                  ) : null}
                  <div className="font-mono text-xs break-all text-muted-foreground">
                    {detail.id}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Status: </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        orderStatusBadgeClassName(detail.status),
                      )}
                    >
                      {detail.statusLabel}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Placed: </span>
                    {new Date(detail.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    ₹{(detail.totalMinor / 100).toFixed(2)} {detail.currency}
                  </div>
                  <div className="capitalize">
                    <span className="text-muted-foreground">Fulfillment: </span>
                    {detail.fulfillment}
                  </div>
                  <div className="capitalize">
                    <span className="text-muted-foreground">Schedule: </span>
                    {detail.scheduleMode}
                    {detail.scheduledAt &&
                      ` · ${new Date(detail.scheduledAt).toLocaleString()}`}
                  </div>
                </div>

                <Separator />

                <div className="space-y-1 text-sm">
                  <div className="font-medium">Customer</div>
                  <div>{detail.customerName ?? "—"}</div>
                  <div className="font-mono text-xs">{detail.customerPhone}</div>
                </div>

                {(detail.address || detail.landmark) && (
                  <>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">Address</div>
                      {detail.address ? (
                        <p className="whitespace-pre-wrap">{detail.address}</p>
                      ) : null}
                      {detail.landmark ? (
                        <p className="text-muted-foreground">
                          Landmark: {detail.landmark}
                        </p>
                      ) : null}
                    </div>
                  </>
                )}

                {detail.notes ? (
                  <>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">Notes</div>
                      <p className="whitespace-pre-wrap">{detail.notes}</p>
                    </div>
                  </>
                ) : null}

                <Separator />

                <div className="space-y-2">
                  <div className="font-medium text-sm">Items</div>
                  <ul className="space-y-2">
                    {detail.lines.map((line) => (
                      <li key={line.sortIndex}>
                        <OrderLineView payload={line.payload} />
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {(() => {
                    const step = nextStep(detail.status, detail.fulfillment);
                    const busy = updatingId === detail.id;
                    const canCancel =
                      detail.status !== "CANCELLED" &&
                      detail.status !== "DELIVERED";
                    return (
                      <>
                        {step && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void setStatus(detail.id, step.nextStatus)
                            }
                          >
                            {busy ? "…" : step.label}
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void setStatus(detail.id, "CANCELLED")
                            }
                          >
                            Cancel order
                          </Button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const orderLineBoxClass =
  "rounded-xl border border-border/70 bg-muted/20 p-3 text-sm shadow-sm";

function OrderLineView({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") {
    return (
      <div className={orderLineBoxClass}>
        <pre className="max-h-40 overflow-auto text-xs">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    );
  }
  const p = payload as Record<string, unknown>;
  const qty =
    typeof p.quantity === "number" && Number.isFinite(p.quantity)
      ? p.quantity
      : 1;
  const unit =
    typeof p.unitPrice === "number" && Number.isFinite(p.unitPrice)
      ? p.unitPrice
      : 0;
  const lineTotal = (unit * qty).toFixed(2);

  if (p.kind === "combo") {
    return (
      <div className={orderLineBoxClass}>
        <div className="flex justify-between gap-2">
          <span className="font-medium">{String(p.name)}</span>
          <span className="shrink-0 tabular-nums">₹{lineTotal}</span>
        </div>
        <div className="text-muted-foreground text-xs">Combo × {qty}</div>
        {typeof p.componentSummary === "string" && p.componentSummary ? (
          <div className="mt-1.5 text-muted-foreground text-xs leading-snug">
            {p.componentSummary}
          </div>
        ) : null}
      </div>
    );
  }

  if (p.kind === "open") {
    return (
      <div className={orderLineBoxClass}>
        <div className="flex justify-between gap-2">
          <span className="font-medium">{String(p.name)}</span>
          <span className="shrink-0 tabular-nums">₹{lineTotal}</span>
        </div>
        <div className="text-muted-foreground text-xs">Open item × {qty}</div>
      </div>
    );
  }

  const v = p.variation as Record<string, unknown> | undefined;
  const addons = Array.isArray(p.addons) ? p.addons : [];
  return (
    <div className={orderLineBoxClass}>
      <div className="flex justify-between gap-2">
        <span className="font-medium">{String(p.name)}</span>
        <span className="shrink-0 tabular-nums">₹{lineTotal}</span>
      </div>
      <div className="text-muted-foreground text-xs">
        × {qty}
        {v && typeof v.name === "string" ? ` · ${v.name}` : ""}
      </div>
      {addons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground text-xs">
          {(addons as Record<string, unknown>[]).map((a, i) => (
            <li key={i}>
              {String(a.name)}
              {typeof a.quantity === "number" && a.quantity > 0
                ? ` ×${a.quantity}`
                : ""}
              {typeof a.price === "number" && a.price > 0
                ? ` (+₹${a.price.toFixed(2)} each)`
                : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
