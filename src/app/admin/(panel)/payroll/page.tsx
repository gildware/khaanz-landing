"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdvanceMethod, AttendanceKind } from "@prisma/client";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, RefreshCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatPaise, monthKeyFromDate } from "@/lib/payroll/payroll-utils";

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

type EmployeeDoc = {
  id: string;
  kind: "ID_PROOF" | "ADDRESS_PROOF" | "CONTRACT" | "OTHER";
  title: string;
  fileUrl: string;
  note: string;
  createdAt: string;
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
          <EmployeesTab employees={employees} onChanged={reloadEmployees} />
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
}: {
  employees: EmployeeRow[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
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
  const [docs, setDocs] = useState<EmployeeDoc[]>([]);
  const [docKind, setDocKind] = useState<EmployeeDoc["kind"]>("ID_PROOF");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docNote, setDocNote] = useState("");

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
    setDocs([]);
    setDocKind("ID_PROOF");
    setDocTitle("");
    setDocUrl("");
    setDocNote("");
  };

  const loadDocs = async (employeeId: string) => {
    const res = await fetch(`/api/admin/payroll/employees/${employeeId}`, { credentials: "include" });
    if (!res.ok) return;
    const j = (await res.json()) as { employee?: { documents?: EmployeeDoc[] } };
    setDocs(j.employee?.documents ?? []);
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
    setMonthlySalary(String(e.monthlySalaryPaise ?? 0));
    setDailyRate(String(e.dailyRatePaise ?? 0));
    setPaidLeaves(String(e.paidLeavesPerMonth ?? 4));
    setActive(Boolean(e.active));
    setJoinedAt(e.joinedAt ? String(e.joinedAt).slice(0, 10) : "");
    setAddress(e.address ?? "");
    setOpen(true);
    void loadDocs(e.id);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        code,
        name,
        phone,
        address,
        active,
        monthlySalaryPaise: Number.parseInt(monthlySalary || "0", 10),
        dailyRatePaise: Number.parseInt(dailyRate || "0", 10),
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

  const addDoc = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/admin/payroll/employees/${editing.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: docKind,
          title: docTitle,
          fileUrl: docUrl,
          note: docNote,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Save failed");
      }
      setDocTitle("");
      setDocUrl("");
      setDocNote("");
      await loadDocs(editing.id);
      toast.success("Document added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const deleteDoc = async (docId: string) => {
    if (!editing) return;
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch(
        `/api/admin/payroll/employees/${editing.id}/documents?docId=${encodeURIComponent(docId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Delete failed");
      await loadDocs(editing.id);
      toast.success("Document deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Monthly salary is fixed. Daily rate is used for leave-day work bonus and unpaid deductions.
        </p>
        <Button type="button" onClick={openNew}>
          <PlusIcon className="size-4" />
          Add employee
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-48 text-right">Monthly salary</TableHead>
            <TableHead className="w-48 text-right">Daily rate</TableHead>
            <TableHead className="w-32 text-right">Leaves/mo</TableHead>
            <TableHead className="w-44 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.code || "-"}</TableCell>
              <TableCell className="font-medium">{e.name}</TableCell>
              <TableCell className={e.active ? "" : "text-muted-foreground"}>
                {e.active ? "Active" : "Inactive"}
              </TableCell>
              <TableCell className="text-right">{formatPaise(e.monthlySalaryPaise)}</TableCell>
              <TableCell className="text-right">{formatPaise(e.dailyRatePaise)}</TableCell>
              <TableCell className="text-right">{e.paidLeavesPerMonth}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(e)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void remove(e.id)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="emp-code">Code</Label>
              <Input id="emp-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. E-001" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input id="emp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="digits" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="emp-name">Name</Label>
              <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-joined">Joined date</Label>
              <Input id="emp-joined" type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-active">Active (true/false)</Label>
              <Select value={active ? "true" : "false"} onValueChange={(v) => setActive(v === "true")}>
                <SelectTrigger id="emp-active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-monthly">Monthly salary (paise)</Label>
              <Input id="emp-monthly" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} className="font-mono" />
              <p className="text-muted-foreground text-xs">Example: ₹25,000 = 2500000 paise</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-daily">Daily rate (paise)</Label>
              <Input id="emp-daily" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-leaves">Paid leaves per month</Label>
              <Input id="emp-leaves" value={paidLeaves} onChange={(e) => setPaidLeaves(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="emp-address">Address / note</Label>
              <Textarea id="emp-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-4">
                <p className="font-medium">Documents</p>
                <p className="text-muted-foreground text-xs">
                  Add document title and optional link (Google Drive, WhatsApp file link, etc.).
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Kind</Label>
                    <Select value={docKind} onValueChange={(v) => setDocKind(v as EmployeeDoc["kind"])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ID_PROOF">ID proof</SelectItem>
                        <SelectItem value="ADDRESS_PROOF">Address proof</SelectItem>
                        <SelectItem value="CONTRACT">Contract</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Title</Label>
                    <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Aadhaar" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>File URL (optional)</Label>
                    <Input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Note (optional)</Label>
                    <Textarea value={docNote} onChange={(e) => setDocNote(e.target.value)} rows={2} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="button" variant="outline" onClick={() => void addDoc()}>
                      Add document
                    </Button>
                  </div>
                </div>

                <div className="mt-4 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kind</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {docs.length ? (
                        docs.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs">{d.kind}</TableCell>
                            <TableCell className="font-medium">{d.title}</TableCell>
                            <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                              {d.fileUrl || "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => void deleteDoc(d.id)}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground text-sm">
                            No documents added yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
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
                      <Select
                        value={v}
                        onValueChange={(nv) => void setKind(e.id, dayKey, nv as AttendanceKind)}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 w-14 px-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WORKED">W</SelectItem>
                          <SelectItem value="LEAVE">L</SelectItem>
                          <SelectItem value="ABSENT">A</SelectItem>
                          <SelectItem value="WORKED_ON_LEAVE">WL</SelectItem>
                        </SelectContent>
                      </Select>
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
  const [amountPaise, setAmountPaise] = useState("0");
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
          amountPaise: Number.parseInt(amountPaise || "0", 10),
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
                <TableCell className="text-right">{formatPaise(r.amountPaise)}</TableCell>
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
              <Select value={employeeId} onValueChange={(v) => setEmployeeId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as AdvanceMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="RECHARGE">Recharge</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount (paise)</Label>
              <Input value={amountPaise} onChange={(e) => setAmountPaise(e.target.value)} className="font-mono" />
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
                  <TableCell className="text-right">{formatPaise(l.monthlySalaryPaise)}</TableCell>
                  <TableCell className="text-right">{formatPaise(l.extrasPaise)}</TableCell>
                  <TableCell className="text-right">{formatPaise(l.deductionsPaise)}</TableCell>
                  <TableCell className="text-right">{formatPaise(l.advancesPaise)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPaise(l.netPayPaise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

