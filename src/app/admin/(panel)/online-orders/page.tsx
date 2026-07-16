"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2Icon,
  MapPinIcon,
  MessageCircleIcon,
  NavigationIcon,
  PencilIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { formatIstDateInput } from "@/lib/ist-dates";
import { ORDER_STATUS_LABEL, nextOrderStatusStep } from "@/lib/order-status-workflow";
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
import { migrateCartLine } from "@/lib/cart-line";
import type { ScheduleMode } from "@/lib/order-schedule";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { CartLine } from "@/types/menu";
import type {
  FulfillmentMode,
  RestaurantSettingsPayload,
} from "@/types/restaurant-settings";
import {
  buildCustomerMapUrl,
  formatTravelDistanceLabel,
  parseCoordinates,
  straightLineDistance,
} from "@/lib/travel-distance";
import { openWhatsAppOrder } from "@/utils/whatsapp";

import { OrderLineView } from "@/components/orders/order-line-view";
import { orderStatusBadgeClassName } from "@/components/orders/order-status-badge";

import { EditOrderDialog } from "./edit-order-dialog";

const AUTO_REFRESH_MS = 15_000;

type StatusFilter = "all" | OrderStatus;

const ONLINE_ORDER_STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PENDING", label: ORDER_STATUS_LABEL.PENDING },
  { id: "ACCEPTED", label: ORDER_STATUS_LABEL.ACCEPTED },
  { id: "PREPARING", label: ORDER_STATUS_LABEL.PREPARING },
  { id: "OUT_FOR_DELIVERY", label: "Sent for delivery" },
  { id: "DELIVERED", label: ORDER_STATUS_LABEL.DELIVERED },
  { id: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED },
];

function orderLinesToCartLines(
  lines: { sortIndex: number; payload: unknown }[],
): CartLine[] {
  return lines
    .slice()
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((l) => {
      try {
        return migrateCartLine(l.payload as CartLine);
      } catch {
        return null;
      }
    })
    .filter((l): l is CartLine => l !== null);
}

type TravelDistance = {
  text: string;
  meters: number;
  durationText: string;
  durationSeconds: number;
  estimated?: boolean;
};

function resolveCustomerMapUrl(o: OrderRow): string | null {
  if (o.locationUrl?.trim()) return o.locationUrl.trim();
  const coords = parseCoordinates(o.latitude, o.longitude);
  if (coords) return buildCustomerMapUrl(coords.lat, coords.lng);
  const address = o.address?.trim();
  if (address) {
    const params = new URLSearchParams({ api: "1", query: address });
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }
  return null;
}

async function hydrateOrderDistance(
  o: OrderRow,
  restaurantOrigin: { lat: number; lng: number } | null,
): Promise<OrderRow> {
  if (o.distance || o.fulfillment !== "delivery") return o;
  const coords = parseCoordinates(o.latitude, o.longitude);
  if (!coords) return o;
  try {
    const res = await fetch(
      `/api/distance?lat=${coords.lat}&lng=${coords.lng}`,
      { credentials: "include" },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        distance?: TravelDistance | null;
        originConfigured?: boolean;
      };
      if (data.distance) {
        return {
          ...o,
          latitude: coords.lat,
          longitude: coords.lng,
          distance: data.distance,
        };
      }
      if (!data.originConfigured && restaurantOrigin) {
        return {
          ...o,
          latitude: coords.lat,
          longitude: coords.lng,
          distance: straightLineDistance(
            restaurantOrigin,
            coords.lat,
            coords.lng,
          ),
        };
      }
    }
  } catch {
    /* fall through */
  }
  if (restaurantOrigin) {
    return {
      ...o,
      latitude: coords.lat,
      longitude: coords.lng,
      distance: straightLineDistance(restaurantOrigin, coords.lat, coords.lng),
    };
  }
  return o;
}

async function hydrateOrdersWithDistance(
  orders: OrderRow[],
  restaurantOrigin: { lat: number; lng: number } | null,
): Promise<OrderRow[]> {
  return Promise.all(
    orders.map((o) => hydrateOrderDistance(o, restaurantOrigin)),
  );
}

