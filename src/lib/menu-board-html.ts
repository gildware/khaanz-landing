import { SITE } from "@/lib/site";
import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuPayload } from "@/types/menu-payload";
import type { MenuCombo, MenuItem } from "@/types/menu";

const MENU_BOARD_EXCLUDED_CATEGORIES = new Set(["Soft Drinks"]);
const SIGNATURE_CHICKEN_CATEGORY = "Signature Chicken";

/** Categories pinned to page 2 — value is the category they follow in DOM order. */
const MENU_BOARD_PAGE2_AFTER: Record<string, string> = {
  Burgers: "Parathas & Rolls",
};

/** Modern light themes — soft white bases with subtle tint accents. */
const CATEGORY_THEMES = [
  { bg: "#ffffff", accent: "#be123c", border: "#e2e8f0", banner: "#fff1f2" },
  { bg: "#fafafa", accent: "#c2410c", border: "#e2e8f0", banner: "#fff7ed" },
  { bg: "#ffffff", accent: "#b45309", border: "#e2e8f0", banner: "#fffbeb" },
  { bg: "#fafafa", accent: "#059669", border: "#e2e8f0", banner: "#ecfdf5" },
  { bg: "#ffffff", accent: "#2563eb", border: "#e2e8f0", banner: "#eff6ff" },
  { bg: "#fafafa", accent: "#7c3aed", border: "#e2e8f0", banner: "#f5f3ff" },
  { bg: "#ffffff", accent: "#db2777", border: "#e2e8f0", banner: "#fdf2f8" },
  { bg: "#fafafa", accent: "#0891b2", border: "#e2e8f0", banner: "#ecfeff" },
  { bg: "#ffffff", accent: "#475569", border: "#e2e8f0", banner: "#f8fafc" },
  { bg: "#fafafa", accent: "#e11d48", border: "#e2e8f0", banner: "#fff1f2" },
  { bg: "#ffffff", accent: "#65a30d", border: "#e2e8f0", banner: "#f7fee7" },
  { bg: "#fafafa", accent: "#ca8a04", border: "#e2e8f0", banner: "#fefce8" },
  { bg: "#ffffff", accent: "#6d28d9", border: "#e2e8f0", banner: "#f5f3ff" },
  { bg: "#fafafa", accent: "#ea580c", border: "#e2e8f0", banner: "#fff7ed" },
  { bg: "#ffffff", accent: "#0284c7", border: "#e2e8f0", banner: "#f0f9ff" },
] as const;

