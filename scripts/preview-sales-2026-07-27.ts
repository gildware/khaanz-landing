/**
 * Preview only — maps Item Wise Sales Report + notebook open items to menu DB.
 * Does NOT insert orders.
 * Run: npx tsx scripts/preview-sales-2026-07-27.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EXCEL =
  "/Users/kamran/Downloads/Item_Wise_Sales_Report_2026_07_27_22_27_59 (2).xlsx";
const OUT_HTML = join(process.cwd(), "samples", "sales-preview-2026-07-27.html");
const SALE_DATE = "2026-07-27";

type MenuRow = {
  id: string;
  name: string;
  category: string | null;
  available: boolean;
  notForSale: boolean;
  variations: { id: string; name: string; price: number }[];
};

type MatchInfo = {
  menuItemId: string;
  menuItemName: string;
  category: string | null;
  variationId: string;
  variationName: string;
  dbPrice: number;
  score: number;
  priceDiff: number;
  available: boolean;
  notForSale: boolean;
};

type PreviewLine = {
  source: "excel" | "open_notebook" | "adjustment";
  reportCategory: string;
  reportItem: string;
  qty: number;
  unitPrice: number;
  reportTotal: number;
  action: "menu_item" | "open_item" | "skip_excel_open_aggregate";
  match: MatchInfo | null;
  note: string;
  topCandidates: { name: string; score: number; vars: string }[];
};

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[.\u2019'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenSize(s: string): { base: string; size?: string } {
  const m = s.match(
    /^(.*)\((half|full|regular|small|large|single)\)\s*$/i,
  );
  if (m) return { base: m[1].trim(), size: m[2].toLowerCase() };
  return { base: s.trim() };
}

function scoreName(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size || 1;
  return Math.round((inter / union) * 70);
}

/** Expand POS / Excel names into searchable phrases. */
function searchPhrases(reportItem: string): string[] {
  const raw = reportItem.trim();
  const phrases = [raw];
  const { base, size } = stripParenSize(raw);
  if (base !== raw) phrases.push(base);

  // Cold Drink (Coca Cola @20) → "Coca Cola"
  const drink = raw.match(/^cold drink\s*\((.+)\)\s*$/i);
  if (drink) {
    const inner = drink[1].replace(/@\s*\d+/g, "").trim();
    phrases.push(inner);
    phrases.push(inner.replace(/\s+tin\b/i, "").trim());
  }

  // Ice Cream (Ek Dum Aam @ 30) → "Ek Dum Aam"
  const ice = raw.match(/^ice cream\s*\((.+)\)\s*$/i);
  if (ice) {
    phrases.push(ice[1].replace(/@\s*\d+/g, "").trim());
  }

  // Fried Fish (Fried Fish 300) → keep base
  const fish = raw.match(/^fried fish\s*\((.+)\)\s*$/i);
  if (fish) phrases.push("Fried Fish");

  // Alias expansions
  const n = norm(base);
  const aliases: Record<string, string[]> = {
    "fried momos": ["Fried Chicken Momo"],
    "steamed momos": ["Steamed Chicken Momo"],
    "tandoori momos": ["Tandoori Chicken Momo"],
    "thums up": ["Thumbs Up"],
    "thumbs up": ["Thumbs Up"],
    dew: ["Mountain Dew"],
    "coca cola": ["Coca Cola"],
    "coca cola tin": ["Coca-Cola Tin"],
    popcorn: ["Popcorn Chicken"],
    "c burger": ["Chicken Tikki Burger"],
    "c. burger": ["Chicken Tikki Burger"],
    "v burger": ["Veg Tikki Burger"],
    "v. burger": ["Veg Tikki Burger"],
    "wings (4pc)": ["Wings"],
    "f momo (10pc)": ["Fried Chicken Momo"],
    "f. momo (10pc)": ["Fried Chicken Momo"],
    "c samosa": ["Chicken Samosa"],
    "c. samosa": ["Chicken Samosa"],
  };
  for (const [k, vals] of Object.entries(aliases)) {
    if (n === k || norm(raw) === k || n.includes(k)) phrases.push(...vals);
  }
  if (size) void size;
  return [...new Set(phrases.filter(Boolean))];
}

function isSaleable(m: MenuRow): boolean {
  if (m.notForSale) return false;
  return m.variations.some((v) => v.price > 0);
}