function restaurantOriginFromSettings(
  settings: RestaurantSettingsPayload | null,
): { lat: number; lng: number } | null {
  if (!settings) return null;
  const coords = parseCoordinates(
    settings.restaurantLatitude,
    settings.restaurantLongitude,
  );
  return coords;
}

async function loadRestaurantOrigin(
  cached: RestaurantSettingsPayload | null,
): Promise<{ lat: number; lng: number } | null> {
  const fromCache = restaurantOriginFromSettings(cached);
  if (fromCache) return fromCache;
  try {
    const res = await fetch("/api/admin/settings", { credentials: "include" });
    if (!res.ok) return null;
    const settings = (await res.json()) as RestaurantSettingsPayload;
    return restaurantOriginFromSettings(settings);
  } catch {
    return null;
  }
}

type OrderRow = {
  id: string;
  orderRef: string | null;
  status: string;
  statusLabel: string;
  fulfillment: string;
  scheduleMode: string;
  scheduledAt: string | null;
  notes: string;
  dineInTable: string;
  totalMinor: number;
  deliveryChargeMinor: number;
  discountMinor: number;
  currency: string;
  createdAt: string;
  customerPhone: string;
  customerName: string | null;
  address: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  mapUrl: string | null;
  locationUrl: string | null;
  distance: TravelDistance | null;
  lines: { sortIndex: number; payload: unknown }[];
};

type PendingAction = {
  orderId: string;
  orderRef: string;
  currentStatusLabel?: string;
  nextStatus: OrderStatus;
  nextStatusLabel: string;
  actionLabel: string;
  destructive?: boolean;
};

type PendingDelete = {
  orderId: string;
  orderRef: string;
};

