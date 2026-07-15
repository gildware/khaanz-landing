"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { OrderStatus } from "@prisma/client";

import { OrderLineView } from "@/components/orders/order-line-view";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  RESTAURANT_ORDER_STATUS_TAB_LABEL,
  restaurantOrderStatusLabel,
} from "@/lib/order-status-workflow";
import { writePosMobileEditDraft } from "@/lib/pos-mobile-edit-draft";
import { fulfillmentLabelFromKey } from "@/lib/pos-print";
import { cn } from "@/lib/utils";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

type HistoryScope = "mine" | "all";

type HistoryOrder = {
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
  paymentMethod: string;
  dineInTable: string;
  address: string;
  landmark: string;
  notes: string;
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
    case "CANCELLED":
      return "border-rose-300 bg-rose-50 text-rose-900";
    default:
      return "";
  }
}

function nextStep(
  status: string,
  fulfillment: string,
): { nextStatus: string; label: string } | null {
  switch (status) {
    case "PENDING":
      return { nextStatus: "ACCEPTED", label: "Accept" };
    case "ACCEPTED":
      return { nextStatus: "PREPARING", label: "Preparing" };
    case "PREPARING":
      return {
        nextStatus: "OUT_FOR_DELIVERY",
        label:
          fulfillment === "delivery"
            ? "Out for delivery"
            : fulfillment === "dine_in"
              ? "Ready to serve"
              : "Ready for pickup",
      };
    case "OUT_FOR_DELIVERY":
      return {
        nextStatus: "DELIVERED",
        label: fulfillment === "dine_in" ? "Served" : "Delivered",
      };
    default:
      return null;
  }
}

function canEditOrder(status: string): boolean {
  return status !== "DELIVERED" && status !== "CANCELLED";
}

export default function AdminPosMobileHistoryPage() {
  const router = useRouter();
  const todayIst = formatIstDateInput(new Date());
  const [orderDate, setOrderDate] = useState(todayIst);
  const [scope, setScope] = useState<HistoryScope>("mine");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
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

  const openInPosCart = (order: HistoryOrder) => {
    if (!canEditOrder(order.status)) {
      toast.error("Completed or cancelled orders cannot be edited.");
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
    router.push("/admin/pos/mobile");
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
    (key: string) => {
      const k = key.trim();
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
          scope,
        });
        const res = await fetch(`/api/admin/pos/orders?${qs}`, {
          credentials: "include",
        });
        const data = (await res.json()) as {
          orders?: HistoryOrder[];
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
    [orderDate, scope],
  );

  useEffect(() => {
    setExpandedId(null);
    void fetchOrders();
  }, [fetchOrders]);

  const requestStatusChange = (
    order: HistoryOrder,
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
      nextStatusLabel:
        RESTAURANT_ORDER_STATUS_TAB_LABEL[
          nextStatus as keyof typeof RESTAURANT_ORDER_STATUS_TAB_LABEL
        ] ?? nextStatus,
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
      const res = await fetch(`/api/admin/pos/orders/${pending.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: pending.nextStatus }),
      });
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
      setOrders((prev) =>
        prev.map((o) =>
          o.id === pending.orderId
            ? {
                ...o,
                status: data.status ?? pending.nextStatus,
                statusLabel: data.statusLabel ?? pending.nextStatusLabel,
              }
            : o,
        ),
      );
      toast.success(`${pending.orderRef}: ${pending.actionLabel}`);
    } catch {
      toast.error("Network error.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background px-3 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/pos/mobile"
            aria-label="Back to POS"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "size-10 shrink-0",
            )}
          >
            <ArrowLeftIcon className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-base leading-tight">
              Order history
            </h1>
            <p className="text-muted-foreground text-[11px]">
              Recent POS orders
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
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
        <div className="mt-2.5 space-y-2">
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
          <Input
            type="date"
            value={orderDate}
            max={todayIst}
            onChange={(e) => setOrderDate(e.target.value || todayIst)}
            className="h-11 text-base"
            aria-label="Order date"
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {scope === "mine"
              ? "No orders taken by you for this date."
              : "No POS orders for this date."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {orders.map((o) => {
              const open = expandedId === o.id;
              const statusLabel = restaurantOrderStatusLabel(
                o.status as OrderStatus,
                o.fulfillment,
              );
              const pay = paymentLabel(o.paymentMethod);
              const unpaid = !o.paymentMethod.trim();
              const step = nextStep(o.status, o.fulfillment);
              const busy = updatingId === o.id;
              const editable = canEditOrder(o.status);
              const canCancel =
                o.status !== "CANCELLED" && o.status !== "DELIVERED";
              const takenBy = o.createdByLabel?.trim() || "Unknown";
              const takenByMe =
                Boolean(currentUserId) &&
                o.createdByUserId === currentUserId;
              return (
                <li key={o.id}>
                  <article className="overflow-hidden rounded-xl border bg-card">
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

                    <div className="space-y-2 border-t px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
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
                        {step ? (
                          <Button
                            type="button"
                            className="!h-11 min-w-0 flex-[1.4] text-sm"
                            disabled={busy}
                            onClick={() =>
                              requestStatusChange(o, step.nextStatus, step.label)
                            }
                          >
                            {busy ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              step.label
                            )}
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
                              "Cancel order",
                              true,
                            )
                          }
                        >
                          Cancel order
                        </Button>
                      ) : null}
                    </div>

                    {open ? (
                      <div className="space-y-2 border-t px-3 py-3">
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
      </main>

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
