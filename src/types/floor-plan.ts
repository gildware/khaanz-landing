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
