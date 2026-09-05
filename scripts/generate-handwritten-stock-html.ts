/**
 * Handwritten physical stock (4 notebook photos) → DB mapping preview.
 * Read-only. Does not write to the database.
 *
 * Run: npx tsx scripts/generate-handwritten-stock-html.ts
 *
 * Agreed apply (only when the user explicitly says to add):
 * Opening date 1 Sep 2026 IST. Option 2 full reset:
 * - Notebook lines = counted qty that day
 * - Every other active item = 0 that day
 * Then live qty = 1 Sep count − Sept sales usage + purchases after 1 Sep − kitchen/consumable use after 1 Sep.
 * Cash pool opening ₹69,100 effective 1 Sep. Create the 12 new items first.
 * Also set Royal Rabdi @ 25 unit cost to ₹23 if it is still 0.
 * August stays in the live DB (not exported/deleted). Hide it via cutoff:
 * REPORTING_START_DATE=2026-09-01 (daily table + salary accrual).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { itemUnitCostPaisePerBase } from "../src/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "../src/lib/inventory/inventory-settings";
import { formatRupees } from "../src/lib/payroll/payroll-utils";

export type Confidence = "mapped" | "ask" | "no-db" | "skip";

export type Line = {
  page: number;
  writtenName: string;
  asWritten: string;
  guessQty: string;
  guessBase: number | null;
  guessUnit: string;
  dbName: string | null;
  confidence: Confidence;
  ask?: string;
  note?: string;
  /** Paise per 1 base unit when the item is not in DB yet. */
  manualRatePaisePerBase?: number;
  /** Copy unit cost from another DB item at generate time. */
  rateFromDbName?: string;
  /** Name to create when confidence is no-db. */
  createName?: string;
  createCategory?: string;
};

