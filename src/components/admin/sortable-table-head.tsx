"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function parseSortValue(sort: string): { column: string; dir: SortDir } {
  const idx = sort.lastIndexOf("-");
  if (idx <= 0) return { column: sort, dir: "asc" };
  const dir = sort.slice(idx + 1);
  if (dir === "asc" || dir === "desc") {
    return { column: sort.slice(0, idx), dir };
  }
  return { column: sort, dir: "asc" };
}

export function toggleSortValue(sort: string, column: string): string {
  const { column: active, dir } = parseSortValue(sort);
  if (active !== column) return `${column}-asc`;
  return dir === "asc" ? `${column}-desc` : `${column}-asc`;
}

export function SortableTableHead(props: {
  label: string;
  column: string;
  sort: string;
  onSortChange: (value: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const { label, column, sort, onSortChange, className, align = "left" } = props;
  const { column: activeColumn, dir } = parseSortValue(sort);
  const active = activeColumn === column;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 font-medium text-foreground hover:text-foreground",
          align === "right" && "w-full justify-end",
          !active && "text-muted-foreground",
        )}
        onClick={() => onSortChange(toggleSortValue(sort, column))}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {active ? (
          dir === "asc" ? (
            <ArrowUpIcon className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowDownIcon className="size-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDownIcon
            className="size-3.5 shrink-0 opacity-40"
            aria-hidden
          />
        )}
      </button>
    </TableHead>
  );
}
