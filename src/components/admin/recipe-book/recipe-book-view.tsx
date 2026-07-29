"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { RecipeSheetPage } from "@/components/admin/recipe-book/recipe-sheet-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { recipesForCategory, type RecipeExportBook } from "@/lib/inventory/recipe-export-types";
import type { RecipeExportSheet } from "@/lib/inventory/recipe-export-types";
import { printHtmlElement } from "@/lib/print-html-element";
import { cn } from "@/lib/utils";

import styles from "./recipe-book.module.css";

async function fetchRecipeBook(): Promise<RecipeExportBook> {
  const res = await fetch("/api/admin/inventory/recipes/book", {
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load recipes");
  }
  return res.json() as Promise<RecipeExportBook>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function RecipeBookView() {
  const [book, setBook] = useState<RecipeExportBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryId, setCategoryId] = useState("all");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchRecipeBook();
        if (!cancelled) setBook(data);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load recipes");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!book) return [{ value: "all", label: "All categories" }];
    return [
      { value: "all", label: `All categories (${book.totalRecipes})` },
      ...book.categories.map((c) => ({
        value: c.id,
        label: `${c.name} (${c.recipes.length})`,
      })),
    ];
  }, [book]);

  const visibleRecipes = useMemo<RecipeExportSheet[]>(() => {
    if (!book) return [];
    return recipesForCategory(book, categoryId);
  }, [book, categoryId]);

  const selectedCategoryName = useMemo(() => {
    if (categoryId === "all") return "All categories";
    return book?.categories.find((c) => c.id === categoryId)?.name ?? "Category";
  }, [book, categoryId]);

  const downloadPdf = useCallback(() => {
    if (visibleRecipes.length === 0) {
      toast.error("No recipes to export in this category");
      return;
    }
    const printRoot = document.getElementById("recipe-book-print-root");
    if (!printRoot) {
      toast.error("Recipe preview not ready — try again");
      return;
    }
    setPrinting(true);
    const suffix = categoryId === "all" ? "all-recipes" : slugify(selectedCategoryName);
    const title = `khaanz-recipes-${suffix}`;
    try {
      printHtmlElement(printRoot, title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open print dialog");
    } finally {
      window.setTimeout(() => setPrinting(false), 800);
    }
  }, [visibleRecipes.length, categoryId, selectedCategoryName]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" aria-hidden />
        Loading recipe book…
      </div>
    );
  }

  if (!book || book.totalRecipes === 0) {
    return (
      <div className={styles.emptyState}>
        <BookOpenIcon className="size-10 text-muted-foreground" aria-hidden />
        <p className="font-medium">No recipes yet</p>
        <p className="text-muted-foreground text-sm">
          Add recipes under Inventory → Recipes, then return here to view and export.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(styles.pageShell, "recipe-book-page-shell")}>
      <div className={cn(styles.toolbar, styles.noPrint, "recipe-book-toolbar")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-semibold text-2xl">Recipe book</h1>
            <p className="text-muted-foreground text-sm">
              Browse recipes by menu category. Each dish prints on its own A4 page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {book.totalRecipes} recipes
            </Badge>
            <Button
              type="button"
              onClick={downloadPdf}
              disabled={visibleRecipes.length === 0 || printing}
            >
              <DownloadIcon className="mr-2 size-4" aria-hidden />
              Download PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[minmax(0,16rem)_1fr]">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Category</Label>
            <SearchableSelect
              options={categoryOptions}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Select category…"
              searchPlaceholder="Search categories…"
            />
          </div>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <p className="font-medium">{selectedCategoryName}</p>
            <p className="text-muted-foreground">
              Showing {visibleRecipes.length} recipe
              {visibleRecipes.length === 1 ? "" : "s"} · exported{" "}
              {book.exportedAtLabel}
            </p>
          </div>
        </div>
      </div>

      <div className={cn(styles.previewScroll, "recipe-book-preview-scroll")}>
        {visibleRecipes.length === 0 ? (
          <div className={styles.emptyStateInScroll}>
            <p className="font-medium">No recipes in this category</p>
            <p className="text-muted-foreground text-sm">
              Pick another category or add recipes for dishes in this group.
            </p>
          </div>
        ) : (
          <div
            className={cn(styles.printRoot, "recipe-book-print-root")}
            id="recipe-book-print-root"
          >
            {visibleRecipes.map((recipe, index) => (
              <div key={recipe.id} className={cn(styles.previewScale, "recipe-book-preview-page")}>
                <RecipeSheetPage
                  recipe={recipe}
                  exportedAtLabel={book.exportedAtLabel}
                  pageNum={index + 1}
                  totalPages={visibleRecipes.length}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