export const LINES: Line[] = [
  // ── Page 1 ──
  {
    page: 1,
    writtenName: "PIZZA PASTA SAUCE",
    asWritten: "25 packet · 1 kg",
    guessQty: "25,000 g",
    guessBase: 25000,
    guessUnit: "g",
    dbName: "Pizza Pasta Sauce",
    confidence: "mapped",
    note: "Confirmed 25 kg.",
  },
  {
    page: 1,
    writtenName: "Mayonious (Mayonnaise)",
    asWritten: "9 cas + 7 · 12/cas · 1 kg",
    guessQty: "115,000 g  (115 × 1 kg)",
    guessBase: 115000,
    guessUnit: "g",
    dbName: "Mayonnaise",
    confidence: "mapped",
    note: "(9×12)+7 = 115 jars × 1 kg",
  },
  {
    page: 1,
    writtenName: "Schezwan",
    asWritten: "1 cas + 8 · 12/cas · 1.13 kg",
    guessQty: "22,600 g  (20 × 1.13 kg)",
    guessBase: 22600,
    guessUnit: "g",
    dbName: "Schezwan Sauce",
    confidence: "mapped",
    note: "Confirmed 1 case (12) + 8 = 20 bottles × 1.13 kg.",
  },
  {
    page: 1,
    writtenName: "Top Taste",
    asWritten: "7 cas + 4 · 12/cas · 1.14 kg",
    guessQty: "100,320 g  (88 × 1.14 kg)",
    guessBase: 100320,
    guessUnit: "g",
    dbName: "Tomato Sauce",
    confidence: "mapped",
    note: "Confirmed Top Taste → Tomato Sauce. 7×12+4 = 88 bottles × 1.14 kg.",
  },
  {
    page: 1,
    writtenName: "Green chilli sauce",
    asWritten: "1 cas + 12 · 18/cas · 650 g",
    guessQty: "19,500 g  (30 × 650 g)",
    guessBase: 19500,
    guessUnit: "g",
    dbName: "Green Chilli Sauce",
    confidence: "mapped",
    note: "(1×18)+12 = 30 bottles × 650 g",
  },
  {
    page: 1,
    writtenName: "Ketchup",
    asWritten: "2 cas + 6 packet · 18 pkt/cas · 72 pc/pkt",
    guessQty: "3,024 pc",
    guessBase: 3024,
    guessUnit: "pc",
    dbName: "Ketchup",
    confidence: "mapped",
    note: "Confirmed sachets. (2×18)+6 = 42 packets × 72 = 3,024 pc.",
  },
  {
    page: 1,
    writtenName: "Thousand island Dressing",
    asWritten: "8 packet · 1 kg",
    guessQty: "8,000 g",
    guessBase: 8000,
    guessUnit: "g",
    dbName: "Thousand Island Dressing",
    confidence: "mapped",
    note: "Confirmed 8 packets × 1 kg.",
  },
  {
    page: 1,
    writtenName: "Soya Sauce",
    asWritten: "1 cas · 18 bottles · 760 g",
    guessQty: "13,680 g",
    guessBase: 13680,
    guessUnit: "g",
    dbName: "Soya Sauce",
    confidence: "mapped",
    note: "Corrected: 1 case = 18 bottles × 760 g.",
  },
  {
    page: 1,
    writtenName: "Gagan (Ghee)",
    asWritten: "2 cas · 20 pkt/cas · 840 g",
    guessQty: "33,600 g",
    guessBase: 33600,
    guessUnit: "g",
    dbName: "Ghee",
    confidence: "mapped",
    note: "Confirmed 2 cases × 20 packets × 840 g.",
  },
  {
    page: 1,
    writtenName: "Chilli flakes",
    asWritten: "4 packet · 250 sachet/pkt",
    guessQty: "1,000 pc",
    guessBase: 1000,
    guessUnit: "pc",
    dbName: "Red Chiili Sachet",
    confidence: "mapped",
    note: "Confirmed Red Chiili Sachet. 4 × 250 = 1,000 pc.",
  },
  {
    page: 1,
    writtenName: "Organic flakes",
    asWritten: "4 packet · 300 sachet/pkt",
    guessQty: "1,200 pc",
    guessBase: 1200,
    guessUnit: "pc",
    dbName: "Oregano Sachet",
    confidence: "mapped",
    note: "Confirmed Oregano Sachet. 4 × 300 = 1,200 pc.",
  },
  {
    page: 1,
    writtenName: "Yeast",
    asWritten: "1 · 500 grm",
    guessQty: "500 g",
    guessBase: 500,
    guessUnit: "g",
    dbName: "Yeast",
    confidence: "mapped",
  },
  {
    page: 1,
    writtenName: "Sliced green olives",
    asWritten: "4 · 500 grm",
    guessQty: "2,000 g",
    guessBase: 2000,
    guessUnit: "g",
    dbName: "Green Olives",
    confidence: "mapped",
    note: "Confirmed full tin 500 g × 4.",
  },
  {
    page: 1,
    writtenName: "Tandoori Tikka Base",
    asWritten: "1 · 500 g",
    guessQty: "500 g",
    guessBase: 500,
    guessUnit: "g",
    dbName: "Tandoori Masala",
    confidence: "mapped",
    note: "Confirmed Tandoori Tikka Base → Tandoori Masala, 500 g.",
  },
  {
    page: 1,
    writtenName: "Container Small",
    asWritten: "7 packet · 100 pc/pkt",
    guessQty: "700 pc",
    guessBase: 700,
    guessUnit: "pc",
    dbName: "Container Small",
    confidence: "mapped",
    note: "Confirmed 7 × 100 = 700 pc.",
  },
  {
    page: 1,
    writtenName: "Blue curaco",
    asWritten: "2 · 775 ml",
    guessQty: "1,550 ml",
    guessBase: 1550,
    guessUnit: "ml",
    dbName: "Blue Curacao",
    confidence: "mapped",
  },
  {
    page: 1,
    writtenName: "Green apple",
    asWritten: "1 · 775 ml",
    guessQty: "775 ml",
    guessBase: 775,
    guessUnit: "ml",
    dbName: "Green Apple",
    confidence: "mapped",
  },
  {
    page: 1,
    writtenName: "water melon",
    asWritten: "1 · 775 ml",
    guessQty: "775 ml",
    guessBase: 775,
    guessUnit: "ml",
    dbName: "Water Melon Mojito",
    confidence: "mapped",
  },
  {
    page: 1,
    writtenName: "Virgin Mojito",
    asWritten: "2 · 775 ml",
    guessQty: "1,550 ml",
    guessBase: 1550,
    guessUnit: "ml",
    dbName: "Virgin Mojito",
    confidence: "mapped",
    note: "Confirmed 2 × 775 ml.",
  },
  {
    page: 1,
    writtenName: "Strawberry crush",
    asWritten: "1 · 1 LTR  (one read 775 ml)",
    guessQty: "1,000 g",
    guessBase: 1000,
    guessUnit: "g",
    dbName: "Strawberry Crush",
    confidence: "mapped",
    note: "DB unit is grams; 1 L treated as 1,000 g.",
  },
  {
    page: 1,
    writtenName: "Black currant crush",
    asWritten: "1 · 1 LTR",
    guessQty: "1,000 ml",
    guessBase: 1000,
    guessUnit: "ml",
    dbName: "Black Current Crush",
    confidence: "mapped",
  },
  {
    page: 1,
    writtenName: "Cholate sirop (Chocolate syrup)",
    asWritten: "1 · 1.13 kg",
    guessQty: "1,130 g",
    guessBase: 1130,
    guessUnit: "g",
    dbName: "Chocolate Syrup",
    confidence: "mapped",
    note: "Confirmed 1.13 kg.",
  },
  {
    page: 1,
    writtenName: "Pepsi",
    asWritten: "4 cas 41 Bottle · 24/cas · 400 ml",
    guessQty: "137 pc",
    guessBase: 137,
    guessUnit: "pc",
    dbName: "Pepsi @ 20",
    confidence: "mapped",
    note: "(4×24)+41 = 137 bottles",
  },
  {
    page: 1,
    writtenName: "Dew",
    asWritten: "1 cas 17 Bottle · 30/cas · 250 ml",
    guessQty: "47 pc",
    guessBase: 47,
    guessUnit: "pc",
    dbName: "Dew @ 20",
    confidence: "mapped",
    note: "(1×30)+17 = 47 bottles. Separate from page-2 “Dew 35”.",
  },

  // ── Page 2 ──
  {
    page: 2,
    writtenName: "Dew 35",
    asWritten: "20 · 750 ml · ₹35",
    guessQty: "20 pc",
    guessBase: 20,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Dew @ 35",
    createCategory: "Drinks",
    ask: "New item Dew @ 35 (750 ml) — create when applying stock.",
    note: "User: add Dew @ 35, 750 ml, 20 bottles. Cost ₹33.",
    manualRatePaisePerBase: 3300,
  },
  {
    page: 2,
    writtenName: "MIRINDA",
    asWritten: "11 · 400 ML",
    guessQty: "11 pc",
    guessBase: 11,
    guessUnit: "pc",
    dbName: "Mirinda @ 20",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "Coco cola",
    asWritten: "2 cas + 20 bottle · 28/cas · 250 ML",
    guessQty: "76 pc",
    guessBase: 76,
    guessUnit: "pc",
    dbName: "Coca Cola @ 20",
    confidence: "mapped",
    note: "Corrected: 2×28 + 20 = 76 bottles.",
  },
  {
    page: 2,
    writtenName: "Dalda",
    asWritten: "7 Packet · 840 GRM",
    guessQty: "5,880 g",
    guessBase: 5880,
    guessUnit: "g",
    dbName: "Ghee",
    confidence: "mapped",
    note: "Confirmed Dalda → Ghee. Add to Gagan. 7 × 840 g.",
  },
  {
    page: 2,
    writtenName: "Noodles (Moddles)",
    asWritten: "1 case · 18 pkt · 650 g",
    guessQty: "11,700 g",
    guessBase: 11700,
    guessUnit: "g",
    dbName: "Noodles",
    confidence: "mapped",
    note: "Confirmed 1 case only. 18 × 650 g.",
  },
  {
    page: 2,
    writtenName: "Soya Chunk",
    asWritten: "1 Bag + 4 kg · bag 10 kg",
    guessQty: "14,000 g",
    guessBase: 14000,
    guessUnit: "g",
    dbName: "Soya Granules",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "Diet Coco",
    asWritten: "11 · 300 ML",
    guessQty: "11 pc",
    guessBase: 11,
    guessUnit: "pc",
    dbName: "Diet Coke @ 50",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "COCO TIN",
    asWritten: "11 · 300 ML",
    guessQty: "11 pc",
    guessBase: 11,
    guessUnit: "pc",
    dbName: "Coke Tin @ 40",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "Limca zero / NimBeerz / Nimbu",
    asWritten: "3 · 400 ML",
    guessQty: "3 pc",
    guessBase: 3,
    guessUnit: "pc",
    dbName: "Nimbu Jeera",
    confidence: "mapped",
    note: "Confirmed Nimbu Jeera, 3 bottles.",
  },
  {
    page: 2,
    writtenName: "Milk AMUL",
    asWritten: "4 packet · 1 LTR",
    guessQty: "4,000 ml",
    guessBase: 4000,
    guessUnit: "ml",
    dbName: "Milk (Tonned)",
    confidence: "mapped",
    note: "Confirmed Milk (Tonned), 4 L.",
  },
  {
    page: 2,
    writtenName: "Thums up",
    asWritten: "13 Bottle · 250 ML",
    guessQty: "13 pc",
    guessBase: 13,
    guessUnit: "pc",
    dbName: "Thumbs Up @ 20",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "minute maid",
    asWritten: "28 Bottle · cost ₹18",
    guessQty: "28 pc",
    guessBase: 28,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Minute Maid",
    createCategory: "Drinks",
    ask: "New item Minute Maid — 28 bottles, cost ₹18. Create when applying stock.",
    note: "User: add Minute Maid, 28 bottles, cost ₹18.",
    manualRatePaisePerBase: 1800,
  },
  {
    page: 2,
    writtenName: "Sprite",
    asWritten: "4 · 250 ML",
    guessQty: "4 pc",
    guessBase: 4,
    guessUnit: "pc",
    dbName: "Sprite @ 20",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "Soda",
    asWritten: "1 · 750 ML",
    guessQty: "750 ml",
    guessBase: 750,
    guessUnit: "ml",
    dbName: "Soda",
    confidence: "mapped",
  },
  {
    page: 2,
    writtenName: "water",
    asWritten: "1 Case + 17 · 12/cas",
    guessQty: "29 pc",
    guessBase: 29,
    guessUnit: "pc",
    dbName: "Water @ 20",
    confidence: "mapped",
    note: "Confirmed 12/case + 17 = 29 bottles → Water @ 20.",
  },
  {
    page: 2,
    writtenName: "Cassatta ice cream",
    asWritten: "2",
    guessQty: "2 pc",
    guessBase: 2,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Cassata",
    createCategory: "Ice Cream",
    ask: "New item Cassata — 2 pieces. Create when applying stock.",
    note: "User: add Cassata, 2 pieces. Sell ₹70, cost ₹67.",
    manualRatePaisePerBase: 6700,
  },
  {
    page: 2,
    writtenName: "ice cream lickleur 10",
    asWritten: "36 · ₹10",
    guessQty: "36 pc",
    guessBase: 36,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Lemon Candy",
    createCategory: "Ice Cream",
    ask: "New item Lemon Candy (like Orange @ 10) — 36 pieces.",
    note: "User: name it Lemon Candy, 36 pc. Rate copied from Orange @ 10.",
    rateFromDbName: "Orange @ 10",
  },
  {
    page: 2,
    writtenName: "Rocket 10",
    asWritten: "6 · Rocket cone ₹10",
    guessQty: "6 pc",
    guessBase: 6,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Rocket Cone @ 10",
    createCategory: "Ice Cream",
    ask: "New item Rocket Cone @ 10 — 6 pieces.",
    note: "User: add Rocket cone ₹10, 6 pieces. Rate copied from Orange @ 10.",
    rateFromDbName: "Orange @ 10",
  },
  {
    page: 2,
    writtenName: "Double magic 25",
    asWritten: "1 · ₹25",
    guessQty: "1 pc",
    guessBase: 1,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Double Magic @ 25",
    createCategory: "Ice Cream",
    ask: "New item Double Magic @ 25 — 1 piece.",
    note: "User: add Double Magic @ 25, 1 pc. Cost ₹23. Royal Rabdi @ 25 also ₹23 (update on apply).",
    manualRatePaisePerBase: 2300,
  },
  {
    page: 2,
    writtenName: "Butter paper",
    asWritten: "1 packet · 100 pc",
    guessQty: "100 pc",
    guessBase: 100,
    guessUnit: "pc",
    dbName: "Butter Paper",
    confidence: "mapped",
    note: "Confirmed 1 packet = 100 pc.",
  },
  {
    page: 2,
    writtenName: "Disposible plate",
    asWritten: "37",
    guessQty: "37 pc",
    guessBase: 37,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Disposable Plate",
    createCategory: "Disposable",
    ask: "New item Disposable Plate — 37 pc.",
    note: "User: add Disposable Plate, 37. Cost ₹5.",
    manualRatePaisePerBase: 500,
  },
  {
    page: 2,
    writtenName: "Potato",
    asWritten: "crossed out / 87 kg written",
    guessQty: "—",
    guessBase: null,
    guessUnit: "g",
    dbName: "Potato",
    confidence: "skip",
    note: "Duplicate. Use page 4: 27 kg.",
  },
  {
    page: 2,
    writtenName: "Onion (Onin)",
    asWritten: "21 kg + 1 Bag (50 kg)  (total blotted)",
    guessQty: "71,000 g",
    guessBase: 71000,
    guessUnit: "g",
    dbName: "Onion",
    confidence: "mapped",
    note: "21 + 50 = 71 kg assumed.",
  },
  {
    page: 2,
    writtenName: "Basmati rice",
    asWritten: "4 Bag + 8 kg · 30 kg/bag",
    guessQty: "128,000 g",
    guessBase: 128000,
    guessUnit: "g",
    dbName: "Basmati Rice",
    confidence: "mapped",
    note: "4×30 + 8 = 128 kg",
  },

  // ── Page 3 ──
  {
    page: 3,
    writtenName: "Tissue",
    asWritten: "12 + 55 packet = 67 pkts",
    guessQty: "67 pc",
    guessBase: 67,
    guessUnit: "pc",
    dbName: "Tissue",
    confidence: "mapped",
    note: "Confirmed 12 + 55 = 67 packets. DB Tissue counted as pc.",
  },
  {
    page: 3,
    writtenName: "Salt",
    asWritten: "13 packet · 1 kg",
    guessQty: "13,000 g",
    guessBase: 13000,
    guessUnit: "g",
    dbName: "Salt",
    confidence: "mapped",
  },
  {
    page: 3,
    writtenName: "Maida",
    asWritten: "125 kg",
    guessQty: "125,000 g",
    guessBase: 125000,
    guessUnit: "g",
    dbName: "Maida",
    confidence: "mapped",
    note: "Confirmed 125 kg.",
  },
  {
    page: 3,
    writtenName: "Cookie crunch = 50",
    asWritten: "3",
    guessQty: "3 pc",
    guessBase: 3,
    guessUnit: "pc",
    dbName: "Cookey Crunch @ 50",
    confidence: "mapped",
  },
  {
    page: 3,
    writtenName: "kesar pissta = 30",
    asWritten: "6 · ₹30",
    guessQty: "6 pc",
    guessBase: 6,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Kesar Pista ice cream @ 30",
    createCategory: "Ice Cream",
    ask: "New item Kesar Pista ice cream @ 30 — 6 pieces.",
    note: "User: add Kesar Pista ice cream @ 30, 6 pc. Rate copied from Rasmalai @ 30.",
    rateFromDbName: "Rasmalai @ 30",
  },
  {
    page: 3,
    writtenName: "cheese",
    asWritten: "10 packet · 1 kg",
    guessQty: "10,000 g",
    guessBase: 10000,
    guessUnit: "g",
    dbName: "Cheese",
    confidence: "mapped",
  },
  {
    page: 3,
    writtenName: "mango geiline / gelato",
    asWritten: "one half · 2 kg · remaining 1 kg",
    guessQty: "1,000 g",
    guessBase: 1000,
    guessUnit: "g",
    dbName: "Mango Gallon",
    confidence: "mapped",
    note: "Confirmed Mango Gallon remaining 1 kg.",
  },
  {
    page: 3,
    writtenName: "Black current",
    asWritten: "one half · 5 LTR · remaining 2.5 kg",
    guessQty: "2,500 g",
    guessBase: 2500,
    guessUnit: "g",
    dbName: "Black Current Gallon",
    confidence: "mapped",
    note: "Confirmed remaining 2.5 kg.",
  },
  {
    page: 3,
    writtenName: "chicken patty",
    asWritten: "14 pieces",
    guessQty: "14 pc",
    guessBase: 14,
    guessUnit: "pc",
    dbName: "Chicken Patty",
    confidence: "mapped",
    note: "Confirmed 14 pieces.",
  },
  {
    page: 3,
    writtenName: "veg patty",
    asWritten: "10 pieces",
    guessQty: "10 pc",
    guessBase: 10,
    guessUnit: "pc",
    dbName: "Veg. Patty",
    confidence: "mapped",
    note: "Confirmed 10 pieces.",
  },
  {
    page: 3,
    writtenName: "Pizza Box large",
    asWritten: "1 bundle · 100 box",
    guessQty: "100 pc",
    guessBase: 100,
    guessUnit: "pc",
    dbName: "Pizza Box (Large)",
    confidence: "mapped",
    note: "Confirmed 1 bundle = 100 boxes.",
  },
  {
    page: 3,
    writtenName: "Pizza Box Small",
    asWritten: "8",
    guessQty: "8 pc",
    guessBase: 8,
    guessUnit: "pc",
    dbName: "Pizza Box (Small)",
    confidence: "mapped",
  },
  {
    page: 3,
    writtenName: "pizza Box medium",
    asWritten: "95 Box",
    guessQty: "95 pc",
    guessBase: 95,
    guessUnit: "pc",
    dbName: "Pizza Box (Medium)",
    confidence: "mapped",
  },
  {
    page: 3,
    writtenName: "Bages packing large",
    asWritten: "1.700 grm",
    guessQty: "1,700 g",
    guessBase: 1700,
    guessUnit: "g",
    dbName: "Packing Bags (Large)",
    confidence: "mapped",
    note: "Read as 1,700 g remaining (not 1.7 g).",
  },
  {
    page: 3,
    writtenName: "Bages medium",
    asWritten: "541 grm",
    guessQty: "541 g",
    guessBase: 541,
    guessUnit: "g",
    dbName: "Packing Bags (Medium)",
    confidence: "mapped",
  },
  {
    page: 3,
    writtenName: "Fork wooden",
    asWritten: "6 packet · 100 pc/pkt",
    guessQty: "600 pc",
    guessBase: 600,
    guessUnit: "pc",
    dbName: "Disposable Fork",
    confidence: "mapped",
    note: "Corrected 6 × 100 = 600 pc.",
  },
  {
    page: 3,
    writtenName: "spoon wooden",
    asWritten: "1 packet · 100 pc/pkt",
    guessQty: "100 pc",
    guessBase: 100,
    guessUnit: "pc",
    dbName: "Disposable Spoon",
    confidence: "mapped",
    note: "Confirmed 1 × 100 = 100 pc.",
  },
  {
    page: 3,
    writtenName: "popcorn Box large",
    asWritten: "59",
    guessQty: "59 pc",
    guessBase: 59,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Popcorn Box (Large)",
    createCategory: "Disposable",
    ask: "New item Popcorn Box (Large) — 59 pc.",
    note: "User: add Popcorn Box (Large), 59. Cost ₹7.",
    manualRatePaisePerBase: 700,
  },
  {
    page: 3,
    writtenName: "popcorn Small",
    asWritten: "52",
    guessQty: "52 pc",
    guessBase: 52,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Popcorn Box (Small)",
    createCategory: "Disposable",
    ask: "New item Popcorn Box (Small) — 52 pc.",
    note: "User: add Popcorn Box (Small), 52. Cost ₹5.",
    manualRatePaisePerBase: 500,
  },
  {
    page: 3,
    writtenName: "Polathene Bag",
    asWritten: "800 grm",
    guessQty: "800 g",
    guessBase: 800,
    guessUnit: "g",
    dbName: "Packing Bags (Small)",
    confidence: "mapped",
    note: "Confirmed Polythene → Packing Bags (Small), 800 g.",
  },
  {
    page: 3,
    writtenName: "paper Bag",
    asWritten: "2 packets",
    guessQty: "2 pc",
    guessBase: 2,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Paper Bag",
    createCategory: "Disposable",
    ask: "New item Paper Bag — 2 packets.",
    note: "User: add Paper bag, two packets. Cost ₹50 per packet.",
    manualRatePaisePerBase: 5000,
  },
  {
    page: 3,
    writtenName: "silver foil / Silver file",
    asWritten: "1 packet · 1 kg",
    guessQty: "1,000 g",
    guessBase: 1000,
    guessUnit: "g",
    dbName: "Silver Foil",
    confidence: "mapped",
    note: "Confirmed 1 kg.",
  },
  {
    page: 3,
    writtenName: "Strips BOX",
    asWritten: "20 Box",
    guessQty: "20 pc",
    guessBase: 20,
    guessUnit: "pc",
    dbName: null,
    confidence: "no-db",
    createName: "Strips Box",
    createCategory: "Disposable",
    ask: "New item Strips Box — 20 pc.",
    note: "User: add Strips Box, 20. Cost ₹8.",
    manualRatePaisePerBase: 800,
  },
  {
    page: 3,
    writtenName: "cleaning file",
    asWritten: "1 bundle · 1 roll",
    guessQty: "1 pc",
    guessBase: 1,
    guessUnit: "pc",
    dbName: "Cling Foil",
    confidence: "mapped",
    note: "Confirmed Cling Foil, 1 roll.",
  },

  // ── Page 4 ──
  {
    page: 4,
    writtenName: "Chat masala",
    asWritten: "9 · 50 GRM",
    guessQty: "450 g",
    guessBase: 450,
    guessUnit: "g",
    dbName: "Chat Masala",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Biryani masala",
    asWritten: "3 · 50 GRM",
    guessQty: "150 g",
    guessBase: 150,
    guessUnit: "g",
    dbName: "Biryani Masala",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "chana masala",
    asWritten: "8 · 50 GRM",
    guessQty: "400 g",
    guessBase: 400,
    guessUnit: "g",
    dbName: "Channa Masala",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Momos masala",
    asWritten: "18 · 50 GRM",
    guessQty: "900 g",
    guessBase: 900,
    guessUnit: "g",
    dbName: "Momos Masala",
    confidence: "mapped",
    note: "Confirmed 18 × 50 g.",
  },
  {
    page: 4,
    writtenName: "meat masala",
    asWritten: "3 · 50 GRM",
    guessQty: "150 g",
    guessBase: 150,
    guessUnit: "g",
    dbName: "Meat Masala",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Black pepper powder",
    asWritten: "2 · 50 GRM",
    guessQty: "100 g",
    guessBase: 100,
    guessUnit: "g",
    dbName: "Black Pepper Powder",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Kasuri methi",
    asWritten: "7 + 1 = 8 · 25 GRM",
    guessQty: "200 g",
    guessBase: 200,
    guessUnit: "g",
    dbName: "Kasoori Methi",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Zeera powder",
    asWritten: "5 · 50 GRM",
    guessQty: "250 g",
    guessBase: 250,
    guessUnit: "g",
    dbName: "Zeera Powder",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "white pepper powder",
    asWritten: "8 · 50 GRM",
    guessQty: "400 g",
    guessBase: 400,
    guessUnit: "g",
    dbName: "White Pepper",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Coriander powder",
    asWritten: "1 · 50 GRM",
    guessQty: "50 g",
    guessBase: 50,
    guessUnit: "g",
    dbName: "Corriandor Powder",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "fish fry masala",
    asWritten: "10 · 50 GRM",
    guessQty: "500 g",
    guessBase: 500,
    guessUnit: "g",
    dbName: "Fish Fry Masala",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "vinger (Vinegar)",
    asWritten: "7 · 610 ML",
    guessQty: "4,270 ml",
    guessBase: 4270,
    guessUnit: "ml",
    dbName: "Vinegar",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Dark Soya Sauce",
    asWritten: "10 · 740 GRM",
    guessQty: "—",
    guessBase: null,
    guessUnit: "g",
    dbName: "Soya Sauce",
    confidence: "skip",
    note: "User: skip. Keep page 1 Soya Sauce only.",
  },
  {
    page: 4,
    writtenName: "Cornflower (Cornflour)",
    asWritten: "3 pocket · 1 kg",
    guessQty: "3,000 g",
    guessBase: 3000,
    guessUnit: "g",
    dbName: "Corn Flour",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Butter (crossed out)",
    asWritten: "scribbled out",
    guessQty: "—",
    guessBase: null,
    guessUnit: "—",
    dbName: "Butter",
    confidence: "skip",
    note: "Crossed out on the page — not counted.",
  },
  {
    page: 4,
    writtenName: "oil",
    asWritten: "15 tins · 13 kg",
    guessQty: "195,000 g",
    guessBase: 195000,
    guessUnit: "g",
    dbName: "Oil",
    confidence: "mapped",
    note: "Confirmed 15 × 13 kg.",
  },
  {
    page: 4,
    writtenName: "Potato",
    asWritten: "27 kg  2 Big 1 Small",
    guessQty: "27,000 g",
    guessBase: 27000,
    guessUnit: "g",
    dbName: "Potato",
    confidence: "mapped",
    note: "Confirmed 27 kg (page 4). Page 2 ignored.",
  },
  {
    page: 4,
    writtenName: "Soya sauce (crossed out)",
    asWritten: "scribbled out",
    guessQty: "—",
    guessBase: null,
    guessUnit: "—",
    dbName: "Soya Sauce",
    confidence: "skip",
    note: "Crossed out — not counted.",
  },
  {
    page: 4,
    writtenName: "Garlic",
    asWritten: "11 kg",
    guessQty: "11,000 g",
    guessBase: 11000,
    guessUnit: "g",
    dbName: "Garlic",
    confidence: "mapped",
  },
  {
    page: 4,
    writtenName: "Halal Chicken",
    asWritten: "22 packet · 2 kg each",
    guessQty: "44,000 g",
    guessBase: 44000,
    guessUnit: "g",
    dbName: "Frozen Chicken Boneless",
    confidence: "mapped",
    note: "Confirmed Frozen Chicken Boneless, 22 × 2 kg.",
  },
  {
    page: 4,
    writtenName: "fish",
    asWritten: "4 packet · 5 kg each",
    guessQty: "20,000 g",
    guessBase: 20000,
    guessUnit: "g",
    dbName: "Frozen Fish",
    confidence: "mapped",
    note: "Confirmed Frozen Fish, 4 × 5 kg.",
  },
  {
    page: 4,
    writtenName: "Gas 15.4",
    asWritten: "1 cylinder full · 15.4 kg",
    guessQty: "15,400 g",
    guessBase: 15400,
    guessUnit: "g",
    dbName: "GAS",
    confidence: "mapped",
    note: "1 × 15.4 kg cylinder.",
  },
  {
    page: 4,
    writtenName: "Gas 19.3",
    asWritten: "2 cylinders · 19.3 kg each",
    guessQty: "38,600 g",
    guessBase: 38600,
    guessUnit: "g",
    dbName: "GAS",
    confidence: "mapped",
    note: "2 × 19.3 kg. Combined GAS = 54 kg with 15.4.",
  },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtStock(n: number, unit: string): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (unit === "g" || unit === "ml") {
    if (abs >= 1000) {
      const scaled = abs / 1000;
      const u = unit === "g" ? "kg" : "L";
      return `${sign}${scaled.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${u}`;
    }
  }
  return `${sign}${abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unit}`;
}

