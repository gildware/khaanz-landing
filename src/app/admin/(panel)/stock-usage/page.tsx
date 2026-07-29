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
  istStartOfMonth,
  istStartOfNextMonth,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { formatRupees } from "@/lib/payroll/payroll-utils";
import { cn } from "@/lib/utils";

type UsagePeriod = "day" | "week" | "month";

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

type PeriodRange = {
  from: Date;
  toExclusive: Date;
  label: string;
};

const PERIOD_OPTIONS: { id: UsagePeriod; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

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

/** Monday = 0 … Sunday = 6 in IST. */
function istWeekdayMon0(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[wd] ?? 0;
}

function shortIstDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  }).format(d);
}

function resolvePeriodRange(dateKey: string, period: UsagePeriod): PeriodRange | null {
  const anchor = parseIstDateInput(dateKey);
  if (!anchor) return null;

  if (period === "day") {
    return {
      from: anchor,
      toExclusive: new Date(anchor.getTime() + 24 * 60 * 60 * 1000),
      label: istDateLabel(anchor),
    };
  }

  if (period === "week") {
    const monOffset = istWeekdayMon0(anchor);
    const from = new Date(anchor.getTime() - monOffset * 24 * 60 * 60 * 1000);
    const toExclusive = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const lastDay = new Date(toExclusive.getTime() - 24 * 60 * 60 * 1000);
    return {
      from,
      toExclusive,
      label: `${shortIstDate(from)} – ${shortIstDate(lastDay)}`,
    };
  }

  const from = istStartOfMonth(anchor);
  const toExclusive = istStartOfNextMonth(anchor);
  return {
    from,
    toExclusive,
    label: new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "long",
      year: "numeric",
    }).format(anchor),
  };
}

function usageUrlForRange(range: PeriodRange | null): string | null {
  if (!range) return null;
  const toInclusive = new Date(range.toExclusive.getTime() - 1);
  return `/api/admin/inventory/reports/consumption?from=${encodeURIComponent(
    range.from.toISOString(),
  )}&to=${encodeURIComponent(toInclusive.toISOString())}`;
}

function shiftPeriodAnchor(dateKey: string, period: UsagePeriod, delta: number): string {
  if (period === "day") return shiftIstDate(dateKey, delta);
  if (period === "week") return shiftIstDate(dateKey, delta * 7);

  const start = parseIstDateInput(dateKey);
  if (!start) return dateKey;
  const { y, m } = (() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(start);
    return {
      y: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
      m: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    };
  })();
  const next = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
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

function summarizeRows(rows: UsageRow[]) {
  let cost = 0;
  let salesCost = 0;
  let wastageCost = 0;
  for (const r of rows) {
    cost += r.estCostPaise;
    const total = Number(r.totalQtyBase);
    if (total > 0 && r.estCostPaise > 0) {
      const unit = r.estCostPaise / total;
      salesCost += Number(r.salesQtyBase) * unit;
      wastageCost += Number(r.wastageQtyBase) * unit;
    }
  }
  return {
    count: rows.length,
    costPaise: Math.round(cost),
    salesCostPaise: Math.round(salesCost),
    wastageCostPaise: Math.round(wastageCost),
    mostUsed: rows[0] ?? null,
  };
}

