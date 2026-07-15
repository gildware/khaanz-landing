"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useMenuData } from "@/contexts/menu-data-context";
import {
  buildComboLineId,
  buildLineId,
  computeUnitPrice,
  migrateCartLine,
} from "@/lib/cart-line";
import {
  computePosBillTotals,
  parseRupeeInputToCents,
} from "@/lib/billing-utils";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import { formatComboComponentSummary, isComboAvailable } from "@/lib/menu-combos";
import {
  flushOfflinePosQueue,
  getKhaanzDesktop,
  shouldQueuePosOrderOffline,
} from "@/lib/khaanz-desktop-client";
import { billPrintLayoutFromSettings } from "@/lib/bill-print-layout";
import {
  cartLinesToReceiptRows,
  kotLinesFromCart,
  buildBillHtmlBody,
  buildKotHtmlBody,
  printPosBillThermal,
  printPosKotThermal,
  openCashDrawerIfAvailable,
  wrapThermalPrintDocument,
  type PosBillPrintOptions,
} from "@/lib/pos-print";
import { SITE } from "@/lib/site";
import {
  isIndianMobile10,
  isPosAnonymousPhoneDigits,
  normalizeIndianMobileDigits,
  POS_ANONYMOUS_PHONE_DIGITS,
} from "@/lib/phone-digits";
import { consumePosMobileEditDraft } from "@/lib/pos-mobile-edit-draft";
import type {
  CartAddonWithQty,
  CartComboLine,
  CartItemLine,
  CartLine,
  CartOpenLine,
  MenuCombo,
  MenuItem,
  MenuVariation,
} from "@/types/menu";
import { isCartComboLine, isCartItemLine } from "@/types/menu";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";
import type { FloorPlanPayload } from "@/types/floor-plan";

export type AdminPosRegister = ReturnType<typeof useAdminPosRegister>;

export function formatMoney(n: number): string {
  return `₹${n.toFixed(0)}`;
}

export function posFulfillmentLabel(m: FulfillmentMode): string {
  if (m === "dine_in") return "Dine-in";
  if (m === "pickup") return "Pickup";
  return "Delivery";
}

async function desktopSilentPrintOrToast(args: {
  html: string;
  title: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const d = getKhaanzDesktop();
  if (!d?.printSilentHtml) return false;
  // If desktop app is running but printer isn't configured/available, don't try to print.
  if (d.isDesktop) {
    try {
      const [list, current] = await Promise.all([
        d.listPrinters ? d.listPrinters() : Promise.resolve([]),
        d.getSilentPrinter ? d.getSilentPrinter() : Promise.resolve({ deviceName: "" }),
      ]);
      const chosen = (current?.deviceName || "").trim();
      const connected =
        (chosen && (list ?? []).some((p) => p.name === chosen)) ||
        (!chosen && (list ?? []).some((p) => p.isDefault));
      if (!connected) {
        toast.error("Printer not connected. Click “Connect printer”.");
        return false;
      }
    } catch {
      toast.error("Printer not connected. Click “Connect printer”.");
      return false;
    }
  }
  const timeoutMs = args.timeoutMs ?? 22_000;
  try {
    const r = await Promise.race([
      d.printSilentHtml(args.html, args.title),
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        window.setTimeout(
          () => resolve({ ok: false, error: "Print timed out" }),
          timeoutMs,
        );
      }),
    ]);
    if (!r.ok) toast.error(r.error ?? "Print failed");
    return r.ok;
  } catch (e) {
    toast.error(
      e instanceof Error && e.message ? e.message : "Print failed",
    );
    return false;
  }
}

/** Category rail keys (not real menu category names). */
export const CAT_OPEN = "__pos_open__";
export const CAT_COMBOS = "__pos_combos__";

function buildDeliveryFooterNote(address: string, landmark: string): string {
  const parts: string[] = [];
  const a = address.trim();
  const l = landmark.trim();
  if (a) parts.push(`Address: ${a}`);
  if (l) parts.push(`Landmark: ${l}`);
  return parts.join("\n");
}

