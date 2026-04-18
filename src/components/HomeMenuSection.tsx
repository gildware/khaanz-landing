"use client";

import { useEffect, useState } from "react";

import { MenuGrid, MenuGridSkeletonBlock } from "@/components/MenuGrid";
import { useMenuData } from "@/contexts/menu-data-context";

export function HomeMenuSection() {
  const { isLoading, data } = useMenuData();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready || (isLoading && !data)) {
    return <MenuGridSkeletonBlock />;
  }

  return <MenuGrid />;
}
