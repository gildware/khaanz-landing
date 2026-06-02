"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  BarChart3Icon,
  CalendarIcon,
  CreditCardIcon,
  IndianRupeeIcon,
  LineChartIcon,
  ReceiptIndianRupeeIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  PillRankChartCard,
  type PillRankSourceRow,
} from "@/components/admin/pill-rank-chart";
import { ReportInsightsPanel } from "@/components/admin/report-insights-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabParam } from "@/hooks/use-tab-param";
import { formatIstDateInput, istStartOfMonth } from "@/lib/ist-dates";
import type { ReportInsight } from "@/lib/reports/build-insights";
import {
  chartTooltipRupeePair,
  chartYAxisRupeeTick,
  formatRupees,
  paiseToRupeesNumber,
} from "@/lib/payroll/payroll-utils";

type DatePreset = "this_month" | "last_month" | "custom";

type SalesRankRow = { key: string; label: string; qty: number; revenuePaise: number };
type DailySalesRow = { date: string; label: string; salesPaise: number; orderCount: number };
type HourlySalesRow = { hour: number; label: string; salesPaise: number; orderCount: number };
type CategoryExpenseRow = { key: string; label: string; group: string; totalPaise: number };
type BusinessGroupRow = { group: string; totalPaise: number; entryCount: number };
type PersonalKindRow = {
  kind: string;
  label: string;
  totalPaise: number;
  entryCount: number;
};
type DailyOutflowRow = {
  date: string;
  label: string;
  businessPaise: number;
  personalPaise: number;
};
type WastageRow = { key: string; label: string; qtyBase: string; costPaise: number };
type WastageTypeRow = { type: string; label: string; costPaise: number; entryCount: number };
type MenuWastageRow = {
  key: string;
  label: string;
  qty: string;
  costPaise: number;
  entryCount: number;
};
type PaymentRow = { key: string; label: string; salesPaise: number; orderCount: number };

type ReportsSummary = {
  range: { label: string; from: string; toExclusive: string; preset: string };
  kpis: {
    salesPaise: number;
    orderCount: number;
    averageTicketPaise: number;
    expensesPaise: number;
    expenseEntryCount: number;
    salariesPaise: number;
    stockCostUsedPaise: number;
    grossMarginPaise: number;
    netProfitPaise: number;
    wastageCostPaise: number;
    wastageEntryCount: number;
    menuWastageCount: number;
    ingredientOnlyCostPaise: number;
    ingredientOnlyEntryCount: number;
    dishLinkedCostPaise: number;
    personalUsePaise: number;
    personalEntryCount: number;
    vendorSalesPaise: number;
    vendorSalesCount: number;
    vendorPaymentsPaise: number;
  };
  charts: {
    dailySales: DailySalesRow[];
    hourlySales: HourlySalesRow[];
    topSelling: SalesRankRow[];
    leastSelling: SalesRankRow[];
    zeroSales: SalesRankRow[];
    expenseCategories: CategoryExpenseRow[];
    expenseGroups: { group: string; totalPaise: number }[];
    businessGroups: BusinessGroupRow[];
    personalByKind: PersonalKindRow[];
    dailyOutflow: DailyOutflowRow[];
    wastageItems: WastageRow[];
    wastageByType: WastageTypeRow[];
    menuWastageDishes: MenuWastageRow[];
    paymentMethods: PaymentRow[];
  };
  insights: ReportInsight[];
};

const GROUP_LABELS: Record<string, string> = {
  RAW_MATERIAL: "Raw material",
  BILLS: "Bills & utilities",
  OTHER: "Other",
};

const PIE_COLORS = ["#4f46e5", "#7c3aed", "#e11d48", "#ea580c", "#16a34a", "#0891b2", "#ca8a04"];

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ReportsSummary;
};

function KpiCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  Icon: React.ComponentType<{ className?: string }>;
  gradientClassName: string;
  valueClassName?: string;
}) {
  const { title, value, subtitle, Icon, gradientClassName, valueClassName } = props;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={`absolute inset-0 opacity-70 ${gradientClassName}`} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/35 to-background/90" />
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-sm">{title}</p>
            <p
              className={`mt-1 font-semibold text-2xl tabular-nums tracking-tight ${valueClassName ?? ""}`}
            >
              {value}
            </p>
            {subtitle ? (
              <p className="mt-1 text-muted-foreground text-xs">{subtitle}</p>
            ) : null}
          </div>
          <div className="rounded-xl border bg-background/60 p-2 shadow-sm backdrop-blur">
            <Icon className="size-5 text-foreground/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

function salesToPillRows(rows: SalesRankRow[]): PillRankSourceRow[] {
  return rows.map((r) => ({ key: r.key, label: r.label, value: r.qty }));
}

function defaultCustomFrom(): string {
  const start = istStartOfMonth(new Date());
  return formatIstDateInput(start);
}

function defaultCustomTo(): string {
  return formatIstDateInput(new Date());
}

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useTabParam("overview");
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState(defaultCustomFrom);
  const [customTo, setCustomTo] = useState(defaultCustomTo);
  const [appliedPreset, setAppliedPreset] = useState<DatePreset>("this_month");
  const [appliedFrom, setAppliedFrom] = useState(customFrom);
  const [appliedTo, setAppliedTo] = useState(customTo);

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ preset: appliedPreset });
    if (appliedPreset === "custom") {
      params.set("from", appliedFrom);
      params.set("to", appliedTo);
    }
    return `/api/admin/reports/summary?${params.toString()}`;
  }, [appliedPreset, appliedFrom, appliedTo]);

  const { data: summary, isLoading, error, mutate } = useSWR<ReportsSummary>(apiUrl, fetcher);

  const applyRange = useCallback(() => {
    setAppliedPreset(preset);
    if (preset === "custom") {
      setAppliedFrom(customFrom);
      setAppliedTo(customTo);
    }
    void mutate();
  }, [preset, customFrom, customTo, mutate]);

  const dailyChartData = useMemo(
    () =>
      (summary?.charts.dailySales ?? []).map((d) => ({
        ...d,
        sales: paiseToRupeesNumber(d.salesPaise),
      })),
    [summary?.charts.dailySales],
  );

  const hourlyChartData = useMemo(
    () =>
      (summary?.charts.hourlySales ?? []).map((h) => ({
        ...h,
        sales: paiseToRupeesNumber(h.salesPaise),
      })),
    [summary?.charts.hourlySales],
  );

  const expensePieData = useMemo(
    () =>
      (summary?.charts.expenseGroups ?? []).map((g) => ({
        name: GROUP_LABELS[g.group] ?? g.group,
        value: paiseToRupeesNumber(g.totalPaise),
        paise: g.totalPaise,
      })),
    [summary?.charts.expenseGroups],
  );

  const paymentChartData = useMemo(
    () =>
      (summary?.charts.paymentMethods ?? []).map((p) => ({
        name: p.label,
        sales: paiseToRupeesNumber(p.salesPaise),
        orders: p.orderCount,
      })),
    [summary?.charts.paymentMethods],
  );

  const dailyOutflowChartData = useMemo(
    () =>
      (summary?.charts.dailyOutflow ?? []).map((d) => ({
        ...d,
        business: paiseToRupeesNumber(d.businessPaise),
        personal: paiseToRupeesNumber(d.personalPaise),
      })),
    [summary?.charts.dailyOutflow],
  );

  const personalKindChartData = useMemo(
    () =>
      (summary?.charts.personalByKind ?? [])
        .filter((p) => p.totalPaise > 0 || p.entryCount > 0)
        .map((p) => ({
          name: p.label,
          value: paiseToRupeesNumber(p.totalPaise),
          paise: p.totalPaise,
        })),
    [summary?.charts.personalByKind],
  );

  const wastageTypeChartData = useMemo(
    () =>
      (summary?.charts.wastageByType ?? []).map((w) => ({
        name: w.label,
        cost: paiseToRupeesNumber(w.costPaise),
      })),
    [summary?.charts.wastageByType],
  );

  const netProfitNegative = (summary?.kpis.netProfitPaise ?? 0) < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Business performance — sales, expenses, wastage, and menu analytics.
          </p>
        </div>
        {summary ? (
          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Period: </span>
            <span className="font-medium">{summary.range.label}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "this_month" as const, label: "This month" },
                { id: "last_month" as const, label: "Last month" },
                { id: "custom" as const, label: "Custom range" },
              ] as const
            ).map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={preset === id ? "default" : "outline"}
                size="sm"
                onClick={() => setPreset(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {preset === "custom" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="reports-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="reports-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reports-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="reports-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-40"
                />
              </div>
            </>
          ) : null}

          <Button type="button" onClick={applyRange} className="gap-2">
            <CalendarIcon className="size-4" />
            Apply
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
          Failed to load reports. Please try again.
        </div>
      ) : null}

      <ReportInsightsPanel
        insights={summary?.insights ?? []}
        isLoading={isLoading && !summary}
        periodLabel={summary?.range.label}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total sales"
          value={summary ? formatRupees(summary.kpis.salesPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary
              ? `${summary.kpis.orderCount} orders · avg ${formatRupees(summary.kpis.averageTicketPaise)}`
              : undefined
          }
          Icon={WalletIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
        />
        <KpiCard
          title="Gross margin"
          value={summary ? formatRupees(summary.kpis.grossMarginPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary
              ? `Sales − stock used (${formatRupees(summary.kpis.stockCostUsedPaise)})`
              : undefined
          }
          Icon={LineChartIcon}
          gradientClassName="bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-pink-500/15"
        />
        <KpiCard
          title="Net profit"
          value={summary ? formatRupees(summary.kpis.netProfitPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? "After expenses & salaries" : undefined}
          Icon={netProfitNegative ? TrendingDownIcon : TrendingUpIcon}
          gradientClassName={
            netProfitNegative
              ? "bg-gradient-to-br from-rose-500/25 via-red-500/15 to-orange-500/15"
              : "bg-gradient-to-br from-emerald-500/20 via-lime-500/10 to-amber-500/15"
          }
          valueClassName={netProfitNegative ? "text-rose-600" : undefined}
        />
        <KpiCard
          title="Expenses"
          value={summary ? formatRupees(summary.kpis.expensesPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary ? `${summary.kpis.expenseEntryCount} entries recorded` : undefined
          }
          Icon={ReceiptIndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Wastage cost"
          value={summary ? formatRupees(summary.kpis.wastageCostPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary
              ? `${summary.kpis.wastageEntryCount} ingredient entries · ${summary.kpis.menuWastageCount} dish entries`
              : undefined
          }
          Icon={Trash2Icon}
          gradientClassName="bg-gradient-to-br from-rose-500/20 via-red-500/10 to-orange-500/15"
        />
        <KpiCard
          title="Salaries"
          value={summary ? formatRupees(summary.kpis.salariesPaise) : isLoading ? "…" : "—"}
          subtitle="From payroll runs in period"
          Icon={BanknoteIcon}
          gradientClassName="bg-gradient-to-br from-cyan-500/20 via-sky-500/15 to-blue-500/15"
        />
        <KpiCard
          title="Personal use"
          value={summary ? formatRupees(summary.kpis.personalUsePaise) : isLoading ? "…" : "—"}
          subtitle="Owner draw (cash, stock, orders)"
          Icon={IndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-slate-500/20 via-zinc-500/10 to-stone-500/15"
        />
        <KpiCard
          title="Vendor sales"
          value={summary ? formatRupees(summary.kpis.vendorSalesPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary
              ? `${summary.kpis.vendorSalesCount} sales · ${formatRupees(summary.kpis.vendorPaymentsPaise)} collected`
              : undefined
          }
          Icon={CreditCardIcon}
          gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-violet-500/15"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="items">Menu items</TabsTrigger>
          <TabsTrigger value="expenses">Business expenses</TabsTrigger>
          <TabsTrigger value="personal">Personal expenses</TabsTrigger>
          <TabsTrigger value="wastage">Wastage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Daily sales trend</h3>
                <p className="text-muted-foreground text-sm">Revenue by day in selected period</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : dailyChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">No sales data for this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => chartTooltipRupeePair(Number(v) * 100)[0]}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.label ?? ""
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Sales"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Expense breakdown</h3>
                <p className="text-muted-foreground text-sm">By category group</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : expensePieData.length === 0 ? (
                <p className="text-muted-foreground text-sm">No expenses in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {expensePieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]!} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <PillRankChartCard
              title="Best selling items"
              subtitle="Top items by quantity sold"
              topTabLabel="Top sellers"
              bottomTabLabel="Slow movers"
              topRows={salesToPillRows(summary?.charts.topSelling ?? [])}
              bottomRows={salesToPillRows(summary?.charts.leastSelling ?? [])}
              isLoading={isLoading}
              loadingMessage="Loading item sales…"
              emptyMessage="No menu items to display."
              formatValue={(v) => String(v)}
              valueTitle={(r) => `${r.label}: ${r.value} sold`}
              footnoteSuffix="units"
              filterTopPositive
            />
            <div className="flex-1 rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Payment methods</h3>
                <p className="text-muted-foreground text-sm">Sales by payment type</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : paymentChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">No payment data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={paymentChartData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={chartYAxisRupeeTick} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                    <Bar dataKey="sales" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Sales" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Sales by hour</h3>
                <p className="text-muted-foreground text-sm">
                  Peak hours across the selected period
                </p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : hourlyChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hourly data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v, name) =>
                        name === "orders"
                          ? [String(v), "Orders"]
                          : chartTooltipRupeePair(Number(v) * 100)
                      }
                    />
                    <Bar dataKey="sales" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Sales" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3Icon className="size-4 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">Sales summary</h3>
                  <p className="text-muted-foreground text-sm">Key metrics for the period</p>
                </div>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Total revenue</dt>
                  <dd className="font-medium tabular-nums">
                    {summary ? formatRupees(summary.kpis.salesPaise) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Orders</dt>
                  <dd className="font-medium tabular-nums">
                    {summary?.kpis.orderCount ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Average ticket</dt>
                  <dd className="font-medium tabular-nums">
                    {summary ? formatRupees(summary.kpis.averageTicketPaise) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Stock cost used</dt>
                  <dd className="font-medium tabular-nums">
                    {summary ? formatRupees(summary.kpis.stockCostUsedPaise) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Vendor B2B sales</dt>
                  <dd className="font-medium tabular-nums">
                    {summary ? formatRupees(summary.kpis.vendorSalesPaise) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Vendor payments received</dt>
                  <dd className="font-medium tabular-nums">
                    {summary ? formatRupees(summary.kpis.vendorPaymentsPaise) : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <PillRankChartCard
              title="Best selling items"
              subtitle="Highest quantity sold in period"
              topTabLabel="Top sellers"
              bottomTabLabel="Slow movers"
              topRows={salesToPillRows(summary?.charts.topSelling ?? [])}
              bottomRows={salesToPillRows(summary?.charts.leastSelling ?? [])}
              isLoading={isLoading}
              loadingMessage="Loading…"
              emptyMessage="No items."
              formatValue={(v) => String(v)}
              valueTitle={(r) => `${r.label}: ${r.value} sold`}
              footnoteSuffix="units"
              filterTopPositive
            />
            <PillRankChartCard
              title="Zero sales items"
              subtitle="Menu items with no sales — consider promotion or removal"
              topTabLabel="No sales"
              bottomTabLabel="No sales"
              topRows={salesToPillRows(summary?.charts.zeroSales ?? [])}
              bottomRows={salesToPillRows(summary?.charts.zeroSales ?? [])}
              isLoading={isLoading}
              loadingMessage="Loading…"
              emptyMessage="All items had at least one sale."
              formatValue={() => "0"}
              valueTitle={(r) => `${r.label}: no sales`}
              footnoteSuffix=""
            />
          </div>

          {(summary?.charts.topSelling ?? []).length > 0 ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium">Top items by revenue</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Item</th>
                      <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                      <th className="pb-2 font-medium text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(summary?.charts.topSelling ?? [])]
                      .sort((a, b) => b.revenuePaise - a.revenuePaise)
                      .slice(0, 10)
                      .map((row) => (
                        <tr key={row.key} className="border-b last:border-0">
                          <td className="py-2 pr-4">{row.label}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.qty}</td>
                          <td className="py-2 text-right tabular-nums">
                            {formatRupees(row.revenuePaise)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {(["RAW_MATERIAL", "BILLS", "OTHER"] as const).map((group) => {
              const row = (summary?.charts.businessGroups ?? []).find((g) => g.group === group);
              return (
                <KpiCard
                  key={group}
                  title={GROUP_LABELS[group] ?? group}
                  value={
                    summary && row
                      ? formatRupees(row.totalPaise)
                      : isLoading
                        ? "…"
                        : "—"
                  }
                  subtitle={
                    row ? `${row.entryCount} entries` : summary ? "No entries" : undefined
                  }
                  Icon={ReceiptIndianRupeeIcon}
                  gradientClassName="bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-rose-500/15"
                />
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Business expenses by category</h3>
                <p className="text-muted-foreground text-sm">Top spending categories</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : (summary?.charts.expenseCategories ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">No business expenses recorded.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={(summary?.charts.expenseCategories ?? []).map((c) => ({
                      name: c.label,
                      amount: paiseToRupeesNumber(c.totalPaise),
                    }))}
                    layout="vertical"
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={chartYAxisRupeeTick} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                    <Bar dataKey="amount" fill="#ea580c" radius={[0, 4, 4, 0]} name="Amount" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Daily business spend</h3>
                <p className="text-muted-foreground text-sm">Recorded expense entries by day</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : dailyOutflowChartData.every((d) => d.business === 0) ? (
                <p className="text-muted-foreground text-sm">No business expenses in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyOutflowChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => chartTooltipRupeePair(Number(v) * 100)}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.label ?? ""
                      }
                    />
                    <Bar dataKey="business" fill="#ea580c" radius={[4, 4, 0, 0]} name="Business" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {(summary?.charts.expenseCategories ?? []).length > 0 ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium">All business expense categories</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Category</th>
                      <th className="pb-2 pr-4 font-medium">Group</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.charts.expenseCategories ?? []).map((row) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="py-2 pr-4">{row.label}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {GROUP_LABELS[row.group] ?? row.group}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatRupees(row.totalPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="personal" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(summary?.charts.personalByKind ?? []).map((row) => (
              <KpiCard
                key={row.kind}
                title={row.label}
                value={summary ? formatRupees(row.totalPaise) : isLoading ? "…" : "—"}
                subtitle={`${row.entryCount} entries`}
                Icon={IndianRupeeIcon}
                gradientClassName="bg-gradient-to-br from-slate-500/20 via-zinc-500/10 to-stone-500/15"
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Personal use breakdown</h3>
                <p className="text-muted-foreground text-sm">
                  Owner draw — cash, stock, menu items, and other
                </p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : personalKindChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">No personal use in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={personalKindChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {personalKindChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]!} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangleIcon className="size-4 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">Personal expense summary</h3>
                  <p className="text-muted-foreground text-sm">Not included in business expenses</p>
                </div>
              </div>
              <dl className="space-y-3 text-sm">
                {(summary?.charts.personalByKind ?? []).map((row) => (
                  <div key={row.kind} className="flex justify-between border-b pb-2">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="font-medium tabular-nums">
                      {formatRupees(row.totalPaise)}
                      <span className="ml-2 text-muted-foreground font-normal">
                        ({row.entryCount})
                      </span>
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between font-medium">
                  <dt>Total personal use</dt>
                  <dd className="tabular-nums">
                    {summary ? formatRupees(summary.kpis.personalUsePaise) : "—"}
                    {summary ? (
                      <span className="ml-2 text-muted-foreground font-normal">
                        ({summary.kpis.personalEntryCount} entries)
                      </span>
                    ) : null}
                  </dd>
                </div>
                {summary && summary.kpis.salesPaise > 0 ? (
                  <div className="flex justify-between text-muted-foreground">
                    <dt>As % of sales</dt>
                    <dd className="tabular-nums">
                      {Math.round((summary.kpis.personalUsePaise / summary.kpis.salesPaise) * 100)}%
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-4">
              <h3 className="font-medium">Daily personal use</h3>
              <p className="text-muted-foreground text-sm">Owner draw by day in selected period</p>
            </div>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : dailyOutflowChartData.every((d) => d.personal === 0) ? (
              <p className="text-muted-foreground text-sm">No personal use in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyOutflowChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => chartTooltipRupeePair(Number(v) * 100)}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                  />
                  <Bar dataKey="personal" fill="#64748b" radius={[4, 4, 0, 0]} name="Personal" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </TabsContent>

        <TabsContent value="wastage" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Ingredient wastage"
              value={
                summary
                  ? formatRupees(summary.kpis.ingredientOnlyCostPaise)
                  : isLoading
                    ? "…"
                    : "—"
              }
              subtitle={
                summary
                  ? `${summary.kpis.ingredientOnlyEntryCount} direct entries`
                  : undefined
              }
              Icon={Trash2Icon}
              gradientClassName="bg-gradient-to-br from-rose-500/20 via-red-500/10 to-orange-500/15"
            />
            <KpiCard
              title="Dish wastage (ingredient cost)"
              value={
                summary
                  ? formatRupees(summary.kpis.dishLinkedCostPaise)
                  : isLoading
                    ? "…"
                    : "—"
              }
              subtitle={
                summary
                  ? `${summary.kpis.menuWastageCount} prepared dish entries`
                  : undefined
              }
              Icon={Trash2Icon}
              gradientClassName="bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-yellow-500/15"
            />
            <KpiCard
              title="Total wastage cost"
              value={summary ? formatRupees(summary.kpis.wastageCostPaise) : isLoading ? "…" : "—"}
              subtitle={
                summary ? `${summary.kpis.wastageEntryCount} ingredient movements` : undefined
              }
              Icon={Trash2Icon}
              gradientClassName="bg-gradient-to-br from-red-500/25 via-rose-500/15 to-pink-500/15"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Wastage by reason</h3>
                <p className="text-muted-foreground text-sm">Spoilage, prep, overproduction, other</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : wastageTypeChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">No wastage recorded in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={wastageTypeChartData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={chartYAxisRupeeTick} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                    <Bar dataKey="cost" fill="#e11d48" radius={[0, 4, 4, 0]} name="Cost" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Wastage by ingredient</h3>
                <p className="text-muted-foreground text-sm">Estimated cost from avg unit cost</p>
              </div>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : (summary?.charts.wastageItems ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">No wastage recorded in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={(summary?.charts.wastageItems ?? []).map((w) => ({
                      name: w.label,
                      cost: paiseToRupeesNumber(w.costPaise),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                    <Bar dataKey="cost" fill="#e11d48" radius={[4, 4, 0, 0]} name="Cost" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="font-medium">Wastage summary</h3>
                <p className="text-muted-foreground text-sm">Impact on profitability</p>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Total wastage cost</dt>
                  <dd className="font-medium tabular-nums text-rose-600">
                    {summary ? formatRupees(summary.kpis.wastageCostPaise) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Ingredient wastage entries</dt>
                  <dd className="font-medium tabular-nums">
                    {summary?.kpis.wastageEntryCount ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">Prepared dish wastage</dt>
                  <dd className="font-medium tabular-nums">
                    {summary?.kpis.menuWastageCount ?? "—"} entries
                  </dd>
                </div>
                {summary && summary.kpis.salesPaise > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Wastage as % of sales</dt>
                    <dd className="font-medium tabular-nums">
                      {Math.round((summary.kpis.wastageCostPaise / summary.kpis.salesPaise) * 100)}%
                    </dd>
                  </div>
                ) : null}
              </dl>

              {(summary?.charts.wastageItems ?? []).length > 0 ? (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Item</th>
                        <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.charts.wastageItems ?? []).map((row) => (
                        <tr key={row.key} className="border-b last:border-0">
                          <td className="py-2 pr-4">{row.label}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.qtyBase}</td>
                          <td className="py-2 text-right tabular-nums">
                            {formatRupees(row.costPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

          {(summary?.charts.menuWastageDishes ?? []).length > 0 ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium">Prepared dish wastage</h3>
              <p className="mb-4 text-muted-foreground text-sm">
                Menu items wasted after prep — cost from recipe ingredients
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Dish</th>
                      <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                      <th className="pb-2 pr-4 font-medium text-right">Entries</th>
                      <th className="pb-2 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.charts.menuWastageDishes ?? []).map((row) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="py-2 pr-4">{row.label}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.qty}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.entryCount}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatRupees(row.costPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {(summary?.charts.wastageByType ?? []).length > 0 ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium">Wastage by reason (detail)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Reason</th>
                      <th className="pb-2 pr-4 font-medium text-right">Entries</th>
                      <th className="pb-2 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.charts.wastageByType ?? []).map((row) => (
                      <tr key={row.type} className="border-b last:border-0">
                        <td className="py-2 pr-4">{row.label}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.entryCount}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatRupees(row.costPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
