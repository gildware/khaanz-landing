"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MenuAddon } from "@/types/menu";
import { useMenuData } from "@/contexts/menu-data-context";
import { persistMenuPayload } from "@/lib/persist-menu-client";

function newAddonId() {
  return `ga-${Date.now().toString(36)}`;
}

export function MenuCatalogAddonsPanel() {
  const { data, mutate } = useMenuData();
  const [rows, setRows] = useState<MenuAddon[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name-asc");

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "price-desc":
          return b.price - a.price || a.name.localeCompare(b.name);
        case "price-asc":
          return a.price - b.price || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [rows, search, sort]);

  useEffect(() => {
    setRows(data?.globalAddons ?? []);
  }, [data?.globalAddons]);

  const save = async () => {
    if (!data) return;
    const cleaned = rows.filter((r) => r.name.trim().length > 0);
    try {
      await persistMenuPayload({ ...data, globalAddons: cleaned });
      await mutate();
      toast.success("Global add-ons saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const updateRow = (idx: number, patch: Partial<MenuAddon>) => {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: newAddonId(), name: "", price: 0 },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-2xl">Global add-ons</h2>
        <p className="text-muted-foreground text-sm">
          Shown on the customer customise sheet for every dish.
        </p>
      </div>
      <div className="space-y-4">
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search add-on name…"
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "name-asc", label: "Name (A–Z)" },
            { value: "name-desc", label: "Name (Z–A)" },
            { value: "price-desc", label: "Price (high–low)" },
            { value: "price-asc", label: "Price (low–high)" },
          ]}
          filteredCount={displayRows.length}
          totalCount={rows.length}
          showStatusFilter={false}
        />
        <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Price (₹)</TableHead>
              <TableHead className="w-24 text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "No add-ons yet. Add a row below."
                    : "No add-ons match your search."}
                </TableCell>
              </TableRow>
            ) : null}
            {displayRows.map((r) => {
              const idx = rows.findIndex((x) => x.id === r.id);
              return (
              <TableRow key={r.id}>
                <TableCell>
                  <Input
                    value={r.name}
                    onChange={(e) =>
                      updateRow(idx, { name: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={r.price || ""}
                    onChange={(e) =>
                      updateRow(idx, {
                        price: Number(e.target.value) || 0,
                      })
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            );
            })}
          </TableBody>
        </Table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addRow}>
            Add row
          </Button>
          <Button type="button" onClick={() => void save()}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
