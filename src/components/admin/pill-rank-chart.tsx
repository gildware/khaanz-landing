"use client";

import { useMemo, useState } from "react";

export const PILL_CHART_ITEMS_MAX = 5;

const PILL_TRACK_HEIGHT_PX = 220;
const PILL_WIDTH_PX = 52;

const verticalNameClass =
  "pointer-events-none absolute top-1/2 left-1/2 font-bold font-sans text-[10px] leading-none tracking-tight whitespace-nowrap";

const BAR_PALETTE = [
  "#4f46e5",
  "#7c3aed",
  "#c026d3",
  "#e11d48",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#0891b2",
  "#2563eb",
  "#db2777",
  "#65a30d",
  "#0e7490",
  "#9333ea",
  "#dc2626",
];

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function barColor(index: number): string {
  return BAR_PALETTE[index % BAR_PALETTE.length]!;
}

function barLabelTextColor(fill: string): string {
  const hex = fill.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}

function verticalNameTransform(name: string): string {
  const maxSpanPx = PILL_TRACK_HEIGHT_PX - 28;
  const approxPxPerChar = 6.5;
  const neededPx = name.length * approxPxPerChar;
  const scale = neededPx > maxSpanPx ? maxSpanPx / neededPx : 1;
  return `translate(-50%, -50%) rotate(-90deg) scale(${scale})`;
}

type PillChartRow = {
  fullLabel: string;
  value: number;
  displayValue: string;
  fill: string;
  details?: Array<{ label: string; value: number }>;
};

export type PillRankSourceRow = {
  key?: string;
  label: string;
  value: number;
  details?: Array<{ label: string; value: number }>;
};

function toPillChartRows(
  rows: PillRankSourceRow[],
  sortDesc: boolean,
  formatValue: (value: number) => string,
  maxItems: number,
): PillChartRow[] {
  const sorted = [...rows].sort((a, b) => (sortDesc ? b.value - a.value : a.value - b.value));
  return sorted.slice(0, maxItems).map((r, i) => ({
    fullLabel: r.label,
    value: r.value,
    displayValue: formatValue(r.value),
    fill: barColor(i),
    details: r.details,
  }));
}

function PillVerticalName(props: {
  name: string;
  fill: string;
  fillHeightPx: number;
}) {
  const { name, fill, fillHeightPx } = props;
  const grayClip = `inset(0 0 ${fillHeightPx}px 0)`;
  const fillClip = `inset(${PILL_TRACK_HEIGHT_PX - fillHeightPx}px 0 0 0)`;
  const textTransform = verticalNameTransform(name);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: grayClip }}
      >
        <span
          className={cx(verticalNameClass, "text-foreground/80")}
          style={{ transform: textTransform }}
        >
          {name}
        </span>
      </div>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: fillClip }}
      >
        <span
          className={verticalNameClass}
          style={{
            color: barLabelTextColor(fill),
            transform: textTransform,
          }}
        >
          {name}
        </span>
      </div>
    </>
  );
}

