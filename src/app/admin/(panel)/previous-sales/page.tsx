"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HistoryIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";
import { formatRupees } from "@/lib/payroll/payroll-utils";
import type { CartItemLine } from "@/types/menu";

type MenuPayload = {
  items: {
    id: string;
    name: string;
    category: string;
    image?: string;
    isVeg?: boolean;
    available?: boolean;
    notForSale?: boolean;
    variations: { id: string; name: string; price: number }[];
  }[];
};

type PaymentMethod = { id: string; name: string };

type LineDraft = {
  id: string;
  menuItemId: string;
  variationId: string;
  quantity: string;
};

function emptyLine(): LineDraft {
  return {
    id: crypto.randomUUID(),
    menuItemId: "",
    variationId: "",
    quantity: "1",
  };
}

function shiftIstDateInput(ymd: string, deltaDays: number): string {
  const start = parseIstDateInput(ymd);
  if (!start) return ymd;
  return formatIstDateInput(
    new Date(start.getTime() + deltaDays * 24 * 60 * 60 * 1000),
  );
}

function yesterdayIstDateInput(): string {
  return shiftIstDateInput(formatIstDateInput(new Date()), -1);
}

function soldAtIsoFromDateInput(dateYmd: string): string {
  // IST noon so the sale lands firmly on that business day.
  return new Date(`${dateYmd}T12:00:00+05:30`).toISOString();
}

