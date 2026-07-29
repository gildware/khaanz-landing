"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PackageSearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRecipeQtyBase } from "@/lib/inventory/decimal-utils";
import {
  formatIstDateInput,
  formatIstDateTimeLong,
  istDateLabel,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { formatRupees } from "@/lib/payroll/payroll-utils";

type UsageRow = {
  inventoryItemId: string;
  itemName: string;
  category: string;
  baseUnit: string;
  purchaseUnit: string;
  baseUnitsPerPurchaseUnit: string;
  salesQtyBase: string;
  vendorSaleQtyBase: string;
  wastageQtyBase: string;
  kitchenUseQtyBase: string;
  stockSaleQtyBase: string;
  totalQtyBase: string;
  estCostPaise: number;
};

type UsageResponse = {
  date: string | null;
  from: string;
  toExclusive: string;
  rows: UsageRow[];
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as UsageResponse;
};

function shiftIstDate(dateKey: string, deltaDays: number): string {
  const start = parseIstDateInput(dateKey);
  if (!start) return dateKey;
  const next = new Date(start.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return formatIstDateInput(next);
}

function formatUsageQty(
  qtyBase: string,
  purchaseUnit: string,
  baseUnit: string,
  baseUnitsPerPurchaseUnit: string,
): string {
  const qty = Number(qtyBase);
  if (!Number.isFinite(qty) || qty <= 0) return "—";
  const factor = Number(baseUnitsPerPurchaseUnit);
  if (
    Number.isFinite(factor) &&
    factor > 1 &&
    (purchaseUnit === "kg" ||
      purchaseUnit === "L" ||
      purchaseUnit === "ltr" ||
      purchaseUnit === "litre")
  ) {
    return `${formatRecipeQtyBase(qty / factor)} ${purchaseUnit}`;
  }
  return `${formatRecipeQtyBase(qty)} ${baseUnit}`;
}

export default function StockUsagePage() {
  const [date, setDate] = useState(() => formatIstDateInput(new Date()));
  const [search, setSearch] = useState("");

  const { data, error, isLoading, isValidating } = useSWR(
    `/api/admin/inventory/reports/consumption?date=${encodeURIComponent(date)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const goToday = useCallback(() => {
    setDate(formatIstDateInput(new Date()));
  }, []);

  const dayLabel = useMemo(() => {
    const d = parseIstDateInput(date);
    return d ? istDateLabel(d) : date;
  }, [date]);

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.itemName} ${r.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.rows, search]);

  const totals = useMemo(() => {
    let cost = 0;
    for (const r of filtered) cost += r.estCostPaise;
    return { count: filtered.length, costPaise: cost };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
          <PackageSearchIcon className="size-6 text-primary" aria-hidden />
          Stock usage
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          How much of each inventory item was used on a day — from sales
          (recipes), wastage, kitchen use, and stock sales.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="stock-usage-date">Day (IST)</Label>
          <Input
            id="stock-usage-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[11rem]"
          />
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => shiftIstDate(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button type="button" variant="outline" onClick={goToday}>
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => shiftIstDate(d, 1))}
            aria-label="Next day"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="stock-usage-search">Search</Label>
          <Input
            id="stock-usage-search"
            placeholder="Item or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="pb-2 text-muted-foreground text-sm">
          {dayLabel}
          {isValidating ? " · updating…" : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Items used
          </p>
          <p className="mt-1 font-semibold text-2xl tabular-nums">
            {isLoading ? "…" : totals.count}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Est. cost of usage
          </p>
          <p className="mt-1 font-semibold text-2xl tabular-nums">
            {isLoading ? "…" : formatRupees(totals.costPaise)}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
          Could not load usage: {error.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Wastage</TableHead>
              <TableHead className="text-right">Kitchen</TableHead>
              <TableHead className="text-right">Other</TableHead>
              <TableHead className="text-right">Total used</TableHead>
              <TableHead className="text-right">Est. cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Loading usage for {dayLabel}…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No stock usage recorded for this day.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const other =
                  Number(r.vendorSaleQtyBase) + Number(r.stockSaleQtyBase);
                return (
                  <TableRow key={r.inventoryItemId}>
                    <TableCell className="font-medium">{r.itemName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.category.trim() || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatUsageQty(
                        r.salesQtyBase,
                        r.purchaseUnit,
                        r.baseUnit,
                        r.baseUnitsPerPurchaseUnit,
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatUsageQty(
                        r.wastageQtyBase,
                        r.purchaseUnit,
                        r.baseUnit,
                        r.baseUnitsPerPurchaseUnit,
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatUsageQty(
                        r.kitchenUseQtyBase,
                        r.purchaseUnit,
                        r.baseUnit,
                        r.baseUnitsPerPurchaseUnit,
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {other > 0
                        ? formatUsageQty(
                            String(other),
                            r.purchaseUnit,
                            r.baseUnit,
                            r.baseUnitsPerPurchaseUnit,
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm tabular-nums">
                      {formatUsageQty(
                        r.totalQtyBase,
                        r.purchaseUnit,
                        r.baseUnit,
                        r.baseUnitsPerPurchaseUnit,
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.estCostPaise > 0 ? formatRupees(r.estCostPaise) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-xs">
        Sales = recipe deductions from POS/web orders (linked items show as the
        source, e.g. Frozen Chicken Boneless). Other = vendor sales + direct
        stock sales. Generated {formatIstDateTimeLong(new Date())}.
      </p>
    </div>
  );
}