export default function AdminOnlineOrdersPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actionConfirm, setActionConfirm] = useState<PendingAction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PendingDelete | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [travelConfigured, setTravelConfigured] = useState(true);

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

  const ordersRef = useRef<OrderRow[]>([]);
  ordersRef.current = orders;

  const fetchOnlineOrders = useCallback(async (date: string) => {
    const params = new URLSearchParams({
      view: "online",
      limit: "100",
      date,
    });
    const res = await fetch(`/api/admin/orders?${params.toString()}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("fetch failed");
    return (await res.json()) as {
      orders: OrderRow[];
      travelDistanceConfigured?: boolean;
    };
  }, []);

  const loadInitial = useCallback(async () => {
    setInitialLoad(true);
    try {
      const data = await fetchOnlineOrders(orderDate);
      const origin = await loadRestaurantOrigin(posSettings);
      const hydrated = await hydrateOrdersWithDistance(data.orders, origin);
      setOrders(hydrated);
      setTravelConfigured(
        data.travelDistanceConfigured !== false || origin !== null,
      );
    } catch {
      toast.error("Could not load online orders");
    } finally {
      setInitialLoad(false);
    }
  }, [fetchOnlineOrders, orderDate, posSettings]);

  const refreshOrders = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchOnlineOrders(orderDate);
      const origin = await loadRestaurantOrigin(posSettings);
      const hydrated = await hydrateOrdersWithDistance(data.orders, origin);
      setOrders(hydrated);
      setTravelConfigured(
        data.travelDistanceConfigured !== false || origin !== null,
      );
    } catch {
      toast.error("Could not refresh online orders");
    } finally {
      setRefreshing(false);
    }
  }, [fetchOnlineOrders, orderDate, posSettings]);

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

  const confirmAction = async () => {
    if (!actionConfirm) return;
    const { orderId, nextStatus, nextStatusLabel } = actionConfirm;
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
      toast.success(`Order marked ${nextStatusLabel.toLowerCase()}`);
      setActionConfirm(null);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: nextStatus,
                statusLabel: ORDER_STATUS_LABEL[nextStatus],
              }
            : o,
        ),
      );
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
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
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
      const phonePrint = o.customerPhone?.trim() || POS_ANONYMOUS_PHONE_DIGITS;
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

  const sendOrderToRestaurantWhatsApp = useCallback(
    (o: OrderRow) => {
      const phone = posSettings?.whatsappPhoneE164?.replace(/\D/g, "") ?? "";
      if (!phone) {
        toast.error(
          "Restaurant WhatsApp number is not set. Add it under Settings.",
        );
        return;
      }
      const cartLines = orderLinesToCartLines(o.lines ?? []);
      if (cartLines.length === 0) {
        toast.error("No items on this order to send.");
        return;
      }
      openWhatsAppOrder(
        {
          orderRef: o.orderRef ?? undefined,
          customerName: o.customerName?.trim() || "Guest",
          phone: o.customerPhone,
          fulfillment: o.fulfillment as FulfillmentMode,
          scheduleMode: o.scheduleMode as ScheduleMode,
          scheduledAt: o.scheduledAt,
          address: o.address?.trim() ?? "",
          landmark: o.landmark?.trim() ?? "",
          notes: o.notes?.trim() ?? "",
          lines: cartLines,
          latitude: o.latitude,
          longitude: o.longitude,
          deliveryChargeRupees: o.deliveryChargeMinor / 100,
        },
        phone,
        { useWhatsAppFormatting: true },
      );
    },
    [posSettings],
  );

  const statusCounts = useMemo(
    () => countOrdersByStatus(orders),
    [orders],
  );

  const filteredOrders = useMemo(
    () => filterOrdersByStatusTab(orders, statusFilter),
    [orders, statusFilter],
  );

  const requestStatusChange = (action: PendingAction) => {
    setActionConfirm(action);
  };

  if (initialLoad) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading online orders…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
            <ShoppingBagIcon className="size-6 shrink-0 text-primary" />
            Online orders
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage customer website orders from acceptance through delivery.
            Customers get WhatsApp updates when Cloud API is configured.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={(v) => setAutoRefresh(v === true)}
            />
            <Label
              htmlFor="auto-refresh"
              className="text-sm font-normal whitespace-nowrap"
            >
              Auto-refresh (15s)
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
            id="online-orders-date"
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

      {!travelConfigured ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-amber-950 text-sm dark:text-amber-100">
          Driving distance is off. Set{" "}
          <code className="rounded bg-amber-500/20 px-1">GOOGLE_MAPS_API_KEY</code>,{" "}
          <code className="rounded bg-amber-500/20 px-1">RESTAURANT_LATITUDE</code>{" "}
          and{" "}
          <code className="rounded bg-amber-500/20 px-1">RESTAURANT_LONGITUDE</code>{" "}
          to show travel distance and ETA. Customer location and map links still
          work.
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ONLINE_ORDER_STATUS_TABS.map((tab) => {
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
              ? "No online orders today."
              : `No online orders on ${orderDate}.`}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-muted-foreground text-sm">
            No orders in this status
            {viewingToday ? " today" : ` on ${orderDate}`}.
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {filteredOrders.length}{" "}
              {filteredOrders.length === 1 ? "order" : "orders"}
              {statusFilter === "all"
                ? " total"
                : ` · ${ONLINE_ORDER_STATUS_TABS.find((t) => t.id === statusFilter)?.label ?? statusFilter}`}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOrders.map((o) => {
                const busy = updatingId === o.id;
                const rupee = (o.totalMinor / 100).toFixed(2);
                const lines = o.lines ?? [];
                const canPrintWhole =
                  orderLinePayloadsToReceiptLines(lines).length > 0;
                const step = nextOrderStatusStep(o.status, o.fulfillment);
                const isPending = o.status === "PENDING";
                const canSendWhatsApp =
                  o.status === "PENDING" ||
                  o.status === "ACCEPTED" ||
                  o.status === "OUT_FOR_DELIVERY";
                const canCancel =
                  o.status !== "CANCELLED" && o.status !== "DELIVERED";
                return (
                  <article
                    key={o.id}
                    className={cn(
                      "flex h-[clamp(440px,min(540px,85dvh),580px)] w-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-sm",
                      isPending
                        ? "ring-1 ring-amber-500/30"
                        : "ring-1 ring-border/50",
                    )}
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
                            {isPending ? `New · ${o.statusLabel}` : o.statusLabel}
                          </Badge>
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
                        {o.fulfillment === "dine_in" && o.dineInTable?.trim() ? (
                          <p className="mt-1 text-xs font-normal normal-case text-muted-foreground">
                            Table:{" "}
                            <span className="font-medium text-foreground">
                              {o.dineInTable.trim()}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {o.address?.trim() || o.latitude != null ? (
                      <div className="shrink-0 space-y-2 border-b border-border/70 py-3">
                        <div className="flex items-start gap-2">
                          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                              Customer location
                            </p>
                            {o.address?.trim() ? (
                              <p className="mt-0.5 leading-snug">{o.address.trim()}</p>
                            ) : (
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {o.latitude?.toFixed(5)}, {o.longitude?.toFixed(5)}
                              </p>
                            )}
                            {o.landmark?.trim() ? (
                              <p className="text-muted-foreground text-xs">
                                Landmark: {o.landmark.trim()}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {o.distance ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-sky-600/40 bg-sky-500/12 font-medium text-sky-950 dark:border-sky-400/35 dark:bg-sky-400/12 dark:text-sky-50"
                            >
                              <NavigationIcon className="size-3" />
                              {formatTravelDistanceLabel(o.distance)}
                            </Badge>
                          ) : parseCoordinates(o.latitude, o.longitude) &&
                            travelConfigured ? (
                            <span className="text-muted-foreground text-xs">
                              Distance unavailable
                            </span>
                          ) : null}
                          {resolveCustomerMapUrl(o) ? (
                            <a
                              href={resolveCustomerMapUrl(o)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                            >
                              <NavigationIcon className="size-3" />
                              Open in Google Maps
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

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
                        {isPending ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-xs"
                              disabled={busy}
                              onClick={() => setEditingOrder(o)}
                            >
                              <PencilIcon className="size-3.5" />
                              Edit
                            </Button>
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
                                  nextStatus: "ACCEPTED",
                                  nextStatusLabel: ORDER_STATUS_LABEL.ACCEPTED,
                                  actionLabel: "Accept order",
                                })
                              }
                            >
                              {busy ? "…" : "Accept order"}
                            </Button>
                          </>
                        ) : step ? (
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
                                currentStatusLabel: o.statusLabel,
                                nextStatus: step.nextStatus,
                                nextStatusLabel:
                                  ORDER_STATUS_LABEL[step.nextStatus],
                                actionLabel: step.label,
                              })
                            }
                          >
                            {busy ? "…" : step.label}
                          </Button>
                        ) : null}
                        {canCancel ? (
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
                                currentStatusLabel: o.statusLabel,
                                nextStatus: "CANCELLED",
                                nextStatusLabel: ORDER_STATUS_LABEL.CANCELLED,
                                actionLabel: "Cancel order",
                                destructive: true,
                              })
                            }
                          >
                            Cancel
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() =>
                            setDeleteConfirm({
                              orderId: o.id,
                              orderRef: o.orderRef ?? o.id.slice(0, 8),
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                      {canSendWhatsApp ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 w-full gap-2 bg-[#25D366] text-white hover:bg-[#20bd5a]"
                          disabled={
                            !posSettings?.whatsappPhoneE164?.trim() ||
                            orderLinesToCartLines(lines).length === 0
                          }
                          onClick={() => sendOrderToRestaurantWhatsApp(o)}
                        >
                          <MessageCircleIcon className="size-4" />
                          Send order to Restaurant WhatsApp
                        </Button>
                      ) : null}
                    </footer>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      <EditOrderDialog
        order={editingOrder}
        open={editingOrder !== null}
        onOpenChange={(open) => {
          if (!open) setEditingOrder(null);
        }}
        onSaved={() => void refreshOrders()}
      />

      <Dialog
        open={actionConfirm !== null}
        onOpenChange={(open) => {
          if (
            !open &&
            (!actionConfirm || updatingId !== actionConfirm.orderId)
          ) {
            setActionConfirm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {actionConfirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{actionConfirm.actionLabel}?</DialogTitle>
                <DialogDescription>
                  Order{" "}
                  <span className="font-medium text-foreground">
                    {actionConfirm.orderRef}
                  </span>{" "}
                  will be marked{" "}
                  <span className="font-medium text-foreground">
                    {actionConfirm.nextStatusLabel}
                  </span>
                  .
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={updatingId === actionConfirm.orderId}
                  onClick={() => setActionConfirm(null)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant={actionConfirm.destructive ? "destructive" : "default"}
                  disabled={updatingId === actionConfirm.orderId}
                  onClick={() => void confirmAction()}
                >
                  {updatingId === actionConfirm.orderId
                    ? "Updating…"
                    : "Confirm"}
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

