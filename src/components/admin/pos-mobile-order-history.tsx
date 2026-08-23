"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDownIcon,
  Loader2Icon,
  MapPinIcon,
  NavigationIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { OrderStatus } from "@prisma/client";

import { OrderLineView } from "@/components/orders/order-line-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatIstDateInput } from "@/lib/ist-dates";
import {
  ORDER_STATUS_LABEL,
  RESTAURANT_ORDER_STATUS_TAB_LABEL,
  canAdminSetOrderStatus,
  canEditPosOrder,
  restaurantOrderStatusLabel,
} from "@/lib/order-status-workflow";
import {
  countOrdersByStatus,
  filterOrdersByStatusTab,
} from "@/lib/order-tab-utils";
import { isPosAnonymousPhoneDigits } from "@/lib/phone-digits";
import { writePosMobileEditDraft } from "@/lib/pos-mobile-edit-draft";
import { fulfillmentLabelFromKey } from "@/lib/pos-print";
import {
  buildCustomerMapUrl,
  formatTravelDistanceLabel,
  parseCoordinates,
  type TravelDistance,
} from "@/lib/travel-distance-client";
import { cn } from "@/lib/utils";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

export type PosMobileHistoryScope = "mine" | "all";

export type PosMobileHistoryOrder = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  totalMinor: number;
  deliveryChargeMinor: number;
  discountMinor: number;
  currency: string;
  createdAt: string;
  customerPhone: string;
  customerName: string | null;
  paymentMethod?: string | null;
  dineInTable: string;
  address: string;
  landmark: string;
  notes: string;
  scheduleMode?: string | null;
  scheduledAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapUrl?: string | null;
  locationUrl?: string | null;
  distance?: TravelDistance | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
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

function formatMoneyMinor(minor: number): string {
  return `₹${(minor / 100).toFixed(0)}`;
}

function formatOrderTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolveCustomerMapUrl(order: PosMobileHistoryOrder): string | null {
  if (order.locationUrl?.trim()) return order.locationUrl.trim();
  if (order.mapUrl?.trim()) return order.mapUrl.trim();
  const coords = parseCoordinates(order.latitude, order.longitude);
  if (coords) return buildCustomerMapUrl(coords.lat, coords.lng);
  const address = order.address?.trim();
  if (address) {
    const params = new URLSearchParams({ api: "1", query: address });
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }
  return null;
}

function allowedStatusChanges(
  status: string,
  fulfillment: string,
): OrderStatus[] {
  const flow: OrderStatus[] = [
    "ACCEPTED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "TABLE_CLEARED",
    "CANCELLED",
  ];
  return flow.filter(
    (to) =>
      to !== status &&
      canAdminSetOrderStatus(status as OrderStatus, to, fulfillment),
  );
}

function statusActionLabel(
  to: OrderStatus,
  fulfillment: string,
  online: boolean,
): string {
  if (to === "ACCEPTED") return "Accept";
  if (to === "CANCELLED") return "Cancel";
  if (online) {
    if (to === "OUT_FOR_DELIVERY") return "Sent for delivery";
    return ORDER_STATUS_LABEL[to];
  }
  return restaurantOrderStatusLabel(to, fulfillment);
}

