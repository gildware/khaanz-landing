"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import type { OrderStatus } from "@prisma/client";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";

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

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[280px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No orders yet.
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No orders in this status.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((o) => {
                const step = nextStep(o.status, o.fulfillment);
                const busy = updatingId === o.id;
                const rupee = (o.totalMinor / 100).toFixed(2);
                const canCancel =
                  o.status !== "CANCELLED" && o.status !== "DELIVERED";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(o.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {o.orderRef ?? "—"}
                    </TableCell>
                    <TableCell>{o.customerName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {o.customerPhone}
                    </TableCell>
                    <TableCell className="capitalize">{o.fulfillment}</TableCell>
                    <TableCell>
                      ₹{rupee} {o.currency}
                    </TableCell>
                    <TableCell>{o.statusLabel}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
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
                            disabled={busy}
                            onClick={() => void setStatus(o.id, "CANCELLED")}
                          >
                            Cancel order
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
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
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    <span className="font-medium">{detail.statusLabel}</span>
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
                  <div className="rounded-lg border bg-muted/30 px-3">
                    {detail.lines.map((line) => (
                      <OrderLineView
                        key={line.sortIndex}
                        payload={line.payload}
                      />
                    ))}
                  </div>
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

function OrderLineView({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") {
    return (
      <div className="border-b py-2 last:border-0">
        <pre className="text-xs overflow-x-auto">
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
      <div className="border-b border-border/80 py-3 last:border-0">
        <div className="flex justify-between gap-2">
          <span className="font-medium">{String(p.name)}</span>
          <span className="tabular-nums shrink-0">₹{lineTotal}</span>
        </div>
        <div className="text-muted-foreground text-xs">
          Combo × {qty}
        </div>
        {typeof p.componentSummary === "string" && p.componentSummary ? (
          <div className="text-xs mt-1 text-muted-foreground">
            {p.componentSummary}
          </div>
        ) : null}
      </div>
    );
  }

  if (p.kind === "open") {
    return (
      <div className="border-b border-border/80 py-3 last:border-0">
        <div className="flex justify-between gap-2">
          <span className="font-medium">{String(p.name)}</span>
          <span className="tabular-nums shrink-0">₹{lineTotal}</span>
        </div>
        <div className="text-muted-foreground text-xs">Open item × {qty}</div>
      </div>
    );
  }

  const v = p.variation as Record<string, unknown> | undefined;
  const addons = Array.isArray(p.addons) ? p.addons : [];
  return (
    <div className="border-b border-border/80 py-3 last:border-0">
      <div className="flex justify-between gap-2">
        <span className="font-medium">{String(p.name)}</span>
        <span className="tabular-nums shrink-0">₹{lineTotal}</span>
      </div>
      <div className="text-muted-foreground text-xs">
        × {qty}
        {v && typeof v.name === "string" ? ` · ${v.name}` : ""}
      </div>
      {addons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs list-disc pl-4 text-muted-foreground">
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
