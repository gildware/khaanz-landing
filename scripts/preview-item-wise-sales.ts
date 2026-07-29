/**
 * Preview Item Wise Sales Report against menu DB (no insert).
 * Usage:
 *   npx tsx scripts/preview-item-wise-sales.ts --date 2026-07-28 --excel "/path/to.xlsx"
 *   npx tsx scripts/preview-item-wise-sales.ts --date 2026-07-29 --excel "/path/to.xlsx"
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

function searchPhrases(reportItem: string): string[] {
  const raw = reportItem.trim();
  const phrases = [raw];
  const { base } = stripParenSize(raw);
  if (base !== raw) phrases.push(base);

  const drink = raw.match(/^cold drink\s*\((.+)\)\s*$/i);
  if (drink) {
    const inner = drink[1].replace(/@\s*\d+/g, "").trim();
    phrases.push(inner);
    phrases.push(inner.replace(/\s+tin\b/i, "").trim());
  }

  const ice = raw.match(/^ice cream\s*\((.+)\)\s*$/i);
  if (ice) {
    phrases.push(ice[1].replace(/@\s*\d+/g, "").trim());
  }

  const fish = raw.match(/^fried fish\s*\((.+)\)\s*$/i);
  if (fish) phrases.push("Fried Fish");

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
    "diet coke": ["Diet Coke"],
    popcorn: ["Popcorn Chicken"],
    "c burger": ["Chicken Tikki Burger"],
    "c. burger": ["Chicken Tikki Burger"],
    "v burger": ["Veg Tikki Burger"],
    "v. burger": ["Veg Tikki Burger"],
    "c samosa": ["Chicken Samosa"],
    "c. samosa": ["Chicken Samosa"],
    "chola puri": ["Chole Poori"],
    "chole puri": ["Chole Poori"],
    "chilly almond": ["Chillz Almond"],
    "chillz almond": ["Chillz Almond"],
    nimbu: ["Nimbuz Jeera"],
    nimbur: ["Nimbuz Jeera"],
    "crispy chicken 2pc": ["Crispy Chicken"],
    "crispy chicken": ["Crispy Chicken"],
    "strips 8pc": ["Strips"],
    "strips 6pc": ["Strips"],
    strips: ["Strips"],
    "wings 4pc": ["Wings"],
    "cookey crunch": ["Cookie Crunch"],
    "cookie crunch": ["Cookie Crunch"],
    "choco cone": ["Chocolate Cone"],
    "peri peri fries": ["Peri Peri Fries"],
    "black current": ["Blackcurrent Blast"],
    "blackcurrent": ["Blackcurrent Blast"],
  };
  for (const [k, vals] of Object.entries(aliases)) {
    if (n === k || norm(raw) === k || n.includes(k) || norm(raw).includes(k)) {
      phrases.push(...vals);
    }
  }
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
      regular: ["regular", "single", "plate", "small"],
      half: ["half"],
      full: ["full"],
      single: ["single", "regular"],
      large: ["large", "full", "500 ml"],
      small: ["small", "regular", "250 ml", "half"],
    };
    const targets = sizeAliases[size] ?? [size];
    const bySize = pool.find((v) =>
      targets.some((t) => norm(v.name) === t || norm(v.name).includes(t)),
    );
    if (bySize) variation = bySize;
  }
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

  const inner = reportItem.match(/\(([^)]+)\)/)?.[1] ?? "";
  if (/cold drink/i.test(reportItem) || /tin/i.test(inner)) {
    for (const c of scored) {
      if (/tin/i.test(inner) && /tin/i.test(c.m.name)) c.s += 25;
      if (/thums|thumbs/i.test(inner) && /thumb/i.test(c.m.name)) c.s += 40;
      if (/\bdew\b/i.test(inner) && /mountain dew/i.test(c.m.name)) c.s += 40;
      if (/diet\s*coke/i.test(inner)) {
        if (/diet/i.test(c.m.name)) c.s += 50;
        else if (/coca|coke/i.test(c.m.name)) c.s -= 40; // don't steal Diet Coke
      } else if (/coca|coke/i.test(inner) && /coca/i.test(c.m.name)) {
        if (/tin/i.test(inner) === /tin/i.test(c.m.name)) c.s += 20;
      }
      if (/sprite/i.test(inner) && /sprite/i.test(c.m.name)) c.s += 30;
      if (/pepsi/i.test(inner) && /pepsi/i.test(c.m.name)) c.s += 30;
    }
    scored.sort((a, b) => b.s - a.s);
  }

  if (/ice cream/i.test(reportItem)) {
    for (const c of scored) {
      if (/cookey|cookie/i.test(inner) && /cookie/i.test(c.m.name)) c.s += 40;
      if (/choco/i.test(inner) && /choco|chocolate cone/i.test(c.m.name))
        c.s += 40;
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
  const SALE_DATE = arg("--date");
  const EXCEL = arg("--excel");
  const OPEN_NOTEBOOK = arg("--open-notebook");
  if (!SALE_DATE || !/^\d{4}-\d{2}-\d{2}$/.test(SALE_DATE) || !EXCEL) {
    console.error(
      "Usage: npx tsx scripts/preview-item-wise-sales.ts --date YYYY-MM-DD --excel /path.xlsx [--open-notebook /path.json]",
    );
    process.exit(1);
  }

  type NotebookFile = {
    lines: { name: string; qty: number; unitPrice: number; detail?: string }[];
  };
  let notebook: NotebookFile | null = null;
  if (OPEN_NOTEBOOK) {
    notebook = JSON.parse(readFileSync(OPEN_NOTEBOOK, "utf8")) as NotebookFile;
  }

  const OUT_DIR = join(process.cwd(), "samples");
  mkdirSync(OUT_DIR, { recursive: true });
  const OUT_HTML = join(OUT_DIR, `sales-preview-${SALE_DATE}.html`);
  const OUT_JSON = join(OUT_DIR, `sales-preview-${SALE_DATE}.json`);

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
header_date = None
for i, row in enumerate(ws.iter_rows(values_only=True), 1):
    if i == 1 and row and row[0] == "Date:":
        header_date = row[1]
rows = []
for i, row in enumerate(ws.iter_rows(values_only=True), 1):
    if i < 11: continue
    cat, item, code, sap, qty, total = row
    if item is None: continue
    if cat == "Sub Total": continue
    rows.append({
        "category": cat or "",
        "item": item,
        "code": code,
        "qty": float(qty or 0),
        "total": float(total or 0),
    })
print(json.dumps({"headerDate": header_date, "rows": rows}))
PY`,
  ).toString();

  const parsedExcel = JSON.parse(excelJson) as {
    headerDate: string | null;
    rows: {
      category: string;
      item: string;
      code: string | number | null;
      qty: number;
      total: number;
    }[];
  };
  const report = parsedExcel.rows;

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

    // Open-item aggregates from POS are mixed buckets.
    if (isOpenCat) {
      if (notebook) {
        lines.push({
          source: "excel",
          reportCategory: r.category,
          reportItem: r.item,
          qty: r.qty,
          unitPrice: Math.round(unit * 100) / 100,
          reportTotal: r.total,
          action: "skip_excel_open_aggregate",
          match: null,
          note: `Excel open aggregate (${inr(r.total)}, qty ${r.qty}) — replaced by notebook breakdown`,
          topCandidates,
        });
      } else {
        const hit = bestMenuMatch(menu, r.item, unit);
        const unitOk =
          hit && Math.abs(hit.variation.price - unit) <= 1 && hit.s >= 80;
        if (unitOk && hit) {
          lines.push({
            source: "excel",
            reportCategory: r.category,
            reportItem: r.item,
            qty: r.qty,
            unitPrice: Math.round(unit * 100) / 100,
            reportTotal: r.total,
            action: "menu_item",
            match: {
              menuItemId: hit.m.id,
              menuItemName: hit.m.name,
              category: hit.m.category,
              variationId: hit.variation.id,
              variationName: hit.variation.name,
              dbPrice: hit.variation.price,
              score: hit.s,
              priceDiff: Math.round((hit.variation.price - unit) * 100) / 100,
              available: hit.m.available,
              notForSale: hit.m.notForSale,
            },
            note: "Open-item row matched to menu (unit price aligns)",
            topCandidates,
          });
        } else {
          lines.push({
            source: "excel",
            reportCategory: r.category,
            reportItem: r.item,
            qty: r.qty,
            unitPrice: Math.round(unit * 100) / 100,
            reportTotal: r.total,
            action: "open_item",
            match: null,
            note: `POS open-item aggregate (unit ${inr(unit)}). No notebook breakdown — insert as one open line totaling ${inr(r.total)}.`,
            topCandidates,
          });
        }
      }
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

  if (notebook) {
    for (const o of notebook.lines) {
      const scored = menu
        .filter(isSaleable)
        .map((m) => ({
          m,
          s: Math.max(
            ...searchPhrases(o.name).map((p) => scoreName(m.name, p)),
          ),
        }))
        .sort((a, b) => b.s - a.s);
      const topCandidates = scored.slice(0, 4).map((c) => ({
        name: c.m.name,
        score: c.s,
        vars: c.m.variations.map((v) => `${v.name}:${v.price}`).join("|"),
      }));

      let match: MatchInfo | null = null;
      let action: PreviewLine["action"] = "open_item";
      let note = `From open-items notebook${o.detail ? ` — ${o.detail}` : ""}`;

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
        note += ` → ${hit.m.name} (${hit.variation.name})`;
      } else if (hit) {
        note += ` — closest "${hit.m.name}" @ ${inr(hit.variation.price)}; keep as open @ ${inr(o.unitPrice)}`;
      } else {
        note += " — keep as open item";
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
  }

  const menuAdds = lines.filter((l) => l.action === "menu_item");
  const openAdds = lines.filter((l) => l.action === "open_item");
  const skipped = lines.filter((l) => l.action === "skip_excel_open_aggregate");

  const reportGrand = report.reduce((s, r) => s + r.total, 0);
  const excelOpenTotal = skipped.reduce((s, l) => s + l.reportTotal, 0);
  const notebookAllTotal = lines
    .filter((l) => l.source === "open_notebook")
    .reduce((s, l) => s + l.reportTotal, 0);

  let previewMenuTotal = menuAdds.reduce(
    (s, l) => s + (l.match ? l.match.dbPrice * l.qty : l.reportTotal),
    0,
  );
  let previewOpenTotal = openAdds.reduce((s, l) => s + l.reportTotal, 0);
  let previewGrand = previewMenuTotal + previewOpenTotal;

  // Tie to Excel total. A shortfall becomes a catch-up open line; an excess
  // becomes an order-level discount at insert time (can't subtract via lines).
  const adjustment = Math.round((reportGrand - previewGrand) * 100) / 100;
  const discountToMatchExcel = adjustment < -0.009 ? -adjustment : 0;
  if (adjustment > 0.009) {
    openAdds.push({
      source: "adjustment",
      reportCategory: "Adjustment",
      reportItem: "Open-item / price reconciliation",
      qty: 1,
      unitPrice: adjustment,
      reportTotal: adjustment,
      action: "open_item",
      match: null,
      note: `Bridges gap so day total matches Excel ${inr(reportGrand)}`,
      topCandidates: [],
    });
    lines.push(openAdds[openAdds.length - 1]!);
    previewOpenTotal += adjustment;
    previewGrand = previewMenuTotal + previewOpenTotal;
  }

  const start = new Date(`${SALE_DATE}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
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
    --bg: #f6f1e8; --ink: #1c1917; --muted: #57534e; --line: #d6d3d1;
    --ok: #166534; --ok-bg: #dcfce7; --warn: #9a3412; --warn-bg: #ffedd5;
    --card: #fffdf9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #ccfbf1 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #fde68a 0%, transparent 50%),
      var(--bg);
    color: var(--ink); line-height: 1.45;
  }
  header { padding: 2rem 1.5rem 1rem; max-width: 1100px; margin: 0 auto; }
  header h1 {
    font-family: "Fraunces", Georgia, serif; font-weight: 600;
    font-size: clamp(1.6rem, 3vw, 2.2rem); margin: 0 0 0.35rem;
  }
  .badge {
    display: inline-block; background: var(--warn-bg); color: var(--warn);
    border: 1px solid #fdba74; padding: 0.2rem 0.65rem; font-size: 0.8rem;
    font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .sub { color: var(--muted); max-width: 52rem; }
  .stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem; max-width: 1100px; margin: 0 auto 1.5rem; padding: 0 1.5rem;
  }
  .stat { background: var(--card); border: 1px solid var(--line); padding: 0.9rem 1rem; }
  .stat .k { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .v { font-size: 1.25rem; font-weight: 650; margin-top: 0.15rem; font-variant-numeric: tabular-nums; }
  section { max-width: 1100px; margin: 0 auto 2rem; padding: 0 1.5rem; }
  h2 { font-family: "Fraunces", Georgia, serif; font-size: 1.25rem; margin: 0 0 0.75rem; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.55rem 0.65rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: #fafaf9; }
  .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .pill { display: inline-block; font-size: 0.72rem; font-weight: 650; padding: 0.12rem 0.45rem; }
  .pill-menu { background: var(--ok-bg); color: var(--ok); }
  .pill-open { background: var(--warn-bg); color: var(--warn); }
  .muted { color: var(--muted); font-size: 0.8rem; }
  .diff-bad { color: #b91c1c; font-weight: 600; }
  .diff-ok { color: var(--ok); }
  .notice { max-width: 1100px; margin: 0 auto 1.25rem; padding: 0 1.5rem; }
  .notice > div { border: 1px solid #fdba74; background: #fff7ed; padding: 0.85rem 1rem; color: #9a3412; }
  footer { max-width: 1100px; margin: 0 auto 3rem; padding: 0 1.5rem; color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>
  <header>
    <span class="badge">Preview only · nothing inserted</span>
    <h1>Sales import preview · ${SALE_DATE}</h1>
    <p class="sub">
      Excel header date: <strong>${esc(String(parsedExcel.headerDate ?? "—"))}</strong>.
      File: <code>${esc(EXCEL)}</code>.
      Menu items in DB: ${menu.length}.
      Existing orders that day: <strong>${existing._count}</strong>
      (${inr((existing._sum.totalMinor ?? 0) / 100)}).
    </p>
  </header>

  <div class="stats">
    <div class="stat"><div class="k">Excel report total</div><div class="v">${inr(reportGrand)}</div></div>
    <div class="stat"><div class="k">Would add (menu @ DB)</div><div class="v">${inr(previewMenuTotal)}</div></div>
    <div class="stat"><div class="k">Would add (open)</div><div class="v">${inr(previewOpenTotal)}</div></div>
    <div class="stat"><div class="k">Preview grand total</div><div class="v">${inr(previewGrand)}</div></div>
  </div>

  ${
    notebook || skipped.length
      ? `<div class="notice"><div>
        <strong>Open-item reconciliation:</strong>
        Excel open aggregate ${inr(excelOpenTotal)}.
        Notebook breakdown ${inr(notebookAllTotal)}
        (${lines.filter((l) => l.source === "open_notebook").reduce((s, l) => s + l.qty, 0)} units).
        ${
          adjustment > 0.009
            ? `Adjustment ${inr(adjustment)} added so day = Excel ${inr(reportGrand)}.`
            : discountToMatchExcel > 0
              ? `Notebook lines exceed the POS open bucket by ${inr(discountToMatchExcel)}; a discount of that amount is applied at insert so the day = Excel ${inr(reportGrand)}.`
              : `Preview ties to Excel ${inr(reportGrand)}.`
        }
        Onion Flour / stock notes are not included as sales.
      </div></div>`
      : openAdds.some((l) => /open item/i.test(l.reportCategory))
        ? `<div class="notice"><div>
        <strong>Open items:</strong> No handwritten breakdown for this day.
        POS open-item row(s) will be inserted as open lines at report totals
        so the day still ties to ${inr(reportGrand)}.
      </div></div>`
        : ""
  }

  <section>
    <h2>1. Menu-matched lines</h2>
    <p class="muted">${menuAdds.length} lines · qty ${menuAdds.reduce((s, l) => s + l.qty, 0)} · ${inr(previewMenuTotal)}</p>
    <table>
      <thead>
        <tr>
          <th>Report item</th><th></th><th class="num">Qty</th>
          <th class="num">Report ₹</th><th>DB match</th>
          <th class="num">DB ₹</th><th class="num">Line ₹</th><th>Note</th>
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
    <h2>2. Open items</h2>
    <p class="muted">${openAdds.length} lines · ${inr(previewOpenTotal)}</p>
    <table>
      <thead>
        <tr>
          <th>Name</th><th></th><th class="num">Qty</th>
          <th class="num">Unit ₹</th><th class="num">Line ₹</th><th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${
          openAdds
            .map(
              (l) => `<tr>
              <td>${esc(l.reportItem)}</td>
              <td><span class="pill pill-open">OPEN</span></td>
              <td class="num">${l.qty}</td>
              <td class="num">${inr(l.unitPrice)}</td>
              <td class="num">${inr(l.reportTotal)}</td>
              <td class="muted">${esc(l.note)}</td>
            </tr>`,
            )
            .join("\n") || `<tr><td colspan="6" class="muted">None</td></tr>`
        }
      </tbody>
    </table>
  </section>

  <footer>
    Generated ${new Date().toISOString()} · preview only · no DB writes.
  </footer>
</body>
</html>`;

  writeFileSync(OUT_HTML, html, "utf8");
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        saleDate: SALE_DATE,
        excelPath: EXCEL,
        excelHeaderDate: parsedExcel.headerDate,
        existingOrders: existing._count,
        existingTotalRupees: (existing._sum.totalMinor ?? 0) / 100,
        reportGrand,
        excelOpenTotal,
        notebookAllTotal,
        previewMenuTotal,
        previewOpenTotal,
        previewGrand,
        adjustment,
        discountToMatchExcel,
        insertTotal: reportGrand,
        lines,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        saleDate: SALE_DATE,
        excelHeaderDate: parsedExcel.headerDate,
        outHtml: OUT_HTML,
        menuAdds: menuAdds.length,
        openAdds: openAdds.length,
        reportGrand,
        previewGrand,
        excelOpenTotal,
        notebookAllTotal,
        adjustment,
        discountToMatchExcel,
        insertTotal: reportGrand,
        existingOrders: existing._count,
        unmatched: openAdds
          .filter((l) => l.reportItem !== "Open-item / price reconciliation")
          .map((l) => `${l.reportItem} qty ${l.qty} @ ${l.unitPrice}`),
        notebookMapped: lines
          .filter((l) => l.source === "open_notebook")
          .map((l) => {
            const m = l.match;
            return `${l.reportItem} qty ${l.qty}@${l.unitPrice} → ${
              m
                ? `${m.menuItemName}/${m.variationName}@${m.dbPrice}`
                : "OPEN"
            }`;
          }),
        priceDiffs: menuAdds
          .filter((l) => l.match && Math.abs(l.match.priceDiff) > 0.5)
          .map(
            (l) =>
              `${l.reportItem}: report ${l.unitPrice} → ${l.match!.menuItemName}/${l.match!.variationName}@${l.match!.dbPrice}`,
          ),
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
