"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DataTableToolbar,
  selectControlClassName,
} from "@/components/admin/data-table-toolbar";
import { ItemFormDialog } from "@/components/admin/item-form-dialog";
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
import { persistMenuPayload } from "@/lib/persist-menu-client";
import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuItem } from "@/types/menu";

const EMPTY_ITEMS: MenuItem[] = [];
const EMPTY_CATEGORIES: MenuCategoryDef[] = [];

function variationPriceBounds(item: MenuItem): { min: number; max: number } {
  const prices = item.variations.map((v) => v.price);
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function formatItemPrice(item: MenuItem): string {
  if (item.variations.length === 0) return "—";
  const { min, max } = variationPriceBounds(item);
  if (min === max) return `₹${min}`;
  return `₹${min} – ₹${max}`;
}

export function MenuCatalogItemsPanel() {
  const { data, mutate } = useMenuData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const categories = data?.categories ?? EMPTY_CATEGORIES;
  const items = data?.items ?? EMPTY_ITEMS;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "veg" | "nonveg">("all");
  const [filterAvailability, setFilterAvailability] = useState<
    "all" | "available" | "unavailable"
  >("all");
  const [sort, setSort] = useState("name-asc");

  const savePayload = async (next: NonNullable<typeof data>) => {
    await persistMenuPayload(next);
    await mutate();
  };

  useEffect(() => {
    const raw = searchParams.get("category");
    if (!raw?.trim()) {
      setFilterCategory("all");
      return;
    }
    let name: string;
    try {
      name = decodeURIComponent(raw.trim());
    } catch {
      setFilterCategory("all");
      return;
    }
    if (categories.length === 0) return;
    if (categories.some((c) => c.name === name)) {
      setFilterCategory(name);
      return;
    }
    setFilterCategory("all");
    const p = new URLSearchParams(searchParams.toString());
    p.delete("category");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, categories, router, pathname]);

  const setCategoryFilter = useCallback(
    (value: string) => {
      setFilterCategory(value);
      const p = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        p.delete("category");
      } else {
        p.set("category", value);
      }
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const filteredItems = useMemo(() => {
    let list = items;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        const hay = `${i.name} ${i.description ?? ""} ${i.category}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterCategory !== "all") {
      list = list.filter((i) => i.category === filterCategory);
    }
    if (filterType === "veg") list = list.filter((i) => i.isVeg);
    if (filterType === "nonveg") list = list.filter((i) => !i.isVeg);
    if (filterAvailability === "available") {
      list = list.filter((i) => i.available !== false);
    }
    if (filterAvailability === "unavailable") {
      list = list.filter((i) => i.available === false);
    }

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "category-asc":
          return (
            a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
          );
        case "price-desc": {
          const pa = variationPriceBounds(a).max;
          const pb = variationPriceBounds(b).max;
          return pb - pa || a.name.localeCompare(b.name);
        }
        case "price-asc": {
          const pa = variationPriceBounds(a).min;
          const pb = variationPriceBounds(b).min;
          return pa - pb || a.name.localeCompare(b.name);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [
    items,
    searchQuery,
    filterCategory,
    filterType,
    filterAvailability,
    sort,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold text-2xl">Menu items</h2>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          New item
        </Button>
      </div>

      <DataTableToolbar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Name, category, description…"
        sort={sort}
        onSortChange={setSort}
        sortOptions={[
          { value: "name-asc", label: "Name (A–Z)" },
          { value: "name-desc", label: "Name (Z–A)" },
          { value: "category-asc", label: "Category" },
          { value: "price-desc", label: "Price (high–low)" },
          { value: "price-asc", label: "Price (low–high)" },
        ]}
        filteredCount={filteredItems.length}
        totalCount={items.length}
        showStatusFilter={false}
      >
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Category</Label>
          <SearchableSelect
            triggerClassName={selectControlClassName}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: c.name, label: c.name })),
            ]}
            value={filterCategory}
            onValueChange={setCategoryFilter}
            placeholder="Category"
            searchPlaceholder="Search categories…"
          />
        </div>
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
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right tabular-nums">Price</TableHead>
              <TableHead>Available</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No menu items match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                      <MenuItemImage
                        src={item.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>
                    <Badge variant={item.isVeg ? "secondary" : "destructive"}>
                      {item.isVeg ? "Veg" : "Non-veg"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatItemPrice(item)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.available !== false}
                      onCheckedChange={(v) => {
                        if (!data) return;
                        void (async () => {
                          const nextItems = data.items.map((i) =>
                            i.id === item.id ? { ...i, available: Boolean(v) } : i,
                          );
                          try {
                            await savePayload({ ...data, items: nextItems });
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
                        setEditing(item);
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
                              items: data.items.filter((i) => i.id !== item.id),
                            });
                            toast.success("Item removed");
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ItemFormDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        initial={editing}
        onSave={(item) => {
          if (!data) return;
          void (async () => {
            try {
              const idx = data.items.findIndex((i) => i.id === item.id);
              const nextItems =
                idx === -1
                  ? [...data.items, item]
                  : data.items.map((i) => (i.id === item.id ? item : i));
              await savePayload({ ...data, items: nextItems });
              toast.success("Item saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Save failed");
            }
          })();
        }}
      />
    </div>
  );
}
