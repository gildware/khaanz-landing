"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text included when filtering (not shown in the trigger). */
  searchText?: string;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  flipUp: boolean;
};

function computeMenuPosition(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const viewportPadding = 8;
  const estimatedMenuHeight = 280;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const flipUp = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

  return {
    top: flipUp ? rect.top - gap : rect.bottom + gap,
    left: rect.left,
    width: rect.width,
    maxHeight: flipUp
      ? Math.max(120, spaceAbove - gap)
      : Math.max(120, spaceBelow - gap),
    flipUp,
  };
}

export function SearchableSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No match",
  disabled,
  className,
  triggerClassName,
  creatable,
  onCreateOption,
  createOptionLabel,
  isCreating,
}: {
  id?: string;
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** When true, show a create action when search has no exact label match. */
  creatable?: boolean;
  onCreateOption?: (search: string) => void | Promise<void>;
  createOptionLabel?: (search: string) => string;
  isCreating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.searchText ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const createLabel = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    if (createOptionLabel) return createOptionLabel(q);
    return `Create "${q}"`;
  }, [createOptionLabel, search]);

  const showCreateOption = useMemo(() => {
    if (!creatable || !onCreateOption || isCreating) return false;
    const q = search.trim();
    if (!q) return false;
    const qLower = q.toLowerCase();
    const exactMatch = options.some(
      (o) => o.label.toLowerCase() === qLower || o.value.toLowerCase() === qLower,
    );
    return !exactMatch;
  }, [creatable, isCreating, onCreateOption, options, search]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setMenuPosition(computeMenuPosition(trigger));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] min-w-[12rem] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
            style={{
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: menuPosition.maxHeight,
              ...(menuPosition.flipUp
                ? {
                    top: menuPosition.top,
                    transform: "translateY(-100%)",
                  }
                : { top: menuPosition.top }),
            }}
          >
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 h-9"
              autoFocus
              onKeyDown={(e) => e.stopPropagation()}
            />
            <ul
              className="overflow-y-auto py-1 text-sm"
              style={{ maxHeight: Math.max(80, menuPosition.maxHeight - (showCreateOption ? 92 : 52)) }}
            >
              {filtered.length === 0 && !showCreateOption ? (
                <li className="px-2 py-2 text-muted-foreground">{emptyMessage}</li>
              ) : (
                filtered.map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent",
                        value === o.value && "bg-accent",
                      )}
                      onClick={() => {
                        onValueChange(o.value);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          value === o.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {showCreateOption && createLabel ? (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-sm border border-dashed px-2 py-1.5 text-left text-sm hover:bg-accent"
                disabled={isCreating}
                onClick={() => {
                  void (async () => {
                    const q = search.trim();
                    if (!q) return;
                    await onCreateOption?.(q);
                    setOpen(false);
                    setSearch("");
                  })();
                }}
              >
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{createLabel}</span>
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <Button
        ref={triggerRef}
        id={id}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          "h-9 w-full justify-between font-normal",
          !selected && "text-muted-foreground",
          triggerClassName,
        )}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className="truncate text-left">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>
      {menu}
    </div>
  );
}