function isSignatureChickenCombo(combo: MenuCombo): boolean {
  return combo.id.startsWith("khaanz-");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function menuImageSrc(image: string | undefined, fallbackId: string): string {
  const raw = (image ?? "").trim() || `/menu/${fallbackId}.jpg`;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function categoryImageSrc(cat: MenuCategoryDef): string {
  return menuImageSrc(cat.image, slugify(cat.name));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function dietIcon(isVeg: boolean): string {
  return isVeg
    ? `<span class="diet diet-veg" title="Vegetarian"></span>`
    : `<span class="diet diet-nonveg" title="Non-Vegetarian"></span>`;
}

function renderPricesStacked(variations: { name: string; price: number }[]): string {
  if (variations.length === 0) {
    return `<div class="price-stack"><div class="price-line"><span class="price-amt muted">—</span></div></div>`;
  }
  if (variations.length === 1) {
    const v = variations[0]!;
    const generic = ["regular", "single", "plate"].includes(v.name.toLowerCase());
    if (generic) {
      return `<div class="price-stack"><div class="price-line"><span class="price-amt">${formatPrice(v.price)}</span></div></div>`;
    }
    return `<div class="price-stack"><div class="price-line"><span class="price-size">${escapeHtml(v.name)}</span><span class="price-amt">${formatPrice(v.price)}</span></div></div>`;
  }
  return `<div class="price-stack">${variations
    .map(
      (v) =>
        `<div class="price-line"><span class="price-size">${escapeHtml(v.name)}</span><span class="price-amt">${formatPrice(v.price)}</span></div>`,
    )
    .join("")}</div>`;
}

function renderItemRow(item: MenuItem, withItemImages: boolean): string {
  const star = item.recommended ? `<span class="pick">★</span>` : "";
  const thumb = withItemImages
    ? `<img class="item-thumb" src="${escapeHtml(menuImageSrc(item.image, item.id))}" alt="" loading="lazy" decoding="async" />`
    : "";
  return `
    <div class="item-row${item.recommended ? " item-row--pick" : ""}">
      <div class="item-row-inner${withItemImages ? "" : " item-row-inner--compact"}">
        ${thumb}
        <div class="item-detail">
          <div class="item-head">
            <div class="item-title">
              ${star}<span class="item-name">${escapeHtml(item.name)}</span>${dietIcon(item.isVeg)}
            </div>
            ${renderPricesStacked(item.variations)}
          </div>
        </div>
      </div>
    </div>`;
}

function renderComboRow(combo: MenuCombo, withItemImages: boolean): string {
  const thumb = withItemImages
    ? `<img class="item-thumb" src="${escapeHtml(menuImageSrc(combo.image, combo.id))}" alt="" loading="lazy" decoding="async" />`
    : "";
  return `
    <div class="item-row item-row--combo">
      <div class="item-row-inner${withItemImages ? "" : " item-row-inner--compact"}">
        ${thumb}
        <div class="item-detail">
          <div class="item-head">
            <div class="item-title">
              <span class="item-name">${escapeHtml(combo.name)}</span>${dietIcon(combo.isVeg)}
            </div>
            <div class="price-stack combo-amt"><div class="price-line"><span class="price-size">Combo</span><span class="price-amt">${formatPrice(combo.price)}</span></div></div>
          </div>
          <p class="combo-desc">${escapeHtml(combo.description)}</p>
        </div>
      </div>
    </div>`;
}

type CategoryBlock = { html: string; weight: number; categoryName: string };

type CategoryBoxMode = "full" | "items-only" | "combos-only";

function buildCategoryBox(
  cat: MenuCategoryDef,
  themeIndex: number,
  items: MenuItem[],
  combos: MenuCombo[],
  withItemImages: boolean,
  mode: CategoryBoxMode = "full",
): CategoryBlock | null {
  const showItems = mode !== "combos-only";
  const showCombos = mode !== "items-only";
  const visibleItems = showItems ? items : [];
  const visibleCombos = showCombos ? combos : [];

  if (visibleItems.length === 0 && visibleCombos.length === 0) return null;

  const theme = CATEGORY_THEMES[themeIndex % CATEGORY_THEMES.length]!;
  const imgSrc = escapeHtml(categoryImageSrc(cat));
  const isCombosOnly = mode === "combos-only";
  const title = isCombosOnly ? "Chicken Combos" : cat.name;
  const boxId = isCombosOnly ? `${slugify(cat.name)}-combos` : slugify(cat.name);
  const countLabel = isCombosOnly
    ? `${visibleCombos.length} combo${visibleCombos.length === 1 ? "" : "s"}`
    : `${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`;

  const comboSection =
    visibleCombos.length > 0 && !isCombosOnly
      ? `
        <div class="combo-block">
          <p class="combo-label">Combos</p>
          ${visibleCombos.map((combo) => renderComboRow(combo, withItemImages)).join("")}
        </div>`
      : visibleCombos.length > 0
        ? visibleCombos.map((combo) => renderComboRow(combo, withItemImages)).join("")
        : "";

  const weight = estimateCategoryWeight(visibleItems, visibleCombos, withItemImages);

  return {
    weight,
    categoryName: isCombosOnly ? `${cat.name} Combos` : cat.name,
    html: `
      <section
        class="cat-box${isCombosOnly ? " cat-box--combos" : ""}"
        id="${escapeHtml(boxId)}"
        style="--cat-bg:${theme.bg};--cat-accent:${theme.accent};--cat-border:${theme.border};--cat-banner:${theme.banner}"
      >
        <header class="cat-box-head${isCombosOnly ? " cat-box-head--compact" : ""}">
          <img class="cat-box-img" src="${imgSrc}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" />
          <div class="cat-box-title">
            <h2>${escapeHtml(title)}</h2>
            <span class="cat-count">${countLabel}</span>
          </div>
        </header>
        <div class="cat-box-body">
          ${visibleItems.map((item) => renderItemRow(item, withItemImages)).join("")}
          ${comboSection}
        </div>
      </section>`,
  };
}

function estimateCategoryWeight(
  items: MenuItem[],
  combos: MenuCombo[],
  withItemImages: boolean,
): number {
  const banner = 8;
  const rowBase = withItemImages ? 3.4 : 2.1;
  const variationExtra = withItemImages ? 0.9 : 0.65;

  let weight = banner;
  for (const item of items) {
    weight += rowBase + Math.max(0, item.variations.length - 1) * variationExtra;
  }
  for (const combo of combos) {
    weight += rowBase + 1.4;
  }
  return Math.ceil(weight);
}

type PackingUnit = { weight: number; blocks: CategoryBlock[] };

function buildPackingUnits(blocks: CategoryBlock[]): PackingUnit[] {
  const followerNames = new Set(Object.keys(MENU_BOARD_PAGE2_AFTER));
  const units: PackingUnit[] = [];

  for (const block of blocks) {
    if (followerNames.has(block.categoryName)) continue;

    const followers = Object.entries(MENU_BOARD_PAGE2_AFTER)
      .filter(([, anchor]) => anchor === block.categoryName)
      .map(([name]) => blocks.find((b) => b.categoryName === name))
      .filter((b): b is CategoryBlock => b !== undefined);

    const group = [block, ...followers];
    units.push({
      weight: group.reduce((sum, b) => sum + b.weight, 0),
      blocks: group,
    });
  }

  return units;
}

/** Pack boxes into columns — each unit goes where column heights stay most even. */
function packIntoColumns(blocks: CategoryBlock[], columnCount = 3): CategoryBlock[][] {
  const units = buildPackingUnits(blocks).sort((a, b) => b.weight - a.weight);
  const cols: CategoryBlock[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array<number>(columnCount).fill(0);

  for (const unit of units) {
    let bestCol = 0;
    let bestSpread = Infinity;

    for (let i = 0; i < columnCount; i++) {
      const nextHeights = heights.map((h, idx) => (idx === i ? h + unit.weight : h));
      const spread = Math.max(...nextHeights) - Math.min(...nextHeights);
      if (
        spread < bestSpread ||
        (spread === bestSpread && nextHeights[i]! < nextHeights[bestCol]!)
      ) {
        bestSpread = spread;
        bestCol = i;
      }
    }

    cols[bestCol]!.push(...unit.blocks);
    heights[bestCol]! += unit.weight;
  }

  return cols;
}

function renderCatGrid(blocksOnPage: CategoryBlock[]): string {
  const columns = packIntoColumns(blocksOnPage, 3);
  return `<main class="cat-grid">${columns
    .map((col) => `<div class="cat-col">${col.map((b) => b.html).join("")}</div>`)
    .join("")}</main>`;
}

function splitPages(blocks: CategoryBlock[]): [CategoryBlock[], CategoryBlock[]] {
  const forcePage2 = new Set([
    ...Object.keys(MENU_BOARD_PAGE2_AFTER),
    ...Object.values(MENU_BOARD_PAGE2_AFTER),
  ]);
  const page2Fixed = blocks.filter((b) => forcePage2.has(b.categoryName));
  const autoBlocks = blocks.filter((b) => !forcePage2.has(b.categoryName));

  const units = buildPackingUnits(autoBlocks).sort((a, b) => b.weight - a.weight);
  const page1: CategoryBlock[] = [];
  const page2: CategoryBlock[] = [];
  const pages = [page1, page2];
  const heights = [0, 0];

  for (const unit of units) {
    let bestPage = 0;
    let bestSpread = Infinity;

    for (let i = 0; i < 2; i++) {
      const h0 = i === 0 ? heights[0]! + unit.weight : heights[0]!;
      const h1 = i === 1 ? heights[1]! + unit.weight : heights[1]!;
      const spread = Math.abs(h0 - h1);
      if (spread < bestSpread) {
        bestSpread = spread;
        bestPage = i;
      }
    }

    pages[bestPage]!.push(...unit.blocks);
    heights[bestPage]! += unit.weight;
  }

  page2.push(...page2Fixed);

  return [page1, page2];
}

export function buildMenuBoardHtml(payload: MenuPayload): string {
  const sellableCategories = payload.categories.filter(
    (c) => !c.notForSale && !MENU_BOARD_EXCLUDED_CATEGORIES.has(c.name),
  );
  const categoryNames = new Set(sellableCategories.map((c) => c.name));

  const itemsByCategory = new Map<string, MenuItem[]>();
  for (const cat of sellableCategories) {
    itemsByCategory.set(cat.name, []);
  }

  for (const item of payload.items) {
    if (!categoryNames.has(item.category)) continue;
    if (item.notForSale || item.available === false) continue;
    itemsByCategory.get(item.category)!.push(item);
  }

  const signatureChickenCombos = payload.combos.filter(
    (c) => c.available !== false && isSignatureChickenCombo(c),
  );

  const buildBlocks = (withItemImages: boolean): CategoryBlock[] =>
    sellableCategories
      .flatMap((cat, index) => {
        const items = itemsByCategory.get(cat.name) ?? [];
        const combos =
          cat.name === SIGNATURE_CHICKEN_CATEGORY ? signatureChickenCombos : [];

        if (
          cat.name === SIGNATURE_CHICKEN_CATEGORY &&
          items.length > 0 &&
          combos.length > 0
        ) {
          return [
            buildCategoryBox(cat, index, items, combos, withItemImages, "items-only"),
            buildCategoryBox(cat, index, items, combos, withItemImages, "combos-only"),
          ];
        }

        const block = buildCategoryBox(cat, index, items, combos, withItemImages);
        return block ? [block] : [];
      })
      .filter((b): b is CategoryBlock => b !== null);

  const photoBlocks = buildBlocks(true);
  const textBlocks = buildBlocks(false);
  const [photoPage1, photoPage2] = splitPages(photoBlocks);
  const [textPage1, textPage2] = splitPages(textBlocks);

  const renderSheet = (blocksOnPage: CategoryBlock[], page: 1 | 2, photoFooter: boolean) => `
    <div class="sheet sheet--${page}">
      ${
        page === 1
          ? `
      <header class="cover">
        <img class="cover-logo" src="${escapeHtml(SITE.logoPath)}" alt="${escapeHtml(SITE.name)}" />
        <div class="cover-text">
          <h1 class="cover-title">${escapeHtml(SITE.name)} Menu</h1>
          <p class="cover-sub">Crunchy · Spicy · Irresistible · Prices in ₹</p>
        </div>
      </header>`
          : ""
      }
      ${renderCatGrid(blocksOnPage)}
      ${
        page === 2
          ? `
      <footer class="sheet-foot">
        <div class="foot-brand">${escapeHtml(SITE.name)}</div>
        <div class="foot-legend">
          <span>${dietIcon(true)} Vegetarian</span>
          <span>${dietIcon(false)} Non-Vegetarian</span>
          <span><em class="foot-star">★</em> Chef's pick</span>
        </div>
        <p class="foot-fine">Prices subject to change${photoFooter ? " · Photos for reference" : ""}</p>
      </footer>`
          : ""
      }
    </div>`;

  const renderBook = (
    page1Blocks: CategoryBlock[],
    page2Blocks: CategoryBlock[],
    variant: "with-images" | "no-images",
    photoFooter: boolean,
  ) => `
    <div class="menu-panel" data-variant="${variant}" role="tabpanel">
      <div class="book">
        ${renderSheet(page1Blocks, 1, photoFooter)}
        ${renderSheet(page2Blocks, 2, photoFooter)}
      </div>
    </div>`;

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(SITE.name)} — Menu</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=Outfit:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --red: #dc2626;
        --red-deep: #991b1b;
        --cream: #f8fafc;
        --cream-2: #ffffff;
        --ink: #0f172a;
        --muted: #64748b;
        --line: #e2e8f0;
        --veg: #059669;
        --nonveg: #dc2626;
        --gold: #d97706;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;
        background: linear-gradient(180deg, #e2e8f0 0%, #f1f5f9 45%, #f8fafc 100%);
        color: var(--ink);
        -webkit-font-smoothing: antialiased;
      }

      .toolbar {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.65rem 1.25rem;
        background: rgba(12, 10, 9, 0.92);
        color: #fafaf9;
      }

      .toolbar strong { font-size: 0.88rem; display: block; }
      .toolbar span { font-size: 0.72rem; color: #a8a29e; display: block; margin-top: 0.1rem; }
      .toolbar-actions { display: flex; gap: 0.45rem; align-items: center; flex-shrink: 0; }

      .menu-tabs {
        display: flex;
        gap: 0.35rem;
        margin-top: 0.55rem;
      }

      .menu-tab {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #d6d3d1;
        font: inherit;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.35rem 0.75rem;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }

      .menu-tab:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fafaf9;
      }

      .menu-tab.active {
        background: #fff;
        color: #0f172a;
        border-color: #fff;
      }

      .menu-panel { display: none; }
      .menu-panel.active { display: block; }

      .toolbar button {
        border: none;
        border-radius: 0.45rem;
        background: var(--red);
        color: #fff;
        font: inherit;
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0.45rem 0.9rem;
        cursor: pointer;
      }

      .toolbar button.ghost { background: rgba(255,255,255,0.1); }

      .book {
        max-width: 210mm;
        margin: 0 auto;
        padding: 1rem 0.6rem 2rem;
      }

      .sheet {
        background: var(--cream-2);
        min-height: 297mm;
        padding: 3.5mm;
        margin-bottom: 1rem;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
        display: flex;
        flex-direction: column;
      }

      .cover {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3mm;
        padding: 1.2mm 1.5mm 2mm;
        margin-bottom: 2mm;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(180deg, #ffffff, #f8fafc);
      }

      .cover-logo { width: 16mm; height: auto; }
      .cover-title {
        font-family: "Cormorant Garamond", Georgia, serif;
        font-size: 14pt;
        font-weight: 700;
        color: var(--red-deep);
      }
      .cover-sub {
        font-size: 6pt;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
      }

      /* 3 columns — bin-packed so boxes fill each column with minimal gaps */
      .cat-grid {
        flex: 1;
        display: flex;
        align-items: flex-start;
        gap: 1.6mm;
      }

      .cat-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1.6mm;
      }

      .cat-box {
        background: var(--cat-bg);
        border: 1px solid var(--cat-border);
        border-radius: 2mm;
        overflow: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .cat-box-head {
        position: relative;
        aspect-ratio: 5 / 3;
        min-height: 22mm;
        flex-shrink: 0;
        overflow: hidden;
        background: var(--cat-banner);
      }

      .cat-box-head--compact {
        aspect-ratio: 16 / 7;
        min-height: 14mm;
      }

      .cat-box-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        display: block;
      }

      .cat-box-title {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-end;
        padding: 1.2mm 1.4mm;
        background: linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.18) 55%, transparent 100%);
      }

      .cat-box-title h2 {
        font-family: "Cormorant Garamond", Georgia, serif;
        font-size: 9pt;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #fff;
        text-shadow: 0 1px 3px rgba(0,0,0,0.45);
        line-height: 1.1;
      }

      .cat-count {
        font-size: 6pt;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.85);
        margin-top: 0.2mm;
      }

      .cat-box-body {
        padding: 0.8mm 1.2mm 1mm;
        display: flex;
        flex-direction: column;
      }

      .item-row {
        padding: 0.5mm 0;
        border-bottom: 1px dashed #e2e8f0;
      }

      .item-row:last-child { border-bottom: none; }

      .item-row--pick {
        background: #f8fafc;
        margin: 0 -1.2mm;
        padding: 0.5mm 1.2mm;
        border-radius: 1mm;
        border-bottom: none;
      }

      .item-row-inner {
        display: flex;
        align-items: flex-start;
        gap: 1mm;
      }

      .item-row-inner--compact {
        gap: 0;
      }

      .item-thumb {
        width: 8.5mm;
        height: 8.5mm;
        border-radius: 1.2mm;
        object-fit: cover;
        object-position: center;
        flex-shrink: 0;
        border: 1px solid #e2e8f0;
        background: #f1f5f9;
      }

      .item-detail {
        flex: 1;
        min-width: 0;
      }

      .item-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1.2mm;
      }

      .item-title {
        display: flex;
        align-items: center;
        gap: 0.9mm;
        flex: 1;
        min-width: 0;
      }

      .pick { color: var(--gold); font-size: 9pt; flex-shrink: 0; line-height: 1; }

      .item-name {
        font-size: 9.5pt;
        font-weight: 700;
        color: var(--ink);
        line-height: 1.18;
      }

      .price-stack {
        flex-shrink: 0;
        text-align: right;
        min-width: 16mm;
      }

      .price-line {
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 1mm;
        font-size: 9pt;
        line-height: 1.32;
      }

      .price-size {
        color: var(--muted);
        font-weight: 500;
        white-space: nowrap;
        font-size: 8pt;
      }

      .price-amt {
        font-weight: 700;
        font-size: 9.5pt;
        color: var(--cat-accent);
        white-space: nowrap;
      }

      .price-amt.muted { color: var(--muted); font-weight: 500; font-size: 9pt; }

      .combo-amt .price-amt {
        font-size: 9.5pt;
      }

      .combo-block {
        margin-top: 0.6mm;
        padding-top: 0.8mm;
        border-top: 1px solid #e2e8f0;
      }

      .combo-label {
        font-size: 6.2pt;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--cat-accent);
        margin-bottom: 0.6mm;
      }

      .item-row--combo .combo-desc {
        font-size: 6pt;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 0.3mm;
      }

      .diet {
        width: 9px;
        height: 9px;
        border: 1.5px solid;
        flex-shrink: 0;
        position: relative;
        margin-left: 0.2mm;
      }

      .diet-veg { border-color: var(--veg); }
      .diet-veg::after {
        content: "";
        position: absolute;
        inset: 1px;
        background: var(--veg);
        border-radius: 50%;
      }

      .diet-nonveg { border-color: var(--nonveg); }
      .diet-nonveg::after {
        content: "";
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -28%);
        border-left: 2.5px solid transparent;
        border-right: 2.5px solid transparent;
        border-bottom: 4px solid var(--nonveg);
      }

      .sheet-foot {
        margin-top: 2mm;
        padding-top: 1.5mm;
        border-top: 1px solid var(--line);
        text-align: center;
      }

      .foot-brand {
        font-family: "Cormorant Garamond", Georgia, serif;
        font-size: 9pt;
        font-weight: 700;
        color: var(--red-deep);
      }

      .foot-legend {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 2mm 4mm;
        margin-top: 1.5mm;
        font-size: 6pt;
        color: var(--muted);
      }

      .foot-legend span { display: inline-flex; align-items: center; gap: 1mm; }
      .foot-star { color: var(--gold); font-style: normal; }
      .foot-fine { margin-top: 1.5mm; font-size: 5.5pt; color: #94a3b8; }
      .muted { color: var(--muted); }

      @page { size: A4 portrait; margin: 0; }

      @media print {
        body { background: white; }
        .toolbar { display: none !important; }
        .menu-tabs { display: none !important; }
        .menu-panel:not(.active) { display: none !important; }
        .book { padding: 0; max-width: none; }
        .sheet {
          min-height: 0;
          height: auto;
          margin: 0;
          box-shadow: none;
          page-break-after: always;
        }
        .sheet:last-child { page-break-after: auto; }
        .cat-box { box-shadow: none; }
        .cat-grid { display: flex; gap: 1.6mm; }
        .cat-col { gap: 1.6mm; }
      }

      @media screen and (max-width: 900px) {
        .cat-grid { gap: 2mm; }
        .cat-col { gap: 2mm; }
      }

      @media screen and (max-width: 640px) {
        .cat-grid { flex-direction: column; }
        .cover { flex-direction: column; text-align: center; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div>
        <strong>${escapeHtml(SITE.name)} — Customer Menu</strong>
        <span>2-page layout · Updated ${dateLabel}</span>
        <div class="menu-tabs" role="tablist" aria-label="Menu layout">
          <button type="button" class="menu-tab active" role="tab" aria-selected="true" data-tab="with-images">With item photos</button>
          <button type="button" class="menu-tab" role="tab" aria-selected="false" data-tab="no-images">No item photos</button>
        </div>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="ghost" onclick="window.scrollTo({top:0,behavior:'smooth'})">Top</button>
        <button type="button" onclick="window.print()">Print menu</button>
      </div>
    </div>

    ${renderBook(photoPage1, photoPage2, "with-images", true)}
    ${renderBook(textPage1, textPage2, "no-images", false)}

    <script>
      (function () {
        var tabs = document.querySelectorAll(".menu-tab");
        var panels = document.querySelectorAll(".menu-panel");
        var storageKey = "khaanz-menu-board-tab";

        function activate(id) {
          tabs.forEach(function (tab) {
            var on = tab.getAttribute("data-tab") === id;
            tab.classList.toggle("active", on);
            tab.setAttribute("aria-selected", on ? "true" : "false");
          });
          panels.forEach(function (panel) {
            panel.classList.toggle("active", panel.getAttribute("data-variant") === id);
          });
          try { sessionStorage.setItem(storageKey, id); } catch (_) {}
        }

        tabs.forEach(function (tab) {
          tab.addEventListener("click", function () {
            activate(tab.getAttribute("data-tab"));
          });
        });

        var saved = null;
        try { saved = sessionStorage.getItem(storageKey); } catch (_) {}
        activate(saved === "no-images" ? "no-images" : "with-images");
      })();
    </script>
  </body>
</html>`;
}
