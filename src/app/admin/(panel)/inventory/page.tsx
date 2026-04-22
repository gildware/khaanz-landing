"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function cx(...x: Array<string | false | null | undefined>): string {
  return x.filter(Boolean).join(" ");
}

function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", { style: "currency", currency: "INR" });
}

type Summary = {
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

type InvItem = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  purchaseUnit: string;
  baseUnitsPerPurchaseUnit: string;
  stockOnHandBase: string;
  minStockBase: string;
  active: boolean;
};

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: boolean;
};

type MenuPayload = {
  items: { id: string; name: string; variations: { id: string; name: string }[] }[];
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
  }, []);

  const loadItems = useCallback(async () => {
    const r = await adminFetch<{ items: InvItem[] }>("/api/admin/inventory/items");
    setItems(r.items);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const r = await adminFetch<{ suppliers: Supplier[] }>(
      "/api/admin/inventory/suppliers",
    );
    setSuppliers(r.suppliers);
  }, []);

  const loadMenu = useCallback(async () => {
    const r = await adminFetch<MenuPayload>("/api/menu");
    setMenu(r);
  }, []);

  const loadSettings = useCallback(async () => {
    const r = await adminFetch<{
      costingMethod: string;
      restoreStockOnCancel: boolean;
      allowNegativeStock: boolean;
    }>("/api/admin/inventory/settings");
    setSettings(r);
  }, []);

  const loadExpiry = useCallback(async () => {
    const r = await adminFetch<ExpiryReport>("/api/admin/inventory/reports/expiry?days=7");
    setExpiry(r);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          loadSummary(),
          loadItems(),
          loadSuppliers(),
          loadMenu(),
          loadSettings(),
          loadExpiry(),
        ]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load inventory");
      }
    })();
  }, [loadExpiry, loadItems, loadMenu, loadSettings, loadSummary, loadSuppliers]);

  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    baseUnit: "g",
    purchaseUnit: "kg",
    baseUnitsPerPurchaseUnit: "1000",
    minStockBase: "0",
  });

  const createItem = async () => {
    try {
      await adminFetch("/api/admin/inventory/items", {
        method: "POST",
        body: JSON.stringify(newItem),
      });
      toast.success("Item created");
      await loadItems();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  const createSupplier = async () => {
    try {
      await adminFetch("/api/admin/inventory/suppliers", {
        method: "POST",
        body: JSON.stringify(newSupplier),
      });
      toast.success("Supplier created");
      setNewSupplier({ name: "", phone: "", email: "", address: "" });
      await loadSuppliers();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const [purchase, setPurchase] = useState({
    supplierId: "",
    paymentType: "CREDIT",
    purchasedAt: new Date().toISOString().slice(0, 16),
    creditDays: "",
  });

  type PurchaseLineDraft = {
    id: string;
    inventoryItemId: string;
    qtyPurchase: string;
    ratePaisePerPurchaseUnit: string;
    expiryDate: string;
    lotCode: string;
  };
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineDraft[]>([
    {
      id: crypto.randomUUID(),
      inventoryItemId: "",
      qtyPurchase: "1",
      ratePaisePerPurchaseUnit: "0",
      expiryDate: "",
      lotCode: "",
    },
  ]);

  const purchaseTotalPaise = useMemo(() => {
    let sum = 0;
    for (const ln of purchaseLines) {
      const qty = Number(ln.qtyPurchase);
      const rate = Math.floor(Number(ln.ratePaisePerPurchaseUnit));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isFinite(rate) || rate < 0) continue;
      sum += Math.round(qty * rate);
    }
    return sum;
  }, [purchaseLines]);

  const submitPurchase = async () => {
    try {
      await adminFetch("/api/admin/inventory/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: purchase.supplierId,
          paymentType: purchase.paymentType,
          purchasedAt: new Date(purchase.purchasedAt).toISOString(),
          creditDays:
            purchase.paymentType === "CREDIT" && purchase.creditDays.trim()
              ? Number(purchase.creditDays)
              : undefined,
          lines: purchaseLines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            qtyPurchase: l.qtyPurchase,
            ratePaisePerPurchaseUnit: Number(l.ratePaisePerPurchaseUnit),
            expiryDate: l.expiryDate ? new Date(l.expiryDate).toISOString() : undefined,
            lotCode: l.lotCode || undefined,
          })),
        }),
      });
      toast.success("Purchase recorded");
      await Promise.all([loadItems(), loadSummary(), loadSuppliers()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purchase failed");
    }
  };

  const [recipe, setRecipe] = useState({
    menuItemId: "",
    variationId: "",
    effectiveFrom: new Date().toISOString().slice(0, 16),
  });

  type RecipeIngredientDraft = {
    id: string;
    inventoryItemId: string;
    qtyBase: string;
  };
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([
    { id: crypto.randomUUID(), inventoryItemId: "", qtyBase: "" },
  ]);

  const submitRecipe = async () => {
    try {
      await adminFetch("/api/admin/inventory/recipes", {
        method: "POST",
        body: JSON.stringify({
          menuItemId: recipe.menuItemId,
          variationId: recipe.variationId || null,
          effectiveFrom: new Date(recipe.effectiveFrom).toISOString(),
          ingredients: recipeIngredients
            .filter((x) => x.inventoryItemId && x.qtyBase)
            .map((x) => ({
              inventoryItemId: x.inventoryItemId,
              qtyBase: x.qtyBase,
            })),
        }),
      });
      toast.success("Recipe version saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recipe save failed");
    }
  };

  const [ops, setOps] = useState({
    openingItemId: "",
    openingQty: "",
    adjustmentItemId: "",
    adjustmentQty: "",
    adjustmentDirection: "down",
    adjustmentReason: "CORRECTION",
    wastageItemId: "",
    wastageQty: "",
    wastageType: "SPOILAGE",
    paymentSupplierId: "",
    paymentAmountPaise: "",
    paymentMethod: "upi",
  });

  const postOpening = async () => {
    try {
      await adminFetch("/api/admin/inventory/opening", {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: ops.openingItemId,
          qtyBase: ops.openingQty,
        }),
      });
      toast.success("Opening stock applied");
      await loadItems();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
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
      await loadItems();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const postWastage = async () => {
    try {
      await adminFetch("/api/admin/inventory/wastage", {
        method: "POST",
        body: JSON.stringify({
          inventoryItemId: ops.wastageItemId,
          qtyBase: ops.wastageQty,
          wastageType: ops.wastageType,
        }),
      });
      toast.success("Wastage recorded");
      await loadItems();
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const postPayment = async () => {
    try {
      await adminFetch("/api/admin/inventory/payments", {
        method: "POST",
        body: JSON.stringify({
          supplierId: ops.paymentSupplierId,
          amountPaise: Number(ops.paymentAmountPaise),
          method: ops.paymentMethod,
        }),
      });
      toast.success("Payment recorded");
      await loadSummary();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Inventory & suppliers</h1>
        <p className="text-muted-foreground text-sm">
          Stock in base units, purchases, supplier ledger, recipes, and POS deduction.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="overview" className="data-[state=active]:font-semibold">
            Overview
          </TabsTrigger>
          <TabsTrigger value="items" className="data-[state=active]:font-semibold">
            Items
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="data-[state=active]:font-semibold">
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="purchase" className="data-[state=active]:font-semibold">
            Purchases
          </TabsTrigger>
          <TabsTrigger value="recipes" className="data-[state=active]:font-semibold">
            Recipes
          </TabsTrigger>
          <TabsTrigger value="ops" className="data-[state=active]:font-semibold">
            Stock Ops
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Active items</p>
              <p className="mt-1 font-semibold text-2xl">{items.filter((x) => x.active).length}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Suppliers</p>
              <p className="mt-1 font-semibold text-2xl">
                {suppliers.filter((x) => x.active).length}
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Low stock items</p>
              <p className="mt-1 font-semibold text-2xl">{summary?.lowStock.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Near-expiry batches (7d)</p>
              <p className="mt-1 font-semibold text-2xl">{expiry?.nearExpiry.length ?? 0}</p>
            </div>
          </div>

          {settings && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">Costing</p>
                <p className="text-muted-foreground text-xs">{settings.costingMethod}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.restoreStockOnCancel}
                  onChange={() => void toggleSetting("restoreStockOnCancel")}
                />
                Restore stock on cancelled orders
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.allowNegativeStock}
                  onChange={() => void toggleSetting("allowNegativeStock")}
                />
                Allow negative stock
              </label>
            </div>
          )}

          <div>
            <h2 className="mb-2 font-medium">Low stock</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>On hand (base)</TableHead>
                  <TableHead>Min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.lowStock ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No low-stock rows (or no items yet).
                    </TableCell>
                  </TableRow>
                ) : (
                  summary!.lowStock.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.name}{" "}
                        <span className="text-muted-foreground text-xs">({r.baseUnit})</span>
                      </TableCell>
                      <TableCell>{r.stockOnHandBase}</TableCell>
                      <TableCell>{r.minStockBase}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <h2 className="mb-2 font-medium">Supplier balance (payable, paise)</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.supplierBalances ?? []).map((r) => (
                  <TableRow key={r.supplierId}>
                    <TableCell>{r.supplierName || r.supplierId}</TableCell>
                    <TableCell className="text-right">{r.balancePaise}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h2 className="mb-2 font-medium">Overdue credit purchases</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount (paise)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.overduePurchases ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      None
                    </TableCell>
                  </TableRow>
                ) : (
                  summary!.overduePurchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.batchRef}</TableCell>
                      <TableCell>{p.supplierName}</TableCell>
                      <TableCell>{p.dueAt ? p.dueAt.slice(0, 10) : "—"}</TableCell>
                      <TableCell className="text-right">{p.totalPaise}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="mb-2 font-medium">Expiry alerts</h2>
              <Button type="button" variant="secondary" onClick={() => void loadExpiry()}>
                Refresh
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(expiry?.nearExpiry ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No near-expiry batches.
                    </TableCell>
                  </TableRow>
                ) : (
                  expiry!.nearExpiry.slice(0, 20).map((b) => (
                    <TableRow key={b.batchId}>
                      <TableCell>
                        {b.itemName}{" "}
                        <span className="text-muted-foreground text-xs">({b.baseUnit})</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {b.lotCode || b.batchId}
                      </TableCell>
                      <TableCell>{b.expiryDate.slice(0, 10)}</TableCell>
                      <TableCell className="text-right">{b.remainingQtyBase}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4 pt-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>New item name</Label>
              <Input
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Input
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Base unit</Label>
              <Input
                value={newItem.baseUnit}
                onChange={(e) => setNewItem({ ...newItem, baseUnit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Purchase unit</Label>
              <Input
                value={newItem.purchaseUnit}
                onChange={(e) =>
                  setNewItem({ ...newItem, purchaseUnit: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Base units per purchase unit</Label>
              <Input
                value={newItem.baseUnitsPerPurchaseUnit}
                onChange={(e) =>
                  setNewItem({ ...newItem, baseUnitsPerPurchaseUnit: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Min stock (base)</Label>
              <Input
                value={newItem.minStockBase}
                onChange={(e) =>
                  setNewItem({ ...newItem, minStockBase: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Button type="button" onClick={() => void createItem()}>
                Create item
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Stock (base)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    purchase: {r.purchaseUnit} × {r.baseUnitsPerPurchaseUnit} → {r.baseUnit}
                  </TableCell>
                  <TableCell>{r.stockOnHandBase}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4 pt-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newSupplier.name}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newSupplier.phone}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, phone: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={newSupplier.email}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Input
                value={newSupplier.address}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, address: e.target.value })
                }
              />
            </div>
            <Button type="button" onClick={() => void createSupplier()}>
              Add supplier
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{s.phone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="purchase" className="space-y-3 pt-4">
          <div className="rounded-lg border border-border p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={purchase.supplierId}
                  onChange={(e) =>
                    setPurchase({ ...purchase, supplierId: e.target.value })
                  }
                >
                  <option value="">Select…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Purchased at</Label>
                <Input
                  type="datetime-local"
                  value={purchase.purchasedAt}
                  onChange={(e) => setPurchase({ ...purchase, purchasedAt: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Payment type</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={purchase.paymentType}
                  onChange={(e) => setPurchase({ ...purchase, paymentType: e.target.value })}
                >
                  <option value="CASH">CASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>

              <div
                className={cx(
                  "space-y-2 md:col-span-3",
                  purchase.paymentType !== "CREDIT" && "hidden",
                )}
              >
                <Label>Credit days (optional)</Label>
                <Input
                  inputMode="numeric"
                  value={purchase.creditDays}
                  onChange={(e) => setPurchase({ ...purchase, creditDays: e.target.value })}
                  placeholder="e.g. 15"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-medium">Line items</p>
                <p className="text-muted-foreground text-xs">
                  Quantity in purchase unit; system stores stock in base unit only.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setPurchaseLines((x) => [
                    ...x,
                    {
                      id: crypto.randomUUID(),
                      inventoryItemId: "",
                      qtyPurchase: "1",
                      ratePaisePerPurchaseUnit: "0",
                      expiryDate: "",
                      lotCode: "",
                    },
                  ])
                }
              >
                Add line
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: "35%" }}>Item</TableHead>
                  <TableHead>Qty (purchase)</TableHead>
                  <TableHead>Rate (paise / purchase unit)</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseLines.map((ln) => {
                  const qty = Number(ln.qtyPurchase);
                  const rate = Math.floor(Number(ln.ratePaisePerPurchaseUnit));
                  const ok = Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate >= 0;
                  const lineTotal = ok ? Math.round(qty * rate) : 0;
                  return (
                    <TableRow key={ln.id}>
                      <TableCell>
                        <select
                          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                          value={ln.inventoryItemId}
                          onChange={(e) =>
                            setPurchaseLines((x) =>
                              x.map((r) =>
                                r.id === ln.id ? { ...r, inventoryItemId: e.target.value } : r,
                              ),
                            )
                          }
                        >
                          <option value="">Select…</option>
                          {items
                            .filter((x) => x.active)
                            .map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} ({it.purchaseUnit}→{it.baseUnit})
                              </option>
                            ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          value={ln.qtyPurchase}
                          onChange={(e) =>
                            setPurchaseLines((x) =>
                              x.map((r) => (r.id === ln.id ? { ...r, qtyPurchase: e.target.value } : r)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          value={ln.ratePaisePerPurchaseUnit}
                          onChange={(e) =>
                            setPurchaseLines((x) =>
                              x.map((r) =>
                                r.id === ln.id
                                  ? { ...r, ratePaisePerPurchaseUnit: e.target.value }
                                  : r,
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
                              x.map((r) => (r.id === ln.id ? { ...r, expiryDate: e.target.value } : r)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={ln.lotCode}
                          onChange={(e) =>
                            setPurchaseLines((x) =>
                              x.map((r) => (r.id === ln.id ? { ...r, lotCode: e.target.value } : r)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cx(!ok && "text-muted-foreground")}>
                          {formatPaise(lineTotal)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
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

            <div className="mt-3 flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Total: <span className="font-medium text-foreground">{formatPaise(purchaseTotalPaise)}</span>
              </p>
              <Button type="button" onClick={() => void submitPurchase()}>
                Post purchase
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recipes" className="space-y-3 pt-4">
          <div className="space-y-2">
            <Label>Menu item</Label>
            <select
              className="border-input bg-background h-9 w-full max-w-md rounded-md border px-2 text-sm"
              value={recipe.menuItemId}
              onChange={(e) =>
                setRecipe({ ...recipe, menuItemId: e.target.value, variationId: "" })
              }
            >
              <option value="">Select…</option>
              {(menu?.items ?? []).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Variation (optional — leave empty for all sizes)</Label>
            <select
              className="border-input bg-background h-9 w-full max-w-md rounded-md border px-2 text-sm"
              value={recipe.variationId}
              onChange={(e) => setRecipe({ ...recipe, variationId: e.target.value })}
            >
              <option value="">All variations</option>
              {(menu?.items ?? [])
                .find((x) => x.id === recipe.menuItemId)
                ?.variations.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Effective from (local)</Label>
            <Input
              type="datetime-local"
              value={recipe.effectiveFrom}
              onChange={(e) =>
                setRecipe({ ...recipe, effectiveFrom: e.target.value })
              }
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-medium">Ingredients</p>
                <p className="text-muted-foreground text-xs">Quantities must be in base unit.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setRecipeIngredients((x) => [
                    ...x,
                    { id: crypto.randomUUID(), inventoryItemId: "", qtyBase: "" },
                  ])
                }
              >
                Add ingredient
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: "55%" }}>Item</TableHead>
                  <TableHead>Qty (base)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipeIngredients.map((ln) => (
                  <TableRow key={ln.id}>
                    <TableCell>
                      <select
                        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                        value={ln.inventoryItemId}
                        onChange={(e) =>
                          setRecipeIngredients((x) =>
                            x.map((r) =>
                              r.id === ln.id ? { ...r, inventoryItemId: e.target.value } : r,
                            ),
                          )
                        }
                      >
                        <option value="">Select…</option>
                        {items
                          .filter((x) => x.active)
                          .map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} ({it.baseUnit})
                            </option>
                          ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        value={ln.qtyBase}
                        onChange={(e) =>
                          setRecipeIngredients((x) =>
                            x.map((r) => (r.id === ln.id ? { ...r, qtyBase: e.target.value } : r)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setRecipeIngredients((x) =>
                            x.length <= 1 ? x : x.filter((r) => r.id !== ln.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={() => void submitRecipe()}>
                Save recipe version
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ops" className="grid gap-6 pt-4 md:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">Opening stock</h3>
            <Input
              placeholder="Inventory item id"
              value={ops.openingItemId}
              onChange={(e) =>
                setOps({ ...ops, openingItemId: e.target.value })
              }
            />
            <Input
              placeholder="Qty (base units)"
              value={ops.openingQty}
              onChange={(e) => setOps({ ...ops, openingQty: e.target.value })}
            />
            <Button type="button" variant="secondary" onClick={() => void postOpening()}>
              Apply
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">Adjustment</h3>
            <Input
              placeholder="Inventory item id"
              value={ops.adjustmentItemId}
              onChange={(e) =>
                setOps({ ...ops, adjustmentItemId: e.target.value })
              }
            />
            <Input
              placeholder="Qty base"
              value={ops.adjustmentQty}
              onChange={(e) =>
                setOps({ ...ops, adjustmentQty: e.target.value })
              }
            />
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={ops.adjustmentDirection}
              onChange={(e) =>
                setOps({ ...ops, adjustmentDirection: e.target.value })
              }
            >
              <option value="up">Increase</option>
              <option value="down">Decrease</option>
            </select>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={ops.adjustmentReason}
              onChange={(e) =>
                setOps({ ...ops, adjustmentReason: e.target.value })
              }
            >
              <option value="DAMAGE">Damage</option>
              <option value="CORRECTION">Correction</option>
              <option value="THEFT">Theft</option>
              <option value="AUDIT_MISMATCH">Audit mismatch</option>
              <option value="OTHER">Other</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void postAdjustment()}
            >
              Save adjustment
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">Wastage</h3>
            <Input
              placeholder="Inventory item id"
              value={ops.wastageItemId}
              onChange={(e) =>
                setOps({ ...ops, wastageItemId: e.target.value })
              }
            />
            <Input
              placeholder="Qty base"
              value={ops.wastageQty}
              onChange={(e) => setOps({ ...ops, wastageQty: e.target.value })}
            />
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={ops.wastageType}
              onChange={(e) =>
                setOps({ ...ops, wastageType: e.target.value })
              }
            >
              <option value="SPOILAGE">Spoilage</option>
              <option value="PREPARATION">Preparation</option>
              <option value="OVERPRODUCTION">Overproduction</option>
              <option value="OTHER">Other</option>
            </select>
            <Button type="button" variant="secondary" onClick={() => void postWastage()}>
              Record wastage
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">Supplier payment</h3>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={ops.paymentSupplierId}
              onChange={(e) =>
                setOps({ ...ops, paymentSupplierId: e.target.value })
              }
            >
              <option value="">Supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Amount (paise)"
              value={ops.paymentAmountPaise}
              onChange={(e) =>
                setOps({ ...ops, paymentAmountPaise: e.target.value })
              }
            />
            <Input
              placeholder="Method key"
              value={ops.paymentMethod}
              onChange={(e) =>
                setOps({ ...ops, paymentMethod: e.target.value })
              }
            />
            <Button type="button" variant="secondary" onClick={() => void postPayment()}>
              Record payment
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
