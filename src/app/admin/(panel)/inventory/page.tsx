"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDownIcon,
  BanknoteIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  FlameIcon,
  HistoryIcon,
  IndianRupeeIcon,
  PaperclipIcon,
  PencilIcon,
  PlusCircleIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshCwIcon,
  Settings2Icon,
  Trash2Icon,
  TruckIcon,
  WalletIcon,
  WarehouseIcon,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { toast } from "sonner";

import {
  AdminChartGridSkeleton,
  AdminInventorySkeleton,
  AdminKpiGridSkeleton,
  AdminTableSkeleton,
} from "@/components/admin/admin-page-skeleton";
import { PurchaseBillField } from "@/components/admin/purchase-bill-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
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
  DataTableToolbar,
  type ActiveFilter,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import { PillRankChartCard } from "@/components/admin/pill-rank-chart";
import { SortableTableHead } from "@/components/admin/sortable-table-head";
import {
  chartTooltipRupeePair,
  formatRecipeCostRupees,
  formatRupees,
  formatRupeesAmount,
  paiseToRupeesInput,
  paiseToRupeesNumber,
  rupeesToPaise,
} from "@/lib/payroll/payroll-utils";
import { formatRecipeQtyBase } from "@/lib/inventory/decimal-utils";
import type { PurchaseBill } from "@/lib/inventory/purchase-bills";
import { useQueryParam } from "@/hooks/use-query-param";
import { usePermittedTabs } from "@/hooks/use-permitted-tabs";
import { useTabParam } from "@/hooks/use-tab-param";

function cx(...x: Array<string | false | null | undefined>): string {
  return x.filter(Boolean).join(" ");
}