async function placeOrderViaDesktopBridgeIfAvailable(args: {
  clientOrderId: string;
  orderPayload: Record<string, unknown>;
}): Promise<{ ok: true; orderRef: string } | { ok: false; error: string } | null> {
  const d = getKhaanzDesktop() as
    | (ReturnType<typeof getKhaanzDesktop> & {
        placePosOrder?: (
          clientOrderId: string,
          body: Record<string, unknown>,
        ) => Promise<{ ok: boolean; orderRef?: string; error?: string }>;
      })
    | undefined;
  if (!d?.isDesktop || !d.placePosOrder) return null;
  try {
    const r = await d.placePosOrder(args.clientOrderId, args.orderPayload);
    if (r?.ok && r.orderRef) return { ok: true, orderRef: r.orderRef };
    return { ok: false, error: r?.error ?? "Could not save offline." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save offline." };
  }
}


export function useAdminPosRegister() {
  const router = useRouter();
  const { data: menu, isLoading, error, mutate } = useMenuData();
  const categories = useMemo(() => menu?.categories ?? [], [menu]);
  const items = useMemo(() => menu?.items ?? [], [menu]);
  const combos = useMemo(() => menu?.combos ?? [], [menu]);

  const logout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    router.push("/admin/login");
    router.refresh();
  }, [router]);

  const [categoryKey, setCategoryKey] = useState<string>(CAT_OPEN);
  const [query, setQuery] = useState("");
  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");
  const [openItemModalOpen, setOpenItemModalOpen] = useState(false);

  const closeOpenItemModal = useCallback(() => {
    setOpenItemName("");
    setOpenItemPrice("");
    setOpenItemModalOpen(false);
  }, []);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("pickup");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [deliveryChargeInput, setDeliveryChargeInput] = useState("");
  const [placing, setPlacing] = useState(false);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [printerDeviceName, setPrinterDeviceName] = useState<string>("");
  const [printers, setPrinters] = useState<{ name: string; isDefault?: boolean }[]>(
    [],
  );
  const [printerConnected, setPrinterConnected] = useState(false);
  const [posSettings, setPosSettings] = useState<RestaurantSettingsPayload | null>(
    null,
  );
  const [floorPlan, setFloorPlan] = useState<FloorPlanPayload>({ tables: [] });
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [paymentMethodKey, setPaymentMethodKey] = useState("");
  /** Paid = collect via a payment method; Unpaid = bill shows Not Paid. */
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("paid");
  /** When set, Save updates this existing POS order instead of creating one. */
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderRef, setEditingOrderRef] = useState<string | null>(null);
  const [pendingTableLabel, setPendingTableLabel] = useState<string | null>(null);
  const [editDraftLoaded, setEditDraftLoaded] = useState(false);

  /** After checkout, cart is cleared — keep a snapshot so reprint works. */
  const [lastBill, setLastBill] = useState<{
    orderRef: string;
    lines: ReturnType<typeof cartLinesToReceiptRows>;
    total: number;
    fulfillmentLabel: string;
    dineInTable?: string;
    footerNote?: string;
    customerName: string;
    phoneDigits: string;
    notes: string;
    billHeader: string;
    billFooter: string;
    paymentLabel: string;
  } | null>(null);

  const categoryRail = useMemo(
    () => [
      { key: CAT_OPEN, label: "Open item" },
      { key: CAT_COMBOS, label: "Combos" },
      ...categories.map((c) => ({ key: c.name, label: c.name })),
    ],
    [categories],
  );

  const refreshPrinterStatus = useCallback(async () => {
    const d = getKhaanzDesktop();
    if (!d?.listPrinters || !d.getSilentPrinter) {
      setPrinters([]);
      setPrinterDeviceName("");
      setPrinterConnected(false);
      return;
    }
    try {
      const [list, current] = await Promise.all([
        d.listPrinters(),
        d.getSilentPrinter(),
      ]);
      setPrinters(Array.isArray(list) ? list : []);
      const device = typeof current?.deviceName === "string" ? current.deviceName : "";
      setPrinterDeviceName(device);
      const chosen = device.trim();
      const connected =
        (chosen && (list ?? []).some((p) => p.name === chosen)) ||
        (!chosen && (list ?? []).some((p) => p.isDefault));
      setPrinterConnected(Boolean(connected));
    } catch {
      setPrinterConnected(false);
    }
  }, []);

  useEffect(() => {
    setCategoryKey((prev) => {
      const valid = new Set<string>([
        CAT_OPEN,
        CAT_COMBOS,
        ...categories.map((c) => c.name),
      ]);
      return prev && valid.has(prev) ? prev : CAT_OPEN;
    });
  }, [categories, combos.length]);

  useEffect(() => {
    void refreshPrinterStatus();
    const id = window.setInterval(() => {
      void refreshPrinterStatus();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshPrinterStatus]);

  useEffect(() => {
    if (cart.length > 0) setLastBill(null);
  }, [cart.length]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as RestaurantSettingsPayload & {
          floorPlan?: FloorPlanPayload;
        };
        const { floorPlan: plan, ...settings } = data;
        setPosSettings(settings);
        setFloorPlan(plan ?? { tables: [] });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    const draft = consumePosMobileEditDraft();
    if (!draft) return;

    const cartLines: CartLine[] = [];
    for (const row of draft.lines
      .slice()
      .sort((a, b) => a.sortIndex - b.sortIndex)) {
      try {
        cartLines.push(migrateCartLine(row.payload as CartLine));
      } catch {
        /* skip bad line */
      }
    }
    if (cartLines.length === 0) {
      toast.error("Could not load order items to edit.");
      return;
    }

    setEditingOrderId(draft.orderId);
    setEditingOrderRef(draft.orderRef);
    setCart(cartLines);
    setFulfillment(draft.fulfillment);
    setCustomerName(draft.customerName?.trim() || "");
    const phoneDigits = normalizeIndianMobileDigits(draft.phone ?? "");
    setPhone(isPosAnonymousPhoneDigits(phoneDigits) ? "" : phoneDigits);
    setAddress(draft.address ?? "");
    setLandmark(draft.landmark ?? "");
    setNotes(draft.notes ?? "");
    setDiscountInput(
      draft.discountMinor > 0 ? String(draft.discountMinor / 100) : "",
    );
    setDeliveryChargeInput(
      draft.deliveryChargeMinor > 0
        ? String(draft.deliveryChargeMinor / 100)
        : "",
    );
    const pay = (draft.paymentMethod ?? "").trim();
    if (pay) {
      setPaymentStatus("paid");
      setPaymentMethodKey(pay);
    } else {
      setPaymentStatus("unpaid");
    }
    const tableLabel = (draft.dineInTable ?? "").trim();
    setPendingTableLabel(tableLabel || null);
    setSelectedTableId(null);
    setCustomerDetailsOpen(
      draft.fulfillment === "delivery" ||
        Boolean(draft.customerName?.trim()) ||
        Boolean(phoneDigits && !isPosAnonymousPhoneDigits(phoneDigits)),
    );
    setEditDraftLoaded(true);
    toast.message(
      draft.orderRef
        ? `Editing ${draft.orderRef}`
        : "Editing order — update cart and save",
    );
  }, []);

  useEffect(() => {
    if (!pendingTableLabel) return;
    if (floorPlan.tables.length === 0) return;
    const want = pendingTableLabel.trim().replace(/\s+/g, " ").toLowerCase();
    const match = floorPlan.tables.find(
      (t) => t.label.trim().replace(/\s+/g, " ").toLowerCase() === want,
    );
    if (match) {
      setSelectedTableId(match.id);
    }
    // Floor plan is loaded — stop waiting even if the label no longer matches.
    setPendingTableLabel(null);
  }, [floorPlan.tables, pendingTableLabel]);

  const cancelEditingOrder = useCallback(() => {
    setEditingOrderId(null);
    setEditingOrderRef(null);
    setPendingTableLabel(null);
    setEditDraftLoaded(false);
    setCart([]);
    setNotes("");
    setAddress("");
    setLandmark("");
    setCustomerName("");
    setPhone("");
    setDiscountInput("");
    setDeliveryChargeInput("");
    setSelectedTableId(null);
    setFulfillment("pickup");
    setPaymentStatus("paid");
  }, []);

  useEffect(() => {
    if (!posSettings?.paymentMethods.length) return;
    if (paymentStatus === "unpaid") return;
    setPaymentMethodKey((k) =>
      k && posSettings.paymentMethods.some((p) => p.id === k)
        ? k
        : posSettings.paymentMethods[0]!.id,
    );
  }, [posSettings, paymentStatus]);

  useEffect(() => {
    setCustomerDetailsOpen(fulfillment === "delivery");
  }, [fulfillment]);

  useEffect(() => {
    if (fulfillment !== "delivery") setDeliveryChargeInput("");
  }, [fulfillment]);

  useEffect(() => {
    if (fulfillment !== "dine_in") setSelectedTableId(null);
  }, [fulfillment]);

  const needsTablePick =
    fulfillment === "dine_in" && floorPlan.tables.length > 0;
  const canAddItems = !needsTablePick || selectedTableId != null;
  // Keep the picker closed while we restore a table label from an edited order.
  const tablePickModalOpen =
    needsTablePick && !selectedTableId && pendingTableLabel == null;

  useEffect(() => {
    if (!tablePickModalOpen) return;
    setOpenItemModalOpen(false);
    setDialogItem(null);
  }, [tablePickModalOpen]);

  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);

  const refreshOfflineCount = useCallback(async () => {
    const d = getKhaanzDesktop();
    if (!d) {
      setOfflineQueueCount(0);
      return;
    }
    const q = await d.getOfflineQueue();
    setOfflineQueueCount(q.length);
  }, []);

  const syncNow = useCallback(async () => {
    const d = getKhaanzDesktop() as
      | (ReturnType<typeof getKhaanzDesktop> & {
          syncNow?: () => Promise<{ ok: boolean; error?: string; serverTime?: string }>;
        })
      | undefined;
    if (!d?.isDesktop || !d.syncNow) {
      toast.error("Sync is available in the desktop app only.");
      return;
    }
    setSyncingNow(true);
    try {
      const out = await d.syncNow();
      if (!out.ok) {
        toast.error(out.error ?? "Sync failed.");
        return;
      }
      toast.success("Synced.");
      await refreshOfflineCount();
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncingNow(false);
    }
  }, [refreshOfflineCount, mutate]);

  useEffect(() => {
    void refreshOfflineCount();
  }, [refreshOfflineCount]);

  useEffect(() => {
    const d = getKhaanzDesktop();
    if (!d) return;
    const sync = async () => {
      const n = await flushOfflinePosQueue(d);
      if (n > 0) {
        toast.success(`Synced ${n} offline order(s).`);
        await refreshOfflineCount();
      }
    };
    const onOnline = () => {
      void sync();
    };
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => {
      void sync();
    }, 60_000);
    void sync();
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, [refreshOfflineCount]);

  const dineInTableLabel = useMemo(() => {
    if (!selectedTableId) return "";
    return (
      floorPlan.tables.find((t) => t.id === selectedTableId)?.label.trim() ?? ""
    );
  }, [floorPlan.tables, selectedTableId]);

  const [dialogItem, setDialogItem] = useState<MenuItem | null>(null);
  const [variationId, setVariationId] = useState<string>("");
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});

  const billTotals = useMemo(() => {
    const itemsSubtotalCents = Math.round(
      cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100,
    );
    const deliveryChargeCents =
      fulfillment === "delivery" ? parseRupeeInputToCents(deliveryChargeInput) : 0;
    const discountCents = parseRupeeInputToCents(discountInput);
    const bill = computePosBillTotals({
      subtotalCents: itemsSubtotalCents,
      taxCents: 0,
      deliveryChargeCents,
      discountCents,
    });
    return {
      itemsTotal: bill.itemsTotal / 100,
      deliveryCharge: bill.deliveryChargeCents / 100,
      discount: bill.discountCents / 100,
      total: bill.total / 100,
      deliveryChargeMinor: bill.deliveryChargeCents,
      discountMinor: bill.discountCents,
    };
  }, [cart, fulfillment, deliveryChargeInput, discountInput]);

  const total = billTotals.total;

  const dialogConfigureUnit = useMemo(() => {
    if (!dialogItem) return 0;
    const v = dialogItem.variations.find((x) => x.id === variationId);
    if (!v) return 0;
    const withQ: CartAddonWithQty[] = dialogItem.addons
      .map((a) => ({ ...a, quantity: addonQty[a.id] ?? 0 }))
      .filter((a) => a.quantity > 0);
    return computeUnitPrice(v, withQ);
  }, [dialogItem, variationId, addonQty]);

  const hasDialogAddonQty = useMemo(
    () =>
      dialogItem
        ? dialogItem.addons.some((a) => (addonQty[a.id] ?? 0) > 0)
        : false,
    [dialogItem, addonQty],
  );

  const addItemLine = useCallback(
    (item: MenuItem, variation: MenuVariation, addons: CartAddonWithQty[]) => {
      if (!canAddItems) {
        toast.error("Select a table for dine-in before adding items.");
        return;
      }
      if (!isMenuItemAvailable(item)) return;
      const unitPrice = computeUnitPrice(variation, addons);
      const lineId = buildLineId(item.id, variation, addons);
      setCart((prev) => {
        const existing = prev.find((l) => l.lineId === lineId);
        if (existing && isCartItemLine(existing)) {
          return prev.map((l) =>
            l.lineId === lineId && isCartItemLine(l)
              ? { ...l, quantity: l.quantity + 1 }
              : l,
          );
        }
        const line: CartItemLine = {
          kind: "item",
          lineId,
          itemId: item.id,
          name: item.name,
          image: item.image,
          isVeg: item.isVeg,
          variation,
          addons,
          quantity: 1,
          unitPrice,
        };
        return [...prev, line];
      });
      toast.success(`Added ${item.name}`);
    },
    [canAddItems],
  );

  const addOpenLine = useCallback(() => {
    if (!canAddItems) {
      toast.error("Select a table for dine-in before adding items.");
      return;
    }
    const name = openItemName.trim();
    const raw = openItemPrice.trim().replace(/,/g, "");
    const price = Number.parseFloat(raw);
    if (!name) {
      toast.error("Enter an item name.");
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      toast.error("Enter a valid price (0 – 10,00,000).");
      return;
    }
    const unit = Math.round(price * 100) / 100;
    const line: CartOpenLine = {
      kind: "open",
      lineId: `open::${crypto.randomUUID()}`,
      name,
      quantity: 1,
      unitPrice: unit,
    };
    setCart((prev) => [...prev, line]);
    toast.success(`Added ${name}`);
    closeOpenItemModal();
  }, [canAddItems, openItemName, openItemPrice, closeOpenItemModal]);

  const addComboLine = useCallback((combo: MenuCombo) => {
    if (!canAddItems) {
      toast.error("Select a table for dine-in before adding items.");
      return;
    }
    if (!isComboAvailable(combo, items)) return;
    const lineId = buildComboLineId(combo.id);
    const componentSummary = formatComboComponentSummary(combo, items);
    setCart((prev) => {
      const existing = prev.find((l) => l.lineId === lineId);
      if (existing && isCartComboLine(existing)) {
        return prev.map((l) =>
          l.lineId === lineId && isCartComboLine(l)
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      const line: CartComboLine = {
        kind: "combo",
        lineId,
        comboId: combo.id,
        name: combo.name,
        image: combo.image,
        isVeg: combo.isVeg,
        quantity: 1,
        unitPrice: combo.price,
        componentSummary,
      };
      return [...prev, line];
    });
    toast.success(`Added ${combo.name}`);
  }, [canAddItems, items]);

  const bumpQty = useCallback((lineId: string, delta: number) => {
    setCart((prev) => {
      const next = prev
        .map((l) => {
          if (l.lineId !== lineId) return l;
          const q = l.quantity + delta;
          return { ...l, quantity: Math.max(0, q) };
        })
        .filter((l) => l.quantity > 0);
      return next;
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const openConfigure = useCallback((item: MenuItem) => {
    if (!canAddItems) {
      toast.error("Select a table for dine-in before adding items.");
      return;
    }
    if (!isMenuItemAvailable(item)) {
      toast.error("This item is unavailable.");
      return;
    }
    const v0 = item.variations[0];
    if (!v0) {
      toast.error("This item has no variations.");
      return;
    }
    if (item.variations.length === 1 && item.addons.length === 0) {
      addItemLine(item, v0, []);
      return;
    }
    setDialogItem(item);
    setVariationId(v0.id);
    setAddonQty(Object.fromEntries(item.addons.map((a) => [a.id, 0])));
  }, [addItemLine, canAddItems]);

  const confirmConfigure = useCallback(() => {
    if (!dialogItem) return;
    const variation = dialogItem.variations.find((v) => v.id === variationId);
    if (!variation) {
      toast.error("Choose a variation.");
      return;
    }
    const addons: CartAddonWithQty[] = dialogItem.addons
      .map((a) => ({ ...a, quantity: addonQty[a.id] ?? 0 }))
      .filter((a) => a.quantity > 0);
    addItemLine(dialogItem, variation, addons);
    setDialogItem(null);
  }, [dialogItem, variationId, addonQty, addItemLine]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (!isMenuItemAvailable(it)) return false;
      if (q) return it.name.toLowerCase().includes(q);
      if (
        categoryKey &&
        categoryKey !== CAT_OPEN &&
        categoryKey !== CAT_COMBOS &&
        it.category !== categoryKey
      ) {
        return false;
      }
      return true;
    });
  }, [items, query, categoryKey]);

  const filteredCombos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combos.filter((c) => {
      if (c.available === false) return false;
      if (!isComboAvailable(c, items)) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [combos, items, query]);

  const paymentDisplayName = useCallback(
    (key: string) =>
      posSettings?.paymentMethods.find((p) => p.id === key)?.name ?? key,
    [posSettings],
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

  const buildBillOptions = useCallback(
    (args: {
      lines: ReturnType<typeof cartLinesToReceiptRows>;
      printTotal: number;
      orderRef: string | null;
      proforma: boolean;
      fulfillmentPrint: string;
      dineInTable?: string;
      namePrint: string;
      phonePrint: string;
      notesPrint: string;
      footerPrint: string;
      paymentLabel: string;
      header: string;
      footer: string;
      itemsSubtotal?: number;
      deliveryCharge?: number;
      discount?: number;
    }): PosBillPrintOptions => ({
      restaurantName: restaurantDisplayName,
      billHeader: args.header,
      billFooter: args.footer,
      orderRef: args.orderRef,
      proforma: args.proforma,
      fulfillmentLabel: args.fulfillmentPrint,
      dineInTable: args.dineInTable?.trim() || undefined,
      customerName: args.namePrint,
      phoneDigits: args.phonePrint,
      notes: args.notesPrint,
      footerNote: args.footerPrint || undefined,
      paymentLabel: args.paymentLabel,
      lines: args.lines,
      total: args.printTotal,
      itemsSubtotal: args.itemsSubtotal,
      deliveryCharge: args.deliveryCharge,
      discount: args.discount,
      layout: billPrintLayout,
    }),
    [restaurantDisplayName, billPrintLayout],
  );

  const submitPosOrder = useCallback(
    async (printMode: "none" | "kot" | "bill" | "both") => {
      if (cart.length === 0) {
        toast.error("Add at least one item.");
        return;
      }
      if (
        fulfillment === "dine_in" &&
        floorPlan.tables.length > 0 &&
        !selectedTableId
      ) {
        toast.error("Select a table for dine-in.");
        return;
      }
      if (fulfillment === "delivery" && !address.trim()) {
        toast.error("Address is required for delivery.");
        return;
      }
      if (
        paymentStatus === "paid" &&
        (posSettings?.paymentMethods.length ?? 0) > 0 &&
        !paymentMethodKey
      ) {
        toast.error("Select a payment method.");
        return;
      }
      const phoneTrim = phone.trim();
      if (
        phoneTrim &&
        !isIndianMobile10(normalizeIndianMobileDigits(phoneTrim))
      ) {
        toast.error("Enter a valid 10-digit phone or leave it blank.");
        return;
      }

      const snapshotLines = cartLinesToReceiptRows(cart);
      const snapshotKot = kotLinesFromCart(cart);
      const snapTotal = total;
      const phonePayload = phoneTrim
        ? normalizeIndianMobileDigits(phoneTrim)
        : "";
      const footerNote =
        fulfillment === "delivery"
          ? buildDeliveryFooterNote(address, landmark)
          : "";
      const header = posSettings?.billHeader ?? "";
      const footer = posSettings?.billFooter ?? "";
      const payKey = paymentStatus === "unpaid" ? "" : paymentMethodKey;
      const nameSnap = customerName.trim() || "Guest";
      const notesSnap = notes.trim();
      const fulfillLabel = posFulfillmentLabel(fulfillment);
      const tablePrintLabel =
        fulfillment === "dine_in" && dineInTableLabel ? dineInTableLabel : "";

      const clientOrderId = crypto.randomUUID();
      const orderPayload = {
        clientOrderId,
        customerName: nameSnap,
        phone: phonePayload,
        fulfillment,
        scheduleMode: "asap" as const,
        scheduledAt: null,
        address: fulfillment === "delivery" ? address.trim() : "",
        landmark: fulfillment === "delivery" ? landmark.trim() : "",
        notes: notesSnap,
        lines: cart,
        latitude: null,
        longitude: null,
        paymentMethodKey: payKey,
        tableId: selectedTableId ?? "",
        deliveryChargeMinor: billTotals.deliveryChargeMinor,
        discountMinor: billTotals.discountMinor,
      };

      setPlacing(true);
      try {
        const desktop = getKhaanzDesktop();
        let orderRef = "";

        if (editingOrderId) {
          const res = await fetch(`/api/admin/pos/orders/${editingOrderId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(orderPayload),
          });
          const j = (await res.json()) as {
            orderRef?: string | null;
            error?: string;
          };
          if (!res.ok) {
            toast.error(j.error ?? "Could not update order.");
            return;
          }
          orderRef = (j.orderRef ?? editingOrderRef ?? "").trim();
          if (!orderRef) {
            toast.error("Order updated without reference.");
            return;
          }
          toast.success(`Order ${orderRef} updated`);
          setEditingOrderId(null);
          setEditingOrderRef(null);
          setPendingTableLabel(null);
          setEditDraftLoaded(false);
        } else {
          const desktopPlaced = await placeOrderViaDesktopBridgeIfAvailable({
            clientOrderId,
            orderPayload: orderPayload as unknown as Record<string, unknown>,
          });
          if (desktopPlaced) {
            if (!desktopPlaced.ok) {
              toast.error(desktopPlaced.error);
              return;
            }
            orderRef = desktopPlaced.orderRef;
          } else {
            const res = await fetch("/api/admin/orders/pos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(orderPayload),
            });
            const j = (await res.json()) as { orderRef?: string; error?: string };
            if (!res.ok) {
              toast.error(j.error ?? "Could not place order.");
              return;
            }
            orderRef = j.orderRef ?? "";
          }
          if (!orderRef) {
            toast.error("Order saved without reference.");
            return;
          }
          toast.success(`Order ${orderRef} saved`);
        }

        setLastBill({
          orderRef,
          lines: snapshotLines,
          total: snapTotal,
          fulfillmentLabel: fulfillLabel,
          dineInTable: tablePrintLabel || undefined,
          footerNote: footerNote || undefined,
          customerName: nameSnap,
          phoneDigits: phonePayload || POS_ANONYMOUS_PHONE_DIGITS,
          notes: notesSnap,
          billHeader: header,
          billFooter: footer,
          paymentLabel: paymentDisplayName(payKey),
        });
        setCart([]);
        setNotes("");
        setAddress("");
        setLandmark("");
        setDiscountInput("");
        setDeliveryChargeInput("");

        if (printMode === "kot" || printMode === "both") {
          const kotOptions = {
            restaurantName: restaurantDisplayName,
            billHeader: header,
            orderRef,
            fulfillmentLabel: fulfillLabel,
            dineInTable: tablePrintLabel || undefined,
            notes: notesSnap,
            lines: snapshotKot,
            layout: billPrintLayout,
          };
          const desktopOk = await desktopSilentPrintOrToast({
            html: wrapThermalPrintDocument(
              buildKotHtmlBody(kotOptions),
              "KOT",
              billPrintLayout,
            ),
            title: "KOT",
          });
          if (!desktopOk && !desktop?.isDesktop) {
            await printPosKotThermal(kotOptions);
          }
        }
        if (printMode === "bill" || printMode === "both") {
          const billOptions = buildBillOptions({
            lines: snapshotLines,
            printTotal: snapTotal,
            orderRef,
            proforma: false,
            fulfillmentPrint: fulfillLabel,
            dineInTable: tablePrintLabel || undefined,
            namePrint: nameSnap,
            phonePrint: phonePayload || POS_ANONYMOUS_PHONE_DIGITS,
            notesPrint: notesSnap,
            footerPrint: footerNote,
            paymentLabel: paymentDisplayName(payKey),
            header,
            footer,
            itemsSubtotal: billTotals.itemsTotal,
            deliveryCharge: billTotals.deliveryCharge > 0 ? billTotals.deliveryCharge : undefined,
            discount: billTotals.discount > 0 ? billTotals.discount : undefined,
          });
          const desktopOk = await desktopSilentPrintOrToast({
            html: wrapThermalPrintDocument(
              buildBillHtmlBody(billOptions),
              "Bill",
              billPrintLayout,
            ),
            title: "Bill",
          });
          if (!desktopOk && !desktop?.isDesktop) {
            await printPosBillThermal(billOptions);
          }
          await openCashDrawerIfAvailable();
        }
      } catch (err) {
        if (editingOrderId) {
          toast.error("Network error. Could not update order.");
          return;
        }
        const desktop = getKhaanzDesktop();
        if (
          desktop?.enqueueOfflineOrder &&
          shouldQueuePosOrderOffline(err)
        ) {
          const out = await desktop.enqueueOfflineOrder({
            clientOrderId,
            body: orderPayload as Record<string, unknown>,
          });
          if (!out.ok) {
            toast.error(out.error ?? "Could not save offline.");
            return;
          }
          const offlineRef = out.orderRef?.trim();
          if (!offlineRef) {
            toast.error("Order saved offline without a bill number.");
            return;
          }
          setLastBill({
            orderRef: offlineRef,
            lines: snapshotLines,
            total: snapTotal,
            fulfillmentLabel: fulfillLabel,
            dineInTable: tablePrintLabel || undefined,
            footerNote: footerNote || undefined,
            customerName: nameSnap,
            phoneDigits: phonePayload || POS_ANONYMOUS_PHONE_DIGITS,
            notes: notesSnap,
            billHeader: header,
            billFooter: footer,
            paymentLabel: paymentDisplayName(payKey),
          });
          toast.success(
            `Saved offline as ${offlineRef}. Will sync when you are online.`,
          );
          setCart([]);
          setNotes("");
          setAddress("");
          setLandmark("");
          void refreshOfflineCount();

          if (printMode === "kot" || printMode === "both") {
            const kotOptions = {
              restaurantName: restaurantDisplayName,
              billHeader: header,
              orderRef: offlineRef,
              fulfillmentLabel: fulfillLabel,
              dineInTable: tablePrintLabel || undefined,
              notes: notesSnap,
              lines: snapshotKot,
              layout: billPrintLayout,
            };
            const desktopOk = await desktopSilentPrintOrToast({
              html: wrapThermalPrintDocument(
                buildKotHtmlBody(kotOptions),
                "KOT",
                billPrintLayout,
              ),
              title: "KOT",
            });
            if (!desktopOk && !getKhaanzDesktop()?.isDesktop) {
              await printPosKotThermal(kotOptions);
            }
          }
          if (printMode === "bill" || printMode === "both") {
            const billOptions = buildBillOptions({
              lines: snapshotLines,
              printTotal: snapTotal,
              orderRef: offlineRef,
              proforma: true,
              fulfillmentPrint: fulfillLabel,
              dineInTable: tablePrintLabel || undefined,
              namePrint: nameSnap,
              phonePrint: phonePayload || POS_ANONYMOUS_PHONE_DIGITS,
              notesPrint: notesSnap,
              footerPrint: footerNote,
              paymentLabel: paymentDisplayName(payKey),
              header,
              footer,
              itemsSubtotal: billTotals.itemsTotal,
              deliveryCharge: billTotals.deliveryCharge > 0 ? billTotals.deliveryCharge : undefined,
              discount: billTotals.discount > 0 ? billTotals.discount : undefined,
            });
            const desktopOk = await desktopSilentPrintOrToast({
              html: wrapThermalPrintDocument(
                buildBillHtmlBody(billOptions),
                "Bill",
                billPrintLayout,
              ),
              title: "Bill",
            });
            if (!desktopOk && !getKhaanzDesktop()?.isDesktop) {
              await printPosBillThermal(billOptions);
            }
            await openCashDrawerIfAvailable();
          }
        } else {
          toast.error("Network error.");
        }
      } finally {
        setPlacing(false);
      }
    },
    [
      cart,
      billTotals,
      fulfillment,
      address,
      landmark,
      customerName,
      phone,
      notes,
      posSettings,
      paymentMethodKey,
      paymentStatus,
      editingOrderId,
      editingOrderRef,
      buildBillOptions,
      paymentDisplayName,
      floorPlan.tables.length,
      selectedTableId,
      dineInTableLabel,
      refreshOfflineCount,
      restaurantDisplayName,
      billPrintLayout,
    ],
  );


  return {
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
    customerDetailsOpen,
    setCustomerDetailsOpen,
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
    editingOrderId,
    editingOrderRef,
    editDraftLoaded,
    cancelEditingOrder,
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
    addItemLine,
    addOpenLine,
    addComboLine,
    bumpQty,
    removeLine,
    openConfigure,
    confirmConfigure,
    filteredItems,
    filteredCombos,
    paymentDisplayName,
    restaurantDisplayName,
    billPrintLayout,
    submitPosOrder,
    needsTablePick,
    canAddItems,
    tablePickModalOpen,
    mutate,
  };
}
