/** Phone / tablet UA check for middleware and SSR (no viewport). */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    ua,
  );
}

/** Client-side: viewport or UA — “mobile view” for admin login routing. */
export function isMobileView(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(max-width: 768px)").matches) return true;
  return isMobileUserAgent(navigator.userAgent);
}
