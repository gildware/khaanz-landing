"use client";

import { useEffect } from "react";

/**
 * Clears any previously registered service workers from older deploys.
 * When PWA is off, a stale SW can still control the origin and break iOS / in-app browsers.
 *
 * PWA is opt-in via `NEXT_PUBLIC_ENABLE_PWA=true` in `next.config.ts`.
 * Unregister when that flag is not set so stale workers from old deploys cannot break iOS.
 */
export function ServiceWorkerUnregister() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_PWA === "true") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) {
        void r.unregister();
      }
    });
  }, []);

  return null;
}
