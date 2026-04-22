/**
 * Bridge for the Khaanz Desktop POS (Electron) app: silent print + offline queue.
 * `window.khaanzDesktop` is injected by `desktop-pos/preload.cjs`.
 */

export type KhaanzDesktopOfflineRow = {
  clientOrderId: string;
  body: Record<string, unknown>;
  createdAt: string;
};

export type KhaanzDesktopApi = {
  readonly isDesktop: true;
  printSilentHtml(
    html: string,
    title?: string,
  ): Promise<{ ok: boolean; error?: string }>;
  listPrinters(): Promise<{ name: string; isDefault?: boolean }[]>;
  enqueueOfflineOrder(row: {
    clientOrderId: string;
    body: Record<string, unknown>;
  }): Promise<{ ok: boolean; error?: string }>;
  getOfflineQueue(): Promise<KhaanzDesktopOfflineRow[]>;
  removeOfflineOrder(clientOrderId: string): Promise<{ ok: boolean }>;
};

declare global {
  interface Window {
    khaanzDesktop?: KhaanzDesktopApi;
  }
}

export function getKhaanzDesktop(): KhaanzDesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return window.khaanzDesktop;
}

function shouldTreatAsOfflineNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return err instanceof TypeError;
}

export function shouldQueuePosOrderOffline(err: unknown): boolean {
  return shouldTreatAsOfflineNetworkFailure(err);
}

/** POST each queued body (includes `clientOrderId`) with admin cookies; removes on 200. */
export async function flushOfflinePosQueue(
  api: KhaanzDesktopApi,
  opts?: { onSynced?: (n: number) => void },
): Promise<number> {
  const rows = await api.getOfflineQueue();
  if (rows.length === 0) return 0;
  let flushed = 0;
  for (const row of rows) {
    try {
      const res = await fetch("/api/admin/orders/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(row.body),
      });
      if (res.ok) {
        await api.removeOfflineOrder(row.clientOrderId);
        flushed++;
      } else {
        if (res.status === 401) break;
        break;
      }
    } catch {
      break;
    }
  }
  if (flushed > 0) opts?.onSynced?.(flushed);
  return flushed;
}
