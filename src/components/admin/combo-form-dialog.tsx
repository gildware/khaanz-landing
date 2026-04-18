"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SearchableDishSelect } from "@/components/admin/searchable-dish-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  computeComboRetailTotal,
  normalizeMenuCombos,
} from "@/lib/menu-combos";
import type { MenuCombo, MenuComboComponent, MenuItem } from "@/types/menu";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

const emptyCombo = (): MenuCombo => ({
  id: newId("combo"),
  name: "",
  description: "",
  image:
    "https://images.unsplash.com/photo-1513104890138-7c749354f784?w=800&q=80",
  price: 0,
  isVeg: true,
  available: true,
  components: [],
});

export interface ComboFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItem[];
  initial?: MenuCombo | null;
  onSave: (combo: MenuCombo) => void;
}

export function ComboFormDialog({
  open,
  onOpenChange,
  menuItems,
  initial,
  onSave,
}: ComboFormDialogProps) {
  const [combo, setCombo] = useState<MenuCombo>(() =>
    initial
      ? normalizeMenuCombos([structuredClone(initial)])[0]!
      : emptyCombo(),
  );

  useEffect(() => {
    if (open) {
      setCombo(
        initial
          ? normalizeMenuCombos([structuredClone(initial)])[0]!
          : emptyCombo(),
      );
    }
  }, [open, initial]);

  const itemsById = useMemo(
    () => new Map(menuItems.map((i) => [i.id, i])),
    [menuItems],
  );

  const actualTotal = useMemo(
    () => computeComboRetailTotal(combo, menuItems),
    [combo, menuItems],
  );

  const setComponent = (idx: number, patch: Partial<MenuComboComponent>) => {
    setCombo((prev) => {
      const components = [...prev.components];
      const cur = components[idx];
      if (!cur) return prev;
      components[idx] = { ...cur, ...patch };
      return { ...prev, components };
    });
  };

  const addComponent = () => {
    const first = menuItems[0];
    if (!first || first.variations.length === 0) return;
    setCombo((prev) => ({
      ...prev,
      components: [
        ...prev.components,
        {
          itemId: first.id,
          variationId: first.variations[0]!.id,
          quantity: 1,
        },
      ],
    }));
  };

  const removeComponent = (idx: number) => {
    setCombo((prev) => ({
      ...prev,
      components: prev.components.filter((_, i) => i !== idx),
    }));
  };

  const onFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") {
        setCombo((prev) => ({ ...prev, image: r }));
        toast.success("Image loaded");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!combo.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (combo.components.length === 0) {
      toast.error("Add at least one menu item to the combo");
      return;
    }
    for (const c of combo.components) {
      const item = itemsById.get(c.itemId);
      if (!item || !item.variations.some((v) => v.id === c.variationId)) {
        toast.error("Each row needs a valid dish and size/option");
        return;
      }
      const q = c.quantity;
      if (
        typeof q !== "number" ||
        !Number.isInteger(q) ||
        q < 1 ||
        q > 999
      ) {
        toast.error("Quantity must be a whole number from 1 to 999");
        return;
      }
    }
    if (!Number.isFinite(combo.price) || combo.price < 0) {
      toast.error("Enter a valid offer price");
      return;
    }
    onSave(combo);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit combo" : "New combo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={combo.name}
              onChange={(e) =>
                setCombo((p) => ({ ...p, name: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={combo.description}
              onChange={(e) =>
                setCombo((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={combo.isVeg}
                onCheckedChange={(v) =>
                  setCombo((p) => ({ ...p, isVeg: Boolean(v) }))
                }
              />
              <span className="text-sm">Vegetarian</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={combo.available !== false}
                onCheckedChange={(v) =>
                  setCombo((p) => ({ ...p, available: Boolean(v) }))
                }
              />
              <span className="text-sm">Available</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Image URL</Label>
            <Input
              value={combo.image}
              onChange={(e) =>
                setCombo((p) => ({ ...p, image: e.target.value }))
              }
            />
            <Input
              type="file"
              accept="image/*"
              className="cursor-pointer"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items in this combo</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addComponent}
                disabled={menuItems.length === 0}
              >
                Add item
              </Button>
            </div>
            {menuItems.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Create menu items first, then add them here.
              </p>
            )}
            {combo.components.map((row, idx) => {
              const item = itemsById.get(row.itemId);
              const variations = item?.variations ?? [];
              return (
                <div
                  key={`${row.itemId}-${idx}`}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Dish</Label>
                      <SearchableDishSelect
                        items={menuItems}
                        value={row.itemId}
                        onValueChange={(itemId) => {
                          const nextItem = itemsById.get(itemId);
                          const v0 = nextItem?.variations[0]?.id ?? row.variationId;
                          setComponent(idx, { itemId, variationId: v0 });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Size / option</Label>
                      <Select
                        value={row.variationId}
                        onValueChange={(variationId) => {
                          if (!variationId) return;
                          setComponent(idx, { variationId });
                        }}
                        disabled={!item}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Variation" />
                        </SelectTrigger>
                        <SelectContent>
                          {variations.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name} · ₹{v.price}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={row.quantity ?? 1}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          setComponent(
                            idx,
                            Number.isFinite(n)
                              ? { quantity: Math.min(999, Math.max(1, n)) }
                              : { quantity: 1 },
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeComponent(idx)}
                    >
                      Remove line
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Actual total (menu)</Label>
              <Input
                readOnly
                disabled
                value={
                  actualTotal > 0 ? `₹${actualTotal}` : "—"
                }
                className="bg-muted font-medium tabular-nums"
              />
              <p className="text-muted-foreground text-xs">
                Sum of component prices × qty (read-only).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Offer price (₹)</Label>
              <Input
                type="number"
                min={0}
                value={combo.price || ""}
                onChange={(e) =>
                  setCombo((p) => ({
                    ...p,
                    price: Number(e.target.value) || 0,
                  }))
                }
                className="font-semibold tabular-nums"
              />
              <p className="text-muted-foreground text-xs">
                What customers pay for this combo.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
