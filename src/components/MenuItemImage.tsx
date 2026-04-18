"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

import {
  MENU_ITEM_PLACEHOLDER_IMAGE,
  resolveMenuItemImage,
} from "@/lib/menu-item-image";

export type MenuItemImageProps = Omit<ImageProps, "src" | "onError"> & {
  src: string | null | undefined;
};

export function MenuItemImage({
  src,
  alt,
  unoptimized: unoptimizedProp,
  ...rest
}: MenuItemImageProps) {
  const resolved = resolveMenuItemImage(src);
  const [displaySrc, setDisplaySrc] = useState(resolved);

  useEffect(() => {
    setDisplaySrc(resolveMenuItemImage(src));
  }, [src]);

  const unoptimized =
    Boolean(unoptimizedProp) || displaySrc.startsWith("data:");

  return (
    <Image
      alt={alt ?? ""}
      {...rest}
      src={displaySrc}
      unoptimized={unoptimized}
      onError={() => {
        /* Defer past React hydration — immediate onError can mismatch SSR markup. */
        setTimeout(() => setDisplaySrc(MENU_ITEM_PLACEHOLDER_IMAGE), 0);
      }}
    />
  );
}
