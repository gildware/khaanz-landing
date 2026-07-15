"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { istMonthKey } from "@/lib/ist-dates";
import { formatRupees } from "@/lib/payroll/payroll-utils";
import { cn } from "@/lib/utils";

type DayRow = {
  date: string;
  label: string;
  isFuture: boolean;
  salesPaise: number;
  orderCount: number;
  recipeStockCostPaise: number;
  kitchenUseCostPaise: number;
  stockCostUsedPaise: number;
  capitalExpensesPaise: number;
  grossMarginPaise: number;
  expensesPaise: number;
  salariesPaise: number;
  wastageCostPaise: number;
  netProfitPaise: number;
  personalUsePaise: number;
  vendorSalesPaise: number;
};

type DailyTableResponse = {
  monthKey: string;
  label: string;
  today: string;
  days: DayRow[];
  totals: {
    salesPaise: number;
    orderCount: number;
    recipeStockCostPaise: number;
    kitchenUseCostPaise: number;
    stockCostUsedPaise: number;
    capitalExpensesPaise: number;
    grossMarginPaise: number;
    expensesPaise: number;
    salariesPaise: number;
    wastageCostPaise: number;
    netProfitPaise: number;
    personalUsePaise: number;
    vendorSalesPaise: number;
  };
};

const COL_COUNT = 13;

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DailyTableResponse;
};

function shiftMonthKey(monthKey: string, delta: number): string {
  const [yRaw, mRaw] = monthKey.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function MoneyCell(props: {
  paise: number;
  muted?: boolean;
  emphasize?: boolean;
}) {
  const { paise, muted, emphasize } = props;
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums whitespace-nowrap",
        muted && "text-muted-foreground",
        emphasize && paise < 0 && "font-medium text-rose-600",
        emphasize && paise > 0 && "font-medium text-emerald-700",
      )}
    >
      {formatRupees(paise)}
    </TableCell>
  );
}

function FooterMoney(props: { paise: number; muted?: boolean; emphasize?: boolean }) {
  const { paise, muted, emphasize } = props;
  return (
    <TableCell
      className={cn(
        "sticky bottom-0 z-20 border-t bg-muted text-right tabular-nums",
        muted && "text-muted-foreground",
        emphasize && paise < 0 && "text-rose-600",
        emphasize && paise >= 0 && "text-emerald-700",
      )}
    >
      {formatRupees(paise)}
    </TableCell>
  );
}