export default function StockUsagePage() {
  const [date, setDate] = useState(() => formatIstDateInput(new Date()));
  const [period, setPeriod] = useState<UsagePeriod>("day");
  const [search, setSearch] = useState("");

  const range = useMemo(() => resolvePeriodRange(date, period), [date, period]);
  const monthRange = useMemo(() => resolvePeriodRange(date, "month"), [date]);

  const periodUrl = useMemo(() => usageUrlForRange(range), [range]);
  const monthUrl = useMemo(() => usageUrlForRange(monthRange), [monthRange]);

  const { data, error, isLoading, isValidating } = useSWR(periodUrl, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: monthlyData,
    error: monthlyError,
    isLoading: monthlyLoading,
    isValidating: monthlyValidating,
  } = useSWR(period === "month" ? null : monthUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const goToday = useCallback(() => {
    setDate(formatIstDateInput(new Date()));
  }, []);

  const periodLabel = range?.label ?? date;
  const monthLabel = monthRange?.label ?? date.slice(0, 7);

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.itemName} ${r.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.rows, search]);

  const periodSummary = useMemo(
    () => summarizeRows(data?.rows ?? []),
    [data?.rows],
  );
  const monthlySummary = useMemo(
    () => summarizeRows((period === "month" ? data?.rows : monthlyData?.rows) ?? []),
    [period, data?.rows, monthlyData?.rows],
  );

  const navPrevLabel =
    period === "day" ? "Previous day" : period === "week" ? "Previous week" : "Previous month";
  const navNextLabel =
    period === "day" ? "Next day" : period === "week" ? "Next week" : "Next month";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
          <PackageSearchIcon className="size-6 text-primary" aria-hidden />
          Stock usage
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          How much of each inventory item was used — by day, week, or month —
          from sales (recipes), wastage, kitchen use, and stock sales.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <div className="flex rounded-lg border p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={period === opt.id ? "default" : "ghost"}
                className={cn(
                  "rounded-md px-3",
                  period !== opt.id && "text-muted-foreground",
                )}
                onClick={() => setPeriod(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-usage-date">
            {period === "month" ? "Month (pick any day)" : "Anchor day (IST)"}
          </Label>
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
            onClick={() => setDate((d) => shiftPeriodAnchor(d, period, -1))}
            aria-label={navPrevLabel}
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
            onClick={() => setDate((d) => shiftPeriodAnchor(d, period, 1))}
            aria-label={navNextLabel}
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
          {periodLabel}
          {isValidating ? " · updating…" : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Most used · {period}
          </p>
          <p className="mt-1 truncate font-semibold text-xl">
            {isLoading ? "…" : periodSummary.mostUsed?.itemName ?? "No usage"}
          </p>
          {periodSummary.mostUsed ? (
            <p className="mt-1 text-muted-foreground text-sm tabular-nums">
              {formatUsageQty(
                periodSummary.mostUsed.totalQtyBase,
                periodSummary.mostUsed.purchaseUnit,
                periodSummary.mostUsed.baseUnit,
                periodSummary.mostUsed.baseUnitsPerPurchaseUnit,
              )}{" "}
              · {formatRupees(periodSummary.mostUsed.estCostPaise)}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            {period === "day"
              ? "Day used"
              : period === "week"
                ? "Week used"
                : "Month used"}
          </p>
          <p className="mt-1 font-semibold text-2xl tabular-nums">
            {isLoading ? "…" : formatRupees(periodSummary.costPaise)}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {isLoading
              ? "Loading…"
              : `${periodSummary.count} items · sales ${formatRupees(periodSummary.salesCostPaise)}`}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Monthly used · {monthLabel}
          </p>
          <p className="mt-1 font-semibold text-2xl tabular-nums">
            {period === "month"
              ? isLoading
                ? "…"
                : formatRupees(monthlySummary.costPaise)
              : monthlyLoading
                ? "…"
                : formatRupees(monthlySummary.costPaise)}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {period === "month"
              ? isLoading
                ? "Loading…"
                : `${monthlySummary.count} inventory items`
              : monthlyLoading
                ? "Loading…"
                : `${monthlySummary.count} inventory items`}
            {monthlyValidating && !monthlyLoading && period !== "month"
              ? " · updating…"
              : null}
          </p>
        </div>
      </div>

      {error || (period !== "month" && monthlyError) ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
          Could not load usage: {(error ?? monthlyError)?.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium text-sm">
            Usage report · {periodLabel}
          </h2>
          <p className="text-muted-foreground text-xs">
            Showing {period} totals
            {filtered.length !== (data?.rows.length ?? 0)
              ? ` · ${filtered.length} of ${data?.rows.length ?? 0} items`
              : null}
          </p>
        </div>
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
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-muted-foreground"
                >
                  Loading usage for {periodLabel}…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-muted-foreground"
                >
                  No stock usage recorded for this {period}.
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
        Week = Mon–Sun (IST). Month = full calendar month. Sales = recipe
        deductions from POS/web orders (linked items show as the source, e.g.
        Frozen Chicken Boneless). Other = vendor sales + direct stock sales.
        Generated {formatIstDateTimeLong(new Date())}.
      </p>
    </div>
  );
}
