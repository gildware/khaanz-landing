"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
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
import { MENU_CATEGORY_DEFAULTS } from "@/data/menu";
import { useMenuData } from "@/contexts/menu-data-context";
import {
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
} from "@/lib/category-icons";
import { persistMenuPayload } from "@/lib/persist-menu-client";
import { cn } from "@/lib/utils";
import type { MenuCategoryDef } from "@/types/menu-category";

const FALLBACK_ICON = "utensils-crossed";

function CategoryCardImageArea(props: { image: string; iconKey: string }) {
  const { image, iconKey } = props;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [image]);

  const trimmed = image.trim();
  const showIcon = !trimmed || broken;

  const iconPlaceholder = (
    <div className="absolute inset-0 flex items-center justify-center bg-muted">
      <CategoryIcon
        iconKey={iconKey || FALLBACK_ICON}
        className="size-14 shrink-0 text-muted-foreground/85 sm:size-16"
      />
    </div>
  );

  if (showIcon) {
    return (
      <div className="relative aspect-[4/3] w-full shrink-0 bg-muted">
        {iconPlaceholder}
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] w-full shrink-0 bg-muted">
      {trimmed.startsWith("http") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmed}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <Image
          src={trimmed}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

type BuildCategoryRowsResult =
  | { ok: true; nextRows: MenuCategoryDef[] }
  | { ok: false; reason: "empty" | "duplicate" };

function buildCategoryRowsFromDraft(
  d: MenuCategoryDef,
  editIdx: number | null,
  currentRows: MenuCategoryDef[],
  applyDefaults: (c: MenuCategoryDef) => MenuCategoryDef,
): BuildCategoryRowsResult {
  const next = applyDefaults(d);
  if (!next.name.trim()) return { ok: false, reason: "empty" };
  const nameKey = next.name.trim().toLowerCase();
  if (
    currentRows.some(
      (r, i) =>
        i !== editIdx && r.name.trim().toLowerCase() === nameKey,
    )
  ) {
    return { ok: false, reason: "duplicate" };
  }
  const nextRows =
    editIdx === null
      ? [...currentRows, next]
      : currentRows.map((r, i) => (i === editIdx ? next : r));
  return { ok: true, nextRows };
}

export function MenuCatalogCategoriesPanel() {
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

  const persistCategoriesRows = useCallback(
    async (nextRows: MenuCategoryDef[]) => {
      if (!data) return;
      try {
        await persistMenuPayload({
          ...data,
          categories: normalizeList(nextRows),
        });
        await mutate();
        toast.success("Categories saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
        await mutate();
      }
    },
    [data, mutate, normalizeList],
  );

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

  const cancelCategoryDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingIndex(null);
  }, []);

  const saveCategoryDialog = useCallback(() => {
    const built = buildCategoryRowsFromDraft(
      draft,
      editingIndex,
      rows,
      applyDefaults,
    );
    if (!built.ok) {
      if (built.reason === "empty") {
        toast.error("Enter a name");
      } else {
        toast.error("Category already exists");
      }
      return;
    }
    setRows(built.nextRows);
    setDialogOpen(false);
    setEditingIndex(null);
    void persistCategoriesRows(built.nextRows);
  }, [draft, editingIndex, rows, applyDefaults, persistCategoriesRows]);

  const remove = (idx: number) => {
    if (!data) return;
    const row = rows[idx];
    if (!row) return;
    if (data.items.some((i) => i.category === row.name)) {
      toast.error("Remove or reassign items in this category first");
      return;
    }
    const nextRows = rows.filter((_, i) => i !== idx);
    setRows(nextRows);
    void persistCategoriesRows(nextRows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-2xl">Categories</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button type="button" onClick={openAdd}>
            Add category
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {rows.map((r, idx) => (
          <Card
            key={`${r.name}-${idx}`}
            size="sm"
            className="gap-0 overflow-hidden py-0 data-[size=sm]:gap-0 data-[size=sm]:py-0 shadow-sm ring-border transition-shadow hover:shadow-md"
          >
            <CategoryCardImageArea
              image={r.image ?? ""}
              iconKey={r.icon || FALLBACK_ICON}
            />
            <CardContent className="flex flex-row items-center gap-2.5 border-t border-border/80 px-3 py-2.5">
              <CategoryIcon
                iconKey={r.icon || FALLBACK_ICON}
                className="size-6 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 font-medium text-sm leading-snug">
                {r.name}
              </span>
            </CardContent>
            <CardFooter className="flex flex-col gap-1.5 border-border/80 bg-muted/40 p-2">
              <Link
                href={`/admin/menu?tab=items&category=${encodeURIComponent(r.name)}`}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "h-8 w-full justify-center text-xs",
                )}
              >
                View items
              </Link>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => openEdit(idx)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => remove(idx)}
                >
                  Remove
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingIndex === null ? "Add category" : "Edit category"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Add or edit a category. Use Save changes to persist, or Cancel to
              discard.
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
              onClick={cancelCategoryDialog}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveCategoryDialog}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
