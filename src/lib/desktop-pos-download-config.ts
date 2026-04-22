/** OS family for choosing a desktop POS installer link in admin. */
export type DesktopPosClientOs = "mac" | "windows" | "linux" | "unknown";

/**
 * Best-effort client OS (for download buttons). Call after mount to avoid SSR
 * mismatch.
 */
export function detectDesktopPosClientOs(): DesktopPosClientOs {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const plat = (nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  if (ua.includes("windows") || plat.includes("win")) return "windows";
  if (ua.includes("mac os") || ua.includes("macintosh") || plat.includes("mac"))
    return "mac";
  if (ua.includes("linux") || plat.includes("linux")) return "linux";
  return "unknown";
}

/** Public installer URLs (set in env at build / deploy time). */
export function getDesktopPosDownloadUrls(): { mac: string; windows: string } {
  return {
    mac: (process.env.NEXT_PUBLIC_DESKTOP_POS_MAC_URL ?? "").trim(),
    windows: (process.env.NEXT_PUBLIC_DESKTOP_POS_WINDOWS_URL ?? "").trim(),
  };
}
