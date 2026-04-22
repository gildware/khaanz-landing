"use client";

import useSWR from "swr";
import {
  BanknoteIcon,
  CreditCardIcon,
  LineChartIcon,
  ReceiptIndianRupeeIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPaise } from "@/lib/payroll/payroll-utils";
import { useMenuData } from "@/contexts/menu-data-context";

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
  };
  charts: {
    topSelling: Array<{ key: string; label: string; qty: number }>;
    leastSelling: Array<{ key: string; label: string; qty: number }>;
  };
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DashboardSummary;
};

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#64748b",
];

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
  const pieData = top.slice(0, 6).map((x) => ({ name: x.label, value: x.qty }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Sales, expenses and performance overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Today’s sale"
          value={summary ? formatPaise(summary.kpis.todaySalesPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? `${summary.kpis.todayOrdersCount} orders` : undefined}
          Icon={WalletIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
        />
        <KpiCard
          title="This month sale"
          value={summary ? formatPaise(summary.kpis.monthSalesPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? `${summary.kpis.monthOrdersCount} orders` : undefined}
          Icon={TrendingUpIcon}
          gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-fuchsia-500/15"
        />
        <KpiCard
          title="Today’s expenses"
          value={summary ? formatPaise(summary.kpis.todayExpensesPaise) : isLoading ? "…" : "—"}
          Icon={ReceiptIndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
        />
        <KpiCard
          title="This month expenses"
          value={summary ? formatPaise(summary.kpis.monthExpensesPaise) : isLoading ? "…" : "—"}
          Icon={CreditCardIcon}
          gradientClassName="bg-gradient-to-br from-slate-500/20 via-zinc-500/10 to-stone-500/15"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          title="Gross margin (month)"
          value={summary ? formatPaise(summary.kpis.grossMarginPaise) : isLoading ? "…" : "—"}
          subtitle={
            summary
              ? `Sale − stock used: ${formatPaise(summary.kpis.monthSalesPaise)} − ${formatPaise(summary.kpis.stockCostUsedPaise)}`
              : undefined
          }
          Icon={LineChartIcon}
          gradientClassName="bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-pink-500/15"
        />
        <KpiCard
          title="Salaries (month)"
          value={summary ? formatPaise(summary.kpis.salariesPaise) : isLoading ? "…" : "—"}
          subtitle="From payroll run (if created)."
          Icon={BanknoteIcon}
          gradientClassName="bg-gradient-to-br from-cyan-500/20 via-sky-500/15 to-blue-500/15"
        />
        <KpiCard
          title="Net profit (month)"
          value={summary ? formatPaise(summary.kpis.netProfitPaise) : isLoading ? "…" : "—"}
          subtitle={summary ? "Gross margin − expenses − salaries" : undefined}
          Icon={TrendingUpIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/20 via-lime-500/10 to-amber-500/15"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <p className="font-medium">Most selling items (month)</p>
            <p className="text-muted-foreground text-xs">Top 10 by quantity</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} margin={{ left: 8, right: 8, top: 10, bottom: 40 }}>
                <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="qty" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <p className="font-medium">Less selling items (month)</p>
            <p className="text-muted-foreground text-xs">Bottom 10 by quantity</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={least} margin={{ left: 8, right: 8, top: 10, bottom: 40 }}>
                <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="qty" fill="#64748b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3">
          <p className="font-medium">Top selling share</p>
          <p className="text-muted-foreground text-xs">Pie chart of top items</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip />
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
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
