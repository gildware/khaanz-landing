"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ExternalLinkIcon,
  ImageIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useMenuData } from "@/contexts/menu-data-context";
import {
  buildComboLineId,
  buildLineId,
  computeUnitPrice,
} from "@/lib/cart-line";
import { isMenuItemAvailable } from "@/lib/menu-availability";
import { formatComboComponentSummary, isComboAvailable } from "@/lib/menu-combos";
import {
  cartLinesToReceiptRows,
  kotLinesFromCart,
  printPosBillThermal,
  printPosKotThermal,
  type PosBillPrintOptions,
} from "@/lib/pos-print";
import {
  closeThermalPort,
  isWebSerialSupported,
  openThermalPort,
  requestThermalSerialPort,
} from "@/lib/thermal-serial";
import type { ThermalSerialPort } from "@/lib/thermal-serial";
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

function formatMoney(n: number): string {
  return `₹${n.toFixed(0)}`;
}

function posFulfillmentLabel(m: FulfillmentMode): string {
  if (m === "dine_in") return "Dine-in";
  if (m === "pickup") return "Pickup";
  return "Delivery";
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

export default function AdminPosPage() {
  const { data: menu, isLoading, error } = useMenuData();
  const categories = useMemo(() => menu?.categories ?? [], [menu]);
  const items = useMemo(() => menu?.items ?? [], [menu]);
  const combos = useMemo(() => menu?.combos ?? [], [menu]);

  const [categoryKey, setCategoryKey] = useState<string>("");
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
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("dine_in");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [posSettings, setPosSettings] = useState<RestaurantSettingsPayload | null>(
    null,
  );
  const [paymentMethodKey, setPaymentMethodKey] = useState("");
  const thermalPortRef = useRef<ThermalSerialPort | null>(null);
  const [thermalConnecting, setThermalConnecting] = useState(false);
  const [thermalConnected, setThermalConnected] = useState(false);

  /** After checkout, cart is cleared — keep a snapshot so reprint works. */
  const [lastBill, setLastBill] = useState<{
    orderRef: string;
    lines: ReturnType<typeof cartLinesToReceiptRows>;
    total: number;
    fulfillmentLabel: string;
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

  useEffect(() => {
    const defaultKey =
      categories.length > 0
        ? categories[0]!.name
        : combos.length > 0
          ? CAT_COMBOS
          : CAT_OPEN;
    setCategoryKey((prev) => {
      const valid = new Set<string>([
        CAT_OPEN,
        CAT_COMBOS,
        ...categories.map((c) => c.name),
      ]);
      return prev && valid.has(prev) ? prev : defaultKey;
    });
  }, [categories, combos.length]);

  useEffect(() => {
    if (cart.length > 0) setLastBill(null);
  }, [cart.length]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as RestaurantSettingsPayload;
        setPosSettings(data);
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

  const [dialogItem, setDialogItem] = useState<MenuItem | null>(null);
  const [variationId, setVariationId] = useState<string>("");
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [cart],
  );

  const receiptRows = useMemo(() => cartLinesToReceiptRows(cart), [cart]);

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
    [],
  );

  const addOpenLine = useCallback(() => {
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
  }, [openItemName, openItemPrice, closeOpenItemModal]);

  const addComboLine = useCallback((combo: MenuCombo) => {
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
  }, [items]);

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
  }, [addItemLine]);

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
      namePrint: string;
      phonePrint: string;
      notesPrint: string;
      footerPrint: string;
      paymentLabel: string;
      header: string;
      footer: string;
    }): PosBillPrintOptions => ({
      restaurantName: SITE.name,
      billHeader: args.header,
      billFooter: args.footer,
      orderRef: args.orderRef,
      proforma: args.proforma,
      fulfillmentLabel: args.fulfillmentPrint,
      customerName: args.namePrint,
      phoneDigits: args.phonePrint,
      notes: args.notesPrint,
      footerNote: args.footerPrint || undefined,
      paymentLabel: args.paymentLabel,
      lines: args.lines,
      total: args.printTotal,
    }),
    [],
  );

  const connectThermalPrinter = useCallback(async () => {
    if (!isWebSerialSupported()) {
      toast.error("USB thermal needs Chrome or Edge (HTTPS or localhost).");
      return;
    }
    setThermalConnecting(true);
    setThermalConnected(false);
    try {
      if (thermalPortRef.current) {
        await closeThermalPort(thermalPortRef.current);
        thermalPortRef.current = null;
      }
      const port = await requestThermalSerialPort();
      await openThermalPort(port, 9600);
      thermalPortRef.current = port;
      setThermalConnected(true);
      toast.success("Thermal printer connected");
    } catch (e) {
      console.error(e);
      setThermalConnected(false);
      toast.error("Could not connect printer.");
    } finally {
      setThermalConnecting(false);
    }
  }, []);

  const submitPosOrder = useCallback(
    async (printMode: "none" | "kot" | "bill" | "both") => {
      if (cart.length === 0) {
        toast.error("Add at least one item.");
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

      setPlacing(true);
      try {
        const res = await fetch("/api/admin/orders/pos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            customerName: nameSnap,
            phone: phonePayload,
            fulfillment,
            scheduleMode: "asap",
            scheduledAt: null,
            address: fulfillment === "delivery" ? address.trim() : "",
            landmark: fulfillment === "delivery" ? landmark.trim() : "",
            notes: notesSnap,
            lines: cart,
            latitude: null,
            longitude: null,
            paymentMethodKey: payKey,
          }),
        });
        const j = (await res.json()) as { orderRef?: string; error?: string };
        if (!res.ok) {
          toast.error(j.error ?? "Could not place order.");
          return;
        }
        const orderRef = j.orderRef;
        if (!orderRef) {
          toast.error("Order saved without reference.");
          return;
        }

        setLastBill({
          orderRef,
          lines: snapshotLines,
          total: snapTotal,
          fulfillmentLabel: fulfillLabel,
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

        const port = thermalPortRef.current;
        if (printMode === "kot" || printMode === "both") {
          await printPosKotThermal(
            {
              restaurantName: SITE.name,
              billHeader: header,
              orderRef,
              fulfillmentLabel: fulfillLabel,
              notes: notesSnap,
              lines: snapshotKot,
            },
            port,
          );
        }
        if (printMode === "bill" || printMode === "both") {
          await printPosBillThermal(
            buildBillOptions({
              lines: snapshotLines,
              printTotal: snapTotal,
              orderRef,
              proforma: false,
              fulfillmentPrint: fulfillLabel,
              namePrint: nameSnap,
              phonePrint: phonePayload || POS_ANONYMOUS_PHONE_DIGITS,
              notesPrint: notesSnap,
              footerPrint: footerNote,
              paymentLabel: paymentDisplayName(payKey),
              header,
              footer,
            }),
            port,
          );
        }
      } catch {
        toast.error("Network error.");
      } finally {
        setPlacing(false);
      }
    },
    [
      cart,
      total,
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
            <h1 className="font-semibold text-2xl tracking-tight">
              {SITE.name} POS
            </h1>
            <p className="text-muted-foreground text-sm">
              {
                "Dine-in, pickup, or delivery. Save & KOT / Bill / Print use USB thermal when connected; otherwise a print dialog opens so you always get a copy."
              }
            </p>
          </div>
        </div>
        <Link
          href="/admin/orders"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex shrink-0 gap-1.5",
          )}
        >
          <ExternalLinkIcon className="size-3.5" />
          Orders
        </Link>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1fr_min(420px,40%)]">
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
            <div className="flex min-h-0 flex-1">
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

        <div className="flex min-h-[min(420px,45dvh)] flex-col border-t bg-muted/20 lg:min-h-0 lg:border-t-0">
          <div className="border-b p-3">
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
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            <details
              open={customerDetailsOpen}
              onToggle={(e) => setCustomerDetailsOpen(e.currentTarget.open)}
              className="rounded-lg border bg-background open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium hover:bg-muted/40">
                <span>
                  {fulfillment === "delivery"
                    ? "Customer details"
                    : "Customer & notes (optional)"}
                </span>
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
              </summary>
              <div className="space-y-3 border-t p-3 pt-3">
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

            <Separator />

            <div>
              <p className="mb-2 font-medium text-sm">Preview</p>
              {cart.length > 0 ? (
                <div
                  className="mb-1.5 grid max-w-md grid-cols-[1fr_minmax(2.25rem,auto)_minmax(2.5rem,auto)_minmax(2.5rem,auto)] gap-x-1.5 text-[10px] text-muted-foreground"
                  aria-hidden
                >
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">₹</span>
                  <span className="text-right">₹</span>
                </div>
              ) : null}
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Tap items on the left to build an order.
                </p>
              ) : (
                <ul className="space-y-2">
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
                        className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div
                            className="grid w-full max-w-md grid-cols-[1fr_minmax(2.25rem,auto)_minmax(2.5rem,auto)_minmax(2.5rem,auto)] gap-x-1.5 gap-y-0.5 text-left text-xs tabular-nums"
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

            <div className="flex items-center justify-between border-t pt-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total)}</span>
            </div>
            {lastBill ? (
              <p className="text-muted-foreground text-xs">
                Last placed:{" "}
                <strong className="text-foreground">{lastBill.orderRef}</strong>
              </p>
            ) : null}
          </div>

          <div className="space-y-3 border-t p-3">
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
            {isWebSerialSupported() ? (
              <div className="space-y-2">
                {thermalConnected ? (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-950 dark:text-emerald-50"
                    role="status"
                  >
                    <CheckCircle2Icon
                      className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                    <span className="font-medium">Thermal printer connected</span>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant={thermalConnected ? "outline" : "secondary"}
                  size="sm"
                  className="w-full"
                  disabled={thermalConnecting}
                  onClick={() => void connectThermalPrinter()}
                >
                  {thermalConnecting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <>
                      <PrinterIcon className="mr-2 size-4" />
                      {thermalConnected
                        ? "Reconnect USB thermal printer"
                        : "Connect USB thermal printer"}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                USB thermal printing needs Chrome or Edge over HTTPS or localhost.
              </p>
            )}
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
                  onClick={() => void submitPosOrder("kot")}
                >
                  {placing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    "Save & KOT"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={placing || cart.length === 0}
                  onClick={() => void submitPosOrder("bill")}
                >
                  {placing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    "Save & Bill"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={placing || cart.length === 0}
                  onClick={() => void submitPosOrder("both")}
                >
                  {placing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    "Save & Print"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
