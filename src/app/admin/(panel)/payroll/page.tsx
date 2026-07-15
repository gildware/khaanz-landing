"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdvanceMethod, AttendanceKind } from "@prisma/client";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, RefreshCcwIcon } from "lucide-react";

import {
  DataTableToolbar,
  type ActiveFilter,
} from "@/components/admin/data-table-toolbar";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTabParam } from "@/hooks/use-tab-param";
import {
  formatRupees,
  monthKeyFromDate,
  paiseToRupeesInput,
  rupeesToPaise,
} from "@/lib/payroll/payroll-utils";
import { formatLeaveDays } from "@/lib/payroll/payroll-calc";
import { cn } from "@/lib/utils";

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

function weekdayShortLocal(y: number, m0: number, day: number): string {
  return new Date(y, m0, day).toLocaleDateString("en-IN", { weekday: "short" });
}

function attendancePillLabel(kind: AttendanceKind): string {
  switch (kind) {
    case "LEAVE":
      return "Leave";
    case "HALF_DAY_LEAVE":
      return "Half leave";
    case "ABSENT":
      return "Leave";
    case "WORKED_ON_LEAVE":
      return "Present";
    default:
      return "Present";
  }
}

function attendancePillClass(kind: AttendanceKind): string {
  switch (kind) {
    case "LEAVE":
    case "ABSENT":
      return "bg-amber-500/12 text-amber-900 hover:bg-amber-500/18 dark:text-amber-300";
    case "HALF_DAY_LEAVE":
      return "bg-sky-500/12 text-sky-900 hover:bg-sky-500/18 dark:text-sky-300";
    default:
      return "bg-emerald-500/12 text-emerald-800 hover:bg-emerald-500/18 dark:text-emerald-300";
  }
}

function normalizeAttendanceKind(kind: AttendanceKind): AttendanceKind {
  if (kind === "ABSENT") return "LEAVE";
  if (kind === "WORKED_ON_LEAVE") return "WORKED";
  return kind;
}

