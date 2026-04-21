"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { playAdminNewOrderRingtone } from "@/lib/admin-new-order-sound";

const POLL_MS = 5_000;
const RING_INTERVAL_MS = 2_700;

type NotifyOrder = {
  id: string;
  status: string;
  statusLabel: string;
  fulfillment: string;
  /** website = public checkout; pos = admin POS — alerts only for website */
  source?: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
  customerPhone: string;
  customerName: string | null;
};

function isWebsiteOrder(o: NotifyOrder): boolean {
  return o.source === undefined || o.source === "website";
}

function mergeNewOrders(
  previous: NotifyOrder[],
  incoming: NotifyOrder[],
): NotifyOrder[] {
  const map = new Map<string, NotifyOrder>();
  for (const o of previous) map.set(o.id, o);
  for (const o of incoming) map.set(o.id, o);
  return [...map.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function AdminNewOrderNotifier() {
  const seededRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  /** Order ids in the current new-order alert; ringing stops when all are no longer PENDING. */
  const ringingIdsRef = useRef<Set<string>>(new Set());

  const soundLoopRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<NotifyOrder[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const stopSoundLoop = useCallback(() => {
    loopActiveRef.current = false;
    if (soundLoopRef.current !== null) {
      clearInterval(soundLoopRef.current);
      soundLoopRef.current = null;
    }
  }, []);

  const startSoundLoop = useCallback(() => {
    if (loopActiveRef.current) return;
    loopActiveRef.current = true;
    playAdminNewOrderRingtone();
    soundLoopRef.current = window.setInterval(() => {
      playAdminNewOrderRingtone();
    }, RING_INTERVAL_MS);
  }, []);

  const dismissModal = useCallback(() => {
    stopSoundLoop();
    ringingIdsRef.current.clear();
    setOpen(false);
    setOrders([]);
  }, [stopSoundLoop]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders?limit=100&offset=0", {
        credentials: "include",
      });
      if (res.status === 401) return;
      if (!res.ok) return;

      const data = (await res.json()) as { orders: NotifyOrder[] };
      const list = data.orders ?? [];

      setPendingCount(
        list.filter((o) => o.status === "PENDING" && isWebsiteOrder(o)).length,
      );

      if (!seededRef.current) {
        for (const o of list) seenIdsRef.current.add(o.id);
        seededRef.current = true;
        return;
      }

      const newOnes = list.filter((o) => !seenIdsRef.current.has(o.id));
      for (const o of newOnes) seenIdsRef.current.add(o.id);

      const websiteNewOnes = newOnes.filter((o) => isWebsiteOrder(o));

      const allRingingHandled =
        ringingIdsRef.current.size > 0 &&
        [...ringingIdsRef.current].every((id) => {
          const o = list.find((x) => x.id === id);
          return o && o.status !== "PENDING";
        });

      if (allRingingHandled) {
        stopSoundLoop();
        ringingIdsRef.current.clear();
        if (websiteNewOnes.length === 0) {
          setOpen(false);
        }
      }

      for (const o of websiteNewOnes) ringingIdsRef.current.add(o.id);

      setOrders((prev) => {
        const base = allRingingHandled ? [] : prev;
        let next = base;
        if (websiteNewOnes.length > 0) {
          next = mergeNewOrders(base, websiteNewOnes);
        }
        if (next.length === 0) return next;
        return next.map((row) => {
          const fresh = list.find((x) => x.id === row.id);
          return fresh ? { ...row, ...fresh } : row;
        });
      });

      if (websiteNewOnes.length > 0) {
        setOpen(true);
        startSoundLoop();
      }
    } catch {
      // ignore network errors
    }
  }, [startSoundLoop, stopSoundLoop]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      window.clearInterval(id);
      stopSoundLoop();
    };
  }, [poll, stopSoundLoop]);

  /** Prime Web Audio after first gesture so alerts can play reliably. */
  useEffect(() => {
    const warm = () => {
      try {
        const w = window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        };
        const AC = w.AudioContext ?? w.webkitAudioContext;
        if (!AC) return;
        const c = new AC();
        void c.resume().finally(() => void c.close());
      } catch {
        /* empty */
      }
    };
    window.addEventListener("pointerdown", warm, { once: true, capture: true });
  }, []);

  return (
    <>
      {pendingCount > 0 && (
        <div
          role="status"
          className="flex shrink-0 flex-col gap-3 border-b border-amber-500/35 bg-amber-500/12 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="flex gap-2 text-sm">
            <AlertTriangleIcon
              className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden
            />
            <p className="text-amber-950 dark:text-amber-100">
              <span className="font-medium">
                You have {pendingCount} pending{" "}
                {pendingCount === 1 ? "order" : "orders"}.
              </span>{" "}
              Kindly accept {pendingCount === 1 ? "it" : "them"}.
            </p>
          </div>
          <Link
            href="/admin/orders"
            className={cn(buttonVariants({ size: "sm" }), "shrink-0 self-start sm:self-auto")}
          >
            View orders
          </Link>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) dismissModal();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {orders.length > 1
                ? `${orders.length} new orders`
                : "New order"}
            </DialogTitle>
            <DialogDescription>
              A customer just placed {orders.length > 1 ? "orders" : "an order"}.
              The alert will repeat until you dismiss or accept{" "}
              {orders.length > 1 ? "these orders" : "this order"}.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[min(50dvh,320px)] space-y-3 overflow-y-auto text-sm">
            {orders.map((o) => {
              const total = (o.totalMinor / 100).toFixed(2);
              return (
                <li
                  key={o.id}
                  className="rounded-lg border bg-muted/40 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {o.customerName?.trim() || "Customer"}
                    </span>
                    <span className="tabular-nums font-semibold">
                      ₹{total} {o.currency}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span>{o.statusLabel}</span>
                    <span className="font-mono">{o.customerPhone}</span>
                    <span className="capitalize">{o.fulfillment}</span>
                    <span>{new Date(o.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 font-mono text-[11px] break-all">
                    {o.id}
                  </p>
                </li>
              );
            })}
          </ul>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={dismissModal}>
              Dismiss
            </Button>
            <Link href="/admin/orders" className={cn(buttonVariants())}>
              Open orders
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
