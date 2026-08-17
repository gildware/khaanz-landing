"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { MenuItemImage } from "@/components/MenuItemImage";
import { Button } from "@/components/ui/button";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { useMenuData } from "@/contexts/menu-data-context";
import { CategoryIcon } from "@/lib/category-icons";
import { persistMenuLayout } from "@/lib/persist-menu-client";
import { cn } from "@/lib/utils";
import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuCombo, MenuItem } from "@/types/menu";

const FALLBACK_ICON = "utensils-crossed";

function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr;
  }
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

function itemIsVisible(item: MenuItem): boolean {
  return item.available !== false;
}

function categoryIsVisible(cat: MenuCategoryDef): boolean {
  return cat.available !== false;
}

export function HomeLayoutManager() {
  const { data, isLoading, mutate } = useMenuData();

  const [cats, setCats] = useState<MenuCategoryDef[]>([]);
  const [groups, setGroups] = useState<Record<string, MenuItem[]>>({});
  const [orphans, setOrphans] = useState<MenuItem[]>([]);
  const [combos, setCombos] = useState<MenuCombo[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [recOpen, setRecOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const dragCat = useRef<number | null>(null);
  const dragItem = useRef<{ cat: string; index: number } | null>(null);
  const dragRecItem = useRef<number | null>(null);
  const dragRecCombo = useRef<number | null>(null);

  // Sync local working copy from the menu payload. Skip while there are
  // unsaved edits so a background SWR refresh can't clobber them.
  useEffect(() => {
    if (!data || dirty) return;
    const nextCats = [...(data.categories ?? [])];
    const names = new Set(nextCats.map((c) => c.name));
    const nextGroups: Record<string, MenuItem[]> = {};
    for (const c of nextCats) nextGroups[c.name] = [];
    const nextOrphans: MenuItem[] = [];
    for (const item of data.items ?? []) {
      if (names.has(item.category)) nextGroups[item.category]!.push(item);
      else nextOrphans.push(item);
    }
    setCats(nextCats);
    setGroups(nextGroups);
    setOrphans(nextOrphans);
    setCombos([...(data.combos ?? [])]);
  }, [data, dirty]);

  const allItems = useMemo(
    () => [...Object.values(groups).flat(), ...orphans],
    [groups, orphans],
  );

  const recommendedItemsList = useMemo(
    () =>
      allItems
        .filter((i) => i.recommended)
        .sort(
          (a, b) =>
            (a.recommendedSortOrder ?? 0) - (b.recommendedSortOrder ?? 0),
        ),
    [allItems],
  );
  const recommendedCombosList = useMemo(
    () =>
      combos
        .filter((c) => c.recommended)
        .sort(
          (a, b) =>
            (a.recommendedSortOrder ?? 0) - (b.recommendedSortOrder ?? 0),
        ),
    [combos],
  );
  const recommendedCount =
    recommendedItemsList.length + recommendedCombosList.length;

  // Options for the "add recommended" dropdowns — only entries not yet picked.
  const recItemOptions = useMemo<SearchableSelectOption[]>(
    () =>
      allItems
        .filter((i) => !i.recommended)
        .map((i) => ({ value: i.id, label: i.name })),
    [allItems],
  );
  const recComboOptions = useMemo<SearchableSelectOption[]>(
    () =>
      combos
        .filter((c) => !c.recommended)
        .map((c) => ({ value: c.id, label: c.name })),
    [combos],
  );

  const totalHidden = useMemo(() => {
    let n = 0;
    for (const cat of cats) if (!categoryIsVisible(cat)) n += 1;
    for (const list of Object.values(groups)) {
      for (const it of list) if (!itemIsVisible(it)) n += 1;
    }
    return n;
  }, [cats, groups]);

  const moveCategory = (from: number, to: number) => {
    setCats((prev) => moveInArray(prev, from, to));
    setDirty(true);
  };

  const moveItem = (cat: string, from: number, to: number) => {
    setGroups((prev) => ({
      ...prev,
      [cat]: moveInArray(prev[cat] ?? [], from, to),
    }));
    setDirty(true);
  };

  const setItemVisible = (cat: string, id: string, visible: boolean) => {
    setGroups((prev) => ({
      ...prev,
      [cat]: (prev[cat] ?? []).map((i) =>
        i.id === id ? { ...i, available: visible } : i,
      ),
    }));
    setDirty(true);
  };

  const setCategoryVisible = (name: string, visible: boolean) => {
    setCats((prev) =>
      prev.map((c) =>
        c.name === name ? { ...c, available: visible } : c,
      ),
    );
    setDirty(true);
  };

  const patchItem = (id: string, patch: Partial<MenuItem>) => {
    setGroups((prev) => {
      const next: Record<string, MenuItem[]> = {};
      for (const [cat, list] of Object.entries(prev)) {
        next[cat] = list.map((i) => (i.id === id ? { ...i, ...patch } : i));
      }
      return next;
    });
    setOrphans((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  };

  const setItemRecommended = (id: string, recommended: boolean) => {
    const nextOrder = recommended
      ? Math.max(
          -1,
          ...recommendedItemsList.map((i) => i.recommendedSortOrder ?? 0),
        ) + 1
      : 0;
    patchItem(id, { recommended, recommendedSortOrder: nextOrder });
    setDirty(true);
  };

  const setComboRecommended = (id: string, recommended: boolean) => {
    const nextOrder = recommended
      ? Math.max(
          -1,
          ...recommendedCombosList.map((c) => c.recommendedSortOrder ?? 0),
        ) + 1
      : 0;
    setCombos((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, recommended, recommendedSortOrder: nextOrder }
          : c,
      ),
    );
    setDirty(true);
  };

  const moveRecommendedItem = (from: number, to: number) => {
    const ids = recommendedItemsList.map((i) => i.id);
    const nextIds = moveInArray(ids, from, to);
    if (nextIds === ids) return;
    const order = new Map(nextIds.map((id, i) => [id, i]));
    setGroups((prev) => {
      const next: Record<string, MenuItem[]> = {};
      for (const [cat, list] of Object.entries(prev)) {
        next[cat] = list.map((i) =>
          order.has(i.id)
            ? { ...i, recommendedSortOrder: order.get(i.id)! }
            : i,
        );
      }
      return next;
    });
    setOrphans((prev) =>
      prev.map((i) =>
        order.has(i.id)
          ? { ...i, recommendedSortOrder: order.get(i.id)! }
          : i,
      ),
    );
    setDirty(true);
  };

  const moveRecommendedCombo = (from: number, to: number) => {
    const ids = recommendedCombosList.map((c) => c.id);
    const nextIds = moveInArray(ids, from, to);
    if (nextIds === ids) return;
    const order = new Map(nextIds.map((id, i) => [id, i]));
    setCombos((prev) =>
      prev.map((c) =>
        order.has(c.id)
          ? { ...c, recommendedSortOrder: order.get(c.id)! }
          : c,
      ),
    );
    setDirty(true);
  };

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const discard = () => {
    setDirty(false);
    toast.message("Changes discarded");
  };

  const save = async () => {
    if (!dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const ordered: MenuItem[] = [];
    for (const c of cats) {
      for (const it of groups[c.name] ?? []) ordered.push(it);
    }
    for (const it of orphans) ordered.push(it);
    try {
      const recItemOrder = new Map(
        recommendedItemsList.map((it, i) => [it.id, i]),
      );
      const recComboOrder = new Map(
        recommendedCombosList.map((c, i) => [c.id, i]),
      );
      await persistMenuLayout({
        categories: cats.map((c) => ({
          name: c.name,
          available: categoryIsVisible(c),
        })),
        items: ordered.map((it) => ({
          id: it.id,
          available: itemIsVisible(it),
          recommended: Boolean(it.recommended),
          recommendedSortOrder: recItemOrder.get(it.id) ?? 0,
        })),
        combos: combos.map((c) => ({
          id: c.id,
          recommended: Boolean(c.recommended),
          recommendedSortOrder: recComboOrder.get(c.id) ?? 0,
        })),
      });
      if (data) {
        await mutate(
          {
            ...data,
            categories: cats,
            items: ordered,
            combos,
          },
          { revalidate: false },
        );
      }
      setDirty(false);
      toast.success("Home layout saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="text-muted-foreground text-sm">Loading menu…</div>
    );
  }

  if (cats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <p className="font-medium text-muted-foreground">No categories yet.</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Add categories in the Menu catalogue first, then arrange them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <p className="text-muted-foreground text-sm">
          {dirty ? (
            <span className="font-medium text-foreground">
              You have unsaved changes
            </span>
          ) : (
            <>
              Drag to reorder. {totalHidden > 0 ? `${totalHidden} hidden from the website.` : "All categories and items visible."}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={discard}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || saving}
            aria-busy={saving}
            title={
              saving
                ? "Saving…"
                : dirty
                  ? "Save layout"
                  : "Make a change to save"
            }
          >
            {saving ? (
              <>
                <Loader2Icon className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save layout"
            )}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setRecOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-3 text-left"
        >
          <SparklesIcon className="size-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Recommended</p>
            <p className="text-muted-foreground text-xs">
              Featured on the home page. Pick dishes and combos, then drag to
              set their order.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
            {recommendedCount} selected
          </span>
          {recOpen ? (
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {recOpen ? (
          <div className="space-y-5 border-t border-border/70 bg-muted/20 p-2 sm:p-3">
            <div className="space-y-2">
              <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Recommended dishes
              </p>
              <SearchableSelect
                options={recItemOptions}
                value=""
                onValueChange={(id) => setItemRecommended(id, true)}
                placeholder="Add a dish…"
                searchPlaceholder="Search dishes…"
                emptyMessage="No more dishes to add"
              />
              {recommendedItemsList.length === 0 ? (
                <p className="px-1 py-1 text-muted-foreground text-sm">
                  No recommended dishes yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {recommendedItemsList.map((item, i) => (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={() => {
                        dragRecItem.current = i;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const from = dragRecItem.current;
                        if (from === null || from === i) return;
                        moveRecommendedItem(from, i);
                        dragRecItem.current = i;
                      }}
                      onDragEnd={() => {
                        dragRecItem.current = null;
                      }}
                      className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 active:cursor-grabbing"
                    >
                      <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/70" />
                      <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                        <MenuItemImage
                          src={item.image}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${item.name} up`}
                          disabled={i === 0}
                          onClick={() => moveRecommendedItem(i, i - 1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${item.name} down`}
                          disabled={i === recommendedItemsList.length - 1}
                          onClick={() => moveRecommendedItem(i, i + 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${item.name} from recommended`}
                          onClick={() => setItemRecommended(item.id, false)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Recommended combos
              </p>
              <SearchableSelect
                options={recComboOptions}
                value=""
                onValueChange={(id) => setComboRecommended(id, true)}
                placeholder="Add a combo…"
                searchPlaceholder="Search combos…"
                emptyMessage="No more combos to add"
              />
              {recommendedCombosList.length === 0 ? (
                <p className="px-1 py-1 text-muted-foreground text-sm">
                  No recommended combos yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {recommendedCombosList.map((combo, i) => (
                    <li
                      key={combo.id}
                      draggable
                      onDragStart={() => {
                        dragRecCombo.current = i;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const from = dragRecCombo.current;
                        if (from === null || from === i) return;
                        moveRecommendedCombo(from, i);
                        dragRecCombo.current = i;
                      }}
                      onDragEnd={() => {
                        dragRecCombo.current = null;
                      }}
                      className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 active:cursor-grabbing"
                    >
                      <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/70" />
                      <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                        <MenuItemImage
                          src={combo.image}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {combo.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${combo.name} up`}
                          disabled={i === 0}
                          onClick={() => moveRecommendedCombo(i, i - 1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${combo.name} down`}
                          disabled={i === recommendedCombosList.length - 1}
                          onClick={() => moveRecommendedCombo(i, i + 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${combo.name} from recommended`}
                          onClick={() => setComboRecommended(combo.id, false)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <ul className="space-y-2">
        {cats.map((cat, idx) => {
          const list = groups[cat.name] ?? [];
          const isOpen = expanded[cat.name] ?? false;
          const catVisible = categoryIsVisible(cat);
          const hiddenInCat = list.filter((i) => !itemIsVisible(i)).length;
          return (
            <li
              key={cat.name}
              className={cn(
                "overflow-hidden rounded-xl border border-border bg-card",
                !catVisible && "opacity-70",
              )}
            >
              <div
                draggable
                onDragStart={() => {
                  dragCat.current = idx;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const from = dragCat.current;
                  if (from === null || from === idx) return;
                  moveCategory(from, idx);
                  dragCat.current = idx;
                }}
                onDragEnd={() => {
                  dragCat.current = null;
                }}
                className="flex flex-wrap cursor-grab items-center gap-2 px-2 py-2.5 active:cursor-grabbing sm:px-3"
              >
                <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/70" />
                <CategoryIcon
                  iconKey={cat.icon || FALLBACK_ICON}
                  className="size-5 shrink-0 text-primary"
                />
                <button
                  type="button"
                  onClick={() => toggleExpanded(cat.name)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="truncate font-medium">{cat.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {list.length} item{list.length === 1 ? "" : "s"}
                    {!catVisible
                      ? " · hidden on website"
                      : hiddenInCat > 0
                        ? ` · ${hiddenInCat} hidden`
                        : ""}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move category up"
                    disabled={idx === 0}
                    onClick={() => moveCategory(idx, idx - 1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move category down"
                    disabled={idx === cats.length - 1}
                    onClick={() => moveCategory(idx, idx + 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <label
                    className="ml-1 flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1"
                    onPointerDown={(e) => e.stopPropagation()}
                    title={
                      catVisible
                        ? "Visible on website"
                        : "Hidden from website"
                    }
                  >
                    {catVisible ? (
                      <EyeIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <EyeOffIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                      Website
                    </span>
                    <Switch
                      checked={catVisible}
                      onCheckedChange={(v) =>
                        setCategoryVisible(cat.name, Boolean(v))
                      }
                      aria-label={
                        catVisible
                          ? "Hide category from website"
                          : "Show category on website"
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    onClick={() => toggleExpanded(cat.name)}
                  >
                    {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </Button>
                </div>
              </div>

              {isOpen ? (
                <div className="border-t border-border/70 bg-muted/20 p-2 sm:p-3">
                  {list.length === 0 ? (
                    <p className="px-2 py-3 text-muted-foreground text-sm">
                      No items in this category.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((item, i) => {
                        const visible = itemIsVisible(item);
                        return (
                          <li
                            key={item.id}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              dragItem.current = { cat: cat.name, index: i };
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const d = dragItem.current;
                              if (!d || d.cat !== cat.name || d.index === i) {
                                return;
                              }
                              moveItem(cat.name, d.index, i);
                              dragItem.current = { cat: cat.name, index: i };
                            }}
                            onDragEnd={() => {
                              dragItem.current = null;
                            }}
                            className={cn(
                              "flex cursor-grab items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 active:cursor-grabbing",
                              !visible && "opacity-60",
                            )}
                          >
                            <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/70" />
                            <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                              <MenuItemImage
                                src={item.image}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="36px"
                              />
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {item.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Move item up"
                                disabled={i === 0}
                                onClick={() => moveItem(cat.name, i, i - 1)}
                              >
                                <ArrowUpIcon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Move item down"
                                disabled={i === list.length - 1}
                                onClick={() => moveItem(cat.name, i, i + 1)}
                              >
                                <ArrowDownIcon />
                              </Button>
                              <span
                                className="ml-1 text-muted-foreground"
                                title={visible ? "Visible" : "Hidden"}
                              >
                                {visible ? (
                                  <EyeIcon className="size-4" />
                                ) : (
                                  <EyeOffIcon className="size-4" />
                                )}
                              </span>
                              <Switch
                                checked={visible}
                                onCheckedChange={(v) =>
                                  setItemVisible(cat.name, item.id, Boolean(v))
                                }
                                aria-label={
                                  visible ? "Hide item" : "Show item"
                                }
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {orphans.length > 0 ? (
        <p className="px-1 text-muted-foreground text-xs">
          {orphans.length} item{orphans.length === 1 ? "" : "s"} without a
          matching category are kept at the end of the menu.
        </p>
      ) : null}
    </div>
  );
}
