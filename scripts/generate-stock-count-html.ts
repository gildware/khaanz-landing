/**
 * Generates a browser-viewable stock count sheet from handwritten inventory
 * notes, compared against live DB stock. No DB writes.
 *
 * Run: npx tsx scripts/generate-stock-count-html.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { itemUnitCostPaisePerBase } from "../src/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "../src/lib/inventory/inventory-settings";
import { formatRupees, formatRecipeCostRupees } from "../src/lib/payroll/payroll-utils";
import { getPrisma } from "../src/lib/prisma";

type SheetRow = {
  name: string;
  packSize?: string;
  asWritten: string;
  /** Human-readable calculated total */
  listQty: string;
  /** Base qty for numeric compare (null if blank/unparseable) */
  listBase: number | null;
  listUnit: string;
  dbName: string | null;
  /** Paise per base unit when item is not in DB yet (HTML preview only). */
  manualRatePaisePerBase?: number;
  /** Copy unit cost from another DB item at generate time. */
  manualRateFromDbName?: string;
};

type SheetSection = {
  title: string;
  rows: SheetRow[];
};

/** Handwritten stock sheets (Jul 2026) — list side only; dbName is best DB match. */
const SECTIONS: SheetSection[] = [
  {
    title: "Sauces",
    rows: [
      { name: "Green Chilli Sauce", packSize: "650g", asWritten: "18 + 2 + 500g", listQty: "13,500 g", listBase: 13500, listUnit: "g", dbName: "Green Chilli Sauce" },
      { name: "Soya Sauce", packSize: "740g", asWritten: "1 + 6 + 500g", listQty: "5,680 g", listBase: 5680, listUnit: "g", dbName: "Soya Sauce" },
      { name: "Schezwan Sauce", packSize: "1.13 kg", asWritten: "36 + 8 + 650g", listQty: "50,370 g", listBase: 50370, listUnit: "g", dbName: "Schezwan Sauce" },
      { name: "Pizza Pasta Sauce", packSize: "1 kg", asWritten: "13 + 24 + 1 + 550g", listQty: "38,550 g", listBase: 38550, listUnit: "g", dbName: "Pizza Pasta Sauce" },
      { name: "Mayonnaise", packSize: "1 kg", asWritten: "21 + 2 + 2", listQty: "25,000 g", listBase: 25000, listUnit: "g", dbName: "Mayonnaise" },
      { name: "Tomato Sauce", packSize: "1.14 kg", asWritten: "9 + 410g", listQty: "10,670 g", listBase: 10670, listUnit: "g", dbName: "Tomato Sauce" },
      { name: "Ketchup OP", packSize: "72 pc/pkt · ₹60", asWritten: "4 pkt", listQty: "288 pc", listBase: 288, listUnit: "pc", dbName: "Ketchup", manualRatePaisePerBase: 6000 / 72 },
      { name: "Vinegar", packSize: "610 ml", asWritten: "8 + 100ml", listQty: "4,980 ml", listBase: 4980, listUnit: "ml", dbName: "Vinegar" },
      { name: "Tandoori Mayonnaise", packSize: "1 kg", asWritten: "6 kg + 430g", listQty: "6,430 g", listBase: 6430, listUnit: "g", dbName: "Tandoori Mayonnaise" },
      { name: "Pickle", packSize: "—", asWritten: "530 g", listQty: "530 g", listBase: 530, listUnit: "g", dbName: "Pickle", manualRatePaisePerBase: 7 },
      { name: "Honey", packSize: "—", asWritten: "40g", listQty: "40 g", listBase: 40, listUnit: "g", dbName: "Honey" },
    ],
  },
  {
    title: "Beverages & Water",
    rows: [
      { name: "Water", packSize: "₹10", asWritten: "35 + 1", listQty: "36 pc", listBase: 36, listUnit: "pc", dbName: "Water @10" },
      { name: "Water", packSize: "₹20", asWritten: "180 + 25 + 4", listQty: "209 pc", listBase: 209, listUnit: "pc", dbName: "Water @ 20" },
      { name: "Thums Up", packSize: "₹20 (250 ml)", asWritten: "28 + 14", listQty: "42 pc", listBase: 42, listUnit: "pc", dbName: "Thumbs Up @ 20" },
      { name: "Coca Cola", packSize: "₹20 (250 ml)", asWritten: "27", listQty: "27 pc", listBase: 27, listUnit: "pc", dbName: "Coca Cola @ 20" },
      { name: "Dew", packSize: "₹20 (250 ml)", asWritten: "31", listQty: "31 pc", listBase: 31, listUnit: "pc", dbName: "Dew @ 20" },
      { name: "Pepsi", packSize: "₹20 (400 ml)", asWritten: "30", listQty: "30 pc", listBase: 30, listUnit: "pc", dbName: "Pepsi @ 20" },
      { name: "Slice", packSize: "₹20 (350 ml)", asWritten: "6 + 1", listQty: "7 pc", listBase: 7, listUnit: "pc", dbName: "Slice @ 20" },
      { name: "Sting", packSize: "₹20 (300 ml)", asWritten: "2", listQty: "2 pc", listBase: 2, listUnit: "pc", dbName: "Sting @ 20" },
      { name: "Nimbu Jeera", packSize: "₹20 (400 ml)", asWritten: "13", listQty: "13 pc", listBase: 13, listUnit: "pc", dbName: null, manualRatePaisePerBase: 1750 },
      { name: "Coca Cola Tin", packSize: "₹40 (300 ml)", asWritten: "16", listQty: "16 pc", listBase: 16, listUnit: "pc", dbName: "Coke Tin @ 40" },
      { name: "Sprite", packSize: "₹20 (250 ml)", asWritten: "9", listQty: "9 pc", listBase: 9, listUnit: "pc", dbName: "Sprite @ 20" },
      { name: "Amul Kool", packSize: "₹30 (180 ml)", asWritten: "11", listQty: "11 pc", listBase: 11, listUnit: "pc", dbName: "Amul Kool @ 30" },
      { name: "Milk (Tonned)", packSize: "1 L", asWritten: "2 pcs", listQty: "2,000 ml", listBase: 2000, listUnit: "ml", dbName: "Milk (Tonned)" },
      { name: "Soda", packSize: "₹20 (1 L)", asWritten: "11", listQty: "11,000 ml", listBase: 11000, listUnit: "ml", dbName: "Soda" },
      { name: "Sprite", packSize: "₹30 (500 ml)", asWritten: "4", listQty: "4 pc", listBase: 4, listUnit: "pc", dbName: "Sprite @ 30" },
      { name: "Real Mango Juice", packSize: "—", asWritten: "0", listQty: "0 pc", listBase: 0, listUnit: "pc", dbName: "Ek Dum Aam @ 30" },
    ],
  },
  {
    title: "Spices",
    rows: [
      { name: "Momos Masala", packSize: "50g", asWritten: "25 pcs", listQty: "1,250 g", listBase: 1250, listUnit: "g", dbName: "Momos Masala" },
      { name: "Garam Masala", packSize: "50g", asWritten: "8 + 4 + 1", listQty: "650 g", listBase: 650, listUnit: "g", dbName: "Garam Masala" },
      { name: "Kitchen King", packSize: "100g", asWritten: "5 pcs", listQty: "500 g", listBase: 500, listUnit: "g", dbName: "Kitchen King" },
      { name: "White Pepper", packSize: "50g", asWritten: "4 pcs", listQty: "200 g", listBase: 200, listUnit: "g", dbName: "White Pepper" },
      { name: "Black Pepper", packSize: "50g", asWritten: "7 + 1", listQty: "400 g", listBase: 400, listUnit: "g", dbName: "Black Pepper Powder" },
      { name: "Corriandor Powder", packSize: "50g", asWritten: "6 pcs", listQty: "300 g", listBase: 300, listUnit: "g", dbName: "Corriandor Powder" },
      { name: "Jeera Powder", packSize: "50g", asWritten: "4 pcs", listQty: "200 g", listBase: 200, listUnit: "g", dbName: "Zeera Powder" },
      { name: "Meat Masala", packSize: "50g", asWritten: "3 + 9", listQty: "600 g", listBase: 600, listUnit: "g", dbName: "Meat Masala" },
      { name: "Chat Masala", packSize: "50g", asWritten: "5 pcs", listQty: "250 g", listBase: 250, listUnit: "g", dbName: "Chat Masala" },
      { name: "Kasoori Methi", packSize: "25g", asWritten: "5 pcs", listQty: "125 g", listBase: 125, listUnit: "g", dbName: "Kasoori Methi" },
      { name: "Fish Fry Masala", packSize: "50g", asWritten: "5 pcs", listQty: "250 g", listBase: 250, listUnit: "g", dbName: "Fish Fry Masala" },
      { name: "Channa Masala", packSize: "50g", asWritten: "9 pcs", listQty: "450 g", listBase: 450, listUnit: "g", dbName: "Channa Masala" },
      { name: "Biryani Masala", packSize: "50g", asWritten: "8 + 1", listQty: "450 g", listBase: 450, listUnit: "g", dbName: "Biryani Masala" },
      { name: "Red Chilli Powder", packSize: "500g", asWritten: "1 + 2 + 110g", listQty: "1,110 g", listBase: 1110, listUnit: "g", dbName: "Red Chilli Powder" },
      { name: "Ajina Moto", packSize: "0.5 kg", asWritten: "9 pcs", listQty: "4,500 g", listBase: 4500, listUnit: "g", dbName: "Ajina Moto" },
      { name: "Salt", packSize: "1 kg", asWritten: "26 kg", listQty: "26,000 g", listBase: 26000, listUnit: "g", dbName: "Salt" },
      { name: "Tandoori Masala", packSize: "500g", asWritten: "360g", listQty: "360 g", listBase: 360, listUnit: "g", dbName: "Tandoori Masala", manualRatePaisePerBase: 44 },
      { name: "Peri Peri Masala", packSize: "500g", asWritten: "180g", listQty: "180 g", listBase: 180, listUnit: "g", dbName: "Peri Peri Masla" },
      { name: "Aromatic Mix", packSize: "—", asWritten: "420g", listQty: "420 g", listBase: 420, listUnit: "g", dbName: "Aromatic Mix" },
      { name: "Black Salt", packSize: "1 kg", asWritten: "1 pkt", listQty: "1,000 g", listBase: 1000, listUnit: "g", dbName: null, manualRatePaisePerBase: 19 },
      { name: "Yellow Mirchi", packSize: "—", asWritten: "260g", listQty: "260 g", listBase: 260, listUnit: "g", dbName: null, manualRatePaisePerBase: 50 },
      { name: "Garlic Powder", packSize: "—", asWritten: "40g", listQty: "40 g", listBase: 40, listUnit: "g", dbName: "Garlic powder" },
      { name: "Baking Soda", packSize: "—", asWritten: "650g", listQty: "650 g", listBase: 650, listUnit: "g", dbName: "Baking Soda" },
    ],
  },
  {
    title: "Dry",
    rows: [
      { name: "Basmati Rice", packSize: "30 kg bag", asWritten: "81.7 kg", listQty: "81,700 g", listBase: 81700, listUnit: "g", dbName: "Basmati Rice" },
      { name: "Plain Rice", packSize: "—", asWritten: "52.5 kg", listQty: "52,500 g", listBase: 52500, listUnit: "g", dbName: "Plain Rice", manualRatePaisePerBase: 4 },
      { name: "Cornflour", packSize: "—", asWritten: "7 kg", listQty: "7,000 g", listBase: 7000, listUnit: "g", dbName: "Corn Flour" },
      { name: "Noodles", packSize: "650g", asWritten: "6 pkt", listQty: "3,900 g", listBase: 3900, listUnit: "g", dbName: "Noodles" },
      { name: "Soya Chunks", packSize: "—", asWritten: "10.769 kg", listQty: "10,769 g", listBase: 10769, listUnit: "g", dbName: "Soya Granules" },
      { name: "Pipal Mirchi", packSize: "—", asWritten: "3 kg", listQty: "3,000 g", listBase: 3000, listUnit: "g", dbName: "Pipla Mirchi" },
      { name: "Maida", packSize: "—", asWritten: "119.65 kg", listQty: "119,650 g", listBase: 119650, listUnit: "g", dbName: "Maida" },
      { name: "Atta", packSize: "—", asWritten: "6.7 kg", listQty: "6,700 g", listBase: 6700, listUnit: "g", dbName: "Atta" },
      { name: "Basmati Rice", packSize: "5 kg bag", asWritten: "15 kg", listQty: "15,000 g", listBase: 15000, listUnit: "g", dbName: "Basmati Rice" },
      { name: "Sugar", packSize: "—", asWritten: "1 kg", listQty: "1,000 g", listBase: 1000, listUnit: "g", dbName: "Sugar" },
      { name: "Suji", packSize: "—", asWritten: "400g", listQty: "400 g", listBase: 400, listUnit: "g", dbName: "Sooji" },
    ],
  },
  {
    title: "Vegetables",
    rows: [
      { name: "Garlic", packSize: "—", asWritten: "36.8 kg", listQty: "36,800 g", listBase: 36800, listUnit: "g", dbName: "Garlic" },
      { name: "Potato", packSize: "—", asWritten: "44.15 kg", listQty: "44,150 g", listBase: 44150, listUnit: "g", dbName: "Potato" },
      { name: "Onion", packSize: "—", asWritten: "32.18 kg", listQty: "32,180 g", listBase: 32180, listUnit: "g", dbName: "Onion" },
      { name: "Tomato", packSize: "—", asWritten: "140g + 590g", listQty: "730 g", listBase: 730, listUnit: "g", dbName: "Tomato" },
      { name: "Cabbage", packSize: "—", asWritten: "2.26 kg + 290g", listQty: "2,550 g", listBase: 2550, listUnit: "g", dbName: "Cabbage" },
      { name: "Capsicum", packSize: "—", asWritten: "1.079 kg", listQty: "1,079 g", listBase: 1079, listUnit: "g", dbName: "Capsicum" },
      { name: "Carrot", packSize: "—", asWritten: "38g", listQty: "38 g", listBase: 38, listUnit: "g", dbName: "Carrot" },
      { name: "Green Chilli", packSize: "—", asWritten: "370g", listQty: "370 g", listBase: 370, listUnit: "g", dbName: "Green Chilli" },
      { name: "Dhaniya", packSize: "—", asWritten: "0", listQty: "0 g", listBase: 0, listUnit: "g", dbName: "Dhaniya" },
      { name: "Lemon", packSize: "—", asWritten: "317g", listQty: "317 g", listBase: 317, listUnit: "g", dbName: "Lemon" },
    ],
  },
  {
    title: "Others",
    rows: [
      { name: "Gas (LPG)", packSize: "—", asWritten: "81.3 kg", listQty: "81,300 g", listBase: 81300, listUnit: "g", dbName: "GAS" },
      { name: "Oil", packSize: "13 kg tin", asWritten: "17 tin", listQty: "221,000 g", listBase: 221000, listUnit: "g", dbName: "Oil" },
    ],
  },
  {
    title: "Egg & Dairy",
    rows: [
      { name: "Fresh Cream", packSize: "250 ml/pc · ₹96", asWritten: "5 pcs", listQty: "1,250 ml", listBase: 1250, listUnit: "ml", dbName: "Fresh Cream", manualRatePaisePerBase: 9600 / 250 },
      { name: "Cheese", packSize: "2 kg", asWritten: "6.215 kg", listQty: "6,215 g", listBase: 6215, listUnit: "g", dbName: "Cheese" },
      { name: "Butter", packSize: "—", asWritten: "117 pcs", listQty: "117 pc", listBase: 117, listUnit: "pc", dbName: "Butter" },
      { name: "Ghee", packSize: "1 kg", asWritten: "1", listQty: "1,000 g", listBase: 1000, listUnit: "g", dbName: "Ghee" },
      { name: "Eggs", packSize: "—", asWritten: "2 pcs", listQty: "2 pc", listBase: 2, listUnit: "pc", dbName: "Egg" },
      { name: "Curd", packSize: "—", asWritten: "0", listQty: "0 g", listBase: 0, listUnit: "g", dbName: "Curd" },
    ],
  },
  {
    title: "Chicken & Fish",
    rows: [
      { name: "Chicken Boneless", packSize: "2 kg pkt", asWritten: "58 pkts", listQty: "116,000 g", listBase: 116000, listUnit: "g", dbName: "Chicken Boneless" },
      { name: "Chicken With Bone", packSize: "—", asWritten: "6.600 kg", listQty: "6,600 g", listBase: 6600, listUnit: "g", dbName: "Chicken With Bone" },
      { name: "Chicken Leg Piece", packSize: "2 kg pkt", asWritten: "4 pkt (8 kg)", listQty: "8,000 g", listBase: 8000, listUnit: "g", dbName: null, manualRateFromDbName: "Chicken Boneless" },
      { name: "Fish Boneless", packSize: "—", asWritten: "10.2 kg", listQty: "10,200 g", listBase: 10200, listUnit: "g", dbName: "Fish" },
    ],
  },
  {
    title: "Ice Cream",
    rows: [
      { name: "Orange", packSize: "₹10", asWritten: "7", listQty: "7 pc", listBase: 7, listUnit: "pc", dbName: "Orange @ 10" },
      { name: "Chillz", packSize: "₹36", asWritten: "10 + 1", listQty: "11 pc", listBase: 11, listUnit: "pc", dbName: "Chillz Amlond @ 40", manualRatePaisePerBase: 3600 },
      { name: "Chocolate Cone", packSize: "₹40", asWritten: "10", listQty: "10 pc", listBase: 10, listUnit: "pc", dbName: "Choco Cone @ 40" },
      { name: "Cookie Crunch", packSize: "₹50", asWritten: "10", listQty: "10 pc", listBase: 10, listUnit: "pc", dbName: "Cookey Crunch @ 50" },
      { name: "Rasmalai", packSize: "₹27", asWritten: "1", listQty: "1 pc", listBase: 1, listUnit: "pc", dbName: "Rasmalai @ 30", manualRatePaisePerBase: 2700 },
      { name: "Vanilla Gallon", packSize: "2.1 kg", asWritten: "4 pc (8.4 kg)", listQty: "8,400 g", listBase: 8400, listUnit: "g", dbName: "Vanilla Gallon" },
      { name: "Black Currant Gallon", packSize: "5 L", asWritten: "1 pc (2.709 kg)", listQty: "2,709 g", listBase: 2709, listUnit: "g", dbName: "Black Current Gallon" },
      { name: "Chocolate Gallon", packSize: "5 L", asWritten: "1 pc (2.490 kg)", listQty: "2,490 g", listBase: 2490, listUnit: "g", dbName: "Chocolate Gallon" },
      { name: "Mango Gallon", packSize: "2.1 kg", asWritten: "1 pc + 880g", listQty: "2,980 g", listBase: 2980, listUnit: "g", dbName: "Mango Gallon" },
      { name: "Strawberry Gallon", packSize: "2.1 kg", asWritten: "2 pc (4.2 kg)", listQty: "4,200 g", listBase: 4200, listUnit: "g", dbName: "Strawberry Gallon" },
    ],
  },
  {
    title: "Frozen",
    rows: [
      { name: "Chicken Patty", packSize: "20 pc", asWritten: "11", listQty: "11 pc", listBase: 11, listUnit: "pc", dbName: "Chicken Patty" },
      { name: "Veg Patty", packSize: "20 pc", asWritten: "24", listQty: "24 pc", listBase: 24, listUnit: "pc", dbName: "Veg. Patty" },
      { name: "French Fries", packSize: "2.5 kg bag", asWritten: "5.5 kg", listQty: "5,500 g", listBase: 5500, listUnit: "g", dbName: null, manualRatePaisePerBase: 14 },
      { name: "Sweet Corn", packSize: "—", asWritten: "500g", listQty: "500 g", listBase: 500, listUnit: "g", dbName: "Sweet Corn", manualRatePaisePerBase: 15 },
    ],
  },
  {
    title: "Mojitos & Shakes",
    rows: [
      { name: "Chocolate Syrup", packSize: "1.43 L", asWritten: "1,180g", listQty: "1,180 g", listBase: 1180, listUnit: "g", dbName: "Chocolate Syrup" },
      { name: "Mango Crush", packSize: "1 L", asWritten: "600 ml", listQty: "600 ml", listBase: 600, listUnit: "ml", dbName: "Mango Crush" },
      { name: "Strawberry Crush", packSize: "1 L", asWritten: "1,100 ml", listQty: "1,100 g", listBase: 1100, listUnit: "g", dbName: "Strawberry Crush", manualRatePaisePerBase: 20 },
      { name: "Black Current Crush", packSize: "1 L", asWritten: "1 pc", listQty: "1,000 ml", listBase: 1000, listUnit: "ml", dbName: "Black Current Crush" },
      { name: "Strawberry Mojito", packSize: "1 L", asWritten: "650 ml", listQty: "650 ml", listBase: 650, listUnit: "ml", dbName: "Strawberry Mojito" },
      { name: "Blue Curacao", packSize: "775 ml", asWritten: "500 ml", listQty: "500 ml", listBase: 500, listUnit: "ml", dbName: "Blue Curacao" },
      { name: "Virgin Mojito", packSize: "775 ml", asWritten: "250 ml", listQty: "250 ml", listBase: 250, listUnit: "ml", dbName: "Virgin Mojito" },
      { name: "Green Apple Mojito", packSize: "775 ml", asWritten: "200 ml", listQty: "200 ml", listBase: 200, listUnit: "ml", dbName: "Green Apple" },
      { name: "Water Melon Mojito", packSize: "775 ml", asWritten: "300 ml", listQty: "300 ml", listBase: 300, listUnit: "ml", dbName: "Water Melon Mojito" },
      { name: "Crushed Sugar", packSize: "—", asWritten: "365g", listQty: "365 g", listBase: 365, listUnit: "g", dbName: "Sugar" },
    ],
  },
  {
    title: "Pizza & Burgers",
    rows: [
      { name: "Black Olives", packSize: "430g", asWritten: "317g + 1 pc", listQty: "~747 g", listBase: 747, listUnit: "g", dbName: "Black Olives" },
      { name: "Green Olives", packSize: "450g", asWritten: "370 + partial", listQty: "~820 g", listBase: 820, listUnit: "g", dbName: "Green Olives" },
      { name: "Jalepino", packSize: "680g", asWritten: "370 + partial", listQty: "~1,050 g", listBase: 1050, listUnit: "g", dbName: "Jalepino" },
      { name: "Red Paprika", packSize: "350g", asWritten: "235g + partial", listQty: "~585 g", listBase: 585, listUnit: "g", dbName: "Red Peprika" },
      { name: "Yeast", packSize: "500g", asWritten: "88g", listQty: "88 g", listBase: 88, listUnit: "g", dbName: "Yeast", manualRatePaisePerBase: 38 },
      { name: "Red Chilli Flakes Sachet", packSize: "250 pc/pkt · ₹180", asWritten: "1 pkt", listQty: "250 pc", listBase: 250, listUnit: "pc", dbName: "Red Chiili Sachet", manualRatePaisePerBase: 18000 / 250 },
      { name: "Oregano Sachet", packSize: "300 pc/pkt · ₹180", asWritten: "1 pkt", listQty: "300 pc", listBase: 300, listUnit: "pc", dbName: "Oregano Sachet", manualRatePaisePerBase: 18000 / 300 },
    ],
  },
  {
    title: "Khada Masale (Whole Spices)",
    rows: [
      { name: "Cashew", packSize: "—", asWritten: "68g", listQty: "68 g", listBase: 68, listUnit: "g", dbName: "Cashew" },
      { name: "Magz", packSize: "—", asWritten: "115g", listQty: "115 g", listBase: 115, listUnit: "g", dbName: "Magz" },
      { name: "Star Masala", packSize: "—", asWritten: "48g", listQty: "48 g", listBase: 48, listUnit: "g", dbName: "Star Masala", manualRatePaisePerBase: 40 },
      { name: "Javetri", packSize: "—", asWritten: "22g", listQty: "22 g", listBase: 22, listUnit: "g", dbName: "Javatri", manualRatePaisePerBase: 50 },
      { name: "Clove", packSize: "—", asWritten: "20g", listQty: "20 g", listBase: 20, listUnit: "g", dbName: "Clove", manualRatePaisePerBase: 40 },
      { name: "Elaichi", packSize: "—", asWritten: "50g", listQty: "50 g", listBase: 50, listUnit: "g", dbName: "Cardamom" },
      { name: "Black Cardamom", packSize: "—", asWritten: "27g", listQty: "27 g", listBase: 27, listUnit: "g", dbName: "Black Cardamom", manualRatePaisePerBase: 40 },
      { name: "Ajwain", packSize: "—", asWritten: "42g", listQty: "42 g", listBase: 42, listUnit: "g", dbName: "Ajwain" },
      { name: "Kalonji", packSize: "—", asWritten: "26g", listQty: "26 g", listBase: 26, listUnit: "g", dbName: "Kalonji" },
      { name: "Tej Patta", packSize: "—", asWritten: "40g", listQty: "40 g", listBase: 40, listUnit: "g", dbName: "Tej Patta" },
      { name: "Dalcheeni", packSize: "—", asWritten: "270g", listQty: "270 g", listBase: 270, listUnit: "g", dbName: "Dal Cheeni" },
      { name: "Saunf", packSize: "—", asWritten: "250g", listQty: "250 g", listBase: 250, listUnit: "g", dbName: "Fennel (Sounf)", manualRatePaisePerBase: 35 },
      { name: "Jeera", packSize: "—", asWritten: "190g", listQty: "190 g", listBase: 190, listUnit: "g", dbName: "Cumin (Jeera)", manualRatePaisePerBase: 35 },
      { name: "Red Chilli Flakes (open)", packSize: "—", asWritten: "200 g", listQty: "200 g", listBase: 200, listUnit: "g", dbName: null, manualRatePaisePerBase: 18000 / 200 },
    ],
  },
  {
    title: "Disposable & Misc",
    rows: [
      { name: "Disposable Spoon", packSize: "100 pc/bdl", asWritten: "5 bdl", listQty: "500 pc", listBase: 500, listUnit: "pc", dbName: "Disposable Spoon" },
      { name: "Disposable Fork", packSize: "100 pc/bdl", asWritten: "11 bdl", listQty: "1,100 pc", listBase: 1100, listUnit: "pc", dbName: "Disposable Fork" },
      { name: "Container Small", packSize: "100 pc/bdl · ₹250", asWritten: "2 bdl", listQty: "200 pc", listBase: 200, listUnit: "pc", dbName: "Container Small", manualRatePaisePerBase: 25000 / 100 },
      { name: "Container Big", packSize: "₹350/100 pc", asWritten: "30", listQty: "30 pc", listBase: 30, listUnit: "pc", dbName: "Container Big", manualRatePaisePerBase: 35000 / 100 },
      { name: "Pizza Box Small", packSize: "—", asWritten: "0", listQty: "0 pc", listBase: 0, listUnit: "pc", dbName: "Pizza Box (Small)" },
      { name: "Pizza Box Medium", packSize: "—", asWritten: "80", listQty: "80 pc", listBase: 80, listUnit: "pc", dbName: "Pizza Box (Medium)" },
      { name: "Pizza Box Large", packSize: "—", asWritten: "0", listQty: "0 pc", listBase: 0, listUnit: "pc", dbName: "Pizza Box (Large)" },
      { name: "Silver Foil", packSize: "1 kg roll · ₹500", asWritten: "1 kg", listQty: "1,000 g", listBase: 1000, listUnit: "g", dbName: "Silver Foil", manualRatePaisePerBase: 50 },
      { name: "Tea", packSize: "pkt", asWritten: "2 pkt", listQty: "2 pc", listBase: 2, listUnit: "pc", dbName: null, manualRatePaisePerBase: 55000 },
      { name: "Coffee Premix", packSize: "2 kg pkt", asWritten: "2 pkt", listQty: "4,000 g", listBase: 4000, listUnit: "g", dbName: null, manualRatePaisePerBase: 55 },
    ],
  },
  {
    title: "Additional Raw Stock (27 Jul)",
    rows: [
      { name: "Gas (LPG)", packSize: "14.1 kg cyl", asWritten: "1 cyl (14.1 kg)", listQty: "14,100 g", listBase: 14100, listUnit: "g", dbName: "GAS" },
      { name: "Chicken Boneless", packSize: "—", asWritten: "10 kg", listQty: "10,000 g", listBase: 10000, listUnit: "g", dbName: "Chicken Boneless" },
      { name: "Maida", packSize: "—", asWritten: "7 kg", listQty: "7,000 g", listBase: 7000, listUnit: "g", dbName: "Maida" },
      { name: "Milk (Tonned)", packSize: "—", asWritten: "1½ kg", listQty: "1,500 ml", listBase: 1500, listUnit: "ml", dbName: "Milk (Tonned)" },
      { name: "Soya Chunks (Nutri)", packSize: "—", asWritten: "1.620 kg", listQty: "1,620 g", listBase: 1620, listUnit: "g", dbName: "Soya Granules" },
      { name: "Soya Sauce", packSize: "—", asWritten: "325 g", listQty: "325 g", listBase: 325, listUnit: "g", dbName: "Soya Sauce" },
      { name: "Meat Masala", packSize: "50g pkt", asWritten: "2 pkt", listQty: "100 g", listBase: 100, listUnit: "g", dbName: "Meat Masala" },
      { name: "Kitchen King", packSize: "100g pkt", asWritten: "2 pkt", listQty: "200 g", listBase: 200, listUnit: "g", dbName: "Kitchen King" },
      { name: "Black Pepper", packSize: "50g pkt", asWritten: "2 pkt", listQty: "100 g", listBase: 100, listUnit: "g", dbName: "Black Pepper Powder" },
      { name: "Garam Masala", packSize: "50g pkt", asWritten: "2 pkt", listQty: "100 g", listBase: 100, listUnit: "g", dbName: "Garam Masala" },
      { name: "Momos Masala", packSize: "100g big", asWritten: "1 big", listQty: "100 g", listBase: 100, listUnit: "g", dbName: "Momos Masala" },
      { name: "Hiri / Grain Masala", packSize: "—", asWritten: "500 g", listQty: "500 g", listBase: 500, listUnit: "g", dbName: "Star Masala", manualRatePaisePerBase: 40 },
      { name: "Ghee (Dalda)", packSize: "1 kg pkt", asWritten: "1 pkt", listQty: "1,000 g", listBase: 1000, listUnit: "g", dbName: "Ghee" },
      { name: "Ajina Moto", packSize: "0.5 kg pkt", asWritten: "1 pkt", listQty: "500 g", listBase: 500, listUnit: "g", dbName: "Ajina Moto" },
      { name: "Salt", packSize: "—", asWritten: "340 g", listQty: "340 g", listBase: 340, listUnit: "g", dbName: "Salt" },
      { name: "Red Chilli Powder", packSize: "—", asWritten: "204 g", listQty: "204 g", listBase: 204, listUnit: "g", dbName: "Red Chilli Powder" },
      { name: "Onion", packSize: "—", asWritten: "5½ kg", listQty: "5,500 g", listBase: 5500, listUnit: "g", dbName: "Onion" },
      { name: "Ginger Garlic Paste", packSize: "—", asWritten: "700 g", listQty: "700 g", listBase: 700, listUnit: "g", dbName: "Ginger Garlic Paste" },
      { name: "Green Chilli Sauce", packSize: "650g bottle", asWritten: "1 bottle", listQty: "650 g", listBase: 650, listUnit: "g", dbName: "Green Chilli Sauce" },
      { name: "Capsicum (Shimla)", packSize: "—", asWritten: "600 g", listQty: "600 g", listBase: 600, listUnit: "g", dbName: "Capsicum" },
      { name: "Cabbage (Patta Gobi)", packSize: "—", asWritten: "2.750 kg", listQty: "2,750 g", listBase: 2750, listUnit: "g", dbName: "Cabbage" },
      { name: "Carrot", packSize: "—", asWritten: "720 g", listQty: "720 g", listBase: 720, listUnit: "g", dbName: "Carrot" },
      { name: "Onion", packSize: "—", asWritten: "5 kg (1 kg)", listQty: "5,000 g", listBase: 5000, listUnit: "g", dbName: "Onion" },
      { name: "Schezwan Sauce", packSize: "1.13 kg", asWritten: "1.13 kg", listQty: "1,130 g", listBase: 1130, listUnit: "g", dbName: "Schezwan Sauce" },
      { name: "Garlic", packSize: "—", asWritten: "4 kg", listQty: "4,000 g", listBase: 4000, listUnit: "g", dbName: "Garlic" },
      { name: "Green Chilli", packSize: "—", asWritten: "2 kg", listQty: "2,000 g", listBase: 2000, listUnit: "g", dbName: "Green Chilli" },
    ],
  },
  {
    title: "Prep Batch Stock (27 Jul)",
    rows: [
      { name: "Chicken Boneless", packSize: "—", asWritten: "6.200 kg", listQty: "6,200 g", listBase: 6200, listUnit: "g", dbName: "Chicken Boneless" },
      { name: "Ginger Garlic Paste", packSize: "—", asWritten: "100 g", listQty: "100 g", listBase: 100, listUnit: "g", dbName: "Ginger Garlic Paste" },
      { name: "Meat Masala", packSize: "—", asWritten: "30 g", listQty: "30 g", listBase: 30, listUnit: "g", dbName: "Meat Masala" },
      { name: "Kitchen King", packSize: "—", asWritten: "30 g", listQty: "30 g", listBase: 30, listUnit: "g", dbName: "Kitchen King" },
      { name: "Corriander Powder", packSize: "—", asWritten: "15 g", listQty: "15 g", listBase: 15, listUnit: "g", dbName: "Corriandor Powder" },
      { name: "Red Chilli Powder", packSize: "—", asWritten: "30 g", listQty: "30 g", listBase: 30, listUnit: "g", dbName: "Red Chilli Powder" },
      { name: "Garam Masala", packSize: "—", asWritten: "20 g", listQty: "20 g", listBase: 20, listUnit: "g", dbName: "Garam Masala" },
      { name: "Salt", packSize: "—", asWritten: "70 g", listQty: "70 g", listBase: 70, listUnit: "g", dbName: "Salt" },
      { name: "Ajina Moto", packSize: "—", asWritten: "10 g", listQty: "10 g", listBase: 10, listUnit: "g", dbName: "Ajina Moto" },
      { name: "Meat Masala", packSize: "—", asWritten: "150 g", listQty: "150 g", listBase: 150, listUnit: "g", dbName: "Meat Masala" },
    ],
  },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-IN");
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtDb(stock: number, unit: string): string {
  return `${fmtNum(stock)} ${unit}`;
}

type CompareStatus = "same" | "increased" | "reduced" | "blank" | "no-db" | "no-compare" | "pending";

function compare(
  newStock: number | null,
  newUnit: string,
  oldStock: number | null,
  oldUnit: string | null,
): { status: CompareStatus; delta: number | null } {
  if (newStock === null) return { status: "blank", delta: null };
  if (oldStock === null || oldUnit === null) return { status: "no-db", delta: null };
  if (newUnit !== oldUnit) return { status: "no-compare", delta: null };
  const delta = newStock - oldStock;
  if (delta === 0) return { status: "same", delta: 0 };
  if (delta > 0) return { status: "increased", delta };
  return { status: "reduced", delta };
}

function statusLabel(status: CompareStatus): string {
  switch (status) {
    case "same":
      return "Same";
    case "increased":
      return "Increased";
    case "reduced":
      return "Reduced";
    case "blank":
      return "Blank";
    case "no-db":
      return "No DB item";
    case "no-compare":
      return "Units differ";
    case "pending":
      return "Pending DB";
  }
}

function statusClass(status: CompareStatus): string {
  return `pill pill-${status}`;
}

function changeLabel(delta: number, unit: string): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${fmtNum(delta)} ${unit}`;
}

function fmtRate(paisePerBase: number, unit: string): string {
  if (!Number.isFinite(paisePerBase) || paisePerBase <= 0) return "—";
  return `${formatRecipeCostRupees(paisePerBase)}/${unit}`;
}

function stockValuePaise(qty: number | null, ratePaisePerBase: number): number | null {
  if (qty === null || !Number.isFinite(ratePaisePerBase) || ratePaisePerBase <= 0) return null;
  return Math.round(qty * ratePaisePerBase);
}

type FlatRow = {
  category: string;
  sourceCategories: string[];
  row: SheetRow;
  oldStock: number | null;
  oldUnit: string | null;
  status: CompareStatus;
  delta: number | null;
  dbName: string | null;
  ratePaisePerBase: number;
  newAmountPaise: number | null;
  oldAmountPaise: number | null;
};

function mergeKey(fr: FlatRow): string {
  const { row, dbName, oldUnit, category } = fr;
  if (dbName && oldUnit && row.listBase !== null && row.listUnit === oldUnit) {
    return `db:${dbName}:${oldUnit}`;
  }
  if (dbName && row.listBase === null) {
    return `db:${dbName}:blank:${row.listUnit}:${row.name}`;
  }
  if (dbName) {
    return `db:${dbName}:unit:${row.listUnit}:${row.name}:${row.asWritten}`;
  }
  return `nodb:${category}:${row.name}:${row.listUnit}:${row.asWritten}`;
}

function mergedListQty(listBase: number | null, unit: string): string {
  if (listBase === null) return "—";
  if (unit === "g" || unit === "ml") return fmtDb(listBase, unit);
  if (unit === "pc") return `${fmtNum(listBase)} pc`;
  return `${fmtNum(listBase)} ${unit}`;
}

function resolveRatePaisePerBase(
  row: SheetRow,
  db: { avgCostPaisePerBase: { toString(): string }; lastPurchasePaisePerBase: { toString(): string } } | undefined,
  dbByName: Map<string, { avgCostPaisePerBase: { toString(): string }; lastPurchasePaisePerBase: { toString(): string } }>,
  costingMethod: Parameters<typeof itemUnitCostPaisePerBase>[1],
): number {
  if (db) {
    const dbRate = Number(itemUnitCostPaisePerBase(db, costingMethod));
    if (dbRate > 0) return dbRate;
  }
  if (row.manualRatePaisePerBase) return row.manualRatePaisePerBase;
  if (row.manualRateFromDbName) {
    const ref = dbByName.get(row.manualRateFromDbName);
    if (ref) return Number(itemUnitCostPaisePerBase(ref, costingMethod));
  }
  return 0;
}

function isPendingDbRow(row: SheetRow, db: unknown): boolean {
  return !db && !!(row.manualRatePaisePerBase || row.manualRateFromDbName);
}

function finalizeFlatRow(
  fr: Omit<FlatRow, "status" | "delta" | "newAmountPaise" | "oldAmountPaise"> & { pendingDb?: boolean },
): FlatRow {
  let { status, delta } = compare(fr.row.listBase, fr.row.listUnit, fr.oldStock, fr.oldUnit);
  if (fr.pendingDb && fr.row.listBase !== null) {
    status = "pending";
    delta = fr.row.listBase;
  }
  const newAmountPaise =
    fr.row.listBase !== null && fr.row.listUnit === fr.oldUnit && fr.ratePaisePerBase > 0
      ? stockValuePaise(fr.row.listBase, fr.ratePaisePerBase)
      : fr.row.listBase !== null && fr.row.listUnit === fr.oldUnit
        ? stockValuePaise(fr.row.listBase, fr.ratePaisePerBase)
        : null;
  const oldAmountPaise =
    fr.oldStock !== null && fr.oldUnit ? stockValuePaise(fr.oldStock, fr.ratePaisePerBase) : null;
  const { pendingDb: _pending, ...rest } = fr;
  return { ...rest, status, delta, newAmountPaise, oldAmountPaise };
}

/** Combine duplicate DB lines (e.g. same item on multiple count sheets). */
function mergeFlatRows(rows: FlatRow[]): FlatRow[] {
  const map = new Map<
    string,
    FlatRow & { sourceCategories: Set<string>; writings: string[] }
  >();

  for (const fr of rows) {
    const key = mergeKey(fr);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...fr,
        sourceCategories: new Set([fr.category]),
        writings: [fr.row.asWritten],
      });
      continue;
    }

    existing.sourceCategories.add(fr.category);
    existing.writings.push(fr.row.asWritten);

    if (fr.row.listBase !== null) {
      const sumBase =
        existing.row.listBase !== null ? existing.row.listBase + fr.row.listBase : fr.row.listBase;
      existing.row = {
        ...existing.row,
        listBase: sumBase,
        listQty: mergedListQty(sumBase, existing.row.listUnit),
        asWritten: existing.writings.join(" + "),
      };
    } else {
      existing.row = {
        ...existing.row,
        asWritten: existing.writings.join(" + "),
      };
    }
  }

  return [...map.values()].map((m) => ({
    ...finalizeFlatRow({
      category: [...m.sourceCategories].sort().join(" · "),
      row: m.row,
      oldStock: m.oldStock,
      oldUnit: m.oldUnit,
      dbName: m.dbName,
      ratePaisePerBase: m.ratePaisePerBase,
      pendingDb: !m.dbName && !!(m.row.manualRatePaisePerBase || m.row.manualRateFromDbName),
    }),
    sourceCategories: [...m.sourceCategories].sort(),
  }));
}

type ReadinessTab = "ready" | "incomplete";

/** Ready = has new stock, has rate, units match (or pending DB with manual rate). */
function readinessTab(fr: FlatRow): ReadinessTab {
  const hasStock = fr.row.listBase !== null;
  const hasRate = fr.ratePaisePerBase > 0;
  if (!hasStock || !hasRate) return "incomplete";
  if (fr.status === "blank" || fr.status === "no-compare" || fr.status === "no-db") return "incomplete";
  return "ready";
}

function missingReason(fr: FlatRow): string {
  const parts: string[] = [];
  if (fr.row.listBase === null) parts.push("no qty");
  if (fr.ratePaisePerBase <= 0) parts.push("no rate");
  if (fr.status === "no-compare") parts.push("unit mismatch");
  if (fr.status === "no-db") parts.push("no DB item");
  return parts.join(", ") || "—";
}

function countByStatus(rows: FlatRow[]) {
  let sameCount = 0;
  let increasedCount = 0;
  let reducedCount = 0;
  let blankCount = 0;
  let noDbCount = 0;
  let pendingCount = 0;
  for (const { status } of rows) {
    if (status === "same") sameCount++;
    else if (status === "increased") increasedCount++;
    else if (status === "reduced") reducedCount++;
    else if (status === "blank") blankCount++;
    else if (status === "no-db") noDbCount++;
    else if (status === "pending") pendingCount++;
  }
  return { sameCount, increasedCount, reducedCount, blankCount, noDbCount, pendingCount };
}

async function buildStockCountRows(prisma = getPrisma()) {
  const invSettings = await ensureInventorySettings(prisma);
  const dbItems = await prisma.inventoryItem.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      baseUnit: true,
      stockOnHandBase: true,
      avgCostPaisePerBase: true,
      lastPurchasePaisePerBase: true,
    },
  });
  const dbByName = new Map(dbItems.map((i) => [i.name, i]));

  const unmergedRows: FlatRow[] = [];

  for (const section of SECTIONS) {
    for (const row of section.rows) {
      const db = row.dbName ? dbByName.get(row.dbName) : undefined;
      const pendingDb = isPendingDbRow(row, db);
      const oldStock = db ? Number(db.stockOnHandBase) : pendingDb ? 0 : null;
      const oldUnit = db?.baseUnit ?? (pendingDb ? row.listUnit : null);
      const ratePaisePerBase = resolveRatePaisePerBase(row, db, dbByName, invSettings.costingMethod);

      unmergedRows.push(
        finalizeFlatRow({
          category: section.title,
          row,
          oldStock,
          oldUnit,
          dbName: row.dbName,
          ratePaisePerBase,
          pendingDb,
        }),
      );
    }
  }

  const flatRows = mergeFlatRows(unmergedRows);
  return { flatRows, dbByName, invSettings, unmergedCount: unmergedRows.length };
}

export { buildStockCountRows, readinessTab, type FlatRow, type SheetRow };

async function main() {
  const prisma = getPrisma();
  const { flatRows, invSettings, unmergedCount } = await buildStockCountRows(prisma);

  let sameCount = 0;
  let increasedCount = 0;
  let reducedCount = 0;
  let blankCount = 0;
  let noDbCount = 0;
  let pendingCount = 0;

  ({
    sameCount,
    increasedCount,
    reducedCount,
    blankCount,
    noDbCount,
    pendingCount,
  } = countByStatus(flatRows));

  let totalNewInventoryPaise = 0;
  let totalOldInventoryPaise = 0;
  for (const fr of flatRows) {
    if (fr.newAmountPaise !== null) totalNewInventoryPaise += fr.newAmountPaise;
    if (fr.oldAmountPaise !== null) totalOldInventoryPaise += fr.oldAmountPaise;
  }

  const categories = SECTIONS.map((s) => s.title);
  const readyCount = flatRows.filter((fr) => readinessTab(fr) === "ready").length;
  const incompleteCount = flatRows.length - readyCount;

  const tableRows = flatRows
    .map((fr) => {
      const { category, sourceCategories, row, oldStock, oldUnit, status, delta, dbName, ratePaisePerBase, newAmountPaise, oldAmountPaise } = fr;
      const readiness = readinessTab(fr);
      const missing = missingReason(fr);
      const changeHtml =
        status === "pending" && delta !== null
          ? `<span class="change change-pending">new · ${mergedListQty(row.listBase, row.listUnit)}</span>`
          : delta !== null && status !== "same" && status !== "blank" && status !== "no-db" && status !== "no-compare"
          ? `<span class="change ${status === "increased" ? "change-up" : "change-down"}">${changeLabel(delta, row.listUnit)}</span>`
          : delta !== null && status === "same"
            ? `<span class="change change-neutral">0 ${row.listUnit}</span>`
            : "";
      const sortName = row.name.toLowerCase();
      const sortWritten = row.asWritten.toLowerCase();
      const sortDb = (dbName ?? "").toLowerCase();
      const sortOld = oldStock ?? -1;
      const sortNew = row.listBase ?? -1;
      const sortDelta = delta ?? 0;
      const sortRate = ratePaisePerBase;
      const sortAmount = newAmountPaise ?? -1;
      const rateUnit = oldUnit ?? row.listUnit;
      const rateHtml =
        ratePaisePerBase > 0 && rateUnit !== "—"
          ? fmtRate(ratePaisePerBase, rateUnit)
          : '<span class="muted">—</span>';
      const amountHtml =
        newAmountPaise !== null ? formatRupees(newAmountPaise) : '<span class="muted">—</span>';
      const dbColHtml = dbName
        ? escapeHtml(dbName)
        : row.manualRatePaisePerBase || row.manualRateFromDbName
          ? `${escapeHtml(row.name)} <span class="pending-tag">pending DB</span>`
          : '<span class="muted">—</span>';

      return `<tr class="row-${status}"
        data-category="${escapeHtml(category)}"
        data-source-categories="${escapeHtml(sourceCategories.join("|"))}"
        data-status="${status}"
        data-readiness="${readiness}"
        data-missing="${escapeHtml(missing)}"
        data-search="${escapeHtml(`${category} ${row.name} ${row.packSize ?? ""} ${row.asWritten} ${row.listQty} ${dbName ?? ""} ${statusLabel(status)} ${missing}`.toLowerCase())}"
        data-sort-category="${escapeHtml(category.toLowerCase())}"
        data-sort-name="${escapeHtml(sortName)}"
        data-sort-written="${escapeHtml(sortWritten)}"
        data-sort-old="${sortOld}"
        data-sort-new="${sortNew}"
        data-sort-rate="${sortRate}"
        data-sort-amount="${sortAmount}"
        data-sort-db="${escapeHtml(sortDb)}"
        data-sort-missing="${escapeHtml(missing.toLowerCase())}"
        data-sort-delta="${sortDelta}"
        data-new-amount-paise="${newAmountPaise ?? 0}"
        data-old-amount-paise="${oldAmountPaise ?? 0}"
      >
        <td class="col-category">${escapeHtml(category)}</td>
        <td class="col-item">
          <strong>${escapeHtml(row.name)}</strong>
          ${row.packSize ? `<span class="pack">${escapeHtml(row.packSize)}</span>` : ""}
        </td>
        <td class="col-written">${escapeHtml(row.asWritten)}</td>
        <td class="col-old" data-value="${sortOld}">${oldStock !== null && oldUnit ? fmtDb(oldStock, oldUnit) : '<span class="muted">—</span>'}</td>
        <td class="col-new" data-value="${sortNew}">${escapeHtml(row.listQty)}</td>
        <td class="col-rate">${rateHtml}</td>
        <td class="col-amount">${amountHtml}</td>
        <td class="col-db">${dbColHtml}</td>
        <td class="col-missing">${readiness === "incomplete" ? escapeHtml(missing) : '<span class="muted">—</span>'}</td>
        <td class="col-status" data-value="${sortDelta}"><span class="${statusClass(status)}">${statusLabel(status)}</span>${changeHtml}</td>
      </tr>`;
    })
    .join("\n");

  const categoryOptions = categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("\n");

  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const totalRows = flatRows.length;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KHAANZ — Stock Count Sheet</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      :root {
        --brand: #b91c1c;
        --ink: #1c1917;
        --muted: #78716c;
        --border: #e7e5e4;
        --surface: #fafaf9;
        --white: #fff;
        --same: #64748b;
        --same-bg: #f1f5f9;
        --increased: #059669;
        --increased-bg: #ecfdf5;
        --reduced: #dc2626;
        --reduced-bg: #fef2f2;
        --blank: #a8a29e;
        --blank-bg: #f5f5f4;
        --no-db: #d97706;
        --no-db-bg: #fffbeb;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
        background: #d6d3d1;
        color: var(--ink);
        line-height: 1.45;
        -webkit-font-smoothing: antialiased;
      }
      .toolbar {
        position: sticky; top: 0; z-index: 100;
        display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        padding: 0.85rem 1.25rem;
        background: rgba(28, 25, 23, 0.94);
        color: #fafaf9;
        backdrop-filter: blur(8px);
      }
      .toolbar h1 { font-size: 0.95rem; font-weight: 600; }
      .toolbar p { font-size: 0.75rem; color: #a8a29e; margin-top: 0.15rem; }
      .toolbar button {
        border: none; border-radius: 0.5rem; background: var(--brand); color: #fff;
        font: inherit; font-size: 0.85rem; font-weight: 600; padding: 0.55rem 1rem; cursor: pointer;
      }
      .toolbar button.ghost { background: rgba(255,255,255,0.12); }
      .toolbar-actions { display: flex; gap: 0.45rem; }
      .page { max-width: 1480px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
      .inventory-hero {
        display: grid; grid-template-columns: 1.4fr 1fr; gap: 0.85rem;
        margin-bottom: 1rem;
      }
      @media (max-width: 768px) { .inventory-hero { grid-template-columns: 1fr; } }
      .hero-card {
        background: linear-gradient(135deg, #991b1b 0%, #b91c1c 55%, #dc2626 100%);
        color: #fff; border-radius: 0.85rem; padding: 1.1rem 1.2rem;
        box-shadow: 0 8px 28px rgba(185, 28, 28, 0.22);
      }
      .hero-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; }
      .hero-value { display: block; font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin: 0.2rem 0; }
      .hero-sub { font-size: 0.75rem; opacity: 0.8; }
      .hero-side {
        background: var(--white); border: 1px solid var(--border); border-radius: 0.85rem;
        padding: 0.85rem 1rem; display: grid; gap: 0.65rem; align-content: center;
      }
      .hero-stat { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
      .hero-stat span { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .hero-stat strong { font-size: 1rem; font-weight: 700; white-space: nowrap; }
      .hero-stat strong.positive { color: var(--increased); }
      .hero-stat strong.negative { color: var(--reduced); }
      .controls {
        background: var(--white); border: 1px solid var(--border); border-radius: 0.75rem;
        padding: 0.85rem 1rem; margin-bottom: 1rem;
        display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center;
      }
      .search-wrap { flex: 1 1 220px; min-width: 180px; }
      .search-wrap input {
        width: 100%; border: 1px solid var(--border); border-radius: 0.5rem;
        padding: 0.5rem 0.75rem; font: inherit; font-size: 0.82rem;
      }
      .search-wrap input:focus { outline: 2px solid rgba(185,28,28,0.25); border-color: var(--brand); }
      .control-select {
        border: 1px solid var(--border); border-radius: 0.5rem; background: var(--white);
        font: inherit; font-size: 0.78rem; font-weight: 500; padding: 0.5rem 0.65rem; cursor: pointer;
      }
      .control-label { font-size: 0.68rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 0.25rem; }
      .result-count { font-size: 0.75rem; color: var(--muted); margin-left: auto; white-space: nowrap; }
      .summary {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.55rem;
        margin-bottom: 1rem;
      }
      .stat {
        background: var(--white); border: 1px solid var(--border); border-radius: 0.65rem;
        padding: 0.65rem 0.8rem;
      }
      .stat strong { display: block; font-size: 1.2rem; font-weight: 700; }
      .stat span { font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .stat.same strong { color: var(--same); }
      .stat.increased strong { color: var(--increased); }
      .stat.reduced strong { color: var(--reduced); }
      .table-card {
        background: var(--white); border: 1px solid var(--border); border-radius: 0.75rem;
        overflow: hidden;
      }
      .table-wrap { overflow-x: auto; max-height: calc(100vh - 280px); overflow-y: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
      thead { position: sticky; top: 0; z-index: 2; }
      th {
        font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted);
        background: var(--surface); border-bottom: 1px solid var(--border);
        padding: 0.6rem 0.75rem; text-align: left; white-space: nowrap; user-select: none;
      }
      th.sortable { cursor: pointer; }
      th.sortable:hover { color: var(--ink); background: #f5f5f4; }
      th.sortable .sort-icon { opacity: 0.35; margin-left: 0.25rem; font-size: 0.6rem; }
      th.sortable.asc .sort-icon, th.sortable.desc .sort-icon { opacity: 1; color: var(--brand); }
      th.sortable.asc .sort-icon::after { content: "▲"; }
      th.sortable.desc .sort-icon::after { content: "▼"; }
      th.sortable:not(.asc):not(.desc) .sort-icon::after { content: "↕"; }
      td { padding: 0.55rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
      tbody tr:last-child td { border-bottom: none; }
      .col-category { font-size: 0.72rem; color: var(--muted); white-space: nowrap; font-weight: 500; }
      .col-item strong { display: block; font-weight: 600; }
      .pack { display: block; font-size: 0.68rem; color: var(--muted); margin-top: 0.1rem; }
      .col-written { font-family: ui-monospace, monospace; font-size: 0.72rem; color: #57534e; white-space: nowrap; }
      .col-old { color: var(--muted); white-space: nowrap; }
      .col-new { font-weight: 700; white-space: nowrap; color: var(--ink); }
      .col-rate { font-size: 0.72rem; white-space: nowrap; color: #57534e; font-family: ui-monospace, monospace; }
      .col-amount { font-weight: 700; white-space: nowrap; color: var(--ink); }
      .muted { color: var(--muted); }
      .pill {
        display: inline-block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.03em; padding: 0.15rem 0.45rem; border-radius: 999px;
      }
      .pill-same { background: var(--same-bg); color: var(--same); }
      .pill-increased { background: var(--increased-bg); color: var(--increased); }
      .pill-reduced { background: var(--reduced-bg); color: var(--reduced); }
      .pill-blank { background: var(--blank-bg); color: var(--blank); }
      .pill-no-db { background: var(--no-db-bg); color: var(--no-db); }
      .pill-pending { background: #eff6ff; color: #2563eb; }
      .pill-no-compare { background: var(--blank-bg); color: var(--muted); }
      .row-pending { background: #f8fbff; }
      .pending-tag { font-size: 0.62rem; font-weight: 600; color: #2563eb; text-transform: uppercase; letter-spacing: 0.03em; margin-left: 0.25rem; }
      .change-pending { color: #2563eb; }
      .row-increased { background: #fafffb; }
      .row-reduced { background: #fffbfb; }
      .row-no-db { background: #fffdf7; }
      .change { display: block; font-size: 0.68rem; margin-top: 0.2rem; font-weight: 600; font-family: ui-monospace, monospace; }
      .change-up { color: var(--increased); }
      .change-down { color: var(--reduced); }
      .change-neutral { color: var(--same); }
      .note {
        background: var(--white); border: 1px solid var(--border); border-radius: 0.65rem;
        padding: 0.85rem 1rem; font-size: 0.78rem; color: var(--muted); margin-bottom: 1rem;
      }
      .view-tabs {
        display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;
      }
      .view-tabs .tab-btn {
        flex: 1 1 240px; border: 2px solid var(--border); border-radius: 0.75rem; background: var(--white);
        font: inherit; text-align: left; padding: 0.85rem 1rem; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
      }
      .view-tabs .tab-btn:hover { border-color: #d6d3d1; }
      .view-tabs .tab-btn.active {
        border-color: var(--brand); box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.12);
      }
      .view-tabs .tab-btn strong { display: block; font-size: 0.92rem; font-weight: 700; color: var(--ink); margin-bottom: 0.15rem; }
      .view-tabs .tab-btn span { display: block; font-size: 0.72rem; color: var(--muted); line-height: 1.35; }
      .view-tabs .tab-btn em { font-style: normal; font-weight: 700; color: var(--brand); }
      .col-missing { font-size: 0.72rem; color: #b45309; white-space: nowrap; }
      tr.hidden { display: none; }
      @media print {
        body { background: #fff; }
        .toolbar, .controls, .summary, .note, .inventory-hero, .view-tabs { display: none; }
        .page { padding: 0; max-width: none; }
        .table-wrap { max-height: none; overflow: visible; }
        .table-card { box-shadow: none; border: none; }
      }
    </style>
  </head>
  <body>
    <header class="toolbar">
      <div>
        <h1>KHAANZ — Stock Count Sheet</h1>
        <p>Old stock = DB · New stock = handwritten count · Generated ${escapeHtml(generatedAt)} IST · ${totalRows} rows</p>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="ghost" onclick="window.location.reload()">Refresh DB</button>
        <button type="button" onclick="window.print()">Print / PDF</button>
      </div>
    </header>
    <main class="page">
      <div class="inventory-hero">
        <div class="hero-card">
          <span class="hero-label">Total inventory (new count)</span>
          <strong class="hero-value" id="total-new-value">${formatRupees(totalNewInventoryPaise)}</strong>
          <span class="hero-sub">Physical count × DB avg rate · ${invSettings.costingMethod === "LATEST_PURCHASE" ? "latest purchase" : invSettings.costingMethod === "FIFO" ? "FIFO display avg" : "moving average"} costing</span>
        </div>
        <div class="hero-side">
          <div class="hero-stat">
            <span>Old DB value</span>
            <strong>${formatRupees(totalOldInventoryPaise)}</strong>
          </div>
          <div class="hero-stat">
            <span>Visible total (filtered)</span>
            <strong id="total-visible-value">${formatRupees(totalNewInventoryPaise)}</strong>
          </div>
          <div class="hero-stat">
            <span>Difference (new − old)</span>
            <strong id="total-diff-value" class="${totalNewInventoryPaise >= totalOldInventoryPaise ? "positive" : "negative"}">${formatRupees(totalNewInventoryPaise - totalOldInventoryPaise)}</strong>
          </div>
        </div>
      </div>
      <div class="view-tabs" id="readiness-tabs">
        <button type="button" class="tab-btn" data-readiness="ready">
          <strong>Ready to add · <em>${readyCount}</em></strong>
          <span>Has new stock count and rate — can update DB or create pending items.</span>
        </button>
        <button type="button" class="tab-btn active" data-readiness="incomplete">
          <strong>Need your data · <em>${incompleteCount}</em></strong>
          <span>Missing quantity, rate, or unit conversion — fill these and send back.</span>
        </button>
      </div>
      <div class="note">
        <strong>Ready</strong> = new stock + rate + matching units.
        <strong>Need data</strong> = blank qty, no rate, or units differ (bdl/pkt/ml vs DB unit).
        Nothing written to DB yet.
      </div>
      <div class="summary">
        <div class="stat"><strong>${totalRows}</strong><span>Total rows</span></div>
        <div class="stat increased"><strong>${increasedCount}</strong><span>Increased</span></div>
        <div class="stat reduced"><strong>${reducedCount}</strong><span>Reduced</span></div>
        <div class="stat same"><strong>${sameCount}</strong><span>Same</span></div>
        <div class="stat"><strong>${blankCount}</strong><span>Blank on list</span></div>
        <div class="stat"><strong>${noDbCount}</strong><span>No DB item</span></div>
        <div class="stat"><strong>${pendingCount}</strong><span>Pending DB</span></div>
      </div>
      <div class="controls">
        <div class="search-wrap">
          <input type="search" id="search" placeholder="Search item, category, DB name, as written…" autocomplete="off" />
        </div>
        <label>
          <span class="control-label">Category</span>
          <select class="control-select" id="category-filter">
            <option value="">All categories</option>
            ${categoryOptions}
          </select>
        </label>
        <label>
          <span class="control-label">Sort</span>
          <select class="control-select" id="sort-preset">
            <option value="sort-category:asc">Category A→Z</option>
            <option value="sort-name:asc">Item A→Z</option>
            <option value="sort-name:desc">Item Z→A</option>
            <option value="sort-delta:desc">Biggest increase</option>
            <option value="sort-delta:asc">Biggest reduction</option>
            <option value="sort-new:desc">New stock high→low</option>
            <option value="sort-old:desc">Old stock high→low</option>
            <option value="sort-amount:desc">Amount high→low</option>
            <option value="sort-rate:desc">Rate high→low</option>
          </select>
        </label>
        <span class="result-count" id="result-count">Showing ${totalRows} of ${totalRows}</span>
      </div>
      <div class="table-card">
        <div class="table-wrap">
          <table id="stock-table">
            <thead>
              <tr>
                <th class="sortable asc" data-sort="sort-category">Category<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-name">Item<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-written">As written<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-old">Old stock (DB)<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-new">New stock (list)<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-rate">Rate<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-amount">Final amount<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-db">DB item<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-missing">Missing<span class="sort-icon"></span></th>
                <th class="sortable" data-sort="sort-delta">Change<span class="sort-icon"></span></th>
              </tr>
            </thead>
            <tbody id="stock-body">${tableRows}</tbody>
          </table>
        </div>
      </div>
    </main>
    <script>
      (function () {
        var tbody = document.getElementById("stock-body");
        var allRows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
        var searchInput = document.getElementById("search");
        var categoryFilter = document.getElementById("category-filter");
        var sortPreset = document.getElementById("sort-preset");
        var resultCount = document.getElementById("result-count");
        var readinessButtons = document.querySelectorAll("#readiness-tabs .tab-btn");
        var sortHeaders = document.querySelectorAll("th.sortable");
        var missingHeader = document.querySelector('th[data-sort="sort-missing"]');

        var totalVisibleValue = document.getElementById("total-visible-value");

        function formatPaise(paise) {
          if (!paise) return "₹0";
          var rupees = paise / 100;
          var hasPaisa = Math.round(paise) % 100 !== 0;
          return rupees.toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: hasPaisa ? 2 : 0,
            maximumFractionDigits: hasPaisa ? 2 : 0
          });
        }

        function updateVisibleTotal() {
          var sum = 0;
          allRows.forEach(function (row) {
            if (!row.classList.contains("hidden")) {
              sum += parseInt(row.getAttribute("data-new-amount-paise") || "0", 10) || 0;
            }
          });
          if (totalVisibleValue) totalVisibleValue.textContent = formatPaise(sum);
        }

        var state = { search: "", category: "", readiness: "incomplete", sortKey: "sort-category", sortDir: "asc" };

        function rowMatches(row) {
          if (state.readiness && row.getAttribute("data-readiness") !== state.readiness) return false;
          if (state.category) {
            var sources = (row.getAttribute("data-source-categories") || "").split("|");
            if (sources.indexOf(state.category) === -1) return false;
          }
          if (state.search) {
            var hay = row.getAttribute("data-search") || "";
            if (hay.indexOf(state.search) === -1) return false;
          }
          return true;
        }

        function applyFilters() {
          var visible = 0;
          allRows.forEach(function (row) {
            var show = rowMatches(row);
            row.classList.toggle("hidden", !show);
            if (show) visible++;
          });
          resultCount.textContent = "Showing " + visible + " of " + allRows.length;
          updateVisibleTotal();
        }

        function sortRows(key, dir) {
          state.sortKey = key;
          state.sortDir = dir;
          var numericKeys = { "sort-old": 1, "sort-new": 1, "sort-delta": 1, "sort-rate": 1, "sort-amount": 1 };
          var sorted = allRows.slice().sort(function (a, b) {
            var av = a.getAttribute("data-" + key) || "";
            var bv = b.getAttribute("data-" + key) || "";
            if (numericKeys[key]) {
              av = parseFloat(av) || 0;
              bv = parseFloat(bv) || 0;
              return dir === "asc" ? av - bv : bv - av;
            }
            av = String(av).toLowerCase();
            bv = String(bv).toLowerCase();
            if (av < bv) return dir === "asc" ? -1 : 1;
            if (av > bv) return dir === "asc" ? 1 : -1;
            return 0;
          });
          sorted.forEach(function (row) { tbody.appendChild(row); });
          allRows = sorted;
          sortHeaders.forEach(function (th) {
            th.classList.remove("asc", "desc");
            if (th.getAttribute("data-sort") === key) th.classList.add(dir);
          });
        }

        searchInput.addEventListener("input", function () {
          state.search = searchInput.value.trim().toLowerCase();
          applyFilters();
        });

        categoryFilter.addEventListener("change", function () {
          state.category = categoryFilter.value;
          applyFilters();
        });

        readinessButtons.forEach(function (btn) {
          btn.addEventListener("click", function () {
            readinessButtons.forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            state.readiness = btn.getAttribute("data-readiness") || "";
            if (missingHeader) missingHeader.style.display = state.readiness === "incomplete" ? "" : "none";
            applyFilters();
          });
        });

        sortPreset.addEventListener("change", function () {
          var parts = sortPreset.value.split(":");
          sortRows(parts[0], parts[1]);
        });

        sortHeaders.forEach(function (th) {
          th.addEventListener("click", function () {
            var key = th.getAttribute("data-sort");
            var dir = th.classList.contains("asc") ? "desc" : "asc";
            sortRows(key, dir);
            sortPreset.value = key + ":" + dir;
          });
        });

        if (missingHeader) missingHeader.style.display = state.readiness === "incomplete" ? "" : "none";
        sortRows("sort-category", "asc");
        applyFilters();
      })();
    </script>
  </body>
</html>`;

  const out = join(process.cwd(), "samples", "stock-count-sheet.html");
  writeFileSync(out, html, "utf8");
  console.log(`Wrote ${out}`);
  console.log(`  ${unmergedCount} source rows → ${totalRows} merged · ${readyCount} ready · ${incompleteCount} need data · ${pendingCount} pending · ${blankCount} blank`);
}

const isGenerateMain = process.argv[1]?.includes("generate-stock-count-html");
if (isGenerateMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
