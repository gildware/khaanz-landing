import { resolveMenuItemImage } from "@/lib/menu-item-image";

function getCartTarget(): HTMLElement | null {
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  return document.querySelector<HTMLElement>(
    isDesktop ? '[data-cart-target="header"]' : '[data-cart-target="mobile"]',
  );
}

function bumpCartTarget(target: HTMLElement) {
  target.classList.add("cart-bump");
  window.setTimeout(() => target.classList.remove("cart-bump"), 450);
}

export function flyToCart({
  sourceRect,
  imageSrc,
}: {
  sourceRect: DOMRect;
  imageSrc?: string | null;
}): void {
  if (typeof window === "undefined") return;

  const target = getCartTarget();
  if (!target) return;

  const targetRect = target.getBoundingClientRect();
  const size = Math.min(sourceRect.width, sourceRect.height, 72);

  const startX = sourceRect.left + sourceRect.width / 2 - size / 2;
  const startY = sourceRect.top + sourceRect.height / 2 - size / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className = "fly-to-cart-item";
  el.style.cssText = [
    "position:fixed",
    `left:${startX}px`,
    `top:${startY}px`,
    `width:${size}px`,
    `height:${size}px`,
    "z-index:9999",
    "pointer-events:none",
    "border-radius:9999px",
    "overflow:hidden",
    "box-shadow:0 8px 24px oklch(0 0 0 / 0.28)",
    "will-change:transform,opacity",
  ].join(";");

  const img = document.createElement("img");
  img.src = resolveMenuItemImage(imageSrc);
  img.alt = "";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
  el.appendChild(img);
  document.body.appendChild(el);

  const deltaX = endX - (startX + size / 2);
  const deltaY = endY - (startY + size / 2);
  const arcLift = Math.min(100, Math.abs(deltaY) * 0.35 + 48);

  const animation = el.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      {
        transform: `translate(${deltaX * 0.42}px, ${deltaY * 0.25 - arcLift}px) scale(0.75)`,
        opacity: 1,
        offset: 0.42,
      },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(0.12)`,
        opacity: 0.15,
      },
    ],
    {
      duration: 680,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      fill: "forwards",
    },
  );

  animation.onfinish = () => {
    el.remove();
    bumpCartTarget(target);
  };
  animation.oncancel = () => el.remove();
}