function AttendanceDayPill({
  kind,
  dirty,
  disabled,
  onChange,
}: {
  kind: AttendanceKind;
  dirty?: boolean;
  disabled: boolean;
  onChange: (kind: AttendanceKind) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const pick = (next: AttendanceKind) => {
    setOpen(false);
    if (next !== kind) onChange(next);
  };

  const options: { value: AttendanceKind; label: string }[] = [
    { value: "WORKED", label: "Present" },
    { value: "LEAVE", label: "Leave" },
    { value: "HALF_DAY_LEAVE", label: "Half leave" },
  ];

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-7 min-w-[4.25rem] items-center justify-center rounded-full px-2 text-[10px] font-medium transition-colors",
          attendancePillClass(normalizeAttendanceKind(kind)),
          dirty && "ring-2 ring-primary/40 ring-offset-1",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {attendancePillLabel(normalizeAttendanceKind(kind))}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close attendance edit"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-1/2 top-full z-50 mt-1 flex -translate-x-1/2 gap-0.5 rounded-full border bg-background p-0.5 shadow-md">
            {options.map((opt, idx) => (
              <span key={opt.value} className="flex items-center">
                {idx > 0 ? (
                  <span className="text-muted-foreground/40 self-center px-0.5 text-[10px]">|</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => pick(opt.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                    normalizeAttendanceKind(kind) === opt.value
                      ? attendancePillClass(opt.value)
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {opt.label}
                </button>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AdminPayrollPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editEmployeeId = searchParams.get("edit");
  const [tab, setTab] = useTabParam("employees");
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
          <PayrunTab />
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
  const [statusFilter, setStatusFilter] = useState<ActiveFilter>("all");
  const [sort, setSort] = useState("name-asc");
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
    let list = employees.filter((e) => {
      if (statusFilter === "active" && !e.active) return false;
      if (statusFilter === "inactive" && e.active) return false;
      if (!q) return true;
      const hay = `${e.name} ${e.code} ${e.phone}`.toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "salary-desc":
          return b.monthlySalaryPaise - a.monthlySalaryPaise;
        case "salary-asc":
          return a.monthlySalaryPaise - b.monthlySalaryPaise;
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [employees, search, statusFilter, sort]);

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

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, code, phone…"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sort={sort}
        onSortChange={setSort}
        sortOptions={[
          { value: "name-asc", label: "Name (A–Z)" },
          { value: "name-desc", label: "Name (Z–A)" },
          { value: "salary-desc", label: "Salary (high–low)" },
          { value: "salary-asc", label: "Salary (low–high)" },
        ]}
        filteredCount={filteredEmployees.length}
        totalCount={employees.length}
      />

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
  const [savedRows, setSavedRows] = useState<Record<string, AttendanceKind>>({});
  const [rows, setRows] = useState<Record<string, AttendanceKind>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name-asc");
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
    setSavedRows(next);
  }, [monthKey]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  const effectiveKind = useCallback(
    (map: Record<string, AttendanceKind>, employeeId: string, dayKey: string): AttendanceKind =>
      map[`${employeeId}:${dayKey}`] ?? "WORKED",
    [],
  );

  const dirtyChanges = useMemo(() => {
    const changes: { employeeId: string; dayKey: string; kind: AttendanceKind }[] = [];
    for (const e of employees) {
      for (let dayNum = 1; dayNum <= days; dayNum++) {
        const dayKey = dayKeyLocal(y, m0, dayNum);
        const draft = effectiveKind(rows, e.id, dayKey);
        const saved = effectiveKind(savedRows, e.id, dayKey);
        if (draft !== saved) {
          changes.push({ employeeId: e.id, dayKey, kind: draft });
        }
      }
    }
    return changes;
  }, [days, effectiveKind, employees, m0, rows, savedRows, y]);

  const updateKind = (employeeId: string, dayKey: string, kind: AttendanceKind) => {
    const k = `${employeeId}:${dayKey}`;
    setRows((r) => ({ ...r, [k]: kind }));
  };

  const saveAll = async () => {
    if (dirtyChanges.length === 0) return;
    const count = dirtyChanges.length;
    setSaving(true);
    try {
      for (const change of dirtyChanges) {
        const res = await fetch("/api/admin/payroll/attendance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(change),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Save failed");
        }
      }
      setSavedRows({ ...rows });
      toast.success(count === 1 ? "Attendance saved." : `Saved ${count} attendance updates.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = employees;
    if (q) {
      list = list.filter((e) => {
        const hay = `${e.name} ${e.code}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [employees, search, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
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
          <Button
            type="button"
            disabled={saving || dirtyChanges.length === 0}
            onClick={() => void saveAll()}
          >
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save attendance
            {dirtyChanges.length > 0 ? (
              <Badge variant="secondary" className="ml-1.5 rounded-full px-1.5 tabular-nums">
                {dirtyChanges.length}
              </Badge>
            ) : null}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Mark <span className="font-medium text-foreground">Present</span>,{" "}
          <span className="font-medium text-foreground">Leave</span>, or{" "}
          <span className="font-medium text-foreground">Half leave</span>, then click{" "}
          <span className="font-medium text-foreground">Save attendance</span>. Unused paid leaves
          (up to 4/month) add extra pay; extra leave days are deducted.
        </p>
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee…"
        sort={sort}
        onSortChange={setSort}
        sortOptions={[
          { value: "name-asc", label: "Name (A–Z)" },
          { value: "name-desc", label: "Name (Z–A)" },
        ]}
        filteredCount={filteredEmployees.length}
        totalCount={employees.length}
        showStatusFilter={false}
      />

      <div className="overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">Employee</TableHead>
              {Array.from({ length: days }).map((_, idx) => {
                const dayNum = idx + 1;
                const weekday = weekdayShortLocal(y, m0, dayNum);
                const isWeekend = weekday === "Sat" || weekday === "Sun";
                return (
                  <TableHead
                    key={idx}
                    className={cn(
                      "w-[4.5rem] px-1 text-center",
                      isWeekend && "bg-muted/40",
                    )}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          isWeekend ? "text-muted-foreground" : "text-muted-foreground/80",
                        )}
                      >
                        {weekday}
                      </span>
                      <span className="font-mono text-xs tabular-nums">{dayNum}</span>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={days + 1}
                  className="py-10 text-center text-muted-foreground"
                >
                  No employees match your search.
                </TableCell>
              </TableRow>
            ) : null}
            {filteredEmployees.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="min-w-44">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">{e.code || e.id.slice(0, 6)}</p>
                </TableCell>
                {Array.from({ length: days }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const dayKey = dayKeyLocal(y, m0, dayNum);
                  const weekday = weekdayShortLocal(y, m0, dayNum);
                  const isWeekend = weekday === "Sat" || weekday === "Sun";
                  const v = rows[`${e.id}:${dayKey}`] ?? "WORKED";
                  const saved = savedRows[`${e.id}:${dayKey}`] ?? "WORKED";
                  const isDirty = v !== saved;
                  return (
                    <TableCell
                      key={dayKey}
                      className={cn("p-1 text-center", isWeekend && "bg-muted/20")}
                    >
                      <AttendanceDayPill
                        kind={v}
                        dirty={isDirty}
                        disabled={saving}
                        onChange={(kind) => updateKind(e.id, dayKey, kind)}
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
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [sort, setSort] = useState("date-desc");

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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (methodFilter !== "all" && r.method !== methodFilter) return false;
      if (!q) return true;
      const hay = `${r.employee.name} ${r.employee.code} ${r.reference} ${r.note} ${r.method}`.toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return a.occurredAt.localeCompare(b.occurredAt);
        case "amount-asc":
          return a.amountPaise - b.amountPaise;
        case "amount-desc":
          return b.amountPaise - a.amountPaise;
        case "employee-asc":
          return a.employee.name.localeCompare(b.employee.name);
        default:
          return b.occurredAt.localeCompare(a.occurredAt);
      }
    });
    return list;
  }, [rows, search, methodFilter, sort]);

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
        <>
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search employee, reference, note…"
            sort={sort}
            onSortChange={setSort}
            sortOptions={[
              { value: "date-desc", label: "Newest first" },
              { value: "date-asc", label: "Oldest first" },
              { value: "amount-desc", label: "Amount (high–low)" },
              { value: "amount-asc", label: "Amount (low–high)" },
              { value: "employee-asc", label: "Employee (A–Z)" },
            ]}
            filteredCount={filteredRows.length}
            totalCount={rows.length}
            showStatusFilter={false}
          >
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Method</Label>
              <SearchableSelect
                options={[
                  { value: "all", label: "All methods" },
                  { value: "CASH", label: "Cash" },
                  { value: "UPI", label: "UPI" },
                  { value: "BANK", label: "Bank" },
                  { value: "CHEQUE", label: "Cheque" },
                ]}
                value={methodFilter}
                onValueChange={setMethodFilter}
                placeholder="Method"
                searchPlaceholder="Search…"
              />
            </div>
          </DataTableToolbar>
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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No advances for this month yet.
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No advances match your search or filters.
                </TableCell>
              </TableRow>
            ) : null}
            {filteredRows.map((r) => (
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
        </>
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

function formatMonthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function PayrunTab() {
  const [month, setMonth] = useState(() => startOfMonthLocal(new Date()));
  const monthKey = useMemo(() => monthKeyFromDate(month), [month]);

  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [creating, setCreating] = useState(false);
  type PayrollLine = {
    id: string;
    employeeId: string;
    monthlySalaryPaise: number;
    totalDays: number;
    workedDays: number;
    halfLeaveDays: number;
    leaveDays: number;
    paidLeavesAllowed: number;
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
  type RunSummary = { id: string; monthKey: string; createdAt: string };
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [pastRuns, setPastRuns] = useState<RunSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("net-desc");

  const loadPastRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/admin/payroll/runs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payroll history");
      const j = (await res.json()) as { runs: RunSummary[] };
      setPastRuns(j.runs ?? []);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

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
    void loadPastRuns().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [loadPastRuns]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  const filteredLines = useMemo(() => {
    const lines = run?.lines ?? [];
    const q = search.trim().toLowerCase();
    let list = lines;
    if (q) {
      list = list.filter((l) => {
        const name = l.employee?.name ?? l.employeeId;
        return name.toLowerCase().includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "");
        case "net-asc":
          return a.netPayPaise - b.netPayPaise;
        case "salary-desc":
          return b.monthlySalaryPaise - a.monthlySalaryPaise;
        default:
          return b.netPayPaise - a.netPayPaise;
      }
    });
    return list;
  }, [run?.lines, search, sort]);

  const totalNetPay = useMemo(
    () => (run?.lines ?? []).reduce((sum, l) => sum + l.netPayPaise, 0),
    [run?.lines],
  );

  const runLineCount = run?.lines?.length ?? 0;
  const isRunIncomplete = Boolean(run && runLineCount === 0);
  const hasCompleteRun = Boolean(run && runLineCount > 0);

  const create = async (regenerate = false) => {
    if (regenerate && !isRunIncomplete) {
      const label = formatMonthLabel(monthKey);
      if (!confirm(`Regenerate payroll for ${label}? This replaces the existing run with fresh calculations.`)) {
        return;
      }
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/payroll/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ monthKey, regenerate }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; repaired?: boolean };
      if (!res.ok) {
        throw new Error(j.error || "Create failed");
      }
      toast.success(
        regenerate
          ? "Payroll regenerated"
          : j.repaired
            ? "Payroll repaired and generated"
            : "Payroll run generated",
      );
      await Promise.all([load(), loadPastRuns()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const selectMonthKey = (key: string) => {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return;
    setMonth(new Date(Number(m[1]), Number(m[2]) - 1, 1));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Payroll history</h2>
            <p className="text-muted-foreground text-xs">Select a month to view or regenerate.</p>
          </div>
          {loadingRuns ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              Loading…
            </div>
          ) : pastRuns.length === 0 ? (
            <div className="rounded-xl border bg-card p-3 text-muted-foreground text-sm">
              No payroll runs yet.
            </div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border bg-card p-1">
              {pastRuns.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectMonthKey(r.monthKey)}
                  className={cn(
                    "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                    r.monthKey === monthKey && "bg-primary/10 ring-1 ring-primary/20",
                  )}
                >
                  <span className="font-medium">{formatMonthLabel(r.monthKey)}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {String(r.createdAt).replace("T", " ").slice(0, 16)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Month</Label>
                <Input
                  type="month"
                  value={monthKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!/^\d{4}-\d{2}$/.test(v)) return;
                    selectMonthKey(v);
                  }}
                  className="w-40 font-mono"
                />
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Selected</p>
                <p className="font-medium text-sm">{formatMonthLabel(monthKey)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasCompleteRun ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void create(true)}
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      Regenerating…
                    </>
                  ) : (
                    <>
                      <RefreshCcwIcon className="mr-2 size-4" />
                      Regenerate
                    </>
                  )}
                </Button>
              ) : (
                <Button type="button" onClick={() => void create(false)} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      Generating…
                    </>
                  ) : isRunIncomplete ? (
                    "Repair payroll"
                  ) : (
                    "Run payroll"
                  )}
                </Button>
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Net pay = monthly salary + (unused paid leaves × daily rate) − (extra leave days × daily
            rate) − advances. Full month with no leave → 4 extra days pay (if 4 leaves/month).
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              Loading…
            </div>
          ) : !run || isRunIncomplete ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              {isRunIncomplete ? (
                <>
                  Payroll for {formatMonthLabel(monthKey)} was created but has no employee lines — likely
                  from an interrupted run. Click{" "}
                  <span className="font-medium text-foreground">Repair payroll</span> to generate it.
                </>
              ) : (
                <>
                  No payroll run for {formatMonthLabel(monthKey)}. Enter attendance and advances for this
                  month, then click <span className="font-medium text-foreground">Run payroll</span>.
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div>
                  <p className="font-medium">Payroll run</p>
                  <p className="text-muted-foreground text-xs">
                    Generated {String(run.createdAt).replace("T", " ").slice(0, 19)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Total net pay</p>
                  <p className="font-semibold text-lg tabular-nums">{formatRupees(totalNetPay)}</p>
                </div>
              </div>
              <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search employee…"
                sort={sort}
                onSortChange={setSort}
                sortOptions={[
                  { value: "net-desc", label: "Net pay (high–low)" },
                  { value: "net-asc", label: "Net pay (low–high)" },
                  { value: "salary-desc", label: "Salary (high–low)" },
                  { value: "name-asc", label: "Employee (A–Z)" },
                ]}
                filteredCount={filteredLines.length}
                totalCount={run.lines?.length ?? 0}
                showStatusFilter={false}
              />
              <div className="overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-36">Employee</TableHead>
                      <TableHead className="text-right">Total days</TableHead>
                      <TableHead className="text-right">Worked</TableHead>
                      <TableHead className="text-right">Extra days</TableHead>
                      <TableHead className="text-right">Leaves</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead className="text-right">Extras</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Advances</TableHead>
                      <TableHead className="text-right">Net pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                          No lines match your search or filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {filteredLines.map((l) => {
                      const leaveTotal = l.leaveDays + l.halfLeaveDays * 0.5;
                      const workedTotal = l.workedDays + l.halfLeaveDays * 0.5;
                      const extraDays = Math.max(0, l.paidLeavesAllowed - leaveTotal);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.employee?.name ?? l.employeeId}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.totalDays || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLeaveDays(workedTotal)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLeaveDays(extraDays)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLeaveDays(leaveTotal)}
                          </TableCell>
                          <TableCell className="text-right">{formatRupees(l.monthlySalaryPaise)}</TableCell>
                          <TableCell className="text-right">{formatRupees(l.extrasPaise)}</TableCell>
                          <TableCell className="text-right">{formatRupees(l.deductionsPaise)}</TableCell>
                          <TableCell className="text-right">{formatRupees(l.advancesPaise)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatRupees(l.netPayPaise)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPayrollPage() {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground text-sm">Loading payroll…</div>
      }
    >
      <AdminPayrollPageContent />
    </Suspense>
  );
}

