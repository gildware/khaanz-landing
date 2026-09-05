/**
 * Build a browser-viewable notebook review page from
 * samples/notebook-review/notebook-2026-08.json
 *
 * Run: npx tsx scripts/generate-notebook-review-html.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Flag = "ready" | "needs_confirm" | "needs_qty" | "skip";
type Line = {
  raw: string;
  category: string;
  db?: string;
  qty?: string;
  amount?: number;
  pay?: string;
  supplier?: string;
  flag?: Flag;
  note?: string;
};
type Day = {
  date: string;
  status: string;
  label: string;
  notebookExp?: number | null;
  notebookStaffExp?: number;
  lines: Line[];
};
type Cat = { id: string; label: string };
type Doc = {
  title: string;
  notice: string;
  categories: Cat[];
  days: Day[];
};

const root = process.cwd();
const jsonPath = join(root, "samples/notebook-review/notebook-2026-08.json");
const outPath = join(root, "samples/notebook-review/index.html");

const doc = JSON.parse(readFileSync(jsonPath, "utf8")) as Doc;

function inr(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function sum(lines: Line[]): number {
  return lines.reduce((s, l) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
}

function insertable(l: Line): boolean {
  return (
    l.flag !== "skip" &&
    l.category !== "cashbook" &&
    l.category !== "note" &&
    l.category !== "attendance" &&
    l.category !== "sale"
  );
}

function isSale(l: Line): boolean {
  return l.category === "sale";
}

const SYSTEM_TABS = [
  { id: "sale", label: "Sales" },
  { id: "inventory_purchase", label: "Inventory purchases" },
  { id: "kitchen_use", label: "Kitchen use" },
  { id: "supplier_payment", label: "Supplier payments" },
  { id: "business_expense", label: "Business expenses" },
  { id: "personal_use", label: "Personal use" },
  { id: "advance_salary", label: "Advance salary" },
] as const;

const SCREEN: Record<string, string> = {
  sale: "POS (already recorded)",
  inventory_purchase: "Inventory → Purchase",
  kitchen_use: "Inventory → Kitchen use",
  supplier_payment: "Inventory → Pay supplier",
  business_expense: "Expenses → Business",
  personal_use: "Expenses → Personal use",
  advance_salary: "Payroll → Advance salary",
  cashbook: "Not inserted",
};

function tabId(category: string): string {
  if (category === "note" || category === "attendance") return "cashbook";
  if (
    category === "consumable" ||
    category === "daily_expense" ||
    category === "staff_expense"
  ) {
    return "business_expense";
  }
  return category;
}

function catsOnDay(d: Day): string[] {
  const set = new Set(d.lines.map((l) => tabId(l.category)));
  return SYSTEM_TABS.map((t) => t.id).filter((id) => set.has(id));
}

const allInsert = doc.days.flatMap((d) => d.lines.filter(insertable));
const readyCount = allInsert.filter((l) => l.flag === "ready").length;
const draftCount = allInsert.filter((l) => l.flag !== "ready").length;

const catTotals = SYSTEM_TABS.map((c) => ({
  ...c,
  amount: sum(
    doc.days.flatMap((d) => d.lines.filter((l) => tabId(l.category) === c.id)),
  ),
  count: doc.days.reduce(
    (n, d) => n + d.lines.filter((l) => tabId(l.category) === c.id).length,
    0,
  ),
}));

function flagClass(f?: Flag): string {
  if (f === "ready") return "flag-ready";
  if (f === "skip") return "flag-skip";
  if (f === "needs_qty") return "flag-qty";
  return "flag-confirm";
}

function flagLabel(f?: Flag): string {
  if (f === "ready") return "ready";
  if (f === "skip") return "skip";
  if (f === "needs_qty") return "need qty";
  return "confirm";
}

function needsVerify(l: Line): boolean {
  return (
    insertable(l) &&
    (l.flag === "needs_confirm" || l.flag === "needs_qty")
  );
}

function rowsHtml(
  lines: Line[],
  opts: { date?: string; showDate?: boolean } = {},
): string {
  return lines
    .map((l) => {
      const dest = [SCREEN[tabId(l.category)], l.db, l.supplier, l.pay]
        .filter(Boolean)
        .join(" · ");
      const dateCell = opts.showDate
        ? `<td class="num">${esc(opts.date ? fmtDay(opts.date) : "")}</td>`
        : "";
      return `<tr class="cat-${tabId(l.category)} flag-${l.flag ?? "needs_confirm"}" data-cat="${tabId(l.category)}" data-flag="${l.flag ?? "needs_confirm"}">
        ${dateCell}
        <td><span class="pill">${esc(catLabel(l.category))}</span></td>
        <td>${esc(l.raw)}</td>
        <td class="muted">${esc(dest)}</td>
        <td class="num">${esc(l.qty ?? "")}</td>
        <td class="num">${inr(l.amount)}</td>
        <td><span class="flag ${flagClass(l.flag)}">${flagLabel(l.flag)}</span></td>
        <td class="muted">${esc(l.note ?? "")}</td>
      </tr>`;
    })
    .join("\n");
}

function fmtDay(date: string): string {
  return `${date.slice(8)}/${date.slice(5, 7)}`;
}

function catLabel(id: string): string {
  if (tabId(id) === "cashbook") return "Cashbook / notes";
  return SYSTEM_TABS.find((t) => t.id === tabId(id))?.label ?? id;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tableHead(showDate = false): string {
  return `<thead><tr>
    ${showDate ? "<th>Date</th>" : ""}
    <th>Bucket</th><th>Notebook</th><th>Would go to</th><th>Qty</th><th>₹</th><th>Flag</th><th>Note</th>
  </tr></thead>`;
}

const verifyCount = doc.days.reduce(
  (n, d) => n + d.lines.filter(needsVerify).length,
  0,
);

const dayTabs = [
  ...doc.days.map((d, i) => {
    const n = d.lines.filter(insertable).length;
    const v = d.lines.filter(needsVerify).length;
    return `<button type="button" class="tab date-tab ${i === 0 ? "on" : ""} ${d.status}" data-panel="d-${d.date}">
      ${fmtDay(d.date)} <small>${n}</small>${v ? `<span class="dot">${v}</span>` : ""}
    </button>`;
  }),
  `<button type="button" class="tab date-tab verify-tab" data-panel="need-verify">Need verify <small>${verifyCount}</small></button>`,
].join("");

const catTabs = [
  `<button type="button" class="tab cat-tab on" data-cat="all">All</button>`,
  ...SYSTEM_TABS.map(
    (c) =>
      `<button type="button" class="tab cat-tab" data-cat="${c.id}">${esc(c.label)}</button>`,
  ),
].join("");

const daySections = doc.days
  .map((d, i) => {
    const insertLines = d.lines.filter(insertable);
    const saleLines = d.lines.filter(isSale);
    const other = d.lines.filter((l) => !insertable(l) && !isSale(l));
    return `<section class="panel day" id="d-${d.date}" data-cats="${catsOnDay(d).join(",")}" ${i === 0 ? "" : "hidden"}>
      <h2>${esc(d.label)}</h2>
      <table>
        ${tableHead()}
        <tbody>${rowsHtml([...saleLines, ...insertLines])}</tbody>
      </table>
      ${
        other.length
          ? `<h3>Cashbook / notes (not inserted)</h3>
      <table class="dim">
        ${tableHead()}
        <tbody>${rowsHtml(other)}</tbody>
      </table>`
          : ""
      }
    </section>`;
  })
  .join("\n");

const verifyByDate = doc.days
  .map((d) => {
    const lines = d.lines.filter(needsVerify);
    if (!lines.length) return "";
    return `<h3>${esc(d.label)}</h3>
      <table>
        ${tableHead()}
        <tbody>${rowsHtml(lines)}</tbody>
      </table>`;
  })
  .join("\n");

const verifyCats = [
  ...new Set(
    doc.days.flatMap((d) => d.lines.filter(needsVerify).map((l) => tabId(l.category))),
  ),
].join(",");

const verifySection = `<section class="panel day" id="need-verify" data-cats="${verifyCats}" hidden>
  <h2>Need verify</h2>
  ${verifyByDate}
</section>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(doc.title)} · NOT inserted</title>
<style>
  :root {
    --bg: #f4efe6; --ink: #1c1917; --muted: #57534e; --line: #d6d3d1;
    --card: #fffdf8; --accent: #0f766e;
    --ready: #166534; --ready-bg: #dcfce7;
    --confirm: #9a3412; --confirm-bg: #ffedd5;
    --qty: #1e3a8a; --qty-bg: #dbeafe;
    --skip: #44403c; --skip-bg: #e7e5e4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background: var(--bg); color: var(--ink); line-height: 1.45;
  }
  header.page {
    padding: 1.25rem 1.25rem 0.5rem; max-width: 1280px; margin: 0 auto;
  }
  h1 { font-family: Georgia, serif; font-size: clamp(1.3rem, 3vw, 1.8rem); margin: 0 0 0.3rem; font-weight: 600; }
  .badge {
    display: inline-block; background: var(--confirm-bg); color: var(--confirm);
    border: 1px solid #fdba74; padding: 0.15rem 0.55rem; font-size: 0.75rem;
    font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .sub { color: var(--muted); max-width: 58rem; margin: 0.35rem 0 0.75rem; }
  .sticky {
    position: sticky; top: 0; z-index: 8; background: #f4efe6f2;
    border-bottom: 1px solid var(--line);
  }
  .tab-row { max-width: 1280px; margin: 0 auto; padding: 0.45rem 1.25rem 0.35rem; }
  .tab-row.cats { padding-top: 0; padding-bottom: 0.5rem; }
  .cat-tab[hidden] { display: none; }
  .tab-label {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); margin: 0 0 0.3rem;
  }
  .tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .tab {
    border: 1px solid var(--line); background: var(--card); color: var(--ink);
    padding: 0.28rem 0.55rem; font-size: 0.8rem; font-weight: 600; cursor: pointer;
  }
  .tab small { color: var(--muted); font-weight: 500; }
  .tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .tab.on small { color: #ccfbf1; }
  .date-tab.mapped:not(.on),
  .date-tab.inserted:not(.on) { border-color: #86efac; background: var(--ready-bg); }
  .verify-tab:not(.on) { border-color: #fdba74; background: var(--confirm-bg); color: var(--confirm); }
  .dot {
    display: inline-block; margin-left: 0.25rem; min-width: 1.1rem; padding: 0 0.25rem;
    background: var(--confirm-bg); color: var(--confirm); font-size: 0.68rem; font-weight: 700;
  }
  .tab.on .dot { background: #fff; color: var(--confirm); }
  section.panel { max-width: 1280px; margin: 0 auto 2rem; padding: 0.9rem 1.25rem 0; }
  h2 { font-family: Georgia, serif; font-size: 1.15rem; margin: 0 0 0.65rem; }
  h3 { font-size: 0.9rem; margin: 1rem 0 0.4rem; color: var(--muted); }
  .minis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.4rem; margin-bottom: 0.7rem; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); font-size: 0.84rem; }
  th, td { text-align: left; padding: 0.45rem 0.55rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: #fafaf9; }
  .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .muted { color: var(--muted); font-size: 0.8rem; }
  .pill { display: inline-block; font-size: 0.68rem; font-weight: 650; padding: 0.1rem 0.4rem; background: #f5f5f4; }
  .flag { display: inline-block; font-size: 0.68rem; font-weight: 700; padding: 0.08rem 0.4rem; text-transform: uppercase; }
  .flag-ready { background: var(--ready-bg); color: var(--ready); }
  .flag-confirm { background: var(--confirm-bg); color: var(--confirm); }
  .flag-qty { background: var(--qty-bg); color: var(--qty); }
  .flag-skip { background: var(--skip-bg); color: var(--skip); }
  table.dim { opacity: 0.85; }
  footer { max-width: 1280px; margin: 0 auto 3rem; padding: 0 1.25rem; color: var(--muted); font-size: 0.85rem; }
  body.filter-on .panel:not([hidden]) tbody tr { display: none; }
  body.filter-on .panel:not([hidden]) tbody tr.show { display: table-row; }
  body.hide-notes .panel:not([hidden]) table.dim,
  body.hide-notes .panel:not([hidden]) h3 { display: none; }
</style>
</head>
<body>
  <header class="page">
    <span class="badge">Preview only · nothing inserted</span>
    <h1>${esc(doc.title)}</h1>
    <p class="sub">Preview only. Pick a date, then a category. Need verify lists every unconfirmed line.</p>
  </header>
  <div class="sticky">
    <div class="tab-row">
      <p class="tab-label">Date</p>
      <div class="tabs">${dayTabs}</div>
    </div>
    <div class="tab-row cats">
      <p class="tab-label">Category</p>
      <div class="tabs">${catTabs}</div>
    </div>
  </div>
  ${daySections}
  ${verifySection}
  <footer>Regenerate with <code>npx tsx scripts/generate-notebook-review-html.ts</code>.</footer>
  <script>
    const dateTabs = document.querySelectorAll(".date-tab");
    const catTabs = document.querySelectorAll(".cat-tab");
    const panels = document.querySelectorAll(".panel");

    function visiblePanel() {
      return document.querySelector(".panel:not([hidden])");
    }

    function syncCatTabs() {
      const panel = visiblePanel();
      const allowed = new Set((panel?.getAttribute("data-cats") || "").split(",").filter(Boolean));
      catTabs.forEach((btn) => {
        const cat = btn.getAttribute("data-cat");
        btn.hidden = cat !== "all" && !allowed.has(cat);
      });
      const current = document.querySelector(".cat-tab.on");
      if (current && current.hidden) {
        const allBtn = document.querySelector('.cat-tab[data-cat="all"]');
        catTabs.forEach((b) => b.classList.toggle("on", b === allBtn));
        applyCat("all");
      }
    }

    function applyCat(cat) {
      document.body.classList.toggle("filter-on", cat !== "all");
      document.body.classList.toggle("hide-notes", cat !== "all");
      document.querySelectorAll(".panel:not([hidden]) tbody tr").forEach((tr) => {
        tr.classList.toggle("show", tr.getAttribute("data-cat") === cat);
      });
    }

    dateTabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-panel");
        dateTabs.forEach((b) => b.classList.toggle("on", b === btn));
        panels.forEach((p) => { p.hidden = p.id !== id; });
        syncCatTabs();
        const cat = document.querySelector(".cat-tab.on")?.getAttribute("data-cat") || "all";
        applyCat(cat);
      });
    });

    catTabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        catTabs.forEach((b) => b.classList.toggle("on", b === btn));
        applyCat(btn.getAttribute("data-cat"));
      });
    });

    syncCatTabs();
  </script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`Wrote ${outPath}`);
console.log(
  JSON.stringify(
    {
      days: doc.days.length,
      insertLines: allInsert.length,
      ready: readyCount,
      needVerify: draftCount,
      insertSumRupees: sum(allInsert),
      byCategory: catTotals.map((c) => ({
        category: c.label,
        lines: c.count,
        amountRupees: c.amount,
      })),
    },
    null,
    2,
  ),
);
