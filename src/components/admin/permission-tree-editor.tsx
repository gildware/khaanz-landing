"use client";

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  ADMIN_PERMISSION_TREE,
  compactPermissions,
  expandPermissionsForEditor,
  leafPermissionsUnder,
  type AdminPermission,
  type PermissionNode,
} from "@/lib/admin-permissions";
import { cn } from "@/lib/utils";

type PermissionTreeEditorProps = {
  value: AdminPermission[];
  onChange: (next: AdminPermission[]) => void;
  disabled?: boolean;
};

function selectionState(
  node: PermissionNode,
  selected: Set<AdminPermission>,
): "all" | "some" | "none" {
  const leaves = leafPermissionsUnder(node);
  const count = leaves.filter((l) => selected.has(l)).length;
  if (count === 0) return "none";
  if (count === leaves.length) return "all";
  return "some";
}

function PermissionTreeNode({
  node,
  selected,
  onToggleNode,
  disabled,
  depth = 0,
}: {
  node: PermissionNode;
  selected: Set<AdminPermission>;
  onToggleNode: (node: PermissionNode, checked: boolean) => void;
  disabled?: boolean;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = Boolean(node.children?.length);
  const state = selectionState(node, selected);

  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border pl-3")}>
      <div className="flex items-center gap-1 py-1">
        {hasChildren ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <label
          className={cn(
            "flex flex-1 items-center gap-2 text-sm cursor-pointer min-w-0",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          <Checkbox
            checked={state === "all"}
            className={cn(state === "some" && "opacity-80 ring-2 ring-primary/30")}
            disabled={disabled}
            onCheckedChange={(v) => onToggleNode(node, v === true)}
          />
          <span className={cn(hasChildren && "font-medium", "truncate")}>
            {node.label}
          </span>
        </label>
      </div>
      {hasChildren && open ? (
        <div className="space-y-0.5 pb-1">
          {node.children!.map((child) => (
            <PermissionTreeNode
              key={child.key}
              node={child}
              selected={selected}
              onToggleNode={onToggleNode}
              disabled={disabled}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PermissionTreeEditor({
  value,
  onChange,
  disabled,
}: PermissionTreeEditorProps) {
  const expanded = useMemo(() => expandPermissionsForEditor(value), [value]);
  const selected = useMemo(() => new Set(expanded), [expanded]);

  const toggleNode = (node: PermissionNode, checked: boolean) => {
    const leaves = leafPermissionsUnder(node);
    const next = new Set(selected);
    for (const leaf of leaves) {
      if (checked) next.add(leaf);
      else next.delete(leaf);
    }
    const ordered = compactPermissions(
      [...next].filter((k): k is AdminPermission => typeof k === "string"),
    );
    onChange(ordered);
  };

  const selectAll = () => {
    onChange(
      compactPermissions(
        ADMIN_PERMISSION_TREE.flatMap((n) => leafPermissionsUnder(n)),
      ),
    );
  };

  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Access by menu & submenu</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-primary hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={selectAll}
          >
            All
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={clearAll}
          >
            None
          </button>
        </div>
      </div>
      <div className="rounded-md border border-border p-3 max-h-[min(52vh,420px)] overflow-y-auto space-y-1">
        {ADMIN_PERMISSION_TREE.map((node) => (
          <PermissionTreeNode
            key={node.key}
            node={node}
            selected={selected}
            onToggleNode={toggleNode}
            disabled={disabled}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Expand a section to allow only specific pages or tabs. Staff with no
        submenu selected under a module cannot open that area.
      </p>
    </div>
  );
}
