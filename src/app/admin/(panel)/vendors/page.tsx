"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  HandshakeIcon,
  IndianRupeeIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabParam } from "@/hooks/use-tab-param";
import {
  DataTableToolbar,
  type ActiveFilter,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import {
  chartTooltipRupeePair,
  chartYAxisRupeeTick,
  formatRupees,
  paiseToRupeesNumber,
  rupeesToPaise,
} from "@/lib/payroll/payroll-utils";

function cx(...x: Array<string | false | null | undefined>): string {
  return x.filter(Boolean).join(" ");
}

const PAYMENT_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "CASH", label: "CASH" },
  { value: "CREDIT", label: "CREDIT" },
];

const VENDOR_PAYMENT_METHOD_OPTIONS: SearchableSelectOption[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
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

function StockActionCard(props: {
  title: string;
  description: string;
  whenToUse: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  const { title, description, whenToUse, children, action } = props;
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 space-y-1.5">
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs leading-relaxed">
          <span className="font-medium text-foreground">When to use: </span>
          {whenToUse}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
      <div className="mt-4 border-t pt-4">{action}</div>
    </div>
  );
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof json === "object" && json && "error" in json && json.error
        ? String(json.error)
        : res.statusText,
    );
  }
  return json as T;
}

type Vendor = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  defaultCreditDays: number | null;
  active: boolean;
};

type Summary = {
  vendorBalances: { vendorId: string; vendorName: string; balancePaise: number }[];
  overdueSales: {
    id: string;
    vendorId: string;
    vendorName: string;
    totalPaise: number;
    dueAt: string | null;
    soldAt: string;
  }[];
};

type SaleRow = {
  id: string;
  vendorId: string;
  vendorName: string;
  soldAt: string;
  paymentType: string;
  dueAt: string | null;
  totalPaise: number;
  notes: string;
  lineCount: number;
};

type MenuPayload = {
  items: { id: string; name: string; variations: { id: string; name: string }[] }[];
};

const emptyVendorForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  defaultCreditDays: "",
};