export default function AdminDailyReportPage() {
  const thisMonth = istMonthKey(new Date());
  const [monthKey, setMonthKey] = useState(thisMonth);
  const [appliedMonth, setAppliedMonth] = useState(thisMonth);

  const apiUrl = useMemo(
    () => `/api/admin/reports/daily-table?month=${encodeURIComponent(appliedMonth)}`,
    [appliedMonth],
  );

  const { data, isLoading, error, mutate } = useSWR<DailyTableResponse>(apiUrl, fetcher);

  const applyMonth = useCallback(
    (next: string) => {
      setMonthKey(next);
      setAppliedMonth(next);
      void mutate();
    },
    [mutate],
  );

  const totals = data?.totals;
  const netTotalNegative = (totals?.netProfitPaise ?? 0) < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Daily report</h1>
          <p className="text-muted-foreground text-sm">
            Full month P&amp;L — sales, recipe stock, kitchen use, operating cost, renovation
            cost, salaries, wastage, and net profit.
          </p>
        </div>
        {data ? (
          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Month: </span>
            <span className="font-medium">{data.label}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="daily-report-month" className="text-xs">
              Month
            </Label>
            <Input
              id="daily-report-month"
              type="month"
              value={monthKey}
              max={thisMonth}
              onChange={(e) => setMonthKey(e.target.value)}
              className="w-44"
            />
          </div>
          <Button type="button" onClick={() => applyMonth(monthKey)} className="gap-2">
            <CalendarIcon className="size-4" />
            Show month
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => applyMonth(shiftMonthKey(appliedMonth, -1))}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyMonth(thisMonth)}
              disabled={appliedMonth === thisMonth}
            >
              This month
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next month"
              disabled={appliedMonth >= thisMonth}
              onClick={() => applyMonth(shiftMonthKey(appliedMonth, 1))}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
          Failed to load daily report. Please try again.
        </div>
      ) : null}

      <div className="rounded-xl border bg-card shadow-sm [&_[data-slot=table-container]]:max-h-[min(70vh,42rem)] [&_[data-slot=table-container]]:overflow-auto">
        <Table className="border-separate border-spacing-0">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 left-0 z-30 min-w-[9.5rem] border-b bg-card">
                Day
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">Sales</TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">Orders</TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Recipe stock
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Kitchen use
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Gross margin
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Operating cost
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Renovation cost
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Salaries
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Wastage
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Net profit
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Personal
              </TableHead>
              <TableHead className="sticky top-0 z-20 border-b bg-card text-right">
                Vendor
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="text-muted-foreground py-10 text-center">
                  Loading month…
                </TableCell>
              </TableRow>
            ) : null}
            {(data?.days ?? []).map((row) => {
              const isToday = row.date === data?.today;
              const dayBg = isToday ? "bg-primary/5" : "bg-card";
              return (
                <TableRow
                  key={row.date}
                  className={cn(isToday && "bg-primary/5", row.isFuture && "opacity-45")}
                >
                  <TableCell
                    className={cn(
                      "sticky left-0 z-10 font-medium whitespace-nowrap",
                      dayBg,
                    )}
                  >
                    <div>{row.label}</div>
                    {isToday ? (
                      <div className="text-muted-foreground text-xs">Today</div>
                    ) : null}
                    {row.isFuture ? (
                      <div className="text-muted-foreground text-xs">Upcoming</div>
                    ) : null}
                  </TableCell>
                  <MoneyCell paise={row.salesPaise} />
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.orderCount}
                  </TableCell>
                  <MoneyCell paise={row.recipeStockCostPaise} muted />
                  <MoneyCell paise={row.kitchenUseCostPaise} muted />
                  <MoneyCell paise={row.grossMarginPaise} emphasize />
                  <MoneyCell paise={row.expensesPaise} muted />
                  <MoneyCell paise={row.capitalExpensesPaise} muted />
                  <MoneyCell paise={row.salariesPaise} muted />
                  <MoneyCell paise={row.wastageCostPaise} muted />
                  <MoneyCell paise={row.netProfitPaise} emphasize />
                  <MoneyCell paise={row.personalUsePaise} muted />
                  <MoneyCell paise={row.vendorSalesPaise} muted />
                </TableRow>
              );
            })}
          </TableBody>
          {totals ? (
            <TableFooter>
              <TableRow className="border-t bg-muted font-semibold hover:bg-muted">
                <TableCell className="sticky bottom-0 left-0 z-30 border-t bg-muted">
                  Month total
                </TableCell>
                <FooterMoney paise={totals.salesPaise} />
                <TableCell className="sticky bottom-0 z-20 border-t bg-muted text-right tabular-nums">
                  {totals.orderCount}
                </TableCell>
                <FooterMoney paise={totals.recipeStockCostPaise} muted />
                <FooterMoney paise={totals.kitchenUseCostPaise} muted />
                <FooterMoney paise={totals.grossMarginPaise} />
                <FooterMoney paise={totals.expensesPaise} muted />
                <FooterMoney paise={totals.capitalExpensesPaise} muted />
                <FooterMoney paise={totals.salariesPaise} muted />
                <FooterMoney paise={totals.wastageCostPaise} muted />
                <FooterMoney
                  paise={totals.netProfitPaise}
                  emphasize
                />
                <FooterMoney paise={totals.personalUsePaise} muted />
                <FooterMoney paise={totals.vendorSalesPaise} muted />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-xl border bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground text-xs">Stock used (total)</div>
            <div className="font-medium tabular-nums">
              {formatRupees(totals.stockCostUsedPaise)}
            </div>
            <div className="text-muted-foreground text-xs">
              Recipe {formatRupees(totals.recipeStockCostPaise)} + kitchen{" "}
              {formatRupees(totals.kitchenUseCostPaise)}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground text-xs">Operating cost</div>
            <div className="font-medium tabular-nums">
              {formatRupees(totals.expensesPaise)}
            </div>
            <div className="text-muted-foreground text-xs">Counted in net profit</div>
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground text-xs">Renovation cost</div>
            <div className="font-medium tabular-nums">
              {formatRupees(totals.capitalExpensesPaise)}
            </div>
            <div className="text-muted-foreground text-xs">Tracked, not in P&amp;L</div>
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground text-xs">Net profit</div>
            <div
              className={cn(
                "font-medium tabular-nums",
                netTotalNegative ? "text-rose-600" : "text-emerald-700",
              )}
            >
              {formatRupees(totals.netProfitPaise)}
            </div>
            <div className="text-muted-foreground text-xs">
              Gross − operating cost − salaries
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Net profit = sales − recipe stock − kitchen use − operating cost − salaries.
        Renovation cost, wastage, and personal use are shown but not deducted. Salaries use daily
        rates × attendance for each day.
      </p>
    </div>
  );
}
