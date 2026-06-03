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
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import { POS_ANONYMOUS_PHONE_DIGITS } from "@/lib/phone-digits";
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
import { openWhatsAppOrder } from "@/utils/whatsapp";

import { OrderLineView } from "@/components/orders/order-line-view";

import { EditOrderDialog } from "./edit-order-dialog";

const AUTO_REFRESH_MS = 15_000;

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
};

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
  nextStatus: "ACCEPTED" | "CANCELLED";
  actionLabel: string;
  destructive?: boolean;
};

export default function AdminOnlineOrdersPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actionConfirm, setActionConfirm] = useState<PendingAction | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [travelConfigured, setTravelConfigured] = useState(true);

  const [posSettings, setPosSettings] = useState<RestaurantSettingsPayload | null>(
    null,
  );

  const ordersRef = useRef<OrderRow[]>([]);
  ordersRef.current = orders;

  const fetchOnlineOrders = useCallback(async () => {
    const res = await fetch("/api/admin/orders?view=online_pending&limit=100", {
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
      const data = await fetchOnlineOrders();
      setOrders(data.orders);
      setTravelConfigured(data.travelDistanceConfigured !== false);
    } catch {
      toast.error("Could not load online orders");
    } finally {
      setInitialLoad(false);
    }
  }, [fetchOnlineOrders]);

  const refreshOrders = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchOnlineOrders();
      setOrders(data.orders);
      setTravelConfigured(data.travelDistanceConfigured !== false);
    } catch {
      toast.error("Could not refresh online orders");
    } finally {
      setRefreshing(false);
    }
  }, [fetchOnlineOrders]);

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
    const { orderId, nextStatus } = actionConfirm;
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
      toast.success(
        nextStatus === "ACCEPTED"
          ? "Order accepted — moved to Orders"
          : "Order cancelled",
      );
      setActionConfirm(null);
      // Accepted/cancelled orders drop out of the pending inbox.
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
            restaurantName: SITE.name,
            billHeader: header,
            orderRef: orderRefStr,
            fulfillmentLabel: fulfill,
            dineInTable: o.dineInTable?.trim() || undefined,
            notes: "",
            lines: kotLines,
          });
        }
        if (mode === "bill" || mode === "both") {
          await printPosBillThermal({
            restaurantName: SITE.name,
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
    [posSettings],
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

  const pendingCount = useMemo(() => orders.length, [orders]);

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
            New customer orders awaiting acceptance. Accept an order to send it
            to the kitchen and move it into Orders.
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

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-muted-foreground text-sm">
            No new online orders. Accepted orders appear under Orders.
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {pendingCount} {pendingCount === 1 ? "order" : "orders"} waiting to
              be accepted.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orders.map((o) => {
                const busy = updatingId === o.id;
                const rupee = (o.totalMinor / 100).toFixed(2);
                const lines = o.lines ?? [];
                const canPrintWhole =
                  orderLinePayloadsToReceiptLines(lines).length > 0;
                return (
                  <article
                    key={o.id}
                    className="flex h-[clamp(440px,min(540px,85dvh),580px)] w-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-sm ring-1 ring-amber-500/30"
                  >
                    <div className="flex shrink-0 gap-3 border-b border-border/70 pb-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold tracking-tight">
                            {o.orderRef ?? "—"}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/15 font-medium text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-50"
                          >
                            New · {o.statusLabel}
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
                              {o.distance.text} · {o.distance.durationText} drive
                            </Badge>
                          ) : o.latitude != null && travelConfigured ? (
                            <span className="text-muted-foreground text-xs">
                              Distance unavailable
                            </span>
                          ) : null}
                          {o.mapUrl ? (
                            <a
                              href={o.mapUrl}
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
                            setActionConfirm({
                              orderId: o.id,
                              orderRef: o.orderRef ?? o.id.slice(0, 8),
                              nextStatus: "ACCEPTED",
                              actionLabel: "Accept order",
                            })
                          }
                        >
                          {busy ? "…" : "Accept order"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={busy}
                          onClick={() =>
                            setActionConfirm({
                              orderId: o.id,
                              orderRef: o.orderRef ?? o.id.slice(0, 8),
                              nextStatus: "CANCELLED",
                              actionLabel: "Cancel order",
                              destructive: true,
                            })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
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
                    {ORDER_STATUS_LABEL[actionConfirm.nextStatus as OrderStatus]}
                  </span>
                  {actionConfirm.nextStatus === "ACCEPTED"
                    ? " and moved into Orders."
                    : "."}
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
    </div>
  );
}

