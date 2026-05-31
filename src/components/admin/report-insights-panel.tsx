import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  LightbulbIcon,
  TrendingUpIcon,
} from "lucide-react";

import type { InsightSeverity, ReportInsight } from "@/lib/reports/build-insights";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { bullet: string; icon: React.ComponentType<{ className?: string }> }
> = {
  critical: { bullet: "text-rose-600", icon: AlertTriangleIcon },
  warning: { bullet: "text-amber-600", icon: AlertTriangleIcon },
  info: { bullet: "text-sky-600", icon: InfoIcon },
  positive: { bullet: "text-emerald-600", icon: CheckCircle2Icon },
};

export function ReportInsightsPanel(props: {
  insights: ReportInsight[];
  isLoading?: boolean;
  periodLabel?: string;
}) {
  const { insights, isLoading, periodLabel } = props;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/8 via-card to-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-medium text-sm">
          <LightbulbIcon className="size-4 shrink-0 text-amber-600" />
          Insights & recommendations
        </div>
        {periodLabel ? (
          <span className="text-muted-foreground text-xs">{periodLabel}</span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Analyzing period data…</p>
      ) : insights.length === 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <TrendingUpIcon className="size-4 shrink-0 text-emerald-600" />
          No notable issues for this period — keep up the good work.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((insight) => {
            const style = SEVERITY_STYLES[insight.severity];
            const Icon = style.icon;
            return (
              <li key={insight.id} className="flex gap-2.5 text-sm leading-relaxed">
                <Icon className={cn("mt-0.5 size-4 shrink-0", style.bullet)} aria-hidden />
                <span className="text-foreground/90">{insight.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