function customerMapsEmbedUrl(order: PosMobileHistoryOrder): string | null {
  const coords = parseCoordinates(order.latitude, order.longitude);
  if (coords) {
    return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=16&output=embed`;
  }
  const address = order.address?.trim();
  if (!address) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
}

function OrderCustomerAndLocation({ order }: { order: PosMobileHistoryOrder }) {
  const mapHref = resolveCustomerMapUrl(order);
  const embedUrl = customerMapsEmbedUrl(order);
  const coords = parseCoordinates(order.latitude, order.longitude);
  const phone = order.customerPhone?.trim() ?? "";
  const digits = phone.replace(/\D/g, "");
  const phoneHref =
    digits.length >= 10 ? `tel:+91${digits.slice(-10)}` : phone ? `tel:${phone}` : null;
  const hasLocation = Boolean(order.address?.trim() || coords || mapHref);

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          Customer
        </p>
        <p className="mt-0.5 text-sm font-medium">
          {order.customerName?.trim() || "—"}
        </p>
        {phone ? (
          isPosAnonymousPhoneDigits(digits.slice(-10) || phone) ? (
            <p className="text-muted-foreground text-xs">No phone</p>
          ) : phoneHref ? (
            <a href={phoneHref} className="font-mono text-primary text-xs">
              {phone}
            </a>
          ) : (
            <p className="font-mono text-muted-foreground text-xs">{phone}</p>
          )
        ) : (
          <p className="text-muted-foreground text-xs">No phone</p>
        )}
      </div>

      {hasLocation ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                Customer location
              </p>
              {order.address?.trim() ? (
                <p className="mt-0.5 text-sm leading-snug">
                  {order.address.trim()}
                </p>
              ) : coords ? (
                <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              ) : null}
              {order.landmark?.trim() ? (
                <p className="text-muted-foreground text-xs">
                  Landmark: {order.landmark.trim()}
                </p>
              ) : null}
            </div>
          </div>
          {embedUrl ? (
            <div className="overflow-hidden rounded-lg border bg-muted">
              <iframe
                title={`Map for ${order.orderRef ?? "order"}`}
                src={embedUrl}
                className="h-40 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {order.distance ? (
              <Badge
                variant="outline"
                className="gap-1 border-sky-600/40 bg-sky-500/12 font-medium text-sky-950 dark:border-sky-400/35 dark:bg-sky-400/12 dark:text-sky-50"
              >
                <NavigationIcon className="size-3" />
                {formatTravelDistanceLabel(order.distance)}
              </Badge>
            ) : null}
            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary text-xs font-medium underline-offset-2 hover:underline"
              >
                <NavigationIcon className="size-3" />
                Open in Google Maps
              </a>
            ) : null}
          </div>
        </div>
      ) : order.fulfillment === "pickup" ? (
        <p className="text-muted-foreground text-xs">Pickup — no delivery address</p>
      ) : null}
    </div>
  );
}

function orderStatusBadgeClassName(status: string): string {
  switch (status) {
    case "PENDING":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "ACCEPTED":
    case "PREPARING":
      return "border-sky-300 bg-sky-50 text-sky-900";
    case "OUT_FOR_DELIVERY":
      return "border-violet-300 bg-violet-50 text-violet-900";
    case "DELIVERED":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "TABLE_CLEARED":
      return "border-stone-300 bg-stone-50 text-stone-800";
    case "CANCELLED":
      return "border-rose-300 bg-rose-50 text-rose-900";
    default:
      return "";
  }
}

type HistoryMode = "pos" | "online";

const ONLINE_STATUS_TABS: { id: "all" | OrderStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PENDING", label: ORDER_STATUS_LABEL.PENDING },
  { id: "ACCEPTED", label: ORDER_STATUS_LABEL.ACCEPTED },
  { id: "PREPARING", label: ORDER_STATUS_LABEL.PREPARING },
  { id: "OUT_FOR_DELIVERY", label: "Sent for delivery" },
  { id: "DELIVERED", label: ORDER_STATUS_LABEL.DELIVERED },
  { id: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED },
];

const AUTO_REFRESH_MS = 15_000;

type Props = {
  /** POS register history vs website / home delivery orders. */
  mode?: HistoryMode;
  /** Called after edit draft is written; default reloads `/admin/pos/mobile`. */
  onEditDraftReady?: () => void;
  /** Fired after a successful status update (e.g. refresh occupied tables). */
  onStatusUpdated?: (order: {
    id: string;
    status: string;
    fulfillment: string;
  }) => void;
  className?: string;
};

export function PosMobileOrderHistory({
  mode = "pos",
  onEditDraftReady,
  onStatusUpdated,
  className,
}: Props) {
  const isOnline = mode === "online";
  const todayIst = formatIstDateInput(new Date());
  const [orderDate, setOrderDate] = useState(todayIst);
  const [scope, setScope] = useState<PosMobileHistoryScope>("mine");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<
    "all" | "dine_in" | "pickup" | "delivery"
  >("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<PosMobileHistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentNames, setPaymentNames] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<PendingStatusChange | null>(
    null,
  );

  const openInPosCart = (order: PosMobileHistoryOrder) => {
    if (!canEditPosOrder(order.status, order.fulfillment)) {
      toast.error(
        order.fulfillment === "dine_in"
          ? "Cleared or cancelled orders cannot be edited."
          : "Completed or cancelled orders cannot be edited.",
      );
      return;
    }
    if ((order.lines ?? []).length === 0) {
      toast.error("This order has no items to edit.");
      return;
    }
    const fulfillment = (
      ["dine_in", "pickup", "delivery"].includes(order.fulfillment)
        ? order.fulfillment
        : "pickup"
    ) as FulfillmentMode;
    writePosMobileEditDraft({
      orderId: order.id,
      orderRef: order.orderRef,
      fulfillment,
      customerName: order.customerName ?? "",
      phone: order.customerPhone ?? "",
      address: order.address ?? "",
      landmark: order.landmark ?? "",
      notes: order.notes ?? "",
      paymentMethod: order.paymentMethod ?? "",
      dineInTable: order.dineInTable ?? "",
      deliveryChargeMinor: order.deliveryChargeMinor,
      discountMinor: order.discountMinor,
      lines: order.lines,
    });
    if (onEditDraftReady) onEditDraftReady();
    else window.location.assign("/admin/pos/mobile");
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as RestaurantSettingsPayload;
        const map: Record<string, string> = {};
        for (const p of data.paymentMethods ?? []) {
          map[p.id] = p.name;
        }
        setPaymentNames(map);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const paymentLabel = useCallback(
    (key: string | null | undefined) => {
      const k = (key ?? "").trim();
      if (!k) return "Unpaid";
      return paymentNames[k] ?? k;
    },
    [paymentNames],
  );

  const fetchOrders = useCallback(
    async (opts?: { offset?: number; append?: boolean; soft?: boolean }) => {
      const offset = opts?.offset ?? 0;
      const append = opts?.append ?? false;
      const soft = opts?.soft ?? false;
      if (append) setLoadingMore(true);
      else if (soft) setRefreshing(true);
      else setLoading(true);
      try {
        const qs = new URLSearchParams({
          date: orderDate,
          limit: "30",
          offset: String(offset),
        });
        if (isOnline) qs.set("view", "online");
        else qs.set("scope", scope);
        const res = await fetch(
          isOnline
            ? `/api/admin/orders?${qs}`
            : `/api/admin/pos/orders?${qs}`,
          {
            credentials: "include",
          },
        );
        const data = (await res.json()) as {
          orders?: PosMobileHistoryOrder[];
          hasMore?: boolean;
          currentUserId?: string;
          error?: string;
        };
        if (!res.ok) {
          toast.error(data.error ?? "Could not load orders.");
          return;
        }
        if (data.currentUserId) setCurrentUserId(data.currentUserId);
        const next = data.orders ?? [];
        setOrders((prev) => (append ? [...prev, ...next] : next));
        setHasMore(Boolean(data.hasMore));
      } catch {
        toast.error("Network error.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [orderDate, scope, isOnline],
  );

  useEffect(() => {
    setExpandedId(null);
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!isOnline) return;
    const id = window.setInterval(() => {
      void fetchOrders({ soft: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [fetchOrders, isOnline]);

  useEffect(() => {
    setExpandedId(null);
  }, [fulfillmentFilter, statusFilter]);

  const byFulfillment =
    fulfillmentFilter === "all"
      ? orders
      : orders.filter((o) => o.fulfillment === fulfillmentFilter);
  const visibleOrders = isOnline
    ? filterOrdersByStatusTab(byFulfillment, statusFilter)
    : byFulfillment;
  const statusCounts = countOrdersByStatus(orders);

  const requestStatusChange = (
    order: PosMobileHistoryOrder,
    nextStatus: string,
    actionLabel: string,
    destructive?: boolean,
  ) => {
    setStatusConfirm({
      orderId: order.id,
      orderRef: order.orderRef ?? order.id.slice(0, 8),
      currentStatusLabel: restaurantOrderStatusLabel(
        order.status as OrderStatus,
        order.fulfillment,
      ),
      nextStatus,
      nextStatusLabel: isOnline
        ? (ORDER_STATUS_LABEL[nextStatus as OrderStatus] ?? nextStatus)
        : (RESTAURANT_ORDER_STATUS_TAB_LABEL[
            nextStatus as keyof typeof RESTAURANT_ORDER_STATUS_TAB_LABEL
          ] ?? nextStatus),
      actionLabel,
      destructive,
    });
  };

  const confirmStatusChange = async () => {
    if (!statusConfirm) return;
    const pending = statusConfirm;
    setUpdatingId(pending.orderId);
    setStatusConfirm(null);
    try {
      const res = await fetch(
        isOnline
          ? `/api/admin/orders/${pending.orderId}`
          : `/api/admin/pos/orders/${pending.orderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: pending.nextStatus }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        statusLabel?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Could not update status.");
        return;
      }
      const nextStatus = data.status ?? pending.nextStatus;
      const fulfillment =
        orders.find((o) => o.id === pending.orderId)?.fulfillment ?? "";
      setOrders((prev) =>
        prev.map((o) =>
          o.id === pending.orderId
            ? {
                ...o,
                status: nextStatus,
                statusLabel: data.statusLabel ?? pending.nextStatusLabel,
              }
            : o,
        ),
      );
      onStatusUpdated?.({
        id: pending.orderId,
        status: nextStatus,
        fulfillment,
      });
      toast.success(`${pending.orderRef}: ${pending.actionLabel}`);
    } catch {
      toast.error("Network error.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="shrink-0 space-y-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <p className="shrink-0 font-semibold text-base">
            {isOnline ? "Online orders" : "Orders"}
          </p>
          <Input
            type="date"
            value={orderDate}
            max={todayIst}
            onChange={(e) => setOrderDate(e.target.value || todayIst)}
            className="h-9 min-w-0 flex-1 text-sm"
            aria-label="Order date"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            disabled={loading || refreshing}
            onClick={() => void fetchOrders({ soft: true })}
            aria-label="Refresh"
          >
            {refreshing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
          </Button>
        </div>
        {isOnline ? (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
            {ONLINE_STATUS_TABS.map((t) => {
              const count =
                t.id === "all"
                  ? statusCounts.total
                  : (statusCounts.byStatus[t.id] ?? 0);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors",
                    statusFilter === t.id
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/80"
                      : "text-muted-foreground active:bg-background/60",
                  )}
                  onClick={() => setStatusFilter(t.id)}
                >
                  {t.label}
                  {count > 0 ? (
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/50 p-1">
            {(
              [
                { id: "mine" as const, label: "My orders" },
                { id: "all" as const, label: "All orders" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  scope === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground active:bg-background/60",
                )}
                onClick={() => setScope(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div
          className={cn(
            "grid gap-1 rounded-xl bg-muted/50 p-1",
            isOnline ? "grid-cols-3" : "grid-cols-4",
          )}
        >
          {(isOnline
            ? ([
                { id: "all" as const, label: "All" },
                { id: "pickup" as const, label: "Pickup" },
                { id: "delivery" as const, label: "Delivery" },
              ] as const)
            : ([
                { id: "all" as const, label: "All" },
                { id: "dine_in" as const, label: "Dine-in" },
                { id: "pickup" as const, label: "Pickup" },
                { id: "delivery" as const, label: "Delivery" },
              ] as const)
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:text-xs",
                fulfillmentFilter === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground active:bg-background/60",
              )}
              onClick={() => setFulfillmentFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading orders…
          </div>
        ) : visibleOrders.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {isOnline
              ? "No online / home orders for this date."
              : scope === "mine"
                ? "No orders taken by you for this date."
                : "No POS orders for this date."}
            {fulfillmentFilter !== "all" ? " Try another filter." : ""}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {visibleOrders.map((o) => {
              const open = expandedId === o.id;
              const statusLabel = isOnline
                ? o.status === "PENDING"
                  ? `New · ${ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.statusLabel}`
                  : (ORDER_STATUS_LABEL[o.status as OrderStatus] ??
                    o.statusLabel)
                : restaurantOrderStatusLabel(
                    o.status as OrderStatus,
                    o.fulfillment,
                  );
              const pay = paymentLabel(o.paymentMethod);
              const unpaid = !(o.paymentMethod ?? "").trim();
              const busy = updatingId === o.id;
              const editable = canEditPosOrder(o.status, o.fulfillment);
              const statusActions = allowedStatusChanges(
                o.status,
                o.fulfillment,
              );
              const advanceActions = statusActions.filter(
                (s) => s !== "CANCELLED",
              );
              const canCancel = statusActions.includes("CANCELLED");
              const takenBy = o.createdByLabel?.trim() || "Unknown";
              const takenByMe =
                Boolean(currentUserId) &&
                o.createdByUserId === currentUserId;
              return (
                <li key={o.id}>
                  <article
                    className={cn(
                      "overflow-hidden rounded-xl border bg-card",
                      open &&
                        "border-primary/40 bg-accent/50 ring-1 ring-primary/20",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 px-3 py-3 text-left active:bg-muted/40"
                      onClick={() =>
                        setExpandedId((id) => (id === o.id ? null : o.id))
                      }
                      aria-expanded={open}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {o.orderRef ?? "—"}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-medium",
                              orderStatusBadgeClassName(o.status),
                            )}
                          >
                            {statusLabel}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "max-w-[10rem] truncate text-[10px] font-medium",
                              takenByMe
                                ? "border-sky-300 bg-sky-50 text-sky-900"
                                : "border-border bg-muted/40 text-muted-foreground",
                            )}
                            title={takenBy}
                          >
                            {takenByMe ? "You" : takenBy}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {formatOrderTime(o.createdAt)} ·{" "}
                          {fulfillmentLabelFromKey(o.fulfillment)}
                          {o.fulfillment === "dine_in" && o.dineInTable?.trim()
                            ? ` · ${o.dineInTable.trim()}`
                            : ""}
                        </p>
                        <p className="text-xs">
                          <span
                            className={cn(
                              "font-medium",
                              unpaid
                                ? "text-amber-700 dark:text-amber-300"
                                : "text-emerald-700 dark:text-emerald-300",
                            )}
                          >
                            {pay}
                          </span>
                          {o.customerName?.trim() ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {o.customerName.trim()}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-semibold tabular-nums">
                          {formatMoneyMinor(o.totalMinor)}
                        </span>
                        <ChevronDownIcon
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            open && "rotate-180",
                          )}
                        />
                      </div>
                    </button>

                    {open ? (
                      <div className="space-y-3 border-t border-primary/20 bg-muted/70 px-3 py-3">
                        <div>
                          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                            Order details
                          </p>
                          <p className="mt-0.5 text-sm">
                            Received {formatIstDateTime(o.createdAt)}
                          </p>
                          {o.scheduleMode === "scheduled" && o.scheduledAt ? (
                            <p className="mt-0.5 text-amber-800 text-xs dark:text-amber-200">
                              Scheduled for {formatIstDateTime(o.scheduledAt)}
                            </p>
                          ) : null}
                        </div>
                        {(o.lines ?? []).length === 0 ? (
                          <p className="text-muted-foreground text-sm">
                            No line items.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {o.lines.map((l) => (
                              <li key={`${o.id}-${l.sortIndex}`}>
                                <OrderLineView payload={l.payload} />
                              </li>
                            ))}
                          </ul>
                        )}
                        {o.discountMinor > 0 || o.deliveryChargeMinor > 0 ? (
                          <div className="space-y-1 border-t pt-2 text-xs">
                            {o.deliveryChargeMinor > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Delivery
                                </span>
                                <span className="tabular-nums">
                                  +{formatMoneyMinor(o.deliveryChargeMinor)}
                                </span>
                              </div>
                            ) : null}
                            {o.discountMinor > 0 ? (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Discount
                                </span>
                                <span className="tabular-nums text-emerald-700">
                                  −{formatMoneyMinor(o.discountMinor)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {o.notes?.trim() ? (
                          <p className="text-muted-foreground text-xs">
                            Note: {o.notes.trim()}
                          </p>
                        ) : null}
                        <OrderCustomerAndLocation order={o} />
                        {editable ||
                        advanceActions.length > 0 ||
                        canCancel ? (
                          <div className="space-y-2 border-t border-primary/20 pt-3">
                            <div className="flex flex-wrap gap-2">
                              {advanceActions.map((to) => (
                                <Button
                                  key={to}
                                  type="button"
                                  className="!h-11 min-w-0 flex-1 text-sm"
                                  disabled={busy}
                                  onClick={() =>
                                    requestStatusChange(
                                      o,
                                      to,
                                      statusActionLabel(
                                        to,
                                        o.fulfillment,
                                        isOnline,
                                      ),
                                    )
                                  }
                                >
                                  {busy ? (
                                    <Loader2Icon className="size-4 animate-spin" />
                                  ) : (
                                    statusActionLabel(
                                      to,
                                      o.fulfillment,
                                      isOnline,
                                    )
                                  )}
                                </Button>
                              ))}
                              {editable ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="!h-11 flex-1 gap-1.5 text-sm"
                                  disabled={busy}
                                  onClick={() => openInPosCart(o)}
                                >
                                  <PencilIcon className="size-3.5" />
                                  Edit in POS
                                </Button>
                              ) : null}
                            </div>
                            {canCancel ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="!h-11 w-full text-sm text-destructive hover:text-destructive"
                                disabled={busy}
                                onClick={() =>
                                  requestStatusChange(
                                    o,
                                    "CANCELLED",
                                    "Cancel",
                                    true,
                                  )
                                }
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              className="!h-12 w-full text-base"
              disabled={loadingMore}
              onClick={() =>
                void fetchOrders({ offset: orders.length, append: true })
              }
            >
              {loadingMore ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={statusConfirm !== null}
        onOpenChange={(o) => {
          if (!o) setStatusConfirm(null);
        }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusConfirm?.destructive ? "Cancel order?" : "Update status?"}
            </DialogTitle>
            <DialogDescription>
              {statusConfirm ? (
                <>
                  {statusConfirm.orderRef}: {statusConfirm.currentStatusLabel} →{" "}
                  {statusConfirm.nextStatusLabel}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="!h-12 w-full text-base"
              variant={statusConfirm?.destructive ? "destructive" : "default"}
              onClick={() => void confirmStatusChange()}
            >
              {statusConfirm?.actionLabel ?? "Confirm"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="!h-12 w-full text-base"
              onClick={() => setStatusConfirm(null)}
            >
              Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
