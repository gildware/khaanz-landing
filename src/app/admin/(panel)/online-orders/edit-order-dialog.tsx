"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

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
import { buildLineId, computeUnitPrice, migrateCartLine } from "@/lib/cart-line";
import { cn } from "@/lib/utils";
import type { CartLine, MenuItem, MenuVariation } from "@/types/menu";

export type EditableOrder = {
  id: string;
  orderRef: string | null;
  deliveryChargeMinor: number;
  discountMinor: number;
  lines: { sortIndex: number; payload: unknown }[];
};

type Props = {
  order: EditableOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Defaults to admin online-order PUT. */
  saveUrl?: (orderId: string) => string;
  description?: string;
};

function payloadToLine(payload: unknown): CartLine | null {
  if (!payload || typeof payload !== "object") return null;
  try {
    return migrateCartLine(payload as CartLine);
  } catch {
    return null;
  }
}

function lineKey(line: CartLine, index: number): string {
  return `${line.lineId ?? line.kind}-${index}`;
}

export function EditOrderDialog({
  order,
  open,
  onOpenChange,
  onSaved,
  saveUrl = (id) => `/api/admin/orders/${id}`,
  description = "Change items, delivery charge, and discount. Ingredient stock is adjusted automatically. Available for new online orders only.",
}: Props) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [deliveryRupees, setDeliveryRupees] = useState("0");
  const [discountRupees, setDiscountRupees] = useState("0");
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed editable state whenever a new order is opened.
  useEffect(() => {
    if (!open || !order) return;
    const seeded = order.lines
      .slice()
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((l) => payloadToLine(l.payload))
      .filter((l): l is CartLine => l !== null);
    setLines(seeded);
    setDeliveryRupees(String(order.deliveryChargeMinor / 100));
    setDiscountRupees(String(order.discountMinor / 100));
    setQuery("");
  }, [open, order]);

  // Lazy-load the menu once for the item picker.
  useEffect(() => {
    if (!open || menu !== null || menuLoading) return;
    setMenuLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/menu", { credentials: "include" });
        if (!res.ok) throw new Error("menu fetch failed");
        const data = (await res.json()) as { items?: MenuItem[] };
        setMenu(data.items ?? []);
      } catch {
        toast.error("Could not load menu for adding items");
        setMenu([]);
      } finally {
        setMenuLoading(false);
      }
    })();
  }, [open, menu, menuLoading]);

  const setQty = useCallback((index: number, qty: number) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, quantity: Math.max(1, Math.min(99, qty)) } : l,
      ),
    );
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addMenuItem = useCallback((item: MenuItem, variation: MenuVariation) => {
    const lineId = buildLineId(item.id, variation, []);
    setLines((prev) => {
      const existing = prev.findIndex(
        (l) => l.kind === "item" && l.lineId === lineId,
      );
      if (existing >= 0) {
        return prev.map((l, i) =>
          i === existing
            ? { ...l, quantity: Math.min(99, l.quantity + 1) }
            : l,
        );
      }
      const newLine: CartLine = {
        kind: "item",
        lineId,
        itemId: item.id,
        name: item.name,
        image: item.image,
        isVeg: item.isVeg,
        variation,
        addons: [],
        quantity: 1,
        unitPrice: computeUnitPrice(variation, []),
      };
      return [...prev, newLine];
    });
  }, []);

  const itemsMinor = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + Math.round(l.unitPrice * l.quantity * 100),
        0,
      ),
    [lines],
  );
  const deliveryMinor = Math.max(0, Math.round((Number(deliveryRupees) || 0) * 100));
  const discountMinor = Math.max(0, Math.round((Number(discountRupees) || 0) * 100));
  const beforeDiscount = itemsMinor + deliveryMinor;
  const totalMinor = Math.max(
    0,
    beforeDiscount - Math.min(discountMinor, beforeDiscount),
  );

  const searchQuery = query.trim().toLowerCase();

  const filteredMenu = useMemo(() => {
    if (!menu || !searchQuery) return [];
    return menu
      .filter((m) => m.variations.length > 0)
      .filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery) ||
          m.category.toLowerCase().includes(searchQuery),
      )
      .slice(0, 40);
  }, [menu, searchQuery]);

  const save = useCallback(async () => {
    if (!order) return;
    if (lines.length === 0) {
      toast.error("Add at least one item before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(saveUrl(order.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lines,
          deliveryChargeMinor: deliveryMinor,
          discountMinor,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Could not save changes");
        return;
      }
      toast.success("Order updated");
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [order, lines, deliveryMinor, discountMinor, onOpenChange, onSaved, saveUrl]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 p-5 pb-4">
          <DialogTitle>Edit order {order?.orderRef ?? ""}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* Current items */}
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Items ({lines.length})
            </h3>
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-muted-foreground text-sm">
                No items. Add at least one from the menu below.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((line, index) => (
                  <li
                    key={lineKey(line, index)}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{line.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {line.kind === "item" && line.variation?.name
                          ? `${line.variation.name} · `
                          : line.kind === "combo"
                            ? "Combo · "
                            : line.kind === "open"
                              ? "Open item · "
                              : ""}
                        ₹{line.unitPrice.toFixed(2)} each
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => setQty(index, line.quantity - 1)}
                        disabled={line.quantity <= 1}
                      >
                        <MinusIcon className="size-3.5" />
                      </Button>
                      <span className="w-7 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => setQty(index, line.quantity + 1)}
                        disabled={line.quantity >= 99}
                      >
                        <PlusIcon className="size-3.5" />
                      </Button>
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
                      ₹{(line.unitPrice * line.quantity).toFixed(2)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => removeLine(index)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Add from menu */}
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Add items
            </h3>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu items…"
                className="pl-9"
              />
            </div>
            {searchQuery ? (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border/70 p-2">
                {menuLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading menu…
                  </div>
                ) : filteredMenu.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground text-sm">
                    No matching items.
                  </p>
                ) : (
                  filteredMenu.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/60 bg-card p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {item.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {item.category}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.variations.map((v) => (
                          <Button
                            key={v.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => addMenuItem(item, v)}
                          >
                            <PlusIcon className="size-3" />
                            {v.name} · ₹{v.price.toFixed(0)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </section>

          {/* Charges */}
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-delivery">Delivery charge (₹)</Label>
              <Input
                id="edit-delivery"
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={deliveryRupees}
                onChange={(e) => setDeliveryRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-discount">Discount (₹)</Label>
              <Input
                id="edit-discount"
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={discountRupees}
                onChange={(e) => setDiscountRupees(e.target.value)}
              />
            </div>
          </section>

          {/* Totals */}
          <section className="space-y-1 rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items</span>
              <span className="tabular-nums">₹{(itemsMinor / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="tabular-nums">
                ₹{(deliveryMinor / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                −₹{(Math.min(discountMinor, beforeDiscount) / 100).toFixed(2)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border/70 pt-1.5 font-semibold">
              <span>Order total</span>
              <span className="tabular-nums">₹{(totalMinor / 100).toFixed(2)}</span>
            </div>
          </section>
        </div>

        <DialogFooter className="border-t border-border/70 p-5 pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || lines.length === 0}
            onClick={() => void save()}
            className={cn(saving && "opacity-80")}
          >
            {saving ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
