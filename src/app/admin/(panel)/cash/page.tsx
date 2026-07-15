"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

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
import { formatIstDateInput, istMonthKey } from "@/lib/ist-dates";
import {
  formatRupees,
  paiseToRupeesInput,
  rupeesToPaise,
} from "@/lib/payroll/payroll-utils";
import { cn } from "@/lib/utils";

type DayRow = {
  date: string;
  label: string;
  isFuture: boolean;
  beforeOpening: boolean;
  openingPaise: number;
  salesCollectedPaise: number;
  vendorCollectionsPaise: number;
  expensesPaise: number;
  personalCashPaise: number;
  supplierPaymentsPaise: number;
  advancesPaise: number;
  adjustmentsPaise: number;
  netChangePaise: number;
  closingPaise: number;
};

type CashDailyResponse = {
  monthKey: string;
  label: string;
  today: string;
  monthOpeningPaise: number;
  balanceTodayPaise: number;
  opening: {
    openingBalancePaise: number;
    openingEffectiveDate: string;
    note: string;
  };
  days: DayRow[];
  totals: {
    salesCollectedPaise: number;
    vendorCollectionsPaise: number;
    expensesPaise: number;
    personalCashPaise: number;
    supplierPaymentsPaise: number;
    advancesPaise: number;
    adjustmentsPaise: number;
    netChangePaise: number;
    closingPaise: number;
  };
};

type Adjustment = {
  id: string;
  occurredAt: string;
  amountPaise: number;
  note: string;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CashDailyResponse;
};

const adjustmentsFetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { adjustments: Adjustment[] };
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
  blank?: boolean;
}) {
  const { paise, muted, emphasize, blank } = props;
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums whitespace-nowrap",
        muted && "text-muted-foreground",
        emphasize && paise < 0 && "font-medium text-rose-600",
        emphasize && paise > 0 && "font-medium text-emerald-700",
      )}
    >
      {blank ? "—" : formatRupees(paise)}
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

function rupeesToPaiseSigned(rupees: string): number | null {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100);
}

