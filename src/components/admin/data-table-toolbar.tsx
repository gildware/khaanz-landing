"use client";

import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";

export type ActiveFilter = "all" | "active" | "inactive";

export const selectControlClassName = "min-w-[8.5rem]";

export const STATUS_FILTER_OPTIONS: SearchableSelectOption[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
];

export function DataTableToolbar(props: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  sort: string;
  onSortChange: (value: string) => void;
  sortOptions: { value: string; label: string }[];
  filteredCount: number;
  totalCount: number;
  children?: React.ReactNode;
  showStatusFilter?: boolean;
  statusFilter?: ActiveFilter;
  onStatusFilterChange?: (value: ActiveFilter) => void;
  showSearch?: boolean;
  showSort?: boolean;
}) {
  const {
    search,
    onSearchChange,
    searchPlaceholder,
    statusFilter = "all",
    onStatusFilterChange,
    sort,
    onSortChange,
    sortOptions,
    filteredCount,
    totalCount,
    children,
    showStatusFilter = true,
    showSearch = true,
    showSort = true,
  } = props;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
      {showSearch ? (
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      ) : null}
      {children}
      {showStatusFilter && onStatusFilterChange ? (
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Status</Label>
          <SearchableSelect
            triggerClassName={selectControlClassName}
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => onStatusFilterChange(v as ActiveFilter)}
            placeholder="Status"
            searchPlaceholder="Search status…"
          />
        </div>
      ) : null}
      {showSort ? (
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Sort</Label>
          <SearchableSelect
            triggerClassName={selectControlClassName}
            options={sortOptions}
            value={sort}
            onValueChange={onSortChange}
            placeholder="Sort"
            searchPlaceholder="Search sort…"
          />
        </div>
      ) : null}
      <p className="pb-1 text-muted-foreground text-xs tabular-nums">
        {filteredCount} of {totalCount}
      </p>
    </div>
  );
}
