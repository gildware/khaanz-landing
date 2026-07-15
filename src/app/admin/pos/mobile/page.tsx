"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ClipboardListIcon,
  HomeIcon,
  ImageIcon,
  Loader2Icon,
  LogOutIcon,
  MinusIcon,
  PlusIcon,
  StoreIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PosDeliveryCustomerPhoneInput } from "@/components/admin/pos-delivery-customer-phone-input";
import { PosMobileOrderHistory } from "@/components/admin/pos-mobile-order-history";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  CAT_COMBOS,
  CAT_OPEN,
  formatMoney,
  useAdminPosRegister,
} from "@/hooks/use-admin-pos-register";
import { getKhaanzDesktop } from "@/lib/khaanz-desktop-client";
import { writePosMobileEditDraft } from "@/lib/pos-mobile-edit-draft";
import { SITE } from "@/lib/site";
import { floorTableBoxStyle } from "@/types/floor-plan";
import { cn } from "@/lib/utils";
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";
import type { FulfillmentMode } from "@/types/restaurant-settings";

type MainTab = "home" | "orders";
type RegisterStep = "type" | "menu" | "cart" | "checkout";

export default function AdminPosMobilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Loading…
        </div>
      }
    >
      <AdminPosMobilePageInner />
    </Suspense>
  );
}

