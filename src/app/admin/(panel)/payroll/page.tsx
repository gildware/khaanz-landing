"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdvanceMethod, AttendanceKind } from "@prisma/client";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, RefreshCcwIcon, SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  formatRupees,
  monthKeyFromDate,
  paiseToRupeesInput,
  rupeesToPaise,
} from "@/lib/payroll/payroll-utils";

type EmployeeRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  active: boolean;
  monthlySalaryPaise: number;
  dailyRatePaise: number;
  paidLeavesPerMonth: number;
  joinedAt: string | null;
  createdAt: string;
};

type AdvanceRow = {
  id: string;
  employeeId: string;
  occurredAt: string;
  amountPaise: number;
  method: AdvanceMethod;
  reference: string;
  note: string;
  employee: { name: string; code: string };
};

function startOfMonthLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonthLocal(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  return new Date(y, m + 1, 0).getDate();
}

function dayKeyLocal(y: number, m0: number, day: number): string {
  const mm = String(m0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export default function AdminPayrollPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editEmployeeId = searchParams.get("edit");
  const [tab, setTab] = useState("employees");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  const [month, setMonth] = useState(() => startOfMonthLocal(new Date()));
  const monthKey = useMemo(() => monthKeyFromDate(month), [month]);

  const reloadEmployees = useCallback(async () => {
    const res = await fetch("/api/admin/payroll/employees", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load employees");
    const j = (await res.json()) as { employees: EmployeeRow[] };
    setEmployees(j.employees);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await reloadEmployees();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [reloadEmployees]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading payroll…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Payroll</h1>
          <p className="text-muted-foreground text-sm">
            Employees, attendance, advances, and monthly payroll runs.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void reloadEmployees()}>
          <RefreshCcwIcon className="size-4" />
          Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full gap-6">
        <TabsList variant="line" className="h-auto min-h-9 w-full flex-wrap justify-start gap-0">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="advances">Advance salary</TabsTrigger>
          <TabsTrigger value="payrun">Payroll run</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <EmployeesTab
            employees={employees}
            onChanged={reloadEmployees}
            editEmployeeId={editEmployeeId}
            onClearEdit={() => router.replace("/admin/payroll")}
            onOpenProfile={(id) => router.push(`/admin/payroll/employees/${id}`)}
          />
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <AttendanceTab employees={employees.filter((e) => e.active)} month={month} setMonth={setMonth} />
        </TabsContent>

        <TabsContent value="advances" className="space-y-4">
          <AdvancesTab employees={employees.filter((e) => e.active)} monthKey={monthKey} />
        </TabsContent>

        <TabsContent value="payrun" className="space-y-4">
          <PayrunTab monthKey={monthKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmployeesTab({
  employees,
  onChanged,
  editEmployeeId,
  onClearEdit,
  onOpenProfile,
}: {
  employees: EmployeeRow[];
  onChanged: () => Promise<void>;
  editEmployeeId: string | null;
  onClearEdit: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("0");
  const [dailyRate, setDailyRate] = useState("0");
  const [paidLeaves, setPaidLeaves] = useState("4");
  const [active, setActive] = useState(true);
  const [joinedAt, setJoinedAt] = useState("");
  const [address, setAddress] = useState("");

  const resetForm = () => {
    setCode("");
    setName("");
    setPhone("");
    setMonthlySalary("0");
    setDailyRate("0");
    setPaidLeaves("4");
    setActive(true);
    setJoinedAt("");
    setAddress("");
  };

  const openNew = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (e: EmployeeRow) => {
    setEditing(e);
    setCode(e.code ?? "");
    setName(e.name ?? "");
    setPhone(e.phone ?? "");
    setMonthlySalary(paiseToRupeesInput(e.monthlySalaryPaise ?? 0));
    setDailyRate(paiseToRupeesInput(e.dailyRatePaise ?? 0));
    setPaidLeaves(String(e.paidLeavesPerMonth ?? 4));
    setActive(Boolean(e.active));
    setJoinedAt(e.joinedAt ? String(e.joinedAt).slice(0, 10) : "");
    setAddress(e.address ?? "");
    setOpen(true);
  };

  useEffect(() => {
    if (!editEmployeeId || employees.length === 0) return;
    const emp = employees.find((x) => x.id === editEmployeeId);
    if (emp) {
      openEdit(emp);
      onClearEdit();
    }
  }, [editEmployeeId, employees, onClearEdit]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const hay = `${e.name} ${e.code} ${e.phone}`.toLowerCase();
      return hay.includes(q);
    });
  }, [employees, search]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        code,
        name,
        phone,
        address,
        active,
        monthlySalaryPaise: rupeesToPaise(monthlySalary || "0"),
        dailyRatePaise: rupeesToPaise(dailyRate || "0"),
        paidLeavesPerMonth: Number.parseInt(paidLeaves || "4", 10),
        joinedAt: joinedAt ? new Date(joinedAt).toISOString() : null,
      };
      const res = await fetch(
        editing ? `/api/admin/payroll/employees/${editing.id}` : "/api/admin/payroll/employees",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Save failed");
      }
      toast.success(editing ? "Employee updated" : "Employee added");
      setOpen(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this employee?")) return;
    try {
      const res = await fetch(`/api/admin/payroll/employees/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Employee deleted");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Employees</h2>
          <p className="text-muted-foreground text-sm">
            Click a row to open the full employee profile — salary, advances, leaves, and docs.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          <PlusIcon className="mr-2 size-4" aria-hidden />
          Add employee
        </Button>
      </div>

      <div className="relative max-w-md">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="pl-8"
          placeholder="Search name, code, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="text-right">Monthly salary</TableHead>
              <TableHead className="text-right">Daily rate</TableHead>
              <TableHead className="text-right">Leaves/mo</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No employees yet. Add one to start payroll.
                </TableCell>
              </TableRow>
            ) : filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No employees match your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onOpenProfile(e.id)}
                >
                  <TableCell className="font-mono text-xs">{e.code || "—"}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <Badge variant={e.active ? "default" : "secondary"}>
                      {e.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupees(e.monthlySalaryPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupees(e.dailyRatePaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.paidLeavesPerMonth}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEdit(e);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void remove(e.id);
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,56rem)]">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="emp-code">Code</Label>
              <Input id="emp-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. E-001" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input id="emp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="digits" />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="emp-name">Name</Label>
              <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-joined">Joined date</Label>
              <Input id="emp-joined" type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-active">Active (true/false)</Label>
              <SearchableSelect
                id="emp-active"
                options={[
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
                value={active ? "true" : "false"}
                onValueChange={(v) => setActive(v === "true")}
                placeholder="Status"
                searchPlaceholder="Search…"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-monthly">Monthly salary (₹)</Label>
              <Input
                id="emp-monthly"
                inputMode="decimal"
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                placeholder="e.g. 25000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-daily">Daily rate (₹)</Label>
              <Input
                id="emp-daily"
                inputMode="decimal"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="e.g. 800"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-leaves">Paid leaves per month</Label>
              <Input id="emp-leaves" value={paidLeaves} onChange={(e) => setPaidLeaves(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="emp-address">Address / note</Label>
              <Textarea id="emp-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
            </div>
          </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttendanceTab({
  employees,
  month,
  setMonth,
}: {
  employees: EmployeeRow[];
  month: Date;
  setMonth: (d: Date) => void;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, AttendanceKind>>({});
  const monthKey = useMemo(() => monthKeyFromDate(month), [month]);
  const y = month.getFullYear();
  const m0 = month.getMonth();
  const days = useMemo(() => daysInMonthLocal(month), [month]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/payroll/attendance?monthKey=${encodeURIComponent(monthKey)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to load attendance");
    const j = (await res.json()) as {
      rows: { employeeId: string; dayKey: string; kind: AttendanceKind }[];
    };
    const next: Record<string, AttendanceKind> = {};
    for (const r of j.rows) {
      next[`${r.employeeId}:${r.dayKey}`] = r.kind;
    }
    setRows(next);
  }, [monthKey]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  const setKind = async (employeeId: string, dayKey: string, kind: AttendanceKind) => {
    const k = `${employeeId}:${dayKey}`;
    setSavingKey(k);
    try {
      const res = await fetch("/api/admin/payroll/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId, dayKey, kind }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Save failed");
      }
      setRows((r) => ({ ...r, [k]: kind }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label>Month</Label>
          <Input
            type="month"
            value={monthKey}
            onChange={(e) => {
              const v = e.target.value;
              if (!/^\d{4}-\d{2}$/.test(v)) return;
              const [yy, mm] = v.split("-");
              setMonth(new Date(Number(yy), Number(mm) - 1, 1));
            }}
            className="w-40 font-mono"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Set per-day status. Use <span className="font-mono">WORKED_ON_LEAVE</span> when they worked on a leave day (extra pay).
        </p>
      </div>

      <div className="overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">Employee</TableHead>
              {Array.from({ length: days }).map((_, idx) => (
                <TableHead key={idx} className="w-14 text-center font-mono text-xs">
                  {idx + 1}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="min-w-44">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">{e.code || e.id.slice(0, 6)}</p>
                </TableCell>
                {Array.from({ length: days }).map((_, idx) => {
                  const dayKey = dayKeyLocal(y, m0, idx + 1);
                  const k = `${e.id}:${dayKey}`;
                  const v = rows[k] ?? "WORKED";
                  const disabled = savingKey === k;
                  return (
                    <TableCell key={dayKey} className="p-1 text-center">
                      <SearchableSelect
                        options={[
                          { value: "WORKED", label: "W", searchText: "Worked" },
                          { value: "LEAVE", label: "L", searchText: "Leave" },
                          { value: "ABSENT", label: "A", searchText: "Absent" },
                          { value: "WORKED_ON_LEAVE", label: "WL", searchText: "Worked on leave" },
                        ]}
                        value={v}
                        onValueChange={(nv) =>
                          void setKind(e.id, dayKey, nv as AttendanceKind)
                        }
                        disabled={disabled}
                        triggerClassName="h-8 min-w-[3.5rem] px-1 text-xs"
                        searchPlaceholder="W / L / A…"
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdvancesTab({ employees, monthKey }: { employees: EmployeeRow[]; monthKey: string }) {
  const [rows, setRows] = useState<AdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amountRupees, setAmountRupees] = useState("");
  const [method, setMethod] = useState<AdvanceMethod>("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payroll/advances?monthKey=${encodeURIComponent(monthKey)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load advances");
      const j = (await res.json()) as { rows: AdvanceRow[] };
      setRows(j.rows);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  const add = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payroll/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          employeeId,
          occurredAt: new Date(occurredAt).toISOString(),
          amountPaise: rupeesToPaise(amountRupees || "0"),
          method,
          reference,
          note,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Save failed");
      }
      toast.success("Advance added");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Track advance salary/recharge/cash. This will be deducted in the payroll run for the month.
        </p>
        <Button type="button" onClick={() => setOpen(true)} disabled={!employees.length}>
          <PlusIcon className="size-4" />
          Add advance
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{String(r.occurredAt).slice(0, 10)}</TableCell>
                <TableCell className="font-medium">{r.employee.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.method}</TableCell>
                <TableCell className="text-right">{formatRupees(r.amountPaise)}</TableCell>
                <TableCell className="text-muted-foreground">{r.reference || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{r.note || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add advance</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Employee</Label>
              <SearchableSelect
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                value={employeeId}
                onValueChange={setEmployeeId}
                placeholder="Employee"
                searchPlaceholder="Search employees…"
              />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <SearchableSelect
                options={[
                  { value: "CASH", label: "Cash" },
                  { value: "RECHARGE", label: "Recharge" },
                  { value: "OTHER", label: "Other" },
                ]}
                value={method}
                onValueChange={(v) => setMethod(v as AdvanceMethod)}
                placeholder="Method"
                searchPlaceholder="Search method…"
              />
            </div>
            <div className="space-y-1">
              <Label>Amount (₹)</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void add()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayrunTab({ monthKey }: { monthKey: string }) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  type PayrollLine = {
    id: string;
    employeeId: string;
    monthlySalaryPaise: number;
    extrasPaise: number;
    deductionsPaise: number;
    advancesPaise: number;
    netPayPaise: number;
    employee?: { name: string | null };
  };
  type PayrollRun = {
    id: string;
    monthKey: string;
    createdAt: string;
    lines: PayrollLine[];
  };
  const [run, setRun] = useState<PayrollRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payroll/runs?monthKey=${encodeURIComponent(monthKey)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load payroll run");
      const j = (await res.json()) as { run: PayrollRun | null };
      setRun(j.run ?? null);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/payroll/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ monthKey }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Create failed");
      }
      toast.success("Payroll run generated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">Month: <span className="font-mono">{monthKey}</span></p>
          <p className="text-muted-foreground text-xs">
            Net pay = monthly salary + (worked on leave days × daily rate) − (unpaid absences/leaves × daily rate) − advances
          </p>
        </div>
        <Button type="button" onClick={() => void create()} disabled={creating || Boolean(run)}>
          {creating ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Generating…
            </>
          ) : run ? (
            "Already generated"
          ) : (
            "Generate payroll"
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          Loading…
        </div>
      ) : !run ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          No payroll run yet for this month. Generate it after entering attendance and advances.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="font-medium">Run created</p>
            <p className="text-muted-foreground text-xs">
              {String(run.createdAt).replace("T", " ").slice(0, 19)}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead className="text-right">Extras</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Advances</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(run.lines ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.employee?.name ?? l.employeeId}</TableCell>
                  <TableCell className="text-right">{formatRupees(l.monthlySalaryPaise)}</TableCell>
                  <TableCell className="text-right">{formatRupees(l.extrasPaise)}</TableCell>
                  <TableCell className="text-right">{formatRupees(l.deductionsPaise)}</TableCell>
                  <TableCell className="text-right">{formatRupees(l.advancesPaise)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatRupees(l.netPayPaise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

