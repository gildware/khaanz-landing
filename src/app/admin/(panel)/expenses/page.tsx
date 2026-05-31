"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  orderId: string | null;
  note: string;
  createdAt: string;
  item: { name: string; baseUnit: string } | null;
  order: { orderRef: string | null; totalMinor: number; createdAt: string } | null;
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

function toLocalInputValue(d: Date): string {
  // yyyy-MM-ddTHH:mm (local)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [personalEntries, setPersonalEntries] = useState<PersonalUseEntry[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [summary, setSummary] = useState<{
    business: { count: number; totalPaise: number };
    personal: {
      cashCount: number;
      cashTotalPaise: number;
      stockCount: number;
      orderCount: number;
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

  const loadSummary = useCallback(async () => {
    const r = await adminFetch<{
      business: { count: number; totalPaise: number };
      personal: {
        cashCount: number;
        cashTotalPaise: number;
        stockCount: number;
        orderCount: number;
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
          loadSummary(),
        ]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load expenses");
      }
    })();
  }, [loadCategories, loadExpenses, loadInventoryItems, loadPersonal, loadSummary]);

  const categoriesByGroup = useMemo(() => {
    const g: Record<ExpenseCategoryGroup, ExpenseCategory[]> = {
      RAW_MATERIAL: [],
      BILLS: [],
      OTHER: [],
    };
    for (const c of categories) g[c.group].push(c);
    return g;
  }, [categories]);

  const [newCategory, setNewCategory] = useState<{
    name: string;
    group: ExpenseCategoryGroup;
  }>({ name: "", group: "OTHER" });

  const createCategory = async () => {
    try {
      await adminFetch("/api/admin/expenses/categories", {
        method: "POST",
        body: JSON.stringify(newCategory),
      });
      toast.success("Category created");
      setNewCategory({ name: "", group: "OTHER" });
      await loadCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await adminFetch(`/api/admin/expenses/categories/${id}`, { method: "DELETE" });
      toast.success("Category removed");
      await loadCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const [newExpense, setNewExpense] = useState<{
    categoryId: string;
    amountRupees: string;
    occurredAt: string;
    note: string;
  }>({
    categoryId: "",
    amountRupees: "",
    occurredAt: toLocalInputValue(new Date()),
    note: "",
  });

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
      setNewExpense((x) => ({ ...x, amountRupees: "", note: "" }));
      await Promise.all([loadExpenses(), loadSummary()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const [newPersonal, setNewPersonal] = useState<{
    kind: PersonalUseKind;
    occurredAt: string;
    cashAmountRupees: string;
    inventoryItemId: string;
    qtyBase: string;
    orderId: string;
    note: string;
  }>({
    kind: "CASH",
    occurredAt: toLocalInputValue(new Date()),
    cashAmountRupees: "",
    inventoryItemId: "",
    qtyBase: "",
    orderId: "",
    note: "",
  });

  const createPersonal = async () => {
    try {
      await adminFetch("/api/admin/expenses/personal", {
        method: "POST",
        body: JSON.stringify({
          kind: newPersonal.kind,
          occurredAt: new Date(newPersonal.occurredAt).toISOString(),
          cashAmountPaise: rupeesToPaise(newPersonal.cashAmountRupees),
          inventoryItemId: newPersonal.inventoryItemId,
          qtyBase: newPersonal.qtyBase,
          orderId: newPersonal.orderId,
          note: newPersonal.note,
        }),
      });
      toast.success("Personal use saved");
      setNewPersonal((x) => ({
        ...x,
        cashAmountRupees: "",
        qtyBase: "",
        orderId: "",
        note: "",
      }));
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

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="overview" className="data-[state=active]:font-semibold">
            Overview
          </TabsTrigger>
          <TabsTrigger value="categories" className="data-[state=active]:font-semibold">
            Categories
          </TabsTrigger>
          <TabsTrigger value="business" className="data-[state=active]:font-semibold">
            Business expenses
          </TabsTrigger>
          <TabsTrigger value="personal" className="data-[state=active]:font-semibold">
            Personal use
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Business expenses (count)</p>
              <p className="mt-1 font-semibold text-2xl">{summary?.business.count ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Business expenses (total)</p>
              <p className="mt-1 font-semibold text-2xl">
                {formatRupees(summary?.business.totalPaise ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Personal cash taken</p>
              <p className="mt-1 font-semibold text-2xl">
                {formatRupees(summary?.personal.cashTotalPaise ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">
                {summary?.personal.cashCount ?? 0} entries
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Personal stock / orders</p>
              <p className="mt-1 font-semibold text-2xl">
                {(summary?.personal.stockCount ?? 0) + (summary?.personal.orderCount ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">
                Stock: {summary?.personal.stockCount ?? 0} · Orders:{" "}
                {summary?.personal.orderCount ?? 0}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 pt-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Name</Label>
              <Input
                value={newCategory.name}
                onChange={(e) =>
                  setNewCategory((x) => ({ ...x, name: e.target.value }))
                }
                placeholder="e.g. Rent, Electricity, Raw material"
              />
            </div>
            <div className="space-y-2">
              <Label>Group</Label>
              <SearchableSelect
                options={[
                  { value: "RAW_MATERIAL", label: "RAW_MATERIAL" },
                  { value: "BILLS", label: "BILLS" },
                  { value: "OTHER", label: "OTHER" },
                ]}
                value={newCategory.group}
                onValueChange={(v) =>
                  setNewCategory((x) => ({ ...x, group: v as ExpenseCategoryGroup }))
                }
                placeholder="Group"
                searchPlaceholder="Search group…"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="button" onClick={() => void createCategory()}>
                Create category
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {(["RAW_MATERIAL", "BILLS", "OTHER"] as ExpenseCategoryGroup[]).map((g) => (
              <div key={g} className="rounded-lg border border-border p-4">
                <p className="font-medium">{g}</p>
                <div className="mt-3 space-y-2">
                  {categoriesByGroup[g].length === 0 ? (
                    <p className="text-muted-foreground text-sm">No categories</p>
                  ) : (
                    categoriesByGroup[g].map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <p className="text-sm">{c.name}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => void deleteCategory(c.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="business" className="space-y-4 pt-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Category</Label>
              <SearchableSelect
                options={categories.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.group})`,
                  searchText: c.group,
                }))}
                value={newExpense.categoryId}
                onValueChange={(v) =>
                  setNewExpense((x) => ({ ...x, categoryId: v }))
                }
                placeholder="Select category…"
                searchPlaceholder="Search categories…"
              />
            </div>

            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                inputMode="decimal"
                value={newExpense.amountRupees}
                onChange={(e) => setNewExpense((x) => ({ ...x, amountRupees: e.target.value }))}
                placeholder="e.g. 150"
              />
            </div>

            <div className="space-y-2">
              <Label>Occurred at</Label>
              <Input
                type="datetime-local"
                value={newExpense.occurredAt}
                onChange={(e) => setNewExpense((x) => ({ ...x, occurredAt: e.target.value }))}
              />
            </div>

            <div className="space-y-2 md:col-span-4">
              <Label>Note (optional)</Label>
              <Input
                value={newExpense.note}
                onChange={(e) => setNewExpense((x) => ({ ...x, note: e.target.value }))}
                placeholder="e.g. April rent"
              />
            </div>

            <div className="md:col-span-4">
              <Button type="button" onClick={() => void createExpense()}>
                Record expense
              </Button>
            </div>
          </div>

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
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No expense entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                expenseEntries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground text-xs">
                      {e.occurredAt.slice(0, 10)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {e.category?.name ?? e.categoryId}
                      <span className="text-muted-foreground text-xs"> ({e.category.group})</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{e.note || "—"}</TableCell>
                    <TableCell className="text-right">{formatRupees(e.amountPaise)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="personal" className="space-y-4 pt-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <SearchableSelect
                options={[
                  { value: "CASH", label: "CASH" },
                  { value: "STOCK", label: "STOCK" },
                  { value: "ORDER", label: "ORDER" },
                  { value: "OTHER", label: "OTHER" },
                ]}
                value={newPersonal.kind}
                onValueChange={(v) =>
                  setNewPersonal((x) => ({ ...x, kind: v as PersonalUseKind }))
                }
                placeholder="Type"
                searchPlaceholder="Search type…"
              />
            </div>

            <div className="space-y-2">
              <Label>Occurred at</Label>
              <Input
                type="datetime-local"
                value={newPersonal.occurredAt}
                onChange={(e) => setNewPersonal((x) => ({ ...x, occurredAt: e.target.value }))}
              />
            </div>

            {newPersonal.kind === "CASH" && (
              <div className="space-y-2 md:col-span-2">
                <Label>Cash amount (₹)</Label>
                <Input
                  inputMode="decimal"
                  value={newPersonal.cashAmountRupees}
                  onChange={(e) =>
                    setNewPersonal((x) => ({ ...x, cashAmountRupees: e.target.value }))
                  }
                  placeholder="e.g. 50"
                />
              </div>
            )}

            {newPersonal.kind === "STOCK" && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <Label>Stock item</Label>
                  <SearchableSelect
                    options={invItems
                      .filter((x) => x.active)
                      .map((it) => ({
                        value: it.id,
                        label: `${it.name} (${it.baseUnit})`,
                        searchText: it.name,
                      }))}
                    value={newPersonal.inventoryItemId}
                    onValueChange={(v) =>
                      setNewPersonal((x) => ({ ...x, inventoryItemId: v }))
                    }
                    placeholder="Select item…"
                    searchPlaceholder="Search items…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Qty (base)</Label>
                  <Input
                    inputMode="decimal"
                    value={newPersonal.qtyBase}
                    onChange={(e) =>
                      setNewPersonal((x) => ({ ...x, qtyBase: e.target.value }))
                    }
                    placeholder="e.g. 250"
                  />
                </div>
              </>
            )}

            {newPersonal.kind === "ORDER" && (
              <div className="space-y-2 md:col-span-2">
                <Label>Order id</Label>
                <Input
                  value={newPersonal.orderId}
                  onChange={(e) => setNewPersonal((x) => ({ ...x, orderId: e.target.value }))}
                  placeholder="Paste Order.id (uuid)"
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="space-y-2 md:col-span-4">
              <Label>Note (optional)</Label>
              <Input
                value={newPersonal.note}
                onChange={(e) => setNewPersonal((x) => ({ ...x, note: e.target.value }))}
                placeholder="e.g. Home groceries"
              />
            </div>

            <div className="md:col-span-4">
              <Button type="button" onClick={() => void createPersonal()}>
                Save personal entry
              </Button>
              {newPersonal.kind === "STOCK" && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Stock entries also create an inventory adjustment (OUT) so stock is reduced.
                </p>
              )}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Cash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personalEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No personal entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                personalEntries.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground text-xs">
                      {p.occurredAt.slice(0, 10)}
                    </TableCell>
                    <TableCell className="font-medium">{p.kind}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {p.kind === "STOCK" ? (
                        <>
                          {p.item?.name ?? p.inventoryItemId} · {p.qtyBase ?? "?"}{" "}
                          {p.item?.baseUnit ?? ""}
                        </>
                      ) : p.kind === "ORDER" ? (
                        <>
                          {p.order?.orderRef ?? p.orderId} ·{" "}
                          {p.order ? formatRupees(p.order.totalMinor) : "—"}
                        </>
                      ) : (
                        p.note || "—"
                      )}
                      {p.note && p.kind !== "CASH" ? ` · ${p.note}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.kind === "CASH" ? formatRupees(p.cashAmountPaise) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

