"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ClipboardListIcon,
  HistoryIcon,
  ImageIcon,
  Loader2Icon,
  LogOutIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagIcon,
  StoreIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PosDeliveryCustomerPhoneInput } from "@/components/admin/pos-delivery-customer-phone-input";
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
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";

type MobileTab = "menu" | "cart" | "checkout";

export default function AdminPosMobilePage() {
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
    tablePickModalOpen,
    editingOrderId,
    editingOrderRef,
    editDraftLoaded,
    cancelEditingOrder,
  } = pos;

  const [tab, setTab] = useState<MobileTab>("menu");
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const isEditing = Boolean(editingOrderId);

  useEffect(() => {
    if (editDraftLoaded && cart.length > 0) setTab("cart");
  }, [editDraftLoaded, cart.length]);

  useEffect(() => {
    if (cart.length === 0 && !isEditing && (tab === "cart" || tab === "checkout")) {
      setTab("menu");
    }
  }, [cart.length, tab, isEditing]);

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
            <Link
              href="/admin/pos/mobile/history"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "!h-10 gap-1.5 px-2.5 text-xs font-medium",
              )}
            >
              <HistoryIcon className="size-4" />
              History
            </Link>
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
              setTab("menu");
            }}
          >
            Discard
          </Button>
        </div>
      ) : null}

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "menu" ? (
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
                  onClick={() => setSelectedTableId(null)}
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
                <div className="grid grid-cols-2 gap-2 p-3">
                  {filteredCombos.map((combo) => (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => addComboLine(combo)}
                      className="flex flex-col rounded-xl border bg-background p-2.5 text-left active:bg-muted/60"
                    >
                      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg bg-muted">
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
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {combo.name}
                      </p>
                      <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                        {formatMoney(combo.price)}
                      </p>
                    </button>
                  ))}
                  {filteredCombos.length === 0 ? (
                    <p className="text-muted-foreground col-span-2 py-8 text-center text-sm">
                      No combos match your search.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-3">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openConfigure(item)}
                      className={cn(
                        "flex flex-col rounded-xl border bg-background p-2.5 text-left active:bg-muted/60",
                        item.available === false && "opacity-50",
                      )}
                    >
                      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg bg-muted">
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
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
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
                    <p className="text-muted-foreground col-span-2 py-8 text-center text-sm">
                      No items in this category.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "cart" ? (
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
                <ul className="space-y-2.5">
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
                        className="rounded-xl border bg-card p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm leading-snug">
                              {label}
                            </p>
                            <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                              {formatMoney(line.unitPrice)} each
                            </p>
                            {isCartItemLine(line) &&
                            line.addons.some((a) => a.quantity > 0) ? (
                              <ul className="mt-1 space-y-0.5">
                                {line.addons
                                  .filter((a) => a.quantity > 0)
                                  .map((a) => (
                                    <li
                                      key={a.id}
                                      className="text-muted-foreground text-[11px]"
                                    >
                                      + {a.name} ×{a.quantity}
                                    </li>
                                  ))}
                              </ul>
                            ) : null}
                            {isCartComboLine(line) && line.componentSummary ? (
                              <p className="text-muted-foreground mt-1 text-[11px]">
                                {line.componentSummary}
                              </p>
                            ) : null}
                          </div>
                          <p className="shrink-0 font-semibold text-sm tabular-nums">
                            {formatMoney(sub)}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-11"
                              onClick={() => bumpQty(line.lineId, -1)}
                              aria-label="Decrease quantity"
                            >
                              <MinusIcon className="size-4" />
                            </Button>
                            <span className="w-8 text-center text-base tabular-nums font-medium">
                              {line.quantity}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-11"
                              onClick={() => bumpQty(line.lineId, 1)}
                              aria-label="Increase quantity"
                            >
                              <PlusIcon className="size-4" />
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11 text-destructive"
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
                <Button
                  type="button"
                  className="h-12 w-full text-base"
                  onClick={() => setTab("checkout")}
                >
                  Checkout · {formatMoney(total)}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "checkout" ? (
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
                    onClick={() => setSelectedTableId(null)}
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

            <div className="shrink-0 space-y-2 border-t bg-background p-3">
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
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-1 text-xs"
                  disabled={placing || cart.length === 0}
                  onClick={() => ensurePrinterOrSubmit("kot")}
                >
                  {getKhaanzDesktop()?.isDesktop && !printerConnected
                    ? "Printer"
                    : "KOT"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-1 text-xs"
                  disabled={placing || cart.length === 0}
                  onClick={() => ensurePrinterOrSubmit("bill")}
                >
                  {getKhaanzDesktop()?.isDesktop && !printerConnected
                    ? "Printer"
                    : "Bill"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-1 text-xs"
                  disabled={placing || cart.length === 0}
                  onClick={() => ensurePrinterOrSubmit("both")}
                >
                  {getKhaanzDesktop()?.isDesktop && !printerConnected
                    ? "Printer"
                    : "Print"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Bottom tabs */}
      <nav
        className="shrink-0 border-t bg-background pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        aria-label="POS navigation"
      >
        <div className="grid grid-cols-3">
          {(
            [
              { id: "menu" as const, label: "Menu", icon: UtensilsCrossedIcon },
              { id: "cart" as const, label: "Cart", icon: ShoppingBagIcon },
              { id: "checkout" as const, label: "Pay", icon: ClipboardListIcon },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const disabled = id !== "menu" && cart.length === 0 && tab !== id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors disabled:opacity-40",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setTab(id)}
              >
                <span className="relative">
                  <Icon className={cn("size-5", active && "stroke-[2.25]")} />
                  {id === "cart" && cartCount > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-semibold text-background">
                      {cartCount > 99 ? "99+" : cartCount}
                    </span>
                  ) : null}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Dialogs (shared behaviour with desktop POS) */}
      <Dialog
        open={tablePickModalOpen}
        onOpenChange={() => {
          /* Block dismiss until a table is chosen */
        }}
      >
        <DialogContent
          className="max-h-[min(92dvh,100%)] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Choose a table</DialogTitle>
            <DialogDescription>
              Tap the table for this order. The menu stays locked until you pick
              one.
            </DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md border bg-muted/50">
            {floorPlan.tables.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "absolute flex items-center justify-center rounded border px-0.5 text-[10px] font-semibold leading-tight shadow-sm",
                  selectedTableId === t.id
                    ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/25"
                    : "border-border bg-card text-foreground active:bg-muted/80",
                )}
                style={{
                  left: `${t.xPct}%`,
                  top: `${t.yPct}%`,
                  width: `${t.widthPct}%`,
                  height: `${t.heightPct}%`,
                }}
                onClick={() => setSelectedTableId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <DialogFooter className="flex-col items-stretch gap-3 border-t pt-2 sm:flex-col">
            <p className="text-muted-foreground text-xs leading-relaxed">
              Not dining in? Switch order type — the menu unlocks without a
              table.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFulfillment("pickup")}
              >
                Pickup
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFulfillment("delivery")}
              >
                Delivery
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                setTab("cart");
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
                    <div className="space-y-2">
                      <Label id="pos-m-addons-label">Add-ons</Label>
                      <div
                        className="grid grid-cols-3 gap-2"
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
                                "flex flex-col overflow-hidden rounded-xl border bg-background",
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
                                <div className="relative aspect-square w-full bg-muted">
                                  {a.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={a.image}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex size-full items-center justify-center text-muted-foreground">
                                      <ImageIcon className="size-4 opacity-60" />
                                    </div>
                                  )}
                                </div>
                                <div className="px-1.5 py-1.5">
                                  <p className="line-clamp-2 text-[11px] font-medium leading-tight">
                                    {a.name}
                                  </p>
                                  <p className="text-muted-foreground text-[10px] tabular-nums">
                                    {formatMoney(a.price)}
                                  </p>
                                </div>
                              </button>
                              {q > 0 ? (
                                <div className="flex items-center justify-center gap-1 border-t p-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-8"
                                    onClick={() => bump(-1)}
                                    aria-label="Decrease add-on"
                                  >
                                    <MinusIcon className="size-3.5" />
                                  </Button>
                                  <span className="w-5 text-center text-xs tabular-nums">
                                    {q}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-8"
                                    onClick={() => bump(1)}
                                    aria-label="Increase add-on"
                                  >
                                    <PlusIcon className="size-3.5" />
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
                      setTab("cart");
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
