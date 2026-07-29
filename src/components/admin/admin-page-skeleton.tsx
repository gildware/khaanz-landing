import { Skeleton } from "@/components/ui/skeleton";

export function AdminPageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-4 w-full max-w-md rounded-md" />
      <Skeleton className="h-4 w-2/3 max-w-sm rounded-md" />
    </div>
  );
}

export function AdminKpiGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

export function AdminChartGridSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border bg-card p-4 shadow-sm"
        >
          <div className="mb-3 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminTabsStripSkeleton({ tabs = 4 }: { tabs?: number }) {
  return (
    <div className="flex gap-2 rounded-xl border bg-muted/40 p-1">
      {Array.from({ length: tabs }, (_, i) => (
        <Skeleton key={i} className="h-8 flex-1 rounded-lg" />
      ))}
    </div>
  );
}

function AdminCountCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <Skeleton className="mb-2 h-4 w-24" />
          <Skeleton className="h-9 w-16" />
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <AdminPageHeaderSkeleton />
      <AdminKpiGridSkeleton count={5} />
      <AdminChartGridSkeleton count={4} />
      <AdminCountCardsSkeleton count={4} />
    </div>
  );
}

export function AdminInventorySkeleton() {
  return (
    <div className="space-y-6">
      <AdminPageHeaderSkeleton />
      <AdminTabsStripSkeleton tabs={7} />
      <AdminKpiGridSkeleton count={3} />
      <AdminChartGridSkeleton count={2} />
      <AdminTableSkeleton />
    </div>
  );
}

export function AdminVendorsSkeleton() {
  return (
    <div className="space-y-6">
      <AdminPageHeaderSkeleton />
      <AdminTabsStripSkeleton tabs={5} />
      <AdminKpiGridSkeleton count={3} />
      <AdminTableSkeleton />
    </div>
  );
}

export function AdminExpensesSkeleton() {
  return (
    <div className="space-y-6">
      <AdminPageHeaderSkeleton />
      <AdminTabsStripSkeleton tabs={2} />
      <AdminKpiGridSkeleton count={4} />
      <AdminTableSkeleton />
    </div>
  );
}
