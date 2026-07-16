"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { OrderStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatIstDateInput } from "@/lib/ist-dates";
import {
  RESTAURANT_ORDER_STATUS_TAB_LABEL,
  nextOrderStatusStep,
  restaurantOrderStatusLabel,
} from "@/lib/order-status-workflow";
import {
  countOrdersByStatus,
  filterOrdersByStatusTab,
} from "@/lib/order-tab-utils";
import { POS_ANONYMOUS_PHONE_DIGITS } from "@/lib/phone-digits";
import { billPrintLayoutFromSettings } from "@/lib/bill-print-layout";
import {
  fulfillmentLabelFromKey,
  orderLinePayloadsToReceiptLines,
  printPosBillThermal,
  printPosKotThermal,
  receiptLineToKotLine,
} from "@/lib/pos-print";
import { OrderLineView } from "@/components/orders/order-line-view";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

const AUTO_REFRESH_MS = 30_000;
const PAGE_SIZE = 10;

type StatusFilter = "all" | OrderStatus;

const ORDER_STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PENDING", label: RESTAURANT_ORDER_STATUS_TAB_LABEL.PENDING },
  { id: "ACCEPTED", label: RESTAURANT_ORDER_STATUS_TAB_LABEL.ACCEPTED },
  { id: "PREPARING", label: RESTAURANT_ORDER_STATUS_TAB_LABEL.PREPARING },
  {
    id: "OUT_FOR_DELIVERY",
    label: RESTAURANT_ORDER_STATUS_TAB_LABEL.OUT_FOR_DELIVERY,
  },
  { id: "DELIVERED", label: RESTAURANT_ORDER_STATUS_TAB_LABEL.DELIVERED },
  {
    id: "TABLE_CLEARED",
    label: RESTAURANT_ORDER_STATUS_TAB_LABEL.TABLE_CLEARED,
  },
  { id: "CANCELLED", label: RESTAURANT_ORDER_STATUS_TAB_LABEL.CANCELLED },
];

type OrderRow = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  dineInTable: string;
  totalMinor: number;
  deliveryChargeMinor: number;
  discountMinor: number;
  currency: string;
  createdAt: string;
  customerPhone: string;
  customerName: string | null;
  createdByUserId?: string | null;
  createdByLabel?: string | null;
  lines: { sortIndex: number; payload: unknown }[];
};

type PendingStatusChange = {
  orderId: string;
  orderRef: string;
  currentStatusLabel: string;
  nextStatus: string;
  nextStatusLabel: string;
  actionLabel: string;
  destructive?: boolean;
};

type PendingDelete = {
  orderId: string;
  orderRef: string;
};

