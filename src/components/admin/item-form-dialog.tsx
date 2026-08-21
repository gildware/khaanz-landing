"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CLOUDINARY_FOLDER_ITEMS } from "@/lib/cloudinary-folders";
import { MENU_ITEM_PLACEHOLDER_IMAGE } from "@/lib/menu-item-image";
import { uploadAdminImage } from "@/lib/upload-admin-image";
import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuAddon, MenuItem, MenuVariation } from "@/types/menu";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

const emptyItem = (categoryNames: string[]): MenuItem => ({
  id: newId("item"),
  name: "",
  category: categoryNames[0] ?? "Pizza Zone",
  description: "",
  image: MENU_ITEM_PLACEHOLDER_IMAGE,
  isVeg: true,
  variations: [{ id: newId("v"), name: "Regular", price: 99 }],
  addons: [],
  available: true,
  notForSale: false,
});

export interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MenuCategoryDef[];
  initial?: MenuItem | null;
  onSave: (item: MenuItem) => void;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  categories,
  initial,
  onSave,
}: ItemFormDialogProps) {
  const [item, setItem] = useState<MenuItem>(() =>
    initial
      ? structuredClone(initial)
      : emptyItem(categories.map((c) => c.name)),
  );
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setItem(
        initial
          ? structuredClone(initial)
          : emptyItem(categories.map((c) => c.name)),
      );
    }
  }, [open, initial, categories]);

  const setVariation = (idx: number, v: Partial<MenuVariation>) => {
    setItem((prev) => {
      const variations = [...prev.variations];
      const cur = variations[idx];
      if (!cur) return prev;
      variations[idx] = { ...cur, ...v };
      return { ...prev, variations };
    });
  };

  const addVariation = () => {
    setItem((prev) => ({
      ...prev,
      variations: [
        ...prev.variations,
        { id: newId("v"), name: "Option", price: 0 },
      ],
    }));
  };

  const removeVariation = (idx: number) => {
    setItem((prev) => ({
      ...prev,
      variations: prev.variations.filter((_, i) => i !== idx),
    }));
  };

  const setAddon = (idx: number, a: Partial<MenuAddon>) => {
    setItem((prev) => {
      const addons = [...prev.addons];
      const cur = addons[idx];
      if (!cur) return prev;
      addons[idx] = { ...cur, ...a };
      return { ...prev, addons };
    });
  };

  const addAddon = () => {
    setItem((prev) => ({
      ...prev,
      addons: [...prev.addons, { id: newId("a"), name: "", price: 0 }],
    }));
  };

  const removeAddon = (idx: number) => {
    setItem((prev) => ({
      ...prev,
      addons: prev.addons.filter((_, i) => i !== idx),
    }));
  };

  const categoryNotForSale = categories.some(
    (c) => c.name === item.category && c.notForSale === true,
  );

  const onFile = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const url = await uploadAdminImage({
        file,
        folder: CLOUDINARY_FOLDER_ITEMS,
        publicId: item.id,
      });
      setItem((prev) => ({ ...prev, image: url }));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!item.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (item.variations.length === 0) {
      toast.error("Add at least one variation");
      return;
    }
    onSave(item);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={item.name}
              onChange={(e) =>
                setItem((p) => ({ ...p, name: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={item.category}
              onValueChange={(v) =>
                setItem((p) => ({ ...p, category: v ?? p.category }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={item.description}
              onChange={(e) =>
                setItem((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={item.isVeg}
                onCheckedChange={(v) =>
                  setItem((p) => ({ ...p, isVeg: Boolean(v) }))
                }
              />
              <span className="text-sm">Vegetarian</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={item.available !== false}
                onCheckedChange={(v) =>
                  setItem((p) => ({ ...p, available: Boolean(v) }))
                }
              />
              <span className="text-sm">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={item.notForSale === true || categoryNotForSale}
                disabled={categoryNotForSale}
                onCheckedChange={(v) =>
                  setItem((p) => ({ ...p, notForSale: Boolean(v) }))
                }
              />
              <span className="text-sm">Not for sale</span>
            </div>
          </div>
          {categoryNotForSale ? (
            <p className="text-muted-foreground text-xs">
              This category is not for sale — all items in it are excluded from
              ordering.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label>Photo</Label>
            <Input
              value={item.image.startsWith("data:") ? "" : item.image}
              onChange={(e) =>
                setItem((p) => ({ ...p, image: e.target.value }))
              }
              placeholder="Cloudinary URL"
            />
            <Input
              type="file"
              accept="image/*"
              className="cursor-pointer"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                void onFile(f);
                e.target.value = "";
              }}
            />
            {uploading ? (
              <p className="text-muted-foreground text-xs">Uploading…</p>
            ) : null}
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Variations</Label>
              <Button type="button" size="sm" variant="outline" onClick={addVariation}>
                Add
              </Button>
            </div>
            {item.variations.map((v, i) => (
              <div key={v.id} className="flex flex-wrap gap-2">
                <Input
                  placeholder="Name"
                  value={v.name}
                  onChange={(e) =>
                    setVariation(i, { name: e.target.value })
                  }
                  className="min-w-[120px] flex-1"
                />
                <Input
                  type="number"
                  placeholder="₹"
                  value={v.price || ""}
                  onChange={(e) =>
                    setVariation(i, {
                      price: Number(e.target.value) || 0,
                    })
                  }
                  className="w-24"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeVariation(i)}
                  disabled={item.variations.length <= 1}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Item-specific add-ons</Label>
              <Button type="button" size="sm" variant="outline" onClick={addAddon}>
                Add
              </Button>
            </div>
            {item.addons.map((a, i) => (
              <div key={a.id} className="flex flex-wrap gap-2">
                <Input
                  placeholder="Name"
                  value={a.name}
                  onChange={(e) => setAddon(i, { name: e.target.value })}
                  className="min-w-[120px] flex-1"
                />
                <Input
                  type="number"
                  placeholder="₹"
                  value={a.price || ""}
                  onChange={(e) =>
                    setAddon(i, { price: Number(e.target.value) || 0 })
                  }
                  className="w-24"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAddon(i)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={uploading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