function AdminPosMobilePageInner() {
  const searchParams = useSearchParams();
  const pos = useAdminPosRegister();
  const {
    isLoading,
    error,
    menu,
    logout,
    categoryKey,
    setCategoryKey,
    query,
    setQuery,
    openItemName,
    setOpenItemName,
    openItemPrice,
    setOpenItemPrice,
    openItemModalOpen,
    setOpenItemModalOpen,
    closeOpenItemModal,
    cart,
    fulfillment,
    setFulfillment,
    address,
    setAddress,
    landmark,
    setLandmark,
    customerName,
    setCustomerName,
    phone,
    setPhone,
    notes,
    setNotes,
    discountInput,
    setDiscountInput,
    deliveryChargeInput,
    setDeliveryChargeInput,
    placing,
    printerDialogOpen,
    setPrinterDialogOpen,
    printerDeviceName,
    setPrinterDeviceName,
    printers,
    printerConnected,
    posSettings,
    floorPlan,
    selectedTableId,
    setSelectedTableId,
    paymentMethodKey,
    setPaymentMethodKey,
    paymentStatus,
    setPaymentStatus,
    lastBill,
    categoryRail,
    refreshPrinterStatus,
    offlineQueueCount,
    syncingNow,
    syncNow,
    dineInTableLabel,
    dialogItem,
    setDialogItem,
    variationId,
    setVariationId,
    addonQty,
    setAddonQty,
    billTotals,
    total,
    dialogConfigureUnit,
    hasDialogAddonQty,
    addOpenLine,
    addComboLine,
    bumpQty,
    removeLine,
    openConfigure,
    confirmConfigure,
    filteredItems,
    filteredCombos,
    submitPosOrder,
    canAddItems,
    editingOrderId,
    editingOrderRef,
    editDraftLoaded,
    cancelEditingOrder,
  } = pos;

  const [mainTab, setMainTab] = useState<MainTab>(() =>
    searchParams.get("tab") === "orders" ? "orders" : "home",
  );
  const [registerStep, setRegisterStep] = useState<RegisterStep | null>(null);
  const [selectedType, setSelectedType] = useState<
    "dine_in" | "pickup" | "delivery" | null
  >(null);
  const [occupiedByLabel, setOccupiedByLabel] = useState<
    Record<string, { orderId: string; orderRef: string | null }>
  >({});
  const [occupiedLoadingId, setOccupiedLoadingId] = useState<string | null>(
    null,
  );
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const isEditing = Boolean(editingOrderId);
  const inOrderWorkspace =
    mainTab === "home" &&
    (registerStep === "menu" ||
      registerStep === "cart" ||
      registerStep === "checkout");
  const showHomeChooser =
    mainTab === "home" &&
    (registerStep == null || registerStep === "type");

  const loadOccupiedTables = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pos/occupied-tables", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        tables?: { label: string; orderId: string; orderRef: string | null }[];
      };
      const map: Record<string, { orderId: string; orderRef: string | null }> =
        {};
      for (const t of data.tables ?? []) {
        const label = t.label.trim();
        if (!label) continue;
        map[label] = { orderId: t.orderId, orderRef: t.orderRef };
      }
      setOccupiedByLabel(map);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("tab") === "orders") setMainTab("orders");
  }, [searchParams]);

  useEffect(() => {
    if (selectedType === "dine_in" && showHomeChooser) {
      void loadOccupiedTables();
    }
  }, [selectedType, showHomeChooser, loadOccupiedTables]);

  useEffect(() => {
    if (editDraftLoaded && cart.length > 0) {
      setSelectedType(null);
      setRegisterStep("cart");
      setMainTab("home");
    }
  }, [editDraftLoaded, cart.length]);

  useEffect(() => {
    if (cart.length === 0 && !isEditing && registerStep != null) {
      if (registerStep === "cart" || registerStep === "checkout") {
        setRegisterStep(null);
        setSelectedType(null);
        setMainTab("home");
      }
    }
  }, [cart.length, isEditing, registerStep]);

  const goHomeChooser = () => {
    setRegisterStep(null);
    setSelectedType(null);
    setMainTab("home");
  };

  const selectOrderType = (mode: "dine_in" | "pickup" | "delivery") => {
    setSelectedType(mode);
    setFulfillment(mode);
    if (mode === "dine_in" && floorPlan.tables.length > 0) {
      setRegisterStep("type");
      return;
    }
    setRegisterStep("menu");
  };

  const openOccupiedOrder = async (orderId: string) => {
    setOccupiedLoadingId(orderId);
    try {
      const res = await fetch(`/api/admin/pos/orders/${orderId}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        id?: string;
        orderRef?: string | null;
        fulfillment?: string;
        customerName?: string | null;
        customerPhone?: string;
        address?: string;
        landmark?: string;
        notes?: string;
        paymentMethod?: string;
        dineInTable?: string;
        deliveryChargeMinor?: number;
        discountMinor?: number;
        lines?: { sortIndex: number; payload: unknown }[];
      };
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "Could not open occupied table order.");
        return;
      }
      if (!data.lines?.length) {
        toast.error("This order has no items to edit.");
        return;
      }
      const fulfillment = (
        ["dine_in", "pickup", "delivery"].includes(data.fulfillment ?? "")
          ? data.fulfillment
          : "dine_in"
      ) as FulfillmentMode;
      writePosMobileEditDraft({
        orderId: data.id,
        orderRef: data.orderRef ?? null,
        fulfillment,
        customerName: data.customerName ?? "",
        phone: data.customerPhone ?? "",
        address: data.address ?? "",
        landmark: data.landmark ?? "",
        notes: data.notes ?? "",
        paymentMethod: data.paymentMethod ?? "",
        dineInTable: data.dineInTable ?? "",
        deliveryChargeMinor: data.deliveryChargeMinor ?? 0,
        discountMinor: data.discountMinor ?? 0,
        lines: data.lines,
      });
      window.location.assign("/admin/pos/mobile");
    } catch {
      toast.error("Network error opening order.");
    } finally {
      setOccupiedLoadingId(null);
    }
  };

  const pickTable = (tableId: string) => {
    const table = floorPlan.tables.find((t) => t.id === tableId);
    const label = table?.label.trim() ?? "";
    const occ = label ? occupiedByLabel[label] : undefined;
    if (occ && !(isEditing && occ.orderId === editingOrderId)) {
      void openOccupiedOrder(occ.orderId);
      return;
    }
    setSelectedTableId(tableId);
    setRegisterStep("menu");
  };

  const changeTable = () => {
    setSelectedTableId(null);
    setSelectedType("dine_in");
    setFulfillment("dine_in");
    setRegisterStep("type");
    setMainTab("home");
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Loading menu…
      </div>
    );
  }

  if (error || !menu) {
    return (
      <p className="text-destructive p-4 text-sm">
        Could not load menu. Refresh the page.
      </p>
    );
  }

  const ensurePrinterOrSubmit = (mode: "none" | "kot" | "bill" | "both") => {
    if (mode !== "none" && getKhaanzDesktop()?.isDesktop && !printerConnected) {
      setPrinterDialogOpen(true);
      return;
    }
    void submitPosOrder(mode);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="safe-area-pt shrink-0 border-b bg-background px-3 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <div className="relative size-8 shrink-0">
            <Image
              src={SITE.logoPath}
              alt=""
              fill
              className="object-contain"
              sizes="32px"
              priority
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-base leading-tight tracking-tight">
              {SITE.name} POS
            </h1>
            {offlineQueueCount > 0 ? (
              <p className="text-amber-700 text-[11px] dark:text-amber-200">
                Offline queue: {offlineQueueCount}
              </p>
            ) : (
              <p className="text-muted-foreground text-[11px]">Mobile register</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {getKhaanzDesktop()?.isDesktop ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                disabled={syncingNow}
                onClick={() => void syncNow()}
              >
                {syncingNow ? "…" : "Sync"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={() => void logout()}
              aria-label="Sign out"
            >
              <LogOutIcon className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {isEditing ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-amber-500/10 px-3 py-2">
          <p className="min-w-0 flex-1 text-amber-900 text-xs font-medium dark:text-amber-100">
            Editing {editingOrderRef ?? "order"} — update cart, then save
          </p>
          <Button
            type="button"
            variant="outline"
            className="!h-9 shrink-0 px-3 text-xs"
            onClick={() => {
              cancelEditingOrder();
              goHomeChooser();
            }}
          >
            Discard
          </Button>
        </div>
      ) : null}

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {mainTab === "orders" ? (
          <PosMobileOrderHistory
            onEditDraftReady={() => window.location.assign("/admin/pos/mobile")}
            onStatusUpdated={() => {
              void loadOccupiedTables();
            }}
          />
        ) : null}

        {mainTab === "home" && showHomeChooser ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [-webkit-overflow-scrolling:touch]">
              <p className="font-semibold text-lg">Order type</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose dine-in, pickup, or delivery to start.
              </p>
              <div className="mt-5 grid gap-3">
                {(
                  [
                    ["dine_in", "Dine-in"],
                    ["pickup", "Pickup"],
                    ["delivery", "Delivery"],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="lg"
                    className="h-14 w-full text-base"
                    variant={selectedType === key ? "default" : "outline"}
                    onClick={() => selectOrderType(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {selectedType === "dine_in" && floorPlan.tables.length > 0 ? (
                <div className="mt-6 space-y-3">
                  <div>
                    <p className="font-semibold text-sm">Choose a table</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Tap an occupied table to edit that order. Free tables start
                      a new order.
                    </p>
                  </div>
                  <div className="relative aspect-[5/4] w-full overflow-hidden rounded-xl border bg-muted/50">
                    {floorPlan.tables.map((t) => {
                      const label = t.label.trim();
                      const occ = label ? occupiedByLabel[label] : undefined;
                      const occupied =
                        Boolean(occ) &&
                        !(isEditing && occ?.orderId === editingOrderId);
                      const loadingThis =
                        occupied &&
                        Boolean(occ) &&
                        occupiedLoadingId === occ?.orderId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={Boolean(occupiedLoadingId)}
                          className={cn(
                            "absolute flex flex-col items-center justify-center rounded-md border px-1 text-center text-[10px] font-semibold leading-tight shadow-sm",
                            occupied
                              ? "border-amber-400 bg-amber-100 text-amber-950 active:bg-amber-200"
                              : selectedTableId === t.id
                                ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/25"
                                : "border-border bg-card text-foreground active:bg-muted/80",
                          )}
                          style={floorTableBoxStyle(t)}
                          onClick={() => pickTable(t.id)}
                        >
                          <span>{t.label}</span>
                          {occupied ? (
                            <span className="mt-0.5 text-[8px] font-medium uppercase tracking-wide">
                              {loadingThis ? "Opening…" : "Occupied · Edit"}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTableId ? (
                    <Button
                      type="button"
                      className="h-12 w-full text-base"
                      onClick={() => setRegisterStep("menu")}
                    >
                      Continue to menu · {dineInTableLabel || "Table"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {inOrderWorkspace ? (
          <div className="flex h-full min-h-0 flex-col">
            <div
              className="shrink-0 grid grid-cols-4 border-b bg-muted/20"
              role="tablist"
              aria-label="Order steps"
            >
              {(
                [
                  { id: "type" as const, label: "Type" },
                  { id: "menu" as const, label: "Menu" },
                  { id: "cart" as const, label: "Cart" },
                  { id: "checkout" as const, label: "Pay" },
                ] as const
              ).map(({ id, label }) => {
                const active = registerStep === id;
                const disabled =
                  (id === "cart" || id === "checkout") &&
                  cart.length === 0 &&
                  !active;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={disabled}
                    className={cn(
                      "relative py-2.5 text-xs font-medium transition-colors disabled:opacity-40",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                    onClick={() => {
                      if (id === "type") {
                        setSelectedType(
                          fulfillment === "dine_in" ||
                            fulfillment === "pickup" ||
                            fulfillment === "delivery"
                            ? fulfillment
                            : null,
                        );
                        setRegisterStep("type");
                        return;
                      }
                      setRegisterStep(id);
                    }}
                  >
                    {label}
                    {id === "cart" && cartCount > 0 ? (
                      <span className="ml-1 tabular-nums text-[10px]">
                        ({cartCount > 99 ? "99+" : cartCount})
                      </span>
                    ) : null}
                    {active ? (
                      <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {registerStep === "menu" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-2 border-b bg-muted/20 px-3 py-2.5">
              <Input
                placeholder="Search menu…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={categoryKey === CAT_OPEN}
                className="h-11 bg-background text-base disabled:opacity-60"
              />
              <div
                className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Categories"
              >
                {categoryRail.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={categoryKey === key}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                      categoryKey === key
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground active:bg-muted/80",
                    )}
                    onClick={() => setCategoryKey(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {fulfillment === "dine_in" &&
              floorPlan.tables.length > 0 &&
              selectedTableId ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                  onClick={changeTable}
                >
                  <span className="text-muted-foreground">
                    Table{" "}
                    <span className="font-medium text-foreground">
                      {dineInTableLabel || "—"}
                    </span>
                  </span>
                  <span className="text-primary text-xs font-medium">Change</span>
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              {categoryKey === CAT_OPEN ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-muted-foreground max-w-xs text-sm">
                    Add a one-off line not on the menu.
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 min-w-[12rem] gap-2 rounded-full px-8"
                    disabled={!canAddItems}
                    onClick={() => setOpenItemModalOpen(true)}
                  >
                    <PlusIcon className="size-4" />
                    Add open item
                  </Button>
                </div>
              ) : categoryKey === CAT_COMBOS ? (
                <div className="grid grid-cols-3 gap-1.5 p-2">
                  {filteredCombos.map((combo) => (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => addComboLine(combo)}
                      className="flex flex-col rounded-lg border bg-background p-1.5 text-left active:bg-muted/60"
                    >
                      <div className="relative mb-1 aspect-square w-full overflow-hidden rounded-md bg-muted">
                        {combo.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={combo.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-[11px] font-medium leading-snug">
                        {combo.name}
                      </p>
                      <p className="mt-0.5 text-muted-foreground text-[10px] tabular-nums">
                        {formatMoney(combo.price)}
                      </p>
                    </button>
                  ))}
                  {filteredCombos.length === 0 ? (
                    <p className="text-muted-foreground col-span-3 py-8 text-center text-sm">
                      No combos match your search.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 p-2">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openConfigure(item)}
                      className={cn(
                        "flex flex-col rounded-lg border bg-background p-1.5 text-left active:bg-muted/60",
                        item.available === false && "opacity-50",
                      )}
                    >
                      <div className="relative mb-1 aspect-square w-full overflow-hidden rounded-md bg-muted">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-[11px] font-medium leading-snug">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-muted-foreground text-[10px] tabular-nums">
                        from{" "}
                        {formatMoney(
                          item.variations.length
                            ? Math.min(...item.variations.map((v) => v.price))
                            : 0,
                        )}
                      </p>
                    </button>
                  ))}
                  {filteredItems.length === 0 ? (
                    <p className="text-muted-foreground col-span-3 py-8 text-center text-sm">
                      No items in this category.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}

              {registerStep === "cart" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b px-3 py-3">
              <p className="font-semibold text-base">Cart</p>
              <p className="text-muted-foreground text-xs">
                {cartCount} item{cartCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
              {cart.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">
                  Cart is empty. Add items from the menu.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {cart.map((line) => {
                    const label = isCartComboLine(line)
                      ? `${line.name} (Combo)`
                      : isCartOpenLine(line)
                        ? `${line.name} (Open)`
                        : `${line.name} (${line.variation.name})`;
                    const sub = line.unitPrice * line.quantity;
                    return (
                      <li
                        key={line.lineId}
                        className="rounded-lg border bg-card px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-xs leading-snug">
                              {label}
                            </p>
                            <p className="mt-0.5 text-muted-foreground text-[10px] tabular-nums">
                              {formatMoney(line.unitPrice)} each
                            </p>
                            {isCartItemLine(line) &&
                            line.addons.some((a) => a.quantity > 0) ? (
                              <ul className="mt-0.5 space-y-0">
                                {line.addons
                                  .filter((a) => a.quantity > 0)
                                  .map((a) => (
                                    <li
                                      key={a.id}
                                      className="text-muted-foreground text-[10px]"
                                    >
                                      + {a.name} ×{a.quantity}
                                    </li>
                                  ))}
                              </ul>
                            ) : null}
                            {isCartComboLine(line) && line.componentSummary ? (
                              <p className="text-muted-foreground mt-0.5 text-[10px]">
                                {line.componentSummary}
                              </p>
                            ) : null}
                          </div>
                          <p className="shrink-0 font-semibold text-xs tabular-nums">
                            {formatMoney(sub)}
                          </p>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8"
                              onClick={() => bumpQty(line.lineId, -1)}
                              aria-label="Decrease quantity"
                            >
                              <MinusIcon className="size-3.5" />
                            </Button>
                            <span className="w-6 text-center text-sm tabular-nums font-medium">
                              {line.quantity}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8"
                              onClick={() => bumpQty(line.lineId, 1)}
                              aria-label="Increase quantity"
                            >
                              <PlusIcon className="size-3.5" />
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 px-2 text-xs text-destructive"
                            onClick={() => removeLine(line.lineId)}
                          >
                            Remove
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {cart.length > 0 ? (
              <div className="shrink-0 space-y-2 border-t bg-background p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(billTotals.itemsTotal)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 text-sm"
                    onClick={() => setRegisterStep("menu")}
                  >
                    Add more items
                  </Button>
                  <Button
                    type="button"
                    className="h-12 text-sm"
                    onClick={() => setRegisterStep("checkout")}
                  >
                    Checkout · {formatMoney(total)}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

              {registerStep === "checkout" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
              <section className="space-y-2">
                <p className="font-semibold text-sm">Order type</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["dine_in", "Dine-in"],
                      ["pickup", "Pickup"],
                      ["delivery", "Delivery"],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      type="button"
                      size="lg"
                      className="h-11 px-2 text-sm"
                      variant={fulfillment === key ? "default" : "outline"}
                      onClick={() => setFulfillment(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {fulfillment === "dine_in" &&
                floorPlan.tables.length > 0 &&
                selectedTableId ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm"
                    onClick={changeTable}
                  >
                    <span className="text-muted-foreground">
                      Table{" "}
                      <span className="font-medium text-foreground">
                        {dineInTableLabel || "—"}
                      </span>
                    </span>
                    <span className="text-primary text-xs font-medium">Change</span>
                  </button>
                ) : null}
              </section>

              <details className="mt-5 rounded-xl border bg-card open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3.5 text-sm font-semibold active:bg-muted/40">
                  <span>
                    {fulfillment === "delivery"
                      ? "Customer details"
                      : "Customer & notes"}
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
                </summary>
                <div className="space-y-3 border-t px-3 py-3">
                  <div className="space-y-2">
                    <Label htmlFor="pos-m-name">Name</Label>
                    <Input
                      id="pos-m-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Optional — defaults to Guest"
                      className="h-11 text-base"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pos-m-phone">Phone</Label>
                    {fulfillment === "delivery" ? (
                      <PosDeliveryCustomerPhoneInput
                        id="pos-m-phone"
                        phone={phone}
                        enabled
                        onPhoneChange={setPhone}
                        onSelectCustomer={(c) => {
                          setPhone(c.phoneDigits);
                          setCustomerName(c.displayName);
                          if (c.address) setAddress(c.address);
                          if (c.landmark) setLandmark(c.landmark);
                        }}
                      />
                    ) : (
                      <Input
                        id="pos-m-phone"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Optional — 10-digit mobile"
                        className="h-11 text-base"
                        autoComplete="tel"
                      />
                    )}
                  </div>
                  {fulfillment === "delivery" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="pos-m-address">Delivery address</Label>
                        <Textarea
                          id="pos-m-address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          rows={2}
                          placeholder="Full address (required)"
                          className="resize-none text-base"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pos-m-landmark">Landmark</Label>
                        <Input
                          id="pos-m-landmark"
                          value={landmark}
                          onChange={(e) => setLandmark(e.target.value)}
                          placeholder="Near…"
                          className="h-11 text-base"
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="pos-m-notes">Notes</Label>
                    <Textarea
                      id="pos-m-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Table, packing, instructions…"
                      className="resize-none text-base"
                    />
                  </div>
                </div>
              </details>

              <details className="mt-3 rounded-xl border bg-card open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3.5 text-sm font-semibold active:bg-muted/40">
                  <span>Total</span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums">{formatMoney(total)}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
                  </span>
                </summary>
                <div className="space-y-2.5 border-t px-3 py-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">
                      {formatMoney(billTotals.itemsTotal)}
                    </span>
                  </div>
                  {fulfillment === "delivery" ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pos-m-delivery" className="shrink-0 text-xs">
                        Delivery ₹
                      </Label>
                      <Input
                        id="pos-m-delivery"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={deliveryChargeInput}
                        onChange={(e) => setDeliveryChargeInput(e.target.value)}
                        placeholder="0"
                        className="h-10 flex-1 text-base tabular-nums"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pos-m-discount" className="shrink-0 text-xs">
                      Discount ₹
                    </Label>
                    <Input
                      id="pos-m-discount"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="0"
                      className="h-10 flex-1 text-base tabular-nums"
                    />
                  </div>
                  {billTotals.deliveryCharge > 0 ? (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Delivery</span>
                      <span className="tabular-nums">
                        +{formatMoney(billTotals.deliveryCharge)}
                      </span>
                    </div>
                  ) : null}
                  {billTotals.discount > 0 ? (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="tabular-nums text-emerald-700">
                        −{formatMoney(billTotals.discount)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </details>
              {lastBill ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  Last placed:{" "}
                  <strong className="text-foreground">{lastBill.orderRef}</strong>
                </p>
              ) : null}

              <section className="mt-5 space-y-3 pb-4">
                <p className="font-semibold text-sm">Payment</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Paid or unpaid">
                  <Button
                    type="button"
                    size="lg"
                    className="h-11"
                    variant={paymentStatus === "paid" ? "default" : "outline"}
                    onClick={() => setPaymentStatus("paid")}
                  >
                    Paid
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="h-11"
                    variant={paymentStatus === "unpaid" ? "default" : "outline"}
                    onClick={() => setPaymentStatus("unpaid")}
                  >
                    Unpaid
                  </Button>
                </div>
                {paymentStatus === "paid" ? (
                  (posSettings?.paymentMethods ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Add payment methods in Restaurant settings.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-xs">
                        How did they pay?
                      </p>
                      <div
                        className="flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-label="Payment method"
                      >
                        {(posSettings?.paymentMethods ?? []).map((p) => (
                          <Button
                            key={p.id}
                            type="button"
                            size="lg"
                            className="h-11 rounded-full"
                            variant={
                              paymentMethodKey === p.id ? "default" : "outline"
                            }
                            onClick={() => setPaymentMethodKey(p.id)}
                          >
                            {p.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Bill will be saved as unpaid / payment pending.
                  </p>
                )}
              </section>
            </div>

            <div className="shrink-0 border-t bg-background p-3">
              <Button
                type="button"
                className="h-12 w-full text-base"
                disabled={placing || cart.length === 0}
                onClick={() => ensurePrinterOrSubmit("none")}
              >
                {placing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : isEditing ? (
                  `Update · ${formatMoney(total)}`
                ) : (
                  `Save · ${formatMoney(total)}`
                )}
              </Button>
            </div>
          </div>
        ) : null}

            </div>
          </div>
        ) : null}
      </main>

      {/* Bottom tabs */}
      <nav
        className="shrink-0 border-t bg-background pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        aria-label="POS navigation"
      >
        <div className="grid grid-cols-2">
          {(
            [
              { id: "home" as const, label: "Home", icon: HomeIcon },
              { id: "orders" as const, label: "Orders", icon: ClipboardListIcon },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = mainTab === id;
            return (
              <button
                key={id}
                type="button"
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setMainTab(id)}
              >
                <Icon className={cn("size-5", active && "stroke-[2.25]")} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Dialogs */}
      <Dialog
        open={openItemModalOpen}
        onOpenChange={(o) => {
          if (o) setOpenItemModalOpen(true);
          else closeOpenItemModal();
        }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Open item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-muted-foreground text-sm">
              Not on the menu — billed as a custom line.
            </p>
            <div className="space-y-2">
              <Label htmlFor="pos-m-open-name">Item name</Label>
              <Input
                id="pos-m-open-name"
                value={openItemName}
                onChange={(e) => setOpenItemName(e.target.value)}
                placeholder="e.g. Extra roti, Corkage"
                className="h-11 bg-background text-base"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-m-open-price">Price (₹)</Label>
              <Input
                id="pos-m-open-price"
                inputMode="decimal"
                value={openItemPrice}
                onChange={(e) => setOpenItemPrice(e.target.value)}
                placeholder="0"
                className="h-11 bg-background text-base"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-3 sm:flex-col">
            <Button
              type="button"
              className="!h-12 w-full text-base"
              onClick={() => {
                addOpenLine();
                setRegisterStep("cart");
              }}
            >
              Add to order
            </Button>
            <Button
              type="button"
              variant="outline"
              className="!h-12 w-full text-base"
              onClick={closeOpenItemModal}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Connect printer</DialogTitle>
            <DialogDescription>
              Select a printer for silent KOT/Bill printing in the desktop app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Status</p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  printerConnected ? "text-emerald-600" : "text-destructive",
                )}
              >
                {printerConnected ? "Connected" : "Not connected"}
              </p>
            </div>
            {getKhaanzDesktop()?.isDesktop ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Printer</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void refreshPrinterStatus()}
                  >
                    Refresh
                  </Button>
                </div>
                {printers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No printers detected. Connect a printer and click Refresh.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <SearchableSelect
                      options={[
                        { value: "", label: "System default" },
                        ...printers.map((p) => ({
                          value: p.name,
                          label: `${p.name}${p.isDefault ? " (default)" : ""}`,
                        })),
                      ]}
                      value={printerDeviceName}
                      onValueChange={setPrinterDeviceName}
                      placeholder="System default"
                      searchPlaceholder="Search printers…"
                    />
                    <Button
                      type="button"
                      className="h-11 w-full"
                      onClick={async () => {
                        const d = getKhaanzDesktop();
                        if (!d?.setSilentPrinter) {
                          toast.error("Printer selection is not available.");
                          return;
                        }
                        const out = await d.setSilentPrinter(printerDeviceName);
                        if (!out.ok) {
                          toast.error(out.error ?? "Could not set printer.");
                          return;
                        }
                        await refreshPrinterStatus();
                        toast.success("Printer saved.");
                        setPrinterDialogOpen(false);
                      }}
                    >
                      Save printer
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Printer connection is available in the desktop POS app only.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogItem !== null}
        onOpenChange={(o) => {
          if (!o) setDialogItem(null);
        }}
      >
        <DialogContent className="flex max-h-[min(92dvh,calc(100dvh-1rem))] w-[calc(100%-1.5rem)] max-w-lg flex-col overflow-hidden">
          {dialogItem ? (
            <>
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle>{dialogItem.name}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                <div className="space-y-4 py-1">
                  <div className="space-y-2">
                    <Label id="pos-m-variation-label">Variation</Label>
                    <div
                      className="flex flex-col gap-2"
                      role="radiogroup"
                      aria-labelledby="pos-m-variation-label"
                    >
                      {dialogItem.variations.map((v) => {
                        const selected = variationId === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={cn(
                              "flex min-h-12 items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background active:bg-muted/60",
                            )}
                            onClick={() => setVariationId(v.id)}
                          >
                            <span className="font-medium">{v.name}</span>
                            <span
                              className={cn(
                                "tabular-nums text-sm",
                                selected
                                  ? "text-primary-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatMoney(v.price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {dialogItem.addons.length > 0 ? (
                    <div className="space-y-1.5">
                      <Label id="pos-m-addons-label">Add-ons</Label>
                      <div
                        className="grid grid-cols-3 gap-1.5"
                        role="group"
                        aria-labelledby="pos-m-addons-label"
                      >
                        {dialogItem.addons.map((a) => {
                          const q = addonQty[a.id] ?? 0;
                          const selected = q > 0;
                          const bump = (d: number) => {
                            setAddonQty((prev) => {
                              const n = Math.max(
                                0,
                                Math.min(99, (prev[a.id] ?? 0) + d),
                              );
                              return { ...prev, [a.id]: n };
                            });
                          };
                          return (
                            <div
                              key={a.id}
                              className={cn(
                                "flex flex-col overflow-hidden rounded-lg border bg-background",
                                selected
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                            >
                              <button
                                type="button"
                                className="flex flex-col text-left outline-none"
                                onClick={() => {
                                  if (q === 0) bump(1);
                                }}
                                aria-label={`Add ${a.name}`}
                              >
                                <div className="relative aspect-[4/3] w-full bg-muted">
                                  {a.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={a.image}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex size-full items-center justify-center text-muted-foreground">
                                      <ImageIcon className="size-3.5 opacity-60" />
                                    </div>
                                  )}
                                </div>
                                <div className="px-1 py-1">
                                  <p className="line-clamp-2 text-[10px] font-medium leading-tight">
                                    {a.name}
                                  </p>
                                  <p className="text-muted-foreground text-[9px] tabular-nums">
                                    {formatMoney(a.price)}
                                  </p>
                                </div>
                              </button>
                              {q > 0 ? (
                                <div className="flex items-center justify-center gap-0.5 border-t p-0.5">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-7"
                                    onClick={() => bump(-1)}
                                    aria-label="Decrease add-on"
                                  >
                                    <MinusIcon className="size-3" />
                                  </Button>
                                  <span className="w-4 text-center text-[11px] tabular-nums">
                                    {q}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-7"
                                    onClick={() => bump(1)}
                                    aria-label="Increase add-on"
                                  >
                                    <PlusIcon className="size-3" />
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <DialogFooter className="shrink-0 flex-col gap-2 sm:flex-col">
                {hasDialogAddonQty ? (
                  <p className="text-muted-foreground w-full text-center text-sm">
                    Final price:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatMoney(dialogConfigureUnit)}
                    </span>
                  </p>
                ) : null}
                <div className="flex w-full flex-col gap-3">
                  <Button
                    type="button"
                    className="!h-12 w-full text-base"
                    onClick={() => {
                      confirmConfigure();
                      setRegisterStep("cart");
                    }}
                  >
                    Add to order
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="!h-12 w-full text-base"
                    onClick={() => setDialogItem(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {getKhaanzDesktop()?.isDesktop ? (
        <div className="pointer-events-none fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40">
          <button
            type="button"
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold shadow-md",
              printerConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-border bg-background text-foreground",
            )}
            onClick={() => setPrinterDialogOpen(true)}
          >
            <StoreIcon className="size-3.5" />
            {printerConnected ? "Printer OK" : "Printer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