function pickVariation(
  vars: MenuRow["variations"],
  unit: number,
  size?: string,
) {
  const priced = vars.filter((v) => v.price > 0);
  const pool = priced.length ? priced : vars;
  if (!pool.length) return null;
  let variation = pool[0];
  if (size) {
    const sizeAliases: Record<string, string[]> = {
      small: ["small", "regular", "250 ml"],
      large: ["large", "500 ml"],
      regular: ["regular", "single", "plate"],
      half: ["half"],
      full: ["full"],
      single: ["single", "regular"],
    };
    const targets = sizeAliases[size] ?? [size];
    const bySize = pool.find((v) =>
      targets.some((t) => norm(v.name) === t || norm(v.name).includes(t)),
    );
    if (bySize) variation = bySize;
  }
  // Prefer exact / near price
  const byPrice = [...pool].sort(
    (a, b) => Math.abs(a.price - unit) - Math.abs(b.price - unit),
  )[0];
  if (byPrice && Math.abs(byPrice.price - unit) <= 2) return byPrice;
  if (size && variation) return variation;
  return byPrice ?? variation;
}

function bestMenuMatch(
  menu: MenuRow[],
  reportItem: string,
  unit: number,
): { m: MenuRow; s: number; variation: MenuRow["variations"][0] } | null {
  const { size } = stripParenSize(reportItem);
  const phrases = searchPhrases(reportItem);
  const saleable = menu.filter(isSaleable);

  const scored = saleable
    .map((m) => ({
      m,
      s: Math.max(...phrases.map((p) => scoreName(m.name, p))),
    }))
    .sort((a, b) => b.s - a.s);

  // Soft-drink parenthetical: boost exact brand hits
  const inner = reportItem.match(/\(([^)]+)\)/)?.[1] ?? "";
  if (/cold drink/i.test(reportItem) || /tin/i.test(inner)) {
    for (const c of scored) {
      if (/tin/i.test(inner) && /tin/i.test(c.m.name)) c.s += 25;
      if (/thums|thumbs/i.test(inner) && /thumb/i.test(c.m.name)) c.s += 40;
      if (/\bdew\b/i.test(inner) && /mountain dew/i.test(c.m.name)) c.s += 40;
      if (/coca|coke/i.test(inner) && /coca/i.test(c.m.name)) {
        if (/tin/i.test(inner) === /tin/i.test(c.m.name)) c.s += 20;
      }
    }
    scored.sort((a, b) => b.s - a.s);
  }

  const best = scored[0];
  if (!best || best.s < 55) return null;
  const variation = pickVariation(best.m.variations, unit, size);
  if (!variation) return null;
  return { m: best.m, s: best.s, variation };
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const menu: MenuRow[] = (
    await prisma.menuItem.findMany({
      include: {
        variations: { orderBy: { sortOrder: "asc" } },
        category: true,
      },
    })
  ).map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category?.name ?? null,
    available: it.available,
    notForSale: it.notForSale,
    variations: it.variations.map((v) => ({
      id: v.id,
      name: v.name,
      price: v.price,
    })),
  }));

  const excelJson = execSync(
    `python3 - <<'PY'
import openpyxl, json
path = ${JSON.stringify(EXCEL)}
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb.active
rows = []
for i, row in enumerate(ws.iter_rows(values_only=True), 1):
    if i < 11: continue
    cat, item, code, sap, qty, total = row
    if item is None:
        continue
    if cat == "Sub Total":
        continue
    rows.append({
        "category": cat or "",
        "item": item,
        "code": code,
        "qty": float(qty or 0),
        "total": float(total or 0),
    })
print(json.dumps(rows))
PY`,
  ).toString();

  const report = JSON.parse(excelJson) as {
    category: string;
    item: string;
    code: string | number | null;
    qty: number;
    total: number;
  }[];

  const lines: PreviewLine[] = [];

  for (const r of report) {
    const unit = r.qty ? r.total / r.qty : 0;
    const { base } = stripParenSize(r.item);
    const isOpenCat = norm(r.category) === "open item";

    const scored = menu
      .filter(isSaleable)
      .map((m) => ({
        m,
        s: Math.max(
          ...searchPhrases(r.item).map((p) => scoreName(m.name, p)),
          scoreName(m.name, base),
        ),
      }))
      .sort((a, b) => b.s - a.s);
    const topCandidates = scored.slice(0, 3).map((c) => ({
      name: c.m.name,
      score: c.s,
      vars: c.m.variations.map((v) => `${v.name}:${v.price}`).join("|"),
    }));

    if (isOpenCat) {
      lines.push({
        source: "excel",
        reportCategory: r.category,
        reportItem: r.item,
        qty: r.qty,
        unitPrice: Math.round(unit * 100) / 100,
        reportTotal: r.total,
        action: "skip_excel_open_aggregate",
        match: null,
        note: `Excel open-item aggregate (qty ${r.qty}, ${inr(r.total)}) — replaced by notebook breakdown below`,
        topCandidates,
      });
      continue;
    }

    let match: MatchInfo | null = null;
    let note = "";
    let action: PreviewLine["action"] = "open_item";

    const hit = bestMenuMatch(menu, r.item, unit);
    if (hit) {
      const priceDiff = Math.round((hit.variation.price - unit) * 100) / 100;
      match = {
        menuItemId: hit.m.id,
        menuItemName: hit.m.name,
        category: hit.m.category,
        variationId: hit.variation.id,
        variationName: hit.variation.name,
        dbPrice: hit.variation.price,
        score: hit.s,
        priceDiff,
        available: hit.m.available,
        notForSale: hit.m.notForSale,
      };
      if (hit.s >= 70 || Math.abs(priceDiff) <= 5) {
        action = "menu_item";
        note =
          Math.abs(priceDiff) > 0.5
            ? `Price differs: report ${inr(unit)} vs menu ${inr(hit.variation.price)} — will use menu price × qty`
            : "Matched to menu; will use menu variation";
      } else {
        action = "open_item";
        note = `Weak match (${hit.m.name}); treating as open item at report unit price`;
        match = null;
      }
    } else {
      note = "No confident menu match — would add as open item";
    }

    lines.push({
      source: "excel",
      reportCategory: r.category || "(none)",
      reportItem: r.item,
      qty: r.qty,
      unitPrice: Math.round(unit * 100) / 100,
      reportTotal: r.total,
      action,
      match,
      note,
      topCandidates,
    });
  }

  // Notebook open items (27/7/26) — replaces Excel "Open Item / C burger" aggregate
  // Confirmed mappings from open-items notebook (27/7/26).
  // F. Momo notebook line was ₹200 → 2× Fried Chicken Momo @100.
  const openNotebook: {
    name: string;
    qty: number;
    unitPrice: number;
    detail: string;
  }[] = [
    { name: "Popcorn", qty: 3, unitPrice: 110, detail: "(2)+1 → Popcorn Chicken Regular" },
    { name: "Popcorn", qty: 1, unitPrice: 199, detail: "→ Popcorn Chicken Large" },
    { name: "C. Burger", qty: 1, unitPrice: 100, detail: "→ Chicken Tikki Burger" },
    {
      name: "C. Samosa",
      qty: 6,
      unitPrice: 35,
      detail: "(2)+3+1 → Chicken Samosa (new menu item)",
    },
    {
      name: "C. Samosa",
      qty: 3,
      unitPrice: 35,
      detail: "trailing '3 → 105' line, logged after the 1319 subtotal",
    },
    { name: "Wings (4PC)", qty: 1, unitPrice: 120, detail: "→ Wings 4 Pcs (menu ₹119)" },
    {
      name: "F. Momo (10PC)",
      qty: 2,
      unitPrice: 100,
      detail: "notebook ₹200 → 2× Fried Chicken Momo @100",
    },
    { name: "V. Burger", qty: 2, unitPrice: 80, detail: "→ Veg Tikki Burger" },
  ];

  for (const o of openNotebook) {
    const scored = menu
      .filter(isSaleable)
      .map((m) => ({
        m,
        s: Math.max(...searchPhrases(o.name).map((p) => scoreName(m.name, p))),
      }))
      .sort((a, b) => b.s - a.s);
    const topCandidates = scored.slice(0, 4).map((c) => ({
      name: c.m.name,
      score: c.s,
      vars: c.m.variations.map((v) => `${v.name}:${v.price}`).join("|"),
    }));

    let match: MatchInfo | null = null;
    let action: PreviewLine["action"] = "open_item";
    let note = `From open-items notebook ${o.detail || ""}`.trim();

    const hit = bestMenuMatch(menu, o.name, o.unitPrice);
    if (
      hit &&
      hit.s >= 70 &&
      Math.abs(hit.variation.price - o.unitPrice) <= 5
    ) {
      match = {
        menuItemId: hit.m.id,
        menuItemName: hit.m.name,
        category: hit.m.category,
        variationId: hit.variation.id,
        variationName: hit.variation.name,
        dbPrice: hit.variation.price,
        score: hit.s,
        priceDiff: Math.round((hit.variation.price - o.unitPrice) * 100) / 100,
        available: hit.m.available,
        notForSale: hit.m.notForSale,
      };
      action = "menu_item";
      note += ` — matched to ${hit.m.name} (${hit.variation.name})`;
    } else if (hit) {
      note += ` — closest "${hit.m.name}" @ ${inr(hit.variation.price)}; keep as open @ ${inr(o.unitPrice)}`;
    } else {
      note += " — no safe menu match; add as open item";
    }

    lines.push({
      source: "open_notebook",
      reportCategory: "Open Item (notebook)",
      reportItem: o.name,
      qty: o.qty,
      unitPrice: o.unitPrice,
      reportTotal: o.qty * o.unitPrice,
      action,
      match,
      note,
      topCandidates,
    });
  }

  const reportGrand = report.reduce((s, r) => s + r.total, 0);

  // The POS rang up more across open items than the notebook prices account for,
  // and menu pricing trims Wings by ₹1. Balance so the day ties to the report.
  const beforeAdjustment = lines
    .filter((l) => l.action !== "skip_excel_open_aggregate")
    .reduce(
      (s, l) => s + (l.match ? l.match.dbPrice * l.qty : l.reportTotal),
      0,
    );
  const adjustment = Math.round((reportGrand - beforeAdjustment) * 100) / 100;
  if (adjustment !== 0) {
    lines.push({
      source: "adjustment",
      reportCategory: "Open Item (adjustment)",
      reportItem: "Open-item price adjustment",
      qty: 1,
      unitPrice: adjustment,
      reportTotal: adjustment,
      action: "open_item",
      match: null,
      note: `Ties the day to the Excel report total of ${inr(reportGrand)}: open items billed above notebook prices, plus menu pricing on matched lines`,
      topCandidates: [],
    });
  }

  const toAdd = lines.filter((l) => l.action !== "skip_excel_open_aggregate");
  const menuAdds = toAdd.filter((l) => l.action === "menu_item");
  const openAdds = toAdd.filter((l) => l.action === "open_item");
  const skipped = lines.filter((l) => l.action === "skip_excel_open_aggregate");

  const excelOpenTotal = skipped.reduce((s, l) => s + l.reportTotal, 0);
  const notebookOpenTotal = openAdds
    .filter((l) => l.source === "open_notebook")
    .reduce((s, l) => s + l.reportTotal, 0);
  // Also include notebook lines that matched menu
  const notebookAllTotal = lines
    .filter((l) => l.source === "open_notebook")
    .reduce((s, l) => s + l.reportTotal, 0);

  const previewMenuTotal = menuAdds.reduce(
    (s, l) => s + (l.match ? l.match.dbPrice * l.qty : l.reportTotal),
    0,
  );
  const previewOpenTotal = openAdds.reduce((s, l) => s + l.reportTotal, 0);
  const previewGrand = previewMenuTotal + previewOpenTotal;

  // Existing DB sales for that day
  const start = new Date(`${SALE_DATE}T00:00:00+05:30`);
  const end = new Date(`2026-07-28T00:00:00+05:30`);
  const existing = await prisma.order.aggregate({
    where: { createdAt: { gte: start, lt: end } },
    _count: true,
    _sum: { totalMinor: true },
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sales preview · ${SALE_DATE} (NOT inserted)</title>
<style>
  :root {
    --bg: #f6f1e8;
    --ink: #1c1917;
    --muted: #57534e;
    --line: #d6d3d1;
    --ok: #166534;
    --ok-bg: #dcfce7;
    --warn: #9a3412;
    --warn-bg: #ffedd5;
    --skip: #57534e;
    --skip-bg: #e7e5e4;
    --card: #fffdf9;
    --accent: #0f766e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #ccfbf1 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #fde68a 0%, transparent 50%),
      var(--bg);
    color: var(--ink);
    line-height: 1.45;
  }
  header {
    padding: 2rem 1.5rem 1rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  header h1 {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 600;
    font-size: clamp(1.6rem, 3vw, 2.2rem);
    margin: 0 0 0.35rem;
    letter-spacing: -0.02em;
  }
  .badge {
    display: inline-block;
    background: var(--warn-bg);
    color: var(--warn);
    border: 1px solid #fdba74;
    padding: 0.2rem 0.65rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sub { color: var(--muted); max-width: 52rem; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
    max-width: 1100px;
    margin: 0 auto 1.5rem;
    padding: 0 1.5rem;
  }
  .stat {
    background: var(--card);
    border: 1px solid var(--line);
    padding: 0.9rem 1rem;
  }
  .stat .k { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .v { font-size: 1.25rem; font-weight: 650; margin-top: 0.15rem; font-variant-numeric: tabular-nums; }
  .notice {
    max-width: 1100px;
    margin: 0 auto 1.25rem;
    padding: 0.85rem 1rem;
    border: 1px solid #fdba74;
    background: #fff7ed;
    color: #9a3412;
  }
  section {
    max-width: 1100px;
    margin: 0 auto 2rem;
    padding: 0 1.5rem;
  }
  h2 {
    font-family: "Fraunces", Georgia, serif;
    font-size: 1.25rem;
    margin: 0 0 0.75rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border: 1px solid var(--line);
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 0.55rem 0.65rem;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  th {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: #fafaf9;
  }
  tr:last-child td { border-bottom: none; }
  .num { font-variant-numeric: tabular-nums; text-align: right; white-space:nowrap; }
  .pill {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 650;
    padding: 0.12rem 0.45rem;
    border-radius: 2px;
  }
  .pill-menu { background: var(--ok-bg); color: var(--ok); }
  .pill-open { background: var(--warn-bg); color: var(--warn); }
  .pill-skip { background: var(--skip-bg); color: var(--skip); }
  .muted { color: var(--muted); font-size: 0.8rem; }
  .diff-bad { color: #b91c1c; font-weight: 600; }
  .diff-ok { color: var(--ok); }
  footer {
    max-width: 1100px;
    margin: 0 auto 3rem;
    padding: 0 1.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
</head>
<body>
  <header>
    <span class="badge">Preview only · nothing inserted</span>
    <h1>Sales import preview · ${SALE_DATE}</h1>
    <p class="sub">
      Source: Item Wise Sales Report Excel + handwritten open items (27/7/26).
      Compared against live menu in DB (${menu.length} items).
      Existing orders that day: <strong>${existing._count}</strong>
      (${inr((existing._sum.totalMinor ?? 0) / 100)}).
    </p>
  </header>

  <div class="stats">
    <div class="stat"><div class="k">Excel report total</div><div class="v">${inr(reportGrand)}</div></div>
    <div class="stat"><div class="k">Excel open aggregate</div><div class="v">${inr(excelOpenTotal)}</div></div>
    <div class="stat"><div class="k">Notebook open total</div><div class="v">${inr(notebookAllTotal)}</div></div>
    <div class="stat"><div class="k">Would add (menu @ DB price)</div><div class="v">${inr(previewMenuTotal)}</div></div>
    <div class="stat"><div class="k">Would add (open items)</div><div class="v">${inr(previewOpenTotal)}</div></div>
    <div class="stat"><div class="k">Preview grand total</div><div class="v">${inr(previewGrand)}</div></div>
  </div>

  <div class="notice" style="max-width:1100px;margin:0 auto 1.25rem;padding:0 1.5rem;">
    <div style="border:1px solid #fdba74;background:#fff7ed;padding:0.85rem 1rem;">
      <strong>Open-item reconciliation:</strong> Excel lists one Open Item row
      “C burger” · qty ${skipped[0]?.qty ?? "?"} · ${inr(excelOpenTotal)}.
      The notebook breakdown replaces it: ${inr(notebookAllTotal)} across
      ${lines.filter((l) => l.source === "open_notebook").reduce((s, l) => s + l.qty, 0)} units
      (the page’s own 1284→1319 subtotal, plus the trailing “C. Samosa 3 → 105” line).
      That is 18 notebook entries — matching Excel’s qty — counted as 19 here because
      the ₹200 momo line becomes 2 plates at ₹100. The value still falls
      ${inr(excelOpenTotal - notebookAllTotal)} short of Excel, so an adjustment line of
      <strong>${inr(adjustment)}</strong> (that ${inr(excelOpenTotal - notebookAllTotal)}
      plus ₹1 from Wings at menu ₹119) ties the day to ${inr(reportGrand)}.
    </div>
  </div>

  <section>
    <h2>1. Menu-matched lines (will insert as catalog items)</h2>
    <p class="muted">${menuAdds.length} lines · qty ${menuAdds.reduce((s,l)=>s+l.qty,0)} · ${inr(previewMenuTotal)} at DB prices</p>
    <table>
      <thead>
        <tr>
          <th>Report item</th>
          <th>Cat</th>
          <th class="num">Qty</th>
          <th class="num">Report ₹</th>
          <th>DB match</th>
          <th class="num">DB ₹</th>
          <th class="num">Line ₹</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${menuAdds
          .map((l) => {
            const lineTotal = (l.match?.dbPrice ?? l.unitPrice) * l.qty;
            const diff = l.match?.priceDiff ?? 0;
            return `<tr>
              <td>${esc(l.reportItem)}<div class="muted">${esc(l.reportCategory)}</div></td>
              <td><span class="pill pill-menu">MENU</span></td>
              <td class="num">${l.qty}</td>
              <td class="num">${inr(l.unitPrice)}<div class="muted">= ${inr(l.reportTotal)}</div></td>
              <td>${esc(l.match?.menuItemName ?? "—")}
                <div class="muted">${esc(l.match?.variationName ?? "")} · ${esc(l.match?.menuItemId ?? "")}</div>
              </td>
              <td class="num ${Math.abs(diff) > 0.5 ? "diff-bad" : "diff-ok"}">${inr(l.match?.dbPrice ?? 0)}${Math.abs(diff) > 0.5 ? `<div class="muted">Δ ${diff > 0 ? "+" : ""}${diff}</div>` : ""}</td>
              <td class="num">${inr(lineTotal)}</td>
              <td class="muted">${esc(l.note)}</td>
            </tr>`;
          })
          .join("\n")}
      </tbody>
    </table>
  </section>

  <section>
    <h2>2. Open items (will insert as open lines)</h2>
    <p class="muted">${openAdds.length} lines · ${inr(previewOpenTotal)}</p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Source</th>
          <th class="num">Qty</th>
          <th class="num">Unit ₹</th>
          <th class="num">Line ₹</th>
          <th>Closest menu (not used)</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${openAdds
          .map(
            (l) => `<tr>
              <td>${esc(l.reportItem)}</td>
              <td><span class="pill pill-open">OPEN</span> <span class="muted">${esc(l.source)}</span></td>
              <td class="num">${l.qty}</td>
              <td class="num">${inr(l.unitPrice)}</td>
              <td class="num">${inr(l.reportTotal)}</td>
              <td class="muted">${esc(l.topCandidates.map((c) => `${c.name} (${c.score}) ${c.vars}`).join(" · ") || "—")}</td>
              <td class="muted">${esc(l.note)}</td>
            </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>
  </section>

  <section>
    <h2>3. Skipped Excel rows</h2>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th><th>Reason</th></tr></thead>
      <tbody>
        ${skipped
          .map(
            (l) => `<tr>
              <td>${esc(l.reportItem)} <span class="pill pill-skip">SKIP</span></td>
              <td class="num">${l.qty}</td>
              <td class="num">${inr(l.reportTotal)}</td>
              <td class="muted">${esc(l.note)}</td>
            </tr>`,
          )
          .join("\n") || `<tr><td colspan="4" class="muted">None</td></tr>`}
      </tbody>
    </table>
  </section>

  <section>
    <h2>4. Full Excel item list (raw)</h2>
    <table>
      <thead>
        <tr><th>Category</th><th>Item</th><th class="num">Qty</th><th class="num">Total</th><th class="num">Unit</th></tr>
      </thead>
      <tbody>
        ${report
          .map(
            (r) => `<tr>
              <td>${esc(r.category || "")}</td>
              <td>${esc(String(r.item))}</td>
              <td class="num">${r.qty}</td>
              <td class="num">${inr(r.total)}</td>
              <td class="num">${inr(r.qty ? r.total / r.qty : 0)}</td>
            </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>
  </section>

  <footer>
    Generated ${new Date().toISOString()} · script <code>scripts/preview-sales-2026-07-27.ts</code>.
    No database writes were performed.
  </footer>
</body>
</html>`;

  writeFileSync(OUT_HTML, html, "utf8");
  writeFileSync(
    join(process.cwd(), "samples", "sales-preview-2026-07-27.json"),
    JSON.stringify(
      {
        saleDate: SALE_DATE,
        existingOrders: existing._count,
        reportGrand,
        excelOpenTotal,
        notebookOpenTotal,
        notebookAllTotal,
        previewMenuTotal,
        previewOpenTotal,
        previewGrand,
        lines,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote ${OUT_HTML}`);
  console.log(
    JSON.stringify(
      {
        menuAdds: menuAdds.length,
        openAdds: openAdds.length,
        skipped: skipped.length,
        previewGrand,
        excelOpenTotal,
        notebookAllTotal,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