function fmtCost(ratePaisePerBase: number, unit: string): string {
  if (!Number.isFinite(ratePaisePerBase) || ratePaisePerBase <= 0) return "—";
  if (unit === "g") return `${formatRupees(ratePaisePerBase * 1000)}/kg`;
  if (unit === "ml") return `${formatRupees(ratePaisePerBase * 1000)}/L`;
  return `${formatRupees(ratePaisePerBase)}/${unit}`;
}

function money(paise: number | null): string {
  if (paise === null || !Number.isFinite(paise)) return "—";
  return formatRupees(Math.round(paise));
}

function confLabel(c: Confidence): string {
  if (c === "mapped") return "Mapped";
  if (c === "ask") return "Ask you";
  if (c === "no-db") return "New item";
  return "Skipped";
}

const PAGE_TITLES: Record<number, string> = {
  1: "Page 1 — sauces, ghee, olives, mojito syrups, Pepsi / Dew",
  2: "Page 2 — drinks, noodles, ice cream, veg, rice",
  3: "Page 3 — tissue, maida, cheese, packing, boxes",
  4: "Page 4 — masalas, oil, chicken, fish, gas",
};

async function main() {
  const prisma = new PrismaClient();
  const [invSettings, dbItems] = await Promise.all([
    ensureInventorySettings(prisma),
    prisma.inventoryItem.findMany({
      where: { active: true },
      select: {
        name: true,
        category: true,
        baseUnit: true,
        stockOnHandBase: true,
        avgCostPaisePerBase: true,
        lastPurchasePaisePerBase: true,
      },
    }),
  ]);
  await prisma.$disconnect();

  const dbByName = new Map(dbItems.map((i) => [i.name, i]));
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  function rateForLine(l: Line): { rate: number; unit: string } {
    const db = l.dbName ? dbByName.get(l.dbName) : undefined;
    if (db) {
      const r = Number(itemUnitCostPaisePerBase(db, invSettings.costingMethod));
      if (r > 0) return { rate: r, unit: db.baseUnit };
    }
    if (l.rateFromDbName) {
      const ref = dbByName.get(l.rateFromDbName);
      if (ref) {
        const r = Number(itemUnitCostPaisePerBase(ref, invSettings.costingMethod));
        if (r > 0) return { rate: r, unit: ref.baseUnit };
      }
    }
    if (l.manualRatePaisePerBase && l.manualRatePaisePerBase > 0) {
      return { rate: l.manualRatePaisePerBase, unit: l.guessUnit };
    }
    return { rate: 0, unit: db?.baseUnit ?? l.guessUnit };
  }

  let shopNowPaise = 0;
  for (const item of dbItems) {
    const rate = Number(itemUnitCostPaisePerBase(item, invSettings.costingMethod));
    const qty = Number(item.stockOnHandBase);
    if (rate > 0 && Number.isFinite(qty)) shopNowPaise += qty * rate;
  }

  const uniqueCurrent = new Map<string, number>();
  let proposedPaise = 0;
  let proposedMissingRate = 0;
  let currentMissingRate = 0;

  type Built = {
    l: Line;
    oldStock: number | null;
    oldUnit: string | null;
    dbMissing: boolean;
    status: Confidence;
    rate: number;
    rateUnit: string;
    currentPaise: number | null;
    proposedPaise: number | null;
  };
  const built: Built[] = [];

  for (const l of LINES) {
    const db = l.dbName ? dbByName.get(l.dbName) : undefined;
    const dbMissing = Boolean(l.dbName) && !db;
    const oldStock = db ? Number(db.stockOnHandBase) : null;
    const oldUnit = db?.baseUnit ?? null;
    const status = (dbMissing && l.confidence === "mapped" ? "ask" : l.confidence) as Confidence;
    const { rate, unit: rateUnit } = rateForLine(l);
    const currentPaise =
      oldStock !== null && rate > 0 ? oldStock * rate : oldStock !== null && rate <= 0 ? null : null;
    const proposedOk = l.confidence !== "skip" && l.guessBase !== null && rate > 0;
    const lineProposed = proposedOk ? l.guessBase! * rate : l.confidence !== "skip" && l.guessBase !== null && rate <= 0 ? null : null;

    if (l.confidence !== "skip" && l.dbName && currentPaise !== null && !uniqueCurrent.has(l.dbName)) {
      uniqueCurrent.set(l.dbName, currentPaise);
    }
    if (l.confidence !== "skip" && l.dbName && oldStock !== null && rate <= 0) currentMissingRate += 1;
    if (proposedOk) proposedPaise += lineProposed ?? 0;
    else if (l.confidence !== "skip" && l.guessBase !== null && rate <= 0) proposedMissingRate += 1;

    built.push({
      l,
      oldStock,
      oldUnit,
      dbMissing,
      status,
      rate,
      rateUnit,
      currentPaise: oldStock !== null && rate > 0 ? currentPaise : oldStock !== null ? null : null,
      proposedPaise: lineProposed,
    });
  }

  const sheetNowPaise = [...uniqueCurrent.values()].reduce((s, n) => s + n, 0);

  const counts = {
    total: LINES.length,
    mapped: LINES.filter((l) => l.confidence === "mapped").length,
    ask: LINES.filter((l) => l.confidence === "ask").length,
    nodb: LINES.filter((l) => l.confidence === "no-db").length,
    skip: LINES.filter((l) => l.confidence === "skip").length,
  };

  const newItems = LINES.filter((l) => l.confidence === "no-db");
  const newItemsHtml = newItems
    .map((l) => {
      return `<li>
        <strong>P${l.page} · ${escapeHtml(l.writtenName)}</strong>
        <span class="q-written">${escapeHtml(l.guessQty)} · ${escapeHtml(l.note ?? l.ask ?? "")}</span>
      </li>`;
    })
    .join("\n");

  const rowChunks: string[] = [];
  let lastPage = 0;
  let pageLine = 0;
  for (const b of built) {
    const l = b.l;
    if (l.page !== lastPage) {
      lastPage = l.page;
      pageLine = 0;
      const pageCount = LINES.filter((x) => x.page === l.page).length;
      rowChunks.push(`<tr class="page-head" data-page="${l.page}" data-conf="section" data-search="page ${l.page}">
        <td colspan="12">${escapeHtml(PAGE_TITLES[l.page] ?? `Page ${l.page}`)} · ${pageCount} lines</td>
      </tr>`);
    }
    pageLine += 1;
    const dbCol =
      l.confidence === "no-db"
        ? `<em>will create</em>`
        : l.dbName
          ? `${escapeHtml(l.dbName)}${b.dbMissing ? ' <span class="pill pill-ask">name missing</span>' : ""}`
          : '<span class="muted">—</span>';
    const costHtml =
      b.rate > 0
        ? escapeHtml(fmtCost(b.rate, b.rateUnit))
        : '<span class="muted">no rate</span>';

    rowChunks.push(`<tr class="row-${b.status}" data-page="${l.page}" data-conf="${l.confidence}"
      data-search="${escapeHtml(`${l.writtenName} ${l.asWritten} ${l.dbName ?? ""} ${l.ask ?? ""} ${l.note ?? ""}`.toLowerCase())}">
      <td class="num">${pageLine}</td>
      <td>P${l.page}</td>
      <td><strong>${escapeHtml(l.writtenName)}</strong></td>
      <td class="written">${escapeHtml(l.asWritten)}</td>
      <td>${escapeHtml(l.guessQty)}</td>
      <td>${
        b.oldStock !== null && b.oldUnit
          ? escapeHtml(fmtStock(b.oldStock, b.oldUnit))
          : '<span class="muted">—</span>'
      }</td>
      <td class="money">${costHtml}</td>
      <td class="money">${b.currentPaise !== null ? escapeHtml(money(b.currentPaise)) : '<span class="muted">—</span>'}</td>
      <td class="money">${b.proposedPaise !== null ? escapeHtml(money(b.proposedPaise)) : '<span class="muted">—</span>'}</td>
      <td>${dbCol}</td>
      <td><span class="pill pill-${l.confidence}">${confLabel(l.confidence)}</span></td>
      <td class="note">${escapeHtml(l.note ?? l.ask ?? "—")}</td>
    </tr>`);
  }
  const rowsHtml = rowChunks.join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KHAANZ — Handwritten stock mapping (preview)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --brand: #b91c1c;
      --ink: #1c1917;
      --muted: #78716c;
      --border: #e7e5e4;
      --white: #fff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-height: 100%; }
    body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #d6d3d1; color: var(--ink); }
    .toolbar {
      display: flex; justify-content: space-between; gap: 1rem; align-items: center;
      padding: 0.4rem 0.85rem; background: rgba(28,25,23,.94); color: #fafaf9;
    }
    .toolbar h1 { font-size: 0.85rem; }
    .toolbar p { display: none; }
    .page { max-width: 1480px; margin: 0 auto; padding: 0.45rem 0.75rem 0.75rem; }
    .banner { display: none; }
    .controls {
      display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
      background: var(--white); border: 1px solid var(--border); border-radius: 0.5rem;
      padding: 0.35rem 0.55rem; margin-bottom: 0.45rem;
    }
    input, select {
      font: inherit; font-size: 0.85rem; border: 1px solid var(--border); border-radius: 0.45rem; padding: 0.3rem 0.45rem;
    }
    input { min-width: 160px; }
    .wrap {
      height: calc(100vh - 168px);
      min-height: 280px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--white);
      -webkit-overflow-scrolling: touch;
    }
    .totals {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem;
      margin-bottom: 0.45rem;
    }
    .tot {
      background: var(--white); border: 1px solid var(--border); border-radius: 0.5rem;
      padding: 0.4rem 0.65rem;
    }
    .tot span { display: block; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
    .tot strong { font-size: 1.05rem; }
    .tot em { font-style: normal; font-size: 0.72rem; color: var(--muted); }
    td.money, th.money { text-align: right; white-space: nowrap; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--white); }
    th, td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--border); font-size: 0.82rem; vertical-align: top; }
    th {
      text-align: left; background: #f5f5f4; font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: .04em; color: var(--muted); position: sticky; top: 0; z-index: 2;
    }
    .num { color: var(--muted); width: 2.2rem; }
    .written { color: #44403c; max-width: 280px; }
    .note { max-width: 340px; color: #44403c; }
    .muted { color: var(--muted); }
    .pill { display: inline-block; border-radius: 999px; padding: 0.12rem 0.5rem; font-size: 0.72rem; font-weight: 600; }
    .pill-mapped { background: #ecfdf5; color: #047857; }
    .pill-ask { background: #fff7ed; color: #c2410c; }
    .pill-no-db { background: #eff6ff; color: #1d4ed8; }
    .pill-skip { background: #f5f5f4; color: #78716c; }
    tr.row-skip { opacity: 0.7; }
    tr.page-head td {
      background: #1c1917; color: #fafaf9; font-weight: 700; font-size: 0.82rem;
      letter-spacing: 0.02em; padding: 0.7rem 0.65rem;
    }
    tr.hidden { display: none; }
    .ask-box {
      background: var(--white); border: 1px solid var(--border); border-radius: 0.75rem;
      padding: 0.5rem 1rem; margin-top: 0.5rem;
    }
    .ask-box summary { cursor: pointer; font-size: 0.9rem; font-weight: 700; }
    .ask-box ol { padding: 0.5rem 0 0.2rem 1.2rem; display: grid; gap: 0.4rem; }
    .ask-box li { font-size: 0.85rem; }
    .ask-box .q-written { display: block; color: var(--muted); font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>Handwritten stock → DB mapping</h1>
      <p>Preview only · no database writes · generated ${escapeHtml(generatedAt)}</p>
    </div>
  </div>
  <div class="page">
    <div class="banner">
      Notebook order P1 → P4. Preview only — nothing written to the DB yet.
    </div>
    <div class="controls">
      <input id="q" type="search" placeholder="Search item…" />
      <select id="page">
        <option value="">All pages (notebook order)</option>
        <option value="1">Page 1</option>
        <option value="2">Page 2</option>
        <option value="3">Page 3</option>
        <option value="4">Page 4</option>
      </select>
      <select id="conf">
        <option value="">All statuses</option>
        <option value="mapped">Mapped</option>
        <option value="no-db">New items</option>
        <option value="skip">Skipped</option>
      </select>
      <span class="muted">${counts.total} lines · ${counts.mapped} mapped · ${counts.nodb} new · ${counts.skip} skipped · costing ${escapeHtml(invSettings.costingMethod)}</span>
    </div>
    <div class="totals">
      <div class="tot"><span>Whole shop now (all DB items)</span><strong>${escapeHtml(money(shopNowPaise))}</strong></div>
      <div class="tot"><span>These sheet items now (unique DB)</span><strong>${escapeHtml(money(sheetNowPaise))}</strong><em>${currentMissingRate ? ` · ${currentMissingRate} lines have no rate` : ""}</em></div>
      <div class="tot"><span>This count (proposed qty × cost)</span><strong>${escapeHtml(money(proposedPaise))}</strong><em>${proposedMissingRate ? ` · ${proposedMissingRate} lines have no rate` : ""}</em></div>
    </div>
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Page</th>
            <th>Written name</th>
            <th>As written</th>
            <th>Proposed qty</th>
            <th>Current DB stock</th>
            <th class="money">Cost</th>
            <th class="money">Value now</th>
            <th class="money">Count value</th>
            <th>DB item</th>
            <th>Status</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    <details class="ask-box">
      <summary>New items to create (${newItems.length})</summary>
      <ol>${newItemsHtml}</ol>
    </details>
  </div>
  <script>
    const q = document.getElementById("q");
    const page = document.getElementById("page");
    const conf = document.getElementById("conf");
    function apply() {
      const s = q.value.trim().toLowerCase();
      const p = page.value;
      const c = conf.value;
      document.querySelectorAll("tbody tr").forEach((tr) => {
        const okPage = !p || tr.dataset.page === p;
        const okConf = !c || tr.dataset.conf === c || tr.dataset.conf === "section";
        const okQ = !s || (tr.dataset.search || "").includes(s);
        tr.classList.toggle("hidden", !(okPage && okConf && okQ));
      });
    }
    q.addEventListener("input", apply);
    page.addEventListener("change", apply);
    conf.addEventListener("change", apply);
  </script>
</body>
</html>`;

  const outPath = join(process.cwd(), "samples/handwritten-stock-mapping.html");
  writeFileSync(outPath, html);
  console.log(`Wrote ${outPath}`);
  console.log(counts);
}

if (process.argv[1]?.includes("generate-handwritten-stock-html")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
