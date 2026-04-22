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

type MenuPayload = {
  items: { id: string; name: string; variations: { id: string; name: string }[] }[];
};

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [sellableMenuItemIds, setSellableMenuItemIds] = useState<string[]>([]);

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

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadVendors(), loadMenu(), loadSellable(), loadSummary()]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load vendors");
      }
    })();
  }, [loadMenu, loadSellable, loadSummary, loadVendors]);

  const [newVendor, setNewVendor] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    defaultCreditDays: "",
  });

  const createVendor = async () => {
    try {
      await adminFetch("/api/admin/vendors", {
        method: "POST",
        body: JSON.stringify({
          name: newVendor.name,
          phone: newVendor.phone,
          email: newVendor.email,
          address: newVendor.address,
          defaultCreditDays: newVendor.defaultCreditDays.trim()
            ? Number(newVendor.defaultCreditDays)
            : null,
        }),
      });
      toast.success("Vendor created");
      setNewVendor({ name: "", phone: "", email: "", address: "", defaultCreditDays: "" });
      await Promise.all([loadVendors(), loadSummary()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

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
    ratePaisePerUnit: string;
  };
  const [saleLines, setSaleLines] = useState<SaleLineDraft[]>([
    {
      id: crypto.randomUUID(),
      menuItemId: "",
      variationId: "",
      quantity: "1",
      ratePaisePerUnit: "0",
    },
  ]);

  const saleTotalPaise = useMemo(() => {
    let sum = 0;
    for (const ln of saleLines) {
      const qty = Number(ln.quantity);
      const rate = Math.floor(Number(ln.ratePaisePerUnit));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isFinite(rate) || rate < 0) continue;
      sum += Math.round(qty * rate);
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
            ratePaisePerUnit: Number(l.ratePaisePerUnit),
          })),
        }),
      });
      toast.success("Vendor sale recorded (stock reduced)");
      await Promise.all([loadSummary()]);
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
    amountPaise: "",
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
          amountPaise: Number(payment.amountPaise),
          method: payment.method,
          reference: payment.reference,
          note: payment.note,
          paidAt: payment.paidAt ? new Date(payment.paidAt).toISOString() : undefined,
        }),
      });
      toast.success("Payment recorded");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Vendors</h1>
        <p className="text-muted-foreground text-sm">
          Manage vendor accounts, post vendor sales (reduces stock), and track payments/due.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
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
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Active vendors</p>
              <p className="mt-1 font-semibold text-2xl">{vendors.filter((v) => v.active).length}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Vendors with outstanding</p>
              <p className="mt-1 font-semibold text-2xl">
                {(summary?.vendorBalances ?? []).filter((x) => x.balancePaise > 0).length}
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-muted-foreground text-xs">Overdue credit sales (by due date)</p>
              <p className="mt-1 font-semibold text-2xl">{summary?.overdueSales.length ?? 0}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="mb-2 font-medium">Vendor balance (receivable)</h2>
              <Button type="button" variant="secondary" onClick={() => void loadSummary()}>
                Refresh
              </Button>
            </div>
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
                    <TableCell colSpan={2} className="text-muted-foreground">
                      No ledger entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary!.vendorBalances.slice(0, 50).map((r) => (
                    <TableRow key={r.vendorId}>
                      <TableCell>{r.vendorName || r.vendorId}</TableCell>
                      <TableCell className="text-right">{formatPaise(r.balancePaise)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <h2 className="mb-2 font-medium">Overdue sales</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.overdueSales ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      None
                    </TableCell>
                  </TableRow>
                ) : (
                  summary!.overdueSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.vendorName}</TableCell>
                      <TableCell>{s.dueAt ? s.dueAt.slice(0, 10) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.soldAt.slice(0, 10)}</TableCell>
                      <TableCell className="text-right">{formatPaise(s.totalPaise)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4 pt-4">
          <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={newVendor.phone} onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={newVendor.email} onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Default credit days (optional)</Label>
              <Input inputMode="numeric" value={newVendor.defaultCreditDays} onChange={(e) => setNewVendor({ ...newVendor, defaultCreditDays: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Input value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Button type="button" onClick={() => void createVendor()}>
                Add vendor
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Credit days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.phone}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{v.defaultCreditDays ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="sellable" className="space-y-4 pt-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Choose menu items you sell to vendors</p>
              <p className="text-muted-foreground text-xs">
                Vendor sales will only show these items.
              </p>
            </div>
            <Button type="button" onClick={() => void saveSellable()}>
              Save
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: "120px" }}>Sell</TableHead>
                <TableHead>Menu item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(menu?.items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No menu items found.
                  </TableCell>
                </TableRow>
              ) : (
                (menu?.items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={sellableMenuItemIds.includes(it.id)}
                        onChange={() => toggleSellable(it.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{it.name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="sales" className="space-y-3 pt-4">
          <div className="rounded-lg border border-border p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={sale.vendorId}
                  onChange={(e) => setSale({ ...sale, vendorId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Sold at</Label>
                <Input type="datetime-local" value={sale.soldAt} onChange={(e) => setSale({ ...sale, soldAt: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Payment type</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={sale.paymentType}
                  onChange={(e) => setSale({ ...sale, paymentType: e.target.value })}
                >
                  <option value="CASH">CASH</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>

              <div className={cx("space-y-2 md:col-span-3", sale.paymentType !== "CREDIT" && "hidden")}>
                <Label>Credit days (optional)</Label>
                <Input inputMode="numeric" value={sale.creditDays} onChange={(e) => setSale({ ...sale, creditDays: e.target.value })} placeholder="e.g. 15" />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Notes (optional)</Label>
                <Input value={sale.notes} onChange={(e) => setSale({ ...sale, notes: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-medium">Line items</p>
                <p className="text-muted-foreground text-xs">
                  Qty is in units/plates. Posting a sale will reduce stock immediately based on recipes.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSaleLines((x) => [
                    ...x,
                    {
                      id: crypto.randomUUID(),
                      menuItemId: "",
                      variationId: "",
                      quantity: "1",
                      ratePaisePerUnit: "0",
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
                  <TableHead style={{ width: "45%" }}>Item</TableHead>
                  <TableHead>Variation</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Rate (paise / unit)</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleLines.map((ln) => {
                  const qty = Number(ln.quantity);
                  const rate = Math.floor(Number(ln.ratePaisePerUnit));
                  const ok = Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate >= 0;
                  const lineTotal = ok ? Math.round(qty * rate) : 0;
                  const item = (menu?.items ?? []).find((x) => x.id === ln.menuItemId) ?? null;
                  return (
                    <TableRow key={ln.id}>
                      <TableCell>
                        <select
                          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                          value={ln.menuItemId}
                          onChange={(e) =>
                            setSaleLines((x) =>
                              x.map((r) =>
                                r.id === ln.id
                                  ? { ...r, menuItemId: e.target.value, variationId: "" }
                                  : r,
                              ),
                            )
                          }
                        >
                          <option value="">Select…</option>
                          {sellableMenuItems.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <select
                          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                          value={ln.variationId}
                          onChange={(e) =>
                            setSaleLines((x) =>
                              x.map((r) =>
                                r.id === ln.id ? { ...r, variationId: e.target.value } : r,
                              ),
                            )
                          }
                        >
                          <option value="">Select…</option>
                          {(item?.variations ?? []).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
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
                          inputMode="numeric"
                          value={ln.ratePaisePerUnit}
                          onChange={(e) =>
                            setSaleLines((x) =>
                              x.map((r) =>
                                r.id === ln.id ? { ...r, ratePaisePerUnit: e.target.value } : r,
                              ),
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
                            setSaleLines((x) => (x.length <= 1 ? x : x.filter((r) => r.id !== ln.id)))
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
                Total: <span className="font-medium text-foreground">{formatPaise(saleTotalPaise)}</span>
              </p>
              <Button type="button" onClick={() => void submitSale()}>
                Post sale (reduce stock)
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-3 pt-4">
          <div className="rounded-lg border border-border p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={payment.vendorId}
                  onChange={(e) => setPayment({ ...payment, vendorId: e.target.value })}
                >
                  <option value="">Vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Amount (paise)</Label>
                <Input
                  inputMode="numeric"
                  value={payment.amountPaise}
                  onChange={(e) => setPayment({ ...payment, amountPaise: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Input value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} />
              </div>
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
                <Input value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Input value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => void submitPayment()}>
                Record payment
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

