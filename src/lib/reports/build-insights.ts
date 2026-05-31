export type InsightSeverity = "critical" | "warning" | "info" | "positive";

export type ReportInsight = {
  id: string;
  severity: InsightSeverity;
  message: string;
};

export function buildReportInsights(input: {
  netProfitPaise: number;
  grossMarginPaise: number;
  salesPaise: number;
  expensesPaise: number;
  salariesPaise: number;
  wastageCostPaise: number;
  personalUsePaise: number;
  topSelling: { label: string; qty: number }[];
  zeroSalesTotalCount: number;
  orderCount: number;
  topExpenseCategory: { label: string; totalPaise: number } | null;
  topWastageType: { label: string; costPaise: number } | null;
}): ReportInsight[] {
  const insights: ReportInsight[] = [];
  const {
    netProfitPaise,
    grossMarginPaise,
    salesPaise,
    expensesPaise,
    salariesPaise,
    wastageCostPaise,
    personalUsePaise,
    topSelling,
    zeroSalesTotalCount,
    orderCount,
    topExpenseCategory,
    topWastageType,
  } = input;

  const operatingOutflowPaise = expensesPaise + salariesPaise;

  if (orderCount === 0) {
    insights.push({
      id: "no_orders",
      severity: "warning",
      message:
        "No orders in this period — check if POS/website sales are recording correctly.",
    });
  }

  if (orderCount > 0 && netProfitPaise < 0) {
    insights.push({
      id: "negative_profit",
      severity: "critical",
      message:
        "Net profit is negative. Review expenses, payroll, and slow-moving menu items.",
    });
  } else if (
    orderCount > 0 &&
    netProfitPaise > 0 &&
    grossMarginPaise > 0 &&
    salesPaise > 0
  ) {
    const marginPct = Math.round((grossMarginPaise / salesPaise) * 100);
    insights.push({
      id: "gross_margin",
      severity: marginPct >= 40 ? "positive" : "info",
      message: `Gross margin is ${marginPct}% of sales — ${marginPct >= 40 ? "healthy" : "consider reviewing food costs"}.`,
    });
  }

  if (salesPaise > 0 && wastageCostPaise > 0) {
    const wastagePct = Math.round((wastageCostPaise / salesPaise) * 100);
    if (wastagePct >= 5) {
      insights.push({
        id: "wastage_high",
        severity: "warning",
        message: `Wastage cost is ${wastagePct}% of sales — investigate prep waste, expiry, and portion control.`,
      });
    } else if (wastagePct >= 1) {
      insights.push({
        id: "wastage_moderate",
        severity: "info",
        message: `Wastage cost is ${wastagePct}% of sales — keep monitoring prep and expiry.`,
      });
    }
  }

  if (salesPaise > 0 && operatingOutflowPaise > salesPaise) {
    insights.push({
      id: "expenses_exceed_sales",
      severity: "critical",
      message: "Operating expenses exceed sales revenue in this period.",
    });
  }

  if (topSelling.length > 0 && topSelling[0]!.qty > 0) {
    insights.push({
      id: "best_seller",
      severity: "positive",
      message: `Best seller: ${topSelling[0]!.label} (${topSelling[0]!.qty} units).`,
    });
  }

  if (zeroSalesTotalCount > 0) {
    insights.push({
      id: "zero_sales",
      severity: "info",
      message: `${zeroSalesTotalCount} menu item${zeroSalesTotalCount === 1 ? "" : "s"} had zero sales — consider promotions or removing from menu.`,
    });
  }

  if (topExpenseCategory && topExpenseCategory.totalPaise > 0) {
    insights.push({
      id: "top_expense_category",
      severity: "info",
      message: `Largest business expense category: ${topExpenseCategory.label}.`,
    });
  }

  if (topWastageType && topWastageType.costPaise > 0) {
    insights.push({
      id: "top_wastage_type",
      severity: "warning",
      message: `Most wastage cost from: ${topWastageType.label}.`,
    });
  }

  if (salesPaise > 0 && personalUsePaise > 0) {
    const personalPct = Math.round((personalUsePaise / salesPaise) * 100);
    if (personalPct >= 10) {
      insights.push({
        id: "personal_use_high",
        severity: "warning",
        message: `Personal / owner draw is ${personalPct}% of sales — review cash, stock, and comp meals.`,
      });
    }
  }

  return insights.slice(0, 10);
}