type Summary = {
  settings?: {
    costingMethod: string;
    restoreStockOnCancel: boolean;
    allowNegativeStock: boolean;
  };
  expiry?: ExpiryReport;
  kpis: {
    totalInventoryValuePaise: number;
    activeItemsCount: number;
    activeSuppliersCount: number;
    lowStockCount: number;
    nearExpiryBatchesCount: number;
    expiredBatchesCount: number;
    supplierPayablePaise: number;
    overduePurchasesCount: number;
    overduePurchasesPaise: number;
    costingMethod: string;
  };
  charts: {
    valueByCategory: { label: string; valuePaise: number }[];
    topItemsByValue: { label: string; valuePaise: number }[];
    lowestItemsByValue: { label: string; valuePaise: number }[];
    supplierPayables: { label: string; balancePaise: number }[];
    lowestSupplierPayables: { label: string; balancePaise: number }[];
    stockHealth: { label: string; count: number }[];
    movementsLast30Days: { type: string; label: string; count: number }[];
  };
  lowStock: {
    id: string;
    name: string;
    baseUnit: string;
    stockOnHandBase: string;
    minStockBase: string;
  }[];
  supplierBalances: {
    supplierId: string;
    supplierName: string;
    balancePaise: number;
  }[];
  overduePurchases: {
    id: string;
    batchRef: string;
    supplierName: string;
    totalPaise: number;
    dueAt: string | null;
    purchasedAt: string;
  }[];
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
  compact?: boolean;
}) {
  const { title, value, subtitle, Icon, gradientClassName, compact } = props;
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className={`absolute inset-0 opacity-70 ${gradientClassName}`} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/35 to-background/90" />
      <div className={cx("relative", compact ? "p-2.5" : "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cx(
                "text-muted-foreground",
                compact ? "text-[11px] leading-tight" : "text-sm",
              )}
            >
              {title}
            </p>
            <p
              className={cx(
                "mt-0.5 font-semibold tabular-nums tracking-tight",
                compact ? "truncate text-base" : "text-2xl",
              )}
            >
              {value}
            </p>
            {subtitle ? (
              <p
                className={cx(
                  "mt-0.5 text-muted-foreground",
                  compact ? "line-clamp-2 text-[10px] leading-tight" : "text-xs",
                )}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          <div
            className={cx(
              "shrink-0 rounded-lg border bg-background/60 shadow-sm backdrop-blur",
              compact ? "p-1.5" : "rounded-xl p-2",
            )}
          >
            <Icon className={cx("text-foreground/80", compact ? "size-4" : "size-5")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInfoButton(props: { hintId: string; children: React.ReactNode }) {
  const { hintId, children } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/35 bg-muted/60 font-serif text-[11px] font-bold text-muted-foreground leading-none transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Show help for this field"
        aria-expanded={open}
        aria-controls={open ? hintId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open ? (
        <div
          id={hintId}
          role="tooltip"
          className="absolute top-full left-0 z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-md border bg-popover px-3 py-2 text-popover-foreground text-xs leading-relaxed shadow-md"
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

function InventoryFieldLabel(props: {
  htmlFor: string;
  label: string;
  hint: React.ReactNode;
}) {
  const { htmlFor, label, hint } = props;
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="mb-0">
        {label}
      </Label>
      <FieldInfoButton hintId={`${htmlFor}-hint`}>{hint}</FieldInfoButton>
    </div>
  );
}

const CATEGORY_ADD_NEW = "__add_new_category__";

function InventoryCategoryField(props: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const { id, value, onChange, suggestions } = props;
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    if (!value) {
      setAddingNew(false);
      return;
    }
    if (!suggestions.includes(value)) setAddingNew(true);
  }, [value, suggestions]);

  if (suggestions.length === 0) {
    return (
      <Input
        id={id}
        placeholder="e.g. Dairy"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const categoryOptions: SearchableSelectOption[] = [
    ...suggestions.map((c) => ({ value: c, label: c })),
    { value: CATEGORY_ADD_NEW, label: "+ Add new category" },
  ];

  const selectValue = addingNew
    ? CATEGORY_ADD_NEW
    : value && suggestions.includes(value)
      ? value
      : "";

  return (
    <div className="space-y-2">
      <SearchableSelect
        id={id}
        options={categoryOptions}
        value={selectValue}
        onValueChange={(v) => {
          if (v === CATEGORY_ADD_NEW) {
            setAddingNew(true);
            onChange("");
            return;
          }
          setAddingNew(false);
          onChange(v);
        }}
        placeholder="Choose category…"
        searchPlaceholder="Search categories…"
      />
      {addingNew ? (
        <Input
          placeholder="New category name (e.g. Dairy)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="New category name"
        />
      ) : null}
    </div>
  );
}

type InvItem = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  purchaseUnit: string;
  baseUnitsPerPurchaseUnit: string;
  stockOnHandBase: string;
  minStockBase: string;
  avgCostPaisePerBase: string;
  lastPurchasePaisePerBase: string;
  active: boolean;
  yieldLink?: {
    sourceItemId: string;
    sourceItemName: string;
    yieldPercent: number;
  } | null;
};

/** Convert stored paise-per-base cost → ₹ input for 1 purchase unit. */
function avgCostToRateRupeesInput(
  avgCostPaisePerBase: string,
  baseUnitsPerPurchaseUnit: string,
): string {
  const cost = Number(avgCostPaisePerBase);
  const conv = Number(baseUnitsPerPurchaseUnit);
  if (!Number.isFinite(cost) || !Number.isFinite(conv) || conv <= 0 || cost <= 0) {
    return "";
  }
  return paiseToRupeesInput(Math.round(cost * conv));
}

function costingMethodLabel(method: string | undefined): string {
  if (method === "LATEST_PURCHASE") return "latest purchase";
  if (method === "FIFO") return "FIFO (oldest first)";
  return "moving average";
}

/** Unit cost in paise per base unit (respects inventory costing method). */
function itemUnitCostPaise(
  item: InvItem | undefined,
  costingMethod: string | undefined,
): number {
  if (!item) return 0;
  // FIFO keeps avgCost as remaining-weighted for display; true COGS uses batches.
  const unitCost = Number(
    costingMethod === "LATEST_PURCHASE"
      ? item.lastPurchasePaisePerBase
      : item.avgCostPaisePerBase,
  );
  return Number.isFinite(unitCost) ? unitCost : 0;
}

/** Current rate in paise for one purchase unit, deriving linked items from source yield. */
function itemRatePaisePerPurchaseUnit(
  item: InvItem,
  items: InvItem[],
  costingMethod: string | undefined,
): number {
  let unitCost = itemUnitCostPaise(item, costingMethod);
  if (item.yieldLink) {
    const source = items.find((candidate) => candidate.id === item.yieldLink?.sourceItemId);
    const yieldFraction = item.yieldLink.yieldPercent / 100;
    if (source && yieldFraction > 0) {
      unitCost = itemUnitCostPaise(source, costingMethod) / yieldFraction;
    }
  }

  const unitsPerPurchase = Number(item.baseUnitsPerPurchaseUnit);
  if (!Number.isFinite(unitCost) || unitCost <= 0) return 0;
  if (!Number.isFinite(unitsPerPurchase) || unitsPerPurchase <= 0) return 0;
  return Math.round(unitCost * unitsPerPurchase);
}

/** On-hand stock × unit cost (same basis as inventory summary / charts). */
function itemStockValuePaise(
  item: InvItem,
  costingMethod: string | undefined,
): number {
  // Yield-linked cook items do not hold stock — value lives on the source.
  if (item.yieldLink) return 0;
  const qty = Number(item.stockOnHandBase);
  const unitCost = itemUnitCostPaise(item, costingMethod);
  if (!Number.isFinite(qty) || unitCost <= 0) return 0;
  return Math.round(qty * unitCost);
}

/** Recipe line: qty (base) × unit cost. */
function recipeIngredientValuePaise(
  item: InvItem | undefined,
  qtyBase: string,
  costingMethod: string | undefined,
): number {
  const qty = Number(qtyBase);
  const unitCost = itemUnitCostPaise(item, costingMethod);
  if (!Number.isFinite(qty) || qty <= 0 || unitCost <= 0) return 0;
  return qty * unitCost;
}

function isMenuItemRecipeLine(
  ing: RecipeIngredientRow,
): ing is Extract<RecipeIngredientRow, { kind: "menu_item" }> {
  return ing.kind === "menu_item" || Boolean(ing.componentMenuItemId);
}

/** When a dish has exactly one variation, recipes should target it (not "All variations"). */
function soleVariationId(
  variations: { id: string }[] | undefined,
): string | null {
  return variations?.length === 1 ? variations[0]!.id : null;
}

const recipeByNewest = (a: RecipeRow, b: RecipeRow) =>
  b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version;

/** Pick the best matching recipe version for a menu item (+ optional variation). */
function pickRecipeForComponent(
  recipes: RecipeRow[],
  menuItemId: string,
  variationId: string | null,
): RecipeRow | null {
  const candidates = recipes.filter((r) => r.menuItemId === menuItemId);
  if (candidates.length === 0) return null;
  if (variationId) {
    const specific = candidates
      .filter((r) => r.variationId === variationId)
      .sort(recipeByNewest)[0];
    if (specific) return specific;
  }
  return (
    candidates.filter((r) => r.variationId === null).sort(recipeByNewest)[0] ??
    candidates.sort(recipeByNewest)[0] ??
    null
  );
}

/** Latest recipe for a specific variation (no null/"all" fallback). */
function pickLatestRecipeForVariation(
  recipes: RecipeRow[],
  menuItemId: string,
  variationId: string,
): RecipeRow | null {
  return (
    recipes
      .filter((r) => r.menuItemId === menuItemId && r.variationId === variationId)
      .sort(recipeByNewest)[0] ?? null
  );
}

function recipeIngredientLineKey(ln: {
  kind: "inventory" | "menu_item";
  inventoryItemId: string;
  componentMenuItemId: string;
  componentVariationId: string;
}): string {
  if (ln.kind === "inventory") return `inv:${ln.inventoryItemId}`;
  return `menu:${ln.componentMenuItemId}:${ln.componentVariationId || ""}`;
}

function recipeIngredientRowKey(ing: RecipeIngredientRow): string {
  if (isMenuItemRecipeLine(ing)) {
    return `menu:${ing.componentMenuItemId}:${ing.componentVariationId || ""}`;
  }
  return `inv:${ing.inventoryItemId}`;
}

/** Client-side cost estimate including nested menu-item components. */
function recipeRowCostPaise(
  row: RecipeRow,
  allRecipes: RecipeRow[],
  items: InvItem[],
  costingMethod: string | undefined,
  stack: string[] = [],
): number {
  if (stack.includes(row.menuItemId) || stack.length >= 8) return 0;
  const nextStack = [...stack, row.menuItemId];
  let sum = 0;
  for (const ing of row.ingredients) {
    if (isMenuItemRecipeLine(ing)) {
      const child = pickRecipeForComponent(
        allRecipes,
        ing.componentMenuItemId,
        ing.componentVariationId,
      );
      if (!child) continue;
      const yieldQty = Number(child.yieldQty);
      const nestedQty = Number(ing.qtyBase);
      if (!Number.isFinite(yieldQty) || yieldQty <= 0 || !Number.isFinite(nestedQty)) {
        continue;
      }
      const factor = nestedQty / yieldQty;
      sum +=
        recipeRowCostPaise(child, allRecipes, items, costingMethod, nextStack) *
        factor;
      continue;
    }
    sum += recipeIngredientValuePaise(
      items.find((i) => i.id === ing.inventoryItemId),
      ing.qtyBase,
      costingMethod,
    );
  }
  return sum;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** ISO datetime → "12th May 2026" (calendar date only). */
function formatEffectiveDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.slice(0, 10);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return iso.slice(0, 10);
  const j = day % 10;
  const k = day % 100;
  const suffix =
    j === 1 && k !== 11 ? "st" : j === 2 && k !== 12 ? "nd" : j === 3 && k !== 13 ? "rd" : "th";
  return `${day}${suffix} ${MONTH_NAMES[month - 1]} ${year}`;
}

type Supplier = {
  id: string;
  name: string;
  phone: string;
  address: string;
  active: boolean;
  balancePaise: number;
  purchaseCount: number;
  totalPurchasesPaise: number;
};

type SupplierProfileStats = {
  balancePaise: number;
  totalPurchasesPaise: number;
  purchaseCount: number;
  totalPaidPaise: number;
  totalReturnsPaise: number;
  hasOpeningBalance: boolean;
  openingBalancePaise: number;
  openingBalanceAt: string | null;
  openingBalanceNote: string;
};

type SupplierLedgerEntryRow = {
  id: string;
  occurredAt: string;
  kind: string;
  debitPaise: number;
  creditPaise: number;
  referenceType: string;
  referenceId: string;
  note: string;
  paymentReference?: string;
  paymentMethod?: string;
  balancePaise: number;
};

const SUPPLIER_LEDGER_KIND_LABELS: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  PURCHASE_DEBIT: "Purchase",
  PAYMENT_CREDIT: "Payment",
  RETURN_CREDIT: "Purchase return",
};

function supplierLedgerEntryLabel(entry: {
  kind: string;
  referenceType: string;
}): string {
  if (entry.referenceType === "opening_balance") return "Opening balance";
  return SUPPLIER_LEDGER_KIND_LABELS[entry.kind] ?? entry.kind;
}

function emptySupplierProfileStats(): SupplierProfileStats {
  return {
    balancePaise: 0,
    totalPurchasesPaise: 0,
    purchaseCount: 0,
    totalPaidPaise: 0,
    totalReturnsPaise: 0,
    hasOpeningBalance: false,
    openingBalancePaise: 0,
    openingBalanceAt: null,
    openingBalanceNote: "",
  };
}

function buildSupplierStats(
  supplierId: string,
  purchaseRows: PurchaseRow[],
  ledgerEntries: SupplierLedgerEntryRow[],
  summaryBalancePaise?: number,
): SupplierProfileStats {
  const supplierPurchases = purchaseRows.filter((p) => p.supplierId === supplierId);
  let totalPaidPaise = 0;
  let totalReturnsPaise = 0;
  for (const e of ledgerEntries) {
    if (e.kind === "PAYMENT_CREDIT") totalPaidPaise += e.creditPaise;
    if (e.kind === "RETURN_CREDIT") totalReturnsPaise += e.creditPaise;
  }
  const opening = ledgerEntries.find(
    (e) => e.kind === "OPENING_BALANCE" || e.referenceType === "opening_balance",
  );
  const balancePaise =
    ledgerEntries.length > 0
      ? ledgerEntries[ledgerEntries.length - 1]!.balancePaise
      : (summaryBalancePaise ?? 0);

  return {
    balancePaise,
    totalPurchasesPaise: supplierPurchases.reduce((s, p) => s + p.totalPaise, 0),
    purchaseCount: supplierPurchases.length,
    totalPaidPaise,
    totalReturnsPaise,
    hasOpeningBalance: opening !== undefined,
    openingBalancePaise: opening?.debitPaise ?? 0,
    openingBalanceAt: opening?.occurredAt ?? null,
    openingBalanceNote: opening?.note ?? "",
  };
}

type PurchaseRow = {
  id: string;
  batchRef: string;
  supplierId: string;
  supplierName: string;
  purchasedAt: string;
  paymentType: string;
  dueAt: string | null;
  totalPaise: number;
  lineCount: number;
  bills?: PurchaseBill[];
};

type PurchaseDetailLine = {
  id: string;
  inventoryItemId: string;
  itemName: string;
  category: string;
  baseUnit: string;
  purchaseUnit: string;
  baseUnitsPerPurchaseUnit: string;
  qtyPurchase: string;
  ratePaisePerPurchaseUnit: number;
  lineTotalPaise: number;
  qtyBaseReceived: string;
  remainingQtyBase: string | null;
  expiryDate: string | null;
  lotCode: string;
};

type PurchaseDetail = {
  id: string;
  batchRef: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  purchasedAt: string;
  paymentType: string;
  creditDays: number | null;
  dueAt: string | null;
  totalPaise: number;
  notes: string;
  bills?: PurchaseBill[];
  createdAt: string;
  editable: boolean;
  lines: PurchaseDetailLine[];
  returns: {
    id: string;
    returnedAt: string;
    totalCreditPaise: number;
    lineCount: number;
    notes: string;
  }[];
};

type RecipeIngredientRow =
  | {
      kind?: "inventory";
      inventoryItemId: string;
      qtyBase: string;
      componentMenuItemId?: never;
      componentVariationId?: never;
      componentMenuItemName?: never;
    }
  | {
      kind: "menu_item";
      componentMenuItemId: string;
      componentMenuItemName?: string;
      componentVariationId: string | null;
      qtyBase: string;
      inventoryItemId?: never;
    };

type RecipeRow = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  variationId: string | null;
  effectiveFrom: string;
  label: string;
  yieldQty: string;
  yieldUnit: string;
  version: number;
  ingredients: RecipeIngredientRow[];
};

type MenuItemVariationCoverageRow = {
  menuItemId: string;
  menuItemName: string;
  category: string;
  variationId: string | null;
  variationName: string;
  versionCount: number;
  status: "missing" | "complete";
};

type AllTabRow =
  | { kind: "recipe"; recipe: RecipeRow }
  | { kind: "missing"; row: MenuItemVariationCoverageRow };

type RecipeSortContext = {
  recipeVariationLabel: (menuItemId: string, variationId: string | null) => string;
  recipeCostPaise: (r: RecipeRow) => number;
  recipeMenuSellingPriceSortValue: (
    menuItemId: string,
    variationId: string | null,
  ) => number;
};

function compareRecipeRows(
  a: RecipeRow,
  b: RecipeRow,
  recipeSort: string,
  ctx: RecipeSortContext,
): number {
  const byMenu = () =>
    a.menuItemName.localeCompare(b.menuItemName) ||
    b.effectiveFrom.localeCompare(a.effectiveFrom);

  switch (recipeSort) {
    case "menu-asc":
      return byMenu();
    case "menu-desc":
      return (
        b.menuItemName.localeCompare(a.menuItemName) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom)
      );
    case "variation-asc":
    case "variation-desc": {
      const aVar = ctx.recipeVariationLabel(a.menuItemId, a.variationId);
      const bVar = ctx.recipeVariationLabel(b.menuItemId, b.variationId);
      const cmp = aVar.localeCompare(bVar) || byMenu();
      return recipeSort === "variation-desc" ? -cmp : cmp;
    }
    case "version-asc":
      return a.version - b.version || byMenu();
    case "version-desc":
      return b.version - a.version || byMenu();
    case "date-asc":
      return a.effectiveFrom.localeCompare(b.effectiveFrom) || byMenu();
    case "date-desc":
      return b.effectiveFrom.localeCompare(a.effectiveFrom) || byMenu();
    case "ingredients-asc":
      return a.ingredients.length - b.ingredients.length || byMenu();
    case "ingredients-desc":
      return b.ingredients.length - a.ingredients.length || byMenu();
    case "cost-asc":
      return ctx.recipeCostPaise(a) - ctx.recipeCostPaise(b) || byMenu();
    case "cost-desc":
      return ctx.recipeCostPaise(b) - ctx.recipeCostPaise(a) || byMenu();
    case "price-asc":
      return (
        ctx.recipeMenuSellingPriceSortValue(a.menuItemId, a.variationId) -
          ctx.recipeMenuSellingPriceSortValue(b.menuItemId, b.variationId) ||
        byMenu()
      );
    case "price-desc":
      return (
        ctx.recipeMenuSellingPriceSortValue(b.menuItemId, b.variationId) -
          ctx.recipeMenuSellingPriceSortValue(a.menuItemId, a.variationId) ||
        byMenu()
      );
    default:
      return b.effectiveFrom.localeCompare(a.effectiveFrom) || byMenu();
  }
}

function compareAllTabRows(
  a: AllTabRow,
  b: AllTabRow,
  recipeSort: string,
  ctx: RecipeSortContext,
): number {
  if (a.kind === "recipe" && b.kind === "recipe") {
    return compareRecipeRows(a.recipe, b.recipe, recipeSort, ctx);
  }

  const menuA = a.kind === "recipe" ? a.recipe.menuItemName : a.row.menuItemName;
  const menuB = b.kind === "recipe" ? b.recipe.menuItemName : b.row.menuItemName;
  const varA =
    a.kind === "recipe"
      ? ctx.recipeVariationLabel(a.recipe.menuItemId, a.recipe.variationId)
      : a.row.variationName;
  const varB =
    b.kind === "recipe"
      ? ctx.recipeVariationLabel(b.recipe.menuItemId, b.recipe.variationId)
      : b.row.variationName;

  if (a.kind === "missing" && b.kind === "missing") {
    switch (recipeSort) {
      case "menu-desc":
        return menuB.localeCompare(menuA) || varB.localeCompare(varA);
      case "variation-desc":
        return varB.localeCompare(varA) || menuB.localeCompare(menuA);
      case "variation-asc":
        return varA.localeCompare(varB) || menuA.localeCompare(menuB);
      default:
        return menuA.localeCompare(menuB) || varA.localeCompare(varB);
    }
  }

  const metricSort =
    recipeSort.startsWith("date-") ||
    recipeSort.startsWith("version-") ||
    recipeSort.startsWith("ingredients-") ||
    recipeSort.startsWith("cost-") ||
    recipeSort.startsWith("price-");
  if (metricSort) {
    return a.kind === "recipe" ? -1 : 1;
  }

  switch (recipeSort) {
    case "menu-desc": {
      const cmp = menuB.localeCompare(menuA);
      if (cmp !== 0) return cmp;
      break;
    }
    case "variation-desc": {
      const cmp = varB.localeCompare(varA);
      if (cmp !== 0) return cmp;
      if (menuA !== menuB) return menuA.localeCompare(menuB);
      break;
    }
    case "variation-asc": {
      const cmp = varA.localeCompare(varB);
      if (cmp !== 0) return cmp;
      if (menuA !== menuB) return menuA.localeCompare(menuB);
      break;
    }
    default: {
      const cmp = menuA.localeCompare(menuB);
      if (cmp !== 0) return cmp;
      const varCmp = varA.localeCompare(varB);
      if (varCmp !== 0) return varCmp;
    }
  }

  return a.kind === "recipe" ? -1 : 1;
}

type MovementRow = {
  id: string;
  itemName: string;
  baseUnit: string;
  occurredAt: string;
  type: string;
  typeLabel: string;
  qtyDeltaBase: string;
  note: string;
};

const emptySupplierForm = {
  name: "",
  phone: "",
  address: "",
  openingBalanceRupees: "",
  openingBalanceNote: "",
};

const emptyItemForm = {
  name: "",
  category: "",
  baseUnit: "g",
  purchaseUnit: "kg",
  baseUnitsPerPurchaseUnit: "1000",
  minStockBase: "0",
  unitCostRupees: "",
  yieldSourceItemId: "",
  yieldPercent: "",
};

const ITEM_SORT_VALUES = new Set([
  "name-asc",
  "name-desc",
  "category-asc",
  "category-desc",
  "units-asc",
  "units-desc",
  "stock-asc",
  "stock-desc",
  "rate-asc",
  "rate-desc",
  "value-asc",
  "value-desc",
  "status-asc",
  "status-desc",
]);

const RECIPE_SORT_VALUES = new Set([
  "menu-asc",
  "menu-desc",
  "variation-asc",
  "variation-desc",
  "version-asc",
  "version-desc",
  "date-asc",
  "date-desc",
  "ingredients-asc",
  "ingredients-desc",
  "cost-asc",
  "cost-desc",
  "price-asc",
  "price-desc",
]);

const SUPPLIER_SORT_VALUES = new Set([
  "name-asc",
  "name-desc",
  "phone-asc",
  "phone-desc",
  "purchases-asc",
  "purchases-desc",
  "balance-asc",
  "balance-desc",
  "status-asc",
  "status-desc",
]);

const ACTIVE_FILTER_VALUES = new Set<ActiveFilter>(["all", "active", "inactive"]);

const STOCK_FILTER_OPTIONS: SearchableSelectOption[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low stock only" },
];

const PURCHASE_PAYMENT_FILTER_OPTIONS: SearchableSelectOption[] = [
  { value: "all", label: "All types" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CREDIT", label: "Credit" },
];

const PAYMENT_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "CASH", label: "CASH" },
  { value: "CHEQUE", label: "CHEQUE" },
  { value: "CREDIT", label: "CREDIT" },
];

const ADJUSTMENT_DIRECTION_OPTIONS: SearchableSelectOption[] = [
  { value: "up", label: "Add to stock", searchText: "increase more" },
  { value: "down", label: "Remove from stock", searchText: "decrease less" },
];

const ADJUSTMENT_REASON_OPTIONS: SearchableSelectOption[] = [
  { value: "CORRECTION", label: "Count was wrong (correction)" },
  { value: "DAMAGE", label: "Damaged / unusable" },
  { value: "AUDIT_MISMATCH", label: "Stock check mismatch" },
  { value: "THEFT", label: "Theft or loss" },
  { value: "OTHER", label: "Other" },
];

const SUPPLIER_PAYMENT_METHOD_OPTIONS: SearchableSelectOption[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

type OpsMenuId =
  | "opening"
  | "kitchen"
  | "adjustment"
  | "recipe_reconcile"
  | "payment"
  | "activity"
  | "settings";

type RecipeReconcileLineRow = {
  inventoryItemId: string;
  name: string;
  baseUnit: string;
  deductedBase: string;
  shouldBase: string;
  priorCorrectionBase: string;
  effectiveDeductedBase: string;
  deltaBase: string;
  direction: "up" | "down" | "none";
  qtyBase: string;
};

type RecipeReconcileMode = "current" | "at_sale";

type RecipeReconcilePreview = {
  scopeKey: string;
  mode: RecipeReconcileMode;
  recipeAsOf: string;
  fromDate: string | null;
  toDate: string | null;
  orderCount: number;
  lines: RecipeReconcileLineRow[];
  changeCount: number;
  appliedCount?: number;
};

const RECIPE_RECONCILE_MODE_OPTIONS: SearchableSelectOption[] = [
  {
    value: "current",
    label: "Current recipes apply to all past sales",
    searchText: "as of now rewrite history wrong recipe",
  },
  {
    value: "at_sale",
    label: "Respect recipe dates — only genuine drift",
    searchText: "effective from historical at sale time",
  },
];

const OPS_MENU_SECTIONS: {
  group: string;
  items: {
    id: OpsMenuId;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[];
}[] = [
  {
    group: "Change stock",
    items: [
      { id: "opening", label: "Add opening / extra stock", Icon: PlusCircleIcon },
      { id: "kitchen", label: "Record kitchen use", Icon: FlameIcon },
      { id: "adjustment", label: "Fix stock count", Icon: ArrowUpDownIcon },
      {
        id: "recipe_reconcile",
        label: "Fix after recipe change",
        Icon: RefreshCwIcon,
      },
    ],
  },
  {
    group: "Payments",
    items: [{ id: "payment", label: "Pay a supplier", Icon: WalletIcon }],
  },
  {
    group: "Review & settings",
    items: [
      { id: "activity", label: "Activity log", Icon: HistoryIcon },
      { id: "settings", label: "Inventory settings", Icon: Settings2Icon },
    ],
  },
];

function inventoryItemSelectOptions(items: InvItem[]): SearchableSelectOption[] {
  return items
    .filter((x) => x.active)
    .map((it) => ({
      value: it.id,
      label: `${it.name} (${it.baseUnit})`,
      searchText: `${it.name} ${it.category}`,
    }));
}

function supplierSelectOptions(
  suppliers: Supplier[],
  activeOnly = false,
): SearchableSelectOption[] {
  const list = activeOnly ? suppliers.filter((s) => s.active) : suppliers;
  return list.map((s) => ({ value: s.id, label: s.name }));
}

function isLowStock(item: InvItem): boolean {
  // Linked cook items reorder on the source — ignore their local min stock.
  if (item.yieldLink) return false;
  const stock = Number(item.stockOnHandBase);
  const min = Number(item.minStockBase);
  return Number.isFinite(stock) && Number.isFinite(min) && min > 0 && stock < min;
}

function StockOpsMenuButton(props: {
  active: boolean;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  const { active, label, Icon, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-transparent bg-transparent hover:border-border hover:bg-muted/50",
      )}
    >
      <Icon
        className={cx(
          "size-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className={cx("min-w-0 text-sm", active && "font-semibold")}>{label}</span>
    </button>
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

/** Stock in purchase (conversion) units, max 2 decimals. */
function formatStockInPurchaseUnits(item: {
  stockOnHandBase: string;
  baseUnitsPerPurchaseUnit: string;
  purchaseUnit: string;
  baseUnit: string;
}): string {
  const stock = Number(item.stockOnHandBase);
  const factor = Number(item.baseUnitsPerPurchaseUnit);
  if (!Number.isFinite(stock)) {
    return `${item.stockOnHandBase} ${item.baseUnit}`;
  }
  if (!Number.isFinite(factor) || factor <= 0) {
    return `${formatRecipeQtyBase(stock)} ${item.baseUnit}`;
  }
  return `${formatRecipeQtyBase(stock / factor)} ${item.purchaseUnit}`;
}

function ItemOnHandHint(props: { item: InvItem | undefined }) {
  const { item } = props;
  if (!item) return null;
  return (
    <p className="text-muted-foreground text-xs">
      Current stock:{" "}
      <span className="font-medium text-foreground tabular-nums">
        {formatStockInPurchaseUnits(item)}
      </span>
    </p>
  );
}

type QtyEntryUnit = "base" | "purchase";

function convertQtyToBaseUnits(
  qty: string,
  unit: QtyEntryUnit,
  baseUnitsPerPurchaseUnit: string,
): string | null {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === "base") return String(n);
  const factor = Number(baseUnitsPerPurchaseUnit);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return String(n * factor);
}

function formatMovementQty(delta: string): { text: string; positive: boolean; negative: boolean } {
  const n = Number(delta);
  if (!Number.isFinite(n)) return { text: delta, positive: false, negative: false };
  if (n > 0) return { text: `+${delta}`, positive: true, negative: false };
  if (n < 0) return { text: delta, positive: false, negative: true };
  return { text: delta, positive: false, negative: false };
}

function InventoryItemSelect(props: {
  value: string;
  onChange: (value: string) => void;
  items: InvItem[];
  className?: string;
}) {
  const { value, onChange, items, className } = props;
  const options = useMemo(() => {
    const base = inventoryItemSelectOptions(items);
    if (value && !base.some((o) => o.value === value)) {
      const it = items.find((i) => i.id === value);
      if (it) {
        return [
          {
            value: it.id,
            label: `${it.name} (${it.baseUnit})`,
            searchText: `${it.name} ${it.category}`,
          },
          ...base,
        ];
      }
    }
    return base;
  }, [items, value]);
  return (
    <SearchableSelect
      className={className}
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder="Select item…"
      searchPlaceholder="Search items…"
    />
  );
}

type MenuPayload = {
  items: {
    id: string;
    name: string;
    category: string;
    variations: { id: string; name: string; price: number }[];
  }[];
};

type ExpiryReport = {
  days: number;
  expired: {
    batchId: string;
    inventoryItemId: string;
    itemName: string;
    baseUnit: string;
    expiryDate: string;
    receivedAt: string;
    lotCode: string;
    remainingQtyBase: string;
  }[];
  nearExpiry: {
    batchId: string;
    inventoryItemId: string;
    itemName: string;
    baseUnit: string;
    expiryDate: string;
    receivedAt: string;
    lotCode: string;
    remainingQtyBase: string;
  }[];
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

export default function AdminInventoryPage() {
  const { activeTab, setActiveTab, canTab } = usePermittedTabs({
    pagePath: "/admin/inventory",
    defaultTab: "overview",
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [tabsReady, setTabsReady] = useState<Record<string, boolean>>({});
  const settingsLoadedRef = useRef(false);
  const itemsLoadedRef = useRef(false);
  const suppliersLoadedRef = useRef(false);
  const purchasesLoadedRef = useRef(false);
  const recipesLoadedRef = useRef(false);
  const menuLoadedRef = useRef(false);
  const movementsLoadedRef = useRef(false);
  const stockSalesLoadedRef = useRef(false);
  const loadingTabRef = useRef<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<InvItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [expiry, setExpiry] = useState<ExpiryReport | null>(null);
  const [settings, setSettings] = useState<{
    costingMethod: string;
    restoreStockOnCancel: boolean;
    allowNegativeStock: boolean;
  } | null>(null);

  const loadSummary = useCallback(async () => {
    const s = await adminFetch<Summary>("/api/admin/inventory/reports/summary");
    setSummary(s);
    if (s.settings) {
      setSettings(s.settings);
      settingsLoadedRef.current = true;
    }
    if (s.expiry) {
      setExpiry(s.expiry);
    }
  }, []);

  const loadItems = useCallback(async () => {
    const r = await adminFetch<{ items: InvItem[] }>("/api/admin/inventory/items");
    setItems(r.items);
    itemsLoadedRef.current = true;
  }, []);

  const loadSuppliers = useCallback(async () => {
    const r = await adminFetch<{ suppliers: Supplier[] }>(
      "/api/admin/inventory/suppliers",
    );
    setSuppliers(r.suppliers);
    suppliersLoadedRef.current = true;
  }, []);

  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [recipesList, setRecipesList] = useState<RecipeRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [stockSales, setStockSales] = useState<
    {
      id: string;
      inventoryItemId: string;
      soldAt: string;
      qtyBase: string;
      ratePaisePerBase: string;
      totalPaise: number;
      costPaise: number;
      buyerName: string;
      note: string;
      item: { name: string; baseUnit: string };
    }[]
  >([]);

  const loadPurchases = useCallback(async () => {
    const r = await adminFetch<{ purchases: PurchaseRow[] }>(
      "/api/admin/inventory/purchases",
    );
    setPurchases(r.purchases);
    purchasesLoadedRef.current = true;
  }, []);

  const loadRecipesList = useCallback(async () => {
    const r = await adminFetch<{ recipes: RecipeRow[] }>("/api/admin/inventory/recipes");
    setRecipesList(r.recipes);
    recipesLoadedRef.current = true;
  }, []);

  const loadMovements = useCallback(async () => {
    const r = await adminFetch<{ movements: MovementRow[] }>(
      "/api/admin/inventory/movements",
    );
    setMovements(r.movements);
    movementsLoadedRef.current = true;
  }, []);

  const loadStockSales = useCallback(async () => {
    const r = await adminFetch<{
      entries: {
        id: string;
        inventoryItemId: string;
        soldAt: string;
        qtyBase: string;
        ratePaisePerBase: string;
        totalPaise: number;
        costPaise: number;
        buyerName: string;
        note: string;
        item: { name: string; baseUnit: string };
      }[];
    }>("/api/admin/inventory/stock-sales?limit=100");
    setStockSales(r.entries);
    stockSalesLoadedRef.current = true;
  }, []);

  const loadMenu = useCallback(async () => {
    // Slim catalog only (id/name/category/variations) — not full /api/menu.
    const data = await adminFetch<{ menu?: MenuPayload }>(
      "/api/admin/inventory/bootstrap?tab=recipes&have=settings,items,recipes",
    );
    if (data.menu) {
      setMenu(data.menu);
      menuLoadedRef.current = true;
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const r = await adminFetch<{
      costingMethod: string;
      restoreStockOnCancel: boolean;
      allowNegativeStock: boolean;
    }>("/api/admin/inventory/settings");
    setSettings(r);
    settingsLoadedRef.current = true;
  }, []);

  const loadExpiry = useCallback(async () => {
    const r = await adminFetch<ExpiryReport>("/api/admin/inventory/reports/expiry?days=7");
    setExpiry(r);
  }, []);

  type TabBootstrap = {
    tab: string;
    settings?: {
      costingMethod: string;
      restoreStockOnCancel: boolean;
      allowNegativeStock: boolean;
    };
    items?: InvItem[];
    suppliers?: Supplier[];
    purchases?: PurchaseRow[];
    recipes?: RecipeRow[];
    menu?: MenuPayload;
    movements?: MovementRow[];
    stockSales?: typeof stockSales;
  };

  const loadTabBootstrap = useCallback(async (tab: string) => {
    const partsByTab: Record<string, string[]> = {
      items: ["settings", "items"],
      suppliers: ["suppliers", "purchases"],
      purchase: ["purchases", "suppliers", "items"],
      recipes: ["settings", "recipes", "menu", "items"],
      sell: ["stockSales", "items"],
      ops: ["settings", "movements", "items"],
    };
    const needed = partsByTab[tab] ?? [];
    const have: string[] = [];
    if (settingsLoadedRef.current) have.push("settings");
    if (itemsLoadedRef.current) have.push("items");
    if (suppliersLoadedRef.current) have.push("suppliers");
    if (purchasesLoadedRef.current) have.push("purchases");
    if (recipesLoadedRef.current) have.push("recipes");
    if (menuLoadedRef.current) have.push("menu");
    if (movementsLoadedRef.current) have.push("movements");
    if (stockSalesLoadedRef.current) have.push("stockSales");

    // Shared caches mean tab switches after the first visit are instant.
    if (needed.length > 0 && needed.every((p) => have.includes(p))) {
      return;
    }

    const qs = new URLSearchParams({ tab });
    if (have.length) qs.set("have", have.join(","));

    const data = await adminFetch<TabBootstrap>(
      `/api/admin/inventory/bootstrap?${qs.toString()}`,
    );

    if (data.settings) {
      setSettings(data.settings);
      settingsLoadedRef.current = true;
    }
    if (data.items) {
      setItems(data.items);
      itemsLoadedRef.current = true;
    }
    if (data.suppliers) {
      setSuppliers(data.suppliers);
      suppliersLoadedRef.current = true;
    }
    if (data.purchases) {
      setPurchases(data.purchases);
      purchasesLoadedRef.current = true;
    }
    if (data.recipes) {
      setRecipesList(data.recipes);
      recipesLoadedRef.current = true;
    }
    if (data.menu) {
      setMenu(data.menu);
      menuLoadedRef.current = true;
    }
    if (data.movements) {
      setMovements(data.movements);
      movementsLoadedRef.current = true;
    }
    if (data.stockSales) {
      setStockSales(data.stockSales);
      stockSalesLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (tabsReady[activeTab]) {
      setInitialLoading(false);
      return;
    }

    let cancelled = false;
    const tab = activeTab;
    loadingTabRef.current = tab;

    void (async () => {
      try {
        if (tab === "overview") {
          await loadSummary();
        } else if (
          tab === "items" ||
          tab === "suppliers" ||
          tab === "purchase" ||
          tab === "recipes" ||
          tab === "sell" ||
          tab === "ops"
        ) {
          await loadTabBootstrap(tab);
        } else {
          await loadSummary();
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load inventory");
        }
      } finally {
        if (loadingTabRef.current === tab) {
          loadingTabRef.current = null;
        }
        if (!cancelled) {
          setTabsReady((prev) =>
            prev[tab] ? prev : { ...prev, [tab]: true },
          );
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTabRef.current === tab) {
        loadingTabRef.current = null;
      }
    };
  }, [activeTab, tabsReady, loadSummary, loadTabBootstrap]);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [duplicatingItem, setDuplicatingItem] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const openAddItem = () => {
    setEditingItemId(null);
    setDuplicatingItem(false);
    setItemForm(emptyItemForm);
    setItemDialogOpen(true);
  };

  const openEditItem = (item: InvItem) => {
    setEditingItemId(item.id);
    setDuplicatingItem(false);
    setItemForm({
      name: item.name,
      category: item.category,
      baseUnit: item.baseUnit,
      purchaseUnit: item.purchaseUnit,
      baseUnitsPerPurchaseUnit: item.baseUnitsPerPurchaseUnit,
      minStockBase: item.minStockBase,
      unitCostRupees: avgCostToRateRupeesInput(
        item.avgCostPaisePerBase,
        item.baseUnitsPerPurchaseUnit,
      ),
      yieldSourceItemId: item.yieldLink?.sourceItemId ?? "",
      yieldPercent: item.yieldLink
        ? String(item.yieldLink.yieldPercent)
        : "",
    });
    setItemDialogOpen(true);
  };

  const openDuplicateItem = (item: InvItem) => {
    setEditingItemId(null);
    setDuplicatingItem(true);
    setItemForm({
      name: `${item.name} (copy)`,
      category: item.category,
      baseUnit: item.baseUnit,
      purchaseUnit: item.purchaseUnit,
      baseUnitsPerPurchaseUnit: item.baseUnitsPerPurchaseUnit,
      minStockBase: item.minStockBase,
      unitCostRupees: avgCostToRateRupeesInput(
        item.avgCostPaisePerBase,
        item.baseUnitsPerPurchaseUnit,
      ),
      yieldSourceItemId: item.yieldLink?.sourceItemId ?? "",
      yieldPercent: item.yieldLink
        ? String(item.yieldLink.yieldPercent)
        : "",
    });
    setItemDialogOpen(true);
  };

  const saveItem = async () => {
    const name = itemForm.name.trim();
    if (!name) {
      toast.error("Item name is required");
      return;
    }
    if (!itemForm.baseUnit.trim() || !itemForm.purchaseUnit.trim()) {
      toast.error("Base unit and purchase unit are required");
      return;
    }
    if (itemForm.yieldSourceItemId) {
      const pct = Number(itemForm.yieldPercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        toast.error("Yield % must be between 1 and 100");
        return;
      }
      if (editingItemId && itemForm.yieldSourceItemId === editingItemId) {
        toast.error("Item cannot come from itself");
        return;
      }
    }
    const { unitCostRupees, yieldSourceItemId, yieldPercent, ...itemFields } =
      itemForm;
    const hasYieldLink = yieldSourceItemId.trim() !== "";
    const payload: Record<string, unknown> = {
      ...itemFields,
      // Linked cook items reorder/cost from the source — clear local min stock.
      minStockBase: hasYieldLink ? "0" : itemFields.minStockBase,
    };
    if (!hasYieldLink && unitCostRupees.trim() !== "") {
      payload.ratePaisePerPurchaseUnit = rupeesToPaise(unitCostRupees);
    }
    if (hasYieldLink) {
      payload.yieldSourceItemId = yieldSourceItemId.trim();
      payload.yieldPercent = Number(yieldPercent);
    } else {
      payload.yieldSourceItemId = null;
      payload.yieldPercent = null;
    }
    try {
      if (editingItemId) {
        await adminFetch(`/api/admin/inventory/items/${editingItemId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Item updated");
      } else {
        await adminFetch("/api/admin/inventory/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(duplicatingItem ? "Item duplicated" : "Item added");
      }
      setItemDialogOpen(false);
      setEditingItemId(null);
      setDuplicatingItem(false);
      setItemForm(emptyItemForm);
      await loadItems();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const [deletingItem, setDeletingItem] = useState<InvItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const confirmDeleteItem = async () => {
    if (!deletingItem) return;
    setDeleteSubmitting(true);
    try {
      const res = await adminFetch<{ deleted?: boolean; archived?: boolean }>(
        `/api/admin/inventory/items/${deletingItem.id}`,
        { method: "DELETE" },
      );
      if (res.archived) {
        toast.success(
          `"${deletingItem.name}" is used in existing records, so it was archived (deactivated) to keep history intact.`,
        );
      } else {
        toast.success(`"${deletingItem.name}" deleted`);
      }
      setDeletingItem(null);
      await loadItems();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);

  const openAddSupplier = () => {
    setEditingSupplierId(null);
    setSupplierForm(emptySupplierForm);
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplierId(s.id);
    setSupplierForm({
      name: s.name,
      phone: s.phone,
      address: s.address,
      openingBalanceRupees: "",
      openingBalanceNote: "",
    });
    setSupplierDialogOpen(true);
  };

  const saveSupplier = async () => {
    const name = supplierForm.name.trim();
    if (!name) {
      toast.error("Supplier name is required");
      return;
    }
    const payload = {
      name,
      phone: supplierForm.phone.trim(),
      address: supplierForm.address.trim(),
    };
    try {
      if (editingSupplierId) {
        await adminFetch(`/api/admin/inventory/suppliers/${editingSupplierId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Supplier updated");
      } else {
        const openingPaise = rupeesToPaise(supplierForm.openingBalanceRupees);
        await adminFetch("/api/admin/inventory/suppliers", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            ...(openingPaise > 0
              ? {
                  openingBalancePaise: openingPaise,
                  openingBalanceNote: supplierForm.openingBalanceNote.trim() || undefined,
                }
              : {}),
          }),
        });
        toast.success(
          openingPaise > 0 ? "Supplier added with opening balance" : "Supplier added",
        );
      }
      setSupplierDialogOpen(false);
      setEditingSupplierId(null);
      setSupplierForm(emptySupplierForm);
      await loadSuppliers();
      await loadSummary();
      if (editingSupplierId && profileSupplier?.id === editingSupplierId) {
        await loadSupplierProfile(editingSupplierId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [supplierDeleteSubmitting, setSupplierDeleteSubmitting] = useState(false);

  const [profileSupplier, setProfileSupplier] = useState<Supplier | null>(null);
  const [supplierProfileStats, setSupplierProfileStats] =
    useState<SupplierProfileStats | null>(null);
  const [supplierLedgerEntries, setSupplierLedgerEntries] = useState<
    SupplierLedgerEntryRow[]
  >([]);
  const [supplierProfileTab, setSupplierProfileTab] = useState("purchases");
  const [supplierProfileLoading, setSupplierProfileLoading] = useState(false);
  const [openingBalanceRupees, setOpeningBalanceRupees] = useState("");
  const [openingBalanceNote, setOpeningBalanceNote] = useState("");
  const [openingBalanceSubmitting, setOpeningBalanceSubmitting] = useState(false);
  const [openingBalanceRemoving, setOpeningBalanceRemoving] = useState(false);
  const emptyProfilePayment = {
    amountRupees: "",
    method: "upi",
    transactionId: "",
    note: "",
  };
  const [profilePayment, setProfilePayment] = useState(emptyProfilePayment);
  const [profilePaymentSubmitting, setProfilePaymentSubmitting] = useState(false);

  const loadSupplierProfile = useCallback(
    async (supplierId: string) => {
      setSupplierProfileLoading(true);
      const summaryBalance = summary?.supplierBalances.find(
        (b) => b.supplierId === supplierId,
      )?.balancePaise;

      try {
        const ledger = await adminFetch<{ entries: SupplierLedgerEntryRow[] }>(
          `/api/admin/inventory/suppliers/${supplierId}/ledger`,
        );
        setSupplierLedgerEntries(ledger.entries);
        setSupplierProfileStats(
          buildSupplierStats(supplierId, purchases, ledger.entries, summaryBalance),
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load supplier ledger",
        );
      }

      try {
        const detail = await adminFetch<{
          supplier: Supplier;
          stats: SupplierProfileStats;
        }>(`/api/admin/inventory/suppliers/${supplierId}`);
        setProfileSupplier(detail.supplier);
        setSupplierProfileStats(detail.stats);
      } catch {
        // Keep ledger- and purchase-derived stats when detail endpoint is unavailable.
      } finally {
        setSupplierProfileLoading(false);
      }
    },
    [purchases, summary],
  );

  const openSupplierProfile = (s: Supplier) => {
    setSupplierProfileTab("purchases");
    setOpeningBalanceRupees("");
    setOpeningBalanceNote("");
    setProfilePayment(emptyProfilePayment);
    setProfileSupplier(s);
    const summaryBalance = summary?.supplierBalances.find(
      (b) => b.supplierId === s.id,
    )?.balancePaise;
    setSupplierProfileStats(
      buildSupplierStats(s.id, purchases, [], summaryBalance),
    );
    setSupplierLedgerEntries([]);
    void loadSupplierProfile(s.id);
  };

  const closeSupplierProfile = () => {
    setProfileSupplier(null);
    setSupplierProfileStats(null);
    setSupplierLedgerEntries([]);
    setOpeningBalanceRupees("");
    setOpeningBalanceNote("");
    setProfilePayment(emptyProfilePayment);
  };

  const submitProfilePayment = async () => {
    if (!profileSupplier) return;
    const amountPaise = rupeesToPaise(profilePayment.amountRupees);
    if (amountPaise <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setProfilePaymentSubmitting(true);
    try {
      await adminFetch("/api/admin/inventory/payments", {
        method: "POST",
        body: JSON.stringify({
          supplierId: profileSupplier.id,
          amountPaise,
          method: profilePayment.method,
          reference: profilePayment.transactionId.trim(),
          note: profilePayment.note.trim(),
        }),
      });
      toast.success("Payment recorded");
      setProfilePayment(emptyProfilePayment);
      await Promise.all([
        loadSupplierProfile(profileSupplier.id),
        loadSummary(),
        loadSuppliers(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setProfilePaymentSubmitting(false);
    }
  };

  const submitOpeningBalance = async () => {
    if (!profileSupplier) return;
    const amountPaise = rupeesToPaise(openingBalanceRupees);
    if (amountPaise <= 0) {
      toast.error("Enter a valid opening balance amount");
      return;
    }
    setOpeningBalanceSubmitting(true);
    try {
      await adminFetch(
        `/api/admin/inventory/suppliers/${profileSupplier.id}/opening-balance`,
        {
          method: "POST",
          body: JSON.stringify({
            amountPaise,
            note: openingBalanceNote.trim() || undefined,
          }),
        },
      );
      toast.success("Opening balance recorded");
      setOpeningBalanceRupees("");
      setOpeningBalanceNote("");
      await Promise.all([
        loadSupplierProfile(profileSupplier.id),
        loadSummary(),
        loadSuppliers(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save opening balance");
    } finally {
      setOpeningBalanceSubmitting(false);
    }
  };

  const removeOpeningBalance = async () => {
    if (!profileSupplier) return;
    setOpeningBalanceRemoving(true);
    try {
      await adminFetch(
        `/api/admin/inventory/suppliers/${profileSupplier.id}/opening-balance`,
        { method: "DELETE" },
      );
      toast.success("Opening balance removed");
      setOpeningBalanceRupees("");
      setOpeningBalanceNote("");
      await Promise.all([
        loadSupplierProfile(profileSupplier.id),
        loadSummary(),
        loadSuppliers(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove opening balance");
    } finally {
      setOpeningBalanceRemoving(false);
    }
  };

  const refreshProfileIfOpen = useCallback(
    async (supplierId?: string) => {
      if (!profileSupplier) return;
      if (supplierId && profileSupplier.id !== supplierId) return;
      await loadSupplierProfile(profileSupplier.id);
    },
    [profileSupplier, loadSupplierProfile],
  );

  const confirmDeleteSupplier = async () => {
    if (!deletingSupplier) return;
    setSupplierDeleteSubmitting(true);
    try {
      const res = await adminFetch<{ archived?: boolean }>(
        `/api/admin/inventory/suppliers/${deletingSupplier.id}`,
        { method: "DELETE" },
      );
      if (res.archived) {
        toast.success(
          `"${deletingSupplier.name}" has purchase history, so it was archived (deactivated) to keep records intact.`,
        );
      } else {
        toast.success(`"${deletingSupplier.name}" deleted`);
      }
      setDeletingSupplier(null);
      if (profileSupplier?.id === deletingSupplier.id) {
        setProfileSupplier(null);
        setSupplierProfileStats(null);
        setSupplierLedgerEntries([]);
      }
      await loadSuppliers();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSupplierDeleteSubmitting(false);
    }
  };

  const [purchase, setPurchase] = useState({
    supplierId: "",
    paymentType: "CREDIT",
    purchasedAt: new Date().toISOString().slice(0, 16),
    creditDays: "",
    notes: "",
  });
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);

  type PurchaseLineDraft = {
    id: string;
    inventoryItemId: string;
    qtyPurchase: string;
    rateRupees: string;
    expiryDate: string;
    lotCode: string;
  };
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineDraft[]>([
    {
      id: crypto.randomUUID(),
      inventoryItemId: "",
      qtyPurchase: "1",
      rateRupees: "",
      expiryDate: "",
      lotCode: "",
    },
  ]);

  const purchaseTotalPaise = useMemo(() => {
    let sum = 0;
    for (const ln of purchaseLines) {
      const qty = Number(ln.qtyPurchase);
      const ratePaise = rupeesToPaise(ln.rateRupees);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (ratePaise < 0) continue;
      sum += Math.round(qty * ratePaise);
    }
    return sum;
  }, [purchaseLines]);

  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editingPurchaseBatchRef, setEditingPurchaseBatchRef] = useState<string | null>(
    null,
  );
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);

  const resetPurchaseForm = () => {
    setPurchase({
      supplierId: "",
      paymentType: "CREDIT",
      purchasedAt: new Date().toISOString().slice(0, 16),
      creditDays: "",
      notes: "",
    });
    setPurchaseLines([
      {
        id: crypto.randomUUID(),
        inventoryItemId: "",
        qtyPurchase: "1",
        rateRupees: "",
        expiryDate: "",
        lotCode: "",
      },
    ]);
    setEditingPurchaseId(null);
    setEditingPurchaseBatchRef(null);
    setPurchaseBills([]);
  };

  const openNewPurchase = () => {
    resetPurchaseForm();
    setPurchaseDialogOpen(true);
  };

  const openEditPurchase = (detail: PurchaseDetail) => {
    if (!detail.editable) {
      toast.error(
        "This purchase can’t be edited because some received stock has already been used or returned.",
      );
      return;
    }
    setEditingPurchaseId(detail.id);
    setEditingPurchaseBatchRef(detail.batchRef);
    setPurchase({
      supplierId: detail.supplierId,
      paymentType: detail.paymentType,
      purchasedAt: detail.purchasedAt.slice(0, 16),
      creditDays:
        detail.creditDays !== null && detail.creditDays !== undefined
          ? String(detail.creditDays)
          : "",
      notes: detail.notes,
    });
    setPurchaseBills(detail.bills ?? []);
    setPurchaseLines(
      detail.lines.map((ln) => ({
        id: crypto.randomUUID(),
        inventoryItemId: ln.inventoryItemId,
        qtyPurchase: ln.qtyPurchase,
        rateRupees: paiseToRupeesInput(ln.ratePaisePerPurchaseUnit),
        expiryDate: ln.expiryDate ? ln.expiryDate.slice(0, 10) : "",
        lotCode: ln.lotCode,
      })),
    );
    setViewingPurchase(null);
    setPurchaseDetail(null);
    setPurchaseDialogOpen(true);
  };

  const openEditPurchaseFromRow = async (p: PurchaseRow) => {
    try {
      const r = await adminFetch<{ purchase: PurchaseDetail }>(
        `/api/admin/inventory/purchases/${p.id}`,
      );
      openEditPurchase(r.purchase);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load purchase");
    }
  };

  const submitPurchase = async () => {
    setPurchaseSubmitting(true);
    try {
      const payload = {
        supplierId: purchase.supplierId,
        paymentType: purchase.paymentType,
        purchasedAt: new Date(purchase.purchasedAt).toISOString(),
        creditDays:
          purchase.paymentType === "CREDIT" && purchase.creditDays.trim()
            ? Number(purchase.creditDays)
            : undefined,
        notes: purchase.notes.trim() || undefined,
        bills: purchaseBills,
        lines: purchaseLines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          qtyPurchase: l.qtyPurchase,
          ratePaisePerPurchaseUnit: rupeesToPaise(l.rateRupees),
          expiryDate: l.expiryDate ? new Date(l.expiryDate).toISOString() : undefined,
          lotCode: l.lotCode || undefined,
        })),
      };
      if (editingPurchaseId) {
        await adminFetch(`/api/admin/inventory/purchases/${editingPurchaseId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success(
          editingPurchaseBatchRef
            ? `Purchase ${editingPurchaseBatchRef} updated`
            : "Purchase updated",
        );
      } else {
        await adminFetch("/api/admin/inventory/purchases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Purchase recorded");
      }
      setPurchaseDialogOpen(false);
      const supplierId = purchase.supplierId;
      resetPurchaseForm();
      await Promise.all([
        loadItems(),
        loadSummary(),
        loadSuppliers(),
        loadPurchases(),
        loadMovements(),
        refreshProfileIfOpen(supplierId),
      ]);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : editingPurchaseId
            ? "Update failed"
            : "Purchase failed",
      );
    } finally {
      setPurchaseSubmitting(false);
    }
  };

  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRow | null>(null);
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetail | null>(null);
  const [purchaseDetailLoading, setPurchaseDetailLoading] = useState(false);

  const openPurchaseDetail = (p: PurchaseRow) => {
    setViewingPurchase(p);
    setPurchaseDetail(null);
    setPurchaseDetailLoading(true);
    void (async () => {
      try {
        const r = await adminFetch<{ purchase: PurchaseDetail }>(
          `/api/admin/inventory/purchases/${p.id}`,
        );
        setPurchaseDetail(r.purchase);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load purchase details",
        );
      } finally {
        setPurchaseDetailLoading(false);
      }
    })();
  };

  const savePurchaseBills = async (purchaseId: string, bills: PurchaseBill[]) => {
    try {
      const r = await adminFetch<{ bills: PurchaseBill[] }>(
        `/api/admin/inventory/purchases/${purchaseId}/bills`,
        { method: "PUT", body: JSON.stringify({ bills }) },
      );
      setPurchaseDetail((prev) => (prev ? { ...prev, bills: r.bills } : prev));
      setPurchases((prev) =>
        prev.map((p) => (p.id === purchaseId ? { ...p, bills: r.bills } : p)),
      );
      setViewingPurchase((prev) =>
        prev && prev.id === purchaseId ? { ...prev, bills: r.bills } : prev,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save bill");
    }
  };

  const [deletingPurchase, setDeletingPurchase] = useState<PurchaseRow | null>(null);
  const [purchaseDeleteSubmitting, setPurchaseDeleteSubmitting] = useState(false);

  const confirmDeletePurchase = async () => {
    if (!deletingPurchase) return;
    setPurchaseDeleteSubmitting(true);
    try {
      await adminFetch(`/api/admin/inventory/purchases/${deletingPurchase.id}`, {
        method: "DELETE",
      });
      toast.success(`Purchase ${deletingPurchase.batchRef} deleted and reversed`);
      if (viewingPurchase?.id === deletingPurchase.id) {
        setViewingPurchase(null);
        setPurchaseDetail(null);
      }
      setDeletingPurchase(null);
      await Promise.all([
        loadItems(),
        loadSummary(),
        loadSuppliers(),
        loadPurchases(),
        loadMovements(),
        refreshProfileIfOpen(deletingPurchase.supplierId),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setPurchaseDeleteSubmitting(false);
    }
  };

  const [recipe, setRecipe] = useState({
    menuItemId: "",
    variationId: "",
    effectiveFrom: new Date().toISOString().slice(0, 16),
    yieldQty: "1",
    yieldUnit: "",
  });

  type RecipeIngredientDraft = {
    id: string;
    kind: "inventory" | "menu_item";
    inventoryItemId: string;
    componentMenuItemId: string;
    componentVariationId: string;
    /** Qty for the active (selected) variation. */
    qtyBase: string;
    /** Variation-wise qtys when viewing/editing all variations. */
    qtyByVariationId: Record<string, string>;
  };

  const emptyRecipeIngredient = (
    kind: "inventory" | "menu_item" = "inventory",
  ): RecipeIngredientDraft => ({
    id: crypto.randomUUID(),
    kind,
    inventoryItemId: "",
    componentMenuItemId: "",
    componentVariationId: "",
    qtyBase: "",
    qtyByVariationId: {},
  });

  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([
    emptyRecipeIngredient(),
  ]);

  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingRecipeVersion, setEditingRecipeVersion] = useState<number | null>(
    null,
  );
  const [copyingRecipe, setCopyingRecipe] = useState(false);
  const [recipeSubmitting, setRecipeSubmitting] = useState(false);
  /** Show a Qty column per variation in the ingredients table. */
  const [showAllVariationQtys, setShowAllVariationQtys] = useState(false);

  const recipeIngredientFromRow = (
    ing: RecipeIngredientRow,
    variationId?: string | null,
  ): RecipeIngredientDraft => {
    const qtyBase = formatRecipeQtyBase(ing.qtyBase);
    const qtyByVariationId =
      variationId && qtyBase ? { [variationId]: qtyBase } : {};
    if (isMenuItemRecipeLine(ing)) {
      const compItem = (menu?.items ?? []).find(
        (x) => x.id === ing.componentMenuItemId,
      );
      return {
        id: crypto.randomUUID(),
        kind: "menu_item",
        inventoryItemId: "",
        componentMenuItemId: ing.componentMenuItemId,
        componentVariationId:
          ing.componentVariationId ||
          soleVariationId(compItem?.variations) ||
          "",
        qtyBase,
        qtyByVariationId,
      };
    }
    return {
      id: crypto.randomUUID(),
      kind: "inventory",
      inventoryItemId: ing.inventoryItemId,
      componentMenuItemId: "",
      componentVariationId: "",
      qtyBase,
      qtyByVariationId,
    };
  };

  /** Merge sibling variation recipes into a qty-per-variation matrix. */
  const mergeSiblingVariationQtys = (
    lines: RecipeIngredientDraft[],
    menuItemId: string,
    variations: { id: string; name: string }[],
    activeVariationId: string,
  ): RecipeIngredientDraft[] => {
    const byKey = new Map<string, RecipeIngredientDraft>();

    const ensureLine = (
      key: string,
      base: Omit<RecipeIngredientDraft, "id" | "qtyBase" | "qtyByVariationId"> & {
        qtyBase?: string;
        qtyByVariationId?: Record<string, string>;
      },
    ) => {
      let row = byKey.get(key);
      if (!row) {
        row = {
          id: crypto.randomUUID(),
          kind: base.kind,
          inventoryItemId: base.inventoryItemId,
          componentMenuItemId: base.componentMenuItemId,
          componentVariationId: base.componentVariationId,
          qtyBase: "",
          qtyByVariationId: {},
        };
        byKey.set(key, row);
      }
      return row;
    };

    // Seed from saved sibling recipes first…
    for (const v of variations) {
      const sibling = pickLatestRecipeForVariation(
        recipesList,
        menuItemId,
        v.id,
      );
      if (!sibling) continue;
      for (const ing of sibling.ingredients) {
        const key = recipeIngredientRowKey(ing);
        const qty = formatRecipeQtyBase(ing.qtyBase);
        if (!qty) continue;
        if (isMenuItemRecipeLine(ing)) {
          const compItem = (menu?.items ?? []).find(
            (x) => x.id === ing.componentMenuItemId,
          );
          const row = ensureLine(key, {
            kind: "menu_item",
            inventoryItemId: "",
            componentMenuItemId: ing.componentMenuItemId,
            componentVariationId:
              ing.componentVariationId ||
              soleVariationId(compItem?.variations) ||
              "",
          });
          row.qtyByVariationId[v.id] = qty;
        } else {
          const row = ensureLine(key, {
            kind: "inventory",
            inventoryItemId: ing.inventoryItemId,
            componentMenuItemId: "",
            componentVariationId: "",
          });
          row.qtyByVariationId[v.id] = qty;
        }
      }
    }

    // …then overlay the in-form lines so unsaved edits win.
    for (const ln of lines) {
      const key =
        ln.kind === "inventory" && !ln.inventoryItemId
          ? `draft:${ln.id}`
          : ln.kind === "menu_item" && !ln.componentMenuItemId
            ? `draft:${ln.id}`
            : recipeIngredientLineKey(ln);
      const row = ensureLine(key, ln);
      row.kind = ln.kind;
      row.inventoryItemId = ln.inventoryItemId;
      row.componentMenuItemId = ln.componentMenuItemId;
      row.componentVariationId = ln.componentVariationId;
      for (const [vid, q] of Object.entries(ln.qtyByVariationId)) {
        if (q) row.qtyByVariationId[vid] = q;
      }
      const activeQty =
        (activeVariationId && ln.qtyByVariationId[activeVariationId]) ||
        ln.qtyBase;
      if (activeVariationId && activeQty) {
        row.qtyByVariationId[activeVariationId] = activeQty;
      }
    }

    const merged = [...byKey.values()].map((ln) => ({
      ...ln,
      qtyBase: activeVariationId
        ? (ln.qtyByVariationId[activeVariationId] ?? "")
        : ln.qtyBase,
    }));

    return merged.length > 0 ? merged : [emptyRecipeIngredient()];
  };

  const setIngredientQtyForVariation = (
    lineId: string,
    variationId: string | null,
    value: string,
  ) => {
    setRecipeIngredients((x) =>
      x.map((r) => {
        if (r.id !== lineId) return r;
        const qtyByVariationId = { ...r.qtyByVariationId };
        if (variationId) {
          if (value) qtyByVariationId[variationId] = value;
          else delete qtyByVariationId[variationId];
        }
        const isActive =
          !variationId ||
          variationId === recipe.variationId ||
          !recipe.variationId;
        return {
          ...r,
          qtyByVariationId,
          qtyBase: isActive ? value : r.qtyBase,
        };
      }),
    );
  };

  const resetRecipeForm = () => {
    setRecipe({
      menuItemId: "",
      variationId: "",
      effectiveFrom: new Date().toISOString().slice(0, 16),
      yieldQty: "1",
      yieldUnit: "",
    });
    setRecipeIngredients([emptyRecipeIngredient()]);
    setEditingRecipeId(null);
    setEditingRecipeVersion(null);
    setCopyingRecipe(false);
    setShowAllVariationQtys(false);
  };

  const resolveRecipeVariationId = (
    menuItemId: string,
    variationId?: string | null,
  ) => {
    if (variationId) return variationId;
    const item = (menu?.items ?? []).find((x) => x.id === menuItemId);
    return soleVariationId(item?.variations) ?? "";
  };

  const openNewRecipe = (prefill?: {
    menuItemId?: string;
    variationId?: string;
  }) => {
    setActiveTab("recipes");
    resetRecipeForm();
    if (prefill?.menuItemId) {
      setRecipe({
        menuItemId: prefill.menuItemId,
        variationId: resolveRecipeVariationId(
          prefill.menuItemId,
          prefill.variationId,
        ),
        effectiveFrom: new Date().toISOString().slice(0, 16),
        yieldQty: "1",
        yieldUnit: "",
      });
    }
    setRecipeDialogOpen(true);
  };

  const openEditRecipe = (row: RecipeRow) => {
    setActiveTab("recipes");
    setEditingRecipeId(row.id);
    setEditingRecipeVersion(row.version);
    setCopyingRecipe(false);
    setRecipe({
      menuItemId: row.menuItemId,
      variationId: resolveRecipeVariationId(row.menuItemId, row.variationId),
      effectiveFrom: row.effectiveFrom.slice(0, 16),
      yieldQty: row.yieldQty || "1",
      yieldUnit: row.yieldUnit || "",
    });
    const variationId = resolveRecipeVariationId(
      row.menuItemId,
      row.variationId,
    );
    setRecipeIngredients(
      row.ingredients.length > 0
        ? row.ingredients.map((ing) =>
            recipeIngredientFromRow(ing, variationId || row.variationId),
          )
        : [emptyRecipeIngredient()],
    );
    setShowAllVariationQtys(false);
    setRecipeDialogOpen(true);
  };

  /** Prefill a new version from an existing recipe (does not edit the source). */
  const openCopyRecipe = (row: RecipeRow) => {
    setActiveTab("recipes");
    setEditingRecipeId(null);
    setEditingRecipeVersion(null);
    setCopyingRecipe(true);
    const variationId = resolveRecipeVariationId(
      row.menuItemId,
      row.variationId,
    );
    setRecipe({
      menuItemId: row.menuItemId,
      variationId,
      effectiveFrom: new Date().toISOString().slice(0, 16),
      yieldQty: row.yieldQty || "1",
      yieldUnit: row.yieldUnit || "",
    });
    setRecipeIngredients(
      row.ingredients.length > 0
        ? row.ingredients.map((ing) =>
            recipeIngredientFromRow(ing, variationId || row.variationId),
          )
        : [emptyRecipeIngredient()],
    );
    setShowAllVariationQtys(false);
    setRecipeDialogOpen(true);
  };

  const ingredientsPayloadForVariation = (variationId: string | null) => {
    return recipeIngredients
      .map((x) => {
        const qty =
          variationId && showAllVariationQtys
            ? (x.qtyByVariationId[variationId] ?? "")
            : x.qtyBase;
        return { ...x, qty };
      })
      .filter((x) =>
        x.kind === "inventory"
          ? x.inventoryItemId && x.qty
          : x.componentMenuItemId && x.qty,
      )
      .map((x) => {
        if (x.kind === "inventory") {
          return {
            inventoryItemId: x.inventoryItemId,
            qtyBase: x.qty,
          };
        }
        const compItem = (menu?.items ?? []).find(
          (it) => it.id === x.componentMenuItemId,
        );
        return {
          componentMenuItemId: x.componentMenuItemId,
          componentVariationId:
            x.componentVariationId ||
            soleVariationId(compItem?.variations) ||
            null,
          qtyBase: x.qty,
        };
      });
  };

  const recipePayload = (variationIdOverride?: string | null) => {
    const selectedMenuItem = (menu?.items ?? []).find(
      (it) => it.id === recipe.menuItemId,
    );
    const variationId =
      variationIdOverride !== undefined
        ? variationIdOverride
        : recipe.variationId ||
          soleVariationId(selectedMenuItem?.variations) ||
          null;
    return {
      menuItemId: recipe.menuItemId,
      variationId,
      effectiveFrom: new Date(recipe.effectiveFrom).toISOString(),
      yieldQty: recipe.yieldQty || "1",
      yieldUnit: recipe.yieldUnit.trim(),
      ingredients: ingredientsPayloadForVariation(variationId),
    };
  };

  const recipeTotalValuePaise = useMemo(() => {
    const draftAsRow: RecipeRow = {
      id: "draft",
      menuItemId: recipe.menuItemId,
      menuItemName: "",
      variationId: recipe.variationId || null,
      effectiveFrom: recipe.effectiveFrom,
      label: "",
      yieldQty: recipe.yieldQty || "1",
      yieldUnit: recipe.yieldUnit,
      version: 0,
      ingredients: recipeIngredients
        .filter((x) =>
          x.kind === "inventory"
            ? x.inventoryItemId && x.qtyBase
            : x.componentMenuItemId && x.qtyBase,
        )
        .map((x) =>
          x.kind === "inventory"
            ? {
                kind: "inventory" as const,
                inventoryItemId: x.inventoryItemId,
                qtyBase: x.qtyBase,
              }
            : {
                kind: "menu_item" as const,
                componentMenuItemId: x.componentMenuItemId,
                componentVariationId: x.componentVariationId || null,
                qtyBase: x.qtyBase,
              },
        ),
    };
    return recipeRowCostPaise(
      draftAsRow,
      recipesList,
      items,
      settings?.costingMethod,
    );
  }, [
    recipe.menuItemId,
    recipe.variationId,
    recipe.effectiveFrom,
    recipe.yieldQty,
    recipe.yieldUnit,
    recipeIngredients,
    recipesList,
    items,
    settings?.costingMethod,
  ]);

  const submitRecipe = async (mode: "update" | "new") => {
    if (recipeSubmitting) return;
    const selectedMenuItem = (menu?.items ?? []).find(
      (it) => it.id === recipe.menuItemId,
    );
    if (
      selectedMenuItem &&
      selectedMenuItem.variations.length > 0 &&
      !recipe.variationId
    ) {
      toast.error("Select a variation — each variation needs its own recipe");
      return;
    }
    setRecipeSubmitting(true);
    try {
      const multiVars =
        showAllVariationQtys &&
        selectedMenuItem &&
        selectedMenuItem.variations.length > 1
          ? selectedMenuItem.variations
          : null;

      if (multiVars) {
        let savedCount = 0;
        for (const v of multiVars) {
          const payload = recipePayload(v.id);
          if (payload.ingredients.length === 0) continue;
          const isActive = v.id === recipe.variationId;
          if (isActive && mode === "update" && editingRecipeId) {
            await adminFetch(
              `/api/admin/inventory/recipes/${editingRecipeId}`,
              {
                method: "PATCH",
                body: JSON.stringify(payload),
              },
            );
          } else {
            await adminFetch("/api/admin/inventory/recipes", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          savedCount += 1;
        }
        if (savedCount === 0) {
          toast.error("Enter at least one qty for a variation");
          return;
        }
        toast.success(
          savedCount === 1
            ? "Recipe version saved"
            : `Saved recipes for ${savedCount} variations`,
        );
      } else if (mode === "update") {
        if (!editingRecipeId) {
          toast.error("No recipe selected to update");
          return;
        }
        await adminFetch(`/api/admin/inventory/recipes/${editingRecipeId}`, {
          method: "PATCH",
          body: JSON.stringify(recipePayload()),
        });
        toast.success("Recipe version updated");
      } else {
        await adminFetch("/api/admin/inventory/recipes", {
          method: "POST",
          body: JSON.stringify(recipePayload()),
        });
        toast.success("New recipe version saved");
      }
      setRecipeDialogOpen(false);
      resetRecipeForm();
      await loadRecipesList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recipe save failed");
    } finally {
      setRecipeSubmitting(false);
    }
  };

  const [deletingRecipe, setDeletingRecipe] = useState<RecipeRow | null>(null);
  const [recipeDeleteSubmitting, setRecipeDeleteSubmitting] = useState(false);

  const confirmDeleteRecipe = async () => {
    if (!deletingRecipe) return;
    setRecipeDeleteSubmitting(true);
    try {
      await adminFetch(`/api/admin/inventory/recipes/${deletingRecipe.id}`, {
        method: "DELETE",
      });
      toast.success("Recipe version deleted");
      setDeletingRecipe(null);
      await loadRecipesList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRecipeDeleteSubmitting(false);
    }
  };

  const [ops, setOps] = useState({
    openingItemId: "",
    openingQty: "",
    openingQtyUnit: "purchase" as QtyEntryUnit,
    openingUnitCostRupees: "",
    kitchenItemId: "",
    kitchenQty: "",
    kitchenQtyUnit: "purchase" as QtyEntryUnit,
    kitchenNote: "",
    kitchenUsedAt: "",
    adjustmentItemId: "",
    adjustmentQty: "",
    adjustmentDirection: "down",
    adjustmentReason: "CORRECTION",
    paymentSupplierId: "",
    paymentAmountRupees: "",
    paymentMethod: "upi",
    paymentReference: "",
  });

  const [sellForm, setSellForm] = useState({
    itemId: "",
    qty: "",
    qtyUnit: "purchase" as QtyEntryUnit,
    priceRupees: "",
    buyerName: "",
    note: "",
    soldAt: "",
  });
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const [recipeReconcilePreview, setRecipeReconcilePreview] =
    useState<RecipeReconcilePreview | null>(null);
  const [recipeReconcileLoading, setRecipeReconcileLoading] = useState(false);
  const [recipeReconcileApplying, setRecipeReconcileApplying] = useState(false);
  const [recipeReconcileConfirmed, setRecipeReconcileConfirmed] =
    useState(false);
  const [recipeReconcileMode, setRecipeReconcileMode] =
    useState<RecipeReconcileMode>("at_sale");
  const [recipeReconcileFrom, setRecipeReconcileFrom] = useState("");
  const [recipeReconcileTo, setRecipeReconcileTo] = useState("");

  const postOpening = async () => {
    const item = items.find((i) => i.id === ops.openingItemId);
    if (!item) {
      toast.error("Select an item");
      return;
    }
    const qtyBase = convertQtyToBaseUnits(
      ops.openingQty,
      ops.openingQtyUnit,
      item.baseUnitsPerPurchaseUnit,
    );
    if (!qtyBase) {
      toast.error("Enter a valid quantity");
      return;
    }
    const body: Record<string, unknown> = {
      inventoryItemId: ops.openingItemId,
      qtyBase,
    };
    if (ops.openingUnitCostRupees.trim() !== "") {
      body.ratePaisePerPurchaseUnit = rupeesToPaise(ops.openingUnitCostRupees);
    }
    try {
      await adminFetch("/api/admin/inventory/opening", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Opening stock applied");
      setOps((x) => ({ ...x, openingQty: "", openingUnitCostRupees: "" }));
      await Promise.all([loadItems(), loadSummary(), loadMovements()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const postKitchenUse = async () => {
    const item = items.find((i) => i.id === ops.kitchenItemId);
    if (!item) {
      toast.error("Select an item");
      return;
    }
    const qtyBase = convertQtyToBaseUnits(
      ops.kitchenQty,
      ops.kitchenQtyUnit,
      item.baseUnitsPerPurchaseUnit,
    );
    if (!qtyBase) {
      toast.error("Enter a valid quantity");
      return;
    }
    try {
      await adminFetch("/api/admin/inventory/kitchen-use", {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: ops.kitchenItemId,
          qtyBase,
          note: ops.kitchenNote.trim(),
          ...(ops.kitchenUsedAt
            ? { usedAt: new Date(ops.kitchenUsedAt).toISOString() }
            : {}),
        }),
      });
      toast.success("Kitchen use recorded — stock reduced and cost hits profit");
      setOps((x) => ({ ...x, kitchenQty: "", kitchenNote: "" }));
      await Promise.all([loadItems(), loadSummary(), loadMovements()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const postStockSale = async () => {
    const item = items.find((i) => i.id === sellForm.itemId);
    if (!item) {
      toast.error("Select a stock item");
      return;
    }
    const qtyBase = convertQtyToBaseUnits(
      sellForm.qty,
      sellForm.qtyUnit,
      item.baseUnitsPerPurchaseUnit,
    );
    if (!qtyBase) {
      toast.error("Enter a valid quantity");
      return;
    }
    const pricePaise = rupeesToPaise(sellForm.priceRupees);
    if (!Number.isFinite(pricePaise) || pricePaise < 0) {
      toast.error("Enter a valid selling price");
      return;
    }
    const factor = Number(item.baseUnitsPerPurchaseUnit);
    const ratePaisePerBase =
      sellForm.qtyUnit === "base"
        ? pricePaise
        : Number.isFinite(factor) && factor > 0
          ? pricePaise / factor
          : NaN;
    if (!Number.isFinite(ratePaisePerBase) || ratePaisePerBase < 0) {
      toast.error("Could not convert selling price to base unit");
      return;
    }
    setSellSubmitting(true);
    try {
      const out = await adminFetch<{ totalPaise: number }>("/api/admin/inventory/stock-sales", {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: sellForm.itemId,
          qtyBase,
          ratePaisePerBase,
          buyerName: sellForm.buyerName.trim(),
          note: sellForm.note.trim(),
          ...(sellForm.soldAt
            ? { soldAt: new Date(sellForm.soldAt).toISOString() }
            : {}),
        }),
      });
      toast.success(`Stock sold — ${formatRupees(out.totalPaise)}`);
      setSellForm((x) => ({
        ...x,
        qty: "",
        priceRupees: "",
        buyerName: "",
        note: "",
      }));
      await Promise.all([
        loadItems(),
        loadSummary(),
        loadMovements(),
        loadStockSales(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record stock sale");
    } finally {
      setSellSubmitting(false);
    }
  };

  const postAdjustment = async () => {
    try {
      await adminFetch("/api/admin/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: ops.adjustmentItemId,
          qtyBase: ops.adjustmentQty,
          direction: ops.adjustmentDirection,
          reason: ops.adjustmentReason,
        }),
      });
      toast.success("Adjustment saved");
      await Promise.all([loadItems(), loadSummary(), loadMovements()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const recipeReconcileQuery = () => {
    const params = new URLSearchParams({ mode: recipeReconcileMode });
    if (recipeReconcileFrom.trim()) params.set("from", recipeReconcileFrom.trim());
    if (recipeReconcileTo.trim()) params.set("to", recipeReconcileTo.trim());
    return params.toString();
  };

  const previewRecipeReconcile = async () => {
    if (
      recipeReconcileFrom.trim() &&
      recipeReconcileTo.trim() &&
      recipeReconcileFrom.trim() > recipeReconcileTo.trim()
    ) {
      toast.error("From date must be on or before To date");
      return;
    }
    setRecipeReconcileLoading(true);
    setRecipeReconcileConfirmed(false);
    try {
      const preview = await adminFetch<RecipeReconcilePreview>(
        `/api/admin/inventory/reconcile-recipes?${recipeReconcileQuery()}`,
      );
      setRecipeReconcilePreview(preview);
      if (preview.fromDate && !recipeReconcileFrom.trim()) {
        setRecipeReconcileFrom(preview.fromDate);
      }
      if (preview.toDate && !recipeReconcileTo.trim()) {
        setRecipeReconcileTo(preview.toDate);
      }
      if (preview.changeCount === 0) {
        toast.success("Nothing to fix for this date range");
      } else {
        toast.success(
          `Preview ready — ${preview.changeCount} ingredient${preview.changeCount === 1 ? "" : "s"} to adjust`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setRecipeReconcileLoading(false);
    }
  };

  const applyRecipeReconcile = async () => {
    if (!recipeReconcileConfirmed) {
      toast.error("Confirm that recipes are fixed before applying");
      return;
    }
    if (!recipeReconcilePreview || recipeReconcilePreview.changeCount === 0) {
      toast.error("Run preview first — nothing to apply");
      return;
    }
    if (recipeReconcilePreview.mode !== recipeReconcileMode) {
      toast.error("Mode changed — run preview again before applying");
      return;
    }
    setRecipeReconcileApplying(true);
    try {
      const out = await adminFetch<RecipeReconcilePreview>(
        "/api/admin/inventory/reconcile-recipes",
        {
          method: "POST",
          body: JSON.stringify({
            confirm: true,
            mode: recipeReconcileMode,
            from: recipeReconcileFrom.trim(),
            to: recipeReconcileTo.trim(),
          }),
        },
      );
      setRecipeReconcilePreview(out);
      setRecipeReconcileConfirmed(false);
      toast.success(
        out.appliedCount
          ? `Adjusted ${out.appliedCount} ingredient${out.appliedCount === 1 ? "" : "s"}`
          : "Nothing to adjust",
      );
      await Promise.all([loadItems(), loadSummary(), loadMovements()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setRecipeReconcileApplying(false);
    }
  };

  const postPayment = async () => {
    try {
      await adminFetch("/api/admin/inventory/payments", {
        method: "POST",
        body: JSON.stringify({
          supplierId: ops.paymentSupplierId,
          amountPaise: rupeesToPaise(ops.paymentAmountRupees),
          method: ops.paymentMethod,
          reference: ops.paymentReference.trim(),
        }),
      });
      toast.success("Payment recorded");
      setOps((x) => ({
        ...x,
        paymentAmountRupees: "",
        paymentReference: "",
      }));
      await Promise.all([
        loadSummary(),
        loadSuppliers(),
        refreshProfileIfOpen(ops.paymentSupplierId),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const toggleSetting = async (key: "restoreStockOnCancel" | "allowNegativeStock") => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    try {
      await adminFetch("/api/admin/inventory/settings", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setSettings(next);
      toast.success("Settings updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const setCostingMethod = async (
    costingMethod: "WEIGHTED_AVERAGE" | "LATEST_PURCHASE" | "FIFO",
  ) => {
    if (!settings || settings.costingMethod === costingMethod) return;
    const next = { ...settings, costingMethod };
    try {
      await adminFetch("/api/admin/inventory/settings", {
        method: "PATCH",
        body: JSON.stringify({ costingMethod }),
      });
      setSettings(next);
      void loadSummary();
      toast.success("Costing method updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const kpis = summary?.kpis;
  const charts = summary?.charts;
  const categoryPieData = useMemo(
    () =>
      (charts?.valueByCategory ?? []).map((x) => ({
        name: x.label,
        value: paiseToRupeesNumber(x.valuePaise),
      })),
    [charts?.valueByCategory],
  );
  const stockTopPillRows = useMemo(
    () =>
      (charts?.topItemsByValue ?? []).map((x) => ({
        label: x.label,
        value: x.valuePaise,
      })),
    [charts?.topItemsByValue],
  );
  const stockLowestPillRows = useMemo(
    () =>
      (charts?.lowestItemsByValue ?? []).map((x) => ({
        label: x.label,
        value: x.valuePaise,
      })),
    [charts?.lowestItemsByValue],
  );
  const supplierTopPillRows = useMemo(
    () =>
      (charts?.supplierPayables ?? []).map((x) => ({
        label: x.label,
        value: x.balancePaise,
      })),
    [charts?.supplierPayables],
  );
  const supplierLowestPillRows = useMemo(
    () =>
      (charts?.lowestSupplierPayables ?? []).map((x) => ({
        label: x.label,
        value: x.balancePaise,
      })),
    [charts?.lowestSupplierPayables],
  );
  const stockHealthPie = useMemo(
    () => (charts?.stockHealth ?? []).filter((x) => x.count > 0),
    [charts?.stockHealth],
  );
  const existingCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const it of items) {
      const c = it.category.trim();
      if (c) cats.add(c);
    }
    return [...cats].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const menuItemCategoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of menu?.items ?? []) {
      map.set(item.id, item.category.trim());
    }
    return map;
  }, [menu?.items]);
  const menuCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of menuItemCategoryById.values()) {
      if (c) cats.add(c);
    }
    return [...cats].sort((a, b) => a.localeCompare(b));
  }, [menuItemCategoryById]);

  const [itemSearch, setItemSearch] = useQueryParam("itemQ", "");
  const [itemStatusRaw, setItemStatusRaw] = useQueryParam("itemStatus", "active");
  const itemStatusFilter: ActiveFilter = ACTIVE_FILTER_VALUES.has(
    itemStatusRaw as ActiveFilter,
  )
    ? (itemStatusRaw as ActiveFilter)
    : "active";
  const setItemStatusFilter = useCallback(
    (value: ActiveFilter) => setItemStatusRaw(value),
    [setItemStatusRaw],
  );
  const [itemCategoryFilter, setItemCategoryFilter] = useQueryParam(
    "itemCategory",
    "all",
  );
  const [itemStockRaw, setItemStockRaw] = useQueryParam("itemStock", "all");
  const itemStockFilter: "all" | "low" = itemStockRaw === "low" ? "low" : "all";
  const setItemStockFilter = useCallback(
    (value: "all" | "low") => setItemStockRaw(value),
    [setItemStockRaw],
  );
  const [itemSortRaw, setItemSort] = useQueryParam("itemSort", "name-asc");
  const itemSort = ITEM_SORT_VALUES.has(itemSortRaw) ? itemSortRaw : "name-asc";

  const [supplierSearch, setSupplierSearch] = useQueryParam("supplierQ", "");
  const [supplierStatusRaw, setSupplierStatusRaw] = useQueryParam(
    "supplierStatus",
    "active",
  );
  const supplierStatusFilter: ActiveFilter = ACTIVE_FILTER_VALUES.has(
    supplierStatusRaw as ActiveFilter,
  )
    ? (supplierStatusRaw as ActiveFilter)
    : "active";
  const setSupplierStatusFilter = useCallback(
    (value: ActiveFilter) => setSupplierStatusRaw(value),
    [setSupplierStatusRaw],
  );
  const [supplierSortRaw, setSupplierSort] = useQueryParam(
    "supplierSort",
    "name-asc",
  );
  const supplierSort = SUPPLIER_SORT_VALUES.has(supplierSortRaw)
    ? supplierSortRaw
    : "name-asc";

  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchasePaymentFilter, setPurchasePaymentFilter] = useState("all");
  const [purchaseSupplierFilter, setPurchaseSupplierFilter] = useState("all");
  const [purchaseSort, setPurchaseSort] = useState("date-desc");

  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeMenuFilter, setRecipeMenuFilter] = useState("all");
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState("all");
  const [recipeSortRaw, setRecipeSort] = useQueryParam("recipeSort", "date-desc");
  const recipeSort = RECIPE_SORT_VALUES.has(recipeSortRaw)
    ? recipeSortRaw
    : "date-desc";
  const [recipeView, setRecipeView] = useTabParam("all", "recipeView");
  const recipeViewTab =
    recipeView === "added" || recipeView === "missing"
      ? recipeView
      : recipeView === "items"
        ? "missing"
        : "all";
  const [recipeItemSearch, setRecipeItemSearch] = useState("");

  const [movementSearch, setMovementSearch] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("all");
  const [movementSort, setMovementSort] = useState("date-desc");
  const [opsMenu, setOpsMenu] = useState<OpsMenuId>("opening");

  const recipeVariationLabel = useCallback(
    (menuItemId: string, variationId: string | null) => {
      const item = menu?.items.find((x) => x.id === menuItemId);
      if (!variationId) {
        // Single-variation dishes: treat null ("All variations") as that variation.
        const sole = soleVariationId(item?.variations);
        if (sole) {
          return item?.variations.find((v) => v.id === sole)?.name ?? "All variations";
        }
        return "All variations";
      }
      return item?.variations.find((v) => v.id === variationId)?.name ?? variationId;
    },
    [menu?.items],
  );

  const recipeCostPaise = useCallback(
    (r: RecipeRow) =>
      recipeRowCostPaise(r, recipesList, items, settings?.costingMethod),
    [recipesList, items, settings?.costingMethod],
  );

  /** Min selling price in rupees for sort (specific variation, or cheapest of all). */
  const recipeMenuSellingPriceSortValue = useCallback(
    (menuItemId: string, variationId: string | null) => {
      const item = menu?.items.find((x) => x.id === menuItemId);
      if (!item?.variations.length) return Number.POSITIVE_INFINITY;
      if (variationId) {
        const v = item.variations.find((x) => x.id === variationId);
        return v && Number.isFinite(v.price) ? v.price : Number.POSITIVE_INFINITY;
      }
      const prices = item.variations.map((v) => v.price).filter((p) => Number.isFinite(p));
      if (prices.length === 0) return Number.POSITIVE_INFINITY;
      return Math.min(...prices);
    },
    [menu?.items],
  );

  /** Menu selling price(s) for a recipe row — specific variation, or range for "All variations". */
  const recipeMenuSellingPriceLabel = useCallback(
    (menuItemId: string, variationId: string | null) => {
      const item = menu?.items.find((x) => x.id === menuItemId);
      if (!item?.variations.length) return "—";
      if (variationId) {
        const v = item.variations.find((x) => x.id === variationId);
        return v ? formatRupeesAmount(v.price) : "—";
      }
      const prices = item.variations.map((v) => v.price).filter((p) => Number.isFinite(p));
      if (prices.length === 0) return "—";
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min === max) return formatRupeesAmount(min);
      return `${formatRupeesAmount(min)}–${formatRupeesAmount(max)}`;
    },
    [menu?.items],
  );

  const movementTypeOptions = useMemo(() => {
    const types = new Map<string, string>();
    for (const m of movements) {
      types.set(m.type, m.typeLabel);
    }
    return [...types.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movements]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    let list = items.filter((r) => {
      if (itemStatusFilter === "active" && !r.active) return false;
      if (itemStatusFilter === "inactive" && r.active) return false;
      if (itemCategoryFilter !== "all" && r.category.trim() !== itemCategoryFilter) {
        return false;
      }
      if (itemStockFilter === "low" && !isLowStock(r)) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.category} ${r.baseUnit} ${r.purchaseUnit}`.toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (itemSort) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "category-asc":
          return (
            (a.category.trim() || "—").localeCompare(b.category.trim() || "—") ||
            a.name.localeCompare(b.name)
          );
        case "category-desc":
          return (
            (b.category.trim() || "—").localeCompare(a.category.trim() || "—") ||
            a.name.localeCompare(b.name)
          );
        case "units-asc":
        case "units-desc": {
          const aUnits = `${a.purchaseUnit} ${a.baseUnitsPerPurchaseUnit} ${a.baseUnit}`;
          const bUnits = `${b.purchaseUnit} ${b.baseUnitsPerPurchaseUnit} ${b.baseUnit}`;
          const cmp = aUnits.localeCompare(bUnits) || a.name.localeCompare(b.name);
          return itemSort === "units-desc" ? -cmp : cmp;
        }
        case "stock-asc":
          return (
            Number(a.stockOnHandBase) - Number(b.stockOnHandBase) ||
            a.name.localeCompare(b.name)
          );
        case "stock-desc":
          return (
            Number(b.stockOnHandBase) - Number(a.stockOnHandBase) ||
            a.name.localeCompare(b.name)
          );
        case "rate-asc":
          return (
            itemRatePaisePerPurchaseUnit(a, items, settings?.costingMethod) -
              itemRatePaisePerPurchaseUnit(b, items, settings?.costingMethod) ||
            a.name.localeCompare(b.name)
          );
        case "rate-desc":
          return (
            itemRatePaisePerPurchaseUnit(b, items, settings?.costingMethod) -
              itemRatePaisePerPurchaseUnit(a, items, settings?.costingMethod) ||
            a.name.localeCompare(b.name)
          );
        case "value-asc":
          return (
            itemStockValuePaise(a, settings?.costingMethod) -
              itemStockValuePaise(b, settings?.costingMethod) ||
            a.name.localeCompare(b.name)
          );
        case "value-desc":
          return (
            itemStockValuePaise(b, settings?.costingMethod) -
              itemStockValuePaise(a, settings?.costingMethod) ||
            a.name.localeCompare(b.name)
          );
        case "status-asc":
          return (
            Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
          );
        case "status-desc":
          return (
            Number(a.active) - Number(b.active) || a.name.localeCompare(b.name)
          );
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [
    items,
    itemSearch,
    itemStatusFilter,
    itemCategoryFilter,
    itemStockFilter,
    itemSort,
    settings?.costingMethod,
  ]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    let list = suppliers.filter((s) => {
      if (supplierStatusFilter === "active" && !s.active) return false;
      if (supplierStatusFilter === "inactive" && s.active) return false;
      if (!q) return true;
      const hay = `${s.name} ${s.phone} ${s.address}`.toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (supplierSort) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "phone-asc":
          return (
            (a.phone.trim() || "—").localeCompare(b.phone.trim() || "—") ||
            a.name.localeCompare(b.name)
          );
        case "phone-desc":
          return (
            (b.phone.trim() || "—").localeCompare(a.phone.trim() || "—") ||
            a.name.localeCompare(b.name)
          );
        case "purchases-asc":
          return (
            a.totalPurchasesPaise - b.totalPurchasesPaise ||
            a.name.localeCompare(b.name)
          );
        case "purchases-desc":
          return (
            b.totalPurchasesPaise - a.totalPurchasesPaise ||
            a.name.localeCompare(b.name)
          );
        case "balance-asc":
          return a.balancePaise - b.balancePaise || a.name.localeCompare(b.name);
        case "balance-desc":
          return b.balancePaise - a.balancePaise || a.name.localeCompare(b.name);
        case "status-asc":
          return (
            Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
          );
        case "status-desc":
          return (
            Number(a.active) - Number(b.active) || a.name.localeCompare(b.name)
          );
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [suppliers, supplierSearch, supplierStatusFilter, supplierSort]);

  const profilePurchases = useMemo(() => {
    if (!profileSupplier) return [];
    return purchases
      .filter((p) => p.supplierId === profileSupplier.id)
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  }, [purchases, profileSupplier]);

  const activeProfileStats = useMemo(
    () => supplierProfileStats ?? emptySupplierProfileStats(),
    [supplierProfileStats],
  );

  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    let list = purchases.filter((p) => {
      if (purchasePaymentFilter !== "all" && p.paymentType !== purchasePaymentFilter) {
        return false;
      }
      if (purchaseSupplierFilter !== "all" && p.supplierId !== purchaseSupplierFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${p.batchRef} ${p.supplierName} ${p.paymentType}`.toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (purchaseSort) {
        case "date-asc":
          return a.purchasedAt.localeCompare(b.purchasedAt);
        case "amount-asc":
          return a.totalPaise - b.totalPaise;
        case "amount-desc":
          return b.totalPaise - a.totalPaise;
        case "supplier-asc":
          return (
            a.supplierName.localeCompare(b.supplierName) ||
            b.purchasedAt.localeCompare(a.purchasedAt)
          );
        default:
          return b.purchasedAt.localeCompare(a.purchasedAt);
      }
    });
    return list;
  }, [
    purchases,
    purchaseSearch,
    purchasePaymentFilter,
    purchaseSupplierFilter,
    purchaseSort,
  ]);

  const filteredRecipeMatches = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    return recipesList.filter((r) => {
      if (recipeMenuFilter !== "all" && r.menuItemId !== recipeMenuFilter) return false;
      if (recipeCategoryFilter !== "all") {
        const cat = menuItemCategoryById.get(r.menuItemId) ?? "";
        if (cat !== recipeCategoryFilter) return false;
      }
      if (!q) return true;
      const varLabel = recipeVariationLabel(r.menuItemId, r.variationId);
      const category = menuItemCategoryById.get(r.menuItemId) ?? "";
      const hay =
        `${r.menuItemName} ${category} ${varLabel} ${r.label} v${r.version}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    recipesList,
    recipeSearch,
    recipeMenuFilter,
    recipeCategoryFilter,
    menuItemCategoryById,
    recipeVariationLabel,
  ]);

  const recipeSortContext = useMemo<RecipeSortContext>(
    () => ({
      recipeVariationLabel,
      recipeCostPaise,
      recipeMenuSellingPriceSortValue,
    }),
    [recipeVariationLabel, recipeCostPaise, recipeMenuSellingPriceSortValue],
  );

  const filteredRecipes = useMemo(
    () =>
      [...filteredRecipeMatches].sort((a, b) =>
        compareRecipeRows(a, b, recipeSort, recipeSortContext),
      ),
    [filteredRecipeMatches, recipeSort, recipeSortContext],
  );

  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    let list = movements.filter((m) => {
      if (movementTypeFilter !== "all" && m.type !== movementTypeFilter) return false;
      if (!q) return true;
      const hay = `${m.itemName} ${m.typeLabel} ${m.note} ${m.qtyDeltaBase}`.toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (movementSort === "date-asc") return a.occurredAt.localeCompare(b.occurredAt);
      if (movementSort === "item-asc") {
        return a.itemName.localeCompare(b.itemName) || b.occurredAt.localeCompare(a.occurredAt);
      }
      return b.occurredAt.localeCompare(a.occurredAt);
    });
    return list;
  }, [movements, movementSearch, movementTypeFilter, movementSort]);

  const menuItemsForRecipeFilter = useMemo(() => {
    const ids = new Map<string, string>();
    for (const r of recipesList) ids.set(r.menuItemId, r.menuItemName);
    return [...ids.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [recipesList]);

  const menuItemVariationCoverage = useMemo(() => {
    const byMenuItem = new Map<string, RecipeRow[]>();
    for (const r of recipesList) {
      const list = byMenuItem.get(r.menuItemId) ?? [];
      list.push(r);
      byMenuItem.set(r.menuItemId, list);
    }

    const rows: MenuItemVariationCoverageRow[] = [];
    for (const item of menu?.items ?? []) {
      const versions = byMenuItem.get(item.id) ?? [];
      // Recipes are mandatory per variation. An "All variations" recipe
      // (variationId null) does not cover individual variations — except when
      // the dish has only one variation, in which case null means that one.
      const versionCountByVariation = new Map<string, number>();
      let nullVariationVersionCount = 0;
      const soleId = soleVariationId(item.variations);
      for (const version of versions) {
        if (!version.variationId) {
          if (soleId) {
            versionCountByVariation.set(
              soleId,
              (versionCountByVariation.get(soleId) ?? 0) + 1,
            );
          } else {
            nullVariationVersionCount += 1;
          }
          continue;
        }
        versionCountByVariation.set(
          version.variationId,
          (versionCountByVariation.get(version.variationId) ?? 0) + 1,
        );
      }

      const variationTargets =
        item.variations.length > 0
          ? item.variations.map((v) => ({ id: v.id, name: v.name }))
          : [{ id: null as string | null, name: "—" }];

      for (const variation of variationTargets) {
        const versionCount =
          variation.id !== null
            ? (versionCountByVariation.get(variation.id) ?? 0)
            : nullVariationVersionCount;
        const covered = versionCount > 0;

        rows.push({
          menuItemId: item.id,
          menuItemName: item.name,
          category: item.category,
          variationId: variation.id,
          variationName: variation.name,
          versionCount,
          status: covered ? "complete" : "missing",
        });
      }
    }

    return rows.sort(
      (a, b) =>
        a.menuItemName.localeCompare(b.menuItemName) ||
        a.variationName.localeCompare(b.variationName),
    );
  }, [menu?.items, recipesList]);

  const filteredMenuItemVariationCoverage = useMemo(() => {
    const q = recipeItemSearch.trim().toLowerCase();
    return menuItemVariationCoverage.filter((row) => {
      if (recipeViewTab === "missing" && row.status === "complete") {
        return false;
      }
      if (
        recipeCategoryFilter !== "all" &&
        row.category.trim() !== recipeCategoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      const hay =
        `${row.menuItemName} ${row.variationName} ${row.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    menuItemVariationCoverage,
    recipeItemSearch,
    recipeViewTab,
    recipeCategoryFilter,
  ]);

  const recipeCoverageCounts = useMemo(() => {
    let missing = 0;
    let complete = 0;
    for (const row of menuItemVariationCoverage) {
      if (row.status === "missing") missing += 1;
      else complete += 1;
    }
    return { missing, complete, total: menuItemVariationCoverage.length };
  }, [menuItemVariationCoverage]);

  const filteredAllTabMissingVariations = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    return menuItemVariationCoverage
      .filter((row) => {
        if (row.status !== "missing") return false;
        if (recipeMenuFilter !== "all" && row.menuItemId !== recipeMenuFilter) {
          return false;
        }
        if (
          recipeCategoryFilter !== "all" &&
          row.category.trim() !== recipeCategoryFilter
        ) {
          return false;
        }
        if (!q) return true;
        const hay =
          `${row.menuItemName} ${row.variationName} ${row.category}`.toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          a.menuItemName.localeCompare(b.menuItemName) ||
          a.variationName.localeCompare(b.variationName),
      );
  }, [
    menuItemVariationCoverage,
    recipeSearch,
    recipeMenuFilter,
    recipeCategoryFilter,
  ]);

  const allTabRows = useMemo(() => {
    const rows: AllTabRow[] = [
      ...filteredRecipeMatches.map((recipe) => ({ kind: "recipe" as const, recipe })),
      ...filteredAllTabMissingVariations.map((row) => ({
        kind: "missing" as const,
        row,
      })),
    ];

    rows.sort((a, b) => compareAllTabRows(a, b, recipeSort, recipeSortContext));

    return rows;
  }, [
    filteredRecipeMatches,
    filteredAllTabMissingVariations,
    recipeSort,
    recipeSortContext,
  ]);

  const recipeNeedsCount = recipeCoverageCounts.missing;
  const recipeAddedMenuItemCount = recipeCoverageCounts.complete;

  const allTabTotalRowCount = recipesList.length + recipeNeedsCount;

  const recipeFormMenuItem = (menu?.items ?? []).find(
    (x) => x.id === recipe.menuItemId,
  );
  const recipeFormVariations = recipeFormMenuItem?.variations ?? [];
  const recipeRequiresVariation = recipeFormVariations.length > 0;
  const canShowAllVariationQtys = recipeFormVariations.length > 1;
  const tabLoading = !tabsReady[activeTab];

  if (initialLoading) {
    return <AdminInventorySkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Inventory & suppliers</h1>
        <p className="text-muted-foreground text-sm">
          Stock in base units, purchases, supplier ledger, recipes, and POS deduction.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          // Nested recipe sub-views must not flip the main inventory tab.
          if (
            v === "overview" ||
            v === "items" ||
            v === "suppliers" ||
            v === "purchase" ||
            v === "recipes" ||
            v === "sell" ||
            v === "ops"
          ) {
            setActiveTab(v);
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
          {canTab("overview") ? (
            <TabsTrigger value="overview" className="data-[state=active]:font-semibold">
              Overview
            </TabsTrigger>
          ) : null}
          {canTab("items") ? (
            <TabsTrigger value="items" className="data-[state=active]:font-semibold">
              Items
            </TabsTrigger>
          ) : null}
          {canTab("suppliers") ? (
            <TabsTrigger value="suppliers" className="data-[state=active]:font-semibold">
              Suppliers
            </TabsTrigger>
          ) : null}
          {canTab("purchase") ? (
            <TabsTrigger value="purchase" className="data-[state=active]:font-semibold">
              Purchases
            </TabsTrigger>
          ) : null}
          {canTab("recipes") ? (
            <TabsTrigger value="recipes" className="data-[state=active]:font-semibold">
              Recipes
            </TabsTrigger>
          ) : null}
          {canTab("sell") ? (
            <TabsTrigger value="sell" className="data-[state=active]:font-semibold">
              Sell stock
            </TabsTrigger>
          ) : null}
          {canTab("ops") ? (
            <TabsTrigger value="ops" className="data-[state=active]:font-semibold">
              Stock & pay
            </TabsTrigger>
          ) : null}
        </TabsList>

        {tabLoading ? (
          <div className="space-y-4 pt-4">
            <AdminKpiGridSkeleton count={3} />
            <AdminChartGridSkeleton count={2} />
            <AdminTableSkeleton rows={5} />
          </div>
        ) : null}

        <TabsContent
          value="overview"
          className={cx("space-y-6 pt-4", tabLoading && "hidden")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Inventory value"
              value={kpis ? formatRupees(kpis.totalInventoryValuePaise) : "…"}
              subtitle={
                kpis
                  ? `${kpis.activeItemsCount} active items · ${costingMethodLabel(kpis.costingMethod)} cost`
                  : undefined
              }
              Icon={WarehouseIcon}
              gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
            />
            <KpiCard
              title="Suppliers"
              value={kpis ? String(kpis.activeSuppliersCount) : "…"}
              subtitle="Active supplier accounts"
              Icon={TruckIcon}
              gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-violet-500/15"
            />
            <KpiCard
              title="Supplier payable"
              value={kpis ? formatRupees(kpis.supplierPayablePaise) : "…"}
              subtitle="Outstanding credit to suppliers"
              Icon={IndianRupeeIcon}
              gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3">
                <p className="font-medium">Stock value by category</p>
                <p className="text-muted-foreground text-xs">
                  On-hand qty × unit cost ({kpis?.costingMethod ?? "—"})
                </p>
              </div>
              <div className="h-72">
                {categoryPieData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No valued stock yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(v) => chartTooltipRupeePair(v as number)} />
                      <Pie
                        data={categoryPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                      >
                        {categoryPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3">
                <p className="font-medium">Stock health</p>
                <p className="text-muted-foreground text-xs">Items at or above minimum vs low</p>
              </div>
              <div className="h-72">
                {stockHealthPie.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No active inventory items.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip />
                      <Pie
                        data={stockHealthPie}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                      >
                        {stockHealthPie.map((entry) => (
                          <Cell
                            key={entry.label}
                            fill={entry.label === "Low stock" ? "#ef4444" : "#16a34a"}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <PillRankChartCard
              title="Top items by stock value"
              topTabLabel="Top value"
              bottomTabLabel="Low value"
              topRows={stockTopPillRows}
              bottomRows={stockLowestPillRows}
              isLoading={!summary}
              loadingMessage="Loading stock value…"
              emptyMessage="No stock value to chart."
              formatValue={(v) => formatRupees(v)}
              valueTitle={(r) => `${r.label}: ${formatRupees(r.value)}`}
              maxItems={10}
              variant="rank-bars"
            />

            <PillRankChartCard
              title="Supplier payables"
              topTabLabel="Top owed"
              bottomTabLabel="Low owed"
              topRows={supplierTopPillRows}
              bottomRows={supplierLowestPillRows}
              isLoading={!summary}
              loadingMessage="Loading payables…"
              emptyMessage="No supplier payables."
              formatValue={(v) => formatRupees(v)}
              valueTitle={(r) => `${r.label}: ${formatRupees(r.value)} payable`}
              filterTopPositive
              maxItems={10}
              variant="rank-bars"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 font-medium text-sm">Low stock</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summary?.lowStock ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground text-xs">
                          All items above minimum.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary!.lowStock.slice(0, 8).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">
                            {r.name}{" "}
                            <span className="text-muted-foreground text-xs">({r.baseUnit})</span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatRecipeQtyBase(r.stockOnHandBase)}
                            <span className="text-muted-foreground">
                              {" "}
                              / {formatRecipeQtyBase(r.minStockBase)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <h3 className="mb-3 font-medium text-sm">Overdue credit</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summary?.overduePurchases ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground text-xs">
                          None overdue.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary!.overduePurchases.slice(0, 8).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{p.supplierName}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {p.dueAt ? p.dueAt.slice(0, 10) : "—"}
                            <div className="text-muted-foreground text-xs">
                              {formatRupees(p.totalPaise)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-medium text-sm">Near expiry (7d)</h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadExpiry()}
                  >
                    Refresh
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(expiry?.nearExpiry ?? []).length === 0 &&
                    (expiry?.expired ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground text-xs">
                          No expiry issues.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [
                        ...(expiry?.expired ?? []).slice(0, 3).map((b) => ({ ...b, expired: true })),
                        ...(expiry?.nearExpiry ?? []).slice(0, 5).map((b) => ({ ...b, expired: false })),
                      ].map((b) => (
                        <TableRow key={b.batchId}>
                          <TableCell className="text-sm">
                            {b.itemName}
                            {b.expired ? (
                              <span className="ml-1 text-destructive text-xs">expired</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {b.expiryDate.slice(0, 10)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
          </div>
        </TabsContent>

        <TabsContent value="items" className={cx("space-y-4 pt-4", tabLoading && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Inventory items</h2>
              <p className="text-muted-foreground text-sm">
                Stock units, categories, and low-stock levels for purchases and recipes.
              </p>
            </div>
            <Button type="button" onClick={openAddItem}>
              <PlusIcon className="mr-2 size-4" aria-hidden />
              Add item
            </Button>
          </div>

          <DataTableToolbar
            search={itemSearch}
            onSearchChange={setItemSearch}
            searchPlaceholder="Search name, category, units…"
            statusFilter={itemStatusFilter}
            onStatusFilterChange={setItemStatusFilter}
            sort={itemSort}
            onSortChange={setItemSort}
            sortOptions={[]}
            showSort={false}
            filteredCount={filteredItems.length}
            totalCount={items.length}
          >
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Category</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={[
                  { value: "all", label: "All categories" },
                  ...existingCategories.map((c) => ({ value: c, label: c })),
                ]}
                value={itemCategoryFilter}
                onValueChange={setItemCategoryFilter}
                placeholder="Category"
                searchPlaceholder="Search categories…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Stock</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={STOCK_FILTER_OPTIONS}
                value={itemStockFilter}
                onValueChange={(v) => setItemStockFilter(v as "all" | "low")}
                placeholder="Stock"
                searchPlaceholder="Search…"
              />
            </div>
          </DataTableToolbar>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Name"
                    column="name"
                    sort={itemSort}
                    onSortChange={setItemSort}
                  />
                  <SortableTableHead
                    label="Category"
                    column="category"
                    sort={itemSort}
                    onSortChange={setItemSort}
                  />
                  <SortableTableHead
                    label="Units"
                    column="units"
                    sort={itemSort}
                    onSortChange={setItemSort}
                  />
                  <SortableTableHead
                    label="Stock"
                    column="stock"
                    sort={itemSort}
                    onSortChange={setItemSort}
                    className="text-right"
                    align="right"
                  />
                  <SortableTableHead
                    label="Rate"
                    column="rate"
                    sort={itemSort}
                    onSortChange={setItemSort}
                    className="text-right"
                    align="right"
                  />
                  <SortableTableHead
                    label="Stock Value"
                    column="value"
                    sort={itemSort}
                    onSortChange={setItemSort}
                    className="text-right"
                    align="right"
                  />
                  <SortableTableHead
                    label="Status"
                    column="status"
                    sort={itemSort}
                    onSortChange={setItemSort}
                  />
                  <TableHead className="w-[9rem] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No items yet. Add one to track stock and purchases.
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No items match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div>{r.name}</div>
                        {r.yieldLink ? (
                          <div className="mt-0.5 font-normal text-muted-foreground text-xs">
                            From {r.yieldLink.sourceItemName || "source"} @{" "}
                            {r.yieldLink.yieldPercent}% yield
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.category.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        1 {r.purchaseUnit} = {r.baseUnitsPerPurchaseUnit} {r.baseUnit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.yieldLink ? (
                          <span className="text-muted-foreground" title={`Stock on ${r.yieldLink.sourceItemName}`}>
                            —
                          </span>
                        ) : (
                          formatStockInPurchaseUnits(r)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {(() => {
                          const rate = itemRatePaisePerPurchaseUnit(
                            r,
                            items,
                            settings?.costingMethod,
                          );
                          return rate > 0 ? `${formatRupees(rate)}/${r.purchaseUnit}` : "—";
                        })()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.yieldLink
                          ? "—"
                          : formatRupees(
                              itemStockValuePaise(r, settings?.costingMethod),
                            )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={r.active ? "default" : "secondary"}>
                            {r.active ? "Active" : "Inactive"}
                          </Badge>
                          {isLowStock(r) ? (
                            <Badge variant="destructive">Low</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditItem(r)}
                          >
                            <PencilIcon className="size-4" aria-hidden />
                            <span className="sr-only">Edit {r.name}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Duplicate item"
                            onClick={() => openDuplicateItem(r)}
                          >
                            <CopyIcon className="size-4" aria-hidden />
                            <span className="sr-only">Duplicate {r.name}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeletingItem(r)}
                          >
                            <Trash2Icon className="size-4" aria-hidden />
                            <span className="sr-only">Delete {r.name}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog
            open={itemDialogOpen}
            onOpenChange={(open) => {
              setItemDialogOpen(open);
              if (!open) {
                setEditingItemId(null);
                setDuplicatingItem(false);
                setItemForm(emptyItemForm);
              }
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingItemId
                    ? "Edit item"
                    : duplicatingItem
                      ? "Duplicate item"
                      : "Add item"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <InventoryFieldLabel
                    htmlFor="inv-item-dialog-name"
                    label="Item name"
                    hint={
                      <>
                        <span className="font-medium text-foreground">What to enter:</span> The
                        name you use when buying and in recipes (e.g. Mozzarella).
                        <br />
                        <span className="font-medium text-foreground">Used in:</span> Purchases,
                        recipes, stock adjustments, and reports.
                      </>
                    }
                  />
                  <Input
                    id="inv-item-dialog-name"
                    placeholder="e.g. Mozzarella cheese"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <InventoryFieldLabel
                    htmlFor="inv-item-dialog-category"
                    label="Category"
                    hint={
                      <>
                        <span className="font-medium text-foreground">What to enter:</span> Choose
                        an existing category or select <strong>Add new category</strong>.
                        <br />
                        <span className="font-medium text-foreground">Used in:</span> Overview
                        charts (stock value by category).
                      </>
                    }
                  />
                  <InventoryCategoryField
                    id="inv-item-dialog-category"
                    value={itemForm.category}
                    onChange={(category) => setItemForm({ ...itemForm, category })}
                    suggestions={existingCategories}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <InventoryFieldLabel
                      htmlFor="inv-item-dialog-base-unit"
                      label="Base unit"
                      hint={
                        <>
                          <span className="font-medium text-foreground">What to enter:</span> g,
                          ml, or pcs — how stock and recipes are counted.
                        </>
                      }
                    />
                    <Input
                      id="inv-item-dialog-base-unit"
                      placeholder="g, ml, pcs…"
                      value={itemForm.baseUnit}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, baseUnit: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <InventoryFieldLabel
                      htmlFor="inv-item-dialog-purchase-unit"
                      label="Purchase unit"
                      hint={
                        <>
                          <span className="font-medium text-foreground">What to enter:</span> Unit
                          on supplier bills — kg, L, bag, etc.
                        </>
                      }
                    />
                    <Input
                      id="inv-item-dialog-purchase-unit"
                      placeholder="kg, L, bag…"
                      value={itemForm.purchaseUnit}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, purchaseUnit: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <InventoryFieldLabel
                    htmlFor="inv-item-dialog-conversion"
                    label="Conversion (base per purchase unit)"
                    hint={
                      <>
                        <span className="font-medium text-foreground">Why needed:</span> Converts
                        purchase qty to stock (e.g. 1 kg = 1000 g → enter 1000).
                      </>
                    }
                  />
                  <Input
                    id="inv-item-dialog-conversion"
                    inputMode="decimal"
                    placeholder="1000"
                    value={itemForm.baseUnitsPerPurchaseUnit}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        baseUnitsPerPurchaseUnit: e.target.value,
                      })
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    1 {itemForm.purchaseUnit || "purchase unit"} ={" "}
                    {itemForm.baseUnitsPerPurchaseUnit || "?"}{" "}
                    {itemForm.baseUnit || "base unit"}
                  </p>
                </div>
                <div className="space-y-2">
                  <InventoryFieldLabel
                    htmlFor="inv-item-dialog-yield-source"
                    label="Comes from (yield link) — optional"
                    hint={
                      <>
                        <span className="font-medium text-foreground">What to enter:</span>{" "}
                        The purchase item this cook item is made from (e.g. Chicken Boneless
                        comes from Frozen chicken).
                        <br />
                        <span className="font-medium text-foreground">Used in:</span> When a
                        recipe uses this item, stock and cost are taken from the source at the
                        yield %. Unit cost and min stock are set on the source instead.
                      </>
                    }
                  />
                  <SearchableSelect
                    options={[
                      { value: "", label: "None — purchase this item directly" },
                      ...inventoryItemSelectOptions(
                        items.filter((i) => i.id !== editingItemId),
                      ),
                    ]}
                    value={itemForm.yieldSourceItemId}
                    onValueChange={(yieldSourceItemId) =>
                      setItemForm({
                        ...itemForm,
                        yieldSourceItemId,
                        yieldPercent:
                          yieldSourceItemId && !itemForm.yieldPercent
                            ? "80"
                            : itemForm.yieldPercent,
                      })
                    }
                    placeholder="Select source item…"
                    searchPlaceholder="Search items…"
                  />
                </div>
                {itemForm.yieldSourceItemId ? (
                  <div className="space-y-2">
                    <InventoryFieldLabel
                      htmlFor="inv-item-dialog-yield-percent"
                      label="Yield %"
                      hint={
                        <>
                          <span className="font-medium text-foreground">What to enter:</span>{" "}
                          Usable percent of the source (e.g. 80 means 1 kg source → 800 g of
                          this item).
                        </>
                      }
                    />
                    <Input
                      id="inv-item-dialog-yield-percent"
                      inputMode="decimal"
                      placeholder="e.g. 80"
                      value={itemForm.yieldPercent}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, yieldPercent: e.target.value })
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Unit cost and minimum stock are hidden — use the source item for
                      purchase price and reorder alerts.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <InventoryFieldLabel
                        htmlFor="inv-item-dialog-min-stock"
                        label="Minimum stock (optional)"
                        hint={
                          <>
                            <span className="font-medium text-foreground">Why needed:</span>{" "}
                            Low-stock alerts on Overview. Use <strong>0</strong> to disable.
                          </>
                        }
                      />
                      <Input
                        id="inv-item-dialog-min-stock"
                        inputMode="decimal"
                        placeholder="0 = no alert"
                        value={itemForm.minStockBase}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, minStockBase: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <InventoryFieldLabel
                        htmlFor="inv-item-dialog-unit-cost"
                        label={`Unit cost (₹ / ${itemForm.purchaseUnit || "purchase unit"}) — optional`}
                        hint={
                          <>
                            <span className="font-medium text-foreground">What to enter:</span>{" "}
                            Typical purchase price for 1{" "}
                            {itemForm.purchaseUnit || "purchase unit"} (same as a purchase
                            rate).
                            <br />
                            <span className="font-medium text-foreground">Used in:</span>{" "}
                            Inventory value, recipe costing, and wastage worth. Leave blank if
                            you will set cost later via a purchase or opening stock.
                          </>
                        }
                      />
                      <Input
                        id="inv-item-dialog-unit-cost"
                        inputMode="decimal"
                        placeholder="e.g. 450"
                        value={itemForm.unitCostRupees}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, unitCostRupees: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setItemDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveItem()}>
                  {editingItemId
                    ? "Save changes"
                    : duplicatingItem
                      ? "Create copy"
                      : "Add item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deletingItem !== null}
            onOpenChange={(open) => {
              if (!open && !deleteSubmitting) setDeletingItem(null);
            }}
          >
            <DialogContent className="sm:max-w-md" showCloseButton={!deleteSubmitting}>
              <DialogHeader>
                <DialogTitle>Delete item?</DialogTitle>
                <DialogDescription render={<div />}>
                  <div className="space-y-3 text-sm">
                    <p>
                      You are about to delete{" "}
                      <span className="font-medium text-foreground">
                        {deletingItem?.name}
                      </span>
                      . Here is what happens:
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                      <li>
                        If this item has{" "}
                        <span className="font-medium text-foreground">no history</span> (no
                        purchases, batches, stock movements, recipes, wastage, adjustments,
                        audits, or personal-use records), it is{" "}
                        <span className="font-medium text-foreground">
                          permanently removed
                        </span>
                        .
                      </li>
                      <li>
                        If it is{" "}
                        <span className="font-medium text-foreground">used anywhere</span>, it
                        is instead{" "}
                        <span className="font-medium text-foreground">
                          archived (deactivated)
                        </span>{" "}
                        to keep your records and reports intact.
                      </li>
                      <li>
                        Archived items are hidden from this list and from item pickers
                        (purchases, recipes, stock actions). Set the{" "}
                        <span className="font-medium text-foreground">Status</span> filter to{" "}
                        <span className="font-medium text-foreground">Inactive only</span> or{" "}
                        <span className="font-medium text-foreground">All statuses</span> to
                        view them again.
                      </li>
                    </ul>
                    <p>This cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleteSubmitting}
                  onClick={() => setDeletingItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteSubmitting}
                  onClick={() => void confirmDeleteItem()}
                >
                  {deleteSubmitting ? "Deleting…" : "Delete item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="suppliers" className={cx("space-y-4 pt-4", tabLoading && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Suppliers</h2>
              <p className="text-muted-foreground text-sm">
                Used for purchases, payments, and payable balances.
              </p>
            </div>
            <Button type="button" onClick={openAddSupplier}>
              <PlusIcon className="mr-2 size-4" aria-hidden />
              Add supplier
            </Button>
          </div>

          <DataTableToolbar
            search={supplierSearch}
            onSearchChange={setSupplierSearch}
            searchPlaceholder="Search name, phone…"
            statusFilter={supplierStatusFilter}
            onStatusFilterChange={setSupplierStatusFilter}
            sort={supplierSort}
            onSortChange={setSupplierSort}
            sortOptions={[]}
            showSort={false}
            filteredCount={filteredSuppliers.length}
            totalCount={suppliers.length}
          />

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Name"
                    column="name"
                    sort={supplierSort}
                    onSortChange={setSupplierSort}
                    className="px-4"
                  />
                  <SortableTableHead
                    label="Phone"
                    column="phone"
                    sort={supplierSort}
                    onSortChange={setSupplierSort}
                    className="px-4"
                  />
                  <SortableTableHead
                    label="Purchases"
                    column="purchases"
                    sort={supplierSort}
                    onSortChange={setSupplierSort}
                    className="px-4 text-right"
                    align="right"
                  />
                  <SortableTableHead
                    label="Balance"
                    column="balance"
                    sort={supplierSort}
                    onSortChange={setSupplierSort}
                    className="px-4 text-right"
                    align="right"
                  />
                  <SortableTableHead
                    label="Status"
                    column="status"
                    sort={supplierSort}
                    onSortChange={setSupplierSort}
                    className="px-4"
                  />
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No suppliers yet. Add one to record purchases.
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No suppliers match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openSupplierProfile(s)}
                    >
                      <TableCell className="px-4 font-medium">{s.name}</TableCell>
                      <TableCell className="px-4 text-sm tabular-nums">
                        {s.phone.trim() || "—"}
                      </TableCell>
                      <TableCell
                        className={cx(
                          "max-w-0 overflow-hidden px-4 text-right text-sm tabular-nums",
                          s.totalPurchasesPaise > 0
                            ? "font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        <span className="block truncate">{formatRupees(s.totalPurchasesPaise)}</span>
                      </TableCell>
                      <TableCell
                        className={cx(
                          "max-w-0 overflow-hidden px-4 text-right text-sm tabular-nums",
                          s.balancePaise > 0
                            ? "font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        <span className="block truncate">{formatRupees(s.balancePaise)}</span>
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge variant={s.active ? "default" : "secondary"}>
                          {s.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSupplierProfile(s);
                            }}
                          >
                            <EyeIcon className="size-4" aria-hidden />
                            <span className="sr-only">View {s.name}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditSupplier(s);
                            }}
                          >
                            <PencilIcon className="size-4" aria-hidden />
                            <span className="sr-only">Edit {s.name}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingSupplier(s);
                            }}
                          >
                            <Trash2Icon className="size-4" aria-hidden />
                            <span className="sr-only">Delete {s.name}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog
            open={profileSupplier !== null}
            onOpenChange={(open) => {
              if (!open) closeSupplierProfile();
            }}
          >
            <DialogContent
              className="flex h-[min(92vh,880px)] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,56rem)]"
              showCloseButton
            >
              {profileSupplier ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
                    <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                      <div className="min-w-0 space-y-1.5">
                        <DialogTitle className="text-xl">{profileSupplier.name}</DialogTitle>
                        <DialogDescription render={<div className="space-y-1" />}>
                          <p className="text-sm">
                            {profileSupplier.phone.trim() || "No phone"}
                          </p>
                          {profileSupplier.address.trim() ? (
                            <p className="text-muted-foreground text-sm">
                              {profileSupplier.address.trim()}
                            </p>
                          ) : null}
                        </DialogDescription>
                        <Badge
                          variant={profileSupplier.active ? "default" : "secondary"}
                        >
                          {profileSupplier.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditSupplier(profileSupplier)}
                      >
                        <PencilIcon className="mr-2 size-4" aria-hidden />
                        Edit
                      </Button>
                    </div>
                  </DialogHeader>

                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                    {supplierProfileLoading ? (
                      <p className="text-muted-foreground text-sm">Refreshing…</p>
                    ) : null}

                    <>
                        <div className="grid min-w-0 grid-cols-4 gap-2">
                          <KpiCard
                            compact
                            title="Balance payable"
                            value={formatRupees(activeProfileStats.balancePaise)}
                            subtitle={
                              activeProfileStats.balancePaise > 0
                                ? "Owed"
                                : activeProfileStats.balancePaise < 0
                                  ? "Credit"
                                  : "Settled"
                            }
                            Icon={IndianRupeeIcon}
                            gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
                          />
                          <KpiCard
                            compact
                            title="Purchases"
                            value={formatRupees(activeProfileStats.totalPurchasesPaise)}
                            subtitle={`${activeProfileStats.purchaseCount} txn`}
                            Icon={ReceiptIcon}
                            gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-violet-500/15"
                          />
                          <KpiCard
                            compact
                            title="Paid"
                            value={formatRupees(activeProfileStats.totalPaidPaise)}
                            subtitle="Payments"
                            Icon={WalletIcon}
                            gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
                          />
                          <KpiCard
                            compact
                            title="Returns"
                            value={formatRupees(activeProfileStats.totalReturnsPaise)}
                            subtitle="Credited"
                            Icon={TruckIcon}
                            gradientClassName="bg-gradient-to-br from-slate-500/20 via-zinc-500/10 to-stone-500/15"
                          />
                        </div>

                        <details className="rounded-xl border bg-card open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
                            <span>
                              Opening balance
                              {activeProfileStats.hasOpeningBalance ? (
                                <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                                  {formatRupees(activeProfileStats.openingBalancePaise)}
                                </span>
                              ) : (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  Not set
                                </span>
                              )}
                            </span>
                            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
                          </summary>
                          <div className="space-y-3 border-t px-4 py-3">
                            {activeProfileStats.hasOpeningBalance ? (
                              <>
                                <p className="text-sm tabular-nums">
                                  {formatRupees(activeProfileStats.openingBalancePaise)}
                                  {activeProfileStats.openingBalanceAt ? (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · {activeProfileStats.openingBalanceAt.slice(0, 10)}
                                    </span>
                                  ) : null}
                                </p>
                                {activeProfileStats.openingBalanceNote ? (
                                  <p className="text-muted-foreground text-xs">
                                    {activeProfileStats.openingBalanceNote}
                                  </p>
                                ) : null}
                                <p className="text-muted-foreground text-xs">
                                  Remove to clear this entry, then you can record a new
                                  opening balance.
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={
                                    openingBalanceRemoving || openingBalanceSubmitting
                                  }
                                  onClick={() => void removeOpeningBalance()}
                                >
                                  {openingBalanceRemoving ? "Removing…" : "Remove"}
                                </Button>
                              </>
                            ) : (
                              <>
                                <p className="text-muted-foreground text-xs">
                                  Amount you already owed this supplier before using
                                  Khaanz.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label htmlFor="supplier-opening-amount">Amount (₹)</Label>
                                    <Input
                                      id="supplier-opening-amount"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                      value={openingBalanceRupees}
                                      onChange={(e) =>
                                        setOpeningBalanceRupees(e.target.value)
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="supplier-opening-note">
                                      Note (optional)
                                    </Label>
                                    <Input
                                      id="supplier-opening-note"
                                      placeholder="e.g. Balance from previous system"
                                      value={openingBalanceNote}
                                      onChange={(e) =>
                                        setOpeningBalanceNote(e.target.value)
                                      }
                                    />
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={openingBalanceSubmitting}
                                  onClick={() => void submitOpeningBalance()}
                                >
                                  {openingBalanceSubmitting
                                    ? "Saving…"
                                    : "Save opening balance"}
                                </Button>
                              </>
                            )}
                          </div>
                        </details>

                        <details className="rounded-xl border bg-card open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
                            <span>Record payment</span>
                            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
                          </summary>
                          <div className="space-y-3 border-t px-4 py-3">
                            <p className="text-muted-foreground text-xs">
                              Log cash, UPI, bank, or cheque paid to this supplier. Reduces
                              the balance payable.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="supplier-pay-amount">Amount (₹)</Label>
                                <Input
                                  id="supplier-pay-amount"
                                  inputMode="decimal"
                                  placeholder="e.g. 5000"
                                  value={profilePayment.amountRupees}
                                  onChange={(e) =>
                                    setProfilePayment({
                                      ...profilePayment,
                                      amountRupees: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="supplier-pay-method">How you paid</Label>
                                <SearchableSelect
                                  options={SUPPLIER_PAYMENT_METHOD_OPTIONS}
                                  value={profilePayment.method}
                                  onValueChange={(v) =>
                                    setProfilePayment({ ...profilePayment, method: v })
                                  }
                                  placeholder="Payment method"
                                  searchPlaceholder="Search…"
                                />
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="supplier-pay-txn">
                                  Transaction ID / reference
                                </Label>
                                <Input
                                  id="supplier-pay-txn"
                                  placeholder="UPI ref, cheque no., bank txn id…"
                                  value={profilePayment.transactionId}
                                  onChange={(e) =>
                                    setProfilePayment({
                                      ...profilePayment,
                                      transactionId: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="supplier-pay-note">Note (optional)</Label>
                                <Input
                                  id="supplier-pay-note"
                                  placeholder="e.g. Partial payment for March stock"
                                  value={profilePayment.note}
                                  onChange={(e) =>
                                    setProfilePayment({
                                      ...profilePayment,
                                      note: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={profilePaymentSubmitting}
                              onClick={() => void submitProfilePayment()}
                            >
                              {profilePaymentSubmitting
                                ? "Saving…"
                                : "Record payment"}
                            </Button>
                          </div>
                        </details>

                        <Tabs
                          value={supplierProfileTab}
                          onValueChange={setSupplierProfileTab}
                        >
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger
                              value="purchases"
                              className="data-[state=active]:font-semibold"
                            >
                              Purchases
                            </TabsTrigger>
                            <TabsTrigger
                              value="ledger"
                              className="data-[state=active]:font-semibold"
                            >
                              Ledger
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="purchases" className="mt-4 space-y-2">
                            <div className="overflow-hidden rounded-xl border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Batch</TableHead>
                                    <TableHead>Payment</TableHead>
                                    <TableHead className="text-center">Bill</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {profilePurchases.length === 0 ? (
                                    <TableRow>
                                      <TableCell
                                        colSpan={5}
                                        className="py-8 text-center text-muted-foreground text-sm"
                                      >
                                        No purchases for this supplier yet.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    profilePurchases.map((p) => (
                                      <TableRow key={p.id}>
                                        <TableCell className="text-sm tabular-nums">
                                          {p.purchasedAt.slice(0, 10)}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                          {p.batchRef}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                          {p.paymentType}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {(p.bills?.length ?? 0) > 0 ? (
                                            <PaperclipIcon className="mx-auto size-3.5" aria-hidden />
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">
                                          {formatRupees(p.totalPaise)}
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </TabsContent>

                          <TabsContent value="ledger" className="mt-4 space-y-2">
                            <div className="overflow-hidden rounded-xl border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Debit</TableHead>
                                    <TableHead className="text-right">Credit</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {supplierLedgerEntries.length === 0 ? (
                                    <TableRow>
                                      <TableCell
                                        colSpan={5}
                                        className="py-8 text-center text-muted-foreground text-sm"
                                      >
                                        No ledger entries yet.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    [...supplierLedgerEntries]
                                      .reverse()
                                      .map((e) => (
                                        <TableRow key={e.id}>
                                          <TableCell className="text-sm tabular-nums">
                                            {e.occurredAt.slice(0, 10)}
                                          </TableCell>
                                          <TableCell className="text-sm">
                                            <div>
                                              {supplierLedgerEntryLabel(e)}
                                            </div>
                                            {e.paymentReference ? (
                                              <div className="font-mono text-muted-foreground text-xs">
                                                Txn: {e.paymentReference}
                                              </div>
                                            ) : null}
                                            {e.note ? (
                                              <div className="text-muted-foreground text-xs">
                                                {e.note}
                                              </div>
                                            ) : null}
                                          </TableCell>
                                          <TableCell className="text-right text-sm tabular-nums">
                                            {e.debitPaise > 0
                                              ? formatRupees(e.debitPaise)
                                              : "—"}
                                          </TableCell>
                                          <TableCell className="text-right text-sm tabular-nums">
                                            {e.creditPaise > 0
                                              ? formatRupees(e.creditPaise)
                                              : "—"}
                                          </TableCell>
                                          <TableCell className="text-right text-sm tabular-nums font-medium">
                                            {formatRupees(e.balancePaise)}
                                          </TableCell>
                                        </TableRow>
                                      ))
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </TabsContent>
                        </Tabs>
                    </>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

          <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingSupplierId ? "Edit supplier" : "Add supplier"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="supplier-name">Name</Label>
                  <Input
                    id="supplier-name"
                    placeholder="Supplier name"
                    value={supplierForm.name}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier-phone">Phone</Label>
                  <Input
                    id="supplier-phone"
                    placeholder="Phone number"
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier-address">Address</Label>
                  <Input
                    id="supplier-address"
                    placeholder="Address"
                    value={supplierForm.address}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, address: e.target.value })
                    }
                  />
                </div>
                {!editingSupplierId ? (
                  <details className="rounded-lg border bg-muted/20 open:[&>summary_svg]:rotate-180 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
                      <span>Opening balance (optional)</span>
                      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform" />
                    </summary>
                    <div className="space-y-3 border-t px-3 py-3">
                      <p className="text-muted-foreground text-xs">
                        Amount already owed to this supplier before you record purchases
                        here.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="new-supplier-opening-amount">Amount (₹)</Label>
                        <Input
                          id="new-supplier-opening-amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={supplierForm.openingBalanceRupees}
                          onChange={(e) =>
                            setSupplierForm({
                              ...supplierForm,
                              openingBalanceRupees: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-supplier-opening-note">Note (optional)</Label>
                        <Input
                          id="new-supplier-opening-note"
                          placeholder="e.g. Balance from previous system"
                          value={supplierForm.openingBalanceNote}
                          onChange={(e) =>
                            setSupplierForm({
                              ...supplierForm,
                              openingBalanceNote: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSupplierDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveSupplier()}>
                  {editingSupplierId ? "Save changes" : "Add supplier"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deletingSupplier !== null}
            onOpenChange={(open) => {
              if (!open && !supplierDeleteSubmitting) setDeletingSupplier(null);
            }}
          >
            <DialogContent
              className="sm:max-w-md"
              showCloseButton={!supplierDeleteSubmitting}
            >
              <DialogHeader>
                <DialogTitle>Delete supplier?</DialogTitle>
                <DialogDescription render={<div />}>
                  <div className="space-y-3 text-sm">
                    <p>
                      You are about to delete{" "}
                      <span className="font-medium text-foreground">
                        {deletingSupplier?.name}
                      </span>
                      . Here is what happens:
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                      <li>
                        If this supplier has{" "}
                        <span className="font-medium text-foreground">no history</span> (no
                        purchases, payments, ledger entries, or returns), it is{" "}
                        <span className="font-medium text-foreground">
                          permanently removed
                        </span>
                        .
                      </li>
                      <li>
                        If it has any history, it is instead{" "}
                        <span className="font-medium text-foreground">
                          archived (deactivated)
                        </span>{" "}
                        so purchases, payments, and payable balances stay intact.
                      </li>
                      <li>
                        Archived suppliers are hidden from this list and from supplier
                        pickers. Set the{" "}
                        <span className="font-medium text-foreground">Status</span> filter to{" "}
                        <span className="font-medium text-foreground">Inactive only</span> or{" "}
                        <span className="font-medium text-foreground">All statuses</span> to
                        view them again.
                      </li>
                    </ul>
                    <p>This cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={supplierDeleteSubmitting}
                  onClick={() => setDeletingSupplier(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={supplierDeleteSubmitting}
                  onClick={() => void confirmDeleteSupplier()}
                >
                  {supplierDeleteSubmitting ? "Deleting…" : "Delete supplier"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="purchase" className={cx("space-y-4 pt-4", tabLoading && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Purchases</h2>
              <p className="text-muted-foreground text-sm">
                Receive stock from suppliers and update inventory.
              </p>
            </div>
            <Button type="button" onClick={openNewPurchase}>
              <PlusIcon className="mr-2 size-4" aria-hidden />
              New purchase
            </Button>
          </div>

          <DataTableToolbar
            search={purchaseSearch}
            onSearchChange={setPurchaseSearch}
            searchPlaceholder="Search batch, supplier, payment…"
            sort={purchaseSort}
            onSortChange={setPurchaseSort}
            sortOptions={[
              { value: "date-desc", label: "Date (newest)" },
              { value: "date-asc", label: "Date (oldest)" },
              { value: "amount-desc", label: "Amount (high–low)" },
              { value: "amount-asc", label: "Amount (low–high)" },
              { value: "supplier-asc", label: "Supplier" },
            ]}
            filteredCount={filteredPurchases.length}
            totalCount={purchases.length}
            showStatusFilter={false}
          >
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Payment</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={PURCHASE_PAYMENT_FILTER_OPTIONS}
                value={purchasePaymentFilter}
                onValueChange={setPurchasePaymentFilter}
                placeholder="Payment"
                searchPlaceholder="Search payment…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Supplier</Label>
              <SearchableSelect
                triggerClassName={selectControlClassName}
                options={[
                  { value: "all", label: "All suppliers" },
                  ...supplierSelectOptions(suppliers),
                ]}
                value={purchaseSupplierFilter}
                onValueChange={setPurchaseSupplierFilter}
                placeholder="Supplier"
                searchPlaceholder="Search suppliers…"
              />
            </div>
          </DataTableToolbar>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-center">Bill</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[8.5rem] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No purchases yet. Record your first purchase.
                    </TableCell>
                  </TableRow>
                ) : filteredPurchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No purchases match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPurchases.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openPurchaseDetail(p)}
                    >
                      <TableCell className="font-medium text-sm">{p.batchRef}</TableCell>
                      <TableCell>{p.supplierName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {p.purchasedAt.slice(0, 16).replace("T", " ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.paymentType}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {(p.bills?.length ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm text-foreground">
                            <PaperclipIcon className="size-3.5" aria-hidden />
                            {p.bills!.length}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.lineCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupees(p.totalPaise)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPurchaseDetail(p);
                            }}
                          >
                            <EyeIcon className="size-4" aria-hidden />
                            <span className="sr-only">View purchase {p.batchRef}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openEditPurchaseFromRow(p);
                            }}
                          >
                            <PencilIcon className="size-4" aria-hidden />
                            <span className="sr-only">Edit purchase {p.batchRef}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPurchase(p);
                            }}
                          >
                            <Trash2Icon className="size-4" aria-hidden />
                            <span className="sr-only">Delete purchase {p.batchRef}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog
            open={viewingPurchase !== null}
            onOpenChange={(open) => {
              if (!open) {
                setViewingPurchase(null);
                setPurchaseDetail(null);
              }
            }}
          >
            <DialogContent
              className="flex h-[min(92vh,880px)] w-[min(96vw,64rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,64rem)]"
              showCloseButton
            >
              {viewingPurchase ? (
                <>
                  <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
                    <DialogTitle className="text-xl">
                      {viewingPurchase.batchRef}
                    </DialogTitle>
                    <DialogDescription>
                      {viewingPurchase.supplierName} ·{" "}
                      {viewingPurchase.purchasedAt.slice(0, 16).replace("T", " ")}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                    {purchaseDetailLoading && !purchaseDetail ? (
                      <AdminTableSkeleton rows={5} />
                    ) : !purchaseDetail ? (
                      <p className="text-muted-foreground text-sm">
                        Could not load this purchase.
                      </p>
                    ) : (
                      <>
                        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
                          <div>
                            <p className="text-muted-foreground text-xs">Payment</p>
                            <p className="font-medium text-sm">
                              {purchaseDetail.paymentType}
                              {purchaseDetail.creditDays !== null
                                ? ` · ${purchaseDetail.creditDays} days`
                                : ""}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Due</p>
                            <p className="font-medium text-sm tabular-nums">
                              {purchaseDetail.dueAt
                                ? purchaseDetail.dueAt.slice(0, 10)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Items</p>
                            <p className="font-medium text-sm tabular-nums">
                              {purchaseDetail.lines.length}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Total</p>
                            <p className="font-medium text-sm tabular-nums">
                              {formatRupees(purchaseDetail.totalPaise)}
                            </p>
                          </div>
                          {purchaseDetail.supplierPhone.trim() ? (
                            <div>
                              <p className="text-muted-foreground text-xs">
                                Supplier phone
                              </p>
                              <p className="font-medium text-sm tabular-nums">
                                {purchaseDetail.supplierPhone}
                              </p>
                            </div>
                          ) : null}
                          {purchaseDetail.notes.trim() ? (
                            <div className="sm:col-span-4">
                              <p className="text-muted-foreground text-xs">Notes</p>
                              <p className="text-sm">{purchaseDetail.notes}</p>
                            </div>
                          ) : null}
                          <div className="sm:col-span-4">
                            <PurchaseBillField
                              bills={purchaseDetail.bills ?? []}
                              supplierName={purchaseDetail.supplierName}
                              onChange={(next) => {
                                setPurchaseDetail((prev) =>
                                  prev ? { ...prev, bills: next } : prev,
                                );
                                void savePurchaseBills(purchaseDetail.id, next);
                              }}
                            />
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border bg-card">
                          <div className="overflow-x-auto">
                            <Table className="min-w-[48rem]">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Item</TableHead>
                                  <TableHead className="text-right">Qty</TableHead>
                                  <TableHead className="text-right">Received</TableHead>
                                  <TableHead className="text-right">Remaining</TableHead>
                                  <TableHead className="text-right">Rate</TableHead>
                                  <TableHead>Expiry</TableHead>
                                  <TableHead>Lot</TableHead>
                                  <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {purchaseDetail.lines.length === 0 ? (
                                  <TableRow>
                                    <TableCell
                                      colSpan={8}
                                      className="py-8 text-center text-muted-foreground"
                                    >
                                      This purchase has no line items.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  purchaseDetail.lines.map((ln) => (
                                    <TableRow key={ln.id}>
                                      <TableCell>
                                        <p className="font-medium text-sm">{ln.itemName}</p>
                                        {ln.category.trim() ? (
                                          <p className="text-muted-foreground text-xs">
                                            {ln.category}
                                          </p>
                                        ) : null}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums">
                                        {formatRecipeQtyBase(ln.qtyPurchase)}{" "}
                                        {ln.purchaseUnit}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums">
                                        {formatRecipeQtyBase(ln.qtyBaseReceived)}{" "}
                                        {ln.baseUnit}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                        {ln.remainingQtyBase === null
                                          ? "—"
                                          : `${formatRecipeQtyBase(ln.remainingQtyBase)} ${ln.baseUnit}`}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums">
                                        {formatRupees(ln.ratePaisePerPurchaseUnit)}
                                        <span className="text-muted-foreground">
                                          {" "}
                                          / {ln.purchaseUnit}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                                        {ln.expiryDate ? ln.expiryDate.slice(0, 10) : "—"}
                                      </TableCell>
                                      <TableCell className="text-sm text-muted-foreground">
                                        {ln.lotCode.trim() || "—"}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-medium tabular-nums">
                                        {formatRupees(ln.lineTotalPaise)}
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        {purchaseDetail.returns.length > 0 ? (
                          <div className="overflow-hidden rounded-xl border bg-card">
                            <div className="border-b px-4 py-3">
                              <p className="font-medium text-sm">Returns against this purchase</p>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead className="text-right">Lines</TableHead>
                                  <TableHead>Notes</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {purchaseDetail.returns.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="text-sm tabular-nums">
                                      {r.returnedAt.slice(0, 10)}
                                    </TableCell>
                                    <TableCell className="text-right text-sm tabular-nums">
                                      {r.lineCount}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {r.notes.trim() || "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-sm tabular-nums">
                                      {formatRupees(r.totalCreditPaise)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : null}

                        {!purchaseDetail.editable ? (
                          <p className="text-muted-foreground text-xs">
                            Editing is locked because stock from this purchase has already
                            been used or returned.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <DialogFooter className="shrink-0 border-t px-5 py-4 sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        const target = viewingPurchase;
                        setViewingPurchase(null);
                        setPurchaseDetail(null);
                        setDeletingPurchase(target);
                      }}
                    >
                      <Trash2Icon className="mr-2 size-4" aria-hidden />
                      Delete
                    </Button>
                    <div className="flex flex-wrap justify-end gap-2">
                      {purchaseDetail?.editable ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openEditPurchase(purchaseDetail)}
                        >
                          <PencilIcon className="mr-2 size-4" aria-hidden />
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setViewingPurchase(null);
                          setPurchaseDetail(null);
                        }}
                      >
                        Close
                      </Button>
                    </div>
                  </DialogFooter>
                </>
              ) : null}
            </DialogContent>
          </Dialog>

          <Dialog
            open={purchaseDialogOpen}
            onOpenChange={(open) => {
              setPurchaseDialogOpen(open);
              if (!open) resetPurchaseForm();
            }}
          >
            <DialogContent className="flex h-[min(92vh,880px)] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]">
              <DialogHeader className="shrink-0 border-b px-6 py-4">
                <DialogTitle>
                  {editingPurchaseId
                    ? `Edit purchase${editingPurchaseBatchRef ? ` ${editingPurchaseBatchRef}` : ""}`
                    : "Record purchase"}
                </DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Supplier</Label>
                    <SearchableSelect
                      options={supplierSelectOptions(suppliers, !editingPurchaseId)}
                      value={purchase.supplierId}
                      onValueChange={(v) =>
                        setPurchase({ ...purchase, supplierId: v })
                      }
                      placeholder="Select supplier…"
                      searchPlaceholder="Search suppliers…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Purchased at</Label>
                    <Input
                      type="datetime-local"
                      value={purchase.purchasedAt}
                      onChange={(e) =>
                        setPurchase({ ...purchase, purchasedAt: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment type</Label>
                    <SearchableSelect
                      options={PAYMENT_TYPE_OPTIONS}
                      value={purchase.paymentType}
                      onValueChange={(v) =>
                        setPurchase({ ...purchase, paymentType: v })
                      }
                      placeholder="Payment type"
                      searchPlaceholder="Search…"
                    />
                  </div>
                  {purchase.paymentType === "CREDIT" ? (
                    <div className="space-y-2 md:col-span-3">
                      <Label>Credit days (optional)</Label>
                      <Input
                        inputMode="numeric"
                        value={purchase.creditDays}
                        onChange={(e) =>
                          setPurchase({ ...purchase, creditDays: e.target.value })
                        }
                        placeholder="e.g. 15"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2 md:col-span-3">
                    <Label>Notes (optional)</Label>
                    <Input
                      value={purchase.notes}
                      onChange={(e) =>
                        setPurchase({ ...purchase, notes: e.target.value })
                      }
                      placeholder="e.g. Invoice #, delivery note…"
                    />
                  </div>
                  <PurchaseBillField
                    bills={purchaseBills}
                    supplierName={
                      suppliers.find((s) => s.id === purchase.supplierId)?.name ?? ""
                    }
                    onChange={setPurchaseBills}
                    disabled={purchaseSubmitting}
                  />
                </div>

                <div className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-medium text-sm">Line items</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setPurchaseLines((x) => [
                          ...x,
                          {
                            id: crypto.randomUUID(),
                            inventoryItemId: "",
                            qtyPurchase: "1",
                            rateRupees: "",
                            expiryDate: "",
                            lotCode: "",
                          },
                        ])
                      }
                    >
                      Add line
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                  <Table className="min-w-[52rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[14rem]">Item</TableHead>
                        <TableHead className="w-24">Qty</TableHead>
                        <TableHead className="w-28">Rate (₹)</TableHead>
                        <TableHead className="w-36">Expiry</TableHead>
                        <TableHead className="w-28">Lot</TableHead>
                        <TableHead className="w-24 text-right">Total</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseLines.map((ln) => {
                        const qty = Number(ln.qtyPurchase);
                        const ratePaise = rupeesToPaise(ln.rateRupees);
                        const ok = Number.isFinite(qty) && qty > 0 && ln.rateRupees.trim() !== "";
                        const lineTotal = ok ? Math.round(qty * ratePaise) : 0;
                        return (
                          <TableRow key={ln.id}>
                            <TableCell>
                              <InventoryItemSelect
                                value={ln.inventoryItemId}
                                onChange={(v) =>
                                  setPurchaseLines((x) =>
                                    x.map((r) =>
                                      r.id === ln.id ? { ...r, inventoryItemId: v } : r,
                                    ),
                                  )
                                }
                                items={items}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                value={ln.qtyPurchase}
                                onChange={(e) =>
                                  setPurchaseLines((x) =>
                                    x.map((r) =>
                                      r.id === ln.id ? { ...r, qtyPurchase: e.target.value } : r,
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
                                  setPurchaseLines((x) =>
                                    x.map((r) =>
                                      r.id === ln.id ? { ...r, rateRupees: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={ln.expiryDate}
                                onChange={(e) =>
                                  setPurchaseLines((x) =>
                                    x.map((r) =>
                                      r.id === ln.id ? { ...r, expiryDate: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={ln.lotCode}
                                onChange={(e) =>
                                  setPurchaseLines((x) =>
                                    x.map((r) =>
                                      r.id === ln.id ? { ...r, lotCode: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right">{formatRupees(lineTotal)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPurchaseLines((x) =>
                                    x.length <= 1 ? x : x.filter((r) => r.id !== ln.id),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                  <p className="mt-2 text-muted-foreground text-sm">
                    Total:{" "}
                    <span className="font-medium text-foreground">
                      {formatRupees(purchaseTotalPaise)}
                    </span>
                  </p>
                </div>
              </div>
              <DialogFooter className="shrink-0 border-t px-6 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={purchaseSubmitting}
                  onClick={() => {
                    setPurchaseDialogOpen(false);
                    resetPurchaseForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={purchaseSubmitting}
                  onClick={() => void submitPurchase()}
                >
                  {purchaseSubmitting
                    ? editingPurchaseId
                      ? "Saving…"
                      : "Posting…"
                    : editingPurchaseId
                      ? "Save changes"
                      : "Post purchase"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deletingPurchase !== null}
            onOpenChange={(open) => {
              if (!open && !purchaseDeleteSubmitting) setDeletingPurchase(null);
            }}
          >
            <DialogContent
              className="sm:max-w-md"
              showCloseButton={!purchaseDeleteSubmitting}
            >
              <DialogHeader>
                <DialogTitle>Delete purchase?</DialogTitle>
                <DialogDescription render={<div />}>
                  <div className="space-y-3 text-sm">
                    <p>
                      You are about to delete purchase{" "}
                      <span className="font-medium text-foreground">
                        {deletingPurchase?.batchRef}
                      </span>{" "}
                      from{" "}
                      <span className="font-medium text-foreground">
                        {deletingPurchase?.supplierName}
                      </span>
                      . This fully reverses it:
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                      <li>
                        The received quantities are{" "}
                        <span className="font-medium text-foreground">
                          removed from stock
                        </span>{" "}
                        and the stock batches and movements are deleted.
                      </li>
                      <li>
                        The supplier{" "}
                        <span className="font-medium text-foreground">ledger debit</span> is
                        reversed, and any auto-settled{" "}
                        <span className="font-medium text-foreground">cash payment</span> is
                        removed. Item costs are recalculated.
                      </li>
                      <li>
                        This is only allowed while{" "}
                        <span className="font-medium text-foreground">
                          none of the received stock has been used
                        </span>{" "}
                        (sold, wasted, adjusted, or returned). Otherwise the delete is
                        blocked to protect your records.
                      </li>
                    </ul>
                    <p>This cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={purchaseDeleteSubmitting}
                  onClick={() => setDeletingPurchase(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={purchaseDeleteSubmitting}
                  onClick={() => void confirmDeletePurchase()}
                >
                  {purchaseDeleteSubmitting ? "Deleting…" : "Delete purchase"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="recipes" className={cx("space-y-4 pt-4", tabLoading && "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Recipes</h2>
              <p className="text-muted-foreground text-sm">
                Ingredient lists per menu item for POS stock deduction.
              </p>
            </div>
            <Button type="button" onClick={() => openNewRecipe()}>
              <PlusIcon className="mr-2 size-4" aria-hidden />
              New recipe version
            </Button>
          </div>

          <div className="space-y-4">
            <div className="inline-flex h-8 w-full max-w-xl items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
              {(
                [
                  {
                    value: "all" as const,
                    label: "All",
                    count: recipeCoverageCounts.total,
                  },
                  {
                    value: "added" as const,
                    label: "Added",
                    count: recipeAddedMenuItemCount,
                  },
                  {
                    value: "missing" as const,
                    label: "Missing",
                    count: recipeNeedsCount,
                  },
                ] as const
              ).map((t) => {
                const active = recipeViewTab === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    className={cx(
                      "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap transition-all",
                      active
                        ? "bg-background font-semibold text-foreground shadow-sm"
                        : "text-foreground/60 hover:text-foreground",
                    )}
                    onClick={() => setRecipeView(t.value)}
                  >
                    {t.label}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {recipeViewTab === "all" ? (
            <div className="space-y-4">
              <DataTableToolbar
                search={recipeSearch}
                onSearchChange={setRecipeSearch}
                searchPlaceholder="Search menu item, category, variation…"
                sort={recipeSort}
                onSortChange={setRecipeSort}
                sortOptions={[]}
                showSort={false}
                filteredCount={allTabRows.length}
                totalCount={allTabTotalRowCount}
                showStatusFilter={false}
              >
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Category</Label>
                  <SearchableSelect
                    triggerClassName={selectControlClassName}
                    options={[
                      { value: "all", label: "All categories" },
                      ...menuCategories.map((c) => ({ value: c, label: c })),
                    ]}
                    value={recipeCategoryFilter}
                    onValueChange={setRecipeCategoryFilter}
                    placeholder="Category"
                    searchPlaceholder="Search categories…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Menu item</Label>
                  <SearchableSelect
                    triggerClassName={selectControlClassName}
                    options={[
                      { value: "all", label: "All dishes" },
                      ...menuItemsForRecipeFilter.map(([id, name]) => ({
                        value: id,
                        label: name,
                      })),
                    ]}
                    value={recipeMenuFilter}
                    onValueChange={setRecipeMenuFilter}
                    placeholder="Menu item"
                    searchPlaceholder="Search dishes…"
                  />
                </div>
              </DataTableToolbar>

              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        label="Menu item"
                        column="menu"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Variation"
                        column="variation"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Version"
                        column="version"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Effective from"
                        column="date"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Ingredients"
                        column="ingredients"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                        className="text-right"
                        align="right"
                      />
                      <SortableTableHead
                        label="Recipe cost"
                        column="cost"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                        className="text-right"
                        align="right"
                      />
                      <SortableTableHead
                        label="Selling price"
                        column="price"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                        className="text-right"
                        align="right"
                      />
                      <TableHead className="w-[9rem] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {menuItemVariationCoverage.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No menu items found. Add dishes under Menu first.
                        </TableCell>
                      </TableRow>
                    ) : allTabRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No recipes or menu items match your search or filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      allTabRows.map((entry) => {
                        if (entry.kind === "recipe") {
                          const r = entry.recipe;
                          const costPaise = recipeCostPaise(r);
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">
                                {r.menuItemName}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {recipeVariationLabel(r.menuItemId, r.variationId)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                v{r.version}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatEffectiveDate(r.effectiveFrom)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.ingredients.length}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {formatRecipeCostRupees(costPaise)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {recipeMenuSellingPriceLabel(
                                  r.menuItemId,
                                  r.variationId,
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditRecipe(r)}
                                  >
                                    <PencilIcon className="size-4" aria-hidden />
                                    <span className="sr-only">
                                      Edit recipe for {r.menuItemName}
                                    </span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    title="Copy recipe"
                                    onClick={() => openCopyRecipe(r)}
                                  >
                                    <CopyIcon className="size-4" aria-hidden />
                                    <span className="sr-only">
                                      Copy recipe for {r.menuItemName}
                                    </span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setDeletingRecipe(r)}
                                  >
                                    <Trash2Icon className="size-4" aria-hidden />
                                    <span className="sr-only">
                                      Delete recipe for {r.menuItemName}
                                    </span>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        }

                        const row = entry.row;
                        return (
                          <TableRow
                            key={`missing:${row.menuItemId}:${row.variationId ?? ""}`}
                          >
                            <TableCell className="font-medium">
                              {row.menuItemName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {row.variationName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              —
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              —
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              —
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              —
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              —
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  openNewRecipe({
                                    menuItemId: row.menuItemId,
                                    variationId: row.variationId ?? undefined,
                                  })
                                }
                              >
                                <PlusIcon className="size-4" aria-hidden />
                                <span className="sr-only">
                                  Add recipe for {row.menuItemName} ·{" "}
                                  {row.variationName}
                                </span>
                                <span className="ml-1">Add</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : null}

            {recipeViewTab === "added" ? (
            <div className="space-y-4">
              <DataTableToolbar
                search={recipeSearch}
                onSearchChange={setRecipeSearch}
                searchPlaceholder="Search menu item, category, variation…"
                sort={recipeSort}
                onSortChange={setRecipeSort}
                sortOptions={[]}
                showSort={false}
                filteredCount={filteredRecipes.length}
                totalCount={recipesList.length}
                showStatusFilter={false}
              >
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Category</Label>
                  <SearchableSelect
                    triggerClassName={selectControlClassName}
                    options={[
                      { value: "all", label: "All categories" },
                      ...menuCategories.map((c) => ({ value: c, label: c })),
                    ]}
                    value={recipeCategoryFilter}
                    onValueChange={setRecipeCategoryFilter}
                    placeholder="Category"
                    searchPlaceholder="Search categories…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Menu item</Label>
                  <SearchableSelect
                    triggerClassName={selectControlClassName}
                    options={[
                      { value: "all", label: "All dishes" },
                      ...menuItemsForRecipeFilter.map(([id, name]) => ({
                        value: id,
                        label: name,
                      })),
                    ]}
                    value={recipeMenuFilter}
                    onValueChange={setRecipeMenuFilter}
                    placeholder="Menu item"
                    searchPlaceholder="Search dishes…"
                  />
                </div>
              </DataTableToolbar>

              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        label="Menu item"
                        column="menu"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Variation"
                        column="variation"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Version"
                        column="version"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Effective from"
                        column="date"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                      />
                      <SortableTableHead
                        label="Ingredients"
                        column="ingredients"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                        className="text-right"
                        align="right"
                      />
                      <SortableTableHead
                        label="Recipe cost"
                        column="cost"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                        className="text-right"
                        align="right"
                      />
                      <SortableTableHead
                        label="Selling price"
                        column="price"
                        sort={recipeSort}
                        onSortChange={setRecipeSort}
                        className="text-right"
                        align="right"
                      />
                      <TableHead className="w-[9rem] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipesList.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No recipe versions yet.
                        </TableCell>
                      </TableRow>
                    ) : filteredRecipes.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No recipes match your search or filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecipes.map((r) => {
                        const costPaise = recipeCostPaise(r);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {r.menuItemName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {recipeVariationLabel(r.menuItemId, r.variationId)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              v{r.version}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatEffectiveDate(r.effectiveFrom)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.ingredients.length}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatRecipeCostRupees(costPaise)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {recipeMenuSellingPriceLabel(
                                r.menuItemId,
                                r.variationId,
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditRecipe(r)}
                                >
                                  <PencilIcon className="size-4" aria-hidden />
                                  <span className="sr-only">
                                    Edit recipe for {r.menuItemName}
                                  </span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  title="Copy recipe"
                                  onClick={() => openCopyRecipe(r)}
                                >
                                  <CopyIcon className="size-4" aria-hidden />
                                  <span className="sr-only">
                                    Copy recipe for {r.menuItemName}
                                  </span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => setDeletingRecipe(r)}
                                >
                                  <Trash2Icon className="size-4" aria-hidden />
                                  <span className="sr-only">
                                    Delete recipe for {r.menuItemName}
                                  </span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : null}

            {recipeViewTab === "missing" ? (
            <div className="space-y-4">
              <DataTableToolbar
                search={recipeItemSearch}
                onSearchChange={setRecipeItemSearch}
                searchPlaceholder="Search menu item, variation, category…"
                sort=""
                onSortChange={() => undefined}
                sortOptions={[]}
                showSort={false}
                filteredCount={filteredMenuItemVariationCoverage.length}
                totalCount={recipeNeedsCount}
                showStatusFilter={false}
              >
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Category</Label>
                  <SearchableSelect
                    triggerClassName={selectControlClassName}
                    options={[
                      { value: "all", label: "All categories" },
                      ...menuCategories.map((c) => ({ value: c, label: c })),
                    ]}
                    value={recipeCategoryFilter}
                    onValueChange={setRecipeCategoryFilter}
                    placeholder="Category"
                    searchPlaceholder="Search categories…"
                  />
                </div>
              </DataTableToolbar>

              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Menu item</TableHead>
                      <TableHead>Variation</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Versions</TableHead>
                      <TableHead className="w-[9rem] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {menuItemVariationCoverage.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No menu items found. Add dishes under Menu first.
                        </TableCell>
                      </TableRow>
                    ) : filteredMenuItemVariationCoverage.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          All filtered variations already have recipes.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMenuItemVariationCoverage.map((row) => (
                        <TableRow
                          key={`${row.menuItemId}:${row.variationId ?? ""}`}
                        >
                          <TableCell className="font-medium">
                            {row.menuItemName}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {row.variationName}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {row.category || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">No recipe</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.versionCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openNewRecipe({
                                  menuItemId: row.menuItemId,
                                  variationId: row.variationId ?? undefined,
                                })
                              }
                            >
                              <PlusIcon className="size-4" aria-hidden />
                              <span className="sr-only">
                                Add recipe for {row.menuItemName} ·{" "}
                                {row.variationName}
                              </span>
                              <span className="ml-1">Add</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : null}
          </div>

        </TabsContent>

        <TabsContent value="sell" className={cx("space-y-6 pt-4", tabLoading && "hidden")}>
          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-medium text-base">
                  <BanknoteIcon className="size-4 text-muted-foreground" />
                  Sell stock
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  Sell an inventory item directly (cash). Stock is reduced and the sale is
                  recorded in reports and the cash pool.
                </p>
              </div>
              <Button
                type="button"
                disabled={sellSubmitting}
                onClick={() => void postStockSale()}
              >
                {sellSubmitting ? "Saving…" : "Record sale"}
              </Button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Stock item</Label>
                <InventoryItemSelect
                  value={sellForm.itemId}
                  onChange={(v) => setSellForm({ ...sellForm, itemId: v })}
                  items={items}
                />
                <ItemOnHandHint item={items.find((i) => i.id === sellForm.itemId)} />
              </div>

              {(() => {
                const sellItem = items.find((i) => i.id === sellForm.itemId);
                const previewBase = sellItem
                  ? convertQtyToBaseUnits(
                      sellForm.qty,
                      sellForm.qtyUnit,
                      sellItem.baseUnitsPerPurchaseUnit,
                    )
                  : null;
                const pricePaise = rupeesToPaise(sellForm.priceRupees);
                const factor = sellItem ? Number(sellItem.baseUnitsPerPurchaseUnit) : NaN;
                const ratePaisePerBase =
                  sellItem && Number.isFinite(pricePaise) && pricePaise >= 0
                    ? sellForm.qtyUnit === "base"
                      ? pricePaise
                      : Number.isFinite(factor) && factor > 0
                        ? pricePaise / factor
                        : NaN
                    : NaN;
                const lineTotalPaise =
                  previewBase && Number.isFinite(ratePaisePerBase)
                    ? Math.max(
                        0,
                        Math.round(Number(previewBase) * ratePaisePerBase),
                      )
                    : null;
                const avgCostHint =
                  sellItem && sellForm.qtyUnit === "purchase"
                    ? avgCostToRateRupeesInput(
                        sellItem.avgCostPaisePerBase,
                        sellItem.baseUnitsPerPurchaseUnit,
                      )
                    : sellItem
                      ? paiseToRupeesInput(
                          Math.round(Number(sellItem.avgCostPaisePerBase)),
                        )
                      : "";

                return (
                  <>
                    <div className="space-y-2">
                      <Label>Quantity unit</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={sellForm.qtyUnit === "purchase" ? "default" : "outline"}
                          disabled={!sellItem}
                          onClick={() =>
                            setSellForm({ ...sellForm, qtyUnit: "purchase" })
                          }
                        >
                          {sellItem?.purchaseUnit || "Purchase unit"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={sellForm.qtyUnit === "base" ? "default" : "outline"}
                          disabled={!sellItem}
                          onClick={() => setSellForm({ ...sellForm, qtyUnit: "base" })}
                        >
                          {sellItem?.baseUnit || "Base unit"}
                        </Button>
                      </div>
                      {sellItem ? (
                        <p className="text-muted-foreground text-xs">
                          1 {sellItem.purchaseUnit} = {sellItem.baseUnitsPerPurchaseUnit}{" "}
                          {sellItem.baseUnit}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sell-qty">Quantity</Label>
                      <Input
                        id="sell-qty"
                        inputMode="decimal"
                        placeholder={
                          sellForm.qtyUnit === "purchase" ? "e.g. 2" : "e.g. 5000"
                        }
                        value={sellForm.qty}
                        onChange={(e) =>
                          setSellForm({ ...sellForm, qty: e.target.value })
                        }
                        disabled={!sellItem}
                      />
                      {previewBase && sellItem && sellForm.qtyUnit === "purchase" ? (
                        <p className="text-muted-foreground text-xs">
                          = {previewBase} {sellItem.baseUnit}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sell-price">
                        Selling price (₹ /{" "}
                        {sellForm.qtyUnit === "purchase"
                          ? (sellItem?.purchaseUnit ?? "purchase unit")
                          : (sellItem?.baseUnit ?? "base unit")}
                        )
                      </Label>
                      <Input
                        id="sell-price"
                        inputMode="decimal"
                        placeholder={avgCostHint ? `Cost ~ ₹${avgCostHint}` : "e.g. 120"}
                        value={sellForm.priceRupees}
                        onChange={(e) =>
                          setSellForm({ ...sellForm, priceRupees: e.target.value })
                        }
                        disabled={!sellItem}
                      />
                      {lineTotalPaise != null ? (
                        <p className="text-sm tabular-nums">
                          Line total:{" "}
                          <span className="font-medium">{formatRupees(lineTotalPaise)}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sell-at">Sold at (optional)</Label>
                      <Input
                        id="sell-at"
                        type="datetime-local"
                        value={sellForm.soldAt}
                        onChange={(e) =>
                          setSellForm({ ...sellForm, soldAt: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sell-buyer">Buyer (optional)</Label>
                      <Input
                        id="sell-buyer"
                        placeholder="Name or shop"
                        value={sellForm.buyerName}
                        onChange={(e) =>
                          setSellForm({ ...sellForm, buyerName: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="sell-note">Note (optional)</Label>
                      <Input
                        id="sell-note"
                        placeholder="e.g. Sold leftover rice"
                        value={sellForm.note}
                        onChange={(e) =>
                          setSellForm({ ...sellForm, note: e.target.value })
                        }
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="border-b px-4 py-3">
              <h3 className="font-medium text-sm">Recent stock sales</h3>
              <p className="text-muted-foreground text-xs">
                Latest {stockSales.length} sale{stockSales.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockSales.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-muted-foreground"
                      >
                        No stock sales yet. Record your first sale above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockSales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                          {s.soldAt.slice(0, 16).replace("T", " ")}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{s.item.name}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {s.qtyBase} {s.item.baseUnit}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium">
                          {formatRupees(s.totalPaise)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                          {formatRupees(s.costPaise)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.buyerName.trim() || "—"}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-muted-foreground text-xs">
                          {s.note.trim() || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ops" className={cx("space-y-6 pt-4", tabLoading && "hidden")}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <nav
              className="shrink-0 rounded-2xl border bg-card p-2 shadow-sm lg:sticky lg:top-4 lg:w-60"
              aria-label="Stock and pay actions"
            >
              {OPS_MENU_SECTIONS.map((section) => (
                <div key={section.group} className="py-1">
                  <p className="px-2 py-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {section.group}
                  </p>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <StockOpsMenuButton
                          active={opsMenu === item.id}
                          label={item.label}
                          Icon={item.Icon}
                          onClick={() => setOpsMenu(item.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="min-w-0 flex-1">
              {opsMenu === "opening" ? (
              <StockActionCard
                title="Add opening / extra stock"
                description="Adds the quantity you enter to what is already on hand. It does not replace the total."
                whenToUse="First time you track an item, after a delivery you forgot to enter as a purchase, or when bringing stock into the system."
                action={
                  <Button type="button" onClick={() => void postOpening()}>
                    Add to stock
                  </Button>
                }
              >
                <div className="space-y-2">
                  <Label>Item</Label>
                  <InventoryItemSelect
                    value={ops.openingItemId}
                    onChange={(v) => setOps({ ...ops, openingItemId: v })}
                    items={items}
                  />
                  <ItemOnHandHint
                    item={items.find((i) => i.id === ops.openingItemId)}
                  />
                </div>
                {(() => {
                  const openingItem = items.find((i) => i.id === ops.openingItemId);
                  const previewBase =
                    openingItem && ops.openingQty
                      ? convertQtyToBaseUnits(
                          ops.openingQty,
                          ops.openingQtyUnit,
                          openingItem.baseUnitsPerPurchaseUnit,
                        )
                      : null;
                  return (
                    <div className="space-y-2">
                      <Label>Quantity to add</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={ops.openingQtyUnit === "purchase" ? "default" : "outline"}
                          disabled={!openingItem}
                          onClick={() =>
                            setOps({ ...ops, openingQtyUnit: "purchase" })
                          }
                        >
                          {openingItem?.purchaseUnit ?? "Purchase unit"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={ops.openingQtyUnit === "base" ? "default" : "outline"}
                          disabled={!openingItem}
                          onClick={() => setOps({ ...ops, openingQtyUnit: "base" })}
                        >
                          {openingItem?.baseUnit ?? "Base unit"}
                        </Button>
                      </div>
                      {openingItem ? (
                        <p className="text-muted-foreground text-xs">
                          1 {openingItem.purchaseUnit} = {openingItem.baseUnitsPerPurchaseUnit}{" "}
                          {openingItem.baseUnit}
                        </p>
                      ) : null}
                      <Input
                        inputMode="decimal"
                        placeholder={
                          ops.openingQtyUnit === "purchase" ? "e.g. 2" : "e.g. 5000"
                        }
                        value={ops.openingQty}
                        onChange={(e) =>
                          setOps({ ...ops, openingQty: e.target.value })
                        }
                        disabled={!openingItem}
                      />
                      {previewBase && openingItem && ops.openingQtyUnit === "purchase" ? (
                        <p className="text-muted-foreground text-xs">
                          Adds{" "}
                          <span className="font-medium text-foreground">
                            {previewBase} {openingItem.baseUnit}
                          </span>{" "}
                          to stock
                        </p>
                      ) : null}
                      <div className="space-y-2 pt-2">
                        <Label htmlFor="opening-unit-cost">
                          Unit cost (₹ / {openingItem?.purchaseUnit ?? "purchase unit"})
                        </Label>
                        <Input
                          id="opening-unit-cost"
                          inputMode="decimal"
                          placeholder="e.g. 450"
                          value={ops.openingUnitCostRupees}
                          onChange={(e) =>
                            setOps({ ...ops, openingUnitCostRupees: e.target.value })
                          }
                          disabled={!openingItem}
                        />
                        <p className="text-muted-foreground text-xs">
                          Needed for inventory value. Same rate you would enter on a purchase.
                          Leave blank only if cost is already set and you are adding qty only.
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </StockActionCard>
              ) : null}

              {opsMenu === "kitchen" ? (
              <StockActionCard
                title="Record kitchen use"
                description="Reduce stock for oil, gas, petrol, and other consumables that are not on recipes. Cost is counted in profit (stock used)."
                whenToUse="Fryer oil finished, gas cylinder empty, generator petrol used — anything used in operations but not tied to a dish recipe."
                action={
                  <Button type="button" onClick={() => void postKitchenUse()}>
                    Save kitchen use
                  </Button>
                }
              >
                <div className="space-y-2">
                  <Label>Item</Label>
                  <InventoryItemSelect
                    value={ops.kitchenItemId}
                    onChange={(v) => setOps({ ...ops, kitchenItemId: v })}
                    items={items}
                  />
                  <ItemOnHandHint
                    item={items.find((i) => i.id === ops.kitchenItemId)}
                  />
                </div>
                {(() => {
                  const kitchenItem = items.find((i) => i.id === ops.kitchenItemId);
                  const previewBase = kitchenItem
                    ? convertQtyToBaseUnits(
                        ops.kitchenQty,
                        ops.kitchenQtyUnit,
                        kitchenItem.baseUnitsPerPurchaseUnit,
                      )
                    : null;
                  return (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Unit</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={ops.kitchenQtyUnit === "purchase" ? "default" : "outline"}
                            disabled={!kitchenItem}
                            onClick={() =>
                              setOps({ ...ops, kitchenQtyUnit: "purchase" })
                            }
                          >
                            {kitchenItem?.purchaseUnit || "Purchase unit"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={ops.kitchenQtyUnit === "base" ? "default" : "outline"}
                            disabled={!kitchenItem}
                            onClick={() => setOps({ ...ops, kitchenQtyUnit: "base" })}
                          >
                            {kitchenItem?.baseUnit || "Base unit"}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Quantity used</Label>
                        <Input
                          inputMode="decimal"
                          placeholder={
                            ops.kitchenQtyUnit === "purchase" ? "e.g. 1" : "e.g. 5"
                          }
                          value={ops.kitchenQty}
                          onChange={(e) =>
                            setOps({ ...ops, kitchenQty: e.target.value })
                          }
                          disabled={!kitchenItem}
                        />
                        {previewBase && kitchenItem && ops.kitchenQtyUnit === "purchase" ? (
                          <p className="text-muted-foreground text-xs">
                            = {previewBase} {kitchenItem.baseUnit}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <Label>Used at (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={ops.kitchenUsedAt}
                    onChange={(e) =>
                      setOps({ ...ops, kitchenUsedAt: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Note (optional)</Label>
                  <Input
                    placeholder="e.g. Changed fryer oil"
                    value={ops.kitchenNote}
                    onChange={(e) =>
                      setOps({ ...ops, kitchenNote: e.target.value })
                    }
                  />
                </div>
              </StockActionCard>
              ) : null}

              {opsMenu === "adjustment" ? (
              <StockActionCard
                title="Fix stock count (adjustment)"
                description="Increase or decrease stock after a physical count, damage, or mistake. Enter how much to change — not the new total."
                whenToUse="Shelf count does not match the system, items damaged in storage, or you need to correct a wrong quantity."
                action={
                  <Button type="button" onClick={() => void postAdjustment()}>
                    Save adjustment
                  </Button>
                }
              >
                <div className="space-y-2">
                  <Label>Item</Label>
                  <InventoryItemSelect
                    value={ops.adjustmentItemId}
                    onChange={(v) => setOps({ ...ops, adjustmentItemId: v })}
                    items={items}
                  />
                  <ItemOnHandHint
                    item={items.find((i) => i.id === ops.adjustmentItemId)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    How much to change
                    {ops.adjustmentItemId ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        ({items.find((i) => i.id === ops.adjustmentItemId)?.baseUnit ?? "units"})
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 2.5"
                    value={ops.adjustmentQty}
                    onChange={(e) =>
                      setOps({ ...ops, adjustmentQty: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Add or remove?</Label>
                  <SearchableSelect
                    options={ADJUSTMENT_DIRECTION_OPTIONS}
                    value={ops.adjustmentDirection}
                    onValueChange={(v) =>
                      setOps({ ...ops, adjustmentDirection: v })
                    }
                    placeholder="Choose…"
                    searchPlaceholder="Search…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Why?</Label>
                  <SearchableSelect
                    options={ADJUSTMENT_REASON_OPTIONS}
                    value={ops.adjustmentReason}
                    onValueChange={(v) =>
                      setOps({ ...ops, adjustmentReason: v })
                    }
                    placeholder="Reason"
                    searchPlaceholder="Search reasons…"
                  />
                </div>
              </StockActionCard>
              ) : null}

              {opsMenu === "recipe_reconcile" ? (
              <StockActionCard
                title="Fix stock after recipe change"
                description="Pick the sales date range to check, preview ingredient differences, then apply corrections. Safe to run again for the same range — prior corrections are netted out."
                whenToUse="You fixed wrong or missing recipes, and on-hand stock drifted because earlier sales used the old recipes."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={recipeReconcileLoading || recipeReconcileApplying}
                    onClick={() => void previewRecipeReconcile()}
                  >
                    {recipeReconcileLoading ? "Calculating…" : "Preview differences"}
                  </Button>
                }
              >
                <div className="space-y-2">
                  <Label>Compare against</Label>
                  <SearchableSelect
                    options={RECIPE_RECONCILE_MODE_OPTIONS}
                    value={recipeReconcileMode}
                    onValueChange={(v) => {
                      setRecipeReconcileMode(
                        v === "at_sale" ? "at_sale" : "current",
                      );
                      setRecipeReconcilePreview(null);
                      setRecipeReconcileConfirmed(false);
                    }}
                    placeholder="Choose…"
                    searchPlaceholder="Search…"
                  />
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {recipeReconcileMode === "current"
                      ? "Treats today's recipes as if they always applied. Also flags recipes that were added or changed after a sale, so expect larger numbers."
                      : "Uses the recipe that was effective on each sale's own date, so planned recipe changes are ignored and only real mis-deductions show up."}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="recipe-reconcile-from">From date</Label>
                    <Input
                      id="recipe-reconcile-from"
                      type="date"
                      value={recipeReconcileFrom}
                      onChange={(e) => {
                        setRecipeReconcileFrom(e.target.value);
                        setRecipeReconcilePreview(null);
                        setRecipeReconcileConfirmed(false);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipe-reconcile-to">To date</Label>
                    <Input
                      id="recipe-reconcile-to"
                      type="date"
                      value={recipeReconcileTo}
                      onChange={(e) => {
                        setRecipeReconcileTo(e.target.value);
                        setRecipeReconcilePreview(null);
                        setRecipeReconcileConfirmed(false);
                      }}
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Inclusive IST business days. Leave From empty to start at the
                  first sale (up to To). Leave To empty to end at today. Leave both
                  empty for all sales. Only POS/web sales — not wastage or vendor
                  sales.
                </p>
                {recipeReconcilePreview ? (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Range used:{" "}
                      <span className="font-medium">
                        {recipeReconcilePreview.fromDate ?? "all"}
                        {" → "}
                        {recipeReconcilePreview.toDate ?? "all"}
                      </span>
                      {" · "}
                      Orders checked:{" "}
                      <span className="font-medium">
                        {recipeReconcilePreview.orderCount}
                      </span>
                      {" · "}
                      Ingredients to change:{" "}
                      <span className="font-medium">
                        {recipeReconcilePreview.changeCount}
                      </span>
                    </p>
                    {recipeReconcilePreview.changeCount === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No adjustments needed for this date range.
                      </p>
                    ) : (
                      <>
                        <div className="max-h-80 overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Ingredient</TableHead>
                                <TableHead className="text-right">Was deducted</TableHead>
                                <TableHead className="text-right">Should be</TableHead>
                                <TableHead className="text-right">Fix</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {recipeReconcilePreview.lines
                                .filter((l) => l.direction !== "none")
                                .map((l) => (
                                  <TableRow key={l.inventoryItemId}>
                                    <TableCell>
                                      <div className="font-medium">{l.name}</div>
                                      <div className="text-muted-foreground text-xs">
                                        {l.baseUnit}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatRecipeQtyBase(l.effectiveDeductedBase)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatRecipeQtyBase(l.shouldBase)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      <Badge
                                        variant={
                                          l.direction === "up"
                                            ? "default"
                                            : "secondary"
                                        }
                                      >
                                        {l.direction === "up" ? "Add" : "Remove"}{" "}
                                        {formatRecipeQtyBase(l.qtyBase)}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                        <label className="flex items-start gap-2.5 rounded-md border bg-muted/30 px-3 py-2.5 text-sm leading-snug">
                          <Checkbox
                            className="mt-0.5"
                            checked={recipeReconcileConfirmed}
                            onCheckedChange={(v) =>
                              setRecipeReconcileConfirmed(v === true)
                            }
                            disabled={recipeReconcileApplying}
                          />
                          <span>
                            I have finished fixing recipes and reviewed the preview.
                            Apply corrections to stock.
                          </span>
                        </label>
                        <Button
                          type="button"
                          disabled={
                            recipeReconcileLoading ||
                            recipeReconcileApplying ||
                            !recipeReconcileConfirmed
                          }
                          onClick={() => void applyRecipeReconcile()}
                        >
                          {recipeReconcileApplying
                            ? "Applying…"
                            : "Apply stock corrections"}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Optionally set From / To, then Preview. Confirm and Apply appear
                    after the preview.
                  </p>
                )}
              </StockActionCard>
              ) : null}

              {opsMenu === "payment" ? (
              <StockActionCard
                title="Pay a supplier"
                description="Logs a payment on the supplier account. Use after you pay a credit purchase (cash, UPI, bank, etc.)."
                whenToUse="You paid a supplier for goods bought on credit in Purchases."
                action={
                  <Button type="button" onClick={() => void postPayment()}>
                    Record payment
                  </Button>
                }
              >
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <SearchableSelect
                    options={supplierSelectOptions(suppliers)}
                    value={ops.paymentSupplierId}
                    onValueChange={(v) =>
                      setOps({ ...ops, paymentSupplierId: v })
                    }
                    placeholder="Choose supplier…"
                    searchPlaceholder="Search suppliers…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount paid (₹)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 5000"
                    value={ops.paymentAmountRupees}
                    onChange={(e) =>
                      setOps({ ...ops, paymentAmountRupees: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>How you paid</Label>
                  <SearchableSelect
                    options={SUPPLIER_PAYMENT_METHOD_OPTIONS}
                    value={ops.paymentMethod}
                    onValueChange={(v) => setOps({ ...ops, paymentMethod: v })}
                    placeholder="Payment method"
                    searchPlaceholder="Search…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Transaction ID / reference</Label>
                  <Input
                    placeholder="UPI ref, cheque no., bank txn id…"
                    value={ops.paymentReference}
                    onChange={(e) =>
                      setOps({ ...ops, paymentReference: e.target.value })
                    }
                  />
                </div>
              </StockActionCard>
              ) : null}

              {opsMenu === "settings" && settings ? (
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <h3 className="font-semibold text-base">Inventory settings</h3>
                  <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                    How stock value, recipe cost, and COGS are calculated.
                  </p>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2 rounded-lg border p-3">
                      <Label className="text-sm font-medium">Costing method</Label>
                      <SearchableSelect
                        options={[
                          {
                            value: "WEIGHTED_AVERAGE",
                            label: "Moving average — blend purchase prices",
                          },
                          {
                            value: "LATEST_PURCHASE",
                            label: "Latest purchase — always use last buy rate",
                          },
                          {
                            value: "FIFO",
                            label: "FIFO — oldest stock cost first (X, then Y, then Z)",
                          },
                        ]}
                        value={settings.costingMethod}
                        onValueChange={(v) => {
                          if (
                            v === "WEIGHTED_AVERAGE" ||
                            v === "LATEST_PURCHASE" ||
                            v === "FIFO"
                          ) {
                            void setCostingMethod(v);
                          }
                        }}
                        placeholder="Costing method"
                        searchPlaceholder="Search…"
                      />
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {settings.costingMethod === "FIFO"
                          ? "Uses each purchase batch’s own price. First stock bought is costed first when you sell, waste, or cook."
                          : settings.costingMethod === "LATEST_PURCHASE"
                            ? "Every use is valued at the most recent purchase rate."
                            : "Every use is valued at the blended average of stock on hand."}
                      </p>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={settings.restoreStockOnCancel}
                        onChange={() => void toggleSetting("restoreStockOnCancel")}
                      />
                      <span>
                        <span className="font-medium">Put stock back</span> when a customer order is
                        cancelled
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={settings.allowNegativeStock}
                        onChange={() => void toggleSetting("allowNegativeStock")}
                      />
                      <span>
                        <span className="font-medium">Allow negative stock</span> — sell even if
                        count hits zero
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}

              {opsMenu === "settings" && !settings ? (
                <p className="text-muted-foreground text-sm">Loading settings…</p>
              ) : null}

              {opsMenu === "activity" ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-base">Activity log</h3>
              <p className="text-muted-foreground text-sm">
                Every stock change and system event (purchases, sales, adjustments, waste). Positive
                numbers add stock; negative numbers remove it.
              </p>
            </div>

            <DataTableToolbar
              search={movementSearch}
              onSearchChange={setMovementSearch}
              searchPlaceholder="Search item, type, note…"
              sort={movementSort}
              onSortChange={setMovementSort}
              sortOptions={[
                { value: "date-desc", label: "Date (newest)" },
                { value: "date-asc", label: "Date (oldest)" },
                { value: "item-asc", label: "Item (A–Z)" },
              ]}
              filteredCount={filteredMovements.length}
              totalCount={movements.length}
              showStatusFilter={false}
            >
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Type</Label>
                <SearchableSelect
                  triggerClassName={selectControlClassName}
                  options={[
                    { value: "all", label: "All types" },
                    ...movementTypeOptions.map(([type, label]) => ({
                      value: type,
                      label,
                    })),
                  ]}
                  value={movementTypeFilter}
                  onValueChange={setMovementTypeFilter}
                  placeholder="Type"
                  searchPlaceholder="Search types…"
                />
              </div>
            </DataTableToolbar>

            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & time</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>What happened</TableHead>
                    <TableHead className="text-right">Stock change</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No stock movements recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : filteredMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No movements match your search or filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMovements.map((m) => {
                      const qty = formatMovementQty(m.qtyDeltaBase);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted-foreground text-sm tabular-nums">
                            {m.occurredAt.slice(0, 16).replace("T", " ")}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {m.itemName}
                            <div className="text-muted-foreground text-xs font-normal">
                              Unit: {m.baseUnit}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{m.typeLabel}</Badge>
                          </TableCell>
                          <TableCell
                            className={cx(
                              "text-right text-sm tabular-nums",
                              qty.positive && "font-medium text-emerald-700 dark:text-emerald-400",
                              qty.negative && "font-medium text-red-700 dark:text-red-400",
                            )}
                          >
                            {qty.text} {m.baseUnit}
                          </TableCell>
                          <TableCell className="max-w-[12rem] truncate text-muted-foreground text-xs">
                            {m.note.trim() || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>

          <Dialog
            open={recipeDialogOpen}
            onOpenChange={(open) => {
              setRecipeDialogOpen(open);
              if (!open && !recipeSubmitting) resetRecipeForm();
            }}
          >
            <DialogContent
              className={
                showAllVariationQtys && canShowAllVariationQtys
                  ? "max-h-[95vh] w-[min(100vw-2rem,72rem)] max-w-6xl overflow-y-auto sm:max-w-6xl"
                  : "max-h-[95vh] w-[min(100vw-2rem,56rem)] max-w-5xl overflow-y-auto sm:max-w-5xl"
              }
              showCloseButton={!recipeSubmitting}
            >
              <DialogHeader>
                <DialogTitle>
                  {editingRecipeId
                    ? `Edit recipe · v${editingRecipeVersion ?? "?"}`
                    : copyingRecipe
                      ? "Copy recipe · new version"
                      : "New recipe version"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Menu item</Label>
                  <SearchableSelect
                    options={(menu?.items ?? []).map((it) => ({
                      value: it.id,
                      label: it.name,
                    }))}
                    value={recipe.menuItemId}
                    onValueChange={(v) => {
                      const item = (menu?.items ?? []).find((x) => x.id === v);
                      setShowAllVariationQtys(false);
                      setRecipe({
                        ...recipe,
                        menuItemId: v,
                        variationId: soleVariationId(item?.variations) ?? "",
                      });
                      setRecipeIngredients([emptyRecipeIngredient()]);
                    }}
                    placeholder="Select dish…"
                    searchPlaceholder="Search dishes…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Variation{recipeRequiresVariation ? "" : " (optional)"}
                  </Label>
                  <SearchableSelect
                    options={
                      recipeRequiresVariation
                        ? recipeFormVariations.map((v) => ({
                            value: v.id,
                            label: v.name,
                          }))
                        : [{ value: "", label: "All variations" }]
                    }
                    value={recipe.variationId}
                    onValueChange={(v) => {
                      setRecipe({ ...recipe, variationId: v });
                      if (showAllVariationQtys) {
                        setRecipeIngredients((lines) =>
                          lines.map((ln) => ({
                            ...ln,
                            qtyBase: v
                              ? (ln.qtyByVariationId[v] ?? "")
                              : ln.qtyBase,
                          })),
                        );
                      }
                    }}
                    placeholder={
                      recipeRequiresVariation
                        ? "Select variation…"
                        : "All variations"
                    }
                    searchPlaceholder="Search variations…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective from</Label>
                  <Input
                    type="datetime-local"
                    value={recipe.effectiveFrom}
                    onChange={(e) =>
                      setRecipe({ ...recipe, effectiveFrom: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Yield qty</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="1"
                      value={recipe.yieldQty}
                      onChange={(e) =>
                        setRecipe({ ...recipe, yieldQty: e.target.value })
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Finished amount this recipe makes (e.g. 200 for 200 g fried
                      chicken). Nested dishes use qty in this same unit.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Yield unit</Label>
                    <Input
                      placeholder="portion / g / pc"
                      value={recipe.yieldUnit}
                      onChange={(e) =>
                        setRecipe({ ...recipe, yieldUnit: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-sm">
                      Ingredients &amp; components
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {canShowAllVariationQtys ? (
                        <label className="mr-1 flex items-center gap-2 text-muted-foreground text-xs">
                          <Switch
                            size="sm"
                            checked={showAllVariationQtys}
                            onCheckedChange={(checked) => {
                              const on = Boolean(checked);
                              setShowAllVariationQtys(on);
                              if (on && recipe.menuItemId) {
                                setRecipeIngredients((lines) =>
                                  mergeSiblingVariationQtys(
                                    lines,
                                    recipe.menuItemId,
                                    recipeFormVariations,
                                    recipe.variationId,
                                  ),
                                );
                              }
                            }}
                          />
                          Qty by variation
                        </label>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setRecipeIngredients((x) => [
                            ...x,
                            emptyRecipeIngredient("inventory"),
                          ])
                        }
                      >
                        Add stock
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setRecipeIngredients((x) => [
                            ...x,
                            emptyRecipeIngredient("menu_item"),
                          ])
                        }
                      >
                        Add menu item
                      </Button>
                    </div>
                  </div>
                  <p className="mb-2 text-muted-foreground text-xs">
                    Use &quot;Add menu item&quot; for prep like fried chicken (e.g.
                    50 g). Qty is in that item&apos;s yield unit
                    {showAllVariationQtys && canShowAllVariationQtys
                      ? ". Enter a qty under each variation column (leave blank to skip)."
                      : "."}
                  </p>
                  <div className="overflow-x-auto">
                  <div
                    className={
                      showAllVariationQtys && canShowAllVariationQtys
                        ? "mb-1 flex min-w-max gap-2 px-0.5 text-muted-foreground text-xs"
                        : "mb-1 flex gap-2 px-0.5 text-muted-foreground text-xs"
                    }
                  >
                    <span className="w-24 shrink-0">Type</span>
                    <span className="min-w-[10rem] flex-1">Item</span>
                    {showAllVariationQtys && canShowAllVariationQtys ? (
                      recipeFormVariations.map((v) => (
                        <span
                          key={v.id}
                          className="w-20 shrink-0 text-center"
                          title={`Qty for ${v.name}`}
                        >
                          {v.name}
                        </span>
                      ))
                    ) : (
                      <span className="w-24 shrink-0 text-center">Qty</span>
                    )}
                    <span className="w-20 shrink-0 text-right">Value</span>
                    <span className="w-8 shrink-0" aria-hidden />
                  </div>
                  <div className="space-y-2">
                    {recipeIngredients.map((ln) => {
                      const componentRecipe =
                        ln.kind === "menu_item" && ln.componentMenuItemId
                          ? pickRecipeForComponent(
                              recipesList,
                              ln.componentMenuItemId,
                              ln.componentVariationId || null,
                            )
                          : null;
                      const activeQty =
                        showAllVariationQtys && recipe.variationId
                          ? (ln.qtyByVariationId[recipe.variationId] ??
                            ln.qtyBase)
                          : ln.qtyBase;
                      const lineValuePaise =
                        ln.kind === "inventory"
                          ? recipeIngredientValuePaise(
                              items.find((i) => i.id === ln.inventoryItemId),
                              activeQty,
                              settings?.costingMethod,
                            )
                          : componentRecipe
                            ? (() => {
                                const yieldQty = Number(
                                  componentRecipe.yieldQty || "1",
                                );
                                const nestedQty = Number(activeQty);
                                if (
                                  !Number.isFinite(yieldQty) ||
                                  yieldQty <= 0 ||
                                  !Number.isFinite(nestedQty)
                                ) {
                                  return 0;
                                }
                                return (
                                  (recipeRowCostPaise(
                                    componentRecipe,
                                    recipesList,
                                    items,
                                    settings?.costingMethod,
                                  ) *
                                    nestedQty) /
                                  yieldQty
                                );
                              })()
                            : 0;
                      const qtyPlaceholder =
                        ln.kind === "menu_item"
                          ? componentRecipe?.yieldUnit || "qty"
                          : "Qty";
                      const hasActiveQty =
                        (ln.kind === "inventory" &&
                          ln.inventoryItemId &&
                          activeQty) ||
                        (ln.kind === "menu_item" &&
                          ln.componentMenuItemId &&
                          activeQty);
                      return (
                        <div
                          key={ln.id}
                          className={
                            showAllVariationQtys && canShowAllVariationQtys
                              ? "flex min-w-max flex-col gap-2 rounded-md border border-transparent sm:flex-row sm:items-center"
                              : "flex flex-col gap-2 rounded-md border border-transparent sm:flex-row sm:items-center"
                          }
                        >
                          <SearchableSelect
                            options={[
                              { value: "inventory", label: "Stock" },
                              { value: "menu_item", label: "Menu item" },
                            ]}
                            value={ln.kind}
                            onValueChange={(v) =>
                              setRecipeIngredients((x) =>
                                x.map((r) =>
                                  r.id === ln.id
                                    ? {
                                        ...r,
                                        kind:
                                          v === "menu_item"
                                            ? "menu_item"
                                            : "inventory",
                                        inventoryItemId: "",
                                        componentMenuItemId: "",
                                        componentVariationId: "",
                                      }
                                    : r,
                                ),
                              )
                            }
                            placeholder="Type"
                            searchPlaceholder="Type…"
                            className="w-full shrink-0 sm:w-28"
                          />
                          {ln.kind === "inventory" ? (
                            <InventoryItemSelect
                              value={ln.inventoryItemId}
                              onChange={(v) =>
                                setRecipeIngredients((x) =>
                                  x.map((r) =>
                                    r.id === ln.id
                                      ? { ...r, inventoryItemId: v }
                                      : r,
                                  ),
                                )
                              }
                              items={items}
                              className="min-w-[10rem] flex-1"
                            />
                          ) : (
                            <div className="flex min-w-[10rem] flex-1 flex-col gap-2 sm:flex-row">
                              <SearchableSelect
                                options={(menu?.items ?? [])
                                  .filter((it) => it.id !== recipe.menuItemId)
                                  .map((it) => ({
                                    value: it.id,
                                    label: it.name,
                                  }))}
                                value={ln.componentMenuItemId}
                                onValueChange={(v) =>
                                  setRecipeIngredients((x) =>
                                    x.map((r) => {
                                      if (r.id !== ln.id) return r;
                                      const item = (menu?.items ?? []).find(
                                        (it) => it.id === v,
                                      );
                                      return {
                                        ...r,
                                        componentMenuItemId: v,
                                        componentVariationId:
                                          soleVariationId(item?.variations) ?? "",
                                      };
                                    }),
                                  )
                                }
                                placeholder="Select dish…"
                                searchPlaceholder="Search dishes…"
                                className="min-w-0 flex-1"
                              />
                              <SearchableSelect
                                options={(() => {
                                  const vars =
                                    (menu?.items ?? []).find(
                                      (x) => x.id === ln.componentMenuItemId,
                                    )?.variations ?? [];
                                  if (vars.length === 1) {
                                    return vars.map((v) => ({
                                      value: v.id,
                                      label: v.name,
                                    }));
                                  }
                                  return [
                                    { value: "", label: "All variations" },
                                    ...vars.map((v) => ({
                                      value: v.id,
                                      label: v.name,
                                    })),
                                  ];
                                })()}
                                value={ln.componentVariationId}
                                onValueChange={(v) =>
                                  setRecipeIngredients((x) =>
                                    x.map((r) =>
                                      r.id === ln.id
                                        ? { ...r, componentVariationId: v }
                                        : r,
                                    ),
                                  )
                                }
                                placeholder={
                                  (
                                    (menu?.items ?? []).find(
                                      (x) => x.id === ln.componentMenuItemId,
                                    )?.variations.length ?? 0
                                  ) === 1
                                    ? "Select variation…"
                                    : "All variations"
                                }
                                searchPlaceholder="Variation…"
                                className="w-full sm:w-40"
                              />
                            </div>
                          )}
                          {showAllVariationQtys && canShowAllVariationQtys ? (
                            recipeFormVariations.map((v) => (
                              <Input
                                key={v.id}
                                className={
                                  v.id === recipe.variationId
                                    ? "w-20 shrink-0 border-primary/40"
                                    : "w-20 shrink-0"
                                }
                                inputMode="decimal"
                                placeholder={qtyPlaceholder}
                                aria-label={`Qty for ${v.name}`}
                                value={ln.qtyByVariationId[v.id] ?? ""}
                                onChange={(e) =>
                                  setIngredientQtyForVariation(
                                    ln.id,
                                    v.id,
                                    e.target.value,
                                  )
                                }
                              />
                            ))
                          ) : (
                            <Input
                              className="w-full shrink-0 sm:w-24"
                              inputMode="decimal"
                              placeholder={qtyPlaceholder}
                              value={ln.qtyBase}
                              onChange={(e) =>
                                setIngredientQtyForVariation(
                                  ln.id,
                                  recipe.variationId || null,
                                  e.target.value,
                                )
                              }
                            />
                          )}
                          <span
                            className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
                            title={
                              hasActiveQty
                                ? ln.kind === "menu_item"
                                  ? showAllVariationQtys
                                    ? "Value for selected variation (expanded from nested recipe)"
                                    : "Expanded from nested recipe"
                                  : settings?.costingMethod === "LATEST_PURCHASE"
                                    ? "Latest purchase cost × qty"
                                    : settings?.costingMethod === "FIFO"
                                      ? "Remaining-stock weighted cost × qty (FIFO COGS uses oldest batches)"
                                      : "Avg cost × qty"
                                : undefined
                            }
                          >
                            {hasActiveQty
                              ? formatRecipeCostRupees(lineValuePaise)
                              : "—"}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-8 shrink-0 px-0"
                            onClick={() =>
                              setRecipeIngredients((x) =>
                                x.length <= 1 ? x : x.filter((r) => r.id !== ln.id),
                              )
                            }
                          >
                            ×
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
                    <span className="font-medium">
                      Recipe total
                      {showAllVariationQtys &&
                      canShowAllVariationQtys &&
                      recipe.variationId
                        ? ` · ${
                            recipeFormVariations.find(
                              (v) => v.id === recipe.variationId,
                            )?.name ?? "selected"
                          }`
                        : ""}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatRecipeCostRupees(recipeTotalValuePaise)}
                    </span>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={recipeSubmitting}
                  onClick={() => setRecipeDialogOpen(false)}
                >
                  Cancel
                </Button>
                {editingRecipeId ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={recipeSubmitting}
                      onClick={() => void submitRecipe("new")}
                    >
                      Save as new version
                    </Button>
                    <Button
                      type="button"
                      disabled={recipeSubmitting}
                      onClick={() => void submitRecipe("update")}
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    disabled={recipeSubmitting}
                    onClick={() => void submitRecipe("new")}
                  >
                    Save as new version
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deletingRecipe !== null}
            onOpenChange={(open) => {
              if (!open && !recipeDeleteSubmitting) setDeletingRecipe(null);
            }}
          >
            <DialogContent
              className="sm:max-w-md"
              showCloseButton={!recipeDeleteSubmitting}
            >
              <DialogHeader>
                <DialogTitle>Delete recipe version?</DialogTitle>
                <DialogDescription render={<div />}>
                  <div className="space-y-3 text-sm">
                    <p>
                      You are about to delete{" "}
                      <span className="font-medium text-foreground">
                        v{deletingRecipe?.version}
                      </span>{" "}
                      for{" "}
                      <span className="font-medium text-foreground">
                        {deletingRecipe?.menuItemName}
                      </span>
                      {deletingRecipe?.label ? ` (${deletingRecipe.label})` : ""}. Here is
                      what happens:
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                      <li>
                        This recipe version and its ingredient list are{" "}
                        <span className="font-medium text-foreground">
                          permanently removed
                        </span>
                        .
                      </li>
                      <li>
                        New orders for this dish/variation will{" "}
                        <span className="font-medium text-foreground">
                          no longer deduct these ingredients
                        </span>{" "}
                        until another recipe version is in effect.
                      </li>
                      <li>
                        Past orders and their stock movements are{" "}
                        <span className="font-medium text-foreground">not affected</span>.
                      </li>
                    </ul>
                    <p>This cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={recipeDeleteSubmitting}
                  onClick={() => setDeletingRecipe(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={recipeDeleteSubmitting}
                  onClick={() => void confirmDeleteRecipe()}
                >
                  {recipeDeleteSubmitting ? "Deleting…" : "Delete version"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </div>
  );
}