export default function AdminCashPage() {
  const thisMonth = istMonthKey(new Date());
  const today = formatIstDateInput(new Date());
  const [monthKey, setMonthKey] = useState(thisMonth);
  const [appliedMonth, setAppliedMonth] = useState(thisMonth);

  const [openingAmount, setOpeningAmount] = useState("");
  const [openingDate, setOpeningDate] = useState(today);
  const [openingNote, setOpeningNote] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingMsg, setOpeningMsg] = useState<string | null>(null);

  const [adjAmount, setAdjAmount] = useState("");
  const [adjDate, setAdjDate] = useState(today);
  const [adjNote, setAdjNote] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjMsg, setAdjMsg] = useState<string | null>(null);

  const apiUrl = useMemo(
    () => `/api/admin/cash/daily?month=${encodeURIComponent(appliedMonth)}`,
    [appliedMonth],
  );
  const adjUrl = useMemo(
    () =>
      `/api/admin/cash/adjustments?from=${encodeURIComponent(`${appliedMonth}-01`)}&to=${encodeURIComponent(
        shiftMonthKey(appliedMonth, 1) + "-01",
      )}`,
    [appliedMonth],
  );

  const { data, isLoading, error, mutate } = useSWR<CashDailyResponse>(apiUrl, fetcher);
  const {
    data: adjData,
    mutate: mutateAdj,
  } = useSWR<{ adjustments: Adjustment[] }>(adjUrl, adjustmentsFetcher);

  // Sync opening form when server opening values change.
  useEffect(() => {
    if (!data?.opening) return;
    setOpeningAmount(paiseToRupeesInput(data.opening.openingBalancePaise));
    setOpeningDate(data.opening.openingEffectiveDate);
    setOpeningNote(data.opening.note);
  }, [
    data?.opening?.openingBalancePaise,
    data?.opening?.openingEffectiveDate,
    data?.opening?.note,
  ]);

  const applyMonth = useCallback(
    (next: string) => {
      setMonthKey(next);
      setAppliedMonth(next);
      void mutate();
    },
    [mutate],
  );

  const saveOpening = async () => {
    setOpeningBusy(true);
    setOpeningMsg(null);
    try {
      const paise = rupeesToPaise(openingAmount === "" ? "0" : openingAmount);
      const res = await fetch("/api/admin/cash/opening", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingBalancePaise: paise,
          openingEffectiveDate: openingDate,
          note: openingNote,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to save");
      }
      setOpeningMsg("Opening balance saved.");
      await mutate();
    } catch (e) {
      setOpeningMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setOpeningBusy(false);
    }
  };

  const saveAdjustment = async () => {
    setAdjBusy(true);
    setAdjMsg(null);
    try {
      const paise = rupeesToPaiseSigned(adjAmount);
      if (paise == null) {
        throw new Error("Enter a non-zero amount (use negative for money out)");
      }
      const res = await fetch("/api/admin/cash/adjustments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPaise: paise,
          occurredDate: adjDate,
          note: adjNote,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to save");
      }
      setAdjAmount("");
      setAdjNote("");
      setAdjMsg("Adjustment added.");
      await Promise.all([mutate(), mutateAdj()]);
    } catch (e) {
      setAdjMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setAdjBusy(false);
    }
  };

  const deleteAdjustment = async (id: string) => {
    const res = await fetch(`/api/admin/cash/adjustments/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) return;
    await Promise.all([mutate(), mutateAdj()]);
  };

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Money available</h1>
          <p className="text-muted-foreground text-sm">
            Cash in hand and bank/UPI as one pool — auto-updated from paid sales,
            vendor collections, expenses, personal cash, supplier payments, and advances.
          </p>
        </div>
        {data ? (
          <div className="rounded-xl border bg-muted/40 px-4 py-3 text-right">
            <p className="text-muted-foreground text-xs">Available today</p>
            <p
              className={cn(
                "font-semibold text-2xl tabular-nums",
                data.balanceTodayPaise < 0 ? "text-rose-600" : "text-emerald-700",
              )}
            >
              {formatRupees(data.balanceTodayPaise)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h2 className="font-medium text-sm">Opening balance</h2>
          <p className="text-muted-foreground text-xs">
            Set once (or update) — movements before this date are ignored.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cash-opening-amount" className="text-xs">
                Amount (₹)
              </Label>
              <Input
                id="cash-opening-amount"
                type="number"
                min={0}
                step="0.01"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-opening-date" className="text-xs">
                Effective from
              </Label>
              <Input
                id="cash-opening-date"
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="cash-opening-note" className="text-xs">
                Note
              </Label>
              <Input
                id="cash-opening-note"
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <Button type="button" onClick={() => void saveOpening()} disabled={openingBusy}>
              Save opening
            </Button>
          </div>
          {openingMsg ? (
            <p className="text-muted-foreground text-xs">{openingMsg}</p>
          ) : null}
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h2 className="font-medium text-sm">Manual adjustment</h2>
          <p className="text-muted-foreground text-xs">
            Positive = money in, negative = money out (bank deposit, count diff, etc.).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cash-adj-amount" className="text-xs">
                Amount (₹)
              </Label>
              <Input
                id="cash-adj-amount"
                type="number"
                step="0.01"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                className="w-36"
                placeholder="e.g. -500"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-adj-date" className="text-xs">
                Date
              </Label>
              <Input
                id="cash-adj-date"
                type="date"
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="cash-adj-note" className="text-xs">
                Note
              </Label>
              <Input
                id="cash-adj-note"
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <Button
              type="button"
              onClick={() => void saveAdjustment()}
              disabled={adjBusy}
              className="gap-2"
            >
              <PlusIcon className="size-4" />
              Add
            </Button>
          </div>
          {adjMsg ? <p className="text-muted-foreground text-xs">{adjMsg}</p> : null}

          {(adjData?.adjustments.length ?? 0) > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {adjData!.adjustments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatIstDateInput(new Date(a.occurredAt))}
                    {a.note ? ` · ${a.note}` : ""}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums font-medium",
                      a.amountPaise < 0 ? "text-rose-600" : "text-emerald-700",
                    )}
                  >
                    {formatRupees(a.amountPaise)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="Delete adjustment"
                    onClick={() => void deleteAdjustment(a.id)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="cash-month" className="text-xs">
              Month
            </Label>
            <Input
              id="cash-month"
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
          {data ? (
            <p className="text-muted-foreground text-sm sm:ml-auto">
              {data.label} · opening {formatRupees(data.monthOpeningPaise)}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm">Failed to load money table.</p>
      ) : null}
      {isLoading && !data ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}

      {data ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">Date</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Sales in</TableHead>
                <TableHead className="text-right">Vendor in</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Personal</TableHead>
                <TableHead className="text-right">Supplier</TableHead>
                <TableHead className="text-right">Advances</TableHead>
                <TableHead className="text-right">Adjust</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.days.map((row) => {
                const blank = row.beforeOpening || row.isFuture;
                return (
                  <TableRow
                    key={row.date}
                    className={cn(
                      row.date === data.today && "bg-primary/5",
                      row.isFuture && "opacity-50",
                    )}
                  >
                    <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap font-medium">
                      {row.label}
                    </TableCell>
                    <MoneyCell paise={row.openingPaise} blank={row.beforeOpening} muted={blank} />
                    <MoneyCell paise={row.salesCollectedPaise} blank={blank} muted />
                    <MoneyCell paise={row.vendorCollectionsPaise} blank={blank} muted />
                    <MoneyCell paise={row.expensesPaise} blank={blank} muted />
                    <MoneyCell paise={row.personalCashPaise} blank={blank} muted />
                    <MoneyCell paise={row.supplierPaymentsPaise} blank={blank} muted />
                    <MoneyCell paise={row.advancesPaise} blank={blank} muted />
                    <MoneyCell
                      paise={row.adjustmentsPaise}
                      blank={blank}
                      emphasize={!blank && row.adjustmentsPaise !== 0}
                    />
                    <MoneyCell
                      paise={row.netChangePaise}
                      blank={blank}
                      emphasize={!blank}
                    />
                    <MoneyCell
                      paise={row.closingPaise}
                      blank={row.beforeOpening}
                      emphasize={!row.beforeOpening && !row.isFuture}
                    />
                  </TableRow>
                );
              })}
            </TableBody>
            {totals ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky bottom-0 left-0 z-30 border-t bg-muted font-medium">
                    Month total
                  </TableCell>
                  <TableCell className="sticky bottom-0 z-20 border-t bg-muted" />
                  <FooterMoney paise={totals.salesCollectedPaise} muted />
                  <FooterMoney paise={totals.vendorCollectionsPaise} muted />
                  <FooterMoney paise={totals.expensesPaise} muted />
                  <FooterMoney paise={totals.personalCashPaise} muted />
                  <FooterMoney paise={totals.supplierPaymentsPaise} muted />
                  <FooterMoney paise={totals.advancesPaise} muted />
                  <FooterMoney paise={totals.adjustmentsPaise} emphasize />
                  <FooterMoney paise={totals.netChangePaise} emphasize />
                  <FooterMoney paise={totals.closingPaise} emphasize />
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      ) : null}
    </div>
  );
}
