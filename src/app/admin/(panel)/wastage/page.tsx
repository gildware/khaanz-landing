"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  IndianRupeeIcon,
  PlusIcon,
  Trash2Icon,
  TrendingDownIcon,
  UtensilsCrossedIcon,
  WarehouseIcon,
} from "lucide-react";

import {
  DataTableToolbar,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  chartTooltipRupeePair,
  chartYAxisRupeeTick,
  formatRupees,
  paiseToRupeesNumber,
} from "@/lib/payroll/payroll-utils";

type InvItem = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  stockOnHandBase: string;
  active: boolean;
};

type RecipeRow = {
  menuItemId: string;
};

type MenuPayload = {
  items: {
    id: string;
    name: string;
    category: string;
    variations: { id: string; name: string; price: number }[];
  }[];
};

type WastageEntryRow = {
  id: string;
  kind: "INGREDIENT" | "DISH";
  wastedAt: string;
  createdAt: string;
  wastageType: string;
  wastageTypeLabel: string;
  summary: string;
  note: string;
  ingredients: { itemName: string; baseUnit: string; qtyBase: string }[];
};

const WASTAGE_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "SPOILAGE", label: "Spoiled / expired" },
  { value: "PREPARATION", label: "Used in kitchen prep" },
  { value: "OVERPRODUCTION", label: "Made too much" },
  { value: "OTHER", label: "Other waste" },
];

const DISH_WASTAGE_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "OVERPRODUCTION", label: "Prepared too much / didn't sell" },
  { value: "SPOILAGE", label: "Spoiled after prep" },
  { value: "OTHER", label: "Other dish waste" },
];

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

function inventoryItemSelectOptions(items: InvItem[]): SearchableSelectOption[] {
  return items
    .filter((x) => x.active)
    .map((it) => ({
      value: it.id,
      label: `${it.name} (${it.baseUnit})`,
      searchText: `${it.name} ${it.category}`,
    }));
}

function formatWastedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatIngredients(ingredients: WastageEntryRow["ingredients"]): string {
  if (ingredients.length === 0) return "—";
  return ingredients
    .map((i) => `${i.itemName} ${i.qtyBase} ${i.baseUnit}`)
    .join(", ");
}

type WastagePreset = "this_month" | "last_month" | "all_time";

type WastageSummary = {
  range: { preset: string; label: string };
  kpis: {
    totalCostPaise: number;
    ingredientCostPaise: number;
    dishCostPaise: number;
    totalEntryCount: number;
    ingredientEntryCount: number;
    dishEntryCount: number;
  };
  topIngredient: {
    name: string;
    qtyBase: string;
    baseUnit: string;
    costPaise: number;
  } | null;
  topDish: {
    label: string;
    qty: string;
    costPaise: number;
    entryCount: number;
  } | null;
  topReason: {
    label: string;
    costPaise: number;
    entryCount: number;
  } | null;
  costingNote: string;
  charts: {
    byType: { type: string; label: string; costPaise: number; entryCount: number }[];
    byItem: {
      key: string;
      label: string;
      qtyBase: string;
      baseUnit: string;
      costPaise: number;
    }[];
    byDish: { label: string; qty: string; costPaise: number; entryCount: number }[];
    daily: { date: string; label: string; costPaise: number }[];
    split: { key: string; label: string; costPaise: number }[];
  };
};

const SPLIT_COLORS = ["#f59e0b", "#8b5cf6"];

function ChartPanel(props: {
  title: string;
  description: string;
  empty?: boolean;
  emptyMessage?: string;
  height?: number;
  children: React.ReactNode;
}) {
  const { title, description, empty, emptyMessage, height = 220, children } = props;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-2.5">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {empty ? (
        <p className="text-muted-foreground py-6 text-center text-xs">
          {emptyMessage ?? "No data for this period."}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}

const PERIOD_OPTIONS: SearchableSelectOption[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "all_time", label: "All time" },
];

function KpiCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  Icon: React.ComponentType<{ className?: string }>;
  gradientClassName: string;
  compactValue?: boolean;
}) {
  const { title, value, subtitle, Icon, gradientClassName, compactValue } = props;
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className={`absolute inset-0 opacity-60 ${gradientClassName}`} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background/90" />
      <div className="relative px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-medium leading-tight">{title}</p>
            <p
              className={`mt-0.5 font-semibold tabular-nums tracking-tight ${
                compactValue
                  ? "truncate text-sm leading-snug"
                  : "text-lg leading-tight"
              }`}
            >
              {value}
            </p>
            {subtitle ? (
              <p className="mt-0.5 text-muted-foreground text-[10px] leading-snug">{subtitle}</p>
            ) : null}
          </div>
          <div className="shrink-0 rounded-md border bg-background/60 p-1.5 shadow-sm backdrop-blur">
            <Icon className="size-3.5 text-foreground/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminWastagePage() {
  const [entries, setEntries] = useState<WastageEntryRow[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [recipesList, setRecipesList] = useState<RecipeRow[]>([]);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordTab, setRecordTab] = useState<"ingredient" | "dish">("ingredient");

  const [pageTab, setPageTab] = useState<"overview" | "reports">("overview");
  const [summary, setSummary] = useState<WastageSummary | null>(null);
  const [periodPreset, setPeriodPreset] = useState<WastagePreset>("this_month");

  const [entrySearch, setEntrySearch] = useState("");
  const [entryKindFilter, setEntryKindFilter] = useState<"all" | "INGREDIENT" | "DISH">("all");
  const [entrySort, setEntrySort] = useState("date-desc");

  const [ingredientItemId, setIngredientItemId] = useState("");
  const [ingredientQty, setIngredientQty] = useState("");
  const [ingredientType, setIngredientType] = useState("SPOILAGE");
  const [ingredientNote, setIngredientNote] = useState("");

  const [dishMenuItemId, setDishMenuItemId] = useState("");
  const [dishVariationId, setDishVariationId] = useState("");
  const [dishQty, setDishQty] = useState("");
  const [dishType, setDishType] = useState("OVERPRODUCTION");
  const [dishNote, setDishNote] = useState("");

  const loadEntries = useCallback(async () => {
    const r = await adminFetch<{ entries: WastageEntryRow[] }>(
      "/api/admin/inventory/wastage/entries",
    );
    setEntries(r.entries);
  }, []);

  const loadItems = useCallback(async () => {
    const r = await adminFetch<{ items: InvItem[] }>("/api/admin/inventory/items");
    setItems(r.items);
  }, []);

  const loadMenu = useCallback(async () => {
    const r = await adminFetch<MenuPayload>("/api/menu");
    setMenu(r);
  }, []);

  const loadRecipes = useCallback(async () => {
    const r = await adminFetch<{ recipes: RecipeRow[] }>("/api/admin/inventory/recipes");
    setRecipesList(r.recipes);
  }, []);

  const loadSummary = useCallback(async (preset: WastagePreset) => {
    const r = await adminFetch<WastageSummary>(
      `/api/admin/inventory/wastage/summary?preset=${encodeURIComponent(preset)}`,
    );
    setSummary(r);
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadEntries(), loadItems(), loadSummary(periodPreset)]);
  }, [loadEntries, loadItems, loadSummary, periodPreset]);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          loadEntries(),
          loadItems(),
          loadMenu(),
          loadRecipes(),
          loadSummary(periodPreset),
        ]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load wastage");
      }
    })();
  }, [loadEntries, loadItems, loadMenu, loadRecipes, loadSummary, periodPreset]);

  const menuItemsWithRecipes = useMemo(() => {
    if (!menu) return [];
    const idsWithRecipes = new Set(recipesList.map((r) => r.menuItemId));
    return menu.items.filter((it) => idsWithRecipes.has(it.id));
  }, [menu, recipesList]);

  const selectedDish = menuItemsWithRecipes.find((it) => it.id === dishMenuItemId);
  const selectedIngredient = items.find((it) => it.id === ingredientItemId);
  const itemOptions = useMemo(() => inventoryItemSelectOptions(items), [items]);

  const filteredEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    let list = entries.filter((e) => {
      if (entryKindFilter !== "all" && e.kind !== entryKindFilter) return false;
      if (!q) return true;
      const hay = [
        e.summary,
        e.note,
        e.wastageTypeLabel,
        e.kind,
        ...e.ingredients.map((i) => `${i.itemName} ${i.qtyBase} ${i.baseUnit}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      switch (entrySort) {
        case "date-asc":
          return a.wastedAt.localeCompare(b.wastedAt);
        case "summary-asc":
          return a.summary.localeCompare(b.summary);
        case "summary-desc":
          return b.summary.localeCompare(a.summary);
        case "type-asc":
          return (
            a.wastageTypeLabel.localeCompare(b.wastageTypeLabel) ||
            b.wastedAt.localeCompare(a.wastedAt)
          );
        default:
          return b.wastedAt.localeCompare(a.wastedAt);
      }
    });
    return list;
  }, [entries, entrySearch, entryKindFilter, entrySort]);

  const wastageTypeChartData = useMemo(
    () =>
      (summary?.charts.byType ?? []).map((w) => ({
        name: w.label,
        cost: paiseToRupeesNumber(w.costPaise),
      })),
    [summary?.charts.byType],
  );

  const wastageItemChartData = useMemo(
    () =>
      (summary?.charts.byItem ?? []).map((w) => ({
        name: w.label,
        cost: paiseToRupeesNumber(w.costPaise),
      })),
    [summary?.charts.byItem],
  );

  const wastageDishChartData = useMemo(
    () =>
      (summary?.charts.byDish ?? []).map((w) => ({
        name: w.label,
        cost: paiseToRupeesNumber(w.costPaise),
      })),
    [summary?.charts.byDish],
  );

  const dailyWastageChartData = useMemo(
    () =>
      (summary?.charts.daily ?? []).map((d) => ({
        name: d.label,
        cost: paiseToRupeesNumber(d.costPaise),
      })),
    [summary?.charts.daily],
  );

  const splitChartData = useMemo(
    () =>
      (summary?.charts.split ?? []).map((s) => ({
        name: s.label,
        value: paiseToRupeesNumber(s.costPaise),
      })),
    [summary?.charts.split],
  );

  const resetIngredientForm = () => {
    setIngredientItemId("");
    setIngredientQty("");
    setIngredientType("SPOILAGE");
    setIngredientNote("");
  };

  const resetDishForm = () => {
    setDishMenuItemId("");
    setDishVariationId("");
    setDishQty("");
    setDishType("OVERPRODUCTION");
    setDishNote("");
  };

  const openRecord = (tab: "ingredient" | "dish" = "ingredient") => {
    setRecordTab(tab);
    setRecordOpen(true);
  };

  const postIngredientWastage = async () => {
    if (!ingredientItemId) {
      toast.error("Select an ingredient");
      return;
    }
    try {
      await adminFetch("/api/admin/inventory/wastage", {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: ingredientItemId,
          qtyBase: ingredientQty,
          wastageType: ingredientType,
          note: ingredientNote,
        }),
      });
      toast.success("Ingredient waste recorded");
      resetIngredientForm();
      setRecordOpen(false);
      await reloadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const postDishWastage = async () => {
    if (!dishMenuItemId || !dishVariationId) {
      toast.error("Select a dish and size");
      return;
    }
    try {
      await adminFetch("/api/admin/inventory/menu-wastage", {
        method: "POST",
        body: JSON.stringify({
          menuItemId: dishMenuItemId,
          variationId: dishVariationId,
          quantity: dishQty,
          wastageType: dishType,
          note: dishNote,
        }),
      });
      toast.success("Dish waste recorded — ingredients deducted via recipe");
      resetDishForm();
      setRecordOpen(false);
      await reloadAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "RECIPE_NOT_FOUND") {
        toast.error("No recipe for this dish — add one under Inventory → Recipes");
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Wastage</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Record ingredient or prepared dish waste and review past entries.
          </p>
        </div>
        <Button type="button" onClick={() => openRecord("ingredient")}>
          <PlusIcon className="mr-2 size-4" aria-hidden />
          Record waste
        </Button>
      </div>

      <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as "overview" | "reports")}>
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs px-3 py-1">
            Overview
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs px-3 py-1">
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Summary and recent entries for the selected period.
            </p>
            <div className="space-y-0.5">
              <Label className="text-muted-foreground text-[10px]">Period</Label>
              <SearchableSelect
                triggerClassName={`${selectControlClassName} h-8 text-xs`}
                options={PERIOD_OPTIONS}
                value={periodPreset}
                onValueChange={(v) => setPeriodPreset((v as WastagePreset) || "this_month")}
                placeholder="Period"
              />
            </div>
          </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Total waste worth"
          value={summary ? formatRupees(summary.kpis.totalCostPaise) : "—"}
          subtitle={
            summary
              ? `${summary.kpis.totalEntryCount} entries · ${summary.range.label}`
              : undefined
          }
          Icon={IndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-rose-500/25 via-rose-400/10 to-transparent"
        />
        <KpiCard
          title="Ingredient waste"
          value={summary ? formatRupees(summary.kpis.ingredientCostPaise) : "—"}
          subtitle={
            summary
              ? `${summary.kpis.ingredientEntryCount} direct ingredient entries`
              : undefined
          }
          Icon={WarehouseIcon}
          gradientClassName="bg-gradient-to-br from-amber-500/25 via-amber-400/10 to-transparent"
        />
        <KpiCard
          title="Dish waste"
          value={summary ? formatRupees(summary.kpis.dishCostPaise) : "—"}
          subtitle={
            summary
              ? `${summary.kpis.dishEntryCount} prepared dish entries · recipe cost`
              : undefined
          }
          Icon={UtensilsCrossedIcon}
          gradientClassName="bg-gradient-to-br from-violet-500/25 via-violet-400/10 to-transparent"
        />
        <KpiCard
          title="Most wasted item"
          compactValue
          value={summary?.topIngredient ? summary.topIngredient.name : "—"}
          subtitle={
            summary?.topIngredient
              ? `${summary.topIngredient.qtyBase} ${summary.topIngredient.baseUnit} · ${formatRupees(summary.topIngredient.costPaise)}`
              : summary
                ? "No ingredient waste in this period"
                : undefined
          }
          Icon={TrendingDownIcon}
          gradientClassName="bg-gradient-to-br from-orange-500/25 via-orange-400/10 to-transparent"
        />
        <KpiCard
          title="Most wasted dish"
          compactValue
          value={summary?.topDish ? summary.topDish.label : "—"}
          subtitle={
            summary?.topDish
              ? `${summary.topDish.qty} portions · ${formatRupees(summary.topDish.costPaise)}`
              : summary
                ? "No dish waste in this period"
                : undefined
          }
          Icon={UtensilsCrossedIcon}
          gradientClassName="bg-gradient-to-br from-indigo-500/25 via-indigo-400/10 to-transparent"
        />
        <KpiCard
          title="Top waste reason"
          compactValue
          value={summary?.topReason ? summary.topReason.label : "—"}
          subtitle={
            summary?.topReason
              ? `${summary.topReason.entryCount} entries · ${formatRupees(summary.topReason.costPaise)}`
              : summary
                ? "No waste recorded in this period"
                : undefined
          }
          Icon={AlertTriangleIcon}
          gradientClassName="bg-gradient-to-br from-slate-500/25 via-slate-400/10 to-transparent"
        />
      </div>
      {summary?.costingNote ? (
        <p className="text-muted-foreground text-[10px]">{summary.costingNote}</p>
      ) : null}

          <div className="space-y-2 border-t pt-3">
            <div>
              <h2 className="font-medium text-sm">Entry list</h2>
              <p className="text-muted-foreground text-xs">
                Recent ingredient and dish waste (latest 100).
              </p>
            </div>

            <DataTableToolbar
              search={entrySearch}
              onSearchChange={setEntrySearch}
              searchPlaceholder="Search item, note, ingredients…"
              sort={entrySort}
              onSortChange={setEntrySort}
              sortOptions={[
                { value: "date-desc", label: "Newest first" },
                { value: "date-asc", label: "Oldest first" },
                { value: "summary-asc", label: "Item (A–Z)" },
                { value: "summary-desc", label: "Item (Z–A)" },
                { value: "type-asc", label: "Waste reason" },
              ]}
              filteredCount={filteredEntries.length}
              totalCount={entries.length}
              showStatusFilter={false}
            >
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Type</Label>
                <SearchableSelect
                  triggerClassName={selectControlClassName}
                  options={[
                    { value: "all", label: "All types" },
                    { value: "INGREDIENT", label: "Ingredient" },
                    { value: "DISH", label: "Dish" },
                  ]}
                  value={entryKindFilter}
                  onValueChange={(v) =>
                    setEntryKindFilter(v as "all" | "INGREDIENT" | "DISH")
                  }
                  placeholder="Type"
                  searchPlaceholder="Search…"
                />
              </div>
            </DataTableToolbar>

            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">When</TableHead>
                    <TableHead className="text-xs h-8">Type</TableHead>
                    <TableHead className="text-xs h-8">What</TableHead>
                    <TableHead className="text-xs h-8">Waste reason</TableHead>
                    <TableHead className="text-xs h-8">Note</TableHead>
                    <TableHead className="text-xs h-8">Ingredients deducted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground text-xs"
                      >
                        No wastage recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground text-xs"
                      >
                        No entries match your search or filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((e) => (
                      <TableRow key={`${e.kind}-${e.id}`}>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs py-2">
                          {formatWastedAt(e.wastedAt)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge
                            variant={e.kind === "DISH" ? "default" : "secondary"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {e.kind === "DISH" ? "Dish" : "Ingredient"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-xs py-2">{e.summary}</TableCell>
                        <TableCell className="text-muted-foreground text-xs py-2">
                          {e.wastageTypeLabel}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-xs py-2">
                          {e.note || "—"}
                        </TableCell>
                        <TableCell className="max-w-md text-muted-foreground text-xs py-2">
                          {formatIngredients(e.ingredients)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-3 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Charts and trends for the selected period.
            </p>
            <div className="space-y-0.5">
              <Label className="text-muted-foreground text-[10px]">Period</Label>
              <SearchableSelect
                triggerClassName={`${selectControlClassName} h-8 text-xs`}
                options={PERIOD_OPTIONS}
                value={periodPreset}
                onValueChange={(v) => setPeriodPreset((v as WastagePreset) || "this_month")}
                placeholder="Period"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <ChartPanel
              title="Ingredient vs dish waste"
              description="Share of total waste cost by source"
              empty={splitChartData.length === 0}
            >
              <PieChart>
                <Pie
                  data={splitChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {splitChartData.map((_, i) => (
                    <Cell key={i} fill={SPLIT_COLORS[i % SPLIT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
              </PieChart>
            </ChartPanel>

            <ChartPanel
              title="Wastage by reason"
              description="Spoilage, prep, overproduction, and other"
              empty={wastageTypeChartData.length === 0}
            >
              <BarChart data={wastageTypeChartData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={chartYAxisRupeeTick} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                <Bar dataKey="cost" fill="#e11d48" radius={[0, 4, 4, 0]} name="Cost" />
              </BarChart>
            </ChartPanel>

            <ChartPanel
              title="Top wasted ingredients"
              description="Estimated cost from inventory unit cost"
              empty={wastageItemChartData.length === 0}
              height={240}
            >
              <BarChart data={wastageItemChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                <Bar dataKey="cost" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Cost" />
              </BarChart>
            </ChartPanel>

            <ChartPanel
              title="Top wasted dishes"
              description="Prepared dish waste by recipe ingredient cost"
              empty={wastageDishChartData.length === 0}
              height={240}
            >
              <BarChart data={wastageDishChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Cost" />
              </BarChart>
            </ChartPanel>

            <div className="rounded-lg border bg-card p-3 shadow-sm lg:col-span-2">
              <div className="mb-2.5">
                <h3 className="font-medium text-sm">Daily wastage cost</h3>
                <p className="text-muted-foreground text-xs">Waste value recorded per day</p>
              </div>
              {dailyWastageChartData.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-xs">
                  No wastage recorded in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyWastageChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={chartYAxisRupeeTick} width={56} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => chartTooltipRupeePair(Number(v) * 100)} />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke="#e11d48"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Cost"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record waste</DialogTitle>
          </DialogHeader>
          <Tabs value={recordTab} onValueChange={(v) => setRecordTab(v as "ingredient" | "dish")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ingredient">
                <WarehouseIcon className="mr-1.5 size-4" aria-hidden />
                Ingredient
              </TabsTrigger>
              <TabsTrigger value="dish">
                <UtensilsCrossedIcon className="mr-1.5 size-4" aria-hidden />
                Prepared dish
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ingredient" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label>Ingredient</Label>
                <SearchableSelect
                  options={itemOptions}
                  value={ingredientItemId}
                  onValueChange={setIngredientItemId}
                  placeholder="Select item…"
                  searchPlaceholder="Search items…"
                />
                {selectedIngredient ? (
                  <p className="text-muted-foreground text-xs">
                    Current stock:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {selectedIngredient.stockOnHandBase} {selectedIngredient.baseUnit}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>
                  Quantity wasted
                  {selectedIngredient ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      ({selectedIngredient.baseUnit})
                    </span>
                  ) : null}
                </Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 1"
                  value={ingredientQty}
                  onChange={(e) => setIngredientQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type of waste</Label>
                <SearchableSelect
                  options={WASTAGE_TYPE_OPTIONS}
                  value={ingredientType}
                  onValueChange={setIngredientType}
                  placeholder="Choose type…"
                />
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Input
                  placeholder="e.g. expired, trimmings"
                  value={ingredientNote}
                  onChange={(e) => setIngredientNote(e.target.value)}
                />
              </div>
            </TabsContent>
            <TabsContent value="dish" className="mt-4 space-y-3">
              {menuItemsWithRecipes.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No dishes with recipes yet. Add recipes under Inventory → Recipes first.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Dish</Label>
                    <SearchableSelect
                      options={menuItemsWithRecipes.map((it) => ({
                        value: it.id,
                        label: it.name,
                        searchText: it.category,
                      }))}
                      value={dishMenuItemId}
                      onValueChange={(v) => {
                        setDishMenuItemId(v);
                        setDishVariationId("");
                      }}
                      placeholder="Select dish…"
                      searchPlaceholder="Search menu…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Size / variation</Label>
                    <SearchableSelect
                      options={(selectedDish?.variations ?? []).map((v) => ({
                        value: v.id,
                        label: `${v.name} · ₹${v.price}`,
                      }))}
                      value={dishVariationId}
                      onValueChange={setDishVariationId}
                      placeholder="Select size…"
                      disabled={!dishMenuItemId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Portions wasted</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 3"
                      value={dishQty}
                      onChange={(e) => setDishQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type of waste</Label>
                    <SearchableSelect
                      options={DISH_WASTAGE_TYPE_OPTIONS}
                      value={dishType}
                      onValueChange={setDishType}
                      placeholder="Choose type…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Note (optional)</Label>
                    <Input
                      placeholder="e.g. end of day, didn't sell"
                      value={dishNote}
                      onChange={(e) => setDishNote(e.target.value)}
                    />
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            {recordTab === "ingredient" ? (
              <Button type="button" onClick={() => void postIngredientWastage()}>
                <Trash2Icon className="mr-2 size-4" aria-hidden />
                Record waste
              </Button>
            ) : (
              <Button
                type="button"
                disabled={menuItemsWithRecipes.length === 0}
                onClick={() => void postDishWastage()}
              >
                <Trash2Icon className="mr-2 size-4" aria-hidden />
                Record dish waste
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
