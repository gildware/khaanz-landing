"use client";

import useSWR from "swr";
import {
  AlertCircleIcon,
  BanknoteIcon,
  CreditCardIcon,
  HandshakeIcon,
  IndianRupeeIcon,
  LineChartIcon,
  ReceiptIndianRupeeIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import {
  PillRankChartCard,
  type PillRankSourceRow,
} from "@/components/admin/pill-rank-chart";
import { formatRupees } from "@/lib/payroll/payroll-utils";
import { useMenuData } from "@/contexts/menu-data-context";

type SalesRankRow = { key: string; label: string; qty: number };
type StockValueRankRow = { key: string; label: string; valuePaise: number };
type VendorValueRankRow = { key: string; label: string; valuePaise: number };

type DashboardSummary = {
  kpis: {
    todaySalesPaise: number;
    monthSalesPaise: number;
    todayExpensesPaise: number;
    monthExpensesPaise: number;
    salariesPaise: number;
    stockCostUsedPaise: number;
    grossMarginPaise: number;
    netProfitPaise: number;
    todayOrdersCount: number;
    monthOrdersCount: number;
    todayVendorSalesPaise: number;
    todayVendorSalesCount: number;
    monthVendorSalesPaise: number;
    monthVendorSalesCount: number;
    vendorReceivablePaise: number;
    overdueVendorSalesCount: number;
    monthVendorPaymentsPaise: number;
  };
  charts: {
    topSelling: SalesRankRow[];
    leastSelling: SalesRankRow[];
    topStockValue: StockValueRankRow[];
    lowestStockValue: StockValueRankRow[];
    topVendorsBySales: VendorValueRankRow[];
    bottomVendorsBySales: VendorValueRankRow[];
    topVendorItemsByQty: SalesRankRow[];
    bottomVendorItemsByQty: SalesRankRow[];
  };
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DashboardSummary;
};

function salesToPillRows(rows: SalesRankRow[]): PillRankSourceRow[] {
  return rows.map((r) => ({ key: r.key, label: r.label, value: r.qty }));
}

function stockToPillRows(rows: StockValueRankRow[]): PillRankSourceRow[] {
  return rows.map((r) => ({ key: r.key, label: r.label, value: r.valuePaise }));
}

function vendorValueToPillRows(rows: VendorValueRankRow[]): PillRankSourceRow[] {
  return rows.map((r) => ({ key: r.key, label: r.label, value: r.valuePaise }));
}

function KpiCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  Icon: React.ComponentType<{ className?: string }>;
  gradientClassName: string;
}) {
  const { title, value, subtitle, Icon, gradientClassName } = props;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={`absolute inset-0 opacity-70 ${gradientClassName}`} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/35 to-background/90" />
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-sm">{title}</p>
            <p className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">
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

export default function AdminDashboardPage() {
  const { data } = useMenuData();
  const { data: summary, isLoading } = useSWR<DashboardSummary>(
    "/api/admin/dashboard/summary",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const categories = data?.categories ?? [];
  const items = data?.items ?? [];
  const addons = data?.globalAddons ?? [];
  const combos = data?.combos ?? [];

  const top = summary?.charts.topSelling ?? [];
  const least = summary?.charts.leastSelling ?? [];
  const topStock = summary?.charts.topStockValue ?? [];
  const lowestStock = summary?.charts.lowestStockValue ?? [];
  const topVendors = summary?.charts.topVendorsBySales ?? [];
  const bottomVendors = summary?.charts.bottomVendorsBySales ?? [];
  const topVendorItems = summary?.charts.topVendorItemsByQty ?? [];
  const bottomVendorItems = summary?.charts.bottomVendorItemsByQty ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Sales, expenses, vendor sales, and performance overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Today’s sale"
          value={summary ? formatRupees(summary.kpis.todaySalesPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? `${summary.kpis.todayOrdersCount} orders` : undefined}
          Icon={WalletIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
        />
        <KpiCard
          title="This month sale"
          value={summary ? formatRupees(summary.kpis.monthSalesPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? `${summary.kpis.monthOrdersCount} orders` : undefined}
          Icon={TrendingUpIcon}
          gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-fuchsia-500/15"
        />
        <KpiCard
          title="Today’s expenses"
          value={summary ? formatRupees(summary.kpis.todayExpensesPaise) : isLoading ? "…" : "—"}
          Icon={ReceiptIndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
        />
        <KpiCard
          title="This month expenses"
          value={summary ? formatRupees(summary.kpis.monthExpensesPaise) : isLoading ? "…" : "—"}
          Icon={CreditCardIcon}
          gradientClassName="bg-gradient-to-br from-slate-500/20 via-zinc-500/10 to-stone-500/15"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          title="Gross margin (month)"
          value={summary ? formatRupees(summary.kpis.grossMarginPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary
              ? `Sale − stock used: ${formatRupees(summary.kpis.monthSalesPaise)} − ${formatRupees(summary.kpis.stockCostUsedPaise)}`
              : undefined
          }
          Icon={LineChartIcon}
          gradientClassName="bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-pink-500/15"
        />
        <KpiCard
          title="Salaries (month)"
          value={summary ? formatRupees(summary.kpis.salariesPaise) : isLoading ? "…" : "—"}
          subtitle="From payroll run (if created)."
          Icon={BanknoteIcon}
          gradientClassName="bg-gradient-to-br from-cyan-500/20 via-sky-500/15 to-blue-500/15"
        />
        <KpiCard
          title="Net profit (month)"
          value={summary ? formatRupees(summary.kpis.netProfitPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? "Gross margin − expenses − salaries" : undefined}
          Icon={TrendingUpIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/20 via-lime-500/10 to-amber-500/15"
        />
      </div>

      <div>
        <h2 className="font-medium text-base">Vendor sales</h2>
        <p className="text-muted-foreground text-sm">
          B2B sales to vendors, receivables, and payments this month.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Today’s vendor sales"
          value={
            summary
              ? formatRupees(summary.kpis.todayVendorSalesPaise)
              : isLoading
                ? "…"
                : "—"
          }
          subtitle={
            summary ? `${summary.kpis.todayVendorSalesCount} sales posted` : undefined
          }
          Icon={HandshakeIcon}
          gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-violet-500/15"
        />
        <KpiCard
          title="This month vendor sales"
          value={
            summary
              ? formatRupees(summary.kpis.monthVendorSalesPaise)
              : isLoading
                ? "…"
                : "—"
          }
          subtitle={
            summary ? `${summary.kpis.monthVendorSalesCount} sales posted` : undefined
          }
          Icon={TrendingUpIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-cyan-500/15"
        />
        <KpiCard
          title="Vendor receivable"
          value={
            summary
              ? formatRupees(summary.kpis.vendorReceivablePaise)
              : isLoading
                ? "…"
                : "—"
          }
          subtitle="Outstanding credit from vendors"
          Icon={IndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
        />
        <KpiCard
          title="Overdue / payments"
          value={
            summary
              ? `${summary.kpis.overdueVendorSalesCount} overdue`
              : isLoading
                ? "…"
                : "—"
          }
          subtitle={
            summary
              ? `${formatRupees(summary.kpis.monthVendorPaymentsPaise)} collected this month`
              : undefined
          }
          Icon={AlertCircleIcon}
          gradientClassName="bg-gradient-to-br from-rose-500/20 via-red-500/10 to-orange-500/15"
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <PillRankChartCard
          title="Item sales this month"
          subtitle="Top 5 by quantity — name on each bar."
          topTabLabel="Top movers"
          bottomTabLabel="Slow movers"
          topRows={salesToPillRows(top)}
          bottomRows={salesToPillRows(least)}
          isLoading={isLoading}
          loadingMessage="Loading sales data…"
          emptyMessage="No menu items to display."
          formatValue={(v) => String(v)}
          valueTitle={(r) => `${r.label}: ${r.value} sold`}
          footnoteSuffix="units"
          filterTopPositive
        />
        <PillRankChartCard
          title="Top items by stock value"
          subtitle="Top 5 on-hand value (qty × unit cost)."
          topTabLabel="Top value"
          bottomTabLabel="Low value"
          topRows={stockToPillRows(topStock)}
          bottomRows={stockToPillRows(lowestStock)}
          isLoading={isLoading}
          loadingMessage="Loading stock value…"
          emptyMessage="No stock value to chart."
          formatValue={(v) => formatRupees(v)}
          valueTitle={(r) => `${r.label}: ${formatRupees(r.value)}`}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <PillRankChartCard
          title="Top vendors this month"
          subtitle="Top 5 by vendor sale amount."
          topTabLabel="Top vendors"
          bottomTabLabel="Smallest vendors"
          topRows={vendorValueToPillRows(topVendors)}
          bottomRows={vendorValueToPillRows(bottomVendors)}
          isLoading={isLoading}
          loadingMessage="Loading vendor sales…"
          emptyMessage="No vendor sales this month."
          formatValue={(v) => formatRupees(v)}
          valueTitle={(r) => `${r.label}: ${formatRupees(r.value)}`}
          filterTopPositive
        />
        <PillRankChartCard
          title="Items sold to vendors"
          subtitle="Top 5 menu items by quantity this month."
          topTabLabel="Top items"
          bottomTabLabel="Slow items"
          topRows={salesToPillRows(topVendorItems)}
          bottomRows={salesToPillRows(bottomVendorItems)}
          isLoading={isLoading}
          loadingMessage="Loading vendor items…"
          emptyMessage="No items sold to vendors this month."
          formatValue={(v) => String(v)}
          valueTitle={(r) => `${r.label}: ${r.value} sold`}
          footnoteSuffix="units"
          filterTopPositive
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Categories</p>
          <p className="font-semibold text-3xl tabular-nums">
            {categories.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Menu items</p>
          <p className="font-semibold text-3xl tabular-nums">{items.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Combos</p>
          <p className="font-semibold text-3xl tabular-nums">{combos.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-muted-foreground text-sm">Global add-ons</p>
          <p className="font-semibold text-3xl tabular-nums">{addons.length}</p>
        </div>
      </div>
    </div>
  );
}