export default function PreviousSalesPage() {
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [saleDate, setSaleDate] = useState(yesterdayIstDateInput);
  const [paymentMethodKey, setPaymentMethodKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const todayKey = formatIstDateInput(new Date());
  const maxDate = shiftIstDateInput(todayKey, -1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes, settingsRes] = await Promise.all([
        fetch("/api/menu", { credentials: "include" }),
        fetch("/api/admin/settings", { credentials: "include" }),
      ]);
      if (!menuRes.ok) throw new Error("Could not load menu.");
      const menuJson = (await menuRes.json()) as MenuPayload;
      setMenu(menuJson);

      if (settingsRes.ok) {
        const settingsJson = (await settingsRes.json()) as {
          paymentMethods?: PaymentMethod[];
        };
        const pms = settingsJson.paymentMethods ?? [];
        setPaymentMethods(pms);
        setPaymentMethodKey((prev) =>
          prev && pms.some((p) => p.id === prev) ? prev : (pms[0]?.id ?? ""),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const menuItems = useMemo(
    () =>
      (menu?.items ?? []).filter(
        (it) => it.available !== false && it.notForSale !== true,
      ),
    [menu],
  );

  const lineTotalRupees = useMemo(() => {
    let sum = 0;
    for (const ln of lines) {
      const dish = menuItems.find((it) => it.id === ln.menuItemId);
      const variation = dish?.variations.find((v) => v.id === ln.variationId);
      const qty = Number(ln.quantity);
      if (!variation || !Number.isFinite(qty) || qty <= 0) continue;
      sum += variation.price * qty;
    }
    return sum;
  }, [lines, menuItems]);

  const submit = async () => {
    if (!saleDate || saleDate >= todayKey) {
      toast.error("Pick a previous date (not today).");
      return;
    }
    if (!paymentMethodKey) {
      toast.error("Choose a payment method.");
      return;
    }

    const cartLines: CartItemLine[] = [];
    for (const ln of lines) {
      const dish = menuItems.find((it) => it.id === ln.menuItemId);
      const variation = dish?.variations.find((v) => v.id === ln.variationId);
      const qty = Number(ln.quantity);
      if (!dish || !variation) {
        toast.error("Every line needs a menu item and size.");
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error("Quantity must be greater than zero.");
        return;
      }
      cartLines.push({
        kind: "item",
        lineId: ln.id,
        itemId: dish.id,
        name: dish.name,
        image: dish.image ?? "",
        isVeg: Boolean(dish.isVeg),
        variation,
        addons: [],
        quantity: qty,
        unitPrice: variation.price,
      });
    }
    if (cartLines.length === 0) {
      toast.error("Add at least one item.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders/historical", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soldAt: soldAtIsoFromDateInput(saleDate),
          paymentMethodKey,
          customerName: customerName.trim() || "Guest",
          fulfillment: "pickup",
          scheduleMode: "asap",
          scheduledAt: null,
          address: "",
          landmark: "",
          notes: notes.trim(),
          lines: cartLines,
          latitude: null,
          longitude: null,
        }),
      });
      const j = (await res.json()) as { orderRef?: string; error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Could not save sale.");
        return;
      }
      const ref = j.orderRef ?? "";
      toast.success(
        ref
          ? `Saved as ${ref} for ${saleDate}`
          : `Sale saved for ${saleDate}`,
      );
      setLastSaved(ref ? `${ref} · ${saleDate}` : saleDate);
      setLines([emptyLine()]);
      setNotes("");
      setCustomerName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Loading…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
          <HistoryIcon className="size-6" aria-hidden />
          Previous day sales
        </h1>
        <p className="text-muted-foreground text-sm">
          Record menu sales you forgot to enter. They count toward that day’s
          daily report, cash, and inventory COGS — same as a POS order.
        </p>
      </div>

      <div className="space-y-6 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sale-date">Sale date</Label>
            <Input
              id="sale-date"
              type="date"
              value={saleDate}
              max={maxDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Must be before today ({todayKey}).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <SearchableSelect
              options={paymentMethods.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              value={paymentMethodKey}
              onValueChange={setPaymentMethodKey}
              placeholder="Payment…"
              searchPlaceholder="Search…"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer-name">Customer name (optional)</Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Guest"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Note (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. missed evening walk-ins"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-sm">Items</p>
              <p className="text-muted-foreground text-xs">
                Choose dishes sold that day. Stock reduces via recipes.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines((x) => [...x, emptyLine()])}
            >
              <PlusIcon className="mr-1 size-4" aria-hidden />
              Add item
            </Button>
          </div>

          <div className="space-y-2">
            {lines.map((ln) => {
              const dish = menuItems.find((it) => it.id === ln.menuItemId);
              const variations = dish?.variations ?? [];
              return (
                <div
                  key={ln.id}
                  className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_6rem_auto]"
                >
                  <SearchableSelect
                    options={menuItems.map((it) => ({
                      value: it.id,
                      label: it.name,
                      searchText: it.category,
                    }))}
                    value={ln.menuItemId}
                    onValueChange={(v) =>
                      setLines((x) =>
                        x.map((r) =>
                          r.id === ln.id
                            ? { ...r, menuItemId: v, variationId: "" }
                            : r,
                        ),
                      )
                    }
                    placeholder="Menu item…"
                    searchPlaceholder="Search dishes…"
                  />
                  <SearchableSelect
                    options={variations.map((v) => ({
                      value: v.id,
                      label: `${v.name} · ₹${v.price}`,
                    }))}
                    value={ln.variationId}
                    onValueChange={(v) =>
                      setLines((x) =>
                        x.map((r) =>
                          r.id === ln.id ? { ...r, variationId: v } : r,
                        ),
                      )
                    }
                    placeholder="Size…"
                    searchPlaceholder="Search…"
                    disabled={!ln.menuItemId}
                  />
                  <Input
                    inputMode="decimal"
                    value={ln.quantity}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((r) =>
                          r.id === ln.id
                            ? { ...r, quantity: e.target.value }
                            : r,
                        ),
                      )
                    }
                    placeholder="Qty"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    disabled={lines.length <= 1}
                    onClick={() =>
                      setLines((x) =>
                        x.length <= 1 ? x : x.filter((r) => r.id !== ln.id),
                      )
                    }
                  >
                    <Trash2Icon className="size-4" aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="tabular-nums text-sm">
            Total{" "}
            <span className="font-semibold">
              {formatRupees(Math.round(lineTotalRupees * 100))}
            </span>
          </p>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save previous day sale"}
          </Button>
        </div>

        {lastSaved ? (
          <p className="text-muted-foreground text-xs">
            Last saved: {lastSaved}
          </p>
        ) : null}
      </div>
    </div>
  );
}
