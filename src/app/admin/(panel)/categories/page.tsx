"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MENU_CATEGORY_DEFAULTS } from "@/data/menu";
import { useMenuData } from "@/contexts/menu-data-context";
import {
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
} from "@/lib/category-icons";
import { persistMenuPayload } from "@/lib/persist-menu-client";
import type { MenuCategoryDef } from "@/types/menu-category";

const FALLBACK_ICON = "utensils-crossed";

export default function AdminCategoriesPage() {
  const { data, mutate } = useMenuData();
  const [rows, setRows] = useState<MenuCategoryDef[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<MenuCategoryDef>({
    name: "",
    image: "",
    icon: FALLBACK_ICON,
  });

  const fallbackImage = useMemo(
    () => MENU_CATEGORY_DEFAULTS[0]?.image ?? "",
    [],
  );

  const presetByName = useMemo(() => {
    const m = new Map<string, MenuCategoryDef>();
    for (const p of MENU_CATEGORY_DEFAULTS) m.set(p.name.toLowerCase(), p);
    return m;
  }, []);

  const applyDefaults = useCallback(
    (cat: MenuCategoryDef): MenuCategoryDef => {
      const key = cat.name.trim().toLowerCase();
      const preset = key ? presetByName.get(key) : undefined;
      const icon =
        (cat.icon || preset?.icon || FALLBACK_ICON).trim() || FALLBACK_ICON;
      const image =
        (cat.image || preset?.image || fallbackImage).trim() ||
        preset?.image ||
        "";
      return { ...cat, name: cat.name.trim(), icon, image };
    },
    [fallbackImage, presetByName],
  );

  const normalizeList = useCallback(
    (list: MenuCategoryDef[]): MenuCategoryDef[] => list.map(applyDefaults),
    [applyDefaults],
  );

  useEffect(() => {
    setRows(data?.categories?.length ? normalizeList([...data.categories]) : []);
  }, [data?.categories, normalizeList]);

  const save = async () => {
    if (!data) return;
    try {
      await persistMenuPayload({ ...data, categories: normalizeList(rows) });
      await mutate();
      toast.success("Categories saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const openAdd = () => {
    setEditingIndex(null);
    setDraft(
      applyDefaults({
        name: "",
        image: "",
        icon: FALLBACK_ICON,
      }),
    );
    setDialogOpen(true);
  };

  const openEdit = (idx: number) => {
    const row = rows[idx];
    if (!row) return;
    setEditingIndex(idx);
    setDraft(applyDefaults(row));
    setDialogOpen(true);
  };

  const commitDraft = () => {
    const next = applyDefaults(draft);
    if (!next.name.trim()) {
      toast.error("Enter a name");
      return;
    }
    const nameKey = next.name.trim().toLowerCase();
    if (
      rows.some(
        (r, i) =>
          i !== editingIndex && r.name.trim().toLowerCase() === nameKey,
      )
    ) {
      toast.error("Category already exists");
      return;
    }

    setRows((prev) => {
      if (editingIndex === null) return [...prev, next];
      const copy = [...prev];
      copy[editingIndex] = next;
      return copy;
    });

    setDialogOpen(false);
    setEditingIndex(null);
    toast.success("Saved locally — click Save changes to persist");
  };

  const remove = (idx: number) => {
    if (!data) return;
    const row = rows[idx];
    if (!row) return;
    if (data.items.some((i) => i.category === row.name)) {
      toast.error("Remove or reassign items in this category first");
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Categories</h1>
        <p className="text-muted-foreground text-sm">
          Image and icon show on the customer menu tabs. Save after editing.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={openAdd}>
          Add category
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Icon</TableHead>
              <TableHead className="w-20">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28 text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={`${r.name}-${idx}`}>
                <TableCell>
                  <CategoryIcon
                    iconKey={r.icon || FALLBACK_ICON}
                    className="size-6 text-muted-foreground"
                  />
                </TableCell>
                <TableCell>
                  <div className="relative size-12 overflow-hidden rounded-md bg-muted">
                    {r.image?.trim() ? (
                      r.image.startsWith("http") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.image}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Image
                          src={r.image}
                          alt=""
                          width={48}
                          height={48}
                          className="size-full object-cover"
                        />
                      )
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                        —
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                      onClick={() => openEdit(idx)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(idx)}
                    >
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()}>
          Save changes
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingIndex === null ? "Add category" : "Edit category"}
            </DialogTitle>
            <DialogDescription>
              Every category needs an icon and image. Defaults are auto-filled,
              but you can override them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Pizza Zone"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr,200px]">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select
                  value={draft.icon || FALLBACK_ICON}
                  onValueChange={(v) =>
                    setDraft((p) => ({ ...p, icon: v ?? FALLBACK_ICON }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ICON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                  <CategoryIcon
                    iconKey={draft.icon || FALLBACK_ICON}
                    className="size-7 text-muted-foreground"
                  />
                  <div className="relative size-12 overflow-hidden rounded-md bg-muted">
                    {draft.image?.trim() ? (
                      draft.image.startsWith("http") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={draft.image}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Image
                          src={draft.image}
                          alt=""
                          width={48}
                          height={48}
                          className="size-full object-cover"
                        />
                      )
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                        —
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-image">Image URL (or `/public` path)</Label>
              <Input
                id="cat-image"
                value={draft.image}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, image: e.target.value }))
                }
                placeholder="https://… or /path"
                className="font-mono text-xs"
              />
              <p className="text-muted-foreground text-xs">
                Tip: leaving it blank will auto-pick a matching preset image (by
                name), otherwise the global fallback image.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={commitDraft}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
