export interface FloorPlanTable {
  id: string;
  label: string;
  /** Top-left X as percent of floor width (0–100). */
  xPct: number;
  /** Top-left Y as percent of floor height (0–100). */
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface FloorPlanPayload {
  tables: FloorPlanTable[];
}

function clampPct(n: number, max = 100): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, n));
}

/** Enlarge tables for POS pickers (touch targets) while keeping relative layout. */
export function floorTableBoxStyle(
  t: Pick<FloorPlanTable, "xPct" | "yPct" | "widthPct" | "heightPct">,
  scale = 1.55,
): { left: string; top: string; width: string; height: string } {
  const widthPct = Math.min(t.widthPct * scale, 40);
  const heightPct = Math.min(t.heightPct * scale, 40);
  const left = clampPct(
    t.xPct + (t.widthPct - widthPct) / 2,
    100 - widthPct,
  );
  const top = clampPct(
    t.yPct + (t.heightPct - heightPct) / 2,
    100 - heightPct,
  );
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${widthPct}%`,
    height: `${heightPct}%`,
  };
}
