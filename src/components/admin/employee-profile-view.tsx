"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceKind } from "@prisma/client";
import { formatLeaveDays } from "@/lib/payroll/payroll-calc";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CalendarDaysIcon,
  IndianRupeeIcon,
  Loader2Icon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  WalletIcon,
} from "lucide-react";

import {
  DataTableToolbar,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRupees } from "@/lib/payroll/payroll-utils";

export type EmployeeProfile = {
  employee: {
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
  documents: {
    id: string;
    kind: string;
    title: string;
    fileUrl: string;
    note: string;
    createdAt: string;
  }[];
  summary: {
    totalNetPaidPaise: number;
    totalAdvancesPaise: number;
    payrollMonthsCount: number;
    currentMonthKey: string;
    currentMonth: {
      hasPayrollRun: boolean;
      netPayPaise: number;
      projected: boolean;
      workedDays: number;
      leaveDays: number;
      halfLeaveDays: number;
      fullLeaveDays: number;
      totalDays: number;
      extraLeaveDays: number;
      paidLeavesAllowed: number;
      unusedLeaveDays: number;
      unpaidLeaveDays: number;
      extrasPaise: number;
      deductionsPaise: number;
      advancesPaise: number;
    };
  };
  payrollHistory: {
    id: string;
    monthKey: string;
    runCreatedAt: string;
    monthlySalaryPaise: number;
    extrasPaise: number;
    deductionsPaise: number;
    advancesPaise: number;
    netPayPaise: number;
    workedDays: number;
    leaveDays: number;
    absentDays: number;
    workedOnLeaveDays: number;
    paidLeavesAllowed: number;
  }[];
  advances: {
    id: string;
    occurredAt: string;
    amountPaise: number;
    method: string;
    reference: string;
    note: string;
  }[];
  leaveHistory: { dayKey: string; kind: AttendanceKind }[];
  currentMonthAttendance: { dayKey: string; kind: AttendanceKind }[];
};

type EmployeeDocKind = "ID_PROOF" | "ADDRESS_PROOF" | "CONTRACT" | "OTHER";

const DOC_KIND_OPTIONS = [
  { value: "ID_PROOF", label: "ID proof" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "CONTRACT", label: "Contract" },
  { value: "OTHER", label: "Other" },
] as const;

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
          <div className="min-w-0">
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

function attendanceKindLabel(kind: AttendanceKind): string {
  switch (kind) {
    case "WORKED":
      return "Present";
    case "LEAVE":
      return "Leave";
    case "HALF_DAY_LEAVE":
      return "Half leave";
    case "ABSENT":
      return "Leave";
    case "WORKED_ON_LEAVE":
      return "Present";
    default:
      return kind;
  }
}

function attendanceBadgeVariant(
  kind: AttendanceKind,
): "default" | "secondary" | "destructive" | "outline" {
  switch (kind) {
    case "WORKED":
    case "WORKED_ON_LEAVE":
      return "default";
    case "LEAVE":
    case "ABSENT":
      return "secondary";
    case "HALF_DAY_LEAVE":
      return "outline";
    default:
      return "outline";
  }
}

function attendanceBadgeShort(kind: AttendanceKind): string {
  switch (kind) {
    case "LEAVE":
    case "ABSENT":
      return "L";
    case "HALF_DAY_LEAVE":
      return "½L";
    default:
      return "P";
  }
}

function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function EmployeeProfileView(props: {
  employeeId: string;
  editHref?: string;
}) {
  const { employeeId, editHref } = props;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [docKind, setDocKind] = useState<EmployeeDocKind>("ID_PROOF");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docNote, setDocNote] = useState("");
  const [docSaving, setDocSaving] = useState(false);
  const [salarySearch, setSalarySearch] = useState("");
  const [salarySort, setSalarySort] = useState("month-desc");
  const [advancesSearch, setAdvancesSearch] = useState("");
  const [advancesSort, setAdvancesSort] = useState("date-desc");
  const [leavesSearch, setLeavesSearch] = useState("");
  const [leavesSort, setLeavesSort] = useState("date-desc");
  const [docsSearch, setDocsSearch] = useState("");
  const [docsSort, setDocsSort] = useState("kind-asc");

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll/employees/${id}/profile`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load employee profile");
      const j = (await res.json()) as EmployeeProfile;
      setProfile(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(employeeId);
  }, [employeeId, load]);

  const addDoc = async () => {
    if (!docTitle.trim()) {
      toast.error("Document title is required");
      return;
    }
    setDocSaving(true);
    try {
      const res = await fetch(`/api/admin/payroll/employees/${employeeId}/documents`, {
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
      toast.success("Document added");
      await load(employeeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDocSaving(false);
    }
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch(
        `/api/admin/payroll/employees/${employeeId}/documents?docId=${encodeURIComponent(docId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Document deleted");
      await load(employeeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const filteredPayrollHistory = useMemo(() => {
    const q = salarySearch.trim().toLowerCase();
    let list = profile?.payrollHistory ?? [];
    if (q) {
      list = list.filter((row) => formatMonthKey(row.monthKey).toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (salarySort) {
        case "month-asc":
          return a.monthKey.localeCompare(b.monthKey);
        case "net-asc":
          return a.netPayPaise - b.netPayPaise;
        case "net-desc":
          return b.netPayPaise - a.netPayPaise;
        default:
          return b.monthKey.localeCompare(a.monthKey);
      }
    });
    return list;
  }, [profile?.payrollHistory, salarySearch, salarySort]);

  const filteredAdvances = useMemo(() => {
    const q = advancesSearch.trim().toLowerCase();
    let list = profile?.advances ?? [];
    if (q) {
      list = list.filter((a) => {
        const hay = `${a.method} ${a.reference} ${a.note} ${a.occurredAt}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      switch (advancesSort) {
        case "date-asc":
          return a.occurredAt.localeCompare(b.occurredAt);
        case "amount-asc":
          return a.amountPaise - b.amountPaise;
        case "amount-desc":
          return b.amountPaise - a.amountPaise;
        default:
          return b.occurredAt.localeCompare(a.occurredAt);
      }
    });
    return list;
  }, [profile?.advances, advancesSearch, advancesSort]);

  const filteredLeaveHistory = useMemo(() => {
    const q = leavesSearch.trim().toLowerCase();
    let list = profile?.leaveHistory ?? [];
    if (q) {
      list = list.filter((d) => {
        const hay = `${d.dayKey} ${attendanceKindLabel(d.kind)}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      if (leavesSort === "date-asc") return a.dayKey.localeCompare(b.dayKey);
      return b.dayKey.localeCompare(a.dayKey);
    });
    return list;
  }, [profile?.leaveHistory, leavesSearch, leavesSort]);

  const filteredDocuments = useMemo(() => {
    const q = docsSearch.trim().toLowerCase();
    let list = profile?.documents ?? [];
    if (q) {
      list = list.filter((d) => {
        const hay = `${d.kind} ${d.title} ${d.note} ${d.fileUrl}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      switch (docsSort) {
        case "title-asc":
          return (a.title || "").localeCompare(b.title || "");
        case "kind-desc":
          return b.kind.localeCompare(a.kind);
        default:
          return a.kind.localeCompare(b.kind);
      }
    });
    return list;
  }, [profile?.documents, docsSearch, docsSort]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading employee…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/payroll"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center")}
        >
          <ArrowLeftIcon className="mr-2 size-4" aria-hidden />
          Back to payroll
        </Link>
        <p className="text-destructive text-sm">{error ?? "Employee not found."}</p>
      </div>
    );
  }

  const emp = profile.employee;
  const summary = profile.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Link
            href="/admin/payroll"
            aria-label="Back to payroll"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "shrink-0",
            )}
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border bg-card font-semibold text-2xl shadow-sm">
            {emp.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-semibold text-2xl tracking-tight">{emp.name}</h1>
              <Badge variant={emp.active ? "default" : "secondary"}>
                {emp.active ? "Active" : "Inactive"}
              </Badge>
              {emp.code ? (
                <Badge variant="outline" className="font-mono">
                  {emp.code}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
              {emp.phone ? (
                <span className="flex items-center gap-1.5">
                  <PhoneIcon className="size-3.5" aria-hidden />
                  {emp.phone}
                </span>
              ) : null}
              {emp.joinedAt ? (
                <span className="flex items-center gap-1.5">
                  <CalendarDaysIcon className="size-3.5" aria-hidden />
                  Joined {emp.joinedAt.slice(0, 10)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {editHref ? (
          <Link
            href={editHref}
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center")}
          >
            <PencilIcon className="mr-2 size-4" aria-hidden />
            Edit employee
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Monthly salary"
          value={formatRupees(emp.monthlySalaryPaise)}
          subtitle={`Daily rate ${formatRupees(emp.dailyRatePaise)}`}
          Icon={IndianRupeeIcon}
          gradientClassName="bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20"
        />
        <KpiCard
          title="Total net paid"
          value={formatRupees(summary.totalNetPaidPaise)}
          subtitle={`${summary.payrollMonthsCount} payroll months`}
          Icon={WalletIcon}
          gradientClassName="bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-violet-500/15"
        />
        <KpiCard
          title={`${summary.currentMonthKey} payout`}
          value={formatRupees(summary.currentMonth.netPayPaise)}
          subtitle={
            summary.currentMonth.hasPayrollRun
              ? "Payroll run generated"
              : "Projected (not finalized)"
          }
          Icon={BanknoteIcon}
          gradientClassName="bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-rose-500/15"
        />
        <KpiCard
          title="Total advances"
          value={formatRupees(summary.totalAdvancesPaise)}
          subtitle={`${formatRupees(summary.currentMonth.advancesPaise)} this month`}
          Icon={BanknoteIcon}
          gradientClassName="bg-gradient-to-br from-rose-500/20 via-red-500/10 to-orange-500/15"
        />
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="font-medium">{formatMonthKey(summary.currentMonthKey)} — attendance</p>
        <p className="text-muted-foreground text-xs">
          Up to {summary.currentMonth.paidLeavesAllowed} paid leaves/month. Unused leaves add extra
          pay; leave days beyond the allowance are deducted.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total days", value: summary.currentMonth.totalDays },
            { label: "Worked", value: formatLeaveDays(summary.currentMonth.workedDays) },
            { label: "Extra days", value: formatLeaveDays(summary.currentMonth.extraLeaveDays) },
            { label: "Leaves", value: formatLeaveDays(summary.currentMonth.leaveDays) },
            {
              label: "Half leaves",
              value: summary.currentMonth.halfLeaveDays,
            },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border bg-muted/30 px-3 py-2">
              <p className="text-muted-foreground text-xs">{x.label}</p>
              <p className="font-semibold text-xl tabular-nums">{x.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {summary.currentMonth.extraLeaveDays > 0 ? (
            <Badge variant="secondary">
              {formatLeaveDays(summary.currentMonth.extraLeaveDays)} extra day
              {summary.currentMonth.extraLeaveDays === 1 ? "" : "s"} bonus
            </Badge>
          ) : null}
          <Badge variant="outline">Extras +{formatRupees(summary.currentMonth.extrasPaise)}</Badge>
          <Badge variant="outline">
            Deductions −{formatRupees(summary.currentMonth.deductionsPaise)}
          </Badge>
          {summary.currentMonth.unpaidLeaveDays > 0 ? (
            <Badge variant="destructive">
              {summary.currentMonth.unpaidLeaveDays} extra leave
              {summary.currentMonth.unpaidLeaveDays === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="salary">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="salary" className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            Monthly payroll runs — net pay after extras, deductions, and advances.
          </p>
          <DataTableToolbar
            search={salarySearch}
            onSearchChange={setSalarySearch}
            searchPlaceholder="Search month…"
            sort={salarySort}
            onSortChange={setSalarySort}
            sortOptions={[
              { value: "month-desc", label: "Newest month" },
              { value: "month-asc", label: "Oldest month" },
              { value: "net-desc", label: "Net pay (high–low)" },
              { value: "net-asc", label: "Net pay (low–high)" },
            ]}
            filteredCount={filteredPayrollHistory.length}
            totalCount={profile.payrollHistory.length}
            showStatusFilter={false}
          />
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Extras</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Advances</TableHead>
                  <TableHead className="text-right">Net pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.payrollHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No payroll runs yet for this employee.
                    </TableCell>
                  </TableRow>
                ) : filteredPayrollHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No rows match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayrollHistory.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{formatMonthKey(row.monthKey)}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          W {row.workedDays} · L {row.leaveDays} · A {row.absentDays}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatRupees(row.monthlySalaryPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-emerald-700 dark:text-emerald-400">
                        +{formatRupees(row.extrasPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-destructive">
                        −{formatRupees(row.deductionsPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        −{formatRupees(row.advancesPaise)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatRupees(row.netPayPaise)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="advances" className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            Advance salary, recharge, and cash — deducted in payroll runs.
          </p>
          <DataTableToolbar
            search={advancesSearch}
            onSearchChange={setAdvancesSearch}
            searchPlaceholder="Search method, reference, note…"
            sort={advancesSort}
            onSortChange={setAdvancesSort}
            sortOptions={[
              { value: "date-desc", label: "Newest first" },
              { value: "date-asc", label: "Oldest first" },
              { value: "amount-desc", label: "Amount (high–low)" },
              { value: "amount-asc", label: "Amount (low–high)" },
            ]}
            filteredCount={filteredAdvances.length}
            totalCount={profile.advances.length}
            showStatusFilter={false}
          />
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.advances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No advances recorded.
                    </TableCell>
                  </TableRow>
                ) : filteredAdvances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No advances match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdvances.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm tabular-nums">
                        {a.occurredAt.slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {a.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupees(a.amountPaise)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {a.reference || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{a.note || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="leaves" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="font-medium text-sm">Recent leave & absence days</p>
              <p className="text-muted-foreground text-xs">Last 60 recorded non-work days</p>
              <DataTableToolbar
                search={leavesSearch}
                onSearchChange={setLeavesSearch}
                searchPlaceholder="Search date, status…"
                sort={leavesSort}
                onSortChange={setLeavesSort}
                sortOptions={[
                  { value: "date-desc", label: "Newest first" },
                  { value: "date-asc", label: "Oldest first" },
                ]}
                filteredCount={filteredLeaveHistory.length}
                totalCount={profile.leaveHistory.length}
                showStatusFilter={false}
              />
              <div className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.leaveHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                          No leave or absence days recorded.
                        </TableCell>
                      </TableRow>
                    ) : filteredLeaveHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                          No days match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeaveHistory.map((d) => (
                        <TableRow key={d.dayKey}>
                          <TableCell className="font-mono text-sm tabular-nums">{d.dayKey}</TableCell>
                          <TableCell>
                            <Badge variant={attendanceBadgeVariant(d.kind)}>
                              {attendanceKindLabel(d.kind)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <p className="font-medium text-sm">
                {formatMonthKey(summary.currentMonthKey)} calendar
              </p>
              <p className="text-muted-foreground text-xs">Days marked in attendance</p>
              <div className="mt-3 flex flex-wrap gap-1.5 rounded-2xl border bg-card p-4 shadow-sm">
                {profile.currentMonthAttendance.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No attendance entered yet.</p>
                ) : (
                  profile.currentMonthAttendance.map((d) => (
                    <span
                      key={d.dayKey}
                      className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
                      title={attendanceKindLabel(d.kind)}
                    >
                      <span className="font-mono tabular-nums">{d.dayKey.slice(8)}</span>
                      <Badge
                        variant={attendanceBadgeVariant(d.kind)}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {attendanceBadgeShort(d.kind)}
                      </Badge>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-4 space-y-4">
          <div>
            <p className="font-medium text-sm">Documents</p>
            <p className="text-muted-foreground text-xs">
              ID proofs, contracts, and file links (Google Drive, WhatsApp, etc.).
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-3 font-medium text-sm">Add document</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label>Kind</Label>
                <SearchableSelect
                  options={[...DOC_KIND_OPTIONS]}
                  value={docKind}
                  onValueChange={(v) => setDocKind(v as EmployeeDocKind)}
                  placeholder="Kind"
                  searchPlaceholder="Search kind…"
                />
              </div>
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Aadhaar"
                />
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <Label>File URL (optional)</Label>
                <Input
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  className="font-mono text-xs"
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <Label>Note (optional)</Label>
                <Textarea
                  value={docNote}
                  onChange={(e) => setDocNote(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Button type="button" variant="outline" onClick={() => void addDoc()} disabled={docSaving}>
                  {docSaving ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
                      Adding…
                    </>
                  ) : (
                    <>
                      <PlusIcon className="mr-2 size-4" aria-hidden />
                      Add document
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DataTableToolbar
            search={docsSearch}
            onSearchChange={setDocsSearch}
            searchPlaceholder="Search kind, title, note…"
            sort={docsSort}
            onSortChange={setDocsSort}
            sortOptions={[
              { value: "kind-asc", label: "Kind (A–Z)" },
              { value: "kind-desc", label: "Kind (Z–A)" },
              { value: "title-asc", label: "Title (A–Z)" },
            ]}
            filteredCount={filteredDocuments.length}
            totalCount={profile.documents.length}
            showStatusFilter={false}
          />
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No documents on file.
                    </TableCell>
                  </TableRow>
                ) : filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No documents match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.kind}</TableCell>
                      <TableCell className="font-medium text-sm">{d.title || "—"}</TableCell>
                      <TableCell className="min-w-[12rem] break-all">
                        {d.fileUrl ? (
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary text-sm hover:underline"
                          >
                            {d.fileUrl}
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{d.note || "—"}</TableCell>
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
                )}
              </TableBody>
            </Table>
          </div>

          {emp.address ? (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-xs">Address / notes</p>
              <p className="mt-1 text-muted-foreground">{emp.address}</p>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
