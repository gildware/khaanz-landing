"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ItemCustomizeSheet } from "@/components/ItemCustomizeSheet";
import { useMenuData } from "@/contexts/menu-data-context";
import { useMenuExplore } from "@/contexts/menu-explore-context";
import { resolveStorefrontDeepLink } from "@/lib/storefront-deep-link";
import type { MenuItem } from "@/types/menu";

export function StorefrontDeepLink() {
  const searchParams = useSearchParams();
  const { data } = useMenuData();
  const { setCategory } = useMenuExplore();
  const [item, setItem] = useState<MenuItem | null>(null);
  const [open, setOpen] = useState(false);
  const appliedKey = useRef<string | null>(null);

  const itemParam = searchParams.get("item");
  const categoryParam = searchParams.get("category");

  useEffect(() => {
    if (!data) return;

    const key = `${itemParam ?? ""}|${categoryParam ?? ""}`;
    if (!itemParam && !categoryParam) {
      if (appliedKey.current) {
        appliedKey.current = null;
        setOpen(false);
        setItem(null);
      }
      return;
    }
    if (appliedKey.current === key) return;
    appliedKey.current = key;

    const resolved = resolveStorefrontDeepLink({
      itemParam,
      categoryParam,
      items: data.items ?? [],
      categories: data.categories ?? [],
      combos: data.combos ?? [],
    });

    if (resolved.category) {
      setCategory(resolved.category);
    }
    if (resolved.item) {
      setItem(resolved.item);
      setOpen(true);
    } else {
      setItem(null);
      setOpen(false);
    }

    if (resolved.item || resolved.category) {
      requestAnimationFrame(() => {
        document.getElementById("menu-section")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [data, itemParam, categoryParam, setCategory]);

  return (
    <ItemCustomizeSheet
      item={item}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setItem(null);
      }}
    />
  );
}