type AdminOrderDetail = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  dineInTable: string;
  scheduleMode: string;
  scheduledAt: string | null;
  address: string;
  landmark: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  totalMinor: number;
  deliveryChargeMinor: number;
  discountMinor: number;
  currency: string;
  createdByUserId?: string | null;
  createdByLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  customerPhone: string;
  customerName: string | null;
  lines: { sortIndex: number; payload: unknown }[];
  events?: {
    id: string;
    action: string;
    actorType: string;
    actorUserId: string | null;
    actorLabel: string;
    summary: string;
    createdAt: string;
  }[];
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
    case "TABLE_CLEARED":
      return "border-stone-500/40 bg-stone-500/12 text-stone-950 dark:border-stone-400/35 dark:bg-stone-400/12 dark:text-stone-50";
    case "CANCELLED":
      return "border-red-600/45 bg-red-500/12 text-red-950 dark:border-red-400/40 dark:bg-red-500/18 dark:text-red-50";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export default function AdminOrdersPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const ordersRef = useRef<OrderRow[]>([]);
  const loadMoreInFlight = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  ordersRef.current = orders;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusConfirm, setStatusConfirm] = useState<PendingStatusChange | null>(
    null,
  );
  const [deleteConfirm, setDeleteConfirm] = useState<PendingDelete | null>(null);

  const [posSettings, setPosSettings] = useState<RestaurantSettingsPayload | null>(
    null,
  );

  const restaurantDisplayName = posSettings?.displayName?.trim() || SITE.name;

  const billPrintLayout = useMemo(
    () =>
      billPrintLayoutFromSettings(
        posSettings,
        typeof window !== "undefined" ? window.location.origin : null,
      ),
    [posSettings],
  );
  const [orderDate, setOrderDate] = useState(() => formatIstDateInput(new Date()));
  const todayIst = formatIstDateInput(new Date());
  const viewingToday = orderDate === todayIst;

  const fetchOrdersPage = useCallback(
    async (limit: number, offset: number, date: string) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        date,
        view: "exclude_online_pending",
      });
      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("fetch failed");
      return (await res.json()) as { orders: OrderRow[]; hasMore: boolean };
    },
    [],
  );

  const loadInitial = useCallback(async () => {
    setInitialLoad(true);
    try {
      const data = await fetchOrdersPage(PAGE_SIZE, 0, orderDate);
      setOrders(data.orders);
      setHasMore(data.hasMore);
    } catch {
      toast.error("Could not load orders");
    } finally {
      setInitialLoad(false);
    }
  }, [fetchOrdersPage, orderDate]);

  const refreshOrders = useCallback(async () => {
    setRefreshing(true);
    try {
      const n = Math.max(ordersRef.current.length, PAGE_SIZE);
      const data = await fetchOrdersPage(n, 0, orderDate);
      setOrders(data.orders);
      setHasMore(data.hasMore);
    } catch {
      toast.error("Could not load orders");
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrdersPage, orderDate]);

  const loadMore = useCallback(async () => {
    if (loadMoreInFlight.current || loadingMore || !hasMore) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    const offset = ordersRef.current.length;
    try {
      const data = await fetchOrdersPage(PAGE_SIZE, offset, orderDate);
      setOrders((prev) => [...prev, ...data.orders]);
      setHasMore(data.hasMore);
    } catch {
      toast.error("Could not load more orders");
    } finally {
      loadMoreInFlight.current = false;
      setLoadingMore(false);
    }
  }, [fetchOrdersPage, hasMore, loadingMore, orderDate]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as RestaurantSettingsPayload;
        setPosSettings(data);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void refreshOrders();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshOrders]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root: null, rootMargin: "160px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const requestStatusChange = (payload: PendingStatusChange) => {
    setStatusConfirm(payload);
  };

  const confirmStatusChange = async () => {
    if (!statusConfirm) return;
    const { orderId, nextStatus } = statusConfirm;
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Update failed");
        return;
      }
      toast.success("Order updated");
      setStatusConfirm(null);
      await refreshOrders();
      if (detail?.id === orderId) {
        void fetchOrderDetail(orderId);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmDeleteOrder = async () => {
    if (!deleteConfirm) return;
    const { orderId, orderRef } = deleteConfirm;
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Delete failed");
        return;
      }
      toast.success(`${orderRef} deleted`);
      setDeleteConfirm(null);
      if (detail?.id === orderId) {
        setDetailOpen(false);
        setDetail(null);
      }
      await refreshOrders();
    } finally {
      setUpdatingId(null);
    }
  };

  const printWholeOrder = useCallback(
    async (o: OrderRow, mode: "kot" | "bill" | "both") => {
      const receiptLines = orderLinePayloadsToReceiptLines(o.lines ?? []);
      if (receiptLines.length === 0) {
        toast.error("No printable lines on this order.");
        return;
      }
      const kotLines = receiptLines.map((r) => receiptLineToKotLine(r));
      const header = posSettings?.billHeader ?? "";
      const footer = posSettings?.billFooter ?? "";
      const orderRefStr = o.orderRef ?? o.id;
      const fulfill = fulfillmentLabelFromKey(o.fulfillment);
      const customerNamePrint = o.customerName?.trim() || "Guest";
      const phonePrint =
        o.customerPhone?.trim() || POS_ANONYMOUS_PHONE_DIGITS;
      const totalRupees = o.totalMinor / 100;
      try {
        if (mode === "kot" || mode === "both") {
          await printPosKotThermal({
            restaurantName: restaurantDisplayName,
            billHeader: header,
            orderRef: orderRefStr,
            fulfillmentLabel: fulfill,
            dineInTable: o.dineInTable?.trim() || undefined,
            notes: "",
            lines: kotLines,
            layout: billPrintLayout,
          });
        }
        if (mode === "bill" || mode === "both") {
          await printPosBillThermal({
            restaurantName: restaurantDisplayName,
            billHeader: header,
            billFooter: footer,
            orderRef: orderRefStr,
            proforma: false,
            fulfillmentLabel: fulfill,
            dineInTable: o.dineInTable?.trim() || undefined,
            customerName: customerNamePrint,
            phoneDigits: phonePrint,
            notes: "",
            paymentLabel: "",
            lines: receiptLines,
            total: totalRupees,
            layout: billPrintLayout,
            deliveryCharge:
              o.deliveryChargeMinor > 0
                ? o.deliveryChargeMinor / 100
                : undefined,
            discount: o.discountMinor > 0 ? o.discountMinor / 100 : undefined,
            itemsSubtotal:
              o.deliveryChargeMinor > 0 || o.discountMinor > 0
                ? (o.totalMinor - o.deliveryChargeMinor + o.discountMinor) / 100
                : undefined,
          });
        }
      } catch (e) {
        console.error(e);
        toast.error("Print failed.");
      }
    },
    [posSettings, restaurantDisplayName, billPrintLayout],
  );

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

  const statusCounts = useMemo(
    () => countOrdersByStatus(orders),
    [orders],
  );

  const filteredOrders = useMemo(
    () => filterOrdersByStatusTab(orders, statusFilter),
    [orders, statusFilter],
  );

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl tracking-tight">Orders</h1>
          <p className="text-muted-foreground text-sm">
            POS and in-restaurant orders. Advance kitchen status, cancel, or
            permanently delete an order. Website orders are managed under Online
            orders.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={(v) => setAutoRefresh(v === true)}
            />
            <Label htmlFor="auto-refresh" className="text-sm font-normal whitespace-nowrap">
              Auto-refresh (30s)
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void refreshOrders()}
          >
            {refreshing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            Refresh
          </Button>
          <Input
            id="orders-date"
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="w-40"
            aria-label="Order date"
          />
          {!viewingToday ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOrderDate(todayIst)}
            >
              Today
            </Button>
          ) : null}
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
            {viewingToday
              ? "No orders today."
              : `No orders on ${orderDate}.`}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-muted-foreground text-sm">
            No orders in this status for the selected date.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map((o) => {
              const step = nextOrderStatusStep(o.status, o.fulfillment);
              const busy = updatingId === o.id;
              const rupee = (o.totalMinor / 100).toFixed(2);
              const canCancel =
                o.status !== "CANCELLED" &&
                o.status !== "DELIVERED" &&
                o.status !== "TABLE_CLEARED";
              const lines = o.lines ?? [];
              const canPrintWhole =
                orderLinePayloadsToReceiptLines(lines).length > 0;
              const statusLabel = restaurantOrderStatusLabel(
                o.status as OrderStatus,
                o.fulfillment,
              );
              return (
                <article
                  key={o.id}
                  className="flex h-[clamp(520px,min(600px,88dvh),640px)] w-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-sm ring-1 ring-border/50"
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
                          {statusLabel}
                        </Badge>
                        {o.createdByLabel?.trim() ? (
                          <Badge
                            variant="outline"
                            className="max-w-[14rem] truncate border-sky-300 bg-sky-50 font-medium text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100"
                            title={`Taken by ${o.createdByLabel.trim()}`}
                          >
                            By {o.createdByLabel.trim()}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {new Date(o.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-lg tabular-nums">
                        ₹{rupee}
                      </p>
                      {o.deliveryChargeMinor > 0 ? (
                        <p className="text-muted-foreground text-xs tabular-nums">
                          incl. ₹{(o.deliveryChargeMinor / 100).toFixed(0)}{" "}
                          delivery
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          {o.currency}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid shrink-0 gap-3 border-b border-border/70 py-3 sm:grid-cols-3">
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
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        Fulfillment
                      </p>
                      <p className="mt-0.5 font-medium">
                        {fulfillmentLabelFromKey(o.fulfillment)}
                      </p>
                      {o.fulfillment === "dine_in" && o.dineInTable?.trim() ? (
                        <p className="mt-1 text-xs font-normal normal-case text-muted-foreground">
                          Table:{" "}
                          <span className="font-medium text-foreground">
                            {o.dineInTable.trim()}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        Taken by
                      </p>
                      <p className="mt-0.5 font-medium">
                        {o.createdByLabel?.trim() || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-3">
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                        Items ({lines.length})
                      </h2>
                      {lines.length === 0 ? (
                        <p className="mt-2 text-muted-foreground text-sm">
                          No line items on this order.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {lines.map((line) => (
                            <li key={line.sortIndex}>
                              <OrderLineView payload={line.payload} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <footer className="mt-auto shrink-0 space-y-2.5 border-t border-border/70 pt-3">
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!canPrintWhole}
                        onClick={() => void printWholeOrder(o, "kot")}
                      >
                        Print KOT
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!canPrintWhole}
                        onClick={() => void printWholeOrder(o, "bill")}
                      >
                        Print bill
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!canPrintWhole}
                        onClick={() => void printWholeOrder(o, "both")}
                      >
                        Print both
                      </Button>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 border-t border-border/60 pt-2.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
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
                          className="h-8 text-xs"
                          disabled={busy}
                          onClick={() =>
                            requestStatusChange({
                              orderId: o.id,
                              orderRef: o.orderRef ?? o.id.slice(0, 8),
                              currentStatusLabel: statusLabel,
                              nextStatus: step.nextStatus,
                              nextStatusLabel: restaurantOrderStatusLabel(
                                step.nextStatus as OrderStatus,
                                o.fulfillment,
                              ),
                              actionLabel: step.label,
                            })
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
                          className="h-8 text-xs"
                          disabled={busy}
                          onClick={() =>
                            requestStatusChange({
                              orderId: o.id,
                              orderRef: o.orderRef ?? o.id.slice(0, 8),
                              currentStatusLabel: statusLabel,
                              nextStatus: "CANCELLED",
                              nextStatusLabel:
                                RESTAURANT_ORDER_STATUS_TAB_LABEL.CANCELLED,
                              actionLabel: "Cancel order",
                              destructive: true,
                            })
                          }
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-8 w-full text-xs"
                      disabled={busy}
                      onClick={() =>
                        setDeleteConfirm({
                          orderId: o.id,
                          orderRef: o.orderRef ?? o.id.slice(0, 8),
                        })
                      }
                    >
                      Delete order
                    </Button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
        {orders.length > 0 && hasMore && (
          <div
            ref={sentinelRef}
            className="flex min-h-14 items-center justify-center py-2"
            aria-hidden="true"
          >
            {loadingMore && (
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
        {orders.length > 0 && !hasMore && (
          <p className="text-center text-muted-foreground text-xs pb-1">
            End of list — all loaded orders are shown.
          </p>
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
            {!detailLoading && detail && (() => {
              const detailStatusLabel = restaurantOrderStatusLabel(
                detail.status as OrderStatus,
                detail.fulfillment,
              );
              return (
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
                      {detailStatusLabel}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Placed: </span>
                    {new Date(detail.createdAt).toLocaleString()}
                  </div>
                  {detail.createdByLabel ? (
                    <div>
                      <span className="text-muted-foreground">Created by: </span>
                      {detail.createdByLabel}
                    </div>
                  ) : null}
                  {detail.deliveryChargeMinor > 0 || detail.discountMinor > 0 ? (
                    <>
                      <div>
                        <span className="text-muted-foreground">Items: </span>
                        ₹
                        {(
                          (detail.totalMinor -
                            detail.deliveryChargeMinor +
                            detail.discountMinor) /
                          100
                        ).toFixed(2)}
                      </div>
                      {detail.deliveryChargeMinor > 0 ? (
                        <div>
                          <span className="text-muted-foreground">
                            Delivery fee:{" "}
                          </span>
                          ₹{(detail.deliveryChargeMinor / 100).toFixed(2)}
                        </div>
                      ) : null}
                      {detail.discountMinor > 0 ? (
                        <div>
                          <span className="text-muted-foreground">
                            Discount:{" "}
                          </span>
                          −₹{(detail.discountMinor / 100).toFixed(2)}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    ₹{(detail.totalMinor / 100).toFixed(2)} {detail.currency}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fulfillment: </span>
                    {fulfillmentLabelFromKey(detail.fulfillment)}
                  </div>
                  {detail.fulfillment === "dine_in" &&
                  detail.dineInTable?.trim() ? (
                    <div>
                      <span className="text-muted-foreground">Table: </span>
                      <span className="font-medium normal-case">
                        {detail.dineInTable.trim()}
                      </span>
                    </div>
                  ) : null}
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

                {detail.events && detail.events.length > 0 ? (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="font-medium text-sm">Activity</div>
                      <ol className="space-y-2">
                        {detail.events.map((ev) => (
                          <li
                            key={ev.id}
                            className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <div className="font-medium">{ev.summary}</div>
                            <div className="text-muted-foreground text-xs mt-0.5">
                              {ev.actorLabel || "—"} ·{" "}
                              {new Date(ev.createdAt).toLocaleString()}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  {(() => {
                    const step = nextOrderStatusStep(detail.status, detail.fulfillment);
                    const busy = updatingId === detail.id;
                    const canCancel =
                      detail.status !== "CANCELLED" &&
                      detail.status !== "DELIVERED" &&
                      detail.status !== "TABLE_CLEARED";
                    return (
                      <>
                        {step && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              requestStatusChange({
                                orderId: detail.id,
                                orderRef: detail.orderRef ?? detail.id.slice(0, 8),
                                currentStatusLabel: detailStatusLabel,
                                nextStatus: step.nextStatus,
                                nextStatusLabel: restaurantOrderStatusLabel(
                                  step.nextStatus as OrderStatus,
                                  detail.fulfillment,
                                ),
                                actionLabel: step.label,
                              })
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
                              requestStatusChange({
                                orderId: detail.id,
                                orderRef: detail.orderRef ?? detail.id.slice(0, 8),
                                currentStatusLabel: detailStatusLabel,
                                nextStatus: "CANCELLED",
                                nextStatusLabel:
                                  RESTAURANT_ORDER_STATUS_TAB_LABEL.CANCELLED,
                                actionLabel: "Cancel order",
                                destructive: true,
                              })
                            }
                          >
                            Cancel order
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() =>
                            setDeleteConfirm({
                              orderId: detail.id,
                              orderRef: detail.orderRef ?? detail.id.slice(0, 8),
                            })
                          }
                        >
                          Delete order
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={statusConfirm !== null}
        onOpenChange={(open) => {
          if (
            !open &&
            (!statusConfirm || updatingId !== statusConfirm.orderId)
          ) {
            setStatusConfirm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {statusConfirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{statusConfirm.actionLabel}?</DialogTitle>
                <DialogDescription>
                  Order{" "}
                  <span className="font-medium text-foreground">
                    {statusConfirm.orderRef}
                  </span>{" "}
                  will change from{" "}
                  <span className="font-medium text-foreground">
                    {statusConfirm.currentStatusLabel}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-foreground">
                    {statusConfirm.nextStatusLabel}
                  </span>
                  .
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(
                    statusConfirm && updatingId === statusConfirm.orderId,
                  )}
                  onClick={() => setStatusConfirm(null)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant={statusConfirm.destructive ? "destructive" : "default"}
                  disabled={updatingId === statusConfirm.orderId}
                  onClick={() => void confirmStatusChange()}
                >
                  {updatingId === statusConfirm.orderId ? "Updating…" : "Confirm"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (
            !open &&
            (!deleteConfirm || updatingId !== deleteConfirm.orderId)
          ) {
            setDeleteConfirm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {deleteConfirm ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete order permanently?</DialogTitle>
                <DialogDescription>
                  Order{" "}
                  <span className="font-medium text-foreground">
                    {deleteConfirm.orderRef}
                  </span>{" "}
                  will be removed. This cannot be undone. Deducted inventory will
                  be restored if needed.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={updatingId === deleteConfirm.orderId}
                  onClick={() => setDeleteConfirm(null)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={updatingId === deleteConfirm.orderId}
                  onClick={() => void confirmDeleteOrder()}
                >
                  {updatingId === deleteConfirm.orderId
                    ? "Deleting…"
                    : "Delete order"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

