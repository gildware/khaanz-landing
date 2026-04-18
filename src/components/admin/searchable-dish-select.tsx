"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types/menu";

export function SearchableDishSelect({
  items,
  value,
  onValueChange,
  disabled,
}: {
  items: MenuItem[];
  value: string;
  onValueChange: (itemId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === value),
    [items, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }, [items, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        className="h-10 w-full justify-between font-normal"
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className="truncate text-left">
          {selected ? selected.name : "Search dishes…"}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 h-9"
            autoFocus
            onKeyDown={(e) => e.stopPropagation()}
          />
          <ul className="max-h-52 overflow-y-auto py-1 text-sm">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-muted-foreground">No match</li>
            ) : (
              filtered.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent",
                      value === i.id && "bg-accent",
                    )}
                    onClick={() => {
                      onValueChange(i.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value === i.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {i.category}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