function RankDetailsTooltip(props: {
  row: PillChartRow;
  formatValue: (value: number) => string;
}) {
  const { row, formatValue } = props;
  if (!row.details || row.details.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 hidden w-48 -translate-x-1/2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg group-hover:block group-focus-within:block"
      role="tooltip"
    >
      <p className="font-semibold text-xs">{row.fullLabel}</p>
      <p className="mt-0.5 text-muted-foreground text-[11px]">
        {row.displayValue} total
      </p>
      <div className="mt-2 space-y-1">
        {row.details.map((detail) => (
          <div
            key={detail.label}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="min-w-0 truncate">{detail.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatValue(detail.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PillRankChart(props: {
  rows: PillChartRow[];
  valueTitle: (row: PillChartRow) => string;
  formatValue: (value: number) => string;
}) {
  const { rows, valueTitle, formatValue } = props;
  const maxValue = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="flex items-end justify-center gap-6 px-2 py-8">
      {rows.map((row) => {
        const fillRatio = row.value / maxValue;
        const fillHeightPx =
          row.value > 0
            ? Math.max(12, Math.round(fillRatio * PILL_TRACK_HEIGHT_PX))
            : 12;

        return (
          <div
            key={row.fullLabel}
            className="group relative flex shrink-0 flex-col items-center gap-2.5"
            style={{ width: PILL_WIDTH_PX }}
          >
            <span className="font-bold font-sans text-foreground text-sm tabular-nums leading-none">
              {row.displayValue}
            </span>

            <div
              className="relative rounded-full bg-[#ececef] dark:bg-muted/50"
              style={{ width: PILL_WIDTH_PX, height: PILL_TRACK_HEIGHT_PX }}
              title={valueTitle(row)}
              tabIndex={0}
            >
              <div
                className="absolute right-0 bottom-0 left-0 rounded-full"
                style={{
                  height: fillHeightPx,
                  backgroundColor: row.fill,
                }}
              />
              <PillVerticalName
                name={row.fullLabel}
                fill={row.fill}
                fillHeightPx={fillHeightPx}
              />
            </div>
            <RankDetailsTooltip row={row} formatValue={formatValue} />
          </div>
        );
      })}
    </div>
  );
}

function HorizontalRankChart(props: {
  rows: PillChartRow[];
  valueTitle: (row: PillChartRow) => string;
  formatValue: (value: number) => string;
}) {
  const { rows, valueTitle, formatValue } = props;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const splitAt = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, splitAt), rows.slice(splitAt)].filter(
    (column) => column.length > 0,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="space-y-2">
          {column.map((row, rowIndex) => {
            const rank = columnIndex * splitAt + rowIndex + 1;
            const widthPercent =
              row.value > 0 ? Math.max(4, (row.value / maxValue) * 100) : 0;

            return (
              <div
                key={row.fullLabel}
                className="group relative rounded-xl border bg-card px-3 py-2.5 shadow-xs transition-colors hover:border-foreground/20 hover:bg-muted/20"
                tabIndex={0}
                title={valueTitle(row)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: row.fill }}
                  >
                    {rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-xs">
                    {row.fullLabel}
                  </span>
                  <span className="shrink-0 font-bold text-xs tabular-nums">
                    {row.displayValue}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: row.fill,
                    }}
                  />
                </div>
                <RankDetailsTooltip row={row} formatValue={formatValue} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export type PillRankChartCardProps = {
  title: string;
  subtitle?: string;
  topTabLabel: string;
  bottomTabLabel: string;
  topRows: PillRankSourceRow[];
  bottomRows: PillRankSourceRow[];
  isLoading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  formatValue: (value: number) => string;
  valueTitle: (row: PillRankSourceRow) => string;
  footnoteSuffix?: string;
  filterTopPositive?: boolean;
  maxItems?: number;
  variant?: "pills" | "rank-bars";
  className?: string;
};

export function PillRankChartCard(props: PillRankChartCardProps) {
  const {
    title,
    subtitle,
    topTabLabel,
    bottomTabLabel,
    topRows,
    bottomRows,
    isLoading = false,
    loadingMessage = "Loading…",
    emptyMessage = "Nothing to display.",
    formatValue,
    valueTitle,
    footnoteSuffix = "",
    filterTopPositive = false,
    maxItems = PILL_CHART_ITEMS_MAX,
    variant = "pills",
    className,
  } = props;

  const [view, setView] = useState<"top" | "bottom">("top");

  const chartData = useMemo(() => {
    const source = view === "top" ? topRows : bottomRows;
    const filtered =
      view === "top" && filterTopPositive
        ? source.filter((r) => r.value > 0)
        : source;
    return toPillChartRows(filtered, view === "top", formatValue, maxItems);
  }, [view, topRows, bottomRows, filterTopPositive, formatValue, maxItems]);

  const totalValue = useMemo(
    () => chartData.reduce((sum, r) => sum + r.value, 0),
    [chartData],
  );

  const footnoteTotal = useMemo(() => {
    if (footnoteSuffix === "units") {
      return `${totalValue.toLocaleString("en-IN")} units`;
    }
    return formatValue(totalValue);
  }, [footnoteSuffix, totalValue, formatValue]);

  return (
    <div
      className={cx(
        "w-full rounded-2xl border bg-card p-4 shadow-sm sm:p-6 lg:w-1/2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-base tracking-tight">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
          ) : null}
        </div>
        <div
          className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5"
          role="tablist"
          aria-label={`${title} view`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "top"}
            className={cx(
              "rounded-md px-3 py-1.5 font-sans text-sm transition-colors",
              view === "top"
                ? "bg-background font-bold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView("top")}
          >
            {topTabLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "bottom"}
            className={cx(
              "rounded-md px-3 py-1.5 font-sans text-sm transition-colors",
              view === "bottom"
                ? "bg-background font-bold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView("bottom")}
          >
            {bottomTabLabel}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex h-[300px] items-center justify-center rounded-xl border border-dashed bg-muted/20">
          <p className="text-muted-foreground text-sm">{loadingMessage}</p>
        </div>
      ) : chartData.length === 0 ? (
        <div className="mt-6 flex h-[300px] items-center justify-center rounded-xl border border-dashed bg-muted/20">
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <p className="mt-4 font-sans text-muted-foreground text-xs tabular-nums">
            {view === "top" ? topTabLabel : bottomTabLabel} · {chartData.length} items ·{" "}
            {footnoteTotal}
          </p>
          <div className="mt-4 rounded-2xl bg-background">
            {variant === "rank-bars" ? (
              <HorizontalRankChart
                rows={chartData}
                formatValue={formatValue}
                valueTitle={(row) => {
                  const src =
                    topRows.find((r) => r.label === row.fullLabel) ??
                    bottomRows.find((r) => r.label === row.fullLabel);
                  return src ? valueTitle(src) : row.fullLabel;
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <PillRankChart
                  rows={chartData}
                  formatValue={formatValue}
                  valueTitle={(row) => {
                    const src =
                      topRows.find((r) => r.label === row.fullLabel) ??
                      bottomRows.find((r) => r.label === row.fullLabel);
                    return src ? valueTitle(src) : row.fullLabel;
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
