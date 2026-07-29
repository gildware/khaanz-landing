/**
 * Write notebook open-item JSONs and regenerate Jul 28/29 previews.
 * Run: npx tsx scripts/preview-sales-28-29-open.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DAYS = [
  {
    date: "2026-07-28",
    excel:
      "/Users/kamran/Downloads/Item_Wise_Sales_Report_2026_07_29_22_15_40.xlsx",
    openNotebook: [
      {
        name: "Popcorn",
        qty: 4,
        unitPrice: 110,
        detail: "C. Popcorn → Popcorn Chicken Regular",
      },
      {
        name: "Fried Chicken Momo",
        qty: 2,
        unitPrice: 100,
        detail: "f. Momo ₹200 → 2× Fried Chicken Momo @100",
      },
      { name: "C. Samosa", qty: 1, unitPrice: 35, detail: "Chicken Samosa" },
      { name: "C. Samosa", qty: 2, unitPrice: 35, detail: "Chicken Samosa" },
      {
        name: "Fried Chicken Momo",
        qty: 1,
        unitPrice: 180,
        detail: "f. momo @180 → Fried Chicken Momo @180",
      },
      { name: "C. Samosa", qty: 2, unitPrice: 35, detail: "Chicken Samosa" },
      {
        name: "Chola puri",
        qty: 1,
        unitPrice: 60,
        detail: "→ Chole Poori Regular",
      },
      {
        name: "Popcorn",
        qty: 3,
        unitPrice: 110,
        detail: "Popcorn → Popcorn Chicken Regular",
      },
      {
        name: "C. Burger",
        qty: 2,
        unitPrice: 100,
        detail: "→ Chicken Tikki Burger",
      },
      {
        name: "Chilly Almond",
        qty: 1,
        unitPrice: 40,
        detail: "→ Chillz Almond",
      },
    ],
  },
  {
    date: "2026-07-29",
    excel:
      "/Users/kamran/Downloads/Item_Wise_Sales_Report_2026_07_29_22_16_33.xlsx",
    openNotebook: [
      { name: "Nimbu", qty: 1, unitPrice: 20, detail: "→ Nimbuz Jeera" },
      { name: "C. Samosa", qty: 2, unitPrice: 35, detail: "Chicken Samosa" },
      { name: "C. Samosa", qty: 4, unitPrice: 35, detail: "Chicken Samosa" },
      {
        name: "C. Burger",
        qty: 1,
        unitPrice: 100,
        detail: "→ Chicken Tikki Burger",
      },
      {
        name: "Crispy chicken 2PC",
        qty: 1,
        unitPrice: 169,
        detail: "→ Crispy Chicken 2 Pcs",
      },
      {
        name: "Strips 8pc",
        qty: 1,
        unitPrice: 279,
        detail: "notebook 6pc→229; user said 8 pieces → Strips 8 Pcs @279",
      },
      { name: "C. Samosa", qty: 1, unitPrice: 35, detail: "Chicken Samosa" },
      { name: "Wings 4pc", qty: 1, unitPrice: 119, detail: "→ Wings 4 Pcs" },
      { name: "C. Samosa", qty: 9, unitPrice: 35, detail: "Chicken Samosa" },
    ],
  },
] as const;

function main() {
  for (const day of DAYS) {
    const notebookPath = join(
      process.cwd(),
      "samples",
      `open-notebook-${day.date}.json`,
    );
    writeFileSync(
      notebookPath,
      JSON.stringify(
        {
          saleDate: day.date,
          notes:
            day.date === "2026-07-29"
              ? "Strips corrected to 8 Pcs; Onion Flour 2kg skipped (not a sale)"
              : "From open-items notebook 28/7/26",
          lines: day.openNotebook,
          notebookSum: day.openNotebook.reduce(
            (s, l) => s + l.qty * l.unitPrice,
            0,
          ),
        },
        null,
        2,
      ),
      "utf8",
    );

    execSync(
      `npx tsx scripts/preview-item-wise-sales.ts --date ${day.date} --excel ${JSON.stringify(day.excel)} --open-notebook ${JSON.stringify(notebookPath)}`,
      { stdio: "inherit" },
    );
  }
}

main();