export default function AdminVendorsPage() {
  const [activeTab, setActiveTab] = useTabParam("overview");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [sellableMenuItemIds, setSellableMenuItemIds] = useState<string[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const loadVendors = useCallback(async () => {
    const r = await adminFetch<{ vendors: Vendor[] }>("/api/admin/vendors");
    setVendors(r.vendors);
  }, []);

  const loadMenu = useCallback(async () => {
    const r = await adminFetch<MenuPayload>("/api/menu");
    setMenu(r);
  }, []);

  const loadSellable = useCallback(async () => {
    const r = await adminFetch<{ items: { menuItemId: string; name: string }[] }>(
      "/api/admin/vendors/items",
    );
    setSellableMenuItemIds(r.items.map((x) => x.menuItemId));
  }, []);

  const loadSummary = useCallback(async () => {
    const r = await adminFetch<Summary>("/api/admin/vendors/reports/summary");
    setSummary(r);
  }, []);

  const loadSales = useCallback(async () => {
    const r = await adminFetch<{
      sales: {
        id: string;
        vendorId: string;
        vendorName: string;
        soldAt: string;
        paymentType: string;
        dueAt: string | null;
        totalPaise: number;
        notes: string;
        lines: unknown[];
      }[];
    }>("/api/admin/vendors/sales");
    setSales(
      r.sales.map((s) => ({
        id: s.id,
        vendorId: s.vendorId,
        vendorName: s.vendorName,
        soldAt: s.soldAt,
        paymentType: s.paymentType,
        dueAt: s.dueAt,
        totalPaise: s.totalPaise,
        notes: s.notes,
        lineCount: s.lines.length,
      })),
    );
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          loadVendors(),
          loadMenu(),
          loadSellable(),
          loadSummary(),
          loadSales(),
        ]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load vendors");
      }
    })();
  }, [loadMenu, loadSellable, loadSummary, loadSales, loadVendors]);

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);

  const openAddVendor = () => {
    setVendorForm(emptyVendorForm);
    setVendorDialogOpen(true);
  };

  const createVendor = async () => {
    try {
      await adminFetch("/api/admin/vendors", {
        method: "POST",
        body: JSON.stringify({
          name: vendorForm.name,
          phone: vendorForm.phone,
          email: vendorForm.email,
          address: vendorForm.address,
          defaultCreditDays: vendorForm.defaultCreditDays.trim()
            ? Number(vendorForm.defaultCreditDays)
            : null,
        }),
      });
      toast.success("Vendor created");
      setVendorDialogOpen(false);
      setVendorForm(emptyVendorForm);
      await Promise.all([loadVendors(), loadSummary()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [sale, setSale] = useState({
    vendorId: "",
    paymentType: "CREDIT",
    soldAt: new Date().toISOString().slice(0, 16),
    creditDays: "",
    notes: "",
  });

  type SaleLineDraft = {
    id: string;
    menuItemId: string;
    variationId: string;
    quantity: string;
    rateRupees: string;
  };
  const [saleLines, setSaleLines] = useState<SaleLineDraft[]>([
    {
      id: crypto.randomUUID(),
      menuItemId: "",
      variationId: "",
      quantity: "1",
      rateRupees: "",
    },
  ]);

  const openNewSale = () => {
    setSale({
      vendorId: "",
      paymentType: "CREDIT",
      soldAt: new Date().toISOString().slice(0, 16),
      creditDays: "",
      notes: "",
    });
    setSaleLines([
      {
        id: crypto.randomUUID(),
        menuItemId: "",
        variationId: "",
        quantity: "1",
        rateRupees: "",
      },
    ]);
    setSaleDialogOpen(true);
  };

  const saleTotalPaise = useMemo(() => {
    let sum = 0;
    for (const ln of saleLines) {
      const qty = Number(ln.quantity);
      const ratePaise = rupeesToPaise(ln.rateRupees);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      sum += Math.round(qty * ratePaise);
    }
    return sum;
  }, [saleLines]);

  const submitSale = async () => {
    try {
      await adminFetch("/api/admin/vendors/sales", {
        method: "POST",
        body: JSON.stringify({
          vendorId: sale.vendorId,
          paymentType: sale.paymentType,
          soldAt: new Date(sale.soldAt).toISOString(),
          creditDays:
            sale.paymentType === "CREDIT" && sale.creditDays.trim()
              ? Number(sale.creditDays)
              : undefined,
          notes: sale.notes,
          lines: saleLines.map((l) => ({
            menuItemId: l.menuItemId,
            variationId: l.variationId,
            quantity: l.quantity,
            ratePaisePerUnit: rupeesToPaise(l.rateRupees),
          })),
        }),
      });
      toast.success("Vendor sale recorded (stock reduced)");
      setSaleDialogOpen(false);
      await Promise.all([loadSummary(), loadSales()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sale failed");
    }
  };

  const sellableMenuItems = useMemo(() => {
    const allowed = new Set(sellableMenuItemIds);
    return (menu?.items ?? []).filter((it) => allowed.has(it.id));
  }, [menu?.items, sellableMenuItemIds]);

  const toggleSellable = (menuItemId: string) => {
    setSellableMenuItemIds((prev) =>
      prev.includes(menuItemId) ? prev.filter((x) => x !== menuItemId) : [...prev, menuItemId],
    );
  };

  const saveSellable = async () => {
    try {
      await adminFetch("/api/admin/vendors/items", {
        method: "POST",
        body: JSON.stringify({ menuItemIds: sellableMenuItemIds }),
      });
      toast.success("Sellable items updated");
      await loadSellable();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const [payment, setPayment] = useState({
    vendorId: "",
    amountRupees: "",
    method: "upi",
    reference: "",
    note: "",
    paidAt: "",
  });

  const submitPayment = async () => {
    try {
      await adminFetch("/api/admin/vendors/payments", {
        method: "POST",
        body: JSON.stringify({
          vendorId: payment.vendorId,
          amountPaise: rupeesToPaise(payment.amountRupees),
          method: payment.method,
          reference: payment.reference,
          note: payment.note,
          paidAt: payment.paidAt ? new Date(payment.paidAt).toISOString() : undefined,
        }),
      });
      toast.success("Payment recorded");
      setPayment({
        vendorId: "",
        amountRupees: "",
        method: "upi",
        reference: "",
        note: "",
        paidAt: "",
      });
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    }
  };

  const totalReceivablePaise = useMemo(
    () =>
      (summary?.vendorBalances ?? []).reduce(
        (sum, x) => sum + (x.balancePaise > 0 ? x.balancePaise : 0),
        0,
      ),
    [summary?.vendorBalances],
  );

  const vendorReceivablesChartData = useMemo(
    () =>
      (summary?.vendorBalances ?? [])
        .filter((x) => x.balancePaise > 0)
        .slice(0, 8)
        .map((x) => ({
          label: x.vendorName || x.vendorId,
          amountRupees: paiseToRupeesNumber(x.balancePaise),
        })),
    [summary?.vendorBalances],
  );

  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorStatusFilter, setVendorStatusFilter] = useState<ActiveFilter>("all");
  const [vendorSort, setVendorSort] = useState("name-asc");

  const [sellableSearch, setSellableSearch] = useState("");
  const [sellableFilter, setSellableFilter] = useState<"all" | "sellable" | "not">("all");
  const [sellableSort, setSellableSort] = useState("name-asc");

  const [saleSearch, setSaleSearch] = useState("");
  const [salePaymentFilter, setSalePaymentFilter] = useState("all");
  const [saleVendorFilter, setSaleVendorFilter] = useState("all");
  const [saleSort, setSaleSort] = useState("date-desc");

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    let list = vendors.filter((v) => {
      if (vendorStatusFilter === "active" && !v.active) return false;
      if (vendorStatusFilter === "inactive" && v.active) return false;
      if (!q) return true;
      const hay = `${v.name} ${v.phone} ${v.email} ${v.address}`.toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      if (vendorSort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [vendors, vendorSearch, vendorStatusFilter, vendorSort]);

  const filteredSellableItems = useMemo(() => {
    const q = sellableSearch.trim().toLowerCase();
    let list = (menu?.items ?? []).filter((it) => {
      const isSellable = sellableMenuItemIds.includes(it.id);
      if (sellableFilter === "sellable" && !isSellable) return false;
      if (sellableFilter === "not" && isSellable) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sellableSort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [menu?.items, sellableMenuItemIds, sellableSearch, sellableFilter, sellableSort]);

  const filteredSales = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    let list = sales.filter((s) => {
      if (salePaymentFilter !== "all" && s.paymentType !== salePaymentFilter) return false;
      if (saleVendorFilter !== "all" && s.vendorId !== saleVendorFilter) return false;
      if (!q) return true;
      const hay = `${s.vendorName} ${s.paymentType} ${s.notes}`.toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      switch (saleSort) {
        case "date-asc":
          return a.soldAt.localeCompare(b.soldAt);
        case "amount-asc":
          return a.totalPaise - b.totalPaise;
        case "amount-desc":
          return b.totalPaise - a.totalPaise;
        case "vendor-asc":
          return (
            a.vendorName.localeCompare(b.vendorName) || b.soldAt.localeCompare(a.soldAt)
          );
        default:
          return b.soldAt.localeCompare(a.soldAt);
      }
    });
    return list;
  }, [sales, saleSearch, salePaymentFilter, saleVendorFilter, saleSort]);

  const activeVendorCount = vendors.filter((v) => v.active).length;
  const outstandingVendorCount = (summary?.vendorBalances ?? []).filter(
    (x) => x.balancePaise > 0,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Vendors</h1>
        <p className="text-muted-foreground text-sm">
          Manage vendor accounts, post vendor sales (reduces stock), and track payments/due.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="overview" className="data-[state=active]:font-semibold">
            Overview
          </TabsTrigger>
          <TabsTrigger value="vendors" className="data-[state=active]:font-semibold">
            Vendors
          </TabsTrigger>
          <TabsTrigger value="sellable" className="data-[state=active]:font-semibold">
            Items to sell
          </TabsTrigger>
          <TabsTrigger value="sales" className="data-[state=active]:font-semibold">
            Vendor sales
          </TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:font-semibold">
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Active vendors"
              value={String(activeVendorCount)}
              subtitle={`${vendors.length} total accounts`}
              Icon={HandshakeIcon}
              gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-violet-500/15"
            />
            <KpiCard
              title="Total receivable"
              value={formatRupees(totalReceivablePaise)}
              subtitle={`${outstandingVendorCount} vendors with balance`}
              Icon={IndianRupeeIcon}
              gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
            />
            <KpiCard
              title="Overdue credit sales"
              value={String(summary?.overdueSales.length ?? 0)}
              subtitle="Past due date"
              Icon={AlertCircleIcon}
              gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
            />
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">Vendor receivables</p>
                <p className="text-muted-foreground text-xs">Top outstanding balances</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadSummary()}>
                Refresh
              </Button>
            </div>
            <div className="h-72">
              {vendorReceivablesChartData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  No vendor receivables.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={vendorReceivablesChartData}
                    margin={{ left: 8, right: 8, top: 10, bottom: 48 }}
                  >
                    <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} height={56} />
                    <YAxis tickFormatter={chartYAxisRupeeTick} />
                    <Tooltip formatter={(v) => chartTooltipRupeePair(v as number)} />
                    <Bar
                      dataKey="amountRupees"
                      name="Receivable"
                      fill="#2563eb"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium text-sm">Vendor balance (receivable)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(summary?.vendorBalances ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground text-xs">
                        No ledger entries yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary!.vendorBalances.slice(0, 8).map((r) => (
                      <TableRow key={r.vendorId}>
                        <TableCell className="text-sm">{r.vendorName || r.vendorId}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatRupees(r.balancePaise)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium text-sm">Overdue sales</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(summary?.overdueSales ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground text-xs">
                        None overdue.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary!.overdueSales.slice(0, 8).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{s.vendorName}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {s.dueAt ? s.dueAt.slice(0, 10) : "—"}
                          <div className="text-muted-foreground text-xs">
                            {formatRupees(s.totalPaise)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Vendors</h2>
              <p className="text-muted-foreground text-sm">
                Accounts for vendor sales, credit terms, and payment tracking.
              </p>
            </div>
            <Button type="button" onClick={openAddVendor}>
              <PlusIcon className="mr-2 size-4" aria-hidden />
              Add vendor
            </Button>
          </div>

          <DataTableToolbar
            search={vendorSearch}
            onSearchChange={setVendorSearch}
            searchPlaceholder="Search name, phone, email…"
            statusFilter={vendorStatusFilter}
            onStatusFilterChange={setVendorStatusFilter}
            sort={vendorSort}
            onSortChange={setVendorSort}
            sortOptions={[
              { value: "name-asc", label: "Name (A–Z)" },
              { value: "name-desc", label: "Name (Z–A)" },
            ]}
            filteredCount={filteredVendors.length}
            totalCount={vendors.length}
          />

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Credit days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No vendors yet. Add one to record sales.
                    </TableCell>
                  </TableRow>
                ) : filteredVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No vendors match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVendors.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {v.phone.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {v.email.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {v.defaultCreditDays ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={v.active ? "default" : "secondary"}>
                          {v.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add vendor</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor-name">Name</Label>
                  <Input
                    id="vendor-name"
                    placeholder="Vendor name"
                    value={vendorForm.name}
                    onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-phone">Phone</Label>
                  <Input
                    id="vendor-phone"
                    placeholder="Phone number"
                    value={vendorForm.phone}
                    onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-email">Email</Label>
                  <Input
                    id="vendor-email"
                    placeholder="Email (optional)"
                    value={vendorForm.email}
                    onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-credit-days">Default credit days (optional)</Label>
                  <Input
                    id="vendor-credit-days"
                    inputMode="numeric"
                    placeholder="e.g. 15"
                    value={vendorForm.defaultCreditDays}
                    onChange={(e) =>
                      setVendorForm({ ...vendorForm, defaultCreditDays: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-address">Address</Label>
                  <Input
                    id="vendor-address"
                    placeholder="Address (optional)"
                    value={vendorForm.address}
                    onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setVendorDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void createVendor()}>
                  Add vendor
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="sellable" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Items to sell</h2>
              <p className="text-muted-foreground text-sm">
                Choose menu items available for vendor sales.
              </p>
            </div>
            <Button type="button" onClick={() => void saveSellable()}>
              Save changes
            </Button>
          </div>

          <DataTableToolbar
            search={sellableSearch}
            onSearchChange={setSellableSearch}
            searchPlaceholder="Search menu items…"
            sort={sellableSort}
            onSortChange={setSellableSort}
            sortOptions={[
              { value: "name-asc", label: "Name (A–Z)" },
              { value: "name-desc", label: "Name (Z–A)" },
            ]}
            filteredCount={filteredSellableItems.length}
            totalCount={menu?.items.length ?? 0}
            showStatusFilter={false}
          >
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Sellable</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={[
                  { value: "all", label: "All items" },
                  { value: "sellable", label: "Sellable only" },
                  { value: "not", label: "Not sellable" },
                ]}
                value={sellableFilter}
                onValueChange={(v) => setSellableFilter(v as "all" | "sellable" | "not")}
                placeholder="Filter"
                searchPlaceholder="Search…"
              />
            </div>
          </DataTableToolbar>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[5rem]">Sell</TableHead>
                  <TableHead>Menu item</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(menu?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                      No menu items found.
                    </TableCell>
                  </TableRow>
                ) : filteredSellableItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                      No items match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSellableItems.map((it) => {
                    const isSellable = sellableMenuItemIds.includes(it.id);
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="size-4 rounded border"
                            checked={isSellable}
                            onChange={() => toggleSellable(it.id)}
                            aria-label={`Sell ${it.name} to vendors`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell>
                          <Badge variant={isSellable ? "default" : "secondary"}>
                            {isSellable ? "Sellable" : "Not sellable"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Vendor sales</h2>
              <p className="text-muted-foreground text-sm">
                Record sales to vendors — stock is reduced immediately via recipes.
              </p>
            </div>
            <Button type="button" onClick={openNewSale}>
              <PlusIcon className="mr-2 size-4" aria-hidden />
              New sale
            </Button>
          </div>

          <DataTableToolbar
            search={saleSearch}
            onSearchChange={setSaleSearch}
            searchPlaceholder="Search vendor, payment, notes…"
            sort={saleSort}
            onSortChange={setSaleSort}
            sortOptions={[
              { value: "date-desc", label: "Date (newest)" },
              { value: "date-asc", label: "Date (oldest)" },
              { value: "amount-desc", label: "Amount (high–low)" },
              { value: "amount-asc", label: "Amount (low–high)" },
              { value: "vendor-asc", label: "Vendor" },
            ]}
            filteredCount={filteredSales.length}
            totalCount={sales.length}
            showStatusFilter={false}
          >
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Payment</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={[
                  { value: "all", label: "All types" },
                  { value: "CASH", label: "Cash" },
                  { value: "CREDIT", label: "Credit" },
                ]}
                value={salePaymentFilter}
                onValueChange={setSalePaymentFilter}
                placeholder="Payment"
                searchPlaceholder="Search payment…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Vendor</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={[
                  { value: "all", label: "All vendors" },
                  ...vendors.map((v) => ({ value: v.id, label: v.name })),
                ]}
                value={saleVendorFilter}
                onValueChange={setSaleVendorFilter}
                placeholder="Vendor"
                searchPlaceholder="Search vendors…"
              />
            </div>
          </DataTableToolbar>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No vendor sales yet. Record your first sale.
                    </TableCell>
                  </TableRow>
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No sales match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.vendorName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {s.soldAt.slice(0, 16).replace("T", " ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.paymentType}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.lineCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupees(s.totalPaise)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
            <DialogContent className="flex h-[min(92vh,880px)] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]">
              <DialogHeader className="shrink-0 border-b px-6 py-4">
                <DialogTitle>Record vendor sale</DialogTitle>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
                <div className="grid shrink-0 gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Vendor</Label>
                    <SearchableSelect
                      options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                      value={sale.vendorId}
                      onValueChange={(v) => setSale({ ...sale, vendorId: v })}
                      placeholder="Select vendor…"
                      searchPlaceholder="Search vendors…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sold at</Label>
                    <Input
                      type="datetime-local"
                      value={sale.soldAt}
                      onChange={(e) => setSale({ ...sale, soldAt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment type</Label>
                    <SearchableSelect
                      options={PAYMENT_TYPE_OPTIONS}
                      value={sale.paymentType}
                      onValueChange={(v) => setSale({ ...sale, paymentType: v })}
                      placeholder="Payment type"
                      searchPlaceholder="Search…"
                    />
                  </div>
                  {sale.paymentType === "CREDIT" ? (
                    <div className="space-y-2 md:col-span-3">
                      <Label>Credit days (optional)</Label>
                      <Input
                        inputMode="numeric"
                        value={sale.creditDays}
                        onChange={(e) => setSale({ ...sale, creditDays: e.target.value })}
                        placeholder="e.g. 15"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2 md:col-span-3">
                    <Label>Notes (optional)</Label>
                    <Input
                      value={sale.notes}
                      onChange={(e) => setSale({ ...sale, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border p-3">
                  <div className="mb-3 flex shrink-0 items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Line items</p>
                      <p className="text-muted-foreground text-xs">
                        Qty is in units/plates. Posting reduces stock via recipes.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setSaleLines((x) => [
                          ...x,
                          {
                            id: crypto.randomUUID(),
                            menuItemId: "",
                            variationId: "",
                            quantity: "1",
                            rateRupees: "",
                          },
                        ])
                      }
                    >
                      Add line
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <Table className="min-w-[52rem]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[14rem]">Item</TableHead>
                          <TableHead className="min-w-[10rem]">Variation</TableHead>
                          <TableHead className="w-24">Qty</TableHead>
                          <TableHead className="w-28">Rate (₹)</TableHead>
                          <TableHead className="w-24 text-right">Total</TableHead>
                          <TableHead className="w-16" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {saleLines.map((ln) => {
                          const qty = Number(ln.quantity);
                          const ratePaise = rupeesToPaise(ln.rateRupees);
                          const ok =
                            Number.isFinite(qty) && qty > 0 && ln.rateRupees.trim() !== "";
                          const lineTotal = ok ? Math.round(qty * ratePaise) : 0;
                          const item =
                            (menu?.items ?? []).find((x) => x.id === ln.menuItemId) ?? null;
                          return (
                            <TableRow key={ln.id}>
                              <TableCell>
                                <SearchableSelect
                                  options={sellableMenuItems.map((it) => ({
                                    value: it.id,
                                    label: it.name,
                                  }))}
                                  value={ln.menuItemId}
                                  onValueChange={(v) =>
                                    setSaleLines((x) =>
                                      x.map((r) =>
                                        r.id === ln.id
                                          ? { ...r, menuItemId: v, variationId: "" }
                                          : r,
                                      ),
                                    )
                                  }
                                  placeholder="Select item…"
                                  searchPlaceholder="Search items…"
                                />
                              </TableCell>
                              <TableCell>
                                <SearchableSelect
                                  options={[
                                    { value: "", label: "Default" },
                                    ...(item?.variations ?? []).map((v) => ({
                                      value: v.id,
                                      label: v.name,
                                    })),
                                  ]}
                                  value={ln.variationId}
                                  onValueChange={(v) =>
                                    setSaleLines((x) =>
                                      x.map((r) =>
                                        r.id === ln.id ? { ...r, variationId: v } : r,
                                      ),
                                    )
                                  }
                                  placeholder="Variation…"
                                  searchPlaceholder="Search variations…"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  value={ln.quantity}
                                  onChange={(e) =>
                                    setSaleLines((x) =>
                                      x.map((r) =>
                                        r.id === ln.id ? { ...r, quantity: e.target.value } : r,
                                      ),
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={ln.rateRupees}
                                  onChange={(e) =>
                                    setSaleLines((x) =>
                                      x.map((r) =>
                                        r.id === ln.id ? { ...r, rateRupees: e.target.value } : r,
                                      ),
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={cx(!ok && "text-muted-foreground")}>
                                  {formatRupees(lineTotal)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setSaleLines((x) =>
                                      x.length <= 1 ? x : x.filter((r) => r.id !== ln.id),
                                    )
                                  }
                                >
                                  <Trash2Icon className="size-4" aria-hidden />
                                  <span className="sr-only">Remove line</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
              <DialogFooter className="shrink-0 border-t px-6 py-4">
                <p className="mr-auto text-muted-foreground text-sm">
                  Total:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatRupees(saleTotalPaise)}
                  </span>
                </p>
                <Button type="button" variant="secondary" onClick={() => setSaleDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void submitSale()}>
                  Post sale (reduce stock)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 pt-4">
          <div>
            <h2 className="font-medium">Payments</h2>
            <p className="text-muted-foreground text-sm">
              Record payments received from vendors against their credit balance.
            </p>
          </div>

          <StockActionCard
            title="Record vendor payment"
            description="Logs a payment on the vendor account. Reduces what they owe you from credit sales."
            whenToUse="A vendor pays you for goods sold on credit in Vendor sales."
            action={
              <Button type="button" onClick={() => void submitPayment()}>
                Record payment
              </Button>
            }
          >
            <div className="space-y-2">
              <Label>Vendor</Label>
              <SearchableSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                value={payment.vendorId}
                onValueChange={(v) => setPayment({ ...payment, vendorId: v })}
                placeholder="Choose vendor…"
                searchPlaceholder="Search vendors…"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount received (₹)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 5000"
                  value={payment.amountRupees}
                  onChange={(e) => setPayment({ ...payment, amountRupees: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>How they paid</Label>
                <SearchableSelect
                  options={VENDOR_PAYMENT_METHOD_OPTIONS}
                  value={payment.method}
                  onValueChange={(v) => setPayment({ ...payment, method: v })}
                  placeholder="Payment method"
                  searchPlaceholder="Search…"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Paid at (optional)</Label>
                <Input
                  type="datetime-local"
                  value={payment.paidAt}
                  onChange={(e) => setPayment({ ...payment, paidAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Reference (optional)</Label>
                <Input
                  value={payment.reference}
                  onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
                  placeholder="UPI ref, cheque no., etc."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={payment.note}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })}
                placeholder="Internal note"
              />
            </div>
          </StockActionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
