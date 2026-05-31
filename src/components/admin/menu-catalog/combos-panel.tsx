"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DataTableToolbar,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import { ComboFormDialog } from "@/components/admin/combo-form-dialog";
import { MenuItemImage } from "@/components/MenuItemImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMenuData } from "@/contexts/menu-data-context";
import {
  computeComboRetailTotal,
  formatComboComponentSummary,
} from "@/lib/menu-combos";
import { persistMenuPayload } from "@/lib/persist-menu-client";
import type { MenuCombo } from "@/types/menu";

export function MenuCatalogCombosPanel() {
  const { data, mutate } = useMenuData();
  const items = data?.items ?? [];
  const combos = data?.combos ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuCombo | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "veg" | "nonveg">("all");
  const [filterAvailability, setFilterAvailability] = useState<
    "all" | "available" | "unavailable"
  >("all");
  const [sort, setSort] = useState("name-asc");

  const filteredCombos = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = combos.filter((c) => {
      if (filterType === "veg" && !c.isVeg) return false;
      if (filterType === "nonveg" && c.isVeg) return false;
      if (filterAvailability === "available" && c.available === false) return false;
      if (filterAvailability === "unavailable" && c.available !== false) return false;
      if (!q) return true;
      const hay = `${c.name} ${formatComboComponentSummary(c, items)}`.toLowerCase();
      return hay.includes(q);
    });
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
  }, [combos, items, search, filterType, filterAvailability, sort]);

  const savePayload = async (next: NonNullable<typeof data>) => {
    await persistMenuPayload(next);
    await mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-2xl">Combos</h2>
          <p className="text-muted-foreground text-sm">
            Bundle existing menu items and set one price for the pack.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          New combo
        </Button>
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search combo name, items…"
        sort={sort}
        onSortChange={setSort}
        sortOptions={[
          { value: "name-asc", label: "Name (A–Z)" },
          { value: "name-desc", label: "Name (Z–A)" },
          { value: "price-desc", label: "Offer price (high–low)" },
          { value: "price-asc", label: "Offer price (low–high)" },
        ]}
        filteredCount={filteredCombos.length}
        totalCount={combos.length}
        showStatusFilter={false}
      >
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Type</Label>
          <SearchableSelect
            triggerClassName={selectControlClassName}
            options={[
              { value: "all", label: "All types" },
              { value: "veg", label: "Veg" },
              { value: "nonveg", label: "Non-veg" },
            ]}
            value={filterType}
            onValueChange={(v) =>
              setFilterType((v as "all" | "veg" | "nonveg") ?? "all")
            }
            placeholder="Type"
            searchPlaceholder="Search…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Availability</Label>
          <SearchableSelect
            triggerClassName={selectControlClassName}
            options={[
              { value: "all", label: "All" },
              { value: "available", label: "Available" },
              { value: "unavailable", label: "Unavailable" },
            ]}
            value={filterAvailability}
            onValueChange={(v) =>
              setFilterAvailability(
                (v as "all" | "available" | "unavailable") ?? "all",
              )
            }
            placeholder="Availability"
            searchPlaceholder="Search…"
          />
        </div>
      </DataTableToolbar>

      <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16"> </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Includes</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Offer</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Available</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                No combos yet.
              </TableCell>
            </TableRow>
          ) : filteredCombos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                No combos match your search or filters.
              </TableCell>
            </TableRow>
          ) : (
          filteredCombos.map((combo) => (
            <TableRow key={combo.id}>
              <TableCell>
                <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                  <MenuItemImage
                    src={combo.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              </TableCell>
              <TableCell className="font-medium">{combo.name}</TableCell>
              <TableCell className="max-w-[240px] text-muted-foreground text-sm">
                {formatComboComponentSummary(combo, items)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                ₹{computeComboRetailTotal(combo, items)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                ₹{combo.price}
              </TableCell>
              <TableCell>
                <Badge variant={combo.isVeg ? "secondary" : "destructive"}>
                  {combo.isVeg ? "Veg" : "Non-veg"}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={combo.available !== false}
                  onCheckedChange={(v) => {
                    if (!data) return;
                    void (async () => {
                      const nextCombos = data.combos.map((c) =>
                        c.id === combo.id ? { ...c, available: Boolean(v) } : c,
                      );
                      try {
                        await savePayload({ ...data, combos: nextCombos });
                        toast.success("Updated");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Save failed",
                        );
                      }
                    })();
                  }}
                />
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(combo);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    if (!data) return;
                    void (async () => {
                      try {
                        await savePayload({
                          ...data,
                          combos: data.combos.filter((c) => c.id !== combo.id),
                        });
                        toast.success("Combo removed");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Save failed",
                        );
                      }
                    })();
                  }}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          )))}
        </TableBody>
      </Table>
      </div>

      <ComboFormDialog
        open={open}
        onOpenChange={setOpen}
        menuItems={items}
        initial={editing}
        onSave={(combo) => {
          if (!data) return;
          void (async () => {
            try {
              const idx = data.combos.findIndex((c) => c.id === combo.id);
              const nextCombos =
                idx === -1
                  ? [...data.combos, combo]
                  : data.combos.map((c) => (c.id === combo.id ? combo : c));
              await savePayload({ ...data, combos: nextCombos });
              toast.success("Combo saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Save failed");
            }
          })();
        }}
      />
    </div>
  );
}
