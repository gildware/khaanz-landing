"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BanknoteIcon,
  IndianRupeeIcon,
  PackageIcon,
  PlusIcon,
  StickyNoteIcon,
  Trash2Icon,
  UtensilsCrossedIcon,
  WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import { formatRupees, rupeesToPaise } from "@/lib/payroll/payroll-utils";

type ExpenseCategoryGroup = "RAW_MATERIAL" | "BILLS" | "OTHER";
type PersonalUseKind = "CASH" | "STOCK" | "ORDER" | "OTHER";

type ExpenseCategory = {
  id: string;
  name: string;
  group: ExpenseCategoryGroup;
  active: boolean;
};

type ExpenseEntry = {
  id: string;
  categoryId: string;
  occurredAt: string;
  amountPaise: number;
  note: string;
  createdAt: string;
  category: { name: string; group: ExpenseCategoryGroup };
};

type PersonalUseEntry = {
  id: string;
  kind: PersonalUseKind;
  occurredAt: string;
  cashAmountPaise: number;
  inventoryItemId: string | null;
  qtyBase: string | null;
  menuItemId: string | null;
  variationId: string | null;
  orderId: string | null;
  note: string;
  createdAt: string;
  item: { name: string; baseUnit: string } | null;
  menuItem: { name: string } | null;
  variation: { name: string } | null;
  order: { orderRef: string | null; totalMinor: number; createdAt: string } | null;
};

type MenuPayload = {
  items: {
    id: string;
    name: string;
    category: string;
    available?: boolean;
    variations: { id: string; name: string; price: number }[];
  }[];
};

type StockLineDraft = {
  id: string;
  inventoryItemId: string;
  qtyBase: string;
};

type OrderLineDraft = {
  id: string;
  menuItemId: string;
  variationId: string;
  quantity: string;
};

type InvItem = {
  id: string;
  name: string;
  baseUnit: string;
  active: boolean;
};

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

function emptyStockLine(): StockLineDraft {
  return { id: crypto.randomUUID(), inventoryItemId: "", qtyBase: "" };
}

function emptyOrderLine(): OrderLineDraft {
  return { id: crypto.randomUUID(), menuItemId: "", variationId: "", quantity: "1" };
}

