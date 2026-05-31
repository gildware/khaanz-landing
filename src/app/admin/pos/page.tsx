"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ImageIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useMenuData } from "@/contexts/menu-data-context";
import {
  buildComboLineId,
  buildLineId,
  computeUnitPrice,
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
import {
  cartLinesToReceiptRows,
  kotLinesFromCart,
  buildBillHtmlBody,
  buildKotHtmlBody,
  printPosBillThermal,
  printPosKotThermal,
  type PosBillPrintOptions,
} from "@/lib/pos-print";
import { SITE } from "@/lib/site";
import {
  isIndianMobile10,
  normalizeIndianMobileDigits,
  POS_ANONYMOUS_PHONE_DIGITS,
} from "@/lib/phone-digits";
import { cn } from "@/lib/utils";
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
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";
import type { FloorPlanPayload } from "@/types/floor-plan";

function formatMoney(n: number): string {
  return `₹${n.toFixed(0)}`;
}

function posFulfillmentLabel(m: FulfillmentMode): string {
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
const CAT_OPEN = "__pos_open__";
const CAT_COMBOS = "__pos_combos__";

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

export default function AdminPosPage() {
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
    if (!posSettings?.paymentMethods.length) return;
    setPaymentMethodKey((k) =>
      k && posSettings.paymentMethods.some((p) => p.id === k)
        ? k
        : posSettings.paymentMethods[0]!.id,
    );
  }, [posSettings]);

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
  const tablePickModalOpen = needsTablePick && !selectedTableId;

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
      restaurantName: SITE.name,
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
    }),
    [],
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
      const payKey = paymentMethodKey;
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
        const desktopPlaced = await placeOrderViaDesktopBridgeIfAvailable({
          clientOrderId,
          orderPayload: orderPayload as unknown as Record<string, unknown>,
        });
        let orderRef = "";
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
        toast.success(`Order ${orderRef} saved`);
        setCart([]);
        setNotes("");
        setAddress("");
        setLandmark("");
        setDiscountInput("");
        setDeliveryChargeInput("");

        if (printMode === "kot" || printMode === "both") {
          const desktopOk = await desktopSilentPrintOrToast({
            html: buildKotHtmlBody({
              restaurantName: SITE.name,
              billHeader: header,
              orderRef,
              fulfillmentLabel: fulfillLabel,
              dineInTable: tablePrintLabel || undefined,
              notes: notesSnap,
              lines: snapshotKot,
            }),
            title: "KOT",
          });
          if (!desktopOk && !desktop?.isDesktop) {
            await printPosKotThermal({
              restaurantName: SITE.name,
              billHeader: header,
              orderRef,
              fulfillmentLabel: fulfillLabel,
              dineInTable: tablePrintLabel || undefined,
              notes: notesSnap,
              lines: snapshotKot,
            });
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
            html: buildBillHtmlBody(billOptions),
            title: "Bill",
          });
          if (!desktopOk && !desktop?.isDesktop) {
            await printPosBillThermal(billOptions);
          }
        }
      } catch (err) {
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
          const offlineRef = `OFF-${clientOrderId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
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
            const desktopOk = await desktopSilentPrintOrToast({
              html: buildKotHtmlBody({
                restaurantName: SITE.name,
                billHeader: header,
                orderRef: offlineRef,
                fulfillmentLabel: fulfillLabel,
                dineInTable: tablePrintLabel || undefined,
                notes: notesSnap,
                lines: snapshotKot,
              }),
              title: "KOT",
            });
            if (!desktopOk && !getKhaanzDesktop()?.isDesktop) {
              await printPosKotThermal({
                restaurantName: SITE.name,
                billHeader: header,
                orderRef: offlineRef,
                fulfillmentLabel: fulfillLabel,
                dineInTable: tablePrintLabel || undefined,
                notes: notesSnap,
                lines: snapshotKot,
              });
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
              html: buildBillHtmlBody(billOptions),
              title: "Bill",
            });
            if (!desktopOk && !getKhaanzDesktop()?.isDesktop) {
              await printPosBillThermal(billOptions);
            }
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
      buildBillOptions,
      paymentDisplayName,
      floorPlan.tables.length,
      selectedTableId,
      dineInTableLabel,
      refreshOfflineCount,
    ],
  );

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0">
            <Image
              src={SITE.logoPath}
              alt=""
              fill
              className="object-contain"
              sizes="40px"
              priority
            />
          </div>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 font-semibold text-2xl tracking-tight">
              {SITE.name} POS
              {offlineQueueCount > 0 ? (
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 text-xs dark:text-amber-200">
                  Offline queue: {offlineQueueCount}
                </span>
              ) : null}
            </h1>
            <p className="text-muted-foreground text-sm">
              Dine-in, pickup, or delivery. In the{" "}
              <strong className="font-medium text-foreground">Khaanz Desktop POS</strong>{" "}
              app, KOT/Bill can print silently to your default receipt printer; in a
              browser, print uses the system dialog.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {getKhaanzDesktop()?.isDesktop ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncingNow}
              onClick={() => void syncNow()}
            >
              {syncingNow ? "Syncing…" : "Sync now"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void logout()}
          >
            Sign out
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border bg-card shadow-sm max-lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[1fr_min(520px,44%)]">
        <div className="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0">
          <div className="shrink-0 space-y-3 border-b bg-muted/30 p-3">
            <Input
              placeholder="Search menu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={categoryKey === CAT_OPEN}
              className="bg-background disabled:opacity-60"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative flex min-h-0 flex-1">
              <aside
                className="flex w-[min(11rem,30vw)] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/50 bg-muted/25 py-2 pl-2 pr-1"
                aria-label="Categories"
              >
                {categoryRail.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-2 text-left text-sm leading-snug transition-colors",
                      categoryKey === key
                        ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border/80"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    )}
                    onClick={() => setCategoryKey(key)}
                  >
                    {label}
                  </button>
                ))}
              </aside>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {categoryKey === CAT_OPEN ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center sm:p-8">
                    <p className="text-muted-foreground max-w-sm text-sm">
                      Add a one-off line not listed on the menu (extras, corkage,
                      service charges, etc.). Tap below to enter name and price.
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      className="gap-2 rounded-full px-8"
                      disabled={!canAddItems}
                      onClick={() => setOpenItemModalOpen(true)}
                    >
                      <PlusIcon className="size-4" />
                      Add open item
                    </Button>
                  </div>
                ) : categoryKey === CAT_COMBOS ? (
                  <div className="p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {filteredCombos.map((combo) => (
                        <button
                          key={combo.id}
                          type="button"
                          onClick={() => addComboLine(combo)}
                          className="flex flex-col rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:bg-muted/50"
                        >
                          <div className="flex gap-2">
                            <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                              {combo.image ? (
                                // Native img: menu URLs come from DB/CDN; Next/Image throws if host is not allowlisted.
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
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{combo.name}</p>
                              <p className="text-muted-foreground text-xs">
                                {formatMoney(combo.price)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {filteredCombos.length === 0 ? (
                      <p className="text-muted-foreground mt-4 text-sm">
                        No combos match your search.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openConfigure(item)}
                          className={cn(
                            "flex flex-col rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:bg-muted/50",
                            item.available === false && "opacity-50",
                          )}
                        >
                          <div className="flex gap-2">
                            <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
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
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 font-medium leading-tight">
                                {item.name}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                from{" "}
                                {formatMoney(
                                  item.variations.length
                                    ? Math.min(
                                        ...item.variations.map((v) => v.price),
                                      )
                                    : 0,
                                )}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {filteredItems.length === 0 ? (
                      <p className="text-muted-foreground mt-4 text-sm">
                        No items in this category.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t bg-muted/20 lg:min-h-0 lg:border-t-0">
          <div className="shrink-0 border-b p-3">
            <p className="mb-2 font-medium text-sm">Order type</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={fulfillment === "dine_in" ? "default" : "outline"}
                onClick={() => setFulfillment("dine_in")}
              >
                Dine-in
              </Button>
              <Button
                type="button"
                size="sm"
                variant={fulfillment === "pickup" ? "default" : "outline"}
                onClick={() => setFulfillment("pickup")}
              >
                Pickup
              </Button>
              <Button
                type="button"
                size="sm"
                variant={fulfillment === "delivery" ? "default" : "outline"}
                onClick={() => setFulfillment("delivery")}
              >
                Delivery
              </Button>
            </div>
            {fulfillment === "dine_in" && floorPlan.tables.length > 0 && selectedTableId ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <p className="text-muted-foreground">
                  Table:{" "}
                  <span className="font-medium text-foreground">
                    {dineInTableLabel || "—"}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTableId(null)}
                >
                  Change table
                </Button>
              </div>
            ) : null}
          </div>

          <details
            open={customerDetailsOpen}
            onToggle={(e) => setCustomerDetailsOpen(e.currentTarget.open)}
            className="shrink-0 border-b bg-background open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted/40">
              <span>
                {fulfillment === "delivery"
                  ? "Customer details"
                  : "Customer & notes (optional)"}
              </span>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
            </summary>
            <div className="space-y-3 border-t px-3 py-3">
              <div className="space-y-2">
                <Label htmlFor="pos-name">Name</Label>
                <Input
                  id="pos-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional — defaults to Guest"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-phone">Phone</Label>
                <Input
                  id="pos-phone"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional — 10-digit Indian mobile"
                  autoComplete="tel"
                />
              </div>
              {fulfillment === "delivery" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pos-address">Delivery address</Label>
                    <Textarea
                      id="pos-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                      placeholder="Full address (required for delivery)"
                      className="resize-none bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pos-landmark">Landmark (optional)</Label>
                    <Input
                      id="pos-landmark"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="Near…"
                      className="bg-background"
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="pos-notes">Notes</Label>
                <Textarea
                  id="pos-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Table, packing, instructions…"
                  className="resize-none"
                />
              </div>
            </div>
          </details>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-3 pt-3 pb-2">
              <p className="font-medium text-sm">Preview</p>
              {cart.length > 0 ? (
                <div
                  className="mt-1.5 grid w-full grid-cols-[minmax(0,1fr)_minmax(2.25rem,auto)_minmax(2.5rem,auto)_minmax(2.5rem,auto)] gap-x-1.5 text-[10px] text-muted-foreground"
                  aria-hidden
                >
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">₹</span>
                  <span className="text-right">₹</span>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3">
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Tap items on the left to build an order.
                </p>
              ) : (
                <ul className="space-y-2 pb-2">
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
                        className="flex min-h-[4.5rem] items-start gap-2 rounded-md border bg-background p-2 text-sm"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div
                            className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(2.25rem,auto)_minmax(2.5rem,auto)_minmax(2.5rem,auto)] gap-x-1.5 gap-y-0.5 text-left text-xs tabular-nums"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            <div className="min-w-0 font-medium leading-snug">
                              {label}
                            </div>
                            <div className="text-right">{line.quantity}</div>
                            <div className="text-right">{formatMoney(line.unitPrice)}</div>
                            <div className="text-right">{formatMoney(sub)}</div>
                            {isCartItemLine(line) &&
                              line.addons
                                .filter((a) => a.quantity > 0)
                                .map((a) => {
                                  const tq = a.quantity * line.quantity;
                                  const tAmt = a.price * a.quantity * line.quantity;
                                  return (
                                    <div
                                      key={a.id}
                                      className="contents text-[11px] text-muted-foreground"
                                    >
                                      <div className="min-w-0 pl-2">+ {a.name}</div>
                                      <div className="text-right">{tq}</div>
                                      <div className="text-right">{formatMoney(a.price)}</div>
                                      <div className="text-right">{formatMoney(tAmt)}</div>
                                    </div>
                                  );
                                })}
                          </div>
                          {isCartComboLine(line) && line.componentSummary ? (
                            <p className="text-muted-foreground text-xs">
                              {line.componentSummary}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
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
                          <span className="w-6 text-center tabular-nums">
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
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
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

            <div className="shrink-0 border-t bg-muted/20 px-3 py-3">
              <details className="rounded-lg border border-border/60 bg-background [&>summary_svg]:-rotate-180 open:[&>summary_svg]:rotate-0 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 font-semibold hover:bg-muted/40">
                  <span>Total</span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums">{formatMoney(total)}</span>
                    <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform" />
                  </span>
                </summary>
                <div className="space-y-2.5 border-t px-3 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatMoney(billTotals.itemsTotal)}</span>
                  </div>
                  {fulfillment === "delivery" ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pos-delivery-charge" className="shrink-0 text-xs">
                        Delivery ₹
                      </Label>
                      <Input
                        id="pos-delivery-charge"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={deliveryChargeInput}
                        onChange={(e) => setDeliveryChargeInput(e.target.value)}
                        placeholder="0"
                        className="h-8 min-w-0 flex-1 bg-background text-sm tabular-nums"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pos-discount" className="shrink-0 text-xs">
                      Discount ₹
                    </Label>
                    <Input
                      id="pos-discount"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="0"
                      className="h-8 min-w-0 flex-1 bg-background text-sm tabular-nums"
                    />
                  </div>
                  {billTotals.deliveryCharge > 0 ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Delivery charge</span>
                      <span className="tabular-nums">+{formatMoney(billTotals.deliveryCharge)}</span>
                    </div>
                  ) : null}
                  {billTotals.discount > 0 ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Discount applied</span>
                      <span className="tabular-nums text-emerald-700">
                        −{formatMoney(billTotals.discount)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </details>
              {lastBill ? (
                <p className="mt-2 text-muted-foreground text-xs">
                  Last placed:{" "}
                  <strong className="text-foreground">{lastBill.orderRef}</strong>
                </p>
              ) : null}
            </div>
          </div>

          <footer className="shrink-0 border-t bg-background p-3">
            <div className="space-y-2">
              <Label>Payment</Label>
              {(posSettings?.paymentMethods ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Add payment methods in Restaurant settings.
                </p>
              ) : (
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label="Payment method"
                >
                  {(posSettings?.paymentMethods ?? []).map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant={
                        paymentMethodKey === p.id ? "default" : "outline"
                      }
                      className="rounded-full"
                      onClick={() => setPaymentMethodKey(p.id)}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="default"
                className="w-full"
                disabled={placing || cart.length === 0}
                onClick={() => void submitPosOrder("none")}
              >
                {placing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={placing || cart.length === 0}
                  onClick={() => {
                    if (getKhaanzDesktop()?.isDesktop && !printerConnected) {
                      setPrinterDialogOpen(true);
                      return;
                    }
                    void submitPosOrder("kot");
                  }}
                >
                  {placing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    getKhaanzDesktop()?.isDesktop && !printerConnected
                      ? "Connect printer"
                      : "Save & KOT"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={placing || cart.length === 0}
                  onClick={() => {
                    if (getKhaanzDesktop()?.isDesktop && !printerConnected) {
                      setPrinterDialogOpen(true);
                      return;
                    }
                    void submitPosOrder("bill");
                  }}
                >
                  {placing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    getKhaanzDesktop()?.isDesktop && !printerConnected
                      ? "Connect printer"
                      : "Save & Bill"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={placing || cart.length === 0}
                  onClick={() => {
                    if (getKhaanzDesktop()?.isDesktop && !printerConnected) {
                      setPrinterDialogOpen(true);
                      return;
                    }
                    void submitPosOrder("both");
                  }}
                >
                  {placing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    getKhaanzDesktop()?.isDesktop && !printerConnected
                      ? "Connect printer"
                      : "Save & Print"
                  )}
                </Button>
              </div>
            </div>
          </footer>
        </div>
      </div>

      <Dialog
        open={tablePickModalOpen}
        onOpenChange={() => {
          /* Block dismiss until a table is chosen; use footer actions to leave dine-in. */
        }}
      >
        <DialogContent
          className="max-w-lg sm:max-w-xl"
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
                  "absolute flex items-center justify-center rounded border px-0.5 text-[10px] font-semibold leading-tight shadow-sm transition-colors",
                  selectedTableId === t.id
                    ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/25"
                    : "border-border bg-card text-foreground hover:bg-muted/80",
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Open item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-muted-foreground text-sm">
              Not on the menu — billed as a custom line on the order.
            </p>
            <div className="space-y-2">
              <Label htmlFor="pos-open-name">Item name</Label>
              <Input
                id="pos-open-name"
                value={openItemName}
                onChange={(e) => setOpenItemName(e.target.value)}
                placeholder="e.g. Extra roti, Corkage"
                className="bg-background"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-open-price">Price (₹)</Label>
              <Input
                id="pos-open-price"
                inputMode="decimal"
                value={openItemPrice}
                onChange={(e) => setOpenItemPrice(e.target.value)}
                placeholder="0"
                className="bg-background"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeOpenItemModal}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => addOpenLine()}>
              Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={printerDialogOpen}
        onOpenChange={(o) => {
          // Keep simple: allow closing any time.
          setPrinterDialogOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
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
                      className="w-full"
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
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Tip: If you set <code>KHAANZ_SILENT_PRINTER</code>, it will
                      override this selection.
                    </p>
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

      {getKhaanzDesktop()?.isDesktop ? (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-2 text-xs font-semibold shadow-sm",
              printerConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-border bg-background text-foreground",
            )}
            onClick={() => setPrinterDialogOpen(true)}
          >
            {printerConnected ? "Printer connected" : "Connect printer"}
          </button>
        </div>
      ) : null}

      <Dialog
        open={dialogItem !== null}
        onOpenChange={(o) => {
          if (!o) setDialogItem(null);
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] max-w-lg flex-col overflow-hidden sm:max-w-xl">
          {dialogItem ? (
            <>
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle>{dialogItem.name}</DialogTitle>
              </DialogHeader>
              <div
                className="min-h-0 max-h-[min(65dvh,calc(100dvh-12rem))] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]"
              >
                <div className="space-y-4 py-1">
                <div className="space-y-2">
                  <Label id="pos-variation-label">Variation</Label>
                  <div
                    className="flex max-w-full flex-nowrap gap-2 overflow-x-auto overflow-y-hidden pb-1 pt-0.5"
                    role="radiogroup"
                    aria-labelledby="pos-variation-label"
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
                            "flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted/60",
                          )}
                          onClick={() => setVariationId(v.id)}
                        >
                          <span
                            className={cn(
                              "max-w-[min(12rem,calc(100vw-8rem))] truncate font-medium",
                              selected && "text-primary-foreground",
                            )}
                          >
                            {v.name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 tabular-nums text-xs",
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
                    <Label id="pos-addons-label">Add-ons</Label>
                    <div
                      className="flex max-w-full content-start flex-wrap gap-2 overflow-x-hidden pb-1 pt-0.5"
                      role="group"
                      aria-labelledby="pos-addons-label"
                    >
                      {dialogItem.addons.map((a) => {
                        const q = addonQty[a.id] ?? 0;
                        const selected = q > 0;
                        const bump = (d: number) => {
                          setAddonQty((prev) => {
                            const n = Math.max(0, Math.min(99, (prev[a.id] ?? 0) + d));
                            return { ...prev, [a.id]: n };
                          });
                        };
                        const addonBody = (
                          <>
                            <div className="relative h-8 w-full shrink-0 overflow-hidden bg-muted">
                              {a.image ? (
                                // eslint-disable-next-line @next/next/no-img-element -- dynamic menu URLs
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
                            <div className="flex min-h-0 items-center gap-0.5 px-1 py-0.5 leading-none">
                              <span className="line-clamp-1 min-w-0 flex-1 text-[10px] font-medium">
                                {a.name}
                              </span>
                              <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                                {formatMoney(a.price)}
                              </span>
                            </div>
                          </>
                        );
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "flex w-[6.25rem] shrink-0 flex-col overflow-hidden rounded-lg border bg-background text-left",
                              selected
                                ? "border-primary ring-1 ring-primary"
                                : "border-border",
                            )}
                          >
                            {q === 0 ? (
                              <button
                                type="button"
                                className="flex w-full flex-col overflow-hidden text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => bump(1)}
                                aria-label={`Add ${a.name}`}
                              >
                                {addonBody}
                              </button>
                            ) : (
                              <div className="flex flex-col">{addonBody}</div>
                            )}
                            {q > 0 ? (
                              <div className="flex items-center justify-center gap-0.5 border-t p-0.5">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="size-6"
                                  onClick={() => bump(-1)}
                                  aria-label="Decrease add-on"
                                >
                                  <MinusIcon className="size-3" />
                                </Button>
                                <span className="w-5 text-center text-[10px] tabular-nums">
                                  {q}
                                </span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="size-6"
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
              <DialogFooter className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-h-5 text-muted-foreground text-sm">
                  {hasDialogAddonQty ? (
                    <span>
                      Final price: <span className="font-medium text-foreground tabular-nums">{formatMoney(dialogConfigureUnit)}</span>
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                  <Button type="button" variant="outline" onClick={() => setDialogItem(null)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={confirmConfigure}>
                    Add to order
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
