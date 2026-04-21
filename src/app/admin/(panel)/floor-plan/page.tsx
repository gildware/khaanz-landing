"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FloorPlanPayload, FloorPlanTable } from "@/types/floor-plan";

type DragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  startXPct: number;
  startYPct: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export default function AdminFloorPlanPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState<FloorPlanTable[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/floor-plan", { credentials: "include" });
      if (!res.ok) {
        toast.error("Could not load floor plan");
        return;
      }
      const data = (await res.json()) as { floorPlan?: FloorPlanPayload };
      setTables(data.floorPlan?.tables ?? []);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  const persistDrag = useCallback((id: string, xPct: number, yPct: number) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const x = clamp(xPct, 0, 100 - t.widthPct);
        const y = clamp(yPct, 0, 100 - t.heightPct);
        return { ...t, xPct: x, yPct: y };
      }),
    );
  }, []);

  const onTablePointerDown = useCallback(
    (e: React.PointerEvent, t: FloorPlanTable) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedId(t.id);
      dragRef.current = {
        id: t.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startXPct: t.xPct,
        startYPct: t.yPct,
      };
      floorRef.current?.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onFloorPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const el = floorRef.current;
      if (!d || !el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dxPct = ((e.clientX - d.startClientX) / rect.width) * 100;
      const dyPct = ((e.clientY - d.startClientY) / rect.height) * 100;
      persistDrag(d.id, d.startXPct + dxPct, d.startYPct + dyPct);
    },
    [persistDrag],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragRef.current && floorRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        floorRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null;
  }, []);

  const addTable = () => {
    const n = tables.length + 1;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t_${Date.now()}`;
    const t: FloorPlanTable = {
      id,
      label: `Table ${n}`,
      xPct: clamp(12 + (n % 5) * 14, 0, 100 - 11),
      yPct: clamp(10 + Math.floor(n / 5) * 12, 0, 100 - 9),
      widthPct: 11,
      heightPct: 9,
    };
    setTables((prev) => [...prev, t]);
    setSelectedId(id);
    toast.success("Table added — drag it into place, then Save.");
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setTables((prev) => prev.filter((t) => t.id !== selectedId));
    setSelectedId(null);
  };

  const updateSelectedLabel = (label: string) => {
    if (!selectedId) return;
    setTables((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, label } : t)),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: FloorPlanPayload = { tables };
      const res = await fetch("/api/admin/floor-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "Save failed";
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      toast.success("Floor plan saved");
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading floor plan…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Table layout</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Arrange tables to match your dining room. POS dine-in will require a
          table before adding items whenever at least one table is saved here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={addTable} className="gap-1.5">
          <PlusIcon className="size-4" />
          Add table
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!selectedId}
          onClick={removeSelected}
          className="gap-1.5"
        >
          <Trash2Icon className="size-4" />
          Remove selected
        </Button>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            "Save layout"
          )}
        </Button>
      </div>

      <div
        ref={floorRef}
        className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 shadow-inner"
        onPointerMove={onFloorPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => {
          if (dragRef.current) endDrag(e);
        }}
      >
        <p className="text-muted-foreground pointer-events-none absolute left-3 top-2 text-xs">
          Drag tables to position · Click a table to edit its name
        </p>
        {tables.map((t) => {
          const isSel = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              className={cn(
                "absolute flex touch-none select-none items-center justify-center rounded-md border-2 text-center text-xs font-semibold leading-tight shadow-sm transition-[box-shadow,colors]",
                isSel
                  ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "border-border bg-card text-foreground hover:bg-muted/80",
              )}
              style={{
                left: `${t.xPct}%`,
                top: `${t.yPct}%`,
                width: `${t.widthPct}%`,
                height: `${t.heightPct}%`,
              }}
              onPointerDown={(e) => onTablePointerDown(e, t)}
            >
              <span className="px-1">{t.label}</span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="mb-3 font-medium text-sm">Selected table</p>
          <div className="space-y-2">
            <Label htmlFor="tbl-label">Label (shown on POS & KOT)</Label>
            <Input
              id="tbl-label"
              value={selected.label}
              onChange={(e) => updateSelectedLabel(e.target.value)}
              maxLength={48}
              className="max-w-md bg-background"
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Select a table on the floor to rename it.
        </p>
      )}
    </div>
  );
}