function toLocalInputValue(d: Date): string {
  // yyyy-MM-ddTHH:mm (local)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PERSONAL_KINDS: PersonalUseKind[] = ["CASH", "STOCK", "ORDER", "OTHER"];

const PERSONAL_KIND_LABELS: Record<PersonalUseKind, string> = {
  CASH: "Cash",
  STOCK: "Stock",
  ORDER: "Menu items",
  OTHER: "Other",
};

const BUSINESS_GROUPS: ExpenseCategoryGroup[] = ["RAW_MATERIAL", "BILLS", "OTHER"];

const BUSINESS_GROUP_LABELS: Record<ExpenseCategoryGroup, string> = {
  RAW_MATERIAL: "Raw material",
  BILLS: "Bills",
  OTHER: "Other",
};

const BUSINESS_GROUP_ICONS: Record<
  ExpenseCategoryGroup,
  React.ComponentType<{ className?: string }>
> = {
  RAW_MATERIAL: PackageIcon,
  BILLS: BanknoteIcon,
  OTHER: StickyNoteIcon,
};

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
            <p className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">{value}</p>
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

function formatPersonalDetails(p: PersonalUseEntry): string {
  if (p.kind === "STOCK") {
    return `${p.item?.name ?? p.inventoryItemId ?? "—"} · ${p.qtyBase ?? "?"} ${p.item?.baseUnit ?? ""}`.trim();
  }
  if (p.kind === "ORDER") {
    if (p.menuItem) {
      return `${p.menuItem.name}${p.variation ? ` · ${p.variation.name}` : ""} · qty ${p.qtyBase ?? "?"}`;
    }
    if (p.order) {
      return `${p.order.orderRef ?? p.orderId ?? "—"} · ${formatRupees(p.order.totalMinor)}`;
    }
    return p.orderId ?? "—";
  }
  if (p.kind === "CASH") return p.note || "Cash withdrawal";
  return p.note || "—";
}

function resetPersonalDraft(kind: PersonalUseKind): {
  draft: { kind: PersonalUseKind; occurredAt: string; cashAmountRupees: string; note: string };
  stockLines: StockLineDraft[];
  orderLines: OrderLineDraft[];
} {
  return {
    draft: {
      kind,
      occurredAt: toLocalInputValue(new Date()),
      cashAmountRupees: "",
      note: "",
    },
    stockLines: [emptyStockLine()],
    orderLines: [emptyOrderLine()],
  };
}

function resetBusinessDraft(): {
  categoryId: string;
  amountRupees: string;
  occurredAt: string;
  note: string;
} {
  return {
    categoryId: "",
    amountRupees: "",
    occurredAt: toLocalInputValue(new Date()),
    note: "",
  };
}

export default function AdminExpensesPage() {
  const [activeTab, setActiveTab] = useTabParam("business");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [personalEntries, setPersonalEntries] = useState<PersonalUseEntry[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [summary, setSummary] = useState<{
    business: { count: number; totalPaise: number };
    personal: {
      cashCount: number;
      cashTotalPaise: number;
      stockCount: number;
      stockWorthPaise: number;
      orderCount: number;
      orderWorthPaise: number;
      otherCount: number;
      totalPersonalPaise: number;
    };
  } | null>(null);

  const loadCategories = useCallback(async () => {
    const r = await adminFetch<{ categories: ExpenseCategory[] }>(
      "/api/admin/expenses/categories",
    );
    setCategories(r.categories);
  }, []);

  const loadExpenses = useCallback(async () => {
    const r = await adminFetch<{ entries: ExpenseEntry[] }>("/api/admin/expenses/entries");
    setExpenseEntries(r.entries);
  }, []);

  const loadPersonal = useCallback(async () => {
    const r = await adminFetch<{ entries: PersonalUseEntry[] }>("/api/admin/expenses/personal");
    setPersonalEntries(r.entries);
  }, []);

  const loadInventoryItems = useCallback(async () => {
    const r = await adminFetch<{ items: InvItem[] }>("/api/admin/inventory/items");
    setInvItems(r.items);
  }, []);

  const loadMenu = useCallback(async () => {
    const r = await adminFetch<MenuPayload>("/api/menu");
    setMenu(r);
  }, []);

  const loadSummary = useCallback(async () => {
    const r = await adminFetch<{
      business: { count: number; totalPaise: number };
      personal: {
        cashCount: number;
        cashTotalPaise: number;
        stockCount: number;
        stockWorthPaise: number;
        orderCount: number;
        orderWorthPaise: number;
        otherCount: number;
        totalPersonalPaise: number;
      };
    }>("/api/admin/expenses/summary");
    setSummary(r);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          loadCategories(),
          loadExpenses(),
          loadPersonal(),
          loadInventoryItems(),
          loadMenu(),
          loadSummary(),
        ]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load expenses");
      }
    })();
  }, [loadCategories, loadExpenses, loadInventoryItems, loadMenu, loadPersonal, loadSummary]);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const businessGroupStats = useMemo(() => {
    const stats: Record<ExpenseCategoryGroup, { count: number; totalPaise: number }> = {
      RAW_MATERIAL: { count: 0, totalPaise: 0 },
      BILLS: { count: 0, totalPaise: 0 },
      OTHER: { count: 0, totalPaise: 0 },
    };
    for (const e of expenseEntries) {
      stats[e.category.group].count += 1;
      stats[e.category.group].totalPaise += e.amountPaise;
    }
    return stats;
  }, [expenseEntries]);

  const categoryOptions = useMemo(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: c.name,
        searchText: c.group,
      })),
    [categories],
  );

  const [businessSearch, setBusinessSearch] = useState("");
  const [businessGroupFilter, setBusinessGroupFilter] = useState<"all" | ExpenseCategoryGroup>("all");
  const [businessSort, setBusinessSort] = useState("date-desc");
  const [personalSearch, setPersonalSearch] = useState("");
  const [personalSort, setPersonalSort] = useState("date-desc");

  const [newExpense, setNewExpense] = useState(resetBusinessDraft);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);

  const openBusinessModal = () => {
    setNewExpense(resetBusinessDraft());
    setBusinessModalOpen(true);
  };

  const closeBusinessModal = () => {
    setBusinessModalOpen(false);
  };

  const createCategoryFromSearch = async (name: string) => {
    setIsCreatingCategory(true);
    try {
      const r = await adminFetch<{ category: ExpenseCategory }>(
        "/api/admin/expenses/categories",
        {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), group: "OTHER" }),
        },
      );
      await loadCategories();
      setNewExpense((x) => ({ ...x, categoryId: r.category.id }));
      toast.success(`Category "${r.category.name}" created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
      throw e;
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const createExpense = async () => {
    try {
      await adminFetch("/api/admin/expenses/entries", {
        method: "POST",
        body: JSON.stringify({
          categoryId: newExpense.categoryId,
          amountPaise: rupeesToPaise(newExpense.amountRupees),
          occurredAt: new Date(newExpense.occurredAt).toISOString(),
          note: newExpense.note,
        }),
      });
      toast.success("Expense recorded");
      closeBusinessModal();
      await Promise.all([loadExpenses(), loadSummary(), loadCategories()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const menuItems = useMemo(
    () => (menu?.items ?? []).filter((it) => it.available !== false),
    [menu],
  );

  const [newPersonal, setNewPersonal] = useState<{
    kind: PersonalUseKind;
    occurredAt: string;
    cashAmountRupees: string;
    note: string;
  }>({
    kind: "CASH",
    occurredAt: toLocalInputValue(new Date()),
    cashAmountRupees: "",
    note: "",
  });

  const [stockLines, setStockLines] = useState<StockLineDraft[]>([emptyStockLine()]);
  const [orderLines, setOrderLines] = useState<OrderLineDraft[]>([emptyOrderLine()]);
  const [personalTab, setPersonalTab] = useState<PersonalUseKind>("CASH");
  const [personalModalOpen, setPersonalModalOpen] = useState(false);

  const personalByKind = useMemo(() => {
    const grouped: Record<PersonalUseKind, PersonalUseEntry[]> = {
      CASH: [],
      STOCK: [],
      ORDER: [],
      OTHER: [],
    };
    for (const entry of personalEntries) grouped[entry.kind].push(entry);
    return grouped;
  }, [personalEntries]);

  const filterAndSortExpenses = useCallback(
    (list: ExpenseEntry[]) => {
      const q = businessSearch.trim().toLowerCase();
      let filtered = list.filter((e) => {
        if (businessGroupFilter !== "all" && e.category.group !== businessGroupFilter) {
          return false;
        }
        if (!q) return true;
        const hay = `${e.category.name} ${e.category.group} ${e.note}`.toLowerCase();
        return hay.includes(q);
      });
      filtered = [...filtered].sort((a, b) => {
        switch (businessSort) {
          case "date-asc":
            return a.occurredAt.localeCompare(b.occurredAt);
          case "amount-asc":
            return a.amountPaise - b.amountPaise;
          case "amount-desc":
            return b.amountPaise - a.amountPaise;
          case "category-asc":
            return (
              a.category.name.localeCompare(b.category.name) ||
              b.occurredAt.localeCompare(a.occurredAt)
            );
          default:
            return b.occurredAt.localeCompare(a.occurredAt);
        }
      });
      return filtered;
    },
    [businessSearch, businessGroupFilter, businessSort],
  );

  const filteredBusinessExpenses = useMemo(
    () => filterAndSortExpenses(expenseEntries),
    [expenseEntries, filterAndSortExpenses],
  );

  const filterPersonalList = useCallback(
    (list: PersonalUseEntry[]) => {
      const q = personalSearch.trim().toLowerCase();
      let filtered = list;
      if (q) {
        filtered = list.filter((p) => {
          const hay = `${formatPersonalDetails(p)} ${p.note} ${p.occurredAt}`.toLowerCase();
          return hay.includes(q);
        });
      }
      filtered = [...filtered].sort((a, b) => {
        switch (personalSort) {
          case "date-asc":
            return a.occurredAt.localeCompare(b.occurredAt);
          case "amount-asc":
            return (a.cashAmountPaise ?? 0) - (b.cashAmountPaise ?? 0);
          case "amount-desc":
            return (b.cashAmountPaise ?? 0) - (a.cashAmountPaise ?? 0);
          default:
            return b.occurredAt.localeCompare(a.occurredAt);
        }
      });
      return filtered;
    },
    [personalSearch, personalSort],
  );

  const openPersonalModal = (kind: PersonalUseKind = personalTab) => {
    const reset = resetPersonalDraft(kind);
    setNewPersonal(reset.draft);
    setStockLines(reset.stockLines);
    setOrderLines(reset.orderLines);
    setPersonalModalOpen(true);
  };

  const closePersonalModal = () => {
    setPersonalModalOpen(false);
  };

  const createPersonal = async () => {
    try {
      const payload: Record<string, unknown> = {
        kind: newPersonal.kind,
        occurredAt: new Date(newPersonal.occurredAt).toISOString(),
        note: newPersonal.note,
      };

      if (newPersonal.kind === "CASH") {
        payload.cashAmountPaise = rupeesToPaise(newPersonal.cashAmountRupees);
      } else if (newPersonal.kind === "STOCK") {
        payload.stockLines = stockLines
          .filter((ln) => ln.inventoryItemId && ln.qtyBase.trim())
          .map((ln) => ({
            inventoryItemId: ln.inventoryItemId,
            qtyBase: ln.qtyBase,
          }));
      } else if (newPersonal.kind === "ORDER") {
        payload.orderLines = orderLines
          .filter((ln) => ln.menuItemId && ln.variationId && ln.quantity.trim())
          .map((ln) => ({
            menuItemId: ln.menuItemId,
            variationId: ln.variationId,
            quantity: ln.quantity,
          }));
      }

      await adminFetch("/api/admin/expenses/personal", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Personal use saved");
      closePersonalModal();
      setPersonalTab(newPersonal.kind);
      await Promise.all([loadPersonal(), loadSummary(), loadInventoryItems()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Expenses</h1>
        <p className="text-muted-foreground text-sm">
          Track business expenses by category and personal use (cash, stock, orders).
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="business" className="data-[state=active]:font-semibold">
            Business expenses
          </TabsTrigger>
          <TabsTrigger value="personal" className="data-[state=active]:font-semibold">
            Personal use
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total business expenses"
              value={formatRupees(summary?.business.totalPaise ?? 0)}
              subtitle={`${summary?.business.count ?? 0} entries`}
              Icon={IndianRupeeIcon}
              gradientClassName="bg-gradient-to-br from-blue-500/25 via-blue-400/10 to-transparent"
            />
            {BUSINESS_GROUPS.map((group) => {
              const Icon = BUSINESS_GROUP_ICONS[group];
              const stats = businessGroupStats[group];
              return (
                <KpiCard
                  key={group}
                  title={BUSINESS_GROUP_LABELS[group]}
                  value={formatRupees(stats.totalPaise)}
                  subtitle={`${stats.count} entries`}
                  Icon={Icon}
                  gradientClassName={
                    group === "RAW_MATERIAL"
                      ? "bg-gradient-to-br from-amber-500/25 via-amber-400/10 to-transparent"
                      : group === "BILLS"
                        ? "bg-gradient-to-br from-emerald-500/25 via-emerald-400/10 to-transparent"
                        : "bg-gradient-to-br from-slate-500/25 via-slate-400/10 to-transparent"
                  }
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">Business expense ledger</p>
            <Button type="button" onClick={openBusinessModal}>
              <PlusIcon className="mr-1.5 size-4" aria-hidden />
              Add expense
            </Button>
          </div>

          <DataTableToolbar
            search={businessSearch}
            onSearchChange={setBusinessSearch}
            searchPlaceholder="Search category, note…"
            sort={businessSort}
            onSortChange={setBusinessSort}
            sortOptions={[
              { value: "date-desc", label: "Newest first" },
              { value: "date-asc", label: "Oldest first" },
              { value: "amount-desc", label: "Amount (high–low)" },
              { value: "amount-asc", label: "Amount (low–high)" },
              { value: "category-asc", label: "Category (A–Z)" },
            ]}
            filteredCount={filteredBusinessExpenses.length}
            totalCount={expenseEntries.length}
            showStatusFilter={false}
          >
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Group</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={[
                  { value: "all", label: "All groups" },
                  ...BUSINESS_GROUPS.map((g) => ({
                    value: g,
                    label: BUSINESS_GROUP_LABELS[g],
                  })),
                ]}
                value={businessGroupFilter}
                onValueChange={(v) =>
                  setBusinessGroupFilter(v as "all" | ExpenseCategoryGroup)
                }
                placeholder="Group"
                searchPlaceholder="Search…"
              />
            </div>
          </DataTableToolbar>

          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No business expenses yet.
                    </TableCell>
                  </TableRow>
                ) : filteredBusinessExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No expenses match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBusinessExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                        {e.occurredAt.slice(0, 16).replace("T", " ")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {e.category?.name ?? e.categoryId}
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          ({e.category.group})
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground text-xs">
                        {e.note || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupees(e.amountPaise)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog open={businessModalOpen} onOpenChange={setBusinessModalOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add expense</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <SearchableSelect
                    options={categoryOptions}
                    value={newExpense.categoryId}
                    onValueChange={(v) => setNewExpense((x) => ({ ...x, categoryId: v }))}
                    placeholder="Select or create category…"
                    searchPlaceholder="Search or type new category…"
                    creatable
                    isCreating={isCreatingCategory}
                    onCreateOption={createCategoryFromSearch}
                    createOptionLabel={(q) => `Add category "${q}"`}
                  />
                  <p className="text-muted-foreground text-xs">
                    Type a name and choose Add category to create one on the fly.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Amount (₹)</Label>
                    <Input
                      inputMode="decimal"
                      value={newExpense.amountRupees}
                      onChange={(e) =>
                        setNewExpense((x) => ({ ...x, amountRupees: e.target.value }))
                      }
                      placeholder="e.g. 1500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Occurred at</Label>
                    <Input
                      type="datetime-local"
                      value={newExpense.occurredAt}
                      onChange={(e) =>
                        setNewExpense((x) => ({ ...x, occurredAt: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Note (optional)</Label>
                  <Input
                    value={newExpense.note}
                    onChange={(e) => setNewExpense((x) => ({ ...x, note: e.target.value }))}
                    placeholder="e.g. April rent"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeBusinessModal}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void createExpense()}>
                  Save expense
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="personal" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              title="Total personal use"
              value={formatRupees(summary?.personal.totalPersonalPaise ?? 0)}
              subtitle="Cash + stock worth + menu worth"
              Icon={IndianRupeeIcon}
              gradientClassName="bg-gradient-to-br from-rose-500/25 via-rose-400/10 to-transparent"
            />
            <KpiCard
              title="Cash taken"
              value={formatRupees(summary?.personal.cashTotalPaise ?? 0)}
              subtitle={`${summary?.personal.cashCount ?? 0} entries`}
              Icon={BanknoteIcon}
              gradientClassName="bg-gradient-to-br from-emerald-500/25 via-emerald-400/10 to-transparent"
            />
            <KpiCard
              title="Stock used"
              value={formatRupees(summary?.personal.stockWorthPaise ?? 0)}
              subtitle={`${summary?.personal.stockCount ?? 0} items · at avg cost`}
              Icon={WarehouseIcon}
              gradientClassName="bg-gradient-to-br from-amber-500/25 via-amber-400/10 to-transparent"
            />
            <KpiCard
              title="Menu items"
              value={formatRupees(summary?.personal.orderWorthPaise ?? 0)}
              subtitle={`${summary?.personal.orderCount ?? 0} dishes · at menu price`}
              Icon={UtensilsCrossedIcon}
              gradientClassName="bg-gradient-to-br from-violet-500/25 via-violet-400/10 to-transparent"
            />
            <KpiCard
              title="Other"
              value={String(summary?.personal.otherCount ?? 0)}
              subtitle="Misc personal use notes"
              Icon={StickyNoteIcon}
              gradientClassName="bg-gradient-to-br from-slate-500/25 via-slate-400/10 to-transparent"
            />
          </div>

          <Tabs
            value={personalTab}
            onValueChange={(v) => setPersonalTab(v as PersonalUseKind)}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-auto flex-wrap">
                {PERSONAL_KINDS.map((kind) => (
                  <TabsTrigger key={kind} value={kind} className="data-[state=active]:font-semibold">
                    {PERSONAL_KIND_LABELS[kind]}
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                      {personalByKind[kind].length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button type="button" onClick={() => openPersonalModal(personalTab)}>
                <PlusIcon className="mr-1.5 size-4" aria-hidden />
                Add {PERSONAL_KIND_LABELS[personalTab].toLowerCase()} entry
              </Button>
            </div>

            <DataTableToolbar
              search={personalSearch}
              onSearchChange={setPersonalSearch}
              searchPlaceholder="Search details, note…"
              sort={personalSort}
              onSortChange={setPersonalSort}
              sortOptions={[
                { value: "date-desc", label: "Newest first" },
                { value: "date-asc", label: "Oldest first" },
                { value: "amount-desc", label: "Amount (high–low)" },
                { value: "amount-asc", label: "Amount (low–high)" },
              ]}
              filteredCount={filterPersonalList(personalByKind[personalTab]).length}
              totalCount={personalByKind[personalTab].length}
              showStatusFilter={false}
            />

            {PERSONAL_KINDS.map((kind) => (
              <TabsContent key={kind} value={kind} className="mt-0 space-y-3">
                <div className="rounded-xl border bg-card shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Details</TableHead>
                        {kind === "CASH" ? (
                          <TableHead className="text-right">Amount</TableHead>
                        ) : (
                          <TableHead>Note</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {personalByKind[kind].length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={kind === "CASH" ? 3 : 3}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No {PERSONAL_KIND_LABELS[kind].toLowerCase()} entries yet.
                          </TableCell>
                        </TableRow>
                      ) : filterPersonalList(personalByKind[kind]).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={kind === "CASH" ? 3 : 3}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No entries match your search or filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filterPersonalList(personalByKind[kind]).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                              {p.occurredAt.slice(0, 16).replace("T", " ")}
                            </TableCell>
                            <TableCell className="text-sm">{formatPersonalDetails(p)}</TableCell>
                            {kind === "CASH" ? (
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatRupees(p.cashAmountPaise)}
                              </TableCell>
                            ) : (
                              <TableCell className="max-w-[14rem] truncate text-muted-foreground text-xs">
                                {p.note || "—"}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <Dialog open={personalModalOpen} onOpenChange={setPersonalModalOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add {PERSONAL_KIND_LABELS[newPersonal.kind].toLowerCase()} entry</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <SearchableSelect
                      options={PERSONAL_KINDS.map((k) => ({
                        value: k,
                        label: PERSONAL_KIND_LABELS[k],
                      }))}
                      value={newPersonal.kind}
                      onValueChange={(v) => {
                        const kind = v as PersonalUseKind;
                        const reset = resetPersonalDraft(kind);
                        setNewPersonal(reset.draft);
                        setStockLines(reset.stockLines);
                        setOrderLines(reset.orderLines);
                      }}
                      placeholder="Type"
                      searchPlaceholder="Search type…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Occurred at</Label>
                    <Input
                      type="datetime-local"
                      value={newPersonal.occurredAt}
                      onChange={(e) =>
                        setNewPersonal((x) => ({ ...x, occurredAt: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {newPersonal.kind === "CASH" && (
                  <div className="space-y-2">
                    <Label>Cash amount (₹)</Label>
                    <Input
                      inputMode="decimal"
                      value={newPersonal.cashAmountRupees}
                      onChange={(e) =>
                        setNewPersonal((x) => ({ ...x, cashAmountRupees: e.target.value }))
                      }
                      placeholder="e.g. 500"
                    />
                  </div>
                )}

                {newPersonal.kind === "STOCK" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">Stock items</p>
                        <p className="text-muted-foreground text-xs">
                          Add one or more inventory items. Each line reduces stock.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setStockLines((x) => [...x, emptyStockLine()])}
                      >
                        <PlusIcon className="mr-1 size-4" aria-hidden />
                        Add item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {stockLines.map((ln) => (
                        <div
                          key={ln.id}
                          className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_8rem_auto]"
                        >
                          <SearchableSelect
                            options={invItems
                              .filter((x) => x.active)
                              .map((it) => ({
                                value: it.id,
                                label: `${it.name} (${it.baseUnit})`,
                                searchText: it.name,
                              }))}
                            value={ln.inventoryItemId}
                            onValueChange={(v) =>
                              setStockLines((x) =>
                                x.map((r) =>
                                  r.id === ln.id ? { ...r, inventoryItemId: v } : r,
                                ),
                              )
                            }
                            placeholder="Select stock item…"
                            searchPlaceholder="Search items…"
                          />
                          <Input
                            inputMode="decimal"
                            value={ln.qtyBase}
                            onChange={(e) =>
                              setStockLines((x) =>
                                x.map((r) =>
                                  r.id === ln.id ? { ...r, qtyBase: e.target.value } : r,
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
                            disabled={stockLines.length <= 1}
                            onClick={() =>
                              setStockLines((x) =>
                                x.length <= 1 ? x : x.filter((r) => r.id !== ln.id),
                              )
                            }
                          >
                            <Trash2Icon className="size-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newPersonal.kind === "ORDER" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">Menu items</p>
                        <p className="text-muted-foreground text-xs">
                          Add dishes taken for personal use. Stock reduces via recipes.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setOrderLines((x) => [...x, emptyOrderLine()])}
                      >
                        <PlusIcon className="mr-1 size-4" aria-hidden />
                        Add item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {orderLines.map((ln) => {
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
                                setOrderLines((x) =>
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
                                setOrderLines((x) =>
                                  x.map((r) => (r.id === ln.id ? { ...r, variationId: v } : r)),
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
                                setOrderLines((x) =>
                                  x.map((r) =>
                                    r.id === ln.id ? { ...r, quantity: e.target.value } : r,
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
                              disabled={orderLines.length <= 1}
                              onClick={() =>
                                setOrderLines((x) =>
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
                )}

                <div className="space-y-2">
                  <Label>Note {newPersonal.kind === "OTHER" ? "" : "(optional)"}</Label>
                  <Input
                    value={newPersonal.note}
                    onChange={(e) => setNewPersonal((x) => ({ ...x, note: e.target.value }))}
                    placeholder={
                      newPersonal.kind === "OTHER"
                        ? "Describe the personal use…"
                        : "e.g. Owner withdrawal"
                    }
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closePersonalModal}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void createPersonal()}>
                  Save entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

